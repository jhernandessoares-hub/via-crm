import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MessageTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, userId: string) {
    return this.prisma.userMessageTemplate.findMany({
      where: { tenantId, userId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(
    tenantId: string,
    userId: string,
    body: { title?: string; content?: string },
  ) {
    const title = body?.title?.trim();
    const content = body?.content?.trim();
    if (!title) throw new BadRequestException('"title" é obrigatório.');
    if (!content) throw new BadRequestException('"content" é obrigatório.');

    return this.prisma.userMessageTemplate.create({
      data: { tenantId, userId, title, content },
    });
  }

  async update(
    tenantId: string,
    userId: string,
    id: string,
    body: { title?: string; content?: string },
  ) {
    const existing = await this.prisma.userMessageTemplate.findFirst({
      where: { id, tenantId, userId },
    });
    if (!existing) throw new NotFoundException('Mensagem padrão não encontrada.');

    const data: { title?: string; content?: string } = {};
    if (body.title !== undefined) {
      const title = body.title.trim();
      if (!title) throw new BadRequestException('"title" não pode ser vazio.');
      data.title = title;
    }
    if (body.content !== undefined) {
      const content = body.content.trim();
      if (!content) throw new BadRequestException('"content" não pode ser vazio.');
      data.content = content;
    }

    return this.prisma.userMessageTemplate.update({ where: { id }, data });
  }

  async remove(tenantId: string, userId: string, id: string) {
    const existing = await this.prisma.userMessageTemplate.findFirst({
      where: { id, tenantId, userId },
    });
    if (!existing) throw new NotFoundException('Mensagem padrão não encontrada.');

    await this.prisma.userMessageTemplate.delete({ where: { id } });
    return { ok: true, id };
  }
}
