/**
 * Lógica de fluxo do questionário: quais perguntas aparecem, em que ordem e
 * quantas vezes (grupos que repetem por pessoa). Funções puras, sem Nest/Prisma.
 *
 * ⚠️ CÓPIA de `apps/api/src/pre-ocupacao/questionario-fluxo.ts` — o backend
 * valida a conclusão com a mesma regra que esta tela usa para montar os passos.
 * Mude lá primeiro e copie para cá.
 */

export type Condicao =
  | { chave: string; em: string[] } // opção marcada (escolha única ou múltipla)
  | { chave: string; naoEm: string[] } // respondida e nenhuma dessas opções marcada
  | { chave: string; maiorQue: number } // valor numérico (contador, escolha com número, soma de sub-campos)
  | { instanciaMaiorQue: number }; // dentro de grupo: só a partir da pessoa N+1

export interface OpcaoConfig {
  label: string;
  /** Abre campo extra ao marcar: texto ("Qual?"/"Quem?") ou valor em R$ */
  complemento?: 'TEXTO' | 'VALOR';
  rotuloComplemento?: string;
  /** Por padrão o campo extra é obrigatório quando a opção é marcada */
  complementoOpcional?: boolean;
  /** Marcar esta opção desmarca as outras (ex.: "Nenhuma das opções") */
  exclusiva?: boolean;
  /** Valor numérico da opção, usado em contagens (ex.: "3 pessoas" = 3) */
  numero?: number;
  /** Sinaliza a resposta para a equipe (ex.: pedido de sigilo) */
  alerta?: string;
}

export interface CampoConfig {
  chave: string;
  label: string;
  tipo: 'TEXTO' | 'CONTADOR';
}

export interface PerguntaConfig {
  secao?: string;
  ajuda?: string;
  mostrarSe?: Condicao[];
  grupo?: string;
  campos?: CampoConfig[];
  /** CAMPOS de contadores: mostra a soma no fim da tela com este rótulo */
  mostrarTotal?: string;
  /** CAMPOS: compara o total com as idades informadas (ex.: menores de 18 anos) */
  compararComIdades?: { chave: string; menorQue: number };
  prefill?: 'NOME' | 'TELEFONE';
  min?: number;
  max?: number;
  unidade?: string;
  escalaLegenda?: { min: string; max: string };
  /** Opções montadas com as pessoas de um grupo (ex.: nomes dos moradores) */
  opcoesDinamicas?: { grupo: string };
  /** Destaque visual: pergunta sobre a situação de HOJE ou sobre o novo condomínio */
  tempo?: 'HOJE' | 'FUTURO';
}

export interface GrupoConfig {
  rotulo: string; // "Morador" → "Morador 2 de 3"
  rotuloPrimeiro?: string; // "Morador 1 (você, titular)"
  /**
   * primeiro: o primeiro valor numérico encontrado; soma: soma dos valores;
   * selecao: uma repetição por opção marcada (ex.: moradores escolhidos).
   */
  contagem: { de: string[]; modo: 'primeiro' | 'soma' | 'selecao' };
  /** De onde vem o nome de cada pessoa do grupo (chaves de perguntas de texto) */
  nomeDe?: { primeiro?: string; demais?: string };
  maximo?: number;
}

export interface QuestionarioConfig {
  grupos?: Record<string, GrupoConfig>;
  textoFinal?: string;
}

export interface PerguntaFluxo {
  id: string;
  chave: string | null;
  tipo: string;
  opcoes: unknown;
  obrigatoria: boolean;
  config: unknown;
}

export interface RespostaFluxo {
  perguntaId: string;
  instancia: number;
  valorNumero: number | null;
  valorOpcoes: string[];
  valorTexto?: string | null;
  extras?: unknown;
}

export interface Passo {
  perguntaId: string;
  instancia: number;
  /** "Morador 2 de 3 · João" quando a pergunta está num grupo que repete */
  rotuloGrupo: string | null;
  /** Como chamar a pessoa no texto da pergunta ({{pessoa}}): "você", "João"... */
  pessoa: string | null;
}

const LIMITE_REPETICOES = 15;
const SUFIXO_TITULAR = ' (você)';

export function cfgPergunta(p: PerguntaFluxo): PerguntaConfig {
  return (p.config && typeof p.config === 'object' ? p.config : {}) as PerguntaConfig;
}

/** Opções sempre como objetos (aceita o formato antigo: lista de textos). */
export function opcoesDe(p: { opcoes: unknown }): OpcaoConfig[] {
  if (!Array.isArray(p.opcoes)) return [];
  return p.opcoes.map((o) => (typeof o === 'string' ? { label: o } : (o as OpcaoConfig)));
}

