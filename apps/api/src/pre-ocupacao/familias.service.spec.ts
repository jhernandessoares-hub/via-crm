import { NotFoundException } from '@nestjs/common';
import { FamiliasService } from './familias.service';


function buildPrismaMock() {
  return {
    lead: { findFirst: jest.fn() },
    preOcupacaoFamilia: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    preOcupacaoAtividadeParticipante: { findMany: jest.fn() },
    preOcupacaoOcorrencia: { findMany: jest.fn().mockResolvedValue([]) },
    preOcupacaoQuestionario: { findMany: jest.fn().mockResolvedValue([]) },
    preOcupacaoQuestionarioEnvio: { findMany: jest.fn().mockResolvedValue([]) },
    developmentUnit: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(),
  };
}

const atendimentosMock = { contarPorFamilia: jest.fn().mockResolvedValue(new Map()) };

function buildAuditMock() {
  return { log: jest.fn().mockResolvedValue(undefined) };
}

describe('FamiliasService', () => {
  const TENANT_A = 'tenant-a';
  const TENANT_B = 'tenant-b';

  describe('ativar', () => {
    it('cria uma família nova quando o lead existe no tenant e ainda não foi ativado', async () => {
      const prisma: any = buildPrismaMock();
      const audit = buildAuditMock();
      const svc = new FamiliasService(prisma, audit as any, atendimentosMock as any);

      prisma.lead.findFirst.mockResolvedValue({ id: 'lead-1' });
      prisma.preOcupacaoFamilia.findUnique.mockResolvedValue(null);

      const tx = {
        tenantPreOcupacaoFamiliaCounter: { upsert: jest.fn().mockResolvedValue({ lastNumber: 1 }) },
        preOcupacaoFamilia: { create: jest.fn().mockResolvedValue({ id: 'fam-1', numero: 1, leadId: 'lead-1', tenantId: TENANT_A }) },
      };
      prisma.$transaction.mockImplementation((cb: any) => cb(tx));

      const result = await svc.ativar(TENANT_A, 'lead-1', 'user-1');

      expect(prisma.lead.findFirst).toHaveBeenCalledWith({
        where: { id: 'lead-1', tenantId: TENANT_A, deletedAt: null },
        select: { id: true },
      });
      expect(tx.preOcupacaoFamilia.create).toHaveBeenCalledWith({
        data: { tenantId: TENANT_A, leadId: 'lead-1', numero: 1, ativadoPor: 'user-1' },
      });
      expect(result).toEqual({ id: 'fam-1', numero: 1, leadId: 'lead-1', tenantId: TENANT_A });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PRE_OCUPACAO_ATIVAR_FAMILIA', tenantId: TENANT_A }),
      );
    });

    it('é idempotente: chamar duas vezes para o mesmo lead retorna a família existente sem criar outra nem estourar erro', async () => {
      const prisma: any = buildPrismaMock();
      const audit = buildAuditMock();
      const svc = new FamiliasService(prisma, audit as any, atendimentosMock as any);

      const existing = { id: 'fam-1', numero: 1, leadId: 'lead-1', tenantId: TENANT_A };
      prisma.lead.findFirst.mockResolvedValue({ id: 'lead-1' });
      prisma.preOcupacaoFamilia.findUnique.mockResolvedValue(existing);

      const result = await svc.ativar(TENANT_A, 'lead-1', 'user-1');

      expect(result).toBe(existing);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('lança NotFoundException quando o lead não existe no tenant informado (isolamento)', async () => {
      const prisma: any = buildPrismaMock();
      const audit = buildAuditMock();
      const svc = new FamiliasService(prisma, audit as any, atendimentosMock as any);

      // Simula lead que pertence a outro tenant: findFirst filtrado por tenantId não encontra nada.
      prisma.lead.findFirst.mockResolvedValue(null);

      await expect(svc.ativar(TENANT_A, 'lead-de-outro-tenant', 'user-1')).rejects.toThrow(NotFoundException);
      expect(prisma.preOcupacaoFamilia.findUnique).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('usa "desconhecido" como ativadoPor quando nada é informado', async () => {
      const prisma: any = buildPrismaMock();
      const audit = buildAuditMock();
      const svc = new FamiliasService(prisma, audit as any, atendimentosMock as any);

      prisma.lead.findFirst.mockResolvedValue({ id: 'lead-1' });
      prisma.preOcupacaoFamilia.findUnique.mockResolvedValue(null);
      const tx = {
        tenantPreOcupacaoFamiliaCounter: { upsert: jest.fn().mockResolvedValue({ lastNumber: 1 }) },
        preOcupacaoFamilia: { create: jest.fn().mockResolvedValue({ id: 'fam-1', numero: 1 }) },
      };
      prisma.$transaction.mockImplementation((cb: any) => cb(tx));

      await svc.ativar(TENANT_A, 'lead-1', '');

      expect(tx.preOcupacaoFamilia.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ ativadoPor: 'desconhecido' }) }),
      );
    });
  });

  describe('detalhe / assertFamiliaAccess — isolamento multi-tenant', () => {
    it('detalhe() filtra por tenantId e lança NotFoundException se a família pertence a outro tenant', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new FamiliasService(prisma, buildAuditMock() as any, atendimentosMock as any);

      prisma.preOcupacaoFamilia.findFirst.mockResolvedValue(null);

      await expect(svc.detalhe(TENANT_A, 'fam-do-tenant-b')).rejects.toThrow(NotFoundException);
      expect(prisma.preOcupacaoFamilia.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'fam-do-tenant-b', tenantId: TENANT_A } }),
      );
    });

    it('assertFamiliaAccess() lança NotFoundException se a família não pertence ao tenant', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new FamiliasService(prisma, buildAuditMock() as any, atendimentosMock as any);

      prisma.preOcupacaoFamilia.findFirst.mockResolvedValue(null);

      await expect(svc.assertFamiliaAccess(TENANT_A, 'fam-do-tenant-b')).rejects.toThrow(NotFoundException);
      expect(prisma.preOcupacaoFamilia.findFirst).toHaveBeenCalledWith({
        where: { id: 'fam-do-tenant-b', tenantId: TENANT_A },
      });
    });

    it('assertFamiliaAccess() retorna a família quando pertence ao tenant', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new FamiliasService(prisma, buildAuditMock() as any, atendimentosMock as any);

      const familia = { id: 'fam-1', tenantId: TENANT_A };
      prisma.preOcupacaoFamilia.findFirst.mockResolvedValue(familia);

      const result = await svc.assertFamiliaAccess(TENANT_A, 'fam-1');
      expect(result).toBe(familia);
    });
  });

  describe('listar — dashboard agregado', () => {
    it('soma emDia/comPendencia sobre TODAS as famílias do tenant, não só a página atual', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new FamiliasService(prisma, buildAuditMock() as any, atendimentosMock as any);

      // 3 famílias no tenant inteiro; só pedimos take=1 (paginação pequena)
      prisma.preOcupacaoFamilia.findMany.mockResolvedValue([
        { id: 'f1', numero: 1, leadId: 'l1', lead: { nome: 'A', nomeCorreto: null, cpf: null }, status: 'ATIVA' },
        { id: 'f2', numero: 2, leadId: 'l2', lead: { nome: 'B', nomeCorreto: null, cpf: null }, status: 'ATIVA' },
        { id: 'f3', numero: 3, leadId: 'l3', lead: { nome: 'C', nomeCorreto: null, cpf: null }, status: 'ATIVA' },
      ]);
      // f1: presente; f2: faltou; f3: sem participações
      const atividade = { id: 'a1', titulo: 'Oficina', categoria: 'GERACAO_RENDA', dataAgendada: new Date('2026-10-31') };
      prisma.preOcupacaoAtividadeParticipante.findMany.mockResolvedValue([
        { familiaId: 'f1', status: 'CONCLUIDA', reposicaoEm: null, atividade },
        { familiaId: 'f2', status: 'FALTOU', reposicaoEm: null, atividade },
      ]);

      const result = await svc.listar(TENANT_A, 1, 0);

      expect(result.dashboard).toMatchObject({ total: 3, emDia: 2, comPendencia: 1, atendimentos: 0 });
      expect(result.dashboard.pendencias.familiasComFalta).toBe(1);
      expect(result.dashboard.pendencias.faltasPorSessao).toEqual([
        { id: 'a1', titulo: 'Oficina', data: atividade.dataAgendada, familias: 1 },
      ]);
      expect(result.items).toHaveLength(1); // página respeitando take=1
      expect(prisma.preOcupacaoFamilia.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: TENANT_A } }),
      );
    });

    it('conta quantas famílias ativas ainda devem cada questionário publicado, separando quem não recebeu', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new FamiliasService(prisma, buildAuditMock() as any, atendimentosMock as any);
      const lead = { nome: 'A', nomeCorreto: null, cpf: null };
      prisma.preOcupacaoFamilia.findMany.mockResolvedValue([
        { id: 'f1', numero: 1, leadId: 'l1', lead, status: 'ATIVA' }, // respondeu
        { id: 'f2', numero: 2, leadId: 'l2', lead, status: 'ATIVA' }, // recebeu e não respondeu
        { id: 'f3', numero: 3, leadId: 'l3', lead, status: 'ATIVA' }, // nunca enviado
        { id: 'f4', numero: 4, leadId: 'l4', lead, status: 'INATIVA' }, // fora da conta
      ]);
      prisma.preOcupacaoAtividadeParticipante.findMany.mockResolvedValue([]);
      prisma.preOcupacaoQuestionario.findMany.mockResolvedValue([{ id: 'q1', titulo: 'Psicossocial' }]);
      const base = { questionarioId: 'q1', statusEnvio: 'ENVIADO', agendadoPara: null, linkAbertoEm: null, iniciadoEm: null, entregueEm: new Date() };
      prisma.preOcupacaoQuestionarioEnvio.findMany.mockResolvedValue([
        { ...base, familiaId: 'f1', respondidoEm: new Date() },
        { ...base, familiaId: 'f2', respondidoEm: null },
      ]);

      const { dashboard, items } = await svc.listar(TENANT_A);

      expect(dashboard.pendencias.questionarios).toEqual([
        { id: 'q1', titulo: 'Psicossocial', total: 3, pendentes: 2, responderam: 1, naoEnviados: 1 },
      ]);
      expect(dashboard.pendencias.familiasSemResponder).toBe(2);
      expect(items.map((i) => i.status)).toEqual(['EM_DIA', 'COM_PENDENCIA', 'COM_PENDENCIA', 'EM_DIA']);
      expect(prisma.preOcupacaoQuestionario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: TENANT_A, status: 'PUBLICADO' } }),
      );
      expect(prisma.preOcupacaoQuestionarioEnvio.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_A, teste: false }) }),
      );
    });

    it('falta com reposição não deixa a família pendente, mas continua no total de faltas', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new FamiliasService(prisma, buildAuditMock() as any, atendimentosMock as any);
      prisma.preOcupacaoFamilia.findMany.mockResolvedValue([
        { id: 'f1', numero: 1, leadId: 'l1', lead: { nome: 'A', nomeCorreto: null, cpf: null }, status: 'ATIVA' },
      ]);
      prisma.preOcupacaoAtividadeParticipante.findMany.mockResolvedValue([
        {
          familiaId: 'f1',
          status: 'FALTOU',
          reposicaoEm: new Date(),
          atividade: { id: 'a1', titulo: 'Oficina', categoria: 'GERACAO_RENDA', dataAgendada: new Date() },
        },
      ]);

      const { items } = await svc.listar(TENANT_A);
      expect(items[0]).toMatchObject({ status: 'EM_DIA', faltas: 1, faltasAbertas: 0, pendencias: [] });
    });

    it('sem paginação (take indefinido) retorna todos os itens', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new FamiliasService(prisma, buildAuditMock() as any, atendimentosMock as any);

      prisma.preOcupacaoFamilia.findMany.mockResolvedValue([
        { id: 'f1', numero: 1, leadId: 'l1', lead: { nome: 'A', nomeCorreto: null, cpf: null }, status: 'ATIVA' },
      ]);
      prisma.preOcupacaoAtividadeParticipante.findMany.mockResolvedValue([]);

      const result = await svc.listar(TENANT_A);
      expect(result.items).toHaveLength(1);
    });

    it('prioriza nomeCorreto sobre nome quando presente', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new FamiliasService(prisma, buildAuditMock() as any, atendimentosMock as any);

      prisma.preOcupacaoFamilia.findMany.mockResolvedValue([
        { id: 'f1', numero: 1, leadId: 'l1', lead: { nome: 'Nome Cadastro', nomeCorreto: 'Nome Correto', cpf: null }, status: 'ATIVA' },
      ]);
      prisma.preOcupacaoAtividadeParticipante.findMany.mockResolvedValue([]);

      const result = await svc.listar(TENANT_A);
      expect(result.items[0].nome).toBe('Nome Correto');
    });
  });

  describe('resumoPorLead', () => {
    it('retorna { ativada: false } quando o lead não tem família ativada no tenant', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new FamiliasService(prisma, buildAuditMock() as any, atendimentosMock as any);

      prisma.preOcupacaoFamilia.findFirst.mockResolvedValue(null);

      const result = await svc.resumoPorLead(TENANT_A, 'lead-1');
      expect(result).toEqual({ ativada: false });
      expect(prisma.preOcupacaoAtividadeParticipante.findMany).not.toHaveBeenCalled();
    });
  });
});
