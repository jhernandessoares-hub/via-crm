import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const AI_FUNCTIONS = [
  { key: 'DEFAULT',        label: 'Padrão (utilitários internos)' },
  { key: 'FOLLOW_UP',      label: 'Resposta automática ao lead' },
  { key: 'PDF_EXTRACTION', label: 'Extração de dados de PDF (imóveis)' },
  { key: 'TRANSCRIPTION',  label: 'Transcrição de áudio (Whisper)' },
] as const;

export type AiFunction = (typeof AI_FUNCTIONS)[number]['key'];

// Modelos disponíveis agrupados por provider
export const AI_MODELS = [
  { value: 'gpt-4o',                       label: 'GPT-4o',            provider: 'OpenAI' },
  { value: 'gpt-4o-mini',                  label: 'GPT-4o Mini',       provider: 'OpenAI' },
  { value: 'gpt-4-turbo',                  label: 'GPT-4 Turbo',       provider: 'OpenAI' },
  { value: 'gpt-3.5-turbo',               label: 'GPT-3.5 Turbo',     provider: 'OpenAI' },
  { value: 'claude-opus-4-6',              label: 'Claude Opus 4.6',   provider: 'Anthropic' },
  { value: 'claude-sonnet-4-6',            label: 'Claude Sonnet 4.6', provider: 'Anthropic' },
  { value: 'claude-haiku-4-5-20251001',    label: 'Claude Haiku 4.5',  provider: 'Anthropic' },
] as const;

// Restrições por função (só permite determinados providers)
const FUNCTION_RESTRICTIONS: Partial<Record<AiFunction, string[]>> = {
  PDF_EXTRACTION: ['Anthropic'],
  TRANSCRIPTION: ['OpenAI'],
};

@Injectable()
export class AiProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  async listModelConfigs() {
    const configs = await this.prisma.aiModelConfig.findMany();
    const configMap = Object.fromEntries(configs.map((c) => [c.function, c.modelName]));

    return AI_FUNCTIONS.map((fn) => {
      const modelName = configMap[fn.key] ?? null;
      const model = AI_MODELS.find((m) => m.value === modelName) ?? null;
      return {
        function: fn.key,
        label: fn.label,
        restrictions: FUNCTION_RESTRICTIONS[fn.key] ?? null,
        modelName,
        providerLabel: model?.provider ?? null,
        modelLabel: model?.label ?? null,
      };
    });
  }

  async setModelConfig(fn: string, modelName: string) {
    const validFn = AI_FUNCTIONS.find((f) => f.key === fn);
    if (!validFn) throw new BadRequestException(`Função "${fn}" inválida.`);

    const model = AI_MODELS.find((m) => m.value === modelName);
    if (!model) throw new BadRequestException(`Modelo "${modelName}" não reconhecido.`);

    const restrictions = FUNCTION_RESTRICTIONS[fn as AiFunction];
    if (restrictions && !restrictions.includes(model.provider)) {
      throw new BadRequestException(
        `A função "${validFn.label}" só suporta modelos ${restrictions.join(' ou ')}.`,
      );
    }

    return this.prisma.aiModelConfig.upsert({
      where: { function: fn },
      create: { function: fn, modelName },
      update: { modelName },
    });
  }

  async clearModelConfig(fn: string) {
    await this.prisma.aiModelConfig.deleteMany({ where: { function: fn } });
    return { ok: true };
  }

  getAvailableModels() {
    return AI_MODELS;
  }

  // Usado pelo AiService para resolver o modelo correto
  async resolveModel(fn: AiFunction): Promise<string | null> {
    try {
      const config = await this.prisma.aiModelConfig.findUnique({ where: { function: fn } });
      if (config?.modelName) return config.modelName;

      if (fn !== 'DEFAULT') {
        const def = await this.prisma.aiModelConfig.findUnique({ where: { function: 'DEFAULT' } });
        if (def?.modelName) return def.modelName;
      }
    } catch {
      // silently fallback
    }
    return null; // sem config → AiService usa env/hardcoded
  }
}