function chaveResp(perguntaId: string, instancia: number) {
  return `${perguntaId}#${instancia}`;
}

export function indexarRespostas(respostas: RespostaFluxo[]) {
  const m = new Map<string, RespostaFluxo>();
  for (const r of respostas) m.set(chaveResp(r.perguntaId, r.instancia), r);
  return m;
}

/** Nome como aparece dentro da pergunta: o titular vira "você". */
export function pessoaNoTexto(label: string | null): string | null {
  if (!label) return null;
  return label.endsWith(SUFIXO_TITULAR) ? 'você' : label;
}

/** Valor numérico de uma resposta (para contagens e condições "maiorQue"). */
function numeroDaResposta(p: PerguntaFluxo, r: RespostaFluxo | undefined): number | null {
  if (!r) return null;
  if (p.tipo === 'CAMPOS') {
    const extras = (r.extras && typeof r.extras === 'object' ? r.extras : {}) as Record<string, unknown>;
    return Object.values(extras).reduce<number>((acc, v) => acc + (typeof v === 'number' ? v : 0), 0);
  }
  if (p.tipo === 'ESCOLHA_UNICA') {
    const op = opcoesDe(p).find((o) => o.label === r.valorOpcoes[0]);
    return typeof op?.numero === 'number' ? op.numero : null;
  }
  if (p.tipo === 'ESCOLHA_MULTIPLA') return r.valorOpcoes.length;
  return r.valorNumero;
}

/** Monta o contexto de cálculo (usado pelos passos e pelas opções dinâmicas). */
function contexto(perguntas: PerguntaFluxo[], questionarioConfig: unknown, respostas: RespostaFluxo[]) {
  const qcfg = (questionarioConfig && typeof questionarioConfig === 'object' ? questionarioConfig : {}) as QuestionarioConfig;
  const grupos = qcfg.grupos ?? {};
  const porChave = new Map(perguntas.filter((p) => p.chave).map((p) => [p.chave as string, p]));
  const idx = indexarRespostas(respostas);

  // Resposta de uma chave no contexto da instância atual: se a pergunta
  // referida é do mesmo grupo, olha a mesma pessoa; senão, a instância 0.
  const respostaDe = (chave: string, grupoAtual: string | undefined, instancia: number) => {
    const p = porChave.get(chave);
    if (!p) return { p: undefined, r: undefined };
    const mesmoGrupo = !!grupoAtual && cfgPergunta(p).grupo === grupoAtual;
    return { p, r: idx.get(chaveResp(p.id, mesmoGrupo ? instancia : 0)) };
  };

  const condicaoOk = (c: Condicao, grupoAtual: string | undefined, instancia: number): boolean => {
    if ('instanciaMaiorQue' in c) return instancia > c.instanciaMaiorQue;
    const { p, r } = respostaDe(c.chave, grupoAtual, instancia);
    if (!p || !r) return false;
    if ('em' in c) return r.valorOpcoes.some((o) => c.em.includes(o));
    if ('naoEm' in c) return r.valorOpcoes.length > 0 ? !r.valorOpcoes.some((o) => c.naoEm.includes(o)) : r.valorNumero !== null || !!r.extras;
    const n = numeroDaResposta(p, r);
    return n !== null && n > c.maiorQue;
  };

  const visivel = (p: PerguntaFluxo, instancia: number) => {
    const cfg = cfgPergunta(p);
    return (cfg.mostrarSe ?? []).every((c) => condicaoOk(c, cfg.grupo, instancia));
  };

  /** Rótulos das pessoas de cada repetição do grupo (nomes, quando houver). */
  const pessoasDoGrupo = (nome: string): string[] => {
    const g = grupos[nome];
    if (!g) return [];
    if (g.contagem.modo === 'selecao') {
      const { p, r } = respostaDe(g.contagem.de[0], undefined, 0);
      if (!p || !r || !visivel(p, 0)) return [];
      return r.valorOpcoes.slice(0, g.maximo ?? LIMITE_REPETICOES);
    }
    let total = 0;
    for (const chave of g.contagem.de) {
      const { p, r } = respostaDe(chave, undefined, 0);
      if (!p || !visivel(p, 0)) continue;
      const n = numeroDaResposta(p, r);
      if (n === null) continue;
      if (g.contagem.modo === 'primeiro') {
        total = n;
        break;
      }
      total += n;
    }
    const n = Math.max(0, Math.min(Math.round(total), g.maximo ?? LIMITE_REPETICOES));
    const usados = new Map<string, number>();
    return Array.from({ length: n }, (_, i) => {
      const chaveNome = i === 0 ? g.nomeDe?.primeiro ?? g.nomeDe?.demais : g.nomeDe?.demais;
      let base = '';
      if (chaveNome) {
        const { p, r } = respostaDe(chaveNome, nome, i);
        if (p && r?.valorTexto) base = r.valorTexto.trim();
      }
      if (!base) base = `${g.rotulo} ${i + 1}`;
      const vezes = (usados.get(base) ?? 0) + 1;
      usados.set(base, vezes);
      const unico = vezes > 1 ? `${base} (${vezes})` : base;
      return i === 0 && g.rotuloPrimeiro ? `${unico}${SUFIXO_TITULAR}` : unico;
    });
  };

  return { grupos, visivel, pessoasDoGrupo };
}

