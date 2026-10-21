import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Logger } from '../logger';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FamiliasService } from './familias.service';
import { QuestionarioEnvioService } from './questionario-envio.service';
import { QuestionarioEnvioWorker } from './questionario-envio.worker';
import {
  PerguntaInput,
  normalizarPerguntas,
  preencherTexto,
  respostaParaTexto,
  situacaoEnvio,
} from './questionario-pergunta.util';
import { PerguntaConfig, QuestionarioConfig, indexarRespostas, montarPassos, opcoesDe } from './questionario-fluxo';

const MENSAGEM_PADRAO =
  'Olá, {{nome}}! A equipe do Trabalho Técnico Social preparou um questionário rápido para você. ' +
  'Suas respostas são muito importantes. Responda pelo link: {{link}}';

export interface QuestionarioDadosInput {
  titulo?: string;
  descricao?: string | null;
  mensagemEnvio?: string;
  validadeDias?: number;
}

export interface PublicoFiltro {
  statusFamilia?: string[];
  acompanhamento?: string[];
  empreendimento?: string | null;
}

@Injectable()
export class QuestionariosService {
  private readonly logger = new Logger('PreOcupacaoQuestionariosService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly familias: FamiliasService,
    private readonly envioService: QuestionarioEnvioService,
    private readonly envioWorker: QuestionarioEnvioWorker,
  ) {}

  private async getOrThrow(tenantId: string, id: string) {
    const q = await this.prisma.preOcupacaoQuestionario.findFirst({ where: { id, tenantId } });
    if (!q) throw new NotFoundException('Questionário não encontrado.');
    return q;
  }

  private validarDados(dados: QuestionarioDadosInput, criando: boolean) {
    const out: Record<string, any> = {};
    if (dados.titulo !== undefined || criando) {
      const titulo = String(dados.titulo ?? '').trim();
      if (!titulo) throw new BadRequestException('Informe o título do questionário.');
      out.titulo = titulo.slice(0, 200);
    }
    if (dados.descricao !== undefined) out.descricao = dados.descricao ? String(dados.descricao).trim() : null;
    if (dados.mensagemEnvio !== undefined) {
      const msg = String(dados.mensagemEnvio ?? '').trim();
      if (!msg) throw new BadRequestException('Informe a mensagem do WhatsApp.');
      out.mensagemEnvio = msg;
    }
    if (dados.validadeDias !== undefined) {
      const dias = Number(dados.validadeDias);
      if (!Number.isInteger(dias) || dias < 1 || dias > 180) {
        throw new BadRequestException('Validade do link deve ser entre 1 e 180 dias.');
      }
      out.validadeDias = dias;
    }
    return out;
  }

  // ─── CRUD ────────────────────────────────────────────────────────────────

  async listar(tenantId: string) {
    const lista = await this.prisma.preOcupacaoQuestionario.findMany({
      where: { tenantId },
      orderBy: { criadoEm: 'desc' },
      include: {
        _count: { select: { perguntas: true } },
        envios: { select: { statusEnvio: true, linkAbertoEm: true, respondidoEm: true } },
      },
    });
    return lista.map(({ envios, _count, ...q }) => ({
      ...q,
      totalPerguntas: _count.perguntas,
      totalEnvios: envios.length,
      enviados: envios.filter((e) => e.statusEnvio === 'ENVIADO').length,
      respondidos: envios.filter((e) => e.respondidoEm).length,
    }));
  }

  async criar(tenantId: string, criadoPor: string, dados: QuestionarioDadosInput) {
    const data = this.validarDados({ mensagemEnvio: MENSAGEM_PADRAO, ...dados }, true);
    const q = await this.prisma.preOcupacaoQuestionario.create({
      data: { tenantId, criadoPor: criadoPor || 'desconhecido', ...(data as any) },
    });
    await this.audit.log({
      tenantId,
      action: 'PRE_OCUPACAO_QUESTIONARIO_CRIADO',
      resourceType: 'PreOcupacaoQuestionario',
      resourceId: q.id,
      metadata: { titulo: q.titulo, criadoPor },
    });
    return q;
  }

