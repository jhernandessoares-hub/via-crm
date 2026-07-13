export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

export const APP_VERSION = '2.1.0';

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2.1.0',
    date: '2026-07-13',
    changes: [
      'Numeração de versão do sistema (visível na sidebar, com histórico de mudanças)',
      'Comparação de versão entre dev e produção no Painel Admin',
    ],
  },
];
