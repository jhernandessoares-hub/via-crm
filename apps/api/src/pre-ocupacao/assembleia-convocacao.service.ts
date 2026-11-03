import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Logger } from '../logger';
import { PrismaService } from '../prisma/prisma.service';
import type { LeadsService } from '../leads/leads.service';
import { gerarConviteToken, hashConviteToken } from './pre-ocupacao-convite-token.util';
import { resolvePortalBaseUrl } from './pre-ocupacao-portal-url.util';
import { decidirCanalQuestionario } from './questionario-canal.util';
import { FALHAS_SEGUIDAS_PARA_PAUSAR, FUSO, falhaDoNumero } from './questionario-ritmo.util';

const DIA_MS = 24 * 60 * 60 * 1000;
// Mesmo intervalo do disparo de questionários: protege o WhatsApp Light de restrição
const DELAY_MIN_MS = 8_000;
const DELAY_MAX_MS = 20_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function formatarDataAssembleia(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, dateStyle: 'full', timeStyle: 'short' }).format(d);
}

/** Grava um acontecimento no log da assembleia (anexo da ata). Nunca lança. */
export async function registrarEventoAssembleia(
  prisma: PrismaService,
  assembleiaId: string,
  tipo: string,
  detalhe?: string | null,
  por?: string | null,
  unidadeId?: string | null,
) {
  await prisma.preOcupacaoAssembleiaEvento
    .create({ data: { assembleiaId, tipo, detalhe: detalhe ?? null, por: por ?? null, unidadeId: unidadeId ?? null } })
    .catch(() => undefined);
}

/**
 * Convocação (edital) da assembleia por WhatsApp, uma unidade por vez, com o mesmo
 * ritmo e a mesma regra de canal do envio de questionários. O link vale até o fim
 * do dia seguinte à 2ª convocação.
 */
@Injectable()
export class AssembleiaConvocacaoService {
  private readonly logger = new Logger('PreOcupacaoAssembleiaConvocacaoService');
  private processando = false;
  private readonly falhasSeguidas = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /** Mesmo motivo do `QuestionarioEnvioService`: evita puxar o Baileys (ESM) no Jest. */
  private async getLeadsService(): Promise<LeadsService> {
    const { LeadsService: LeadsServiceClass } = await import('../leads/leads.service.js');
    return this.moduleRef.get(LeadsServiceClass, { strict: false });
  }

