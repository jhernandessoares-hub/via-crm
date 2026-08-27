import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Logger } from '../logger';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { LeadsService } from '../leads/leads.service';
import { PRE_OCUPACAO_CATEGORIA_LABEL } from './pre-ocupacao-status.util';
import { uploadPreOcupacaoFile } from './pre-ocupacao-upload.util';

const DURACAO_PADRAO_MS = 2 * 60 * 60 * 1000; // 2h — não há horário de término no desenho da sessão

@Injectable()
export class AtividadesService {
  private readonly logger = new Logger('PreOcupacaoAtividadesService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * Resolve `LeadsService` via `ModuleRef` (em vez de injeção direta no
   * construtor) para evitar importar `whatsapp-unofficial.service.ts` no
   * topo deste arquivo — esse import transitivo puxa o pacote ESM
   * `@whiskeysockets/baileys`, que o Jest não consegue transformar por
   * padrão e quebraria QUALQUER spec que importe este arquivo, mesmo sem
   * exercitar o envio de convite (mesmo bug pré-existente em
   * `leads.service.spec.ts`, alheio a esta mudança).
   */
  private async getLeadsService(): Promise<LeadsService> {
    const { LeadsService: LeadsServiceClass } = await import('../leads/leads.service.js');
    return this.moduleRef.get(LeadsServiceClass, { strict: false });
  }

  /**
   * Cria uma sessão (Atividade). Cria também um `CalendarEvent` correspondente.
   *
   * Decisão: o `CalendarEvent` é criado diretamente via `tx.calendarEvent.create()`
   * dentro da MESMA transação que cria a Atividade e os Participantes — não se
   * reaproveita `CalendarService.create()` porque esse método sempre usa
   * `this.prisma` (não aceita um client de transação), o que quebraria a
   * atomicidade entre CalendarEvent + Atividade + Participantes. `eventType:
   * 'REUNIAO'`, `status: 'AGENDADO'`, `visibility: 'PUBLIC'` (visível para toda
   * a equipe, não é uma agenda pessoal).
   */
  async criar(
    tenantId: string,
    userId: string,
    body: {
      categoria: string;
      dataAgendada: string;
      local?: string;
      titulo?: string;
      prazoPreenchimentoDias?: number;
      familiaIds?: string[];
    },
  ) {
    if (!body.categoria) throw new BadRequestException('categoria é obrigatória.');
    if (!body.dataAgendada) throw new BadRequestException('dataAgendada é obrigatória.');

    const dataAgendada = new Date(body.dataAgendada);
    if (Number.isNaN(dataAgendada.getTime())) throw new BadRequestException('dataAgendada inválida.');
    const endAt = new Date(dataAgendada.getTime() + DURACAO_PADRAO_MS);

    let familiaIds = body.familiaIds?.filter(Boolean) ?? [];
    if (familiaIds.length === 0) {
      const ativas = await this.prisma.preOcupacaoFamilia.findMany({
        where: { tenantId, status: 'ATIVA' },
        select: { id: true },
      });
      familiaIds = ativas.map((f) => f.id);
    }
    if (familiaIds.length === 0) {
      throw new BadRequestException('Nenhuma família ativa disponível para vincular à sessão.');
    }

    const titulo = body.titulo?.trim() || PRE_OCUPACAO_CATEGORIA_LABEL[body.categoria] || 'Sessão Pré-Ocupação';

    const atividade = await this.prisma.$transaction(async (tx) => {
      const calendarEvent = await tx.calendarEvent.create({
        data: {
          tenantId,
          userId,
          title: titulo,
          startAt: dataAgendada,
          endAt,
          eventType: 'REUNIAO',
          status: 'AGENDADO',
          visibility: 'PUBLIC',
          location: body.local?.trim() || null,
        },
      });

      const created = await tx.preOcupacaoAtividade.create({
        data: {
          tenantId,
          categoria: body.categoria as any,
          calendarEventId: calendarEvent.id,
          dataAgendada,
          local: body.local?.trim() || null,
          titulo: body.titulo?.trim() || null,
          prazoPreenchimentoDias: body.prazoPreenchimentoDias ?? undefined,
        },
      });

      await tx.preOcupacaoAtividadeParticipante.createMany({
        data: familiaIds.map((familiaId) => ({
          atividadeId: created.id,
          familiaId,
          status: 'AGUARDANDO_PREENCHIMENTO' as any,
        })),
      });

      return created;
    });

    this.logger.log(`Sessão criada: id=${atividade.id} categoria=${body.categoria} familias=${familiaIds.length}`);
    return atividade;
  }

  async listar(tenantId: string) {
    const atividades = await this.prisma.preOcupacaoAtividade.findMany({
      where: { tenantId },
      include: { participantes: { select: { status: true } } },
      orderBy: { dataAgendada: 'desc' },
    });

    return atividades.map((a) => ({
      id: a.id,
      categoria: a.categoria,
      categoriaLabel: PRE_OCUPACAO_CATEGORIA_LABEL[a.categoria] ?? a.categoria,
      dataAgendada: a.dataAgendada,
      local: a.local,
      titulo: a.titulo,
      totalFamilias: a.participantes.length,
      concluidas: a.participantes.filter((p) => p.status === 'CONCLUIDA').length,
    }));
  }

