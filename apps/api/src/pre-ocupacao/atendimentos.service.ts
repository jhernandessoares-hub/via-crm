import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Logger } from '../logger';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { uploadPreOcupacaoFile } from './pre-ocupacao-upload.util';

export const ATENDIMENTO_MOTIVOS = [
  'DUVIDA',
  'RECLAMACAO',
  'SUGESTAO',
] as const;
export const ATENDIMENTO_ASSUNTOS = [
  'APARTAMENTO',
  'ENERGIA_ELETRICA',
  'AGUA_SANEAMENTO',
  'VALORES_CONDOMINIO',
  'CONTRATO_FINANCIAMENTO',
  'INSTALACOES_CONDOMINIO',
  'OUTROS',
] as const;
export const ATENDIMENTO_MODALIDADES = [
  'ONLINE',
  'PRESENCIAL',
  'TELEFONE',
] as const;

/** Canais de LeadEvent que são mensagem de WhatsApp (oficial e Light). */
const MESSAGE_CHANNELS = [
  'whatsapp.in',
  'whatsapp.out',
  'whatsapp.unofficial.in',
  'whatsapp.unofficial.out',
  // Tentativas de envio que falharam: aparecem marcadas como "não enviada" para
  // a equipe ver tudo que tentou responder (não somem do registro).
  'whatsapp.out.failed',
  'whatsapp.unofficial.out.failed',
];
/** Tipos de payload que não são conteúdo de conversa (recibos, reações, sinais internos). */
const IGNORED_PAYLOAD_TYPES = new Set([
  'reaction',
  'status',
  'ack',
  'delivery',
  'read',
  'protocol',
  'system',
]);
/** Sem encerramento anterior, a conversa "atual" considera no máximo os últimos 30 dias. */
const JANELA_PADRAO_DIAS = 30;
const MAX_MENSAGENS = 500;

export type AtendimentoMensagem = {
  id: string;
  criadoEm: Date;
  direcao: 'IN' | 'OUT';
  texto: string | null;
  midia: { tipo: string; nome: string | null; mimeType: string | null } | null;
  autor: string | null;
  falhou: boolean;
};

type AtendimentoBody = {
  motivo?: string;
  assunto?: string;
  modalidade?: string;
  descricao?: string;
  dataHora?: string;
};

type Actor = { id?: string; nome?: string };

/** Data `YYYY-MM-DD` interpretada no fuso de Brasília (servidor roda em UTC). */
function periodoWhere(de?: string, ate?: string) {
  const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (!isDate(de) && !isDate(ate)) return undefined;
  const where: { gte?: Date; lte?: Date } = {};
  if (isDate(de)) where.gte = new Date(`${de}T00:00:00.000-03:00`);
  if (isDate(ate)) where.lte = new Date(`${ate}T23:59:59.999-03:00`);
  return where;
}

