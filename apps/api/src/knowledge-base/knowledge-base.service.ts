import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PDFParse } from 'pdf-parse';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../products/cloudinary.service';
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto';
import { UpdateKnowledgeBaseDto } from './dto/update-knowledge-base.dto';

const KB_INCLUDE = {
  documents: { orderBy: { createdAt: 'desc' as const } },
  videos: { orderBy: { createdAt: 'desc' as const } },
  kbLinks: { orderBy: { createdAt: 'desc' as const } },
  agents: {
    select: { id: true, agentId: true },
    orderBy: { createdAt: 'asc' as const },
  },
};

@Injectable()
export class KnowledgeBaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async create(tenantId: string, body: CreateKnowledgeBaseDto) {
    return this.prisma.knowledgeBase.create({
      data: {
        tenantId,
        title: body.title,
        type: body.type as any,
        customCategory: body.customCategory?.trim() || null,
        prompt: body.prompt,
        whatAiUnderstood: body.whatAiUnderstood ?? null,
        exampleOutput: body.exampleOutput ?? null,
        tags: body.tags ?? [],
        audience: (body.audience as any) ?? 'AMBOS',
        active: body.active ?? true,
        priority: body.priority ?? 0,
        version: body.version ?? 1,
      },
      include: KB_INCLUDE,
    });
  }

  async findAll(tenantId: string, search?: string) {
    return this.prisma.knowledgeBase.findMany({
      where: {
        tenantId,
        ...(search && search.trim()
          ? {
              OR: [
                { title: { contains: search.trim(), mode: 'insensitive' } },
                { prompt: { contains: search.trim(), mode: 'insensitive' } },
                { whatAiUnderstood: { contains: search.trim(), mode: 'insensitive' } },
                { exampleOutput: { contains: search.trim(), mode: 'insensitive' } },
                { customCategory: { contains: search.trim(), mode: 'insensitive' } },
                { tags: { has: search.trim() } },
              ],
            }
          : {}),
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      include: KB_INCLUDE,
    });
  }

  async findOne(tenantId: string, id: string) {
    const item = await this.prisma.knowledgeBase.findFirst({
      where: { id, tenantId },
      include: KB_INCLUDE,
    });

    if (!item) throw new NotFoundException('Knowledge base não encontrada.');

    return item;
  }

  async update(tenantId: string, id: string, body: UpdateKnowledgeBaseDto) {
    const existing = await this.prisma.knowledgeBase.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!existing) throw new NotFoundException('Knowledge base não encontrada.');

    const data: Prisma.KnowledgeBaseUpdateInput = {};

    if (body.title !== undefined) data.title = body.title;
    if (body.type !== undefined) data.type = body.type as any;
    if (body.customCategory !== undefined) data.customCategory = body.customCategory?.trim() || null;
    if (body.prompt !== undefined) data.prompt = body.prompt;
    if (body.whatAiUnderstood !== undefined) data.whatAiUnderstood = body.whatAiUnderstood;
    if (body.exampleOutput !== undefined) data.exampleOutput = body.exampleOutput;
    if (body.tags !== undefined) data.tags = body.tags;
    if (body.audience !== undefined) data.audience = body.audience as any;
    if (body.active !== undefined) data.active = body.active;
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.version !== undefined) data.version = body.version;

    return this.prisma.knowledgeBase.update({
      where: { id: existing.id },
      data,
      include: KB_INCLUDE,
    });
  }

  async remove(tenantId: string, id: string) {
    const existing = await this.prisma.knowledgeBase.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!existing) throw new NotFoundException('Knowledge base não encontrada.');

    // Deleta documentos do Cloudinary antes de remover do banco
    const docs = await this.prisma.knowledgeBaseDocument.findMany({
      where: { knowledgeBaseId: existing.id },
      select: { publicId: true },
    });

    for (const doc of docs) {
      try {
        await this.cloudinary.deleteByPublicId(doc.publicId);
      } catch (_) {}
    }

    await this.prisma.knowledgeBase.delete({ where: { id: existing.id } });

    return { success: true, id: existing.id };
  }

  // =====================
  // DOCUMENTS (PDF)
  // =====================

  async addDocument(
    tenantId: string,
    knowledgeBaseId: string,
    file: { buffer: Buffer; mimetype: string },
    title?: string,
  ) {
    const kb = await this.prisma.knowledgeBase.findFirst({
      where: { id: knowledgeBaseId, tenantId },
      select: { id: true },
    });
    if (!kb) throw new NotFoundException('Knowledge base não encontrada.');

    const mimetype = String(file.mimetype || '').toLowerCase();
    if (mimetype !== 'application/pdf') {
      throw new BadRequestException('Apenas arquivos PDF são aceitos.');
    }

    const folder = `via-crm/${tenantId}/knowledge-base/${knowledgeBaseId}/documents`;
    let uploadResult: any;
    try {
      uploadResult = await this.cloudinary.uploadFileRaw(file.buffer, folder);
    } catch (e: any) {
      throw new BadRequestException(`Falha ao enviar para Cloudinary: ${e?.message || 'erro'}`);
    }

    const url = uploadResult?.secure_url || uploadResult?.url;
    const publicId = uploadResult?.public_id || uploadResult?.publicId;
    if (!url) throw new BadRequestException('Cloudinary não retornou URL');
    if (!publicId) throw new BadRequestException('Cloudinary não retornou publicId');

    // Extrai texto do PDF (pdf-parse v2)
    let extractedText: string | null = null;
    try {
      const parser = new PDFParse({ data: file.buffer });
      const parsed = await parser.getText();
      const text = (parsed.text || '').trim();
      if (text) extractedText = text.slice(0, 100_000); // limite de 100k chars
    } catch (_) {}

    return this.prisma.knowledgeBaseDocument.create({
      data: {
        tenantId,
        knowledgeBaseId: kb.id,
        url,
        publicId,
        title: title ? String(title).trim() || null : null,
        extractedText,
      },
    });
  }

  async listDocuments(tenantId: string, knowledgeBaseId: string) {
    const kb = await this.prisma.knowledgeBase.findFirst({
      where: { id: knowledgeBaseId, tenantId },
      select: { id: true },
    });
    if (!kb) throw new NotFoundException('Knowledge base não encontrada.');

    return this.prisma.knowledgeBaseDocument.findMany({
      where: { tenantId, knowledgeBaseId: kb.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteDocument(tenantId: string, knowledgeBaseId: string, documentId: string) {
    const doc = await this.prisma.knowledgeBaseDocument.findFirst({
      where: { id: documentId, tenantId, knowledgeBaseId },
    });
    if (!doc) throw new NotFoundException('Documento não encontrado.');

    try {
      await this.cloudinary.deleteByPublicId(doc.publicId);
    } catch (_) {}

    await this.prisma.knowledgeBaseDocument.delete({ where: { id: documentId } });

    return { ok: true };
  }

  // =====================
  // VIDEOS
  // =====================

  async addVideo(
    tenantId: string,
    knowledgeBaseId: string,
    body: { url: string; title?: string; description?: string },
  ) {
    const kb = await this.prisma.knowledgeBase.findFirst({
      where: { id: knowledgeBaseId, tenantId },
      select: { id: true },
    });
    if (!kb) throw new NotFoundException('Knowledge base não encontrada.');

    const url = String(body.url || '').trim();
    if (!url) throw new BadRequestException('URL do vídeo é obrigatória.');

    return this.prisma.knowledgeBaseVideo.create({
      data: {
        tenantId,
        knowledgeBaseId: kb.id,
        url,
        title: body.title ? String(body.title).trim() || null : null,
        description: body.description ? String(body.description).trim() || null : null,
      },
    });
  }

  async updateVideo(
    tenantId: string,
    knowledgeBaseId: string,
    videoId: string,
    body: { url?: string; title?: string | null; description?: string | null },
  ) {
    const video = await this.prisma.knowledgeBaseVideo.findFirst({
      where: { id: videoId, tenantId, knowledgeBaseId },
    });
    if (!video) throw new NotFoundException('Vídeo não encontrado.');

    const data: any = {};
    if (body.url !== undefined) {
      const url = String(body.url || '').trim();
      if (!url) throw new BadRequestException('URL do vídeo é obrigatória.');
      data.url = url;
    }
    if (body.title !== undefined) data.title = body.title ? String(body.title).trim() || null : null;
    if (body.description !== undefined)
      data.description = body.description ? String(body.description).trim() || null : null;

    return this.prisma.knowledgeBaseVideo.update({ where: { id: videoId }, data });
  }

  async deleteVideo(tenantId: string, knowledgeBaseId: string, videoId: string) {
    const video = await this.prisma.knowledgeBaseVideo.findFirst({
      where: { id: videoId, tenantId, knowledgeBaseId },
    });
    if (!video) throw new NotFoundException('Vídeo não encontrado.');

    await this.prisma.knowledgeBaseVideo.delete({ where: { id: videoId } });

    return { ok: true };
  }

  // =====================
  // LINKS
  // =====================

  async addLink(
    tenantId: string,
    knowledgeBaseId: string,
    body: { url: string; title?: string; description?: string },
  ) {
    const kb = await this.prisma.knowledgeBase.findFirst({
      where: { id: knowledgeBaseId, tenantId },
      select: { id: true },
    });
    if (!kb) throw new NotFoundException('Knowledge base não encontrada.');

    const url = String(body.url || '').trim();
    if (!url) throw new BadRequestException('URL do link é obrigatória.');

    return this.prisma.knowledgeBaseLink.create({
      data: {
        tenantId,
        knowledgeBaseId: kb.id,
        url,
        title: body.title ? String(body.title).trim() || null : null,
        description: body.description ? String(body.description).trim() || null : null,
      },
    });
  }

  async updateLink(
    tenantId: string,
    knowledgeBaseId: string,
    linkId: string,
    body: { url?: string; title?: string | null; description?: string | null },
  ) {
    const link = await this.prisma.knowledgeBaseLink.findFirst({
      where: { id: linkId, tenantId, knowledgeBaseId },
    });
    if (!link) throw new NotFoundException('Link não encontrado.');

    const data: any = {};
    if (body.url !== undefined) {
      const url = String(body.url || '').trim();
      if (!url) throw new BadRequestException('URL do link é obrigatória.');
      data.url = url;
    }
    if (body.title !== undefined) data.title = body.title ? String(body.title).trim() || null : null;
    if (body.description !== undefined)
      data.description = body.description ? String(body.description).trim() || null : null;

    return this.prisma.knowledgeBaseLink.update({ where: { id: linkId }, data });
  }

  async deleteLink(tenantId: string, knowledgeBaseId: string, linkId: string) {
    const link = await this.prisma.knowledgeBaseLink.findFirst({
      where: { id: linkId, tenantId, knowledgeBaseId },
    });
    if (!link) throw new NotFoundException('Link não encontrado.');

    await this.prisma.knowledgeBaseLink.delete({ where: { id: linkId } });

    return { ok: true };
  }

  // =====================
  // AGENT ATTACHMENT
  // =====================

  async attachToAgent(tenantId: string, agentId: string, knowledgeBaseId: string) {
    const agent = await this.prisma.aiAgent.findFirst({
      where: { id: agentId, tenantId },
      select: { id: true },
    });
    if (!agent) throw new NotFoundException('AI Agent não encontrado.');

    const kb = await this.prisma.knowledgeBase.findFirst({
      where: { id: knowledgeBaseId, tenantId },
      select: { id: true },
    });
    if (!kb) throw new NotFoundException('Knowledge base não encontrada.');

    return this.prisma.agentKnowledgeBase.upsert({
      where: { agentId_knowledgeBaseId: { agentId, knowledgeBaseId } },
      update: {},
      create: { tenantId, agentId, knowledgeBaseId },
    });
  }

  async detachFromAgent(tenantId: string, agentId: string, knowledgeBaseId: string) {
    const link = await this.prisma.agentKnowledgeBase.findFirst({
      where: { tenantId, agentId, knowledgeBaseId },
      select: { id: true },
    });
    if (!link) throw new NotFoundException('Vínculo entre agent e knowledge base não encontrado.');

    await this.prisma.agentKnowledgeBase.delete({ where: { id: link.id } });

    return { success: true, id: link.id, agentId, knowledgeBaseId };
  }
}