  async processarPendentes() {
    if (this.processando) return;
    this.processando = true;
    try {
      let primeiro = true;
      for (;;) {
        const u = await this.prisma.preOcupacaoAssembleiaUnidade.findFirst({
          where: {
            statusEnvio: 'PENDENTE',
            assembleia: { status: { in: ['CONVOCADA', 'EM_ANDAMENTO'] }, envioPausadoEm: null },
          },
          orderBy: { criadoEm: 'asc' },
          select: { id: true, assembleiaId: true },
        });
        if (!u) break;
        if (!primeiro) await sleep(DELAY_MIN_MS + Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS)));
        primeiro = false;
        const r = await this.enviarUm(u.id);
        await this.contarFalha(u.assembleiaId, r);
      }
    } finally {
      this.processando = false;
    }
  }

  private async contarFalha(assembleiaId: string, r: { ok: boolean; erro?: string }) {
    if (r.ok) return void this.falhasSeguidas.delete(assembleiaId);
    if (falhaDoNumero(r.erro)) return;
    const n = (this.falhasSeguidas.get(assembleiaId) ?? 0) + 1;
    this.falhasSeguidas.set(assembleiaId, n);
    if (n < FALHAS_SEGUIDAS_PARA_PAUSAR) return;
    this.falhasSeguidas.delete(assembleiaId);
    const motivo = `Pausado automaticamente: ${n} falhas seguidas no envio. Último erro: ${(r.erro ?? '').slice(0, 200)}`;
    await this.prisma.preOcupacaoAssembleia
      .update({ where: { id: assembleiaId }, data: { envioPausadoEm: new Date(), envioPausaMotivo: motivo } })
      .catch((e: any) => this.logger.error(`Falha ao pausar convocação: assembleia=${assembleiaId} erro=${e?.message}`));
    await registrarEventoAssembleia(this.prisma, assembleiaId, 'CONVOCACAO_PAUSADA', motivo);
  }

  /** Gera link novo, manda o edital e registra o resultado. Nunca lança. */
  async enviarUm(unidadeId: string, por?: string): Promise<{ ok: boolean; erro?: string }> {
    const u = await this.prisma.preOcupacaoAssembleiaUnidade.findUnique({
      where: { id: unidadeId },
      include: { assembleia: true },
    });
    if (!u) return { ok: false, erro: 'Unidade não encontrada.' };
    try {
      if (!u.leadId) throw new Error('Unidade sem morador no cadastro (sem telefone para convocar).');
      const lead = await this.prisma.lead.findFirst({
        where: { id: u.leadId, tenantId: u.tenantId, deletedAt: null },
        select: { id: true, nome: true, nomeCorreto: true, telefone: true, conversaCanal: true, conversaSessionId: true },
      });
      if (!lead) throw new Error('Lead da unidade não encontrado.');
      if (!lead.telefone) throw new Error('Lead sem telefone.');

      const [tenant, sessao] = await Promise.all([
        this.prisma.tenant.findUnique({ where: { id: u.tenantId }, select: { whatsappToken: true, whatsappPhoneNumberId: true } }),
        this.prisma.whatsappUnofficialSession.findFirst({
          where: { tenantId: u.tenantId, status: 'CONNECTED' },
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

      // Token antes do WhatsApp sair — mesma ordem segura do questionário
      const token = gerarConviteToken();
      const tokenHash = hashConviteToken(token);
      const baseUrl = await resolvePortalBaseUrl(this.prisma, u.tenantId);
      const link = `${baseUrl}/portal/assembleia/${token}`;
      const a = u.assembleia;
      const tokenExpiraEm = new Date(a.dataSegundaConvocacao.getTime() + 2 * DIA_MS);
      const nome = lead.nomeCorreto ?? lead.nome;
      const itens = await this.prisma.preOcupacaoAssembleiaItem.findMany({
        where: { assembleiaId: a.id },
        orderBy: { ordem: 'asc' },
        select: { ordem: true, titulo: true },
      });
      const pauta = itens.map((i) => `${i.ordem}. ${i.titulo}`).join('\n');
      const preenchido = a.edital
        .replace(/\{\{pauta\}\}/gi, pauta)
        .replace(/\{\{nome\}\}/gi, nome)
        .replace(/\{\{unidade\}\}/gi, [u.torreNome, u.unidadeNome].filter(Boolean).join(' · '))
        .replace(/\{\{data\}\}/gi, formatarDataAssembleia(a.dataPrimeiraConvocacao))
        .replace(/\{\{video\}\}/gi, a.linkVideo ?? '');
      const texto = /\{\{link\}\}/i.test(preenchido)
        ? preenchido.replace(/\{\{link\}\}/gi, link)
        : `${preenchido}\n\nSeu link individual para ${a.tipo === 'REUNIAO' ? 'confirmar presença' : 'participar e votar'}: ${link}`;

      await this.prisma.preOcupacaoAssembleiaUnidade.update({ where: { id: u.id }, data: { tokenHash, tokenExpiraEm } });

      const leadsService = await this.getLeadsService();
      const r = await leadsService.sendWhatsappMessage(
        { tenantId: u.tenantId, nome: 'Assembleia Pré-Ocupação' },
        lead.id,
        { message: texto, abrirConversa: false },
      );
      await this.prisma.preOcupacaoAssembleiaUnidade.update({
        where: { id: u.id },
        data: {
          statusEnvio: 'ENVIADO',
          enviadoEm: new Date(),
          enviosCount: { increment: 1 },
          ultimoEnvioErro: null,
          waMessageId: r.messageId,
          canalEnvio: r.canal,
          entregueEm: null,
          entregaErro: null,
          destinoNome: nome,
          destinoTelefone: lead.telefone,
        },
      });
      await registrarEventoAssembleia(this.prisma, a.id, 'CONVOCACAO_ENVIADA', `${u.enviosCount + 1}º envio para ${nome}`, por, u.id);
      return { ok: true };
    } catch (e: any) {
      const erro = (e?.message || String(e)).slice(0, 500);
      this.logger.error(`Falha ao convocar unidade: unidade=${u.id} erro=${erro}`);
      await this.prisma.preOcupacaoAssembleiaUnidade
        .update({ where: { id: u.id }, data: { statusEnvio: 'FALHA', ultimoEnvioErro: erro } })
        .catch(() => undefined);
      await registrarEventoAssembleia(this.prisma, u.assembleiaId, 'CONVOCACAO_FALHA', erro, por, u.id);
      return { ok: false, erro };
    }
  }
}

/**
 * Aviso de entrega do WhatsApp aplicado à convocação da assembleia (prova de convocação,
 * art. 1.354). Chamado junto do aviso do questionário. Nunca lança.
 */
export async function registrarAvisoEntregaAssembleia(
  prisma: PrismaService,
  waMessageId: string,
  aviso: 'ENTREGUE' | 'ERRO',
  detalhe?: string | null,
) {
  try {
    const unidades = await prisma.preOcupacaoAssembleiaUnidade.findMany({
      where: { waMessageId },
      select: { id: true, assembleiaId: true, entregueEm: true, statusEnvio: true, linkAbertoEm: true },
    });
    for (const u of unidades) {
      if (aviso === 'ENTREGUE') {
        if (u.entregueEm) continue;
        await prisma.preOcupacaoAssembleiaUnidade.update({
          where: { id: u.id },
          data: { entregueEm: new Date(), ...(u.statusEnvio === 'FALHA' ? { statusEnvio: 'ENVIADO', entregaErro: null, ultimoEnvioErro: null } : {}) },
        });
        await registrarEventoAssembleia(prisma, u.assembleiaId, 'CONVOCACAO_ENTREGUE', detalhe ?? null, null, u.id);
      } else {
        if (u.entregueEm || u.linkAbertoEm || u.statusEnvio !== 'ENVIADO') continue;
        const erro = `WhatsApp recusou a entrega${detalhe ? `: ${detalhe}` : ''}`.slice(0, 500);
        await prisma.preOcupacaoAssembleiaUnidade.update({
          where: { id: u.id },
          data: { statusEnvio: 'FALHA', entregaErro: erro, ultimoEnvioErro: erro },
        });
        await registrarEventoAssembleia(prisma, u.assembleiaId, 'CONVOCACAO_FALHA', erro, null, u.id);
      }
    }
  } catch {
    // listener de mensagem não pode quebrar
  }
}
