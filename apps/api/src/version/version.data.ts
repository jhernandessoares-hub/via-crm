export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

export const APP_VERSION = '2.2.0';

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2.2.0',
    date: '2026-07-22',
    changes: [
      'Financeiro: cadastro de Empresas (CNPJs da holding), com filtro por empresa em contas a pagar/receber e nos relatórios',
      'Financeiro: desconto e juros/multa registrados na baixa, sem alterar o valor original do título',
      'Financeiro: cadastro de Contratos, com vínculo de notas fiscais e cálculo automático de saldo a faturar',
    ],
  },
  {
    version: '2.1.0',
    date: '2026-07-13',
    changes: [
      'Numeração de versão do sistema (visível na sidebar, com histórico de mudanças)',
      'Comparação de versão entre dev e produção no Painel Admin',
    ],
  },
];
