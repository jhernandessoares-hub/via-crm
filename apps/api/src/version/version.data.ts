export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

export const APP_VERSION = '2.3.0';

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2.3.0',
    date: '2026-08-04',
    changes: [
      'Tela do lead redesenhada: cartão de identidade com avatar, abas Qualificação/Documentos/Agenda & SLA/Histórico no lugar dos blocos empilhados',
      'Chat do lead com visual de WhatsApp (papel de parede, bolhas com bico) e identificação de quem mandou cada mensagem (nome do corretor, "pelo celular" ou % de IA)',
      'Tela de Documentos: um bloco por pessoa (lead e cada participante) com Documentos e Cadastro lado a lado, em vez de duas colunas desencontradas',
      '"Precisa de ajuda?" saiu do canto flutuante (atrapalhava o envio de mensagem) e virou um item fixo na sidebar',
      'Correções de layout: sidebar e chat não ficam mais cortados fora da tela; bordas de cartões com cor consistente',
    ],
  },
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