  async detalhe(tenantId: string, id: string) {
    const atividade = await this.prisma.preOcupacaoAtividade.findFirst({
      where: { id, tenantId },
      include: {
        anexos: true,
        participantes: {
          include: { familia: { include: { lead: { select: { id: true, nome: true, nomeCorreto: true } } } } },
        },
      },
    });
    if (!atividade) throw new NotFoundException('Sessão não encontrada.');
    return atividade;
  }

  async atualizar(
    tenantId: string,
    id: string,
    body: { local?: string | null; titulo?: string | null; relatorio?: string | null },
  ) {
    await this.getAtividadeOrThrow(tenantId, id);
    const data: any = {};
    if (body.local !== undefined) data.local = body.local?.trim() || null;
    if (body.titulo !== undefined) data.titulo = body.titulo?.trim() || null;
    if (body.relatorio !== undefined) data.relatorio = body.relatorio?.trim() || null;
    return this.prisma.preOcupacaoAtividade.update({ where: { id }, data });
  }

  /** Upload de evidência geral da sessão (lista de presença, foto, vídeo). */
  async adicionarAnexo(
    tenantId: string,
    atividadeId: string,
    file: any,
    tipo: string,
    legenda?: string,
  ) {
    await this.getAtividadeOrThrow(tenantId, atividadeId);
    if (!file) throw new BadRequestException('Arquivo é obrigatório.');
    if (!tipo) throw new BadRequestException('tipo é obrigatório (LISTA_PRESENCA|FOTO|VIDEO).');

    const { url, publicId } = await uploadPreOcupacaoFile(file, tenantId, `atividades/${atividadeId}`);

    return this.prisma.preOcupacaoAtividadeAnexo.create({
      data: {
        atividadeId,
        tipo: tipo as any,
        url,
        publicId,
        nome: file.originalname || 'arquivo',
        mimeType: file.mimetype || null,
        legenda: legenda?.trim() || null,
      },
    });
  }

  /** Adiciona famílias a uma sessão já criada — ignora as que já são participantes (idempotente). */
  async adicionarParticipantes(tenantId: string, atividadeId: string, familiaIds: string[]) {
    await this.getAtividadeOrThrow(tenantId, atividadeId);
    const ids = [...new Set((familiaIds ?? []).filter(Boolean))];
    if (ids.length === 0) throw new BadRequestException('familiaIds é obrigatório.');

    const familiasValidas = await this.prisma.preOcupacaoFamilia.findMany({
      where: { id: { in: ids }, tenantId },
      select: { id: true },
    });
    const validasSet = new Set(familiasValidas.map((f) => f.id));
    const invalidas = ids.filter((id) => !validasSet.has(id));
    if (invalidas.length > 0) {
      throw new BadRequestException(`Família(s) inválida(s) para este tenant: ${invalidas.join(', ')}.`);
    }

    const jaParticipantes = await this.prisma.preOcupacaoAtividadeParticipante.findMany({
      where: { atividadeId, familiaId: { in: ids } },
      select: { familiaId: true },
    });
    const jaParticipantesSet = new Set(jaParticipantes.map((p) => p.familiaId));
    const novos = ids.filter((id) => !jaParticipantesSet.has(id));

    if (novos.length > 0) {
      await this.prisma.preOcupacaoAtividadeParticipante.createMany({
        data: novos.map((familiaId) => ({
          atividadeId,
          familiaId,
          status: 'AGUARDANDO_PREENCHIMENTO' as any,
        })),
      });
      this.logger.log(`Participantes adicionados: atividade=${atividadeId} familias=${novos.length}`);
    }

    return this.detalhe(tenantId, atividadeId);
  }

