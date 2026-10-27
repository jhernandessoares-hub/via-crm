import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Logger } from '../logger';
import { PrismaService } from '../prisma/prisma.service';
import type { LeadsService } from '../leads/leads.service';
import type { WhatsappUnofficialService } from '../whatsapp-unofficial/whatsapp-unofficial.service';
import { gerarConviteToken, hashConviteToken } from './pre-ocupacao-convite-token.util';
import { registrarEventoEnvio } from './questionario-evento.util';
import { resolvePortalBaseUrl } from './pre-ocupacao-portal-url.util';
import { decidirCanalQuestionario } from './questionario-canal.util';
import { mensagemCorrecao } from './questionario-correcao.util';
import { mensagemCobranca, SituacaoCobravel } from './questionario-cobranca.util';
import { FALHAS_SEGUIDAS_PARA_PAUSAR, falhaDoNumero, inicioDoDiaSP } from './questionario-ritmo.util';

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
  private readonly falhasSeguidas = new Map<string, number>();

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
    return unofficial.sendText(sessao.id, telefone, texto);
  }

  /**
   * Mensagens que já saíram hoje (fuso de São Paulo) para as famílias deste
   * questionário — inclui reenvios e tentativas que falharam, porque todas
   * passam pelo WhatsApp e contam para o risco de restrição do número.
   */
  async enviadosHoje(questionarioId: string, agora = new Date()): Promise<number> {
    return this.prisma.preOcupacaoQuestionarioEnvioEvento.count({
      where: {
        tipo: { in: ['ENVIADO', 'FALHA'] },
        em: { gte: inicioDoDiaSP(agora) },
        envio: { questionarioId, teste: false },
      },
    });
  }

  /**
   * Processa os envios PENDENTE (de questionários publicados e não pausados)
   * cujo agendamento já chegou, um por vez, com intervalo aleatório entre as
   * mensagens. Questionário pausado fica com os envios na fila até "Retomar".
   * Reentrância protegida por flag.
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
            questionario: { status: 'PUBLICADO', envioPausadoEm: null },
            OR: [{ agendadoPara: null }, { agendadoPara: { lte: new Date() } }],
          },
          orderBy: { criadoEm: 'asc' },
          select: { id: true, questionarioId: true },
        });
        if (!envio) break;
        if (!primeiro) await sleep(DELAY_MIN_MS + Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS)));
        primeiro = false;
        const r = await this.enviarUm(envio.id);
        await this.contarFalha(envio.questionarioId, r);
      }
    } finally {
      this.processando = false;
    }
  }

  /**
   * Falhas seguidas no envio costumam ser o primeiro sinal de problema no
   * número (WhatsApp desconectado, restrição). Na 3ª seguida o disparo pausa e
   * a equipe decide quando retomar. "Número sem WhatsApp" é da família, não conta.
   */
  private async contarFalha(questionarioId: string, r: { ok: boolean; erro?: string }) {
    if (r.ok) return void this.falhasSeguidas.delete(questionarioId);
    if (falhaDoNumero(r.erro)) return;
    const n = (this.falhasSeguidas.get(questionarioId) ?? 0) + 1;
    this.falhasSeguidas.set(questionarioId, n);
    if (n < FALHAS_SEGUIDAS_PARA_PAUSAR) return;
    this.falhasSeguidas.delete(questionarioId);
    const motivo = `Pausado automaticamente: ${n} falhas seguidas no envio. Último erro: ${(r.erro ?? '').slice(0, 200)}`;
    await this.prisma.preOcupacaoQuestionario
      .update({ where: { id: questionarioId }, data: { envioPausadoEm: new Date(), envioPausaMotivo: motivo } })
      .catch((e: any) => this.logger.error(`Falha ao pausar envios: questionario=${questionarioId} erro=${e?.message}`));
    this.logger.warn(`Envios do questionário pausados: questionario=${questionarioId} — ${motivo}`);
  }

  /**
   * Gera token novo, envia o WhatsApp e registra o resultado. Nunca lança.
   * Envio de TESTE vai para o telefone informado (sem lead) e devolve o link,
   * para a equipe poder abrir/copiar mesmo se o WhatsApp falhar.
   */
  async enviarUm(
    envioId: string,
    por?: string,
    opcoes?: { cobranca?: SituacaoCobravel },
  ): Promise<{ ok: boolean; erro?: string; link?: string }> {
    const envio = await this.prisma.preOcupacaoQuestionarioEnvio.findUnique({
      where: { id: envioId },
      include: {
        questionario: true,
        familia: {
          include: { lead: { select: { id: true, nome: true, nomeCorreto: true, conversaCanal: true, conversaSessionId: true } } },
        },
      },
    });
    if (!envio) return { ok: false, erro: 'Envio não encontrado.' };
    if (!envio.teste && !envio.familia) return { ok: false, erro: 'Envio sem família.' };

    const nome = envio.teste ? envio.testeNome ?? 'Teste' : envio.familia!.lead.nomeCorreto ?? envio.familia!.lead.nome;
    let link: string | undefined;
    try {
      // Canal do envio: o do lead; lead sem canal útil sai pelo WhatsApp Light conectado
      // da imobiliária e passa a ficar nele (nunca pelo número Oficial da plataforma).
      if (!envio.teste) {
        const lead = envio.familia!.lead;
        const [tenant, sessao] = await Promise.all([
          this.prisma.tenant.findUnique({ where: { id: envio.tenantId }, select: { whatsappToken: true, whatsappPhoneNumberId: true } }),
          this.prisma.whatsappUnofficialSession.findFirst({
            where: { tenantId: envio.tenantId, status: 'CONNECTED' },
            orderBy: { createdAt: 'asc' },
            select: { id: true },
          }),
        ]);
        const decisao = decidirCanalQuestionario(lead, !!(tenant?.whatsappToken && tenant?.whatsappPhoneNumberId), sessao?.id ?? null);
        if (decisao.acao === 'ERRO') throw new Error(decisao.erro);
        if (decisao.acao === 'GRAVAR_LIGHT') {
          await this.prisma.lead.update({
            where: { id: lead.id },
            data: { conversaCanal: 'WHATSAPP_LIGHT', conversaSessionId: decisao.sessionId },
          });
        }
      }

      // Token gerado e "hasheado" ANTES do WhatsApp sair (mesma ordem segura do
      // convite) — falha de hash não pode virar mensagem entregue marcada como erro.
      const token = gerarConviteToken();
      const tokenHash = hashConviteToken(token);
      const baseUrl = await resolvePortalBaseUrl(this.prisma, envio.tenantId);
      link = `${baseUrl}/portal/questionario/${token}`;
      const corpo = envio.questionario.mensagemEnvio.replace(/\{\{nome\}\}/gi, nome);
      // Reenviado para corrigir: avisa que é a 2ª (3ª…) resposta e que substitui a anterior
      // Cobrança ("Cobrar resposta"): lembrete com texto conforme a situação da família
      const texto = opcoes?.cobranca
        ? mensagemCobranca(nome, envio.questionario.titulo, opcoes.cobranca, link)
        : envio.rodada > 1
          ? mensagemCorrecao(nome, envio.questionario.titulo, envio.rodada, link)
          : /\{\{link\}\}/i.test(corpo)
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

      let enviado: { canal: string; messageId: string | null };
      if (envio.teste) {
        const textoTeste =
          `[TESTE] ${texto}

` +
          'Esta é uma mensagem de teste do questionário. Não precisa responder esta mensagem, use apenas o link.';
        const r = await this.enviarTextoParaNumero(envio.tenantId, envio.testeTelefone ?? '', textoTeste);
        enviado = { canal: 'WHATSAPP_LIGHT', messageId: r.id };
      } else {
        const leadsService = await this.getLeadsService();
        const r = await leadsService.sendWhatsappMessage(
          { tenantId: envio.tenantId, nome: 'Questionário Pré-Ocupação' },
          envio.familia!.leadId,
          { message: texto },
        );
        enviado = { canal: r.canal, messageId: r.messageId };
      }

      await this.prisma.preOcupacaoQuestionarioEnvio.update({
        where: { id: envio.id },
        data: {
          statusEnvio: 'ENVIADO',
          enviadoEm: agora,
          enviosCount: { increment: 1 },
          ultimoEnvioErro: null,
          // Mensagem nova: a entrega volta a ser esperada para ela
          waMessageId: enviado.messageId,
          canalEnvio: enviado.canal,
          entregueEm: null,
          entregaErro: null,
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