  async detalhe(tenantId: string, id: string) {
    const q = await this.prisma.preOcupacaoQuestionario.findFirst({
      where: { id, tenantId },
      include: { perguntas: { orderBy: { ordem: 'asc' } }, _count: { select: { envios: true } } },
    });
    if (!q) throw new NotFoundException('Questionário não encontrado.');
    const { _count, ...rest } = q;
    return { ...rest, totalEnvios: _count.envios };
  }

  async atualizar(tenantId: string, id: string, dados: QuestionarioDadosInput) {
    const q = await this.getOrThrow(tenantId, id);
    if (q.status === 'ENCERRADO') throw new ConflictException('Questionário encerrado não pode ser alterado.');
    const data = this.validarDados(dados, false);
    await this.prisma.preOcupacaoQuestionario.update({ where: { id }, data });
    return this.detalhe(tenantId, id);
  }

  async excluir(tenantId: string, id: string) {
    const q = await this.getOrThrow(tenantId, id);
    const envios = await this.prisma.preOcupacaoQuestionarioEnvio.count({ where: { questionarioId: id } });
    if (envios > 0) {
      throw new ConflictException('Este questionário já foi enviado e não pode ser excluído. Use "Encerrar".');
    }
    await this.prisma.preOcupacaoQuestionario.delete({ where: { id } });
    await this.audit.log({
      tenantId,
      action: 'PRE_OCUPACAO_QUESTIONARIO_EXCLUIDO',
      resourceType: 'PreOcupacaoQuestionario',
      resourceId: id,
      metadata: { titulo: q.titulo },
    });
    return { ok: true };
  }

  async salvarPerguntas(tenantId: string, id: string, perguntas: PerguntaInput[]) {
    const q = await this.getOrThrow(tenantId, id);
    if (q.status !== 'RASCUNHO') {
      throw new ConflictException('As perguntas só podem ser alteradas em rascunho. Use "Duplicar" para criar outra versão.');
    }
    const normalizadas = normalizarPerguntas(perguntas);
    await this.prisma.$transaction([
      this.prisma.preOcupacaoQuestionarioPergunta.deleteMany({ where: { questionarioId: id } }),
      this.prisma.preOcupacaoQuestionarioPergunta.createMany({
        data: normalizadas.map((p) => ({ ...p, questionarioId: id })) as any,
      }),
    ]);
    return this.detalhe(tenantId, id);
  }

  async publicar(tenantId: string, id: string) {
    const q = await this.getOrThrow(tenantId, id);
    if (q.status !== 'RASCUNHO') throw new ConflictException('Só é possível publicar um questionário em rascunho.');
    const total = await this.prisma.preOcupacaoQuestionarioPergunta.count({ where: { questionarioId: id } });
    if (total === 0) throw new BadRequestException('Adicione pelo menos uma pergunta antes de publicar.');
    await this.prisma.preOcupacaoQuestionario.update({
      where: { id },
      data: { status: 'PUBLICADO', publicadoEm: new Date() },
    });
    await this.audit.log({
      tenantId,
      action: 'PRE_OCUPACAO_QUESTIONARIO_PUBLICADO',
      resourceType: 'PreOcupacaoQuestionario',
      resourceId: id,
      metadata: { titulo: q.titulo, perguntas: total },
    });
    return this.detalhe(tenantId, id);
  }

  async encerrar(tenantId: string, id: string) {
    const q = await this.getOrThrow(tenantId, id);
    if (q.status !== 'PUBLICADO') throw new ConflictException('Só é possível encerrar um questionário publicado.');
    await this.prisma.preOcupacaoQuestionario.update({
      where: { id },
      data: { status: 'ENCERRADO', encerradoEm: new Date() },
    });
    await this.audit.log({
      tenantId,
      action: 'PRE_OCUPACAO_QUESTIONARIO_ENCERRADO',
      resourceType: 'PreOcupacaoQuestionario',
      resourceId: id,
      metadata: { titulo: q.titulo },
    });
    return this.detalhe(tenantId, id);
  }

