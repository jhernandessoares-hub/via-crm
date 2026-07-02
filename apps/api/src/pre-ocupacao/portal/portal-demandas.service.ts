import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DemandasService } from '../demandas.service';

/**
 * Camada de ownership sobre DemandasService — a família só pode ver/criar/responder
 * as próprias demandas. Não expõe encerrar()/vincularFamilia() (ações de staff).
 */
@Injectable()
export class PortalDemandasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly demandas: DemandasService,
  ) {}

  async listarMinhas(tenantId: string, familiaId: string) {
    return this.prisma.preOcupacaoOcorrencia.findMany({
      where: { tenantId, familiaId },
      include: { anexos: true },
      orderBy: { abertaEm: 'desc' },
    });
  }

  private async assertOwnership(tenantId: string, familiaId: string, id: string) {
    const ocorrencia = await this.demandas.detalhe(tenantId, id);
    if (ocorrencia.familiaId !== familiaId) {
      throw new ForbiddenException('Você não tem acesso a esta demanda.');
    }
    return ocorrencia;
  }

  async detalhe(tenantId: string, familiaId: string, id: string) {
    return this.assertOwnership(tenantId, familiaId, id);
  }

  async criar(
    tenantId: string,
    familiaId: string,
    nomeFamilia: string,
    body: { tipo: string; tituloPersonalizado?: string; local?: string; localDescricao?: string; observacoes?: string },
  ) {
    return this.demandas.criar(tenantId, { ...body, familiaId, origem: 'PORTAL_FAMILIA' }, nomeFamilia);
  }

  async adicionarAndamento(
    tenantId: string,
    familiaId: string,
    id: string,
    texto: string | undefined,
    nomeFamilia: string,
    file?: any,
    nomeAnexo?: string,
  ) {
    await this.assertOwnership(tenantId, familiaId, id);
    return this.demandas.adicionarAndamento(tenantId, id, texto, nomeFamilia, file, nomeAnexo);
  }
}
