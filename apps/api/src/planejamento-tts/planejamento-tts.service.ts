import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateAtividadeDto, UpdateIndicadorDto, UpdateParcelaDto } from './dto/planejamento-tts.dto';

@Injectable()
export class PlanejamentoTtsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAll(tenantId: string) {
    const [atividades, parcelas, indicadores] = await Promise.all([
      this.prisma.planejamentoTtsAtividade.findMany({
        where: { tenantId },
        orderBy: { ordem: 'asc' },
      }),
      this.prisma.planejamentoTtsParcela.findMany({
        where: { tenantId },
        orderBy: { numero: 'asc' },
      }),
      this.prisma.planejamentoTtsIndicador.findMany({
        where: { tenantId },
        orderBy: { numero: 'asc' },
      }),
    ]);
    return { atividades, parcelas, indicadores };
  }

  async updateAtividade(tenantId: string, id: string, dto: UpdateAtividadeDto) {
    const existente = await this.prisma.planejamentoTtsAtividade.findFirst({ where: { id, tenantId } });
    if (!existente) throw new NotFoundException('Atividade não encontrada');

    return this.prisma.planejamentoTtsAtividade.update({
      where: { id },
      data: {
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.prazoLimite !== undefined ? { prazoLimite: new Date(`${dto.prazoLimite}T00:00:00.000Z`) } : {}),
        ...(dto.responsavel !== undefined ? { responsavel: dto.responsavel } : {}),
        ...(dto.observacoes !== undefined ? { observacoes: dto.observacoes } : {}),
      },
    });
  }

  async updateParcela(tenantId: string, id: string, dto: UpdateParcelaDto) {
    const existente = await this.prisma.planejamentoTtsParcela.findFirst({ where: { id, tenantId } });
    if (!existente) throw new NotFoundException('Parcela não encontrada');

    return this.prisma.planejamentoTtsParcela.update({
      where: { id },
      data: {
        ...(dto.entregaveisStatus !== undefined ? { entregaveisStatus: dto.entregaveisStatus } : {}),
        ...(dto.nfStatus !== undefined ? { nfStatus: dto.nfStatus } : {}),
        ...(dto.pagamentoStatus !== undefined ? { pagamentoStatus: dto.pagamentoStatus } : {}),
        ...(dto.observacoes !== undefined ? { observacoes: dto.observacoes } : {}),
      },
    });
  }

  async updateIndicador(tenantId: string, id: string, dto: UpdateIndicadorDto) {
    const existente = await this.prisma.planejamentoTtsIndicador.findFirst({ where: { id, tenantId } });
    if (!existente) throw new NotFoundException('Indicador não encontrado');

    return this.prisma.planejamentoTtsIndicador.update({
      where: { id },
      data: {
        ...(dto.situacao !== undefined ? { situacao: dto.situacao } : {}),
        ...(dto.evidencias !== undefined ? { evidencias: dto.evidencias } : {}),
      },
    });
  }
}
