import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Logger } from '../logger';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FamiliasService } from './familias.service';
import { getNextDemandaNumber } from './pre-ocupacao-numbering.helper';
import { uploadPreOcupacaoFile } from './pre-ocupacao-upload.util';

const TIPO_LABEL: Record<string, string> = {
  DUVIDA: 'Dúvida',
  DENUNCIA: 'Denúncia',
  RECLAMACAO: 'Reclamação',
  SUGESTAO: 'Sugestão',
  ACOLHIMENTO: 'Acolhimento',
  SOLICITACAO: 'Solicitação',
  ELOGIO: 'Elogio',
  OUTRO: 'Outro',
};
const TIPOS_VALIDOS = Object.keys(TIPO_LABEL);
const LOCAIS_VALIDOS = ['PLANTAO', 'ONLINE', 'OUTRO'];

function validarTipo(tipo: unknown): string {
  if (typeof tipo !== 'string' || !TIPOS_VALIDOS.includes(tipo)) {
    throw new BadRequestException(`tipo é obrigatório e deve ser um de: ${TIPOS_VALIDOS.join(', ')}.`);
  }
  return tipo;
}

function validarLocal(local: unknown): string | null {
  if (local == null || local === '') return null;
  if (typeof local !== 'string' || !LOCAIS_VALIDOS.includes(local)) {
    throw new BadRequestException(`local deve ser um de: ${LOCAIS_VALIDOS.join(', ')}.`);
  }
  return local;
}

@Injectable()
export class DemandasService {
  private readonly logger = new Logger('PreOcupacaoDemandasService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly familiasService: FamiliasService,
  ) {}

  async criar(
    tenantId: string,
    body: {
      familiaId?: string;
      tipo: string;
      tituloPersonalizado?: string;
      local?: string;
      localDescricao?: string;
      observacoes?: string;
      origem?: string;
    },
    criadoPor?: string,
  ) {
    const tipo = validarTipo(body.tipo);
    if (tipo === 'OUTRO' && !body.tituloPersonalizado?.trim()) {
      throw new BadRequestException('tituloPersonalizado é obrigatório quando tipo = OUTRO.');
    }
    const local = validarLocal(body.local);
    if (local === 'OUTRO' && !body.localDescricao?.trim()) {
      throw new BadRequestException('localDescricao é obrigatório quando local = OUTRO.');
    }

    if (body.familiaId) {
      await this.familiasService.assertFamiliaAccess(tenantId, body.familiaId);
    }

    return this.prisma.$transaction(async (tx) => {
      const numero = await getNextDemandaNumber(tx, tenantId);
      return tx.preOcupacaoOcorrencia.create({
        data: {
          tenantId,
          familiaId: body.familiaId || null,
          numero,
          titulo: tipo === 'OUTRO' ? body.tituloPersonalizado!.trim() : TIPO_LABEL[tipo],
          tipo: tipo as any,
          local: local as any,
          localDescricao: local === 'OUTRO' ? body.localDescricao!.trim() : null,
          observacoes: body.observacoes?.trim() || null,
          dataAtendimento: new Date(),
          origem: (body.origem as any) || 'MANUAL',
          criadoPor: criadoPor || null,
        },
      });
    });
  }

