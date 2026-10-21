import { BadRequestException, ConflictException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Logger } from '../../logger';
import { PrismaService } from '../../prisma/prisma.service';
import type { LeadsService } from '../../leads/leads.service';
import { hashConviteToken } from '../pre-ocupacao-convite-token.util';
import { validarValor } from '../questionario-pergunta.util';
import { PerguntaConfig, indexarRespostas, montarPassos, opcoesDe, opcoesDinamicas, respostaPreenchida } from '../questionario-fluxo';
import { DemandasService } from '../demandas.service';

/** CPF que não confere: a família precisa falar com a equipe para verificar o cadastro. */
const CPF_NAO_CONFIRMADO =
  'Não conseguimos confirmar este CPF no cadastro da sua família. ' +
  'Por favor, fale com a nossa equipe para verificarmos o seu cadastro: é só responder a mensagem do WhatsApp em que você recebeu este link.';

/**
 * Resposta pública do questionário (link mágico enviado por WhatsApp, sem
 * login). Cada tela é salva na hora (`salvar`) — a família pode fechar e
 * continuar depois pelo mesmo link. `concluir` confere as obrigatórias com o
 * fluxo completo e fecha a resposta.
 */
@Injectable()
export class QuestionarioPublicoService {
  private readonly logger = new Logger('PreOcupacaoQuestionarioPublicoService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
    private readonly demandas: DemandasService,
  ) {}

  /** Mesmo motivo do `ConviteService`: evita puxar o Baileys (ESM) no Jest. */
  private async getLeadsService(): Promise<LeadsService> {
    const { LeadsService: LeadsServiceClass } = await import('../../leads/leads.service.js');
    return this.moduleRef.get(LeadsServiceClass, { strict: false });
  }

  private async buscarEnvio(token: string) {
    const envio = await this.prisma.preOcupacaoQuestionarioEnvio.findFirst({
      where: { tokenHash: hashConviteToken(token) },
      include: {
        questionario: { include: { perguntas: { orderBy: { ordem: 'asc' } } } },
        familia: { include: { lead: { select: { nome: true, nomeCorreto: true, telefone: true } } } },
        respostas: true,
      },
    });
    if (!envio) throw new NotFoundException('Questionário não encontrado.');
    return envio;
  }

  /** Link vencido ou questionário encerrado não aceita mais resposta. */
  private checarValidade(envio: { questionario: { status: string }; tokenExpiraEm: Date | null }) {
    if (envio.questionario.status !== 'PUBLICADO') {
      throw new GoneException('Este questionário foi encerrado. Fale com a equipe.');
    }
    if (!envio.tokenExpiraEm || envio.tokenExpiraEm < new Date()) {
      throw new GoneException('Este link não é mais válido. Fale com a equipe.');
    }
  }

  private respostaPublica(r: { perguntaId: string; instancia: number; valorTexto: string | null; valorNumero: number | null; valorData: Date | null; valorOpcoes: string[]; extras: unknown }) {
    return {
      perguntaId: r.perguntaId,
      instancia: r.instancia,
      valorTexto: r.valorTexto,
      valorNumero: r.valorNumero,
      valorData: r.valorData ? r.valorData.toISOString().slice(0, 10) : null,
      valorOpcoes: r.valorOpcoes,
      extras: r.extras ?? null,
    };
  }

  /**
   * Confere o CPF digitado com o cadastro da família: titular do lead ou um
   * participante (cônjuge, sócio...). Serve para proteger o link caso a
   * mensagem seja encaminhada a outra pessoa — por isso só aceita CPF que JÁ
   * está cadastrado (nunca grava CPF novo) e nunca revela dados de outro
   * cadastro: só "confere" ou "não confere".
   */
  private async conferirCpf(token: string, cpfDigitado: string) {
    const cpf = String(cpfDigitado ?? '').replace(/\D/g, '');
    if (cpf.length !== 11) throw new BadRequestException('Digite os 11 números do CPF.');

    const envio = await this.prisma.preOcupacaoQuestionarioEnvio.findFirst({
      where: { tokenHash: hashConviteToken(token) },
      select: {
        respondidoEm: true,
        tokenExpiraEm: true,
        questionario: { select: { status: true } },
        familia: {
          select: {
            lead: { select: { cpf: true, nome: true, nomeCorreto: true, participantes: { select: { cpf: true } } } },
          },
        },
      },
    });
    if (!envio) throw new NotFoundException('Questionário não encontrado.');
    if (envio.respondidoEm) throw new ConflictException('Você já respondeu este questionário. Obrigado!');
    this.checarValidade(envio);

    const lead = envio.familia.lead;
    const so = (v: string | null | undefined) => String(v ?? '').replace(/\D/g, '');
    const cadastrados = [so(lead.cpf), ...(lead.participantes ?? []).map((p) => so(p.cpf))].filter(Boolean);
    if (cadastrados.includes(cpf)) return { encontrado: true as const, nome: lead.nomeCorreto ?? lead.nome };

    // Sem CPF no cadastro ou CPF diferente: mesma orientação (e não revela qual caso é)
    throw new BadRequestException(CPF_NAO_CONFIRMADO);
  }

