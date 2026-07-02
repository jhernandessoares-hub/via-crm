import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { Logger } from '../logger';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PRE_OCUPACAO_CATEGORIA_LABEL } from './pre-ocupacao-status.util';

const COMPETENCIA_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

function assertCompetenciaValida(competencia: string) {
  if (!COMPETENCIA_REGEX.test(competencia)) {
    throw new BadRequestException('competencia inválida — use o formato YYYY-MM.');
  }
}

function competenciaRange(competencia: string): { start: Date; end: Date } {
  const [anoStr, mesStr] = competencia.split('-');
  const ano = Number(anoStr);
  const mes = Number(mesStr); // 1-12
  const start = new Date(ano, mes - 1, 1, 0, 0, 0, 0);
  const end = new Date(ano, mes, 1, 0, 0, 0, 0); // exclusivo — início do mês seguinte
  return { start, end };
}

function formatDataLabel(d: Date): string {
  return d.toLocaleDateString('pt-BR');
}

@Injectable()
export class EntregaveisService {
  private readonly logger = new Logger('PreOcupacaoEntregaveisService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listar(tenantId: string) {
    return this.prisma.preOcupacaoEntregavelMensal.findMany({
      where: { tenantId },
      orderBy: { competencia: 'desc' },
    });
  }

  /**
   * Agrega o que já foi capturado nas sessões/participantes daquela competência.
   * Não duplica upload — só lê o que já está em `PreOcupacaoAtividade*`.
   */
  async agregarCompetencia(tenantId: string, competencia: string) {
    assertCompetenciaValida(competencia);
    return this.agregarCompetenciaInterno(this.prisma, tenantId, competencia);
  }

  private async agregarCompetenciaInterno(
    client: PrismaService | Prisma.TransactionClient,
    tenantId: string,
    competencia: string,
  ) {
    const { start, end } = competenciaRange(competencia);

    const atividades = await client.preOcupacaoAtividade.findMany({
      where: { tenantId, dataAgendada: { gte: start, lt: end } },
      include: {
        anexos: true,
        participantes: {
          include: {
            anexos: true,
            familia: { include: { lead: { select: { nome: true, nomeCorreto: true } } } },
          },
        },
      },
      orderBy: { dataAgendada: 'asc' },
    });

    const listasPresenca: any[] = [];
    const fotosVideos: any[] = [];
    const fichasIndividuais: any[] = [];
    const relatorios: string[] = [];

    for (const atividade of atividades) {
      const label = `${PRE_OCUPACAO_CATEGORIA_LABEL[atividade.categoria] ?? atividade.categoria} — ${formatDataLabel(atividade.dataAgendada)}${atividade.titulo ? ` (${atividade.titulo})` : ''}`;

      for (const anexo of atividade.anexos) {
        const entry = { ...anexo, atividadeId: atividade.id, atividadeLabel: label };
        if (anexo.tipo === 'LISTA_PRESENCA') listasPresenca.push(entry);
        else fotosVideos.push(entry); // FOTO | VIDEO
      }

      for (const participante of atividade.participantes) {
        const nomeFamilia = participante.familia.lead.nomeCorreto ?? participante.familia.lead.nome;
        for (const anexo of participante.anexos) {
          fichasIndividuais.push({
            ...anexo,
            atividadeId: atividade.id,
            atividadeLabel: label,
            familiaId: participante.familiaId,
            nomeFamilia,
            avaliacao: participante.avaliacao,
          });
        }
      }

      if (atividade.relatorio && atividade.relatorio.trim()) {
        relatorios.push(`${label}\n\n${atividade.relatorio.trim()}`);
      }
    }

    return {
      competencia,
      totalSessoes: atividades.length,
      listasPresenca,
      fotosVideos,
      fichasIndividuais,
      relatorioConsolidado: relatorios.join('\n\n---\n\n'),
    };
  }

