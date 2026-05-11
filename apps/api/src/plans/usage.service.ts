import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Logger } from '../logger';

export interface UsageInfo {
  used: number;
  limit: number;
  remaining: number;
  percent: number;
  willResetAt?: Date;
}

export class LimitExceededException extends ForbiddenException {
  constructor(
    public readonly key: string,
    public readonly used: number,
    public readonly limit: number,
    public readonly willResetAt?: Date,
  ) {
    super({
      error: 'LIMIT_EXCEEDED',
      key,
      used,
      limit,
      willResetAt,
      message: `Limite de ${key} atingido (${used}/${limit}).`,
    });
  }
}

@Injectable()
export class UsageService {
  private readonly logger = new Logger('UsageService');

  constructor(private readonly prisma: PrismaService) {}

  static currentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  static nextResetAt(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  }

  private isMonthly(key: string): boolean {
    return MONTHLY_KEYS.has(key);
  }

  async getCounter(tenantId: string, key: string): Promise<number> {
    const period = this.isMonthly(key) ? UsageService.currentPeriod() : null;
    const row = await this.prisma.usageCounter.findUnique({
      where: { tenantId_key_period: { tenantId, key, periodYearMonth: period ?? '' } },
      select: { value: true },
    });
    return row?.value ?? 0;
  }

  async getUsage(
    tenantId: string,
    key: string,
    limit: number,
  ): Promise<UsageInfo> {
    const used = await this.getCounter(tenantId, key);
    const remaining = Math.max(0, limit - used);
    const percent = limit > 0 ? Math.round((used / limit) * 100) : 0;
    const monthly = this.isMonthly(key);
    return {
      used,
      limit,
      remaining,
      percent,
      willResetAt: monthly ? UsageService.nextResetAt() : undefined,
    };
  }

  async incrementUsage(tenantId: string, key: string, by = 1): Promise<number> {
    const period = this.isMonthly(key) ? UsageService.currentPeriod() : null;
    const row = await this.prisma.usageCounter.upsert({
      where: { tenantId_key_period: { tenantId, key, periodYearMonth: period ?? '' } },
      create: { tenantId, key, periodYearMonth: period ?? '', value: by },
      update: { value: { increment: by } },
    });
    return row.value;
  }

  async decrementUsage(tenantId: string, key: string, by = 1): Promise<void> {
    const period = this.isMonthly(key) ? UsageService.currentPeriod() : null;
    await this.prisma.usageCounter.upsert({
      where: { tenantId_key_period: { tenantId, key, periodYearMonth: period ?? '' } },
      create: { tenantId, key, periodYearMonth: period ?? '', value: 0 },
      update: { value: { decrement: by } },
    });
  }

  async enforceLimit(tenantId: string, key: string, limit: number): Promise<void> {
    const used = await this.getCounter(tenantId, key);
    if (used >= limit) {
      const monthly = this.isMonthly(key);
      throw new LimitExceededException(
        key,
        used,
        limit,
        monthly ? UsageService.nextResetAt() : undefined,
      );
    }
  }

  async rolloverMonthlyCounters(): Promise<number> {
    const period = UsageService.currentPeriod();
    const previousPeriods = await this.prisma.usageCounter.findMany({
      where: {
        key: { in: Array.from(MONTHLY_KEYS) },
        periodYearMonth: { not: period },
      },
      select: { id: true },
    });
    if (previousPeriods.length === 0) return 0;
    await this.prisma.usageCounter.deleteMany({
      where: { id: { in: previousPeriods.map((r) => r.id) } },
    });
    this.logger.log(`Rollover: removidos ${previousPeriods.length} contadores mensais de períodos anteriores`);
    return previousPeriods.length;
  }
}

export const MONTHLY_KEYS = new Set([
  'monthlyAiLeads',
  'monthlyAiMessages',
  'monthlyCampaigns',
  'monthlyCampaignContacts',
  'monthlyDocClassifications',
]);

export const ABSOLUTE_KEYS = new Set([
  'totalUsers',
  'waSessionsConnected',
  'sitesPublished',
]);

export const ALL_USAGE_KEYS = [...MONTHLY_KEYS, ...ABSOLUTE_KEYS];