  /**
   * Adiciona um andamento (mensagem tipo chat) a uma demanda ABERTA — texto,
   * arquivo, ou os dois juntos. O relato original (observacoes/tipo/local,
   * definidos na criação) nunca é editado — mesmo comportamento de um sistema
   * de chamado/ticket: só se acrescenta histórico, nunca se reescreve o que
   * já foi registrado.
   */
  async adicionarAndamento(
    tenantId: string,
    id: string,
    texto: string | undefined,
    criadoPor: string | undefined,
    file?: any,
    nomeAnexo?: string,
  ) {
    if (!texto?.trim() && !file) throw new BadRequestException('Mensagem ou arquivo é obrigatório.');
    const ocorrencia = await this.getOcorrenciaOrThrow(tenantId, id);
    if (ocorrencia.status !== 'ABERTA') {
      throw new BadRequestException('Só é possível adicionar andamento em demandas em aberto.');
    }

    const andamento = await this.prisma.preOcupacaoOcorrenciaAndamento.create({
      data: { ocorrenciaId: ocorrencia.id, texto: texto?.trim() || '', criadoPor: criadoPor || null },
    });

    if (file) {
      const { url, publicId } = await uploadPreOcupacaoFile(file, tenantId, `ocorrencias/${ocorrencia.id}`);
      await this.prisma.preOcupacaoOcorrenciaAnexo.create({
        data: {
          ocorrenciaId: ocorrencia.id,
          andamentoId: andamento.id,
          url,
          publicId,
          nome: nomeAnexo?.trim() || file.originalname || 'arquivo',
          mimeType: file.mimetype || null,
          criadoPor: criadoPor || null,
        },
      });
    }

    return this.prisma.preOcupacaoOcorrenciaAndamento.findUnique({
      where: { id: andamento.id },
      include: { anexos: true },
    });
  }

  /**
   * `q` casa nome do lead, CPF do lead ou número da família vinculada.
   * TODO: busca por unidade (Unit.leadId) — depende de integração com developments/.
   */
  async listar(
    tenantId: string,
    filtros: { q?: string; status?: string; tipo?: string; semFamilia?: boolean; dataDe?: string; dataAte?: string },
  ) {
    const where: any = { tenantId };
    if (filtros.status) where.status = filtros.status;
    if (filtros.tipo) where.tipo = filtros.tipo;
    if (filtros.semFamilia) where.familiaId = null;
    if (filtros.dataDe || filtros.dataAte) {
      where.abertaEm = {};
      if (filtros.dataDe) where.abertaEm.gte = new Date(`${filtros.dataDe}T00:00:00`);
      if (filtros.dataAte) where.abertaEm.lte = new Date(`${filtros.dataAte}T23:59:59.999`);
    }

    let ocorrencias = await this.prisma.preOcupacaoOcorrencia.findMany({
      where,
      include: {
        familia: { include: { lead: { select: { nome: true, nomeCorreto: true, cpf: true, numero: true, reentradaCount: true } } } },
        anexos: true,
      },
      orderBy: { abertaEm: 'desc' },
    });

    if (filtros.q?.trim()) {
      const q = filtros.q.trim().toLowerCase();
      ocorrencias = ocorrencias.filter((o) => {
        const nome = (o.familia?.lead.nomeCorreto ?? o.familia?.lead.nome ?? '').toLowerCase();
        const cpf = (o.familia?.lead.cpf ?? '').toLowerCase();
        const numeroFamilia = o.familia?.numero != null ? String(o.familia.numero) : '';
        return nome.includes(q) || cpf.includes(q) || numeroFamilia.includes(q);
      });
    }

    return ocorrencias;
  }

  /** Contadores do mini-dashboard — mesmo período/filtros de `listar()`, ignorando status. */
  async contadores(tenantId: string, filtros: { dataDe?: string; dataAte?: string }) {
    const where: any = { tenantId };
    if (filtros.dataDe || filtros.dataAte) {
      where.abertaEm = {};
      if (filtros.dataDe) where.abertaEm.gte = new Date(`${filtros.dataDe}T00:00:00`);
      if (filtros.dataAte) where.abertaEm.lte = new Date(`${filtros.dataAte}T23:59:59.999`);
    }
    const [abertas, encerradas] = await Promise.all([
      this.prisma.preOcupacaoOcorrencia.count({ where: { ...where, status: 'ABERTA' } }),
      this.prisma.preOcupacaoOcorrencia.count({ where: { ...where, status: 'ENCERRADA' } }),
    ]);
    return { abertas, encerradas };
  }

