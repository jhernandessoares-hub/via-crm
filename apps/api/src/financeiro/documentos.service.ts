import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FinDocumentType, FinEntryType, Prisma } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FinCadastrosService } from './cadastros.service';
import { FinLancamentosService } from './lancamentos.service';
import {
  addMonthsClamped,
  assertPositiveMoney,
  finSerialize,
  parseDateOnly,
  roundMoney,
} from './fin-shared.util';

export const FIN_DOC_ALLOWED_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/xml',
  'text/xml',
];

const CLOUDINARY_FOLDER = 'via-crm/financeiro/documentos';

@Injectable()
export class FinDocumentosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cadastros: FinCadastrosService,
    private readonly lancamentos: FinLancamentosService,
  ) {}

  private ensureCloudinaryConfigured() {
    if (
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET
    ) {
      throw new BadRequestException('Cloudinary não configurado (CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET)');
    }
  }

  async upload(
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
    meta: {
      tipo: FinDocumentType;
      numero?: string;
      descricao?: string;
      valor?: number | string;
      dataEmissao?: string;
      contactId?: string;
      companyId?: string;
      contractId?: string;
    },
    adminId?: string,
  ) {
    if (!file?.buffer) throw new BadRequestException('Envie um arquivo no campo "file"');
    if (!FIN_DOC_ALLOWED_MIMES.includes(String(file.mimetype).toLowerCase())) {
      throw new BadRequestException(`Tipo de arquivo não suportado: ${file.mimetype} (use PDF, JPG, PNG ou XML)`);
    }
    this.ensureCloudinaryConfigured();

    const isImage = file.mimetype.startsWith('image/');
    const result: any = await new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: CLOUDINARY_FOLDER,
            resource_type: isImage ? 'image' : 'raw',
            type: 'authenticated', // 🔒 privado — só acessível via URL assinada pelo backend
            use_filename: false,
            unique_filename: true,
          },
          (err, res) => {
            if (err) return reject(err);
            resolve(res);
          },
        )
        .end(file.buffer);
    });

    const valor =
      meta.valor !== undefined && meta.valor !== null && String(meta.valor) !== ''
        ? assertPositiveMoney(Number(meta.valor), 'valor')
        : null;

    const doc = await this.prisma.finDocument.create({
      data: {
        tipo: meta.tipo,
        numero: meta.numero?.trim() || null,
        descricao: meta.descricao?.trim() || null,
        valor,
        dataEmissao: meta.dataEmissao ? parseDateOnly(meta.dataEmissao, 'dataEmissao') : null,
        contactId: meta.contactId || null,
        companyId: meta.companyId || null,
        contractId: meta.contractId || null,
        filename: file.originalname,
        mimeType: file.mimetype,
        cloudinaryPublicId: result.public_id,
        resourceType: isImage ? 'image' : 'raw',
        createdBy: adminId || null,
      },
    });

    this.audit.log({
      platformAdminId: adminId,
      action: 'PLATFORM_FIN_UPLOAD_DOCUMENT',
      resourceType: 'FinDocument',
      resourceId: doc.id,
      metadata: { tipo: meta.tipo, filename: file.originalname, tamanho: file.size },
    });

    return finSerialize(doc);
  }

  async list(query: {
    tipo?: FinDocumentType;
    vinculado?: string;
    busca?: string;
    de?: string;
    ate?: string;
    companyId?: string;
    contractId?: string;
  }) {
    const where: Prisma.FinDocumentWhereInput = {};
    if (query.tipo) where.tipo = query.tipo;
    if (query.companyId) where.companyId = query.companyId;
    if (query.contractId) where.contractId = query.contractId;
    if (query.vinculado === 'sim') where.entries = { some: {} };
    if (query.vinculado === 'nao') where.entries = { none: {} };
    if (query.de || query.ate) {
      where.createdAt = {
        ...(query.de ? { gte: parseDateOnly(query.de, 'de') } : {}),
        ...(query.ate ? { lte: new Date(`${query.ate}T23:59:59.999Z`) } : {}),
      };
    }
    if (query.busca?.trim()) {
      const b = query.busca.trim();
      where.OR = [
        { numero: { contains: b, mode: 'insensitive' } },
        { descricao: { contains: b, mode: 'insensitive' } },
        { filename: { contains: b, mode: 'insensitive' } },
        { contact: { nome: { contains: b, mode: 'insensitive' } } },
      ];
    }

    const docs = await this.prisma.finDocument.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: {
        contact: { select: { id: true, nome: true } },
        company: { select: { id: true, nome: true } },
        contract: { select: { id: true, descricao: true } },
        entries: { select: { id: true, tipo: true, descricao: true, status: true, valor: true, vencimento: true } },
      },
    });
    return finSerialize(docs);
  }

  /**
   * URL assinada temporária no Cloudinary (Admin API "/download"). Esse endpoint sempre força
   * Content-Disposition: attachment com um nome derivado do public_id (ignora filename/attachment
   * customizados) — por isso não serve para preview nem para baixar com o nome original; usar
   * apenas como fonte para o proxy em fetchFile().
   */
  private buildSourceUrl(doc: { resourceType: string; cloudinaryPublicId: string; filename: string }): string {
    this.ensureCloudinaryConfigured();
    const expiresAt = Math.floor(Date.now() / 1000) + 120;
    if (doc.resourceType === 'raw') {
      // Upload usa use_filename:false/unique_filename:true — o public_id gerado pelo Cloudinary
      // NÃO carrega a extensão (ao contrário de outros fluxos do projeto). A extensão vai no
      // parâmetro "format" do private_download_url, nunca concatenada ao public_id.
      const ext = doc.filename.includes('.') ? doc.filename.split('.').pop()!.toLowerCase() : '';
      return (cloudinary.utils as any).private_download_url(doc.cloudinaryPublicId, ext, {
        resource_type: 'raw',
        type: 'authenticated',
        expires_at: expiresAt,
        attachment: false,
      });
    }
    const ext = doc.filename.includes('.') ? doc.filename.split('.').pop()!.toLowerCase() : 'jpg';
    return (cloudinary.utils as any).private_download_url(doc.cloudinaryPublicId, ext, {
      resource_type: 'image',
      type: 'authenticated',
      expires_at: expiresAt,
      attachment: false,
    });
  }

  /** Mantido por compatibilidade — prefira fetchFile() para exibir/baixar com nome e tipo corretos. */
  async download(id: string) {
    const doc = await this.prisma.finDocument.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Documento não encontrado');
    const url = this.buildSourceUrl(doc);
    return { url, filename: doc.filename, mimeType: doc.mimeType };
  }

  /** Busca o arquivo real do Cloudinary no servidor e devolve os bytes — evita depender do
   * Content-Type/Content-Disposition genéricos que o Cloudinary retorna nesse endpoint. */
  async fetchFile(id: string): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
    const doc = await this.prisma.finDocument.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Documento não encontrado');
    const sourceUrl = this.buildSourceUrl(doc);
    const res = await fetch(sourceUrl);
    if (!res.ok) throw new BadRequestException('Não foi possível obter o arquivo do Cloudinary');
    const buffer = Buffer.from(await res.arrayBuffer());
    return { buffer, filename: doc.filename, mimeType: doc.mimeType };
  }

  async update(
    id: string,
    data: {
      tipo?: FinDocumentType;
      numero?: string | null;
      descricao?: string | null;
      valor?: number | null;
      dataEmissao?: string | null;
      contactId?: string | null;
      companyId?: string | null;
      contractId?: string | null;
    },
  ) {
    const doc = await this.prisma.finDocument.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Documento não encontrado');
    const updated = await this.prisma.finDocument.update({
      where: { id },
      data: {
        ...(data.tipo !== undefined ? { tipo: data.tipo } : {}),
        ...(data.numero !== undefined ? { numero: data.numero?.trim() || null } : {}),
        ...(data.descricao !== undefined ? { descricao: data.descricao?.trim() || null } : {}),
        ...(data.valor !== undefined
          ? { valor: data.valor === null ? null : assertPositiveMoney(data.valor, 'valor') }
          : {}),
        ...(data.dataEmissao !== undefined
          ? { dataEmissao: data.dataEmissao ? parseDateOnly(data.dataEmissao, 'dataEmissao') : null }
          : {}),
        ...(data.contactId !== undefined ? { contactId: data.contactId || null } : {}),
        ...(data.companyId !== undefined ? { companyId: data.companyId || null } : {}),
        ...(data.contractId !== undefined ? { contractId: data.contractId || null } : {}),
      },
    });
    return finSerialize(updated);
  }

  async delete(id: string, adminId?: string) {
    const doc = await this.prisma.finDocument.findUnique({
      where: { id },
      include: { _count: { select: { entries: true } } },
    });
    if (!doc) throw new NotFoundException('Documento não encontrado');
    if (doc._count.entries > 0) {
      throw new BadRequestException('Documento vinculado a lançamentos — desvincule antes de excluir');
    }

    this.ensureCloudinaryConfigured();
    await cloudinary.uploader
      .destroy(doc.cloudinaryPublicId, {
        resource_type: doc.resourceType as 'image' | 'raw',
        type: 'authenticated',
        invalidate: true,
      })
      .catch(() => undefined); // asset órfão no Cloudinary é melhor que delete bloqueado

    await this.prisma.finDocument.delete({ where: { id } });

    this.audit.log({
      platformAdminId: adminId,
      action: 'PLATFORM_FIN_DELETE_DOCUMENT',
      resourceType: 'FinDocument',
      resourceId: id,
      metadata: { tipo: doc.tipo, filename: doc.filename },
    });

    return { deleted: true };
  }

  /**
   * Cria o compromisso financeiro a partir do documento fiscal:
   * 1 título (aberto ou já pago) ou N parcelas mensais — todos vinculados ao doc.
   */
  async gerarLancamentos(
    docId: string,
    data: {
      tipo: FinEntryType;
      categoriaId: string;
      descricao?: string;
      competencia?: string;
      vencimento: string;
      valor?: number;
      parcelas?: number;
      jaPago?: { bankAccountId: string; dataPagamento: string };
    },
    adminId?: string,
  ) {
    const doc = await this.prisma.finDocument.findUnique({
      where: { id: docId },
      include: { contact: { select: { id: true } } },
    });
    if (!doc) throw new NotFoundException('Documento não encontrado');

    const valorTotal = assertPositiveMoney(data.valor ?? doc.valor?.toNumber(), 'valor');
    const parcelas = Math.min(120, Math.max(1, Math.floor(Number(data.parcelas) || 1)));
    if (data.jaPago && parcelas > 1) {
      throw new BadRequestException('"Já pago" só vale para título único — parcelas nascem em aberto');
    }

    const tipoCategoria = data.tipo === 'RECEBER' ? 'RECEITA' : 'DESPESA';
    await this.cadastros.assertCategoriaAnalitica(data.categoriaId, tipoCategoria);

    const vencimento = parseDateOnly(data.vencimento, 'vencimento');
    const competencia = data.competencia
      ? parseDateOnly(`${data.competencia.slice(0, 7)}-01`, 'competencia')
      : doc.dataEmissao
        ? new Date(Date.UTC(doc.dataEmissao.getUTCFullYear(), doc.dataEmissao.getUTCMonth(), 1))
        : new Date(Date.UTC(vencimento.getUTCFullYear(), vencimento.getUTCMonth(), 1));

    const descricaoBase =
      data.descricao?.trim() ||
      doc.descricao ||
      `${this.tipoDocLabel(doc.tipo)}${doc.numero ? ` ${doc.numero}` : ''}`;

    if (data.jaPago) {
      const conta = await this.prisma.finBankAccount.findUnique({ where: { id: data.jaPago.bankAccountId } });
      if (!conta || !conta.ativo) throw new BadRequestException('Conta bancária inválida ou inativa');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const groupId = parcelas > 1 ? randomUUID() : null;
      const centavos = Math.round(valorTotal * 100);
      const baseParcela = Math.floor(centavos / parcelas);
      const entries: { id: string }[] = [];
      for (let i = 0; i < parcelas; i++) {
        const cents = i === parcelas - 1 ? centavos - baseParcela * (parcelas - 1) : baseParcela;
        const entry = await tx.finEntry.create({
          data: {
            tipo: data.tipo,
            descricao: parcelas > 1 ? `${descricaoBase} (${i + 1}/${parcelas})` : descricaoBase,
            categoriaId: data.categoriaId,
            contactId: doc.contactId,
            companyId: doc.companyId,
            contractId: doc.contractId,
            competencia: addMonthsClamped(competencia, i),
            vencimento: addMonthsClamped(vencimento, i),
            valor: cents / 100,
            parcelaNum: parcelas > 1 ? i + 1 : null,
            parcelaTotal: parcelas > 1 ? parcelas : null,
            parcelaGroupId: groupId,
            createdBy: adminId || null,
            documents: { connect: { id: docId } },
          },
        });
        entries.push(entry);
      }

      if (data.jaPago) {
        await tx.finPayment.create({
          data: {
            entryId: entries[0].id,
            bankAccountId: data.jaPago.bankAccountId,
            dataPagamento: parseDateOnly(data.jaPago.dataPagamento, 'dataPagamento'),
            valor: valorTotal,
            createdBy: adminId || null,
          },
        });
        await this.lancamentos.recomputeStatus(tx, entries[0].id);
      }

      return entries;
    });

    this.audit.log({
      platformAdminId: adminId,
      action: 'PLATFORM_FIN_DOC_GENERATE_ENTRIES',
      resourceType: 'FinDocument',
      resourceId: docId,
      metadata: { tipo: data.tipo, valor: valorTotal, parcelas, jaPago: Boolean(data.jaPago) },
    });

    return finSerialize(created);
  }

  // ---------- Vínculo documento ↔ título ----------

  async vincular(entryId: string, docId: string) {
    const [entry, doc] = await Promise.all([
      this.prisma.finEntry.findUnique({ where: { id: entryId } }),
      this.prisma.finDocument.findUnique({ where: { id: docId } }),
    ]);
    if (!entry) throw new NotFoundException('Lançamento não encontrado');
    if (!doc) throw new NotFoundException('Documento não encontrado');
    await this.prisma.finEntry.update({
      where: { id: entryId },
      data: { documents: { connect: { id: docId } } },
    });
    return { linked: true };
  }

  async desvincular(entryId: string, docId: string) {
    const entry = await this.prisma.finEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw new NotFoundException('Lançamento não encontrado');
    await this.prisma.finEntry.update({
      where: { id: entryId },
      data: { documents: { disconnect: { id: docId } } },
    });
    return { linked: false };
  }

  private tipoDocLabel(tipo: FinDocumentType): string {
    const map: Record<FinDocumentType, string> = {
      CONTRATO: 'Contrato',
      NF_EMITIDA: 'NF emitida',
      NF_RECEBIDA: 'NF recebida',
      GUIA_IMPOSTO: 'Guia de imposto',
      COMPROVANTE: 'Comprovante',
      BOLETO: 'Boleto',
      OUTRO: 'Documento',
    };
    return map[tipo] || 'Documento';
  }
}
