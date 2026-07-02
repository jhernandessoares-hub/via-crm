import { BadRequestException } from '@nestjs/common';
import { EntregaveisService } from './entregaveis.service';

function buildPrismaMock() {
  return {
    preOcupacaoEntregavelMensal: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    preOcupacaoEntregavelVersao: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    preOcupacaoAtividade: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
}

function buildAuditMock() {
  return { log: jest.fn().mockResolvedValue(undefined) };
}

describe('EntregaveisService', () => {
  const TENANT_A = 'tenant-a';

  describe('validação de competência', () => {
    it.each(['2026-13', '2026-00', '26-08', '2026/08', '', 'abc'])(
      'rejeita competência inválida: %s',
      async (competencia) => {
        const prisma: any = buildPrismaMock();
        const svc = new EntregaveisService(prisma, buildAuditMock() as any);
        await expect(svc.agregarCompetencia(TENANT_A, competencia)).rejects.toThrow(BadRequestException);
      },
    );

    it('aceita competência válida YYYY-MM', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new EntregaveisService(prisma, buildAuditMock() as any);
      prisma.preOcupacaoAtividade.findMany.mockResolvedValue([]);

      await expect(svc.agregarCompetencia(TENANT_A, '2026-08')).resolves.toBeDefined();
    });
  });

  describe('agregarCompetencia', () => {
    it('filtra atividades pela janela do mês (início inclusivo, próximo mês exclusivo) e agrega anexos/fichas', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new EntregaveisService(prisma, buildAuditMock() as any);

      prisma.preOcupacaoAtividade.findMany.mockResolvedValue([
        {
          id: 'ativ-1',
          categoria: 'DIAGNOSTICO',
          titulo: null,
          dataAgendada: new Date('2026-08-15'),
          relatorio: 'Relatório da sessão',
          anexos: [{ id: 'a1', tipo: 'LISTA_PRESENCA' }, { id: 'a2', tipo: 'FOTO' }],
          participantes: [
            {
              familiaId: 'f1',
              avaliacao: 'BOM',
              familia: { lead: { nome: 'João', nomeCorreto: null } },
              anexos: [{ id: 'ficha-1' }],
            },
          ],
        },
      ]);

      const result = await svc.agregarCompetencia(TENANT_A, '2026-08');

      expect(prisma.preOcupacaoAtividade.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT_A, dataAgendada: { gte: new Date(2026, 7, 1), lt: new Date(2026, 8, 1) } },
        }),
      );
      expect(result.totalSessoes).toBe(1);
      expect(result.listasPresenca).toHaveLength(1);
      expect(result.fotosVideos).toHaveLength(1);
      expect(result.fichasIndividuais).toHaveLength(1);
      expect(result.fichasIndividuais[0].nomeFamilia).toBe('João');
      expect(result.relatorioConsolidado).toContain('Relatório da sessão');
    });
  });

  describe('gerarVersao', () => {
    it('incrementa a versão sequencialmente por competência', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new EntregaveisService(prisma, buildAuditMock() as any);

      const tx = {
        preOcupacaoEntregavelMensal: {
          findUnique: jest.fn().mockResolvedValue({ id: 'mensal-1', tenantId: TENANT_A, competencia: '2026-08' }),
        },
        preOcupacaoEntregavelVersao: {
          findFirst: jest.fn().mockResolvedValue({ versao: 2 }),
          create: jest.fn().mockResolvedValue({ id: 'versao-3', versao: 3 }),
        },
        preOcupacaoAtividade: { findMany: jest.fn().mockResolvedValue([]) },
      };
      prisma.$transaction.mockImplementation((cb: any) => cb(tx));

      const result = await svc.gerarVersao(TENANT_A, '2026-08', 'user-1');

      expect(tx.preOcupacaoEntregavelVersao.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ versao: 3, tenantId: TENANT_A }) }),
      );
      expect(result.versao.versao).toBe(3);
    });

    it('cria o Mensal se ainda não existir para a competência', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new EntregaveisService(prisma, buildAuditMock() as any);

      const tx = {
        preOcupacaoEntregavelMensal: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'mensal-novo', tenantId: TENANT_A, competencia: '2026-09' }),
        },
        preOcupacaoEntregavelVersao: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'versao-1', versao: 1 }),
        },
        preOcupacaoAtividade: { findMany: jest.fn().mockResolvedValue([]) },
      };
      prisma.$transaction.mockImplementation((cb: any) => cb(tx));

      const result = await svc.gerarVersao(TENANT_A, '2026-09', 'user-1');

      expect(tx.preOcupacaoEntregavelMensal.create).toHaveBeenCalledWith({
        data: { tenantId: TENANT_A, competencia: '2026-09' },
      });
      expect(result.versao.versao).toBe(1);
    });

    it('deixa claro no dado que o ZIP é um placeholder (arquivoUrl vazio + publicId marcador PENDENTE_ZIP)', async () => {
      // Confirma que a pendência conhecida (ZIP real não implementado) está sinalizada
      // de forma explícita no dado persistido — não é bug, é decisão documentada no código.
      const prisma: any = buildPrismaMock();
      const svc = new EntregaveisService(prisma, buildAuditMock() as any);

      let capturedData: any;
      const tx = {
        preOcupacaoEntregavelMensal: {
          findUnique: jest.fn().mockResolvedValue({ id: 'mensal-1', tenantId: TENANT_A, competencia: '2026-08' }),
        },
        preOcupacaoEntregavelVersao: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation(({ data }: any) => {
            capturedData = data;
            return Promise.resolve({ id: 'versao-1', ...data });
          }),
        },
        preOcupacaoAtividade: { findMany: jest.fn().mockResolvedValue([]) },
      };
      prisma.$transaction.mockImplementation((cb: any) => cb(tx));

      await svc.gerarVersao(TENANT_A, '2026-08', 'user-1');

      expect(capturedData.arquivoUrl).toBe('');
      expect(capturedData.publicId).toMatch(/^PENDENTE_ZIP:/);
    });
  });

  describe('atualizarStatus', () => {
    it('exige status no body', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new EntregaveisService(prisma, buildAuditMock() as any);

      await expect(svc.atualizarStatus(TENANT_A, '2026-08', {} as any)).rejects.toThrow(BadRequestException);
    });

    it('registra enviadoEm/enviadoPor apenas quando status é ENVIADO', async () => {
      const prisma: any = buildPrismaMock();
      const audit = buildAuditMock();
      const svc = new EntregaveisService(prisma, audit as any);

      prisma.preOcupacaoEntregavelMensal.findUnique.mockResolvedValue({ id: 'mensal-1' });
      prisma.preOcupacaoEntregavelMensal.update.mockResolvedValue({ id: 'mensal-1', status: 'ENVIADO' });

      await svc.atualizarStatus(TENANT_A, '2026-08', { status: 'ENVIADO', enviadoPor: 'user-1' });

      expect(prisma.preOcupacaoEntregavelMensal.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'ENVIADO', enviadoPor: 'user-1', enviadoEm: expect.any(Date) }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'PRE_OCUPACAO_ENVIAR_ENTREGAVEL' }));
    });

    it('não grava enviadoEm quando status não é ENVIADO', async () => {
      const prisma: any = buildPrismaMock();
      const audit = buildAuditMock();
      const svc = new EntregaveisService(prisma, audit as any);

      prisma.preOcupacaoEntregavelMensal.findUnique.mockResolvedValue({ id: 'mensal-1' });
      prisma.preOcupacaoEntregavelMensal.update.mockResolvedValue({ id: 'mensal-1', status: 'CONSOLIDADO' });

      await svc.atualizarStatus(TENANT_A, '2026-08', { status: 'CONSOLIDADO' });

      expect(prisma.preOcupacaoEntregavelMensal.update).toHaveBeenCalledWith({
        where: { id: 'mensal-1' },
        data: { status: 'CONSOLIDADO' },
      });
      expect(audit.log).not.toHaveBeenCalled();
    });
  });
});
