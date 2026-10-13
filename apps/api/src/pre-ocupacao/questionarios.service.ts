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
  respostaParaTexto,
  situacaoEnvio,
} from './questionario-pergunta.util';

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

    const [envios, leads] = await Promise.all([
      this.prisma.preOcupacaoQuestionarioEnvio.findMany({
        where: { questionarioId: id },
        select: { familiaId: true, statusEnvio: true, agendadoPara: true, linkAbertoEm: true, respondidoEm: true },
      }),
      this.prisma.lead.findMany({
        where: { tenantId, id: { in: filtradas.map((f) => f.leadId) } },
        select: { id: true, telefone: true },
      }),
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
      vaoReceber: familias.filter((f) => !f.situacao && !f.semTelefone).length,
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

    const familias = await this.prisma.preOcupacaoFamilia.findMany({
      where: { tenantId, id: { in: familiaIds } },
      select: { id: true },
    });
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
    return { enfileirados: novas.length, jaRecebidos: jaTem.size, agendadoPara };
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

  async acompanhamento(tenantId: string, id: string) {
    await this.getOrThrow(tenantId, id);
    const envios = await this.prisma.preOcupacaoQuestionarioEnvio.findMany({
      where: { questionarioId: id, tenantId },
      include: { familia: { include: { lead: { select: { nome: true, nomeCorreto: true, telefone: true } } } } },
      orderBy: { familia: { numero: 'asc' } },
    });

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
      respondidoEm: e.respondidoEm,
      enviosCount: e.enviosCount,
      ultimoEnvioErro: e.ultimoEnvioErro,
      tokenExpiraEm: e.tokenExpiraEm,
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
        respondeu: contar('RESPONDEU'),
      },
      linhas,
    };
  }

  // ─── Relatórios ─────────────────────────────────────────────────────────

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

    const perguntas = q.perguntas.map((p) => {
      const respostas = respondidos.flatMap((e) =>
        e.respostas
          .filter((r) => r.perguntaId === p.id)
          .map((r) => ({ ...r, familiaNumero: e.familia.numero, familiaNome: e.familia.lead.nomeCorreto ?? e.familia.lead.nome })),
      );
      const base = {
        id: p.id,
        ordem: p.ordem,
        enunciado: p.enunciado,
        tipo: p.tipo,
        obrigatoria: p.obrigatoria,
        totalRespostas: respostas.length,
        emBranco: respondidos.length - respostas.length,
      };

      if (p.tipo === 'ESCOLHA_UNICA' || p.tipo === 'ESCOLHA_MULTIPLA') {
        const opcoes = Array.isArray(p.opcoes) ? (p.opcoes as string[]) : [];
        return {
          ...base,
          opcoes: opcoes.map((opcao) => {
            const total = respostas.filter((r) => r.valorOpcoes.includes(opcao)).length;
            return { opcao, total, percentual: respostas.length ? Math.round((total / respostas.length) * 1000) / 10 : 0 };
          }),
        };
      }
      if (p.tipo === 'ESCALA' || p.tipo === 'NUMERO') {
        const nums = respostas.map((r) => r.valorNumero).filter((n): n is number => n !== null);
        const media = nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : null;
        const extra =
          p.tipo === 'ESCALA'
            ? {
                distribuicao: Array.from({ length: (p.escalaMax ?? 5) - (p.escalaMin ?? 1) + 1 }, (_, i) => {
                  const nota = (p.escalaMin ?? 1) + i;
                  return { nota, total: nums.filter((n) => n === nota).length };
                }),
              }
            : {};
        return {
          ...base,
          media,
          minimo: nums.length ? Math.min(...nums) : null,
          maximo: nums.length ? Math.max(...nums) : null,
          ...extra,
        };
      }
      return {
        ...base,
        respostas: respostas.map((r) => ({
          familiaNumero: r.familiaNumero,
          familiaNome: r.familiaNome,
          valor: respostaParaTexto(p.tipo, r),
        })),
      };
    });

    // Uma linha por família que respondeu, uma coluna por pergunta (para CSV/tabela)
    const porFamilia = respondidos.map((e) => ({
      envioId: e.id,
      numero: e.familia.numero,
      nome: e.familia.lead.nomeCorreto ?? e.familia.lead.nome,
      respondidoEm: e.respondidoEm,
      respostas: Object.fromEntries(
        q.perguntas.map((p) => {
          const r = e.respostas.find((x) => x.perguntaId === p.id);
          return [p.id, r ? respostaParaTexto(p.tipo, r) : ''];
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
      include: { familia: { include: { lead: { select: { nome: true, nomeCorreto: true } } } }, respostas: true },
    });
    if (!envio) throw new NotFoundException('Envio não encontrado.');
    return {
      questionario: { id: q.id, titulo: q.titulo },
      familia: { id: envio.familiaId, numero: envio.familia.numero, nome: envio.familia.lead.nomeCorreto ?? envio.familia.lead.nome },
      situacao: situacaoEnvio(envio),
      respondidoEm: envio.respondidoEm,
      respostas: q.perguntas.map((p) => {
        const r = envio.respostas.find((x) => x.perguntaId === p.id);
        return { perguntaId: p.id, ordem: p.ordem, enunciado: p.enunciado, valor: r ? respostaParaTexto(p.tipo, r) : '' };
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
