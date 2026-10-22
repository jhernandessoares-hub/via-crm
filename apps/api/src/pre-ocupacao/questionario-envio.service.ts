import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Logger } from '../logger';
import { PrismaService } from '../prisma/prisma.service';
import type { LeadsService } from '../leads/leads.service';
import type { WhatsappUnofficialService } from '../whatsapp-unofficial/whatsapp-unofficial.service';
import { gerarConviteToken, hashConviteToken } from './pre-ocupacao-convite-token.util';
import { registrarEventoEnvio } from './questionario-evento.util';
import { resolvePortalBaseUrl } from './pre-ocupacao-portal-url.util';

const DIA_MS = 24 * 60 * 60 * 1000;
const VALIDADE_TESTE_DIAS = 7;
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

  private async getUnofficialService(): Promise<WhatsappUnofficialService> {
    const { WhatsappUnofficialService: Cls } = await import('../whatsapp-unofficial/whatsapp-unofficial.service.js');
    return this.moduleRef.get(Cls, { strict: false });
  }

  /**
   * Envia texto para um número que não é de nenhum lead (envio de TESTE), pela
   * sessão WhatsApp Light conectada do tenant. O Oficial não serve aqui: não
   * manda texto livre para número sem conversa nas últimas 24h.
   */
  async enviarTextoParaNumero(tenantId: string, telefone: string, texto: string) {
    const sessao = await this.prisma.whatsappUnofficialSession.findFirst({
      where: { tenantId, status: 'CONNECTED' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!sessao) throw new Error('Nenhum WhatsApp Light conectado. Use o botão "Copiar link" para testar.');
    const unofficial = await this.getUnofficialService();
    const [validacao] = await unofficial.validateNumbers(sessao.id, [telefone]);
    if (validacao?.noWhatsapp) throw new Error('Este número não tem WhatsApp.');
    await unofficial.sendText(sessao.id, telefone, texto);
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
            teste: false,
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

  /**
   * Gera token novo, envia o WhatsApp e registra o resultado. Nunca lança.
   * Envio de TESTE vai para o telefone informado (sem lead) e devolve o link,
   * para a equipe poder abrir/copiar mesmo se o WhatsApp falhar.
   */
  async enviarUm(envioId: string, por?: string): Promise<{ ok: boolean; erro?: string; link?: string }> {
    const envio = await this.prisma.preOcupacaoQuestionarioEnvio.findUnique({
      where: { id: envioId },
      include: {
        questionario: true,
        familia: { include: { lead: { select: { id: true, nome: true, nomeCorreto: true } } } },
      },
    });
    if (!envio) return { ok: false, erro: 'Envio não encontrado.' };
    if (!envio.teste && !envio.familia) return { ok: false, erro: 'Envio sem família.' };

    const nome = envio.teste ? envio.testeNome ?? 'Teste' : envio.familia!.lead.nomeCorreto ?? envio.familia!.lead.nome;
    let link: string | undefined;
    try {
      // Token gerado e "hasheado" ANTES do WhatsApp sair (mesma ordem segura do
      // convite) — falha de hash não pode virar mensagem entregue marcada como erro.
      const token = gerarConviteToken();
      const tokenHash = hashConviteToken(token);
      const baseUrl = await resolvePortalBaseUrl(this.prisma, envio.tenantId);
      link = `${baseUrl}/portal/questionario/${token}`;
      const corpo = envio.questionario.mensagemEnvio.replace(/\{\{nome\}\}/gi, nome);
      const texto = /\{\{link\}\}/i.test(corpo)
        ? corpo.replace(/\{\{link\}\}/gi, link)
        : `${corpo}\n\nResponda aqui: ${link}`;

      // Token e validade gravados antes do envio: no teste o link tem que funcionar
      // mesmo se o WhatsApp falhar (a equipe copia o link).
      const agora = new Date();
      const validadeDias = envio.teste ? VALIDADE_TESTE_DIAS : envio.questionario.validadeDias;
      await this.prisma.preOcupacaoQuestionarioEnvio.update({
        where: { id: envio.id },
        data: { tokenHash, tokenExpiraEm: new Date(agora.getTime() + validadeDias * DIA_MS) },
      });

      if (envio.teste) {
        const textoTeste =
          `[TESTE] ${texto}

` +
          'Esta é uma mensagem de teste do questionário. Não precisa responder esta mensagem, use apenas o link.';
        await this.enviarTextoParaNumero(envio.tenantId, envio.testeTelefone ?? '', textoTeste);
      } else {
        const leadsService = await this.getLeadsService();
        await leadsService.sendWhatsappMessage(
          { tenantId: envio.tenantId, nome: 'Questionário Pré-Ocupação' },
          envio.familia!.leadId,
          { message: texto },
        );
      }

      await this.prisma.preOcupacaoQuestionarioEnvio.update({
        where: { id: envio.id },
        data: {
          statusEnvio: 'ENVIADO',
          enviadoEm: agora,
          enviosCount: { increment: 1 },
          ultimoEnvioErro: null,
        },
      });
      await registrarEventoEnvio(this.prisma, envio.id, 'ENVIADO', `${envio.enviosCount + 1}º envio`, por ?? null);
      this.logger.log(`Questionário enviado: envio=${envio.id} questionario=${envio.questionarioId} teste=${envio.teste}`);
      return { ok: true, link: envio.teste ? link : undefined };
    } catch (e: any) {
      const erro = (e?.message || String(e)).slice(0, 500);
      this.logger.error(`Falha ao enviar questionário: envio=${envio.id} erro=${erro}`);
      await this.prisma.preOcupacaoQuestionarioEnvio
        .update({ where: { id: envio.id }, data: { statusEnvio: 'FALHA', ultimoEnvioErro: erro } })
        .catch((err: any) => this.logger.error(`Falha ao registrar erro de envio: envio=${envio.id}`, { error: err?.message }));
      await registrarEventoEnvio(this.prisma, envio.id, 'FALHA', erro, por ?? null);
      return { ok: false, erro, link: envio.teste ? link : undefined };
    }
  }
}