  /** Conferência ao digitar (não grava nada). */
  async verificarCpf(token: string, cpf: string) {
    return this.conferirCpf(token, cpf);
  }

  async buscar(token: string) {
    const envio = await this.buscarEnvio(token);
    const lead = envio.familia.lead;
    const nome = lead.nomeCorreto ?? lead.nome;
    // Quem já respondeu vê o aviso de "já respondido", mesmo com link vencido.
    if (envio.respondidoEm) {
      return { nome, titulo: envio.questionario.titulo, jaRespondido: true as const, respondidoEm: envio.respondidoEm };
    }
    this.checarValidade(envio);

    if (!envio.linkAbertoEm) {
      await this.prisma.preOcupacaoQuestionarioEnvio
        .update({ where: { id: envio.id }, data: { linkAbertoEm: new Date() } })
        .catch((e: any) => this.logger.warn(`Falha ao registrar abertura do link: envio=${envio.id} erro=${e?.message}`));
    }

    return {
      nome,
      titulo: envio.questionario.titulo,
      descricao: envio.questionario.descricao,
      config: envio.questionario.config ?? null,
      jaRespondido: false as const,
      prefill: { NOME: nome, TELEFONE: lead.telefone ?? null },
      perguntas: envio.questionario.perguntas.map((p) => ({
        id: p.id,
        chave: p.chave,
        enunciado: p.enunciado,
        tipo: p.tipo,
        opcoes: Array.isArray(p.opcoes) ? p.opcoes : null,
        escalaMin: p.escalaMin,
        escalaMax: p.escalaMax,
        obrigatoria: p.obrigatoria,
        config: p.config ?? null,
      })),
      respostas: envio.respostas.map((r) => this.respostaPublica(r)),
    };
  }

  /** Salva (ou apaga, se veio em branco) a resposta de uma tela. */
  async salvar(token: string, body: { perguntaId?: string; instancia?: number; valor?: unknown; extras?: unknown }) {
    // Consulta enxuta (chamada a cada tela): só o envio e a pergunta da vez
    const envio = await this.prisma.preOcupacaoQuestionarioEnvio.findFirst({
      where: { tokenHash: hashConviteToken(token) },
      select: {
        id: true,
        respondidoEm: true,
        iniciadoEm: true,
        tokenExpiraEm: true,
        questionarioId: true,
        questionario: { select: { status: true } },
      },
    });
    if (!envio) throw new NotFoundException('Questionário não encontrado.');
    if (envio.respondidoEm) throw new ConflictException('Você já respondeu este questionário. Obrigado!');
    this.checarValidade(envio);

    const pergunta =
      typeof body?.perguntaId === 'string'
        ? await this.prisma.preOcupacaoQuestionarioPergunta.findFirst({
            where: { id: body.perguntaId, questionarioId: envio.questionarioId },
          })
        : null;
    if (!pergunta) throw new BadRequestException('Pergunta inválida.');
    const idx = pergunta.ordem - 1;
    const instancia = Number.isInteger(body.instancia) ? (body.instancia as number) : 0;
    if (instancia < 0 || instancia > 30) throw new BadRequestException('Pergunta inválida.');
    if (instancia > 0 && !(pergunta.config as PerguntaConfig | null)?.grupo) throw new BadRequestException('Pergunta inválida.');

    // Opções com os nomes dos moradores: monta a lista a partir do que já foi respondido
    let perguntaValidar: typeof pergunta = pergunta;
    if ((pergunta.config as PerguntaConfig | null)?.opcoesDinamicas) {
      const [todas, q, salvas] = await Promise.all([
        this.prisma.preOcupacaoQuestionarioPergunta.findMany({ where: { questionarioId: envio.questionarioId }, orderBy: { ordem: 'asc' } }),
        this.prisma.preOcupacaoQuestionario.findUnique({ where: { id: envio.questionarioId }, select: { config: true } }),
        this.prisma.preOcupacaoQuestionarioResposta.findMany({ where: { envioId: envio.id } }),
      ]);
      perguntaValidar = { ...pergunta, opcoes: opcoesDinamicas(pergunta, todas, q?.config, salvas) as any };
    }
    const r = validarValor(perguntaValidar, body.valor, body.extras, idx + 1);
    // CPF só é aceito se conferir com o cadastro da família
    const cadastro = pergunta.tipo === 'CPF' && r ? await this.conferirCpf(token, r.valorTexto ?? '') : null;
    const where = { envioId_perguntaId_instancia: { envioId: envio.id, perguntaId: pergunta.id, instancia } };

    if (!r) {
      await this.prisma.preOcupacaoQuestionarioResposta.deleteMany({
        where: { envioId: envio.id, perguntaId: pergunta.id, instancia },
      });
    } else {
      const dados = {
        valorTexto: r.valorTexto,
        valorNumero: r.valorNumero,
        valorData: r.valorData,
        valorOpcoes: r.valorOpcoes,
        extras: (r.extras ?? undefined) as any,
      };
      await this.prisma.preOcupacaoQuestionarioResposta.upsert({
        where,
        create: { envioId: envio.id, perguntaId: pergunta.id, instancia, ...dados },
        update: { ...dados, extras: (r.extras ?? null) as any },
      });
    }
    if (!envio.iniciadoEm) {
      await this.prisma.preOcupacaoQuestionarioEnvio.update({ where: { id: envio.id }, data: { iniciadoEm: new Date() } });
    }
    return { ok: true, ...(cadastro ? { cadastro } : {}) };
  }

