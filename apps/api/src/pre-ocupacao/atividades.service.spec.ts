import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AtividadesService } from './atividades.service';

jest.mock('./pre-ocupacao-upload.util', () => ({
  uploadPreOcupacaoFile: jest.fn().mockResolvedValue({ url: 'https://cloudinary/x', publicId: 'pid-1' }),
}));

function buildPrismaMock() {
  return {
    preOcupacaoFamilia: { findMany: jest.fn() },
    preOcupacaoAtividade: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    preOcupacaoAtividadeParticipante: { findUnique: jest.fn(), update: jest.fn() },
    preOcupacaoAtividadeAnexo: { create: jest.fn() },
    preOcupacaoParticipanteAnexo: { create: jest.fn() },
    $transaction: jest.fn(),
  };
}

function buildAuditMock() {
  return { log: jest.fn().mockResolvedValue(undefined) };
}

describe('AtividadesService', () => {
  const TENANT_A = 'tenant-a';

  describe('criar — transação atômica', () => {
    it('cria CalendarEvent + Atividade + Participantes numa única chamada de $transaction', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new AtividadesService(prisma, buildAuditMock() as any);

      const tx = {
        calendarEvent: { create: jest.fn().mockResolvedValue({ id: 'evt-1' }) },
        preOcupacaoAtividade: { create: jest.fn().mockResolvedValue({ id: 'ativ-1', calendarEventId: 'evt-1' }) },
        preOcupacaoAtividadeParticipante: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
      };
      prisma.$transaction.mockImplementation((cb: any) => cb(tx));

      const result = await svc.criar(TENANT_A, 'user-1', {
        categoria: 'DIAGNOSTICO',
        dataAgendada: '2026-08-01T10:00:00.000Z',
        familiaIds: ['f1', 'f2'],
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.calendarEvent.create).toHaveBeenCalled();
      expect(tx.preOcupacaoAtividade.create).toHaveBeenCalled();
      expect(tx.preOcupacaoAtividadeParticipante.createMany).toHaveBeenCalledWith({
        data: [
          { atividadeId: 'ativ-1', familiaId: 'f1', status: 'AGUARDANDO_PREENCHIMENTO' },
          { atividadeId: 'ativ-1', familiaId: 'f2', status: 'AGUARDANDO_PREENCHIMENTO' },
        ],
      });
      expect(result).toEqual({ id: 'ativ-1', calendarEventId: 'evt-1' });
    });

    it('se familiaIds não for informado, usa todas as famílias ATIVA do tenant', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new AtividadesService(prisma, buildAuditMock() as any);

      prisma.preOcupacaoFamilia.findMany.mockResolvedValue([{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }]);
      const tx = {
        calendarEvent: { create: jest.fn().mockResolvedValue({ id: 'evt-1' }) },
        preOcupacaoAtividade: { create: jest.fn().mockResolvedValue({ id: 'ativ-1' }) },
        preOcupacaoAtividadeParticipante: { createMany: jest.fn().mockResolvedValue({ count: 3 }) },
      };
      prisma.$transaction.mockImplementation((cb: any) => cb(tx));

      await svc.criar(TENANT_A, 'user-1', { categoria: 'MAPEAMENTO', dataAgendada: '2026-08-01T10:00:00.000Z' });

      expect(prisma.preOcupacaoFamilia.findMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT_A, status: 'ATIVA' },
        select: { id: true },
      });
      expect(tx.preOcupacaoAtividadeParticipante.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ familiaId: 'f1' }),
          expect.objectContaining({ familiaId: 'f2' }),
          expect.objectContaining({ familiaId: 'f3' }),
        ]),
      });
    });

    it('lança BadRequestException quando não há nenhuma família ativa e nenhuma foi informada — não abre transação', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new AtividadesService(prisma, buildAuditMock() as any);

      prisma.preOcupacaoFamilia.findMany.mockResolvedValue([]);

      await expect(
        svc.criar(TENANT_A, 'user-1', { categoria: 'EDUCACAO', dataAgendada: '2026-08-01T10:00:00.000Z' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('lança BadRequestException para categoria ausente sem tocar no banco', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new AtividadesService(prisma, buildAuditMock() as any);

      await expect(svc.criar(TENANT_A, 'user-1', { categoria: '', dataAgendada: '2026-08-01' } as any)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.preOcupacaoFamilia.findMany).not.toHaveBeenCalled();
    });

    it('lança BadRequestException para dataAgendada inválida', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new AtividadesService(prisma, buildAuditMock() as any);

      await expect(
        svc.criar(TENANT_A, 'user-1', { categoria: 'DIAGNOSTICO', dataAgendada: 'data-invalida' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('isolamento multi-tenant — Atividade/Participante sem tenantId próprio', () => {
    it('getAtividadeOrThrow (via atualizar) filtra por tenantId — atividade de outro tenant não é encontrada', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new AtividadesService(prisma, buildAuditMock() as any);

      prisma.preOcupacaoAtividade.findFirst.mockResolvedValue(null);

      await expect(svc.atualizar(TENANT_A, 'ativ-de-outro-tenant', { local: 'X' })).rejects.toThrow(NotFoundException);
      expect(prisma.preOcupacaoAtividade.findFirst).toHaveBeenCalledWith({
        where: { id: 'ativ-de-outro-tenant', tenantId: TENANT_A },
      });
      expect(prisma.preOcupacaoAtividade.update).not.toHaveBeenCalled();
    });

    it('marcarFalta valida a Atividade pelo tenant ANTES de tocar o Participante (isolamento indireto)', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new AtividadesService(prisma, buildAuditMock() as any);

      // Atividade não pertence ao tenant chamador
      prisma.preOcupacaoAtividade.findFirst.mockResolvedValue(null);

      await expect(svc.marcarFalta(TENANT_A, 'ativ-1', 'fam-1', 'user-1')).rejects.toThrow(NotFoundException);
      expect(prisma.preOcupacaoAtividadeParticipante.findUnique).not.toHaveBeenCalled();
    });

    it('marcarFalta lança NotFoundException quando a família não é participante desta sessão', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new AtividadesService(prisma, buildAuditMock() as any);

      prisma.preOcupacaoAtividade.findFirst.mockResolvedValue({ id: 'ativ-1', tenantId: TENANT_A });
      prisma.preOcupacaoAtividadeParticipante.findUnique.mockResolvedValue(null);

      await expect(svc.marcarFalta(TENANT_A, 'ativ-1', 'fam-de-outro-tenant', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('marcarFalta funciona corretamente quando atividade e participante existem no tenant', async () => {
      const prisma: any = buildPrismaMock();
      const audit = buildAuditMock();
      const svc = new AtividadesService(prisma, audit as any);

      prisma.preOcupacaoAtividade.findFirst.mockResolvedValue({ id: 'ativ-1', tenantId: TENANT_A });
      prisma.preOcupacaoAtividadeParticipante.findUnique.mockResolvedValue({ id: 'part-1' });
      prisma.preOcupacaoAtividadeParticipante.update.mockResolvedValue({ id: 'part-1', status: 'FALTOU' });

      const result = await svc.marcarFalta(TENANT_A, 'ativ-1', 'fam-1', 'user-1');

      expect(result.status).toBe('FALTOU');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'PRE_OCUPACAO_MARCAR_FALTA' }));
    });

    it('preencherFicha valida atividade+participante do tenant antes do upload/create', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new AtividadesService(prisma, buildAuditMock() as any);

      prisma.preOcupacaoAtividade.findFirst.mockResolvedValue(null);

      await expect(
        svc.preencherFicha(TENANT_A, 'ativ-1', 'fam-1', { originalname: 'f.pdf', mimetype: 'application/pdf' }, {}),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.preOcupacaoParticipanteAnexo.create).not.toHaveBeenCalled();
    });

    it('preencherFicha marca CONCLUIDA e grava anexo quando tudo pertence ao tenant', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new AtividadesService(prisma, buildAuditMock() as any);

      prisma.preOcupacaoAtividade.findFirst.mockResolvedValue({ id: 'ativ-1', tenantId: TENANT_A });
      prisma.preOcupacaoAtividadeParticipante.findUnique.mockResolvedValue({ id: 'part-1' });
      prisma.preOcupacaoParticipanteAnexo.create.mockResolvedValue({ id: 'anexo-1' });
      prisma.preOcupacaoAtividadeParticipante.update.mockResolvedValue({ id: 'part-1', status: 'CONCLUIDA' });

      const result = await svc.preencherFicha(
        TENANT_A,
        'ativ-1',
        'fam-1',
        { originalname: 'ficha.pdf', mimetype: 'application/pdf' },
        { avaliacao: 'BOM', transcricaoFicha: 'ok' },
      );

      expect(result.status).toBe('CONCLUIDA');
      expect(prisma.preOcupacaoAtividadeParticipante.update).toHaveBeenCalledWith({
        where: { id: 'part-1' },
        data: expect.objectContaining({ status: 'CONCLUIDA', avaliacao: 'BOM', transcricaoFicha: 'ok' }),
      });
    });

    it('preencherFicha exige arquivo', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new AtividadesService(prisma, buildAuditMock() as any);

      prisma.preOcupacaoAtividade.findFirst.mockResolvedValue({ id: 'ativ-1', tenantId: TENANT_A });
      prisma.preOcupacaoAtividadeParticipante.findUnique.mockResolvedValue({ id: 'part-1' });

      await expect(svc.preencherFicha(TENANT_A, 'ativ-1', 'fam-1', null, {})).rejects.toThrow(BadRequestException);
    });
  });

  describe('detalhe', () => {
    it('lança NotFoundException quando a atividade não pertence ao tenant', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new AtividadesService(prisma, buildAuditMock() as any);

      prisma.preOcupacaoAtividade.findFirst.mockResolvedValue(null);

      await expect(svc.detalhe(TENANT_A, 'ativ-de-outro-tenant')).rejects.toThrow(NotFoundException);
    });
  });
});
