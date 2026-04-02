import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';

export type PlanTier = 'STARTER' | 'PREMIUM';

export const PLAN_KEY = 'requires_plan';

/** Mark a route/controller as requiring a minimum plan tier. */
export const RequiresPlan = (plan: PlanTier) => SetMetadata(PLAN_KEY, plan);

const PLAN_RANK: Record<PlanTier, number> = {
  STARTER: 0,
  PREMIUM: 1,
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

    // No plan restriction on this route
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
