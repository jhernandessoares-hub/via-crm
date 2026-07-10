import { Injectable, NotFoundException } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { Logger } from '../logger';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { uploadPreOcupacaoFile } from './pre-ocupacao-upload.util';

function resolveResourceType(mimeType: string | null | undefined): 'image' | 'video' | 'raw' {
  if (!mimeType) return 'raw';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'raw';
}

@Injectable()
export class ConteudoService {
  private readonly logger = new Logger('PreOcupacaoConteudoService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Lista tudo (inclusive oculto) — uso interno da equipe. */
  async listar(tenantId: string) {
    return this.prisma.preOcupacaoConteudo.findMany({
      where: { tenantId },
      orderBy: { criadoEm: 'desc' },
    });
  }

  async criar(tenantId: string, criadoPor: string, file: any, titulo: string, descricao?: string) {
    const { url, publicId } = await uploadPreOcupacaoFile(file, tenantId, 'conteudo', { public: true });

    const conteudo = await this.prisma.preOcupacaoConteudo.create({
      data: {
        tenantId,
        titulo: titulo?.trim() || file?.originalname || 'Conteúdo',
        descricao: descricao?.trim() || null,
        url,
        publicId,
        mimeType: file?.mimetype ?? null,
        criadoPor,
      },
    });

    this.logger.log(`Conteúdo criado: ${conteudo.id} tenant=${tenantId}`);
    await this.audit.log({
      tenantId,
      action: 'PRE_OCUPACAO_CONTEUDO_CRIADO',
      resourceType: 'PreOcupacaoConteudo',
      resourceId: conteudo.id,
      metadata: { titulo: conteudo.titulo },
    });

    return conteudo;
  }

  async alternarVisibilidade(tenantId: string, id: string) {
    const existente = await this.prisma.preOcupacaoConteudo.findFirst({ where: { id, tenantId } });
    if (!existente) throw new NotFoundException('Conteúdo não encontrado.');

    const conteudo = await this.prisma.preOcupacaoConteudo.update({
      where: { id },
      data: { oculto: !existente.oculto },
    });

    await this.audit.log({
      tenantId,
      action: 'PRE_OCUPACAO_CONTEUDO_ALTERADO',
      resourceType: 'PreOcupacaoConteudo',
      resourceId: conteudo.id,
      metadata: { oculto: conteudo.oculto },
    });

    return conteudo;
  }

  async excluir(tenantId: string, id: string) {
    const existente = await this.prisma.preOcupacaoConteudo.findFirst({ where: { id, tenantId } });
    if (!existente) throw new NotFoundException('Conteúdo não encontrado.');

    try {
      await cloudinary.uploader.destroy(existente.publicId, {
        resource_type: resolveResourceType(existente.mimeType),
        type: 'upload',
        invalidate: true,
      });
    } catch (e: any) {
      this.logger.warn(`Falha ao remover asset do Cloudinary (${existente.publicId}): ${e.message}`);
    }

    await this.prisma.preOcupacaoConteudo.delete({ where: { id } });

    await this.audit.log({
      tenantId,
      action: 'PRE_OCUPACAO_CONTEUDO_EXCLUIDO',
      resourceType: 'PreOcupacaoConteudo',
      resourceId: id,
      metadata: { titulo: existente.titulo },
    });

    return { ok: true };
  }

  /** Usado pelo Portal Família — só conteúdo visível. */
  async listarVisiveis(tenantId: string) {
    return this.prisma.preOcupacaoConteudo.findMany({
      where: { tenantId, oculto: false },
      orderBy: { criadoEm: 'desc' },
    });
  }
}