  async duplicar(tenantId: string, id: string, criadoPor: string) {
    const q = await this.detalhe(tenantId, id);
    const novo = await this.prisma.preOcupacaoQuestionario.create({
      data: {
        tenantId,
        titulo: `${q.titulo} (cópia)`.slice(0, 200),
        descricao: q.descricao,
        mensagemEnvio: q.mensagemEnvio,
        validadeDias: q.validadeDias,
        config: (q.config ?? undefined) as any,
        criadoPor: criadoPor || 'desconhecido',
        perguntas: {
          create: q.perguntas.map((p) => ({
            ordem: p.ordem,
            enunciado: p.enunciado,
            tipo: p.tipo,
            opcoes: (p.opcoes ?? undefined) as any,
            escalaMin: p.escalaMin,
            escalaMax: p.escalaMax,
            obrigatoria: p.obrigatoria,
            chave: p.chave,
            config: (p.config ?? undefined) as any,
          })),
        },
      },
    });
    await this.audit.log({
      tenantId,
      action: 'PRE_OCUPACAO_QUESTIONARIO_CRIADO',
      resourceType: 'PreOcupacaoQuestionario',
      resourceId: novo.id,
      metadata: { titulo: novo.titulo, duplicadoDe: id, criadoPor },
    });
    return novo;
  }

  // ─── Público e envio ────────────────────────────────────────────────────

  /**
   * Famílias que entram no filtro (status da família + acompanhamento +
   * empreendimento), marcando quem já recebeu este questionário e quem não
   * tem telefone. Reaproveita `FamiliasService.listar()` pra não divergir da
   * tela de famílias.
   */
  /** O questionário pede CPF? Então só pode ir para família com CPF no cadastro. */
  private async exigeCpf(questionarioId: string) {
    return (await this.prisma.preOcupacaoQuestionarioPergunta.count({ where: { questionarioId, tipo: 'CPF' } })) > 0;
  }

  /** Leads (dos ids informados) que têm CPF no titular ou em algum participante. */
  private async leadsComCpf(tenantId: string, leadIds: string[]) {
    const leads = await this.prisma.lead.findMany({
      where: { tenantId, id: { in: leadIds } },
      select: { id: true, cpf: true, participantes: { select: { cpf: true } } },
    });
    const temCpf = (v: string | null | undefined) => String(v ?? '').replace(/\D/g, '').length > 0;
    return new Set(leads.filter((l) => temCpf(l.cpf) || l.participantes.some((p) => temCpf(p.cpf))).map((l) => l.id));
  }

  async previewPublico(tenantId: string, id: string, filtro: PublicoFiltro) {
    await this.getOrThrow(tenantId, id);
    const { items } = await this.familias.listar(tenantId);

    const statusFamilia = filtro.statusFamilia?.length ? filtro.statusFamilia : ['ATIVA'];
    const acompanhamento = filtro.acompanhamento?.length ? filtro.acompanhamento : null;
    const empreendimento = filtro.empreendimento?.trim() || null;

    const filtradas = items.filter(
      (f) =>
        statusFamilia.includes(f.statusFamilia) &&
        (!acompanhamento || acompanhamento.includes(f.status)) &&
        (!empreendimento || f.empreendimento === empreendimento),
    );

    const [envios, leads, exigeCpf, comCpf] = await Promise.all([
      this.prisma.preOcupacaoQuestionarioEnvio.findMany({
        where: { questionarioId: id },
        select: { familiaId: true, statusEnvio: true, agendadoPara: true, linkAbertoEm: true, respondidoEm: true },
      }),
      this.prisma.lead.findMany({
        where: { tenantId, id: { in: filtradas.map((f) => f.leadId) } },
        select: { id: true, telefone: true },
      }),
      this.exigeCpf(id),
      this.leadsComCpf(tenantId, filtradas.map((f) => f.leadId)),
    ]);
    const envioPorFamilia = new Map(envios.map((e) => [e.familiaId, e]));
    const telefonePorLead = new Map(leads.map((l) => [l.id, l.telefone]));

    const familias = filtradas.map((f) => {
      const envio = envioPorFamilia.get(f.id);
      return {
        familiaId: f.id,
        numero: f.numero,
        nome: f.nome,
        empreendimento: f.empreendimento,
        unidade: f.unidade,
        statusFamilia: f.statusFamilia,
        acompanhamento: f.status,
        semTelefone: !telefonePorLead.get(f.leadId),
        // Sem CPF no cadastro a família não passa da tela do CPF — não deixa enviar
        semCpf: exigeCpf && !comCpf.has(f.leadId),
        situacao: envio ? situacaoEnvio(envio) : null,
      };
    });

    const empreendimentos = Array.from(
      new Set(items.map((f) => f.empreendimento).filter((e): e is string => !!e)),
    ).sort();

    return {
      familias,
      empreendimentos,
      total: familias.length,
      jaReceberam: familias.filter((f) => f.situacao).length,
      vaoReceber: familias.filter((f) => !f.situacao && !f.semTelefone && !f.semCpf).length,
      semCpf: familias.filter((f) => f.semCpf).length,
    };
  }

