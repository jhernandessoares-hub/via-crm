// Rótulo único do interesse REAL do lead (o que o cliente quer), usado nas listas.
// Prioridade: empreendimento de interesse → produto do catálogo. NÃO usa perfilImovel
// (faixa/padrão) como fallback — esse campo é exclusivo de "Perfil do imóvel".

export type LeadInteresseInput = {
  produtoInteresseId?: string | null;
  empreendimentoInteresse?: { nome: string | null } | null;
};

export function buildLeadInteresseLabel(
  lead: LeadInteresseInput,
  productTitleMap: Map<string, string>,
): string | null {
  if (lead.empreendimentoInteresse?.nome) return lead.empreendimentoInteresse.nome;
  if (lead.produtoInteresseId) {
    const title = productTitleMap.get(lead.produtoInteresseId);
    if (title) return title;
  }
  return null;
}
