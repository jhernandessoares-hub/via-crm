import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Templates reutilizáveis de mensagem (convite, lembrete, etc.) por tenant. */
@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(tenantId: string) {
    return this.prisma.preOcupacaoMensagemTemplate.findMany({
      where: { tenantId },
      orderBy: { nome: 'asc' },
    });
  }

  async criar(tenantId: string, body: { nome?: string; corpo?: string }) {
    const nome = body.nome?.trim();
    const corpo = body.corpo?.trim();
    if (!nome) throw new BadRequestException('nome é obrigatório.');
    if (!corpo) throw new BadRequestException('corpo é obrigatório.');
    return this.prisma.preOcupacaoMensagemTemplate.create({ data: { tenantId, nome, corpo } });
  }

  async excluir(tenantId: string, id: string) {
    const template = await this.prisma.preOcupacaoMensagemTemplate.findFirst({ where: { id, tenantId } });
    if (!template) throw new NotFoundException('Template não encontrado.');
    await this.prisma.preOcupacaoMensagemTemplate.delete({ where: { id } });
    return { ok: true };
  }
}