  /** Valida a data de agendamento (ISO). `null` = enviar agora. */
  private validarAgendamento(agendadoPara?: string | null): Date | null {
    if (!agendadoPara) return null;
    const data = new Date(agendadoPara);
    if (Number.isNaN(data.getTime())) throw new BadRequestException('Data de agendamento inválida.');
    const agora = Date.now();
    if (data.getTime() < agora + 60_000) {
      throw new BadRequestException('O agendamento precisa ser para pelo menos 1 minuto no futuro.');
    }
    if (data.getTime() > agora + 90 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException('O agendamento pode ser de no máximo 90 dias à frente.');
    }
    return data;
  }

  /**
   * Cria um envio PENDENTE por família (pula quem já recebeu). Sem
   * `agendadoPara`, a fila começa na hora; com `agendadoPara`, o cron do
   * worker solta os envios quando o horário chega.
   */
  async enviar(
    tenantId: string,
    id: string,
    familiaIds: string[],
    enviadoPor: string,
    agendadoParaIso?: string | null,
  ) {
    const q = await this.getOrThrow(tenantId, id);
    if (q.status !== 'PUBLICADO') throw new ConflictException('Publique o questionário antes de enviar.');
    if (!Array.isArray(familiaIds) || familiaIds.length === 0) {
      throw new BadRequestException('Selecione pelo menos uma família.');
    }
    const agendadoPara = this.validarAgendamento(agendadoParaIso);

    let familias = await this.prisma.preOcupacaoFamilia.findMany({
      where: { tenantId, id: { in: familiaIds } },
      select: { id: true, leadId: true },
    });
    let semCpf = 0;
    if (await this.exigeCpf(id)) {
      const comCpf = await this.leadsComCpf(tenantId, familias.map((f) => f.leadId));
      semCpf = familias.filter((f) => !comCpf.has(f.leadId)).length;
      familias = familias.filter((f) => comCpf.has(f.leadId));
    }
    const existentes = await this.prisma.preOcupacaoQuestionarioEnvio.findMany({
      where: { questionarioId: id, familiaId: { in: familias.map((f) => f.id) } },
      select: { familiaId: true },
    });
    const jaTem = new Set(existentes.map((e) => e.familiaId));
    const novas = familias.filter((f) => !jaTem.has(f.id));

    if (novas.length > 0) {
      await this.prisma.preOcupacaoQuestionarioEnvio.createMany({
        data: novas.map((f) => ({
          tenantId,
          questionarioId: id,
          familiaId: f.id,
          enviadoPor: enviadoPor || 'desconhecido',
          agendadoPara,
        })),
        skipDuplicates: true,
      });
      if (!agendadoPara) await this.envioWorker.enfileirar();
    }

    this.logger.log(
      `Questionário na fila: questionario=${id} novos=${novas.length} ignorados=${jaTem.size}` +
        (agendadoPara ? ` agendadoPara=${agendadoPara.toISOString()}` : ''),
    );
    await this.audit.log({
      tenantId,
      action: 'PRE_OCUPACAO_QUESTIONARIO_ENVIADO',
      resourceType: 'PreOcupacaoQuestionario',
      resourceId: id,
      metadata: { enfileirados: novas.length, jaRecebidos: jaTem.size, enviadoPor, agendadoPara },
    });
    return { enfileirados: novas.length, jaRecebidos: jaTem.size, semCpf, agendadoPara };
  }

