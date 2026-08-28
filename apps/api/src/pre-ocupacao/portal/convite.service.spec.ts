import { ConflictException, GoneException, NotFoundException } from '@nestjs/common';
import { ConviteService } from './convite.service';

jest.mock('../../leads/leads.service', () => ({
  LeadsService: class {},
}));

function buildPrismaMock() {
  return {
    preOcupacaoAtividadeParticipante: { findFirst: jest.fn(), update: jest.fn() },
  };
}

function buildModuleRefMock(sendWhatsappMessage = jest.fn().mockResolvedValue(undefined)) {
  return { get: jest.fn().mockReturnValue({ sendWhatsappMessage }) };
}

describe('ConviteService', () => {
  const baseParticipante = {
    id: 'part-1',
    familiaId: 'fam-1',
    rsvpStatus: 'AGUARDANDO',
    convidaTokenExpiraEm: new Date(Date.now() + 60_000),
    familia: { tenantId: 'tenant-a', leadId: 'lead-1', lead: { nome: 'Fulano', nomeCorreto: null } },
    atividade: { titulo: 'Reunião', categoria: 'ORGANIZACAO_CONDOMINIAL' },
  };

  describe('responder', () => {
    it('lança ConflictException e não altera o RSVP quando a pessoa já confirmou presença', async () => {
      const prisma: any = buildPrismaMock();
      prisma.preOcupacaoAtividadeParticipante.findFirst.mockResolvedValue({
        ...baseParticipante,
        rsvpStatus: 'CONFIRMOU',
      });
      const svc = new ConviteService(prisma, buildModuleRefMock() as any);

      await expect(svc.responder('token-1', false)).rejects.toThrow(ConflictException);
      expect(prisma.preOcupacaoAtividadeParticipante.update).not.toHaveBeenCalled();
    });

    it('permite quem recusou entrar depois e confirmar presença', async () => {
      const prisma: any = buildPrismaMock();
      prisma.preOcupacaoAtividadeParticipante.findFirst.mockResolvedValue({
        ...baseParticipante,
        rsvpStatus: 'RECUSOU',
      });
      prisma.preOcupacaoAtividadeParticipante.update.mockResolvedValue({ rsvpStatus: 'CONFIRMOU' });
      // A confirmação por WhatsApp usa `await import(...)` dinâmico (ModuleRef) pra
      // não puxar o Baileys no topo do arquivo — nesse ambiente de teste (sem
      // --experimental-vm-modules) o import dinâmico não resolve e cai no catch
      // best-effort do próprio serviço, então aqui só validamos a escrita do RSVP
      // (a chamada real ao WhatsApp é coberta pelo teste manual end-to-end).
      const svc = new ConviteService(prisma, buildModuleRefMock() as any);

      const result = await svc.responder('token-1', true);

      expect(result).toEqual({ rsvpStatus: 'CONFIRMOU' });
      expect(prisma.preOcupacaoAtividadeParticipante.update).toHaveBeenCalledWith({
        where: { id: 'part-1' },
        data: { rsvpStatus: 'CONFIRMOU', rsvpRespondidoEm: expect.any(Date) },
      });
    });

    it('permite trocar a resposta de quem ainda está aguardando, sem mandar mensagem quando recusa', async () => {
      const prisma: any = buildPrismaMock();
      prisma.preOcupacaoAtividadeParticipante.findFirst.mockResolvedValue({ ...baseParticipante });
      prisma.preOcupacaoAtividadeParticipante.update.mockResolvedValue({ rsvpStatus: 'RECUSOU' });
      const sendWhatsappMessage = jest.fn();
      const svc = new ConviteService(prisma, buildModuleRefMock(sendWhatsappMessage) as any);

      const result = await svc.responder('token-1', false);

      expect(result).toEqual({ rsvpStatus: 'RECUSOU' });
      expect(sendWhatsappMessage).not.toHaveBeenCalled();
    });

    it('propaga GoneException quando o token já expirou', async () => {
      const prisma: any = buildPrismaMock();
      prisma.preOcupacaoAtividadeParticipante.findFirst.mockResolvedValue({
        ...baseParticipante,
        convidaTokenExpiraEm: new Date(Date.now() - 1000),
      });
      const svc = new ConviteService(prisma, buildModuleRefMock() as any);

      await expect(svc.responder('token-1', true)).rejects.toThrow(GoneException);
    });

    it('propaga NotFoundException quando o token não existe', async () => {
      const prisma: any = buildPrismaMock();
      prisma.preOcupacaoAtividadeParticipante.findFirst.mockResolvedValue(null);
      const svc = new ConviteService(prisma, buildModuleRefMock() as any);

      await expect(svc.responder('token-inexistente', true)).rejects.toThrow(NotFoundException);
    });
  });
});
