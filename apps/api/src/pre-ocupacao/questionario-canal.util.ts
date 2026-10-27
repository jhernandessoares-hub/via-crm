/**
 * Por qual WhatsApp o questionário sai para um lead.
 *
 * Regra: sai pelo canal cadastrado no lead. Quando o lead não tem canal útil —
 * vazio, Light sem sessão, ou Oficial numa imobiliária sem número Oficial próprio
 * (cairia no número da plataforma, que a família não conhece e quase nunca
 * entrega) — sai pelo WhatsApp Light conectado da imobiliária, e esse passa a
 * ser o canal do lead.
 */
export type DecisaoCanal =
  | { acao: 'USAR_DO_LEAD' }
  | { acao: 'GRAVAR_LIGHT'; sessionId: string }
  | { acao: 'ERRO'; erro: string };

export const SEM_LIGHT_CONECTADO =
  'Lead sem canal de WhatsApp e nenhum WhatsApp Light conectado na imobiliária. Conecte o WhatsApp Light e reenvie.';

export function decidirCanalQuestionario(
  lead: { conversaCanal: string | null; conversaSessionId: string | null },
  temOficialProprio: boolean,
  sessaoLightConectadaId: string | null,
): DecisaoCanal {
  if (lead.conversaCanal === 'WHATSAPP_LIGHT' && lead.conversaSessionId) return { acao: 'USAR_DO_LEAD' };
  if (lead.conversaCanal === 'WHATSAPP_OFICIAL' && temOficialProprio) return { acao: 'USAR_DO_LEAD' };
  if (sessaoLightConectadaId) return { acao: 'GRAVAR_LIGHT', sessionId: sessaoLightConectadaId };
  return { acao: 'ERRO', erro: SEM_LIGHT_CONECTADO };
}

/**
 * Telefone pronto para o WhatsApp: 55 + DDD + número (12 ou 13 dígitos). O envio usa o
 * número como está no cadastro; sem o 55, "11 9..." vira código de país 1 e a mensagem
 * pode ir para outro número. Pessoa do cadastro com telefone fora disso não recebe link.
 */
export function telefoneBrValido(telefone: string | null | undefined): boolean {
  const d = String(telefone ?? '').replace(/\D/g, '');
  return d.startsWith('55') && (d.length === 12 || d.length === 13);
}