  /**
   * Cancela envios agendados que ainda não saíram — um (`envioId`) ou todos do
   * questionário. A família volta a "ainda não recebeu" e pode ser
   * selecionada de novo na aba Envio.
   */
  async cancelarAgendamento(tenantId: string, id: string, envioId: string | undefined, canceladoPor: string) {
    await this.getOrThrow(tenantId, id);
    const { count } = await this.prisma.preOcupacaoQuestionarioEnvio.deleteMany({
      where: {
        tenantId,
        questionarioId: id,
        ...(envioId ? { id: envioId } : {}),
        statusEnvio: 'PENDENTE',
        enviosCount: 0,
        agendadoPara: { gt: new Date() },
      },
    });
    if (envioId && count === 0) {
      throw new ConflictException('Este envio não está mais agendado (pode já ter saído).');
    }
    await this.audit.log({
      tenantId,
      action: 'PRE_OCUPACAO_QUESTIONARIO_AGENDAMENTO_CANCELADO',
      resourceType: 'PreOcupacaoQuestionario',
      resourceId: id,
      metadata: { cancelados: count, envioId: envioId ?? null, canceladoPor },
    });
    return { cancelados: count };
  }

  /** Reenvia na hora (gera token novo, o anterior deixa de valer). */
  async reenviar(tenantId: string, id: string, envioId: string) {
    const q = await this.getOrThrow(tenantId, id);
    if (q.status !== 'PUBLICADO') throw new ConflictException('Só é possível reenviar um questionário publicado.');
    const envio = await this.prisma.preOcupacaoQuestionarioEnvio.findFirst({
      where: { id: envioId, questionarioId: id, tenantId },
    });
    if (!envio) throw new NotFoundException('Envio não encontrado.');
    if (envio.respondidoEm) throw new ConflictException('Esta família já respondeu.');
    if (envio.statusEnvio === 'PENDENTE' && envio.agendadoPara && envio.agendadoPara > new Date()) {
      throw new ConflictException('Este envio está agendado. Cancele o agendamento para enviar agora.');
    }
    return this.envioService.enviarUm(envio.id);
  }

  /** Coloca de volta na fila todos que ainda não responderam. */
  async reenviarNaoRespondidos(tenantId: string, id: string) {
    const q = await this.getOrThrow(tenantId, id);
    if (q.status !== 'PUBLICADO') throw new ConflictException('Só é possível reenviar um questionário publicado.');
    const { count } = await this.prisma.preOcupacaoQuestionarioEnvio.updateMany({
      // PENDENTE fica de fora: já está na fila ou agendado (agendamento não é antecipado)
      where: { questionarioId: id, tenantId, respondidoEm: null, statusEnvio: { not: 'PENDENTE' } },
      data: { statusEnvio: 'PENDENTE', agendadoPara: null },
    });
    if (count > 0) await this.envioWorker.enfileirar();
    return { enfileirados: count };
  }

  // ─── Acompanhamento ─────────────────────────────────────────────────────

  /** Opções marcadas com `alerta` (ex.: pedido de sigilo) que a família escolheu. */
  private alertasPorEnvio(
    perguntas: { id: string; opcoes: unknown }[],
    respostas: { envioId: string; perguntaId: string; valorOpcoes: string[] }[],
  ) {
    const alertaPorPergunta = new Map<string, Map<string, string>>();
    for (const p of perguntas) {
      const m = new Map(opcoesDe(p).filter((o) => o.alerta).map((o) => [o.label, o.alerta as string]));
      if (m.size) alertaPorPergunta.set(p.id, m);
    }
    const porEnvio = new Map<string, string[]>();
    for (const r of respostas) {
      const m = alertaPorPergunta.get(r.perguntaId);
      if (!m) continue;
      for (const o of r.valorOpcoes) {
        const alerta = m.get(o);
        if (!alerta) continue;
        const lista = porEnvio.get(r.envioId) ?? [];
        if (!lista.includes(alerta)) lista.push(alerta);
        porEnvio.set(r.envioId, lista);
      }
    }
    return porEnvio;
  }