function pickText(p: any): string | null {
  if (!p || typeof p !== 'object') return null;
  for (const v of [
    p.transcription,
    p.text,
    p.text?.body,
    p.body,
    p.caption,
    p.message,
  ]) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function pickMedia(p: any): AtendimentoMensagem['midia'] {
  if (!p || typeof p !== 'object') return null;
  const type = String(p.type || '').toLowerCase();
  const hasMedia =
    !!p.media?.url ||
    !!p.mediaUrl ||
    ['image', 'video', 'audio', 'document', 'sticker'].includes(type);
  if (!hasMedia) return null;
  const mimeType = p.media?.mimeType ?? p.mimeType ?? null;
  const kind = String(
    type || p.media?.kind || p.mediaType || mimeType || '',
  ).toLowerCase();
  const tipo = kind.includes('video')
    ? 'video'
    : kind.includes('audio')
      ? 'audio'
      : kind.includes('sticker')
        ? 'sticker'
        : kind.includes('image')
          ? 'image'
          : 'document';
  return { tipo, nome: p.media?.filename ?? p.filename ?? null, mimeType };
}

@Injectable()
export class AtendimentosService {
  private readonly logger = new Logger('PreOcupacaoAtendimentosService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private validar(body: AtendimentoBody) {
    const motivo = body.motivo as (typeof ATENDIMENTO_MOTIVOS)[number];
    const assunto = body.assunto as (typeof ATENDIMENTO_ASSUNTOS)[number];
    const modalidade = (body.modalidade ||
      'ONLINE') as (typeof ATENDIMENTO_MODALIDADES)[number];
    if (!ATENDIMENTO_MOTIVOS.includes(motivo))
      throw new BadRequestException('Motivo inválido.');
    if (!ATENDIMENTO_ASSUNTOS.includes(assunto))
      throw new BadRequestException('Assunto inválido.');
    if (!ATENDIMENTO_MODALIDADES.includes(modalidade))
      throw new BadRequestException('Modalidade inválida.');
    const descricao = body.descricao?.trim() || null;
    if (assunto === 'OUTROS' && !descricao) {
      throw new BadRequestException(
        'Descreva o atendimento quando o assunto for "Outros".',
      );
    }
    return { motivo, assunto, modalidade, descricao };
  }

  /** Converte LeadEvents de mensagem em formato enxuto para exibição/relatório. */
  private normalizarMensagens(
    events: { id: string; channel: string; criadoEm: Date; payloadRaw: any }[],
  ) {
    const out: AtendimentoMensagem[] = [];
    for (const ev of events) {
      const p = ev.payloadRaw as any;
      if (IGNORED_PAYLOAD_TYPES.has(String(p?.type || '').toLowerCase()))
        continue;
      const texto = pickText(p);
      const midia = pickMedia(p);
      if (!texto && !midia) continue;
      const direcao = ev.channel.endsWith('.in') ? 'IN' : 'OUT';
      const falhou = ev.channel.endsWith('.failed');
      const autor =
        direcao === 'IN'
          ? null
          : p?.source === 'corretor_celular'
            ? 'Pelo celular'
            : typeof p?.enviadoPorNome === 'string' && p.enviadoPorNome.trim()
              ? p.enviadoPorNome.trim()
              : null;
      out.push({
        id: ev.id,
        criadoEm: ev.criadoEm,
        direcao,
        texto,
        midia,
        autor,
        falhou,
      });
    }
    return out;
  }

  private async buscarMensagens(
    tenantId: string,
    leadId: string,
    criadoEm: { gt?: Date; gte?: Date; lte?: Date },
  ) {
    const events = await this.prisma.leadEvent.findMany({
      where: { tenantId, leadId, channel: { in: MESSAGE_CHANNELS }, criadoEm },
      select: { id: true, channel: true, criadoEm: true, payloadRaw: true },
      orderBy: { criadoEm: 'asc' },
      take: MAX_MENSAGENS,
    });
    return this.normalizarMensagens(events);
  }

  /**
   * Início da conversa atual do lead: o mais recente entre o último "Encerrar
   * conversa" e o fim do último atendimento registrado. Sem nenhum dos dois,
   * olha no máximo JANELA_PADRAO_DIAS para trás.
   */
  private async inicioConversaAtual(tenantId: string, leadId: string) {
    const [lead, ultimo] = await Promise.all([
      this.prisma.lead.findFirst({
        where: { id: leadId, tenantId },
        select: { conversaEncerradaEm: true },
      }),
      this.prisma.preOcupacaoAtendimento.findFirst({
        where: { tenantId, leadId, origem: { not: 'MANUAL' } },
        orderBy: { fimEm: 'desc' },
        select: { fimEm: true },
      }),
    ]);
    const candidatos = [lead?.conversaEncerradaEm, ultimo?.fimEm].filter(
      (d): d is Date => !!d,
    );
    if (candidatos.length)
      return new Date(Math.max(...candidatos.map((d) => d.getTime())));
    return new Date(Date.now() - JANELA_PADRAO_DIAS * 86400000);
  }

  private async familiaDoLead(tenantId: string, leadId: string) {
    return this.prisma.preOcupacaoFamilia.findFirst({
      where: { tenantId, leadId },
      select: { id: true, numero: true, status: true },
    });
  }

  /**
   * Usado pelo "Encerrar conversa" do lead: diz se o lead é família ativa na
   * Pré-Ocupação e devolve as mensagens da conversa atual para o quadro.
   */
  async pendentePorLead(tenantId: string, leadId: string) {
    const familia = await this.familiaDoLead(tenantId, leadId);
    if (!familia || familia.status !== 'ATIVA')
      return { familia: null, mensagens: [] };
    const inicio = await this.inicioConversaAtual(tenantId, leadId);
    const mensagens = await this.buscarMensagens(tenantId, leadId, {
      gt: inicio,
    });
    return { familia, mensagens };
  }

  /**
   * Família ativa com conversa aberta: ao sair do lead sem encerrar, a conversa
   * volta a contar como não lida (abrir o lead marca como lida). Só encerra pelo
   * quadro de atendimento.
   */
  async manterNaoLida(tenantId: string, leadId: string) {
    const familia = await this.familiaDoLead(tenantId, leadId);
    if (!familia || familia.status !== 'ATIVA') return { ok: false };
    await this.prisma.lead.updateMany({
      where: { id: leadId, tenantId, deletedAt: null, conversaAberta: true },
      data: { lastReadAt: null },
    });
    return { ok: true };
  }

  /** Registra o atendimento da conversa atual e encerra a conversa, numa só ação. */
  async registrarPorEncerramento(
    tenantId: string,
    leadId: string,
    body: AtendimentoBody,
    actor: Actor,
  ) {
    const dados = this.validar(body);
    const familia = await this.familiaDoLead(tenantId, leadId);
    if (!familia)
      throw new NotFoundException(
        'Este lead não é uma família da Pré-Ocupação.',
      );

    const fimEm = new Date();
    const inicio = await this.inicioConversaAtual(tenantId, leadId);
    const primeira = await this.prisma.leadEvent.findFirst({
      where: {
        tenantId,
        leadId,
        channel: { in: MESSAGE_CHANNELS.filter((c) => !c.endsWith('.failed')) },
        criadoEm: { gt: inicio, lte: fimEm },
      },
      orderBy: { criadoEm: 'asc' },
      select: { criadoEm: true },
    });

    // Mesmo efeito de LeadsService.endConversation() (aba principal), na mesma transação do registro.
    const [atendimento] = await this.prisma.$transaction([
      this.prisma.preOcupacaoAtendimento.create({
        data: {
          tenantId,
          familiaId: familia.id,
          leadId,
          ...dados,
          inicioEm: primeira?.criadoEm ?? fimEm,
          fimEm,
          origem: 'ENCERRAMENTO',
          atendidoPorId: actor.id ?? null,
          atendidoPorNome: actor.nome ?? null,
        },
      }),
      this.prisma.lead.update({
        where: { id: leadId },
        data: {
          conversaAberta: false,
          lastReadAt: fimEm,
          conversaEncerradaEm: fimEm,
        },
      }),
    ]);

    await this.registrarAudit(tenantId, actor, atendimento.id, {
      leadId,
      familiaId: familia.id,
      origem: 'ENCERRAMENTO',
    });
    this.logger.log(
      `Atendimento registrado (encerramento): lead=${leadId} familia=${familia.numero}`,
    );
    return atendimento;
  }

  /** Atendimento presencial/telefone lançado direto na família (sem mensagens de WhatsApp). */
  async registrarManual(
    tenantId: string,
    familiaId: string,
    body: AtendimentoBody,
    actor: Actor,
  ) {
    const dados = this.validar(body);
    const familia = await this.prisma.preOcupacaoFamilia.findFirst({
      where: { id: familiaId, tenantId },
    });
    if (!familia) throw new NotFoundException('Família não encontrada.');
    const quando = body.dataHora ? new Date(body.dataHora) : null;
    if (!quando || isNaN(quando.getTime()))
      throw new BadRequestException('Informe a data e hora do atendimento.');
    if (quando.getTime() > Date.now() + 5 * 60000)
      throw new BadRequestException(
        'A data do atendimento não pode ser futura.',
      );

    const atendimento = await this.prisma.preOcupacaoAtendimento.create({
      data: {
        tenantId,
        familiaId,
        leadId: familia.leadId,
        ...dados,
        inicioEm: quando,
        fimEm: quando,
        origem: 'MANUAL',
        atendidoPorId: actor.id ?? null,
        atendidoPorNome: actor.nome ?? null,
      },
    });
    await this.registrarAudit(tenantId, actor, atendimento.id, {
      familiaId,
      origem: 'MANUAL',
    });
    return atendimento;
  }

  async adicionarAnexo(
    tenantId: string,
    atendimentoId: string,
    file: any,
    nome?: string,
    criadoPor?: string,
  ) {
    const atendimento = await this.getOrThrow(tenantId, atendimentoId);
    if (!file) throw new BadRequestException('Arquivo é obrigatório.');
    const { url, publicId } = await uploadPreOcupacaoFile(
      file,
      tenantId,
      `atendimentos/${atendimento.id}`,
    );
    return this.prisma.preOcupacaoAtendimentoAnexo.create({
      data: {
        atendimentoId: atendimento.id,
        url,
        publicId,
        nome: nome?.trim() || file.originalname || 'arquivo',
        mimeType: file.mimetype || null,
        criadoPor: criadoPor || null,
      },
    });
  }

  async listarPorFamilia(tenantId: string, familiaId: string) {
    const familia = await this.prisma.preOcupacaoFamilia.findFirst({
      where: { id: familiaId, tenantId },
    });
    if (!familia) throw new NotFoundException('Família não encontrada.');
    return this.prisma.preOcupacaoAtendimento.findMany({
      where: { tenantId, familiaId },
      include: { anexos: true },
      orderBy: { inicioEm: 'desc' },
    });
  }

  /** Detalhe com as mensagens trocadas na janela do atendimento. */
  async detalhe(tenantId: string, id: string) {
    const atendimento = await this.prisma.preOcupacaoAtendimento.findFirst({
      where: { id, tenantId },
      include: {
        anexos: true,
        familia: {
          select: {
            id: true,
            numero: true,
            lead: { select: { nome: true, nomeCorreto: true } },
          },
        },
      },
    });
    if (!atendimento)
      throw new NotFoundException('Atendimento não encontrado.');
    const mensagens =
      atendimento.origem === 'MANUAL'
        ? []
        : await this.buscarMensagens(tenantId, atendimento.leadId, {
            gte: atendimento.inicioEm,
            lte: atendimento.fimEm,
          });
    return { ...atendimento, mensagens };
  }

  /** Todos os atendimentos do período (relatório detalhado). */
  async listarPeriodo(tenantId: string, de?: string, ate?: string) {
    const inicioEm = periodoWhere(de, ate);
    return this.prisma.preOcupacaoAtendimento.findMany({
      where: { tenantId, ...(inicioEm ? { inicioEm } : {}) },
      include: {
        familia: {
          select: {
            id: true,
            numero: true,
            lead: { select: { nome: true, nomeCorreto: true, cpf: true } },
          },
        },
      },
      orderBy: { inicioEm: 'asc' },
    });
  }

  /** Contagem por família no período — usada pela lista de Famílias. */
  async contarPorFamilia(tenantId: string, de?: string, ate?: string) {
    const inicioEm = periodoWhere(de, ate);
    const rows = await this.prisma.preOcupacaoAtendimento.groupBy({
      by: ['familiaId'],
      where: { tenantId, ...(inicioEm ? { inicioEm } : {}) },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.familiaId, r._count._all]));
  }

  private async getOrThrow(tenantId: string, id: string) {
    const atendimento = await this.prisma.preOcupacaoAtendimento.findFirst({
      where: { id, tenantId },
    });
    if (!atendimento)
      throw new NotFoundException('Atendimento não encontrado.');
    return atendimento;
  }

  private async registrarAudit(
    tenantId: string,
    actor: Actor,
    atendimentoId: string,
    metadata: Record<string, any>,
  ) {
    await this.audit.log({
      tenantId,
      userId: actor.id,
      action: 'PRE_OCUPACAO_REGISTRAR_ATENDIMENTO',
      resourceType: 'PreOcupacaoAtendimento',
      resourceId: atendimentoId,
      metadata,
    });
  }
}
