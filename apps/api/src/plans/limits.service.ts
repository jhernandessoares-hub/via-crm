import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Logger } from '../logger';
import { UsageService, LimitExceededException } from './usage.service';

export interface LimitMap {
  maxUsers?: number;
  monthlyAiLeads?: number;
  monthlyAiMessages?: number;
  maxWaSessions?: number;
  maxSites?: number;
  maxKnowledgeBases?: number;
  maxIngestChannels?: number;
  monthlyCampaigns?: number;
  monthlyCampaignContacts?: number;
  monthlyDocClassifications?: number;
  [key: string]: number | undefined;
}

interface CacheEntry {
  limits: LimitMap;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;

@Injectable()
export class LimitsService {
  private readonly logger = new Logger('LimitsService');
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly usageService: UsageService,
  ) {}

  async resolveLimit(tenantId: string, key: string): Promise<number> {
    const limits = await this.getLimitsForTenant(tenantId);
    const value = limits[key];
    if (value === undefined || value === null) {
      throw new InternalServerErrorException(`Chave de limite desconhecida: ${key}`);
    }
    return value;
  }

  async enforceLimit(tenantId: string, key: string): Promise<void> {
    const limit = await this.resolveLimit(tenantId, key);
    if (limit < 0) return; // -1 = ilimitado
    await this.usageService.enforceLimit(tenantId, key, limit);
  }

  async getLimitsForTenant(tenantId: string): Promise<LimitMap> {
    const cacheKey = tenantId;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.limits;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true, limits: true },
    });

    if (!tenant) throw new InternalServerErrorException('Tenant não encontrado');

    const planConfig = await this.prisma.planConfig.findUnique({
      where: { tier: tenant.plan },
      select: { limits: true },
    });

    const planLimits: LimitMap = (planConfig?.limits as LimitMap) ?? DEFAULT_LIMITS[tenant.plan] ?? DEFAULT_LIMITS.STARTER;
    const overrides: LimitMap = (tenant.limits as LimitMap) ?? {};

    const merged: LimitMap = { ...planLimits, ...overrides };

    this.cache.set(cacheKey, { limits: merged, expiresAt: Date.now() + CACHE_TTL_MS });
    return merged;
  }

  invalidateCache(tenantId?: string): void {
    if (tenantId) {
      this.cache.delete(tenantId);
    } else {
      this.cache.clear();
    }
  }
}

export const DEFAULT_LIMITS: Record<string, LimitMap> = {
  STARTER: {
    maxUsers: 2,
    monthlyAiLeads: 200,
    monthlyAiMessages: -1,
    maxWaSessions: 1,
    maxSites: 1,
    maxKnowledgeBases: -1,
    maxIngestChannels: 12,
    monthlyCampaigns: 1,
    monthlyCampaignContacts: 100,
    monthlyDocClassifications: -1,
  },
  PRO: {
    maxUsers: 5,
    monthlyAiLeads: 400,
    monthlyAiMessages: -1,
    maxWaSessions: 3,
    maxSites: 1,
    maxKnowledgeBases: -1,
    maxIngestChannels: 12,
    monthlyCampaigns: 5,
    monthlyCampaignContacts: 500,
    monthlyDocClassifications: -1,
  },
  BUSINESS: {
    maxUsers: 10,
    monthlyAiLeads: 1200,
    monthlyAiMessages: -1,
    maxWaSessions: 10,
    maxSites: 3,
    maxKnowledgeBases: -1,
    maxIngestChannels: 12,
    monthlyCampaigns: 20,
    monthlyCampaignContacts: 2000,
    monthlyDocClassifications: -1,
  },
};