  async acompanhamento(tenantId: string, id: string) {
    await this.getOrThrow(tenantId, id);
    const [envios, perguntas] = await Promise.all([
      this.prisma.preOcupacaoQuestionarioEnvio.findMany({
        where: { questionarioId: id, tenantId },
        include: {
          familia: { include: { lead: { select: { nome: true, nomeCorreto: true, telefone: true } } } },
          _count: { select: { respostas: true } },
        },
        orderBy: { familia: { numero: 'asc' } },
      }),
      this.prisma.preOcupacaoQuestionarioPergunta.findMany({ where: { questionarioId: id }, select: { id: true, opcoes: true } }),
    ]);
    const comAlerta = perguntas.filter((p) => opcoesDe(p).some((o) => o.alerta)).map((p) => p.id);
    const respostasAlerta = comAlerta.length
      ? await this.prisma.preOcupacaoQuestionarioResposta.findMany({
          where: { perguntaId: { in: comAlerta }, envio: { questionarioId: id } },
          select: { envioId: true, perguntaId: true, valorOpcoes: true },
        })
      : [];
    const alertas = this.alertasPorEnvio(perguntas, respostasAlerta);

    const linhas = envios.map((e) => ({
      envioId: e.id,
      familiaId: e.familiaId,
      numero: e.familia.numero,
      nome: e.familia.lead.nomeCorreto ?? e.familia.lead.nome,
      telefone: e.familia.lead.telefone,
      situacao: situacaoEnvio(e),
      agendadoPara: e.agendadoPara,
      enviadoEm: e.enviadoEm,
      linkAbertoEm: e.linkAbertoEm,
      iniciadoEm: e.iniciadoEm,
      respondidoEm: e.respondidoEm,
      respostasSalvas: e._count.respostas,
      enviosCount: e.enviosCount,
      ultimoEnvioErro: e.ultimoEnvioErro,
      tokenExpiraEm: e.tokenExpiraEm,
      alertas: alertas.get(e.id) ?? [],
    }));

    const contar = (s: string) => linhas.filter((l) => l.situacao === s).length;
    return {
      totais: {
        total: linhas.length,
        agendado: contar('AGENDADO'),
        aguardandoEnvio: contar('AGUARDANDO_ENVIO'),
        falha: contar('FALHA'),
        recebeu: contar('RECEBEU'),
        abriu: contar('ABRIU'),
        respondendo: contar('RESPONDENDO'),
        respondeu: contar('RESPONDEU'),
        alertas: linhas.filter((l) => l.alertas.length).length,
      },
      linhas,
    };
  }

  // ─── Relatórios ─────────────────────────────────────────────────────────

  /** "Morador 2" para respostas de grupos que repetem; null fora de grupo. */
  private rotuloInstancia(qConfig: unknown, p: { config: unknown }, instancia: number): string | null {
    const grupo = (p.config as PerguntaConfig | null)?.grupo;
    if (!grupo) return null;
    const g = ((qConfig ?? {}) as QuestionarioConfig).grupos?.[grupo];
    return `${g?.rotulo ?? 'Item'} ${instancia + 1}`;
  }

