/**
 * Quem pode responder o questionário da família: qualquer pessoa do cadastro do lead
 * (titular ou participante da aba Documentos) — mas é UM questionário por família:
 * depois que alguém começou (CPF já salvo), só continua quem digitar o mesmo CPF.
 */

export const soDigitos = (v: string | null | undefined) => String(v ?? '').replace(/\D/g, '');

type Pessoa = { cpf: string | null; nome: string; telefone: string | null };
type LeadComPessoas = {
  cpf: string | null;
  nome: string;
  nomeCorreto: string | null;
  telefone: string | null;
  participantes?: Pessoa[] | null;
};

/** Pessoa do cadastro dona deste CPF (titular primeiro), ou null. */
export function pessoaDoCpf(lead: LeadComPessoas, cpf: string | null | undefined): { nome: string; telefone: string | null } | null {
  const alvo = soDigitos(cpf);
  if (alvo.length !== 11) return null;
  if (soDigitos(lead.cpf) === alvo) return { nome: lead.nomeCorreto ?? lead.nome, telefone: lead.telefone };
  const p = (lead.participantes ?? []).find((x) => soDigitos(x.cpf) === alvo);
  return p ? { nome: p.nome, telefone: p.telefone } : null;
}

/**
 * Conferência do CPF digitado:
 * - NAO_CADASTRADO: não é de ninguém do cadastro;
 * - OUTRA_PESSOA: alguém já começou com outro CPF (que continua no cadastro);
 * - OK: pode seguir.
 * CPF de quem começou que saiu do cadastro não trava a família: volta a valer qualquer um.
 */
export function conferirCpfDaFamilia(
  lead: LeadComPessoas,
  cpfDigitado: string,
  cpfDeQuemComecou: string | null | undefined,
): 'OK' | 'NAO_CADASTRADO' | 'OUTRA_PESSOA' {
  if (!pessoaDoCpf(lead, cpfDigitado)) return 'NAO_CADASTRADO';
  const iniciado = soDigitos(cpfDeQuemComecou);
  if (iniciado && iniciado !== soDigitos(cpfDigitado) && pessoaDoCpf(lead, iniciado)) return 'OUTRA_PESSOA';
  return 'OK';
}
