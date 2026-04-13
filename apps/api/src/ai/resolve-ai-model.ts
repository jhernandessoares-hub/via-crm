import { PrismaService } from '../prisma/prisma.service';

/**
 * Modelos padrão por função — usados no seed inicial e como fallback final.
 * Alterar aqui só afeta ambientes sem nenhuma configuração no banco.
 */
export const AI_MODEL_DEFAULTS: Record<string, string> = {
  DEFAULT:        'gpt-4o-mini',
  FOLLOW_UP:      'gpt-4o-mini',
  PDF_EXTRACTION: 'claude-haiku-4-5-20251001',
  TRANSCRIPTION:  'whisper-1',
};

/**
 * Resolve o modelo para uma função consultando o banco (AiModelConfig).
 * Cascata: config da função → config DEFAULT → padrão hardcoded.
 * Nunca lança exceção.
 */
export async function resolveAiModel(prisma: PrismaService, fn: string): Promise<string> {
  try {
    for (const key of [fn, 'DEFAULT']) {
      const config = await prisma.aiModelConfig.findUnique({ where: { function: key } });
      if (config?.modelName) return config.modelName;
    }
  } catch {
    // silently fallback
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
