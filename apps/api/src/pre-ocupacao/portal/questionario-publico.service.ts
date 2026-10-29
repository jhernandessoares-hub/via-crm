import { BadRequestException, ConflictException, ForbiddenException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Logger } from '../../logger';
import { PrismaService } from '../../prisma/prisma.service';
import type { LeadsService } from '../../leads/leads.service';
import { chaveAcessoQuestionarioValida, gerarChaveAcessoQuestionario, hashConviteToken } from '../pre-ocupacao-convite-token.util';
import { INTERVALO_NOVA_ABERTURA_MS, registrarEventoEnvio } from '../questionario-evento.util';
import { validarValor } from '../questionario-pergunta.util';
import { PerguntaConfig, indexarRespostas, montarPassos, opcoesDe, opcoesDinamicas, respostaPreenchida } from '../questionario-fluxo';
import { DemandasService } from '../demandas.service';
import { QuestionarioEnvioService } from '../questionario-envio.service';
import { alertasNovos, mensagemObrigado } from '../questionario-correcao.util';
import { conferirCpfDaFamilia, pessoaDoCpf, soDigitos } from './questionario-cpf.util';

/** CPF que não confere: a família precisa falar com a equipe para verificar o cadastro. */
const CPF_NAO_CONFIRMADO =
  'Não conseguimos confirmar este CPF no cadastro da sua família. ' +
  'Por favor, fale com a nossa equipe para verificarmos o seu cadastro: é só responder a mensagem do WhatsApp em que você recebeu este link.';

/** Alguém da família já começou com outro CPF: um questionário por família, quem começou termina. */
const CPF_DE_OUTRA_PESSOA =
  'Este questionário já foi começado por outra pessoa da sua família. ' +
  'Para continuar, digite o mesmo CPF de quem começou a responder.';

/** Chamada sem chave de acesso (outro aparelho, chave vencida): a tela volta para o CPF. */
const CPF_NECESSARIO = 'Para continuar, digite de novo o CPF de quem começou a responder.';

/**
 * Ordem da primeira pergunta de CPF, ou null se o questionário não pede CPF.
 * Antes do CPF ficam só as telas de abertura (boas-vindas, LGPD): são as
 * únicas liberadas sem a chave de acesso.
 */