  /**
   * Envia convite via WhatsApp para uma ou mais famílias participantes desta
   * sessão. Reaproveita `LeadsService.sendWhatsappMessage()` — mesma lógica de
   * escolha de canal (Light/Oficial) já usada no resto do CRM. Falha de uma
   * família não aborta as demais; retorna um resumo por família.
   */
  async enviarConvites(
    tenantId: string,
    atividadeId: string,
    user: { tenantId: string; id?: string; nome?: string },
    familiaIds?: string[],
  ) {
    const atividade = await this.prisma.preOcupacaoAtividade.findFirst({
      where: { id: atividadeId, tenantId },
      include: {
        participantes: {
          include: { familia: { include: { lead: { select: { id: true, nome: true, nomeCorreto: true } } } } },
        },
      },
    });
    if (!atividade) throw new NotFoundException('Sessão não encontrada.');

    const alvo = familiaIds?.length
      ? atividade.participantes.filter((p) => familiaIds.includes(p.familiaId))
      : atividade.participantes;
    if (alvo.length === 0) throw new BadRequestException('Nenhuma família participante encontrada para o envio.');

    const categoriaLabel = PRE_OCUPACAO_CATEGORIA_LABEL[atividade.categoria] ?? atividade.categoria;
    const dataLabel = atividade.dataAgendada.toLocaleDateString('pt-BR');
    const horaLabel = atividade.dataAgendada.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const localTrecho = atividade.local ? `, em ${atividade.local}` : '';

    const leadsService = await this.getLeadsService();
    const resultados: { familiaId: string; nome: string; ok: boolean; erro?: string }[] = [];
    for (const p of alvo) {
      const nome = p.familia.lead.nomeCorreto ?? p.familia.lead.nome;
      const texto =
        `Olá, ${nome}! Você está convidado(a) para a sessão "${atividade.titulo || categoriaLabel}" ` +
        `do Trabalho Técnico Social, no dia ${dataLabel} às ${horaLabel}${localTrecho}. Contamos com sua presença!`;
      try {
        await leadsService.sendWhatsappMessage(user, p.familia.leadId, { message: texto });
        resultados.push({ familiaId: p.familiaId, nome, ok: true });
      } catch (e: any) {
        resultados.push({ familiaId: p.familiaId, nome, ok: false, erro: e?.message || String(e) });
      }
    }

    const enviados = resultados.filter((r) => r.ok).length;
    this.logger.log(`Convites enviados: atividade=${atividadeId} enviados=${enviados}/${resultados.length}`);
    await this.audit.log({
      tenantId,
      action: 'PRE_OCUPACAO_ENVIAR_CONVITE',
      resourceType: 'PreOcupacaoAtividade',
      resourceId: atividadeId,
      metadata: { enviados, total: resultados.length, familiaIds: alvo.map((p) => p.familiaId) },
    });

    return { resultados, enviados, total: resultados.length };
  }

  async marcarFalta(tenantId: string, atividadeId: string, familiaId: string, marcadoFaltaPor: string) {
    const participante = await this.getParticipanteOrThrow(tenantId, atividadeId, familiaId);

    const updated = await this.prisma.preOcupacaoAtividadeParticipante.update({
      where: { id: participante.id },
      data: { status: 'FALTOU', marcadoFaltaPor: marcadoFaltaPor || 'desconhecido' },
    });

    await this.audit.log({
      tenantId,
      action: 'PRE_OCUPACAO_MARCAR_FALTA',
      resourceType: 'PreOcupacaoAtividadeParticipante',
      resourceId: updated.id,
      metadata: { atividadeId, familiaId, marcadoFaltaPor },
    });

    return updated;
  }

  /** Upload da ficha individual de pontuação — marca o participante como CONCLUIDA. */
  async preencherFicha(
    tenantId: string,
    atividadeId: string,
    familiaId: string,
    file: any,
    data: { avaliacao?: string; transcricaoFicha?: string },
  ) {
    const participante = await this.getParticipanteOrThrow(tenantId, atividadeId, familiaId);
    if (!file) throw new BadRequestException('Arquivo é obrigatório.');

    const { url, publicId } = await uploadPreOcupacaoFile(
      file,
      tenantId,
      `atividades/${atividadeId}/participantes/${familiaId}`,
    );

    await this.prisma.preOcupacaoParticipanteAnexo.create({
      data: {
        participanteId: participante.id,
        url,
        publicId,
        nome: file.originalname || 'ficha',
        mimeType: file.mimetype || null,
      },
    });

    return this.prisma.preOcupacaoAtividadeParticipante.update({
      where: { id: participante.id },
      data: {
        status: 'CONCLUIDA',
        preenchidoEm: new Date(),
        avaliacao: (data.avaliacao as any) ?? undefined,
        transcricaoFicha: data.transcricaoFicha?.trim() || undefined,
      },
    });
  }

  // ─── Helpers de isolamento de tenant ────────────────────────────────────────
  // PreOcupacaoAtividadeParticipante/Anexo não têm tenantId próprio — o isolamento
  // é garantido validando a Atividade (que tem tenantId) ANTES de qualquer
  // consulta que use o atividadeId já verificado.

  private async getAtividadeOrThrow(tenantId: string, atividadeId: string) {
    const atividade = await this.prisma.preOcupacaoAtividade.findFirst({ where: { id: atividadeId, tenantId } });
    if (!atividade) throw new NotFoundException('Sessão não encontrada.');
    return atividade;
  }

  private async getParticipanteOrThrow(tenantId: string, atividadeId: string, familiaId: string) {
    await this.getAtividadeOrThrow(tenantId, atividadeId);
    const participante = await this.prisma.preOcupacaoAtividadeParticipante.findUnique({
      where: { atividadeId_familiaId: { atividadeId, familiaId } },
    });
    if (!participante) throw new NotFoundException('Família não é participante desta sessão.');
    return participante;
  }
}