  async relatorio(tenantId: string, id: string) {
    const q = await this.detalhe(tenantId, id);
    const envios = await this.prisma.preOcupacaoQuestionarioEnvio.findMany({
      where: { questionarioId: id, tenantId },
      include: {
        familia: { include: { lead: { select: { nome: true, nomeCorreto: true } } } },
        respostas: true,
      },
      orderBy: { familia: { numero: 'asc' } },
    });
    const respondidos = envios.filter((e) => e.respondidoEm);
    // Rótulo de cada resposta repetida, com o nome da pessoa ("Morador 2 de 3 · João")
    const rotulos = new Map<string, string | null>();
    for (const e of respondidos) {
      for (const s of montarPassos(q.perguntas, q.config, e.respostas)) {
        rotulos.set(`${e.id}#${s.perguntaId}#${s.instancia}`, s.rotuloGrupo);
      }
    }
    const rotuloDe = (envioId: string, perguntaId: string, instancia: number, p: { config: unknown }) =>
      rotulos.get(`${envioId}#${perguntaId}#${instancia}`) ?? this.rotuloInstancia(q.config, p, instancia);
    const arred = (n: number) => Math.round(n * 100) / 100;
    const pct = (parte: number, todo: number) => (todo ? Math.round((parte / todo) * 1000) / 10 : 0);
    const estat = (nums: number[]) => ({
      media: nums.length ? arred(nums.reduce((a, b) => a + b, 0) / nums.length) : null,
      soma: arred(nums.reduce((a, b) => a + b, 0)),
      minimo: nums.length ? Math.min(...nums) : null,
      maximo: nums.length ? Math.max(...nums) : null,
    });

    const perguntas = q.perguntas
      .filter((p) => p.tipo !== 'INFO')
      .map((p) => {
        const cfg = (p.config ?? {}) as PerguntaConfig;
        const respostas = respondidos.flatMap((e) =>
          e.respostas
            .filter((r) => r.perguntaId === p.id)
            .map((r) => ({
              ...r,
              familiaNumero: e.familia.numero,
              familiaNome: e.familia.lead.nomeCorreto ?? e.familia.lead.nome,
              rotulo: rotuloDe(e.id, p.id, r.instancia, p),
            })),
        );
        const familias = new Set(respostas.map((r) => r.envioId)).size;
        const base = {
          id: p.id,
          ordem: p.ordem,
          enunciado: preencherTexto(p.enunciado),
          tipo: p.tipo,
          secao: cfg.secao ?? null,
          porPessoa: !!cfg.grupo,
          obrigatoria: p.obrigatoria,
          totalRespostas: respostas.length,
          familias,
        };
        const lista = (valor: (r: (typeof respostas)[number]) => string) =>
          respostas
            .map((r) => ({ familiaNumero: r.familiaNumero, familiaNome: r.familiaNome, rotulo: r.rotulo, valor: valor(r) }))
            .filter((x) => x.valor);

        // "Quais moradores...": conta famílias com pelo menos 1 pessoa e o total de pessoas
        if (cfg.opcoesDinamicas) {
          const comAlguem = respostas.filter((r) => r.valorOpcoes.length > 0);
          return {
            ...base,
            pessoasTotal: comAlguem.reduce((acc, r) => acc + r.valorOpcoes.length, 0),
            familiasComAlguem: new Set(comAlguem.map((r) => r.envioId)).size,
            respostas: lista((r) => r.valorOpcoes.join(', ')),
          };
        }
        if (['ESCOLHA_UNICA', 'ESCOLHA_MULTIPLA', 'ACEITE'].includes(p.tipo)) {
          return {
            ...base,
            opcoes: opcoesDe(p).map((o) => {
              const marcaram = respostas.filter((r) => r.valorOpcoes.includes(o.label));
              const comp = marcaram
                .map((r) => ({ r, v: ((r.extras ?? {}) as Record<string, string | number>)[o.label] }))
                .filter((x) => x.v !== undefined && x.v !== '');
              return {
                opcao: o.label,
                total: marcaram.length,
                percentual: pct(marcaram.length, respostas.length),
                ...(o.complemento === 'VALOR'
                  ? { valores: estat(comp.map((x) => Number(x.v))) }
                  : o.complemento === 'TEXTO'
                    ? {
                        textos: comp.map((x) => ({
                          familiaNumero: x.r.familiaNumero,
                          familiaNome: x.r.familiaNome,
                          rotulo: x.r.rotulo,
                          valor: String(x.v),
                        })),
                      }
                    : {}),
              };
            }),
          };
        }
        if (['ESCALA', 'NUMERO', 'CONTADOR', 'MOEDA'].includes(p.tipo)) {
          const nums = respostas.map((r) => r.valorNumero).filter((n): n is number => n !== null);
          return {
            ...base,
            unidade: p.tipo === 'MOEDA' ? 'R$' : (cfg.unidade ?? null),
            ...estat(nums),
            ...(p.tipo === 'ESCALA'
              ? {
                  distribuicao: Array.from({ length: (p.escalaMax ?? 5) - (p.escalaMin ?? 1) + 1 }, (_, i) => {
                    const nota = (p.escalaMin ?? 1) + i;
                    return { nota, total: nums.filter((n) => n === nota).length };
                  }),
                }
              : {}),
          };
        }
        if (p.tipo === 'CAMPOS') {
          return {
            ...base,
            campos: (cfg.campos ?? []).map((c) => {
              const valores = respostas
                .map((r) => ({ r, v: ((r.extras ?? {}) as Record<string, string | number>)[c.chave] }))
                .filter((x) => x.v !== undefined && x.v !== '');
              return c.tipo === 'CONTADOR'
                ? { chave: c.chave, label: c.label, tipo: c.tipo, ...estat(valores.map((x) => Number(x.v))) }
                : {
                    chave: c.chave,
                    label: c.label,
                    tipo: c.tipo,
                    respostas: valores.map((x) => ({
                      familiaNumero: x.r.familiaNumero,
                      familiaNome: x.r.familiaNome,
                      rotulo: x.r.rotulo,
                      valor: String(x.v),
                    })),
                  };
            }),
          };
        }
        return { ...base, respostas: lista((r) => respostaParaTexto(p, r)) };
      });

    // Uma linha por família que respondeu, uma coluna por pergunta (para CSV/tabela).
    // Perguntas por pessoa juntam as respostas: "Morador 1: x | Morador 2: y".
    const porFamilia = respondidos.map((e) => ({
      envioId: e.id,
      numero: e.familia.numero,
      nome: e.familia.lead.nomeCorreto ?? e.familia.lead.nome,
      respondidoEm: e.respondidoEm,
      respostas: Object.fromEntries(
        perguntas.map((pr) => {
          const p = q.perguntas.find((x) => x.id === pr.id)!;
          const rs = e.respostas.filter((x) => x.perguntaId === p.id).sort((a, b) => a.instancia - b.instancia);
          const textos = rs
            .map((r) => {
              const t = respostaParaTexto(p, r);
              const rot = rotuloDe(e.id, p.id, r.instancia, p);
              return rot && t ? `${rot}: ${t}` : t;
            })
            .filter(Boolean);
          return [p.id, textos.join(' | ')];
        }),
      ),
    }));

    return {
      questionario: { id: q.id, titulo: q.titulo, status: q.status },
      totalEnvios: envios.length,
      totalRespondidos: respondidos.length,
      perguntas,
      porFamilia,
    };
  }