  async concluir(token: string) {
    const envio = await this.buscarEnvio(token);
    if (envio.respondidoEm) throw new ConflictException('Você já respondeu este questionário. Obrigado!');
    this.checarValidade(envio);

    const perguntas = envio.questionario.perguntas;
    const passos = montarPassos(perguntas, envio.questionario.config, envio.respostas);
    const idx = indexarRespostas(envio.respostas);
    const porId = new Map(perguntas.map((p) => [p.id, p]));

    const faltando = passos.filter((s) => {
      const p = porId.get(s.perguntaId)!;
      return p.obrigatoria && !respostaPreenchida(p, idx.get(`${s.perguntaId}#${s.instancia}`));
    });
    if (faltando.length) {
      // A tela volta para a primeira pergunta pendente
      throw new BadRequestException({
        message: `Faltam ${faltando.length} pergunta(s) obrigatória(s).`,
        faltando: faltando.map((s) => ({ perguntaId: s.perguntaId, instancia: s.instancia })),
      });
    }

    // Respostas de perguntas que deixaram de aparecer (mudou uma resposta
    // anterior, diminuiu o número de moradores) saem do registro final.
    const visiveis = new Set(passos.map((s) => `${s.perguntaId}#${s.instancia}`));
    const orfas = envio.respostas.filter((r) => !visiveis.has(`${r.perguntaId}#${r.instancia}`)).map((r) => r.id);

    const respondidoEm = new Date();
    await this.prisma.$transaction(async (tx) => {
      // Guarda contra envio duplo (dois cliques / duas abas)
      const { count } = await tx.preOcupacaoQuestionarioEnvio.updateMany({
        where: { id: envio.id, respondidoEm: null },
        data: { respondidoEm },
      });
      if (count === 0) throw new ConflictException('Você já respondeu este questionário. Obrigado!');
      if (orfas.length) await tx.preOcupacaoQuestionarioResposta.deleteMany({ where: { id: { in: orfas } } });
    });
    this.logger.log(`Questionário respondido: envio=${envio.id} questionario=${envio.questionarioId} descartadas=${orfas.length}`);

    // Pedido de sigilo / atendimento reservado: abre demanda para um analista avaliar
    const visiveisFinais = envio.respostas.filter((r) => visiveis.has(`${r.perguntaId}#${r.instancia}`));
    const alertas: string[] = [];
    for (const r of visiveisFinais) {
      const p = porId.get(r.perguntaId);
      if (!p) continue;
      for (const o of opcoesDe(p)) if (o.alerta && r.valorOpcoes.includes(o.label) && !alertas.includes(o.alerta)) alertas.push(o.alerta);
    }
    if (alertas.length) {
      try {
        const d = await this.demandas.criar(
          envio.tenantId,
          {
            familiaId: envio.familiaId,
            tipo: 'OUTRO',
            tituloPersonalizado: `Questionário: ${alertas.join(' e ')}`,
            origem: 'QUESTIONARIO',
            observacoes:
              `Aberta automaticamente pelo questionário "${envio.questionario.titulo}".
` +
              `A família sinalizou: ${alertas.join('; ')}.
` +
              'Um analista deve entrar em contato, entender o caso e só depois encerrar esta demanda.',
          },
          'Questionário Pré-Ocupação',
        );
        this.logger.log(`Demanda aberta por alerta do questionário: envio=${envio.id} demanda=${d.id}`);
      } catch (e: any) {
        this.logger.error(`Falha ao abrir demanda do questionário: envio=${envio.id} erro=${e?.message || e}`);
      }
    }

    // Agradecimento por WhatsApp. Falha aqui não desfaz a resposta já gravada.
    const nome = envio.familia.lead.nomeCorreto ?? envio.familia.lead.nome;
    try {
      const leadsService = await this.getLeadsService();
      await leadsService.sendWhatsappMessage(
        { tenantId: envio.tenantId, nome: 'Questionário Pré-Ocupação' },
        envio.familia.leadId,
        { message: `Obrigado, ${nome}! Recebemos suas respostas do questionário "${envio.questionario.titulo}".` },
      );
    } catch (e: any) {
      this.logger.warn(`Falha ao enviar agradecimento do questionário: envio=${envio.id} erro=${e?.message || e}`);
    }

    return { ok: true, respondidoEm };
  }
}
