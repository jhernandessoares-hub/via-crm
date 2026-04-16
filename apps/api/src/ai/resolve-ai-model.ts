import { PrismaService } from '../prisma/prisma.service';

/**
 * Modelos padrão por função — usados no seed inicial e como fallback final.
 * Alterar aqui só afeta ambientes sem nenhuma configuração no banco.
 */
export const AI_MODEL_DEFAULTS: Record<string, string> = {
  DEFAULT:            'gpt-4o-mini',
  FOLLOW_UP:          'gpt-4o-mini',
  PDF_EXTRACTION:     'claude-haiku-4-5-20251001',
  TRANSCRIPTION:      'whisper-1',
  DOC_CLASSIFICATION: 'claude-haiku-4-5-20251001',
};

/**
 * Resolve o modelo para uma função consultando o banco (AiModelConfig).
 * Cascata: config da função → config DEFAULT (se allowDefaultFallback=true) → padrão hardcoded.
 * Nunca lança exceção.
 *
 * @param allowDefaultFallback - se false, não cai no DEFAULT do banco (útil para funções com
 *   provider fixo, ex: DOC_CLASSIFICATION que exige Anthropic — não pode receber gpt-4o-mini)
 */
export async function resolveAiModel(
  prisma: PrismaService,
  fn: string,
  { allowDefaultFallback = true }: { allowDefaultFallback?: boolean } = {},
): Promise<string> {
  try {
    const config = await prisma.aiModelConfig.findUnique({ where: { function: fn } });
    if (config?.modelName) return config.modelName;

    if (allowDefaultFallback) {
      const def = await prisma.aiModelConfig.findUnique({ where: { function: 'DEFAULT' } });
      if (def?.modelName) return def.modelName;
    }
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.warn(`[resolveAiModel] Falha ao consultar banco para função "${fn}": ${err?.message}`);
  }
  return AI_MODEL_DEFAULTS[fn] ?? AI_MODEL_DEFAULTS['DEFAULT'];
}

/**
 * Seed automático: popula AiModelConfig com os padrões se ainda não existirem.
 * Chamado no startup da API — idempotente, nunca sobrescreve configurações existentes.
 */
export async function seedAiModelDefaults(prisma: PrismaService): Promise<void> {
  for (const [fn, modelName] of Object.entries(AI_MODEL_DEFAULTS)) {
    await prisma.aiModelConfig.upsert({
      where: { function: fn },
      create: { function: fn, modelName },
      update: {}, // não sobrescreve se já existe
    });
  }
}