  /**
   * Cria/obtém o `PreOcupacaoEntregavelMensal` e gera uma nova
   * `PreOcupacaoEntregavelVersao` (sequencial dentro da transação).
   *
   * ⚠️ PENDÊNCIA CONHECIDA (documentada a pedido do briefing): esta versão NÃO
   * gera um ZIP real. Montar o ZIP exigiria baixar cada anexo do Cloudinary
   * (autenticado) e compactar em memória/disco — trabalho de infra fora do
   * escopo desta fase. `arquivoUrl` fica vazio e `publicId` recebe um marcador
   * `PENDENTE_ZIP:...` só para deixar claro no dado que não há arquivo de fato.
   * O resumo agregado (`agregarCompetencia`) já está disponível via
   * `GET /pre-ocupacao/entregaveis/:competencia` para quem quiser montar o
   * pacote manualmente enquanto o ZIP automático não é implementado.
   * TODO(squad-qatester / usuário): decidir se vale priorizar a geração real do
   * ZIP numa fase futura.
   */
  async gerarVersao(tenantId: string, competencia: string, geradoPor: string) {
    assertCompetenciaValida(competencia);

    const resultado = await this.prisma.$transaction(async (tx) => {
      let mensal = await tx.preOcupacaoEntregavelMensal.findUnique({
        where: { tenantId_competencia: { tenantId, competencia } },
      });
      if (!mensal) {
        mensal = await tx.preOcupacaoEntregavelMensal.create({ data: { tenantId, competencia } });
      }

      const ultima = await tx.preOcupacaoEntregavelVersao.findFirst({
        where: { tenantId, competencia },
        orderBy: { versao: 'desc' },
        select: { versao: true },
      });
      const proximaVersao = (ultima?.versao ?? 0) + 1;

      const agregado = await this.agregarCompetenciaInterno(tx, tenantId, competencia);
      const nomeArquivo = `pre-ocupacao-${competencia}-v${proximaVersao}.json`; // TODO: trocar por .zip quando a geração real existir

      const versao = await tx.preOcupacaoEntregavelVersao.create({
        data: {
          tenantId,
          competencia,
          versao: proximaVersao,
          arquivoUrl: '', // TODO: URL do ZIP real quando implementado
          publicId: `PENDENTE_ZIP:${tenantId}:${competencia}:v${proximaVersao}`,
          nomeArquivo,
          geradoPor: geradoPor || 'desconhecido',
        },
      });

      return { mensal, versao, agregado };
    });

    this.logger.log(`Entregável gerado: competencia=${competencia} versao=${resultado.versao.versao} tenant=${tenantId}`);
    await this.audit.log({
      tenantId,
      action: 'PRE_OCUPACAO_GERAR_ENTREGAVEL',
      resourceType: 'PreOcupacaoEntregavelVersao',
      resourceId: resultado.versao.id,
      metadata: { competencia, versao: resultado.versao.versao, geradoPor },
    });

    return {
      mensal: resultado.mensal,
      versao: resultado.versao,
      resumo: {
        totalSessoes: resultado.agregado.totalSessoes,
        listasPresenca: resultado.agregado.listasPresenca.length,
        fotosVideos: resultado.agregado.fotosVideos.length,
        fichasIndividuais: resultado.agregado.fichasIndividuais.length,
      },
    };
  }

  async listarVersoes(tenantId: string, competencia: string) {
    assertCompetenciaValida(competencia);
    return this.prisma.preOcupacaoEntregavelVersao.findMany({
      where: { tenantId, competencia },
      orderBy: { versao: 'desc' },
    });
  }

  async atualizarStatus(
    tenantId: string,
    competencia: string,
    body: { status: string; enviadoPor?: string; enviadoVersaoId?: string },
  ) {
    assertCompetenciaValida(competencia);
    if (!body.status) throw new BadRequestException('status é obrigatório.');

    let mensal = await this.prisma.preOcupacaoEntregavelMensal.findUnique({
      where: { tenantId_competencia: { tenantId, competencia } },
    });
    if (!mensal) {
      mensal = await this.prisma.preOcupacaoEntregavelMensal.create({ data: { tenantId, competencia } });
    }

    const data: any = { status: body.status };
    if (body.status === 'ENVIADO') {
      data.enviadoEm = new Date();
      data.enviadoPor = body.enviadoPor || null;
      if (body.enviadoVersaoId) data.enviadoVersaoId = body.enviadoVersaoId;
    }

    const updated = await this.prisma.preOcupacaoEntregavelMensal.update({
      where: { id: mensal.id },
      data,
    });

    if (body.status === 'ENVIADO') {
      await this.audit.log({
        tenantId,
        action: 'PRE_OCUPACAO_ENVIAR_ENTREGAVEL',
        resourceType: 'PreOcupacaoEntregavelMensal',
        resourceId: updated.id,
        metadata: { competencia, status: body.status, enviadoPor: body.enviadoPor, enviadoVersaoId: body.enviadoVersaoId },
      });
    }

    return updated;
  }
}
