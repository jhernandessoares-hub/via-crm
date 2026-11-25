import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AtividadesService } from './atividades.service';

jest.mock('./pre-ocupacao-upload.util', () => ({
  uploadPreOcupacaoFile: jest.fn().mockResolvedValue({ url: 'https://cloudinary/x', publicId: 'pid-1' }),
}));

function buildPrismaMock() {
  return {
    preOcupacaoFamilia: { findMany: jest.fn() },
    preOcupacaoAtividade: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), delete: jest.fn() },
    preOcupacaoAtividadeParticipante: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
    preOcupacaoAtividadeAnexo: { create: jest.fn(), count: jest.fn().mockResolvedValue(0) },
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
      const svc = new AtividadesService(prisma, buildAuditMock() as any, {} as any, {} as any);

      const tx = {
        calendarEvent: { create: jest.fn().mockResolvedValue({ id: 'evt-1' }) },
        preOcupacaoAtividade: { create: jest.fn().mockResolvedValue({ id: 'ativ-1', calendarEventId: 'evt-1' }) },
        preOcupacaoAtividadeParticipante: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
      };
      prisma.$transaction.mockImplementation((cb: any) => cb(tx));

      const result = await svc.criar(TENANT_A, 'user-1', {
        categoria: 'ORGANIZACAO_CONDOMINIAL',
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
      const svc = new AtividadesService(prisma, buildAuditMock() as any, {} as any, {} as any);

      prisma.preOcupacaoFamilia.findMany.mockResolvedValue([{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }]);
      const tx = {
        calendarEvent: { create: jest.fn().mockResolvedValue({ id: 'evt-1' }) },
        preOcupacaoAtividade: { create: jest.fn().mockResolvedValue({ id: 'ativ-1' }) },
        preOcupacaoAtividadeParticipante: { createMany: jest.fn().mockResolvedValue({ count: 3 }) },
      };
      prisma.$transaction.mockImplementation((cb: any) => cb(tx));

      await svc.criar(TENANT_A, 'user-1', { categoria: 'EDUCACAO_AMBIENTAL_PATRIMONIAL', dataAgendada: '2026-08-01T10:00:00.000Z' });

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
      const svc = new AtividadesService(prisma, buildAuditMock() as any, {} as any, {} as any);

      prisma.preOcupacaoFamilia.findMany.mockResolvedValue([]);

      await expect(
        svc.criar(TENANT_A, 'user-1', { categoria: 'CONVIVENCIA_COMUNITARIA', dataAgendada: '2026-08-01T10:00:00.000Z' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('lança BadRequestException para categoria ausente sem tocar no banco', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new AtividadesService(prisma, buildAuditMock() as any, {} as any, {} as any);

      await expect(svc.criar(TENANT_A, 'user-1', { categoria: '', dataAgendada: '2026-08-01' } as any)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.preOcupacaoFamilia.findMany).not.toHaveBeenCalled();
    });

    it('lança BadRequestException para dataAgendada inválida', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new AtividadesService(prisma, buildAuditMock() as any, {} as any, {} as any);

      await expect(
        svc.criar(TENANT_A, 'user-1', { categoria: 'ORGANIZACAO_CONDOMINIAL', dataAgendada: 'data-invalida' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('isolamento multi-tenant — Atividade/Participante sem tenantId próprio', () => {
    it('getAtividadeOrThrow (via atualizar) filtra por tenantId — atividade de outro tenant não é encontrada', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new AtividadesService(prisma, buildAuditMock() as any, {} as any, {} as any);

      prisma.preOcupacaoAtividade.findFirst.mockResolvedValue(null);

      await expect(svc.atualizar(TENANT_A, 'ativ-de-outro-tenant', 'OWNER', { local: 'X' })).rejects.toThrow(NotFoundException);
      expect(prisma.preOcupacaoAtividade.findFirst).toHaveBeenCalledWith({
        where: { id: 'ativ-de-outro-tenant', tenantId: TENANT_A },
      });
      expect(prisma.preOcupacaoAtividade.update).not.toHaveBeenCalled();
    });

    it('marcarFalta valida a Atividade pelo tenant ANTES de tocar o Participante (isolamento indireto)', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new AtividadesService(prisma, buildAuditMock() as any, {} as any, {} as any);

      // Atividade não pertence ao tenant chamador
      prisma.preOcupacaoAtividade.findFirst.mockResolvedValue(null);

      await expect(svc.marcarFalta(TENANT_A, 'ativ-1', 'fam-1', 'user-1')).rejects.toThrow(NotFoundException);
      expect(prisma.preOcupacaoAtividadeParticipante.findUnique).not.toHaveBeenCalled();
    });

    it('marcarFalta lança NotFoundException quando a família não é participante desta sessão', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new AtividadesService(prisma, buildAuditMock() as any, {} as any, {} as any);

      prisma.preOcupacaoAtividade.findFirst.mockResolvedValue({ id: 'ativ-1', tenantId: TENANT_A });
      prisma.preOcupacaoAtividadeParticipante.findUnique.mockResolvedValue(null);

      await expect(svc.marcarFalta(TENANT_A, 'ativ-1', 'fam-de-outro-tenant', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('marcarFalta funciona corretamente quando atividade e participante existem no tenant', async () => {
      const prisma: any = buildPrismaMock();
      const audit = buildAuditMock();
      const svc = new AtividadesService(prisma, audit as any, {} as any, {} as any);

      prisma.preOcupacaoAtividade.findFirst.mockResolvedValue({ id: 'ativ-1', tenantId: TENANT_A });
      prisma.preOcupacaoAtividadeParticipante.findUnique.mockResolvedValue({ id: 'part-1' });
      prisma.preOcupacaoAtividadeParticipante.update.mockResolvedValue({ id: 'part-1', status: 'FALTOU' });

      const result = await svc.marcarFalta(TENANT_A, 'ativ-1', 'fam-1', 'user-1');

      expect(result.status).toBe('FALTOU');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'PRE_OCUPACAO_MARCAR_FALTA' }));
    });

    it('preencherFicha valida atividade+participante do tenant antes do upload/create', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new AtividadesService(prisma, buildAuditMock() as any, {} as any, {} as any);

      prisma.preOcupacaoAtividade.findFirst.mockResolvedValue(null);

      await expect(
        svc.preencherFicha(TENANT_A, 'ativ-1', 'fam-1', { originalname: 'f.pdf', mimetype: 'application/pdf' }, {}),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.preOcupacaoParticipanteAnexo.create).not.toHaveBeenCalled();
    });

    it('preencherFicha marca CONCLUIDA e grava anexo quando tudo pertence ao tenant', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new AtividadesService(prisma, buildAuditMock() as any, {} as any, {} as any);

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
      const svc = new AtividadesService(prisma, buildAuditMock() as any, {} as any, {} as any);

      prisma.preOcupacaoAtividade.findFirst.mockResolvedValue({ id: 'ativ-1', tenantId: TENANT_A });
      prisma.preOcupacaoAtividadeParticipante.findUnique.mockResolvedValue({ id: 'part-1' });

      await expect(svc.preencherFicha(TENANT_A, 'ativ-1', 'fam-1', null, {})).rejects.toThrow(BadRequestException);
    });
  });

  describe('lancarPresenca / marcarReposicao', () => {
    const PASSADA = { id: 'ativ-1', tenantId: TENANT_A, dataAgendada: new Date('2026-10-31') };

    function montar(atividade: any, participantes: any[] = []) {
      const prisma: any = buildPrismaMock();
      const audit = buildAuditMock();
      prisma.preOcupacaoAtividade.findFirst.mockResolvedValue(atividade);
      prisma.preOcupacaoAtividadeParticipante.findMany.mockResolvedValue(participantes);
      prisma.$transaction.mockResolvedValue([]);
      return { prisma, audit, svc: new AtividadesService(prisma, audit as any, {} as any, {} as any) };
    }

    it('grava presentes e faltas só de quem muda, e não transforma em falta quem tem ficha', async () => {
      const { prisma, audit, svc } = montar(PASSADA, [
        { id: 'p1', familiaId: 'f1', status: 'AGUARDANDO_PREENCHIMENTO', _count: { anexos: 0 } },
        { id: 'p2', familiaId: 'f2', status: 'AGUARDANDO_PREENCHIMENTO', _count: { anexos: 0 } },
        { id: 'p3', familiaId: 'f3', status: 'CONCLUIDA', _count: { anexos: 1 } },
        { id: 'p4', familiaId: 'f4', status: 'FALTOU', _count: { anexos: 0 } },
      ]);

      const r = await svc.lancarPresenca(
        TENANT_A,
        'ativ-1',
        [
          { familiaId: 'f1', situacao: 'PRESENTE' },
          { familiaId: 'f2', situacao: 'FALTOU' },
          { familiaId: 'f3', situacao: 'FALTOU' },
          { familiaId: 'f4', situacao: 'FALTOU' },
        ],
        'user-1',
      );

      expect(r).toEqual({ presentes: 1, faltas: 1, comFicha: 1 });
      const [presentes, faltas] = prisma.preOcupacaoAtividadeParticipante.updateMany.mock.calls.map((c: any[]) => c[0]);
      expect(presentes).toMatchObject({ where: { id: { in: ['p1'] } }, data: { status: 'CONCLUIDA' } });
      expect(faltas).toMatchObject({ where: { id: { in: ['p2'] } }, data: { status: 'FALTOU', marcadoFaltaPor: 'user-1' } });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'PRE_OCUPACAO_LANCAR_PRESENCA' }));
    });

    it('não lança presença antes da sessão começar', async () => {
      const { prisma, svc } = montar({ ...PASSADA, dataAgendada: new Date(Date.now() + 86_400_000) });
      await expect(
        svc.lancarPresenca(TENANT_A, 'ativ-1', [{ familiaId: 'f1', situacao: 'PRESENTE' }], 'u'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('recusa família que não participa da sessão e situação inválida', async () => {
      const { prisma, svc } = montar(PASSADA, []);
      await expect(
        svc.lancarPresenca(TENANT_A, 'ativ-1', [{ familiaId: 'fora', situacao: 'FALTOU' }], 'u'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        svc.lancarPresenca(TENANT_A, 'ativ-1', [{ familiaId: 'f1', situacao: 'XPTO' }], 'u'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('reposição guarda o dia informado e recusa data futura ou anterior à atividade', async () => {
      const { prisma, svc } = montar(PASSADA);
      prisma.preOcupacaoAtividadeParticipante.findUnique.mockResolvedValue({ id: 'p1', status: 'FALTOU' });
      prisma.preOcupacaoAtividadeParticipante.update.mockResolvedValue({ id: 'p1' });

      await svc.marcarReposicao(TENANT_A, 'ativ-1', 'f1', true, 'u', '2026-11-05');
      expect(prisma.preOcupacaoAtividadeParticipante.update.mock.calls[0][0].data.reposicaoEm.toISOString()).toBe(
        '2026-11-05T15:00:00.000Z',
      );
      for (const dia of ['2999-01-01', '2026-10-01', '05/11/2026']) {
        await expect(svc.marcarReposicao(TENANT_A, 'ativ-1', 'f1', true, 'u', dia)).rejects.toThrow(BadRequestException);
      }
      expect(prisma.preOcupacaoAtividadeParticipante.update).toHaveBeenCalledTimes(1);
    });

    it('não exclui atividade que já tem presença das famílias', async () => {
      const { prisma, svc } = montar(PASSADA);
      prisma.preOcupacaoAtividadeParticipante.count.mockResolvedValueOnce(10).mockResolvedValueOnce(1);
      await expect(svc.remover(TENANT_A, 'ativ-1', 'OWNER')).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('quadro de presença separa presente, falta, reposição e quem não foi convocado', async () => {
      const { prisma, svc } = montar(PASSADA);
      prisma.preOcupacaoAtividade.findMany.mockResolvedValue([
        {
          id: 'a1',
          titulo: 'Oficina',
          categoria: 'GERACAO_RENDA',
          dataAgendada: new Date(),
          participantes: [
            { familiaId: 'f1', status: 'CONCLUIDA', reposicaoEm: null },
            { familiaId: 'f2', status: 'FALTOU', reposicaoEm: null },
            { familiaId: 'f3', status: 'FALTOU', reposicaoEm: new Date() },
          ],
        },
      ]);
      const lead = { nome: 'A', nomeCorreto: null, cpf: null };
      prisma.preOcupacaoFamilia.findMany.mockResolvedValue(
        ['f1', 'f2', 'f3', 'f4'].map((id, i) => ({ id, numero: i + 1, status: 'ATIVA', lead })),
      );
      const q = await svc.quadroPresenca(TENANT_A);
      expect(q.familias.map((f) => f.presencas)).toEqual([{ a1: 'PRESENTE' }, { a1: 'FALTOU' }, { a1: 'REPOSICAO' }, {}]);
    });

    it('reposição só vale para quem faltou, e pode ser desfeita', async () => {
      const { prisma, svc } = montar(PASSADA);
      prisma.preOcupacaoAtividadeParticipante.findUnique.mockResolvedValue({ id: 'p1', status: 'CONCLUIDA' });
      await expect(svc.marcarReposicao(TENANT_A, 'ativ-1', 'f1', true, 'u')).rejects.toThrow(BadRequestException);

      prisma.preOcupacaoAtividadeParticipante.findUnique.mockResolvedValue({ id: 'p1', status: 'FALTOU' });
      prisma.preOcupacaoAtividadeParticipante.update.mockResolvedValue({ id: 'p1' });
      await svc.marcarReposicao(TENANT_A, 'ativ-1', 'f1', true, 'u');
      expect(prisma.preOcupacaoAtividadeParticipante.update.mock.calls[0][0].data).toMatchObject({ reposicaoPor: 'u' });
      await svc.marcarReposicao(TENANT_A, 'ativ-1', 'f1', false, 'u');
      expect(prisma.preOcupacaoAtividadeParticipante.update.mock.calls[1][0].data).toEqual({ reposicaoEm: null, reposicaoPor: null });
    });
  });

  describe('detalhe', () => {
    it('lança NotFoundException quando a atividade não pertence ao tenant', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new AtividadesService(prisma, buildAuditMock() as any, {} as any, {} as any);

      prisma.preOcupacaoAtividade.findFirst.mockResolvedValue(null);

      await expect(svc.detalhe(TENANT_A, 'ativ-de-outro-tenant')).rejects.toThrow(NotFoundException);
    });
  });
});
