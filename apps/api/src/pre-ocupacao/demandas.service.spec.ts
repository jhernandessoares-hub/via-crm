import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DemandasService } from './demandas.service';
import { FamiliasService } from './familias.service';

jest.mock('./pre-ocupacao-upload.util', () => ({
  uploadPreOcupacaoFile: jest.fn().mockResolvedValue({ url: 'https://cloudinary/x', publicId: 'pid-1' }),
}));

function buildPrismaMock() {
  return {
    preOcupacaoOcorrencia: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    preOcupacaoOcorrenciaAnexo: { create: jest.fn() },
    $transaction: jest.fn(),
  };
}

function buildAuditMock() {
  return { log: jest.fn().mockResolvedValue(undefined) };
}

function buildFamiliasServiceMock() {
  return {
    assertFamiliaAccess: jest.fn(),
    ativar: jest.fn(),
  } as unknown as jest.Mocked<FamiliasService>;
}

describe('DemandasService', () => {
  const TENANT_A = 'tenant-a';

  describe('criar', () => {
    it('valida titulo e dataAtendimento obrigatórios', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new DemandasService(prisma, buildAuditMock() as any, buildFamiliasServiceMock());

      await expect(svc.criar(TENANT_A, { titulo: '', dataAtendimento: '2026-08-01' } as any)).rejects.toThrow(
        BadRequestException,
      );
      await expect(svc.criar(TENANT_A, { titulo: 'Assunto', dataAtendimento: '' } as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('valida acesso à família (isolamento) antes de criar, quando familiaId é informado', async () => {
      const prisma: any = buildPrismaMock();
      const familiasService = buildFamiliasServiceMock();
      familiasService.assertFamiliaAccess = jest.fn().mockRejectedValue(new NotFoundException('Família não encontrada.'));
      const svc = new DemandasService(prisma, buildAuditMock() as any, familiasService);

      await expect(
        svc.criar(TENANT_A, { familiaId: 'fam-de-outro-tenant', titulo: 'X', dataAtendimento: '2026-08-01' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(familiasService.assertFamiliaAccess).toHaveBeenCalledWith(TENANT_A, 'fam-de-outro-tenant');
    });

    it('cria a ocorrência com numeração sequencial dentro da transação', async () => {
      const prisma: any = buildPrismaMock();
      const familiasService = buildFamiliasServiceMock();
      familiasService.assertFamiliaAccess = jest.fn().mockResolvedValue({ id: 'fam-1' });
      const svc = new DemandasService(prisma, buildAuditMock() as any, familiasService);

      const tx = {
        tenantPreOcupacaoDemandaCounter: { upsert: jest.fn().mockResolvedValue({ lastNumber: 7 }) },
        preOcupacaoOcorrencia: { create: jest.fn().mockResolvedValue({ id: 'oc-1', numero: 7 }) },
      };
      prisma.$transaction.mockImplementation((cb: any) => cb(tx));

      const result = await svc.criar(TENANT_A, {
        familiaId: 'fam-1',
        titulo: 'Vazamento',
        dataAtendimento: '2026-08-01',
      });

      expect(result).toEqual({ id: 'oc-1', numero: 7 });
      expect(tx.preOcupacaoOcorrencia.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: TENANT_A, numero: 7, familiaId: 'fam-1' }) }),
      );
    });
  });

  describe('vincularFamilia — decisão de produto (ativação implícita)', () => {
    it('ativa a família automaticamente via FamiliasService.ativar quando o lead ainda não tinha família', async () => {
      const prisma: any = buildPrismaMock();
      const familiasService = buildFamiliasServiceMock();
      const svc = new DemandasService(prisma, buildAuditMock() as any, familiasService);

      prisma.preOcupacaoOcorrencia.findFirst.mockResolvedValue({ id: 'oc-1', tenantId: TENANT_A });
      familiasService.ativar = jest.fn().mockResolvedValue({ id: 'fam-nova', leadId: 'lead-1' });
      prisma.preOcupacaoOcorrencia.update.mockResolvedValue({ id: 'oc-1', familiaId: 'fam-nova' });

      const result = await svc.vincularFamilia(TENANT_A, 'oc-1', 'lead-1', 'user-1');

      expect(familiasService.ativar).toHaveBeenCalledWith(TENANT_A, 'lead-1', 'user-1');
      expect(prisma.preOcupacaoOcorrencia.update).toHaveBeenCalledWith({
        where: { id: 'oc-1' },
        data: { familiaId: 'fam-nova' },
      });
      expect(result).toEqual({ id: 'oc-1', familiaId: 'fam-nova' });
    });

    it('é resiliente/idempotente: se a família já existir, FamiliasService.ativar apenas a retorna (sem duplicar)', async () => {
      const prisma: any = buildPrismaMock();
      const familiasService = buildFamiliasServiceMock();
      const svc = new DemandasService(prisma, buildAuditMock() as any, familiasService);

      prisma.preOcupacaoOcorrencia.findFirst.mockResolvedValue({ id: 'oc-1', tenantId: TENANT_A });
      familiasService.ativar = jest.fn().mockResolvedValue({ id: 'fam-existente', leadId: 'lead-1' });
      prisma.preOcupacaoOcorrencia.update.mockResolvedValue({ id: 'oc-1', familiaId: 'fam-existente' });

      await svc.vincularFamilia(TENANT_A, 'oc-1', 'lead-1', 'user-1');
      await svc.vincularFamilia(TENANT_A, 'oc-1', 'lead-1', 'user-1');

      expect(familiasService.ativar).toHaveBeenCalledTimes(2); // idempotência é responsabilidade do FamiliasService
    });

    it('lança BadRequestException se leadId não for informado', async () => {
      const prisma: any = buildPrismaMock();
      const familiasService = buildFamiliasServiceMock();
      const svc = new DemandasService(prisma, buildAuditMock() as any, familiasService);

      prisma.preOcupacaoOcorrencia.findFirst.mockResolvedValue({ id: 'oc-1', tenantId: TENANT_A });

      await expect(svc.vincularFamilia(TENANT_A, 'oc-1', '', 'user-1')).rejects.toThrow(BadRequestException);
      expect(familiasService.ativar).not.toHaveBeenCalled();
    });

    it('lança NotFoundException quando a ocorrência não pertence ao tenant (isolamento)', async () => {
      const prisma: any = buildPrismaMock();
      const familiasService = buildFamiliasServiceMock();
      const svc = new DemandasService(prisma, buildAuditMock() as any, familiasService);

      prisma.preOcupacaoOcorrencia.findFirst.mockResolvedValue(null);

      await expect(svc.vincularFamilia(TENANT_A, 'oc-de-outro-tenant', 'lead-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(familiasService.ativar).not.toHaveBeenCalled();
    });
  });

  describe('listar — filtros', () => {
    it('filtra por status e semFamilia via where do Prisma (tenant sempre presente)', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new DemandasService(prisma, buildAuditMock() as any, buildFamiliasServiceMock());

      prisma.preOcupacaoOcorrencia.findMany.mockResolvedValue([]);

      await svc.listar(TENANT_A, { status: 'ABERTA', semFamilia: true });

      expect(prisma.preOcupacaoOcorrencia.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: TENANT_A, status: 'ABERTA', familiaId: null } }),
      );
    });

    it('filtro "q" casa por nome do lead, CPF ou número da família (aplicado em memória após o findMany)', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new DemandasService(prisma, buildAuditMock() as any, buildFamiliasServiceMock());

      prisma.preOcupacaoOcorrencia.findMany.mockResolvedValue([
        { id: 'oc-1', familia: { numero: 10, lead: { nome: 'João Silva', nomeCorreto: null, cpf: '11122233344' } } },
        { id: 'oc-2', familia: { numero: 20, lead: { nome: 'Maria Souza', nomeCorreto: null, cpf: '99988877766' } } },
        { id: 'oc-3', familia: null },
      ]);

      const porNome = await svc.listar(TENANT_A, { q: 'joão' });
      expect(porNome.map((o) => o.id)).toEqual(['oc-1']);

      const porCpf = await svc.listar(TENANT_A, { q: '999888' });
      expect(porCpf.map((o) => o.id)).toEqual(['oc-2']);

      const porNumero = await svc.listar(TENANT_A, { q: '10' });
      expect(porNumero.map((o) => o.id)).toEqual(['oc-1']);
    });

    it('demanda sem família (familia: null) não quebra o filtro "q"', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new DemandasService(prisma, buildAuditMock() as any, buildFamiliasServiceMock());

      prisma.preOcupacaoOcorrencia.findMany.mockResolvedValue([{ id: 'oc-3', familia: null }]);

      const result = await svc.listar(TENANT_A, { q: 'qualquer' });
      expect(result).toEqual([]);
    });
  });

  describe('isolamento em detalhe/encerrar/adicionarAnexo', () => {
    it('detalhe() lança NotFoundException quando a ocorrência é de outro tenant', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new DemandasService(prisma, buildAuditMock() as any, buildFamiliasServiceMock());

      prisma.preOcupacaoOcorrencia.findFirst.mockResolvedValue(null);

      await expect(svc.detalhe(TENANT_A, 'oc-de-outro-tenant')).rejects.toThrow(NotFoundException);
      expect(prisma.preOcupacaoOcorrencia.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'oc-de-outro-tenant', tenantId: TENANT_A } }),
      );
    });

    it('encerrar() lança NotFoundException quando a ocorrência é de outro tenant', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new DemandasService(prisma, buildAuditMock() as any, buildFamiliasServiceMock());

      prisma.preOcupacaoOcorrencia.findFirst.mockResolvedValue(null);

      await expect(svc.encerrar(TENANT_A, 'oc-de-outro-tenant', {})).rejects.toThrow(NotFoundException);
      expect(prisma.preOcupacaoOcorrencia.update).not.toHaveBeenCalled();
    });

    it('adicionarAnexo() exige o arquivo e valida a ocorrência pelo tenant', async () => {
      const prisma: any = buildPrismaMock();
      const svc = new DemandasService(prisma, buildAuditMock() as any, buildFamiliasServiceMock());

      prisma.preOcupacaoOcorrencia.findFirst.mockResolvedValue({ id: 'oc-1', tenantId: TENANT_A });
      await expect(svc.adicionarAnexo(TENANT_A, 'oc-1', null)).rejects.toThrow(BadRequestException);

      prisma.preOcupacaoOcorrencia.findFirst.mockResolvedValue(null);
      await expect(
        svc.adicionarAnexo(TENANT_A, 'oc-de-outro-tenant', { originalname: 'f.jpg', mimetype: 'image/jpeg' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