function ordemDoCpf(perguntas: { tipo: string; ordem: number }[]): number | null {
  const cpf = perguntas.filter((p) => p.tipo === 'CPF').sort((a, b) => a.ordem - b.ordem)[0];
  return cpf ? cpf.ordem : null;
}

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
    private readonly envios: QuestionarioEnvioService,
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
        familia: {
          include: {
            lead: {
              select: {
                nome: true,
                nomeCorreto: true,
                telefone: true,
                cpf: true,
                participantes: { select: { cpf: true, nome: true, telefone: true } },
              },
            },
          },
        },
        respostas: true,
      },
    });
    if (!envio) throw new NotFoundException('Questionário não encontrado.');
    return envio;
  }

  /** Link vencido ou questionário encerrado não aceita mais resposta. */
  private checarValidade(envio: { questionario: { status: string }; tokenExpiraEm: Date | null; teste?: boolean }) {
    // Teste vale em rascunho (é para conferir antes de publicar); envio real só publicado
    const aberto = envio.questionario.status === 'PUBLICADO' || (envio.teste && envio.questionario.status === 'RASCUNHO');
    if (!aberto) {
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
        teste: true,
        testeCpf: true,
        testeNome: true,
        questionario: { select: { status: true } },
        familia: {
          select: {
            lead: {
              select: {
                cpf: true,
                nome: true,
                nomeCorreto: true,
                telefone: true,
                participantes: { select: { cpf: true, nome: true, telefone: true } },
              },
            },
          },
        },
        // CPF de quem começou a responder (fica salvo como resposta da pergunta de CPF)
        respostas: { where: { pergunta: { tipo: 'CPF' } }, select: { valorTexto: true }, take: 1 },
      },
    });
    if (!envio) throw new NotFoundException('Questionário não encontrado.');
    if (envio.respondidoEm) throw new ConflictException('Você já respondeu este questionário. Obrigado!');
    this.checarValidade(envio);

    if (envio.teste) {
      if (soDigitos(envio.testeCpf) === cpf) return { encontrado: true as const, nome: envio.testeNome ?? 'Teste' };
      throw new BadRequestException(CPF_NAO_CONFIRMADO);
    }
    const lead = envio.familia!.lead;
    // Qualquer pessoa do cadastro do lead pode responder, mas é um questionário por família:
    // depois que alguém começou, só continua quem digitar o mesmo CPF.
    const conferido = conferirCpfDaFamilia(lead, cpf, envio.respostas[0]?.valorTexto);
    if (conferido === 'OUTRA_PESSOA') throw new BadRequestException(CPF_DE_OUTRA_PESSOA);
    // Sem CPF no cadastro ou CPF diferente: mesma orientação (e não revela qual caso é)
    if (conferido === 'NAO_CADASTRADO') throw new BadRequestException(CPF_NAO_CONFIRMADO);
    return { encontrado: true as const, nome: pessoaDoCpf(lead, cpf)!.nome };
  }

  /** Conferência ao digitar (não grava nada). */
  async verificarCpf(token: string, cpf: string) {
    return this.conferirCpf(token, cpf);
  }

  /**
   * Com pergunta de CPF, o link sozinho não basta: precisa da chave de acesso
   * que o servidor devolve quando o CPF confere. Protege o questionário de quem
   * recebeu o link encaminhado e tenta chamar a API direto, sem passar pela tela.
   */
  private autorizado(envio: { id: string; tokenHash: string | null }, cpfOrdem: number | null, chave: unknown): boolean {
    if (cpfOrdem === null) return true;
    return !!envio.tokenHash && chaveAcessoQuestionarioValida(chave, envio.id, envio.tokenHash);
  }

  /** Abertura entra no histórico; recarregar a página em menos de 30 min não conta de novo. */
  private async registrarAbertura(envioId: string, jaAbriuAntes: boolean) {
    const ultima = await this.prisma.preOcupacaoQuestionarioEnvioEvento
      .findFirst({ where: { envioId, tipo: 'ABRIU' }, orderBy: { em: 'desc' }, select: { em: true } })
      .catch(() => null);
    if (ultima && Date.now() - ultima.em.getTime() < INTERVALO_NOVA_ABERTURA_MS) return;
    await registrarEventoEnvio(this.prisma, envioId, 'ABRIU', jaAbriuAntes ? 'Abriu de novo' : null);
  }

  async buscar(token: string, chave?: string) {
    const envio = await this.buscarEnvio(token);
    const cpfOrdem = ordemDoCpf(envio.questionario.perguntas);
    const liberado = this.autorizado(envio, cpfOrdem, chave);
    // Quem está respondendo: a pessoa do cadastro dona do CPF digitado (pode ser o
    // cônjuge ou um familiar); sem CPF, o titular. Usado na saudação e no preenchimento.
    let pessoa: { nome: string; telefone: string | null } | null = null;
    if (liberado && !envio.teste) {
      const lead = envio.familia!.lead;
      const idsCpf = new Set(envio.questionario.perguntas.filter((p) => p.tipo === 'CPF').map((p) => p.id));
      const cpfSalvo = envio.respostas.find((r) => idsCpf.has(r.perguntaId))?.valorTexto;
      pessoa = pessoaDoCpf(lead, cpfSalvo) ?? { nome: lead.nomeCorreto ?? lead.nome, telefone: lead.telefone };
    }
    const nome = !liberado ? '' : envio.teste ? envio.testeNome ?? 'Teste' : pessoa!.nome;
    const telefone = !liberado ? null : envio.teste ? envio.testeTelefone : pessoa!.telefone;
    // Quem já respondeu vê o aviso de "já respondido", mesmo com link vencido.
    if (envio.respondidoEm) {
      return { nome, titulo: envio.questionario.titulo, jaRespondido: true as const, respondidoEm: envio.respondidoEm };
    }
    this.checarValidade(envio);

    // Antes do CPF: só as telas de abertura, sem nome, telefone nem respostas
    // (a concordância já marcada volta; o CPF digitado não volta).
    const perguntas = liberado ? envio.questionario.perguntas : envio.questionario.perguntas.filter((p) => p.ordem <= cpfOrdem!);
    const visiveis = new Set(perguntas.filter((p) => liberado || p.tipo !== 'CPF').map((p) => p.id));
    const respostas = envio.respostas.filter((r) => visiveis.has(r.perguntaId));

    if (!envio.linkAbertoEm) {
      await this.prisma.preOcupacaoQuestionarioEnvio
        .update({ where: { id: envio.id }, data: { linkAbertoEm: new Date() } })
        .catch((e: any) => this.logger.warn(`Falha ao registrar abertura do link: envio=${envio.id} erro=${e?.message}`));
    }
    await this.registrarAbertura(envio.id, !!envio.linkAbertoEm);

    return {
      nome,
      titulo: envio.questionario.titulo,
      descricao: envio.questionario.descricao,
      config: envio.questionario.config ?? null,
      jaRespondido: false as const,
      teste: envio.teste,
      // 2+ = reenviado para corrigir: a tela avisa que esta resposta substitui a anterior
      rodada: envio.rodada,
      precisaCpf: !liberado,
      prefill: { NOME: nome || null, TELEFONE: telefone ?? null },
      perguntas: perguntas.map((p) => ({
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
      respostas: respostas.map((r) => this.respostaPublica(r)),
    };
  }

  /** Salva (ou apaga, se veio em branco) a resposta de uma tela. */
  async salvar(token: string, body: { perguntaId?: string; instancia?: number; valor?: unknown; extras?: unknown }, chave?: string) {
    // Consulta enxuta (chamada a cada tela): só o envio e a pergunta da vez
    const envio = await this.prisma.preOcupacaoQuestionarioEnvio.findFirst({
      where: { tokenHash: hashConviteToken(token) },
      select: {
        id: true,
        respondidoEm: true,
        iniciadoEm: true,
        tokenExpiraEm: true,
        tokenHash: true,
        teste: true,
        questionarioId: true,
        questionario: { select: { status: true, perguntas: { where: { tipo: 'CPF' }, select: { tipo: true, ordem: true } } } },
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
    // Sem a chave do CPF só dá para salvar as telas de abertura e o próprio CPF
    const cpfOrdem = ordemDoCpf(envio.questionario.perguntas);
    if (cpfOrdem !== null && pergunta.ordem > cpfOrdem && !this.autorizado(envio, cpfOrdem, chave)) {
      throw new ForbiddenException(CPF_NECESSARIO);
    }
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
    if (cadastro) await registrarEventoEnvio(this.prisma, envio.id, 'CPF_CONFIRMADO');
    if (!envio.iniciadoEm) {
      await this.prisma.preOcupacaoQuestionarioEnvio.update({ where: { id: envio.id }, data: { iniciadoEm: new Date() } });
      await registrarEventoEnvio(this.prisma, envio.id, 'COMECOU');
    }
    // CPF conferido: devolve a chave de acesso ao resto do questionário
    const acesso = cadastro && envio.tokenHash && envio.tokenExpiraEm
      ? gerarChaveAcessoQuestionario(envio.id, envio.tokenHash, envio.tokenExpiraEm)
      : undefined;
    return { ok: true, ...(cadastro ? { cadastro, acesso } : {}) };
  }

  async concluir(token: string, chave?: string) {
    const envio = await this.buscarEnvio(token);
    if (envio.respondidoEm) throw new ConflictException('Você já respondeu este questionário. Obrigado!');
    this.checarValidade(envio);
    if (!this.autorizado(envio, ordemDoCpf(envio.questionario.perguntas), chave)) throw new ForbiddenException(CPF_NECESSARIO);

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
    await registrarEventoEnvio(this.prisma, envio.id, 'RESPONDEU');
    this.logger.log(`Questionário respondido: envio=${envio.id} questionario=${envio.questionarioId} descartadas=${orfas.length}`);

    // Pedido de sigilo / atendimento reservado: abre demanda para um analista avaliar
    const visiveisFinais = envio.respostas.filter((r) => visiveis.has(`${r.perguntaId}#${r.instancia}`));
    const alertasDe = (lista: { perguntaId: string; valorOpcoes: string[] }[]) => {
      const out: string[] = [];
      for (const r of lista) {
        const p = porId.get(r.perguntaId);
        if (!p) continue;
        for (const o of opcoesDe(p)) if (o.alerta && (r.valorOpcoes ?? []).includes(o.label) && !out.includes(o.alerta)) out.push(o.alerta);
      }
      return out;
    };
    let alertas = alertasDe(visiveisFinais);
    // Correção: o que já estava marcado na resposta anterior já virou demanda — só abre para o que é novo
    if (envio.rodada > 1 && alertas.length) {
      const anterior = await this.prisma.preOcupacaoQuestionarioEnvioRodada.findFirst({
        where: { envioId: envio.id },
        orderBy: { rodada: 'desc' },
        select: { respostas: true },
      });
      alertas = alertasNovos(alertas, alertasDe((anterior?.respostas as any[]) ?? []));
    }
    if (alertas.length && envio.teste) {
      this.logger.log(`Teste do questionário: abriria demanda (${alertas.join('; ')}) — não aberta por ser teste. envio=${envio.id}`);
    } else if (alertas.length) {
      try {
        const d = await this.demandas.criar(
          envio.tenantId,
          {
            familiaId: envio.familiaId ?? undefined,
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
    const nome = envio.teste ? envio.testeNome ?? 'Teste' : envio.familia!.lead.nomeCorreto ?? envio.familia!.lead.nome;
    const agradecimento = mensagemObrigado(nome, envio.questionario.titulo, envio.rodada);
    try {
      if (envio.teste) {
        await this.envios.enviarTextoParaNumero(envio.tenantId, envio.testeTelefone ?? '', `[TESTE] ${agradecimento}`);
      } else {
        const leadsService = await this.getLeadsService();
        await leadsService.sendWhatsappMessage(
          { tenantId: envio.tenantId, nome: 'Questionário Pré-Ocupação' },
          envio.familia!.leadId,
          { message: agradecimento, abrirConversa: false },
        );
      }
    } catch (e: any) {
      this.logger.warn(`Falha ao enviar agradecimento do questionário: envio=${envio.id} erro=${e?.message || e}`);
    }

    return { ok: true, respondidoEm };
  }
}
