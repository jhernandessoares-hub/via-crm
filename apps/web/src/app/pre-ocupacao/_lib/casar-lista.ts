/**
 * Reconhece, numa lista colada (Excel, Word ou texto), quais famílias são.
 * Cada linha pode ter CPF, nº da família (só com #) e/ou nome, em qualquer ordem.
 * Nunca chuta: o que não é certeza volta como "confirmar" e quem decide é a pessoa.
 */

export type FamiliaLista = {
  familiaId: string;
  numero: number;
  nome: string;
  cpf: string | null;
  /** Cônjuge e demais pessoas do cadastro: a lista pode vir no nome deles. */
  outros?: { nome: string; cpf: string | null }[];
};

export type ResultadoLista = {
  /** CPF, #número ou nome idêntico ao cadastro de uma única família. */
  certas: { linha: string; familiaId: string }[];
  /** Nome parecido, ou que serve para mais de uma família: precisa confirmar. */
  confirmar: { linha: string; candidatos: string[] }[];
  naoAchadas: string[];
  /** Linhas que apontam para família já reconhecida em outra linha (ex.: marido e mulher). */
  repetidas: number;
};

const LIGACOES = new Set(["de", "da", "do", "das", "dos", "e"]);

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function palavras(s: string): string[] {
  return normalizar(s)
    .split(" ")
    .filter((p) => p.length > 1 && !LIGACOES.has(p));
}

function soDigitos(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

/** CPF escrito na célula: 11 dígitos, com ou sem pontuação (telefone 55+DDD tem 12 ou 13). */
function cpfsDaLinha(linha: string): string[] {
  return (linha.match(/(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)/g) ?? []).map(soDigitos);
}

/** Nomes parecidos: todas as palavras de um estão no outro, com pelo menos 2 em comum e o mesmo 1º nome. */
function parecido(a: string[], b: string[]): boolean {
  if (a.length < 2 || b.length < 2 || a[0] !== b[0]) return false;
  const [menor, maior] = a.length <= b.length ? [a, new Set(b)] : [b, new Set(a)];
  return menor.every((p) => maior.has(p));
}

export function casarLista(texto: string, familias: FamiliaLista[]): ResultadoLista {
  const porCpf = new Map<string, Set<string>>();
  const porNome = new Map<string, Set<string>>();
  const porNumero = new Map(familias.map((f) => [f.numero, f.familiaId]));
  const nomes: { familiaId: string; palavras: string[] }[] = [];

  const juntar = (m: Map<string, Set<string>>, k: string, id: string) => m.set(k, (m.get(k) ?? new Set<string>()).add(id));
  for (const f of familias) {
    for (const pessoa of [{ nome: f.nome, cpf: f.cpf }, ...(f.outros ?? [])]) {
      const cpf = soDigitos(pessoa.cpf);
      if (cpf.length === 11) juntar(porCpf, cpf, f.familiaId);
      const p = palavras(pessoa.nome);
      if (p.length < 2) continue;
      juntar(porNome, p.join(" "), f.familiaId);
      nomes.push({ familiaId: f.familiaId, palavras: p });
    }
  }

  const certas: ResultadoLista["certas"] = [];
  const confirmar: ResultadoLista["confirmar"] = [];
  const naoAchadas: string[] = [];
  const jaAchadas = new Set<string>();
  let repetidas = 0;

  const acertou = (linha: string, familiaId: string) => {
    if (jaAchadas.has(familiaId)) {
      repetidas += 1;
      return;
    }
    jaAchadas.add(familiaId);
    certas.push({ linha, familiaId });
  };

  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const linha of linhas) {
    // 1) CPF
    const ids = new Set(cpfsDaLinha(linha).flatMap((c) => [...(porCpf.get(c) ?? [])]));
    // 2) #número da família
    const num = linha.match(/#\s*0*(\d{1,4})(?!\d)/);
    const idNumero = num ? porNumero.get(Number(num[1])) : undefined;
    if (ids.size === 1) {
      acertou(linha, [...ids][0]);
      continue;
    }
    if (ids.size > 1) {
      confirmar.push({ linha, candidatos: [...ids] });
      continue;
    }
    if (idNumero) {
      acertou(linha, idNumero);
      continue;
    }

    // 3) Nome: cada coluna é testada sozinha (colado do Excel vem separado por tab)
    const celulas = linha.split(/\t|;|\|/).map(palavras).filter((p) => p.length >= 2);
    if (celulas.length === 0) {
      // Cabeçalho ou linha sem nome: só avisa se parecer um registro
      if (palavras(linha).length > 0 || soDigitos(linha).length >= 11) naoAchadas.push(linha);
      continue;
    }
    const exatos = new Set(celulas.flatMap((c) => [...(porNome.get(c.join(" ")) ?? [])]));
    if (exatos.size === 1) {
      acertou(linha, [...exatos][0]);
      continue;
    }
    const candidatos = exatos.size
      ? [...exatos]
      : [...new Set(nomes.filter((n) => celulas.some((c) => parecido(c, n.palavras))).map((n) => n.familiaId))];
    if (candidatos.length) confirmar.push({ linha, candidatos });
    else naoAchadas.push(linha);
  }

  // Parecidos que já entraram por certeza em outra linha não precisam de confirmação
  const aindaConfirmar = confirmar.filter((c) => {
    const novo = !(c.candidatos.length === 1 && jaAchadas.has(c.candidatos[0]));
    if (!novo) repetidas += 1;
    return novo;
  });
  return { certas, confirmar: aindaConfirmar, naoAchadas, repetidas };
}