  async detalhe(tenantId: string, id: string) {
    const ocorrencia = await this.prisma.preOcupacaoOcorrencia.findFirst({
      where: { id, tenantId },
      include: {
        familia: { include: { lead: { select: { nome: true, nomeCorreto: true, cpf: true, numero: true, reentradaCount: true } } } },
        anexos: true,
        andamentos: { orderBy: { criadoEm: 'asc' }, include: { anexos: true } },
      },
    });
    if (!ocorrencia) throw new NotFoundException('Demanda não encontrada.');
    return ocorrencia;
  }

  async encerrar(tenantId: string, id: string, body: { resolucao?: string; avaliacao?: string; semResposta?: boolean }) {
    const ocorrencia = await this.prisma.preOcupacaoOcorrencia.findFirst({
      where: { id, tenantId },
      include: { anexos: true },
    });
    if (!ocorrencia) throw new NotFoundException('Demanda não encontrada.');
    if (ocorrencia.status !== 'ABERTA') {
      throw new BadRequestException('Esta demanda já está encerrada.');
    }
    if (!body.resolucao?.trim()) {
      throw new BadRequestException('resolucao é obrigatória para encerrar a demanda.');
    }
    if (!body.avaliacao) {
      throw new BadRequestException('avaliacao é obrigatória para encerrar a demanda.');
    }
    if (!body.semResposta && ocorrencia.anexos.length === 0) {
      throw new BadRequestException(
        'É necessário anexar uma evidência (foto ou print da conversa), ou marcar que a família não respondeu.',
      );
    }

    const updated = await this.prisma.preOcupacaoOcorrencia.update({
      where: { id: ocorrencia.id },
      data: {
        status: 'ENCERRADA',
        encerradaEm: new Date(),
        resolucao: body.resolucao.trim(),
        avaliacao: body.avaliacao as any,
        semResposta: !!body.semResposta,
      },
    });

    await this.audit.log({
      tenantId,
      action: 'PRE_OCUPACAO_ENCERRAR_DEMANDA',
      resourceType: 'PreOcupacaoOcorrencia',
      resourceId: updated.id,
      metadata: { numero: updated.numero, avaliacao: body.avaliacao },
    });

    return updated;
  }

  /**
   * Vincular uma demanda a um lead que ainda não tem família ativada no
   * programa implicitamente ativa essa família (decisão de produto — sem essa
   * regra a demanda ficaria "solta" apontando para uma família inexistente).
   */
  async vincularFamilia(tenantId: string, id: string, leadId: string, ativadoPor: string) {
    if (!leadId) throw new BadRequestException('leadId é obrigatório.');
    const ocorrencia = await this.getOcorrenciaOrThrow(tenantId, id);

    const familia = await this.familiasService.ativar(tenantId, leadId, ativadoPor);

    return this.prisma.preOcupacaoOcorrencia.update({
      where: { id: ocorrencia.id },
      data: { familiaId: familia.id },
    });
  }

  async adicionarAnexo(tenantId: string, id: string, file: any, nome?: string, criadoPor?: string) {
    const ocorrencia = await this.getOcorrenciaOrThrow(tenantId, id);
    if (!file) throw new BadRequestException('Arquivo é obrigatório.');

    const { url, publicId } = await uploadPreOcupacaoFile(file, tenantId, `ocorrencias/${ocorrencia.id}`);

    return this.prisma.preOcupacaoOcorrenciaAnexo.create({
      data: {
        ocorrenciaId: ocorrencia.id,
        url,
        publicId,
        nome: nome?.trim() || file.originalname || 'arquivo',
        mimeType: file.mimetype || null,
        criadoPor: criadoPor || null,
      },
    });
  }

  private async getOcorrenciaOrThrow(tenantId: string, id: string) {
    const ocorrencia = await this.prisma.preOcupacaoOcorrencia.findFirst({ where: { id, tenantId } });
    if (!ocorrencia) throw new NotFoundException('Demanda não encontrada.');
    return ocorrencia;
  }
}
