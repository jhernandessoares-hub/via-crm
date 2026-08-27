import { GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Logger } from '../../logger';
import { PrismaService } from '../../prisma/prisma.service';
import type { LeadsService } from '../../leads/leads.service';
import { PRE_OCUPACAO_CATEGORIA_LABEL } from '../pre-ocupacao-status.util';
import { hashConviteToken } from '../pre-ocupacao-convite-token.util';

@Injectable()
export class ConviteService {
  private readonly logger = new Logger('PreOcupacaoConviteService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * Mesmo motivo do `AtividadesService`: resolve `LeadsService` via
   * `ModuleRef` em vez de injeção direta, pra não puxar
   * `@whiskeysockets/baileys` (ESM) no topo deste arquivo e quebrar o Jest.
   */
  private async getLeadsService(): Promise<LeadsService> {
    const { LeadsService: LeadsServiceClass } = await import('../../leads/leads.service.js');
    return this.moduleRef.get(LeadsServiceClass, { strict: false });
  }

  private async buscarParticipanteValido(token: string) {
    const hash = hashConviteToken(token);
    const participante = await this.prisma.preOcupacaoAtividadeParticipante.findFirst({
      where: { convidaTokenHash: hash },
      include: {
        familia: { include: { lead: { select: { nome: true, nomeCorreto: true } } } },
        atividade: true,
      },
    });
    if (!participante) throw new NotFoundException('Convite não encontrado.');
    if (!participante.convidaTokenExpiraEm || participante.convidaTokenExpiraEm < new Date()) {
      throw new GoneException('Este convite não é mais válido — fale com a equipe.');
    }
    return participante;
  }

  async buscarPorToken(token: string) {
    const p = await this.buscarParticipanteValido(token);
    return {
      nome: p.familia.lead.nomeCorreto ?? p.familia.lead.nome,
      sessao: {
        titulo: p.atividade.titulo || PRE_OCUPACAO_CATEGORIA_LABEL[p.atividade.categoria] || p.atividade.categoria,
        dataAgendada: p.atividade.dataAgendada,
        local: p.atividade.local,
      },
      rsvpStatus: p.rsvpStatus,
    };
  }

  async responder(token: string, confirmar: boolean) {
    const p = await this.buscarParticipanteValido(token);
    const updated = await this.prisma.preOcupacaoAtividadeParticipante.update({
      where: { id: p.id },
      data: { rsvpStatus: confirmar ? 'CONFIRMOU' : 'RECUSOU', rsvpRespondidoEm: new Date() },
    });
    this.logger.log(`RSVP registrado: participante=${p.id} rsvpStatus=${updated.rsvpStatus}`);

    // Só quem confirma presença recebe mensagem de volta — quem recusa, não
    // (decisão explícita do usuário). Falha no envio não derruba o RSVP já
    // registrado, só fica registrada em log.
    if (confirmar) {
      const titulo = p.atividade.titulo || PRE_OCUPACAO_CATEGORIA_LABEL[p.atividade.categoria] || p.atividade.categoria;
      const texto = `Você confirmou presença no evento "${titulo}"! Te esperamos lá.`;
      try {
        const leadsService = await this.getLeadsService();
        await leadsService.sendWhatsappMessage(
          { tenantId: p.familia.tenantId, nome: 'Portal de Convite' },
          p.familia.leadId,
          { message: texto },
        );
      } catch (e: any) {
        this.logger.warn(`Falha ao enviar confirmação de RSVP: participante=${p.id} erro=${e?.message || e}`);
      }
    }

    return { rsvpStatus: updated.rsvpStatus };
  }
}
