import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';

export type PlanTier = 'STARTER' | 'PRO' | 'BUSINESS';

export const PLAN_KEY = 'requires_plan';
export const ADDON_KEY = 'requires_addon';

export const RequiresPlan = (plan: PlanTier) => SetMetadata(PLAN_KEY, plan);
export const RequiresAddon = (addon: string) => SetMetadata(ADDON_KEY, addon);

const PLAN_RANK: Record<PlanTier, number> = {
  STARTER: 0,
  PRO: 1,
  BUSINESS: 2,
};

@Injectable()
export class PlanGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<PlanTier>(PLAN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required) return true;

    const req = context.switchToHttp().getRequest();
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw new ForbiddenException('Tenant não identificado.');

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true },
    });

    const tenantPlan = (tenant?.plan as PlanTier) || 'STARTER';
    const tenantRank = PLAN_RANK[tenantPlan] ?? 0;
    const requiredRank = PLAN_RANK[required] ?? 0;

    if (tenantRank < requiredRank) {
      throw new ForbiddenException(
        `Esta funcionalidade requer o plano ${required}. Seu plano atual é ${tenantPlan}.`,
      );
    }

    return true;
  }
}

@Injectable()
export class AddonGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string>(ADDON_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required) return true;

    const req = context.switchToHttp().getRequest();
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw new ForbiddenException('Tenant não identificado.');

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true, addons: true },
    });

    if (!tenant) throw new ForbiddenException('Tenant não encontrado.');

    if (!tenant.addons.includes(required)) {
      throw new ForbiddenException(
        `Esta funcionalidade requer o add-on ${required}.`,
      );
    }

    return true;
  }
}
