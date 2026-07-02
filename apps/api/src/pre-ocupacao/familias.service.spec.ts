import { NotFoundException } from '@nestjs/common';
import { FamiliasService } from './familias.service';

function buildPrismaMock() {
  return {
    lead: { findFirst: jest.fn() },
    preOcupacaoFamilia: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    preOcupacaoAtividadeParticipante: { findMany: jest.fn() },
    preOcupacaoOcorrencia: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
}

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
      const svc = new FamiliasService(prisma, audit as any);

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
      const svc = new FamiliasService(prisma, audit as any);

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
      const svc = new FamiliasService(prisma, audit as any);

      // Simula lead que pertence a outro tenant: findFirst filtrado por tenantId não encontra nada.
      prisma.lead.findFirst.mockResolvedValue(null);

      await expect(svc.ativar(TENANT_A, 'lead-de-outro-tenant', 'user-1')).rejects.toThrow(NotFoundException);
      expect(prisma.preOcupacaoFamilia.findUnique).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('usa "desconhecido" como ativadoPor quando nada é informado', async () => {
      const prisma: any = buildPrismaMock();
      const audit = buildAuditMock();
      const svc = new FamiliasService(prisma, audit as any);

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
      const svc = new FamiliasService(prisma, buildAuditMock() as any);

      prisma.preOcupacaoFamilia.findFirst.mockResolvedValue(null);

      await expect(svc.detalhe(TENANT_A, 'fam-do-tenant-b')).rejects.toThrow(NotFoundException);
      expect(prisma.preOcupacaoFamilia.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'fam-do-tenant-b', tenantId: TENANT_A } }),
      );
    });

    it('assertFamiliaAccess() lança NotFoundException se a família não pertence ao tenant', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new FamiliasService(prisma, buildAuditMock() as any);

      prisma.preOcupacaoFamilia.findFirst.mockResolvedValue(null);

      await expect(svc.assertFamiliaAccess(TENANT_A, 'fam-do-tenant-b')).rejects.toThrow(NotFoundException);
      expect(prisma.preOcupacaoFamilia.findFirst).toHaveBeenCalledWith({
        where: { id: 'fam-do-tenant-b', tenantId: TENANT_A },
      });
    });

    it('assertFamiliaAccess() retorna a família quando pertence ao tenant', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new FamiliasService(prisma, buildAuditMock() as any);

      const familia = { id: 'fam-1', tenantId: TENANT_A };
      prisma.preOcupacaoFamilia.findFirst.mockResolvedValue(familia);

      const result = await svc.assertFamiliaAccess(TENANT_A, 'fam-1');
      expect(result).toBe(familia);
    });
  });

  describe('listar — dashboard agregado', () => {
    it('soma emDia/comPendencia sobre TODAS as famílias do tenant, não só a página atual', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new FamiliasService(prisma, buildAuditMock() as any);

      // 3 famílias no tenant inteiro; só pedimos take=1 (paginação pequena)
      prisma.preOcupacaoFamilia.findMany.mockResolvedValue([
        { id: 'f1', numero: 1, leadId: 'l1', lead: { nome: 'A', nomeCorreto: null, cpf: null }, status: 'ATIVA' },
        { id: 'f2', numero: 2, leadId: 'l2', lead: { nome: 'B', nomeCorreto: null, cpf: null }, status: 'ATIVA' },
        { id: 'f3', numero: 3, leadId: 'l3', lead: { nome: 'C', nomeCorreto: null, cpf: null }, status: 'ATIVA' },
      ]);
      // f1: sem pendência; f2: com PENDENTE; f3: sem participações
      prisma.preOcupacaoAtividadeParticipante.findMany.mockResolvedValue([
        { familiaId: 'f1', status: 'CONCLUIDA' },
        { familiaId: 'f2', status: 'PENDENTE' },
      ]);

      const result = await svc.listar(TENANT_A, 1, 0);

      expect(result.dashboard).toEqual({ total: 3, emDia: 2, comPendencia: 1 });
      expect(result.items).toHaveLength(1); // página respeitando take=1
      expect(prisma.preOcupacaoFamilia.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: TENANT_A } }),
      );
    });

    it('sem paginação (take indefinido) retorna todos os itens', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new FamiliasService(prisma, buildAuditMock() as any);

      prisma.preOcupacaoFamilia.findMany.mockResolvedValue([
        { id: 'f1', numero: 1, leadId: 'l1', lead: { nome: 'A', nomeCorreto: null, cpf: null }, status: 'ATIVA' },
      ]);
      prisma.preOcupacaoAtividadeParticipante.findMany.mockResolvedValue([]);

      const result = await svc.listar(TENANT_A);
      expect(result.items).toHaveLength(1);
    });

    it('prioriza nomeCorreto sobre nome quando presente', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new FamiliasService(prisma, buildAuditMock() as any);

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
      const svc = new FamiliasService(prisma, buildAuditMock() as any);

      prisma.preOcupacaoFamilia.findFirst.mockResolvedValue(null);

      const result = await svc.resumoPorLead(TENANT_A, 'lead-1');
      expect(result).toEqual({ ativada: false });
      expect(prisma.preOcupacaoAtividadeParticipante.findMany).not.toHaveBeenCalled();
    });
  });
});
