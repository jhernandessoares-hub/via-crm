import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Logger } from '../logger';
import { PrismaService } from '../prisma/prisma.service';
import type { LeadsService } from '../leads/leads.service';
import { gerarConviteToken, hashConviteToken } from './pre-ocupacao-convite-token.util';
import { resolvePortalBaseUrl } from './pre-ocupacao-portal-url.util';

const DIA_MS = 24 * 60 * 60 * 1000;
// Intervalo aleatório entre mensagens — mesmo cuidado do CampaignWorker, pra
// disparo de centenas de famílias não gerar restrição no WhatsApp Light.
const DELAY_MIN_MS = 8_000;
const DELAY_MAX_MS = 20_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Envio do link do questionário por WhatsApp, um envio por vez. Chamado pelo
 * `QuestionarioEnvioWorker` (fila) — ou direto, em background, quando o Redis
 * não está disponível.
 */
@Injectable()
export class QuestionarioEnvioService {
  private readonly logger = new Logger('PreOcupacaoQuestionarioEnvioService');
  private processando = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /** Mesmo motivo do `AtividadesService`: evita puxar o Baileys (ESM) no Jest. */
  private async getLeadsService(): Promise<LeadsService> {
    const { LeadsService: LeadsServiceClass } = await import('../leads/leads.service.js');
    return this.moduleRef.get(LeadsServiceClass, { strict: false });
  }

  /**
   * Processa todos os envios PENDENTE (de questionários publicados) cujo
   * agendamento já chegou (ou que não têm agendamento), até a fila esvaziar. Reentrância protegida por flag — um segundo disparo enquanto o
   * primeiro roda só faz o laço atual pegar os novos pendentes.
   */
  async processarPendentes() {
    if (this.processando) return;
    this.processando = true;
    try {
      let primeiro = true;
      for (;;) {
        const envio = await this.prisma.preOcupacaoQuestionarioEnvio.findFirst({
          where: {
            statusEnvio: 'PENDENTE',
            questionario: { status: 'PUBLICADO' },
            OR: [{ agendadoPara: null }, { agendadoPara: { lte: new Date() } }],
          },
          orderBy: { criadoEm: 'asc' },
          select: { id: true },
        });
        if (!envio) break;
        if (!primeiro) await sleep(DELAY_MIN_MS + Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS)));
        primeiro = false;
        await this.enviarUm(envio.id);
      }
    } finally {
      this.processando = false;
    }
  }

  /** Gera token novo, envia o WhatsApp e registra o resultado. Nunca lança. */
  async enviarUm(envioId: string): Promise<{ ok: boolean; erro?: string }> {
    const envio = await this.prisma.preOcupacaoQuestionarioEnvio.findUnique({
      where: { id: envioId },
      include: {
        questionario: true,
        familia: { include: { lead: { select: { id: true, nome: true, nomeCorreto: true } } } },
      },
    });
    if (!envio) return { ok: false, erro: 'Envio não encontrado.' };

    const nome = envio.familia.lead.nomeCorreto ?? envio.familia.lead.nome;
    try {
      // Token gerado e "hasheado" ANTES do WhatsApp sair (mesma ordem segura do
      // convite) — falha de hash não pode virar mensagem entregue marcada como erro.
      const token = gerarConviteToken();
      const tokenHash = hashConviteToken(token);
      const baseUrl = await resolvePortalBaseUrl(this.prisma, envio.tenantId);
      const link = `${baseUrl}/portal/questionario/${token}`;
      const corpo = envio.questionario.mensagemEnvio.replace(/\{\{nome\}\}/gi, nome);
      const texto = /\{\{link\}\}/i.test(corpo)
        ? corpo.replace(/\{\{link\}\}/gi, link)
        : `${corpo}\n\nResponda aqui: ${link}`;

      const leadsService = await this.getLeadsService();
      await leadsService.sendWhatsappMessage(
        { tenantId: envio.tenantId, nome: 'Questionário Pré-Ocupação' },
        envio.familia.leadId,
        { message: texto },
      );

      const agora = new Date();
      await this.prisma.preOcupacaoQuestionarioEnvio.update({
        where: { id: envio.id },
        data: {
          statusEnvio: 'ENVIADO',
          tokenHash,
          tokenExpiraEm: new Date(agora.getTime() + envio.questionario.validadeDias * DIA_MS),
          enviadoEm: agora,
          enviosCount: { increment: 1 },
          ultimoEnvioErro: null,
        },
      });
      this.logger.log(`Questionário enviado: envio=${envio.id} questionario=${envio.questionarioId}`);
      return { ok: true };
    } catch (e: any) {
      const erro = (e?.message || String(e)).slice(0, 500);
      this.logger.error(`Falha ao enviar questionário: envio=${envio.id} erro=${erro}`);
      await this.prisma.preOcupacaoQuestionarioEnvio
        .update({ where: { id: envio.id }, data: { statusEnvio: 'FALHA', ultimoEnvioErro: erro } })
        .catch((err: any) => this.logger.error(`Falha ao registrar erro de envio: envio=${envio.id}`, { error: err?.message }));
      return { ok: false, erro };
    }
  }
}
