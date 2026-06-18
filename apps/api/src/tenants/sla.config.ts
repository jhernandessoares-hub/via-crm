/**
 * Configuração do SLA por tenant e por canal (Tenant.slaConfig).
 * Oficial e Light são independentes — funcionam de forma diferente por natureza:
 * o oficial é limitado pela janela de 24h da Meta; o Light não tem essa trava.
 */

export type SlaMode = 'AUTOPILOT' | 'COPILOT';

export interface SlaChannelConfig {
  enabled: boolean;
  mode: SlaMode;
  respeitarHorario: boolean;
  /** Cadência de tentativas, em horas a partir da última mensagem do lead. */
  tentativasHoras: number[];
  /** Oficial: encerra o atendimento ao fim da janela de 24h da Meta. */
  encerrarAoFim24h?: boolean;
  /** Light: número máximo de tentativas antes de desistir. */
  maxTentativas?: number;
}

export interface SlaConfig {
  oficial: SlaChannelConfig;
  light: SlaChannelConfig;
}

export const DEFAULT_SLA_CONFIG: SlaConfig = {
  oficial: {
    enabled: false,
    mode: 'COPILOT',
    respeitarHorario: true,
    tentativasHoras: [2, 10, 18, 23],
    encerrarAoFim24h: true,
  },
  light: {
    enabled: false,
    mode: 'COPILOT',
    respeitarHorario: true,
    tentativasHoras: [1, 24, 72, 168],
    maxTentativas: 4,
  },
};

function resolveChannel(base: SlaChannelConfig, saved: any): SlaChannelConfig {
  const s = saved ?? {};
  const tentativas = Array.isArray(s.tentativasHoras)
    ? s.tentativasHoras.filter((n: any) => typeof n === 'number' && n > 0)
    : base.tentativasHoras;
  return {
    enabled: typeof s.enabled === 'boolean' ? s.enabled : base.enabled,
    mode: s.mode === 'AUTOPILOT' || s.mode === 'COPILOT' ? s.mode : base.mode,
    respeitarHorario: typeof s.respeitarHorario === 'boolean' ? s.respeitarHorario : base.respeitarHorario,
    tentativasHoras: tentativas.length ? tentativas : base.tentativasHoras,
    ...(base.encerrarAoFim24h !== undefined
      ? { encerrarAoFim24h: typeof s.encerrarAoFim24h === 'boolean' ? s.encerrarAoFim24h : base.encerrarAoFim24h }
      : {}),
    ...(base.maxTentativas !== undefined
      ? { maxTentativas: typeof s.maxTentativas === 'number' && s.maxTentativas > 0 ? s.maxTentativas : base.maxTentativas }
      : {}),
  };
}

/** Mescla a config salva com os defaults (campos faltantes assumem o padrão). */
export function resolveSlaConfig(saved: any): SlaConfig {
  const s = saved ?? {};
  return {
    oficial: resolveChannel(DEFAULT_SLA_CONFIG.oficial, s.oficial),
    light: resolveChannel(DEFAULT_SLA_CONFIG.light, s.light),
  };
}
