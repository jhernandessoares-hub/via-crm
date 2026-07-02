import { PrismaClient, PlanTier } from '@prisma/client';
import { DEFAULT_LIMITS } from './limits.service';

const PLAN_PRICES = {
  STARTER: { months3: 29700, months6: 26700, months12: 23800 },
  PRO:     { months3: 79700, months6: 71700, months12: 63800 },
  BUSINESS:{ months3: 199700, months6: 179700, months12: 159800 },
};

const ADDON_CONFIGS = [
  {
    key: 'DEVELOPMENTS',
    name: 'Gestão de Empreendimentos',
    description: 'Espelho de vendas 2D/3D, passeio FPS, dashboard VSO/VGV, condições de pagamento.',
    limits: null,
    prices: { months3: 99700, months6: 89700, months12: 79800 },
    requiresTier: 'BUSINESS' as PlanTier,
    active: true,
  },
  {
    key: 'PRE_OCUPACAO',
    name: 'Pré-Ocupação (TTS)',
    description: 'Acompanhamento social de famílias entre assinatura do contrato e mudança — sessões, demandas e entregáveis mensais.',
    limits: null,
    // Módulo sob medida (feito para o SP9), não comercializado como addon padrão da plataforma:
    // sem cobrança própria e sem exigência de tier por ora.
    prices: { months3: 0, months6: 0, months12: 0 },
    requiresTier: null,
    active: true,
  },
];

export async function seedPlanConfigs(prisma: PrismaClient | any): Promise<void> {
  const tiers: PlanTier[] = ['STARTER', 'PRO', 'BUSINESS'];

  for (const tier of tiers) {
    const existing = await prisma.planConfig.findUnique({ where: { tier } });
    if (!existing) {
      await prisma.planConfig.create({
        data: {
          tier,
          limits: DEFAULT_LIMITS[tier],
          prices: PLAN_PRICES[tier],
          active: true,
        },
      });
    }
  }

  for (const addon of ADDON_CONFIGS) {
    const existing = await prisma.addonConfig.findUnique({ where: { key: addon.key } });
    if (!existing) {
      await prisma.addonConfig.create({ data: addon });
    }
  }
}
