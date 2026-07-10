export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

export const APP_VERSION = '1.0.0';

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.0',
    date: '2026-07-10',
    changes: ['Numeração de versão do sistema (visível na sidebar, com histórico de mudanças)'],
  },
];
