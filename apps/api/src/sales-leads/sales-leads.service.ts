import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Logger } from '../logger';

const VALID_STATUS = ['NOVO', 'EM_CONTATO', 'CONVERTIDO', 'DESCARTADO'];

export type CreateSalesLeadInput = {
  nome?: string;
  telefone?: string;
  email?: string;
  empresa?: string;
  numFuncionarios?: string;
  mensagem?: string;
};

@Injectable()
export class SalesLeadsService {
  private readonly logger = new Logger('SalesLeadsService');

  constructor(private readonly prisma: PrismaService) {}

  // Público — formulário "Falar com vendas" do site institucional
  async create(data: CreateSalesLeadInput) {
    const nome = (data.nome || '').trim();
    const telefone = (data.telefone || '').trim();
    if (!nome) throw new BadRequestException('Nome é obrigatório.');
    if (!telefone) throw new BadRequestException('Telefone é obrigatório.');

    const lead = await this.prisma.salesLead.create({
      data: {
        nome,
        telefone,
        email: data.email?.trim() || null,
        empresa: data.empresa?.trim() || null,
        numFuncionarios: data.numFuncionarios?.trim() || null,
        mensagem: data.mensagem?.trim() || null,
        origem: 'SITE',
        status: 'NOVO',
      },
    });

    this.logger.log(`Novo lead de vendas: ${nome} (${telefone})`);
    return { ok: true, id: lead.id };
  }

  // Admin — lista de leads comerciais
  async list() {
    const leads = await this.prisma.salesLead.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return { leads, total: leads.length };
  }

  // Admin — atualizar status
  async updateStatus(id: string, status: string) {
    if (!VALID_STATUS.includes(status)) {
      throw new BadRequestException('Status inválido.');
    }
    await this.prisma.salesLead.update({ where: { id }, data: { status } });
    return { ok: true };
  }
}
