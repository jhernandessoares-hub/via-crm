import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Logger } from '../logger';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AgendamentoConviteService {
  private readonly logger = new Logger('PreOcupacaoAgendamentoConviteService');

  constructor(private readonly prisma: PrismaService) {}

  async criar(
    tenantId: string,
    atividadeId: string,
    criadoPor: string,
    body: { familiaIds?: string[]; mensagem?: string; agendadoPara?: string },
  ) {
    const atividade = await this.prisma.preOcupacaoAtividade.findFirst({ where: { id: atividadeId, tenantId } });
    if (!atividade) throw new NotFoundException('Sessão não encontrada.');

    const mensagem = body.mensagem?.trim();
    if (!mensagem) throw new BadRequestException('mensagem é obrigatória.');
    if (!body.agendadoPara) throw new BadRequestException('agendadoPara é obrigatória.');

    const agendadoPara = new Date(body.agendadoPara);
    if (Number.isNaN(agendadoPara.getTime())) throw new BadRequestException('agendadoPara inválida.');
    if (agendadoPara.getTime() <= Date.now()) {
      throw new BadRequestException('agendadoPara precisa ser uma data/hora futura.');
    }

    const agendamento = await this.prisma.preOcupacaoConviteAgendamento.create({
      data: {
        tenantId,
        atividadeId,
        familiaIds: body.familiaIds?.length ? body.familiaIds : undefined,
        mensagem,
        agendadoPara,
        criadoPor,
      },
    });
    this.logger.log(`Agendamento criado: id=${agendamento.id} atividade=${atividadeId} para=${agendadoPara.toISOString()}`);
    return agendamento;
  }

  async listar(tenantId: string, atividadeId: string) {
    return this.prisma.preOcupacaoConviteAgendamento.findMany({
      where: { tenantId, atividadeId, status: { in: ['PENDENTE', 'ERRO'] } },
      orderBy: { agendadoPara: 'asc' },
    });
  }

  async cancelar(tenantId: string, id: string) {
    const agendamento = await this.prisma.preOcupacaoConviteAgendamento.findFirst({ where: { id, tenantId } });
    if (!agendamento) throw new NotFoundException('Agendamento não encontrado.');
    if (agendamento.status !== 'PENDENTE') {
      throw new BadRequestException('Só é possível cancelar agendamentos pendentes.');
    }
    return this.prisma.preOcupacaoConviteAgendamento.update({ where: { id }, data: { status: 'CANCELADO' } });
  }

  /** Usado pelo worker — busca agendamentos vencidos ainda pendentes. */
  async buscarVencidos() {
    return this.prisma.preOcupacaoConviteAgendamento.findMany({
      where: { status: 'PENDENTE', agendadoPara: { lte: new Date() } },
    });
  }

  async marcarEnviado(id: string) {
    await this.prisma.preOcupacaoConviteAgendamento.update({
      where: { id },
      data: { status: 'ENVIADO', enviadoEm: new Date() },
    });
  }

  async marcarErro(id: string, erro: string) {
    await this.prisma.preOcupacaoConviteAgendamento.update({
      where: { id },
      data: { status: 'ERRO', erro: erro.slice(0, 500) },
    });
  }
}