export function montarPassos(
  perguntas: PerguntaFluxo[],
  questionarioConfig: unknown,
  respostas: RespostaFluxo[],
): Passo[] {
  const { grupos, visivel, pessoasDoGrupo } = contexto(perguntas, questionarioConfig, respostas);
  const passos: Passo[] = [];
  let i = 0;
  while (i < perguntas.length) {
    const nomeGrupo = cfgPergunta(perguntas[i]).grupo;
    if (!nomeGrupo) {
      if (visivel(perguntas[i], 0)) passos.push({ perguntaId: perguntas[i].id, instancia: 0, rotuloGrupo: null, pessoa: null });
      i++;
      continue;
    }
    // Bloco = perguntas consecutivas do mesmo grupo, repetido por pessoa
    const bloco: PerguntaFluxo[] = [];
    while (i < perguntas.length && cfgPergunta(perguntas[i]).grupo === nomeGrupo) bloco.push(perguntas[i++]);
    const g = grupos[nomeGrupo];
    const pessoas = pessoasDoGrupo(nomeGrupo);
    const n = pessoas.length;
    for (let inst = 0; inst < n; inst++) {
      const nomePessoa = pessoas[inst];
      const temNome = g?.contagem.modo === 'selecao' || !nomePessoa.startsWith(`${g?.rotulo ?? ''} `);
      const rotulo = g
        ? inst === 0 && g.rotuloPrimeiro && g.contagem.modo !== 'selecao'
          ? g.rotuloPrimeiro
          : `${g.rotulo} ${inst + 1} de ${n}${temNome ? ` · ${nomePessoa.replace(SUFIXO_TITULAR, '')}` : ''}`
        : null;
      // Grupos de "quais moradores": usa o nome (mesmo do titular); grupo dos
      // moradores: o titular vira "você" ("Quanto você ganha...").
      const pessoa =
        g?.contagem.modo === 'selecao'
          ? nomePessoa.replace(SUFIXO_TITULAR, '')
          : temNome
            ? pessoaNoTexto(nomePessoa)
            : inst === 0 && g?.rotuloPrimeiro
              ? 'você'
              : null;
      for (const p of bloco) {
        if (visivel(p, inst)) passos.push({ perguntaId: p.id, instancia: inst, rotuloGrupo: rotulo, pessoa });
      }
    }
  }
  return passos;
}

/** Opções de uma pergunta com `opcoesDinamicas` (ex.: nomes dos moradores). */
export function opcoesDinamicas(
  pergunta: PerguntaFluxo,
  perguntas: PerguntaFluxo[],
  questionarioConfig: unknown,
  respostas: RespostaFluxo[],
): OpcaoConfig[] {
  const din = cfgPergunta(pergunta).opcoesDinamicas;
  if (!din) return opcoesDe(pergunta);
  return contexto(perguntas, questionarioConfig, respostas)
    .pessoasDoGrupo(din.grupo)
    .map((label) => ({ label }));
}

/** Tipos que não guardam resposta (tela só de leitura). */
export const TIPOS_SEM_RESPOSTA = ['INFO'];

/** A resposta salva conta como "respondida" para fins de obrigatoriedade? */
export function respostaPreenchida(p: PerguntaFluxo, r: RespostaFluxo | undefined): boolean {
  if (TIPOS_SEM_RESPOSTA.includes(p.tipo)) return true;
  if (!r) return false;
  if (p.tipo === 'ACEITE') return opcoesDe(p).every((o) => r.valorOpcoes.includes(o.label));
  if (p.tipo === 'CAMPOS') {
    const extras = (r.extras && typeof r.extras === 'object' ? r.extras : {}) as Record<string, unknown>;
    return Object.values(extras).some((v) => v !== null && v !== undefined && v !== '');
  }
  return true;
}
