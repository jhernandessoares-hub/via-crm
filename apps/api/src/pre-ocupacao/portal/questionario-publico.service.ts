import { BadRequestException, ConflictException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Logger } from '../../logger';
import { PrismaService } from '../../prisma/prisma.service';
import type { LeadsService } from '../../leads/leads.service';
import { hashConviteToken } from '../pre-ocupacao-convite-token.util';
import { RespostaNormalizada, validarResposta } from '../questionario-pergunta.util';

/** Resposta pública do questionário (link mágico enviado por WhatsApp, sem login). */
@Injectable()
export class QuestionarioPublicoService {
  private readonly logger = new Logger('PreOcupacaoQuestionarioPublicoService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
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
        familia: { include: { lead: { select: { nome: true, nomeCorreto: true } } } },
      },
    });
    if (!envio) throw new NotFoundException('Questionário não encontrado.');
    return envio;
  }

  /** Link vencido ou questionário encerrado não aceita mais resposta. */
  private checarValidade(envio: Awaited<ReturnType<QuestionarioPublicoService['buscarEnvio']>>) {
    if (envio.questionario.status !== 'PUBLICADO') {
      throw new GoneException('Este questionário foi encerrado — fale com a equipe.');
    }
    if (!envio.tokenExpiraEm || envio.tokenExpiraEm < new Date()) {
      throw new GoneException('Este link não é mais válido — fale com a equipe.');
    }
  }

  async buscar(token: string) {
    const envio = await this.buscarEnvio(token);
    const nome = envio.familia.lead.nomeCorreto ?? envio.familia.lead.nome;
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
      jaRespondido: false as const,
      perguntas: envio.questionario.perguntas.map((p) => ({
        id: p.id,
        enunciado: p.enunciado,
        tipo: p.tipo,
        opcoes: Array.isArray(p.opcoes) ? p.opcoes : null,
        escalaMin: p.escalaMin,
        escalaMax: p.escalaMax,
        obrigatoria: p.obrigatoria,
      })),
    };
  }

  async responder(token: string, respostas: Record<string, unknown>) {
    const envio = await this.buscarEnvio(token);
    if (envio.respondidoEm) throw new ConflictException('Você já respondeu este questionário. Obrigado!');
    this.checarValidade(envio);
    if (!respostas || typeof respostas !== 'object' || Array.isArray(respostas)) {
      throw new BadRequestException('Respostas inválidas.');
    }

    const normalizadas = envio.questionario.perguntas
      .map((p, idx) => validarResposta(p, respostas[p.id], idx + 1))
      .filter((r): r is RespostaNormalizada => r !== null);

    const respondidoEm = new Date();
    await this.prisma.$transaction(async (tx) => {
      // Guarda contra envio duplo (dois cliques / duas abas): só grava se ainda
      // não foi respondido.
      const { count } = await tx.preOcupacaoQuestionarioEnvio.updateMany({
        where: { id: envio.id, respondidoEm: null },
        data: { respondidoEm },
      });
      if (count === 0) throw new ConflictException('Você já respondeu este questionário. Obrigado!');
      await tx.preOcupacaoQuestionarioResposta.createMany({
        data: normalizadas.map((r) => ({ ...r, envioId: envio.id })),
      });
    });
    this.logger.log(`Questionário respondido: envio=${envio.id} questionario=${envio.questionarioId}`);

    // Agradecimento por WhatsApp — falha aqui não desfaz a resposta já gravada.
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
