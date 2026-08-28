import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { Logger } from '../logger';
import { PrismaService } from '../prisma/prisma.service';
import { uploadPreOcupacaoFile } from './pre-ocupacao-upload.util';

/**
 * Templates reutilizáveis de mensagem (convite, lembrete, etc.) por tenant.
 * Imagem opcional é armazenada pública no Cloudinary (`{ public: true }`,
 * mesmo padrão de `conteudo.service.ts`) — precisa ser uma URL acessível
 * sem autenticação pra o WhatsApp/Meta conseguir baixar na hora do envio.
 */
@Injectable()
export class TemplatesService {
  private readonly logger = new Logger('PreOcupacaoTemplatesService');

  constructor(private readonly prisma: PrismaService) {}

  async listar(tenantId: string) {
    return this.prisma.preOcupacaoMensagemTemplate.findMany({
      where: { tenantId },
      orderBy: { nome: 'asc' },
    });
  }

  async criar(tenantId: string, body: { nome?: string; corpo?: string }, file?: any) {
    const nome = body.nome?.trim();
    const corpo = body.corpo?.trim();
    if (!nome) throw new BadRequestException('nome é obrigatório.');
    if (!corpo) throw new BadRequestException('corpo é obrigatório.');

    let imagemUrl: string | undefined;
    let imagemPublicId: string | undefined;
    if (file) {
      const up = await uploadPreOcupacaoFile(file, tenantId, 'templates', { public: true });
      imagemUrl = up.url;
      imagemPublicId = up.publicId;
    }

    return this.prisma.preOcupacaoMensagemTemplate.create({
      data: { tenantId, nome, corpo, imagemUrl, imagemPublicId },
    });
  }

  async atualizar(
    tenantId: string,
    id: string,
    body: { nome?: string; corpo?: string; removerImagem?: boolean },
    file?: any,
  ) {
    const existente = await this.prisma.preOcupacaoMensagemTemplate.findFirst({ where: { id, tenantId } });
    if (!existente) throw new NotFoundException('Template não encontrado.');

    const data: { nome?: string; corpo?: string; imagemUrl?: string | null; imagemPublicId?: string | null } = {};

    if (body.nome !== undefined) {
      const nome = body.nome.trim();
      if (!nome) throw new BadRequestException('nome não pode ficar vazio.');
      data.nome = nome;
    }
    if (body.corpo !== undefined) {
      const corpo = body.corpo.trim();
      if (!corpo) throw new BadRequestException('corpo não pode ficar vazio.');
      data.corpo = corpo;
    }

    if (file) {
      if (existente.imagemPublicId) await this.destruirImagem(existente.imagemPublicId);
      const up = await uploadPreOcupacaoFile(file, tenantId, 'templates', { public: true });
      data.imagemUrl = up.url;
      data.imagemPublicId = up.publicId;
    } else if (body.removerImagem && existente.imagemPublicId) {
      await this.destruirImagem(existente.imagemPublicId);
      data.imagemUrl = null;
      data.imagemPublicId = null;
    }

    return this.prisma.preOcupacaoMensagemTemplate.update({ where: { id }, data });
  }

  async excluir(tenantId: string, id: string) {
    const template = await this.prisma.preOcupacaoMensagemTemplate.findFirst({ where: { id, tenantId } });
    if (!template) throw new NotFoundException('Template não encontrado.');
    if (template.imagemPublicId) await this.destruirImagem(template.imagemPublicId);
    await this.prisma.preOcupacaoMensagemTemplate.delete({ where: { id } });
    return { ok: true };
  }

  private async destruirImagem(publicId: string) {
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image', type: 'upload', invalidate: true });
    } catch (e: any) {
      this.logger.warn(`Falha ao remover imagem do Cloudinary (${publicId}): ${e?.message}`);
    }
  }
}