  async respostasDoEnvio(tenantId: string, id: string, envioId: string) {
    const q = await this.detalhe(tenantId, id);
    const envio = await this.prisma.preOcupacaoQuestionarioEnvio.findFirst({
      where: { id: envioId, questionarioId: id, tenantId },
      include: { familia: { include: { lead: { select: { nome: true, nomeCorreto: true, telefone: true } } } }, respostas: true },
    });
    if (!envio) throw new NotFoundException('Envio não encontrado.');
    const porId = new Map(q.perguntas.map((p) => [p.id, p]));
    const idx = indexarRespostas(envio.respostas);
    const passos = montarPassos(q.perguntas, q.config, envio.respostas).filter((s) => porId.get(s.perguntaId)!.tipo !== 'INFO');
    const alertas = this.alertasPorEnvio(q.perguntas, envio.respostas.map((r) => ({ ...r, envioId: envio.id })));
    return {
      questionario: { id: q.id, titulo: q.titulo },
      familia: { id: envio.familiaId, numero: envio.familia.numero, nome: envio.familia.lead.nomeCorreto ?? envio.familia.lead.nome },
      situacao: situacaoEnvio(envio),
      respondidoEm: envio.respondidoEm,
      alertas: alertas.get(envio.id) ?? [],
      respostas: passos.map((s) => {
        const p = porId.get(s.perguntaId)!;
        const r = idx.get(`${s.perguntaId}#${s.instancia}`) as (typeof envio.respostas)[number] | undefined;
        return {
          perguntaId: p.id,
          instancia: s.instancia,
          ordem: p.ordem,
          secao: ((p.config ?? {}) as PerguntaConfig).secao ?? null,
          rotuloGrupo: s.rotuloGrupo,
          enunciado: preencherTexto(p.enunciado, {
            pessoa: s.pessoa,
            instancia: s.instancia,
            nome: envio.familia.lead.nomeCorreto ?? envio.familia.lead.nome,
            telefone: envio.familia.lead.telefone,
          }),
          valor: r ? respostaParaTexto(p, r) : '',
        };
      }),
    };
  }

  /** Questionários de uma família (seção na página da família). */
  async porFamilia(tenantId: string, familiaId: string) {
    const envios = await this.prisma.preOcupacaoQuestionarioEnvio.findMany({
      where: { tenantId, familiaId },
      include: { questionario: { select: { id: true, titulo: true, status: true } } },
      orderBy: { criadoEm: 'desc' },
    });
    return envios.map((e) => ({
      envioId: e.id,
      questionario: e.questionario,
      situacao: situacaoEnvio(e),
      agendadoPara: e.agendadoPara,
      enviadoEm: e.enviadoEm,
      respondidoEm: e.respondidoEm,
    }));
  }
}
