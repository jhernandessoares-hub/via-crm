import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AddonGuard, ADDON_KEY } from '../auth/plan.guard';
import {
  FamiliasController,
} from './familias.controller';
import { AtividadesController } from './atividades.controller';
import { EntregaveisController } from './entregaveis.controller';
import { DemandasController } from './demandas.controller';

/**
 * Confirma que os 4 controllers do módulo Pré-Ocupação realmente bloqueiam
 * (403) tenants sem o addon 'PRE_OCUPACAO' — não só o decorator declarado,
 * mas o comportamento do guard em runtime.
 */
describe('AddonGuard aplicado no módulo Pré-Ocupação', () => {
  function buildContext(tenantId: string, controllerClass: Function): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ user: { tenantId } }) }),
      getHandler: () => function handler() {},
      getClass: () => controllerClass,
    } as unknown as ExecutionContext;
  }

  it.each([
    ['FamiliasController', FamiliasController],
    ['AtividadesController', AtividadesController],
    ['EntregaveisController', EntregaveisController],
    ['DemandasController', DemandasController],
  ])('%s declara @RequiresAddon("PRE_OCUPACAO") na classe', (_name, controllerClass: any) => {
    const reflector = new Reflector();
    const required = reflector.get(ADDON_KEY, controllerClass);
    expect(required).toBe('PRE_OCUPACAO');
  });

  it('bloqueia com 403 (ForbiddenException) quando o tenant não tem o addon PRE_OCUPACAO', async () => {
    const prisma: any = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ plan: 'BUSINESS', addons: [] }) },
    };
    const guard = new AddonGuard(new Reflector(), prisma);
    const ctx = buildContext('tenant-sem-addon', FamiliasController);

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('permite acesso quando o tenant tem o addon PRE_OCUPACAO', async () => {
    const prisma: any = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ plan: 'BUSINESS', addons: ['PRE_OCUPACAO'] }) },
    };
    const guard = new AddonGuard(new Reflector(), prisma);
    const ctx = buildContext('tenant-com-addon', FamiliasController);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('bloqueia com 403 quando o tenant não existe mais (findUnique retorna null)', async () => {
    const prisma: any = { tenant: { findUnique: jest.fn().mockResolvedValue(null) } };
    const guard = new AddonGuard(new Reflector(), prisma);
    const ctx = buildContext('tenant-inexistente', DemandasController);

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('bloqueia com 403 quando req.user.tenantId está ausente (defesa contra guard mal encadeado)', async () => {
    const prisma: any = { tenant: { findUnique: jest.fn() } };
    const guard = new AddonGuard(new Reflector(), prisma);
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ user: {} }) }),
      getHandler: () => function handler() {},
      getClass: () => AtividadesController,
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });
});
