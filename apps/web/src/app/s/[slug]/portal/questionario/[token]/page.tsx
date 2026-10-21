"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  OpcaoConfig,
  PerguntaConfig,
  Passo,
  QuestionarioConfig,
  RespostaFluxo,
  cfgPergunta,
  montarPassos,
  opcoesDe,
  opcoesDinamicas,
} from "@/lib/questionario-fluxo";

const LOGO_URL =
  "https://res.cloudinary.com/divurdnpz/image/upload/e_trim/v1783042264/via-crm/sites/sp9/yvzu4cu5xuswjbgayc35.jpg";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

type Pergunta = {
  id: string;
  chave: string | null;
  enunciado: string;
  tipo: string;
  opcoes: unknown;
  escalaMin: number | null;
  escalaMax: number | null;
  obrigatoria: boolean;
  config: unknown;
};

type RespostaSalva = RespostaFluxo & { valorTexto: string | null; valorData: string | null };

type Dados =
  | { nome: string; titulo: string; jaRespondido: true; respondidoEm: string }
  | {
      nome: string;
      titulo: string;
      descricao: string | null;
      config: QuestionarioConfig | null;
      jaRespondido: false;
      prefill: { NOME: string; TELEFONE: string | null };
      perguntas: Pergunta[];
      respostas: RespostaSalva[];
    };

/** O que está sendo preenchido na tela atual. */
type Rascunho = { opcoes: string[]; extras: Record<string, string>; texto: string };

const chave = (perguntaId: string, instancia: number) => `${perguntaId}#${instancia}`;

function mascaraTelefone(v: string): string {
  let d = v.replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function mascaraCpf(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Valor em reais enquanto digita: "1518" → "1.518", "1518,5" → "1.518,5". */
/**
 * Valor em reais sempre com vírgula e centavos, como em app de banco: os
 * números entram pelos centavos ("2" → "0,02", "250000" → "2.500,00").
 */
function mascaraMoeda(v: string): string {
  const digitos = v.replace(/\D/g, "").replace(/^0+/, "").slice(0, 11);
  if (!digitos) return "";
  return (Number(digitos) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function moedaDeNumero(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type EstadoCpf = { estado: "vazio" | "verificando" | "ok" | "erro"; mensagem?: string; nome?: string };

function rascunhoDe(p: Pergunta, r: RespostaSalva | undefined, prefill: Record<string, string | null>): Rascunho {
  const cfg = cfgPergunta(p);
  const vazio: Rascunho = { opcoes: [], extras: {}, texto: "" };
  if (!r) {
    if (cfg.prefill && prefill[cfg.prefill]) {
      const v = prefill[cfg.prefill] as string;
      return { ...vazio, texto: cfg.prefill === "TELEFONE" ? mascaraTelefone(v) : v };
    }
    if (p.tipo === "CAMPOS") {
      // Contadores começam em 0 para a família só ajustar o que tiver
      const extras: Record<string, string> = {};
      for (const c of cfg.campos ?? []) if (c.tipo === "CONTADOR") extras[c.chave] = "0";
      return { ...vazio, extras };
    }
    return vazio;
  }
  const extras: Record<string, string> = {};
  const valorEmReais = new Set(opcoesDe(p).filter((o) => o.complemento === "VALOR").map((o) => o.label));
  for (const [k, v] of Object.entries((r.extras ?? {}) as Record<string, unknown>)) {
    extras[k] = typeof v === "number" ? (valorEmReais.has(k) ? moedaDeNumero(v) : String(v).replace(".", ",")) : String(v ?? "");
  }
  let texto = r.valorTexto ?? "";
  if (r.valorNumero !== null) texto = p.tipo === "MOEDA" ? moedaDeNumero(r.valorNumero) : String(r.valorNumero).replace(".", ",");
  if (r.valorData) texto = r.valorData;
  if (p.tipo === "TELEFONE") texto = mascaraTelefone(texto);
  if (p.tipo === "CPF") texto = mascaraCpf(texto);
  return { opcoes: r.valorOpcoes ?? [], extras, texto };
}

function payloadDe(p: Pergunta, r: Rascunho): { valor: unknown; extras: unknown } {
  switch (p.tipo) {
    case "ESCOLHA_UNICA":
      return { valor: r.opcoes[0] ?? null, extras: r.extras };
    case "ESCOLHA_MULTIPLA":
    case "ACEITE":
      return { valor: r.opcoes, extras: r.extras };
    case "CAMPOS":
      return { valor: null, extras: r.extras };
    case "CONTADOR":
    case "ESCALA":
      return { valor: r.texto === "" ? null : Number(r.texto), extras: null };
    default:
      return { valor: r.texto, extras: null };
  }
}

/** Mesma regra do servidor: a tela está respondida? */
function preenchido(p: Pergunta, r: Rascunho): boolean {
  if (p.tipo === "INFO") return true;
  if (p.tipo === "ACEITE") return opcoesDe(p).every((o) => r.opcoes.includes(o.label));
  if (p.tipo === "CAMPOS") return Object.values(r.extras).some((v) => v !== "");
  if (["ESCOLHA_UNICA", "ESCOLHA_MULTIPLA"].includes(p.tipo)) return r.opcoes.length > 0;
  if (p.tipo === "TELEFONE") return r.texto.replace(/\D/g, "").length >= 10;
  if (p.tipo === "CPF") return r.texto.replace(/\D/g, "").length === 11;
  return r.texto.trim() !== "";
}

/** Converte o rascunho para o formato que o fluxo usa (condições e contagens). */
function respostaFluxoDe(p: Pergunta, inst: number, r: Rascunho): RespostaFluxo | null {
  if (!preenchido(p, r) || p.tipo === "INFO") return null;
  const num = r.texto.trim() === "" ? null : Number(r.texto.replace(/\./g, "").replace(",", "."));
  const extras: Record<string, number | string> = {};
  for (const [k, v] of Object.entries(r.extras)) {
    const n = Number(v.replace(",", "."));
    extras[k] = v !== "" && Number.isFinite(n) ? n : v;
  }
  return {
    perguntaId: p.id,
    instancia: inst,
    valorNumero: Number.isFinite(num as number) ? num : null,
    valorOpcoes: r.opcoes,
    valorTexto: r.texto || null,
    extras,
  };
}

// ─── Componentes de resposta (todos com área de toque grande) ─────────────

function BotaoOpcao({
  ativo,
  multipla,
  onClick,
  children,
}: {
  ativo: boolean;
  multipla: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role={multipla ? "checkbox" : "radio"}
      aria-checked={ativo}
      onClick={onClick}
      className={`flex w-full min-h-[64px] items-center gap-4 rounded-2xl border-2 px-5 py-4 text-left text-lg leading-snug transition ${
        ativo ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-900 active:bg-slate-100"
      }`}
    >
      <span
        aria-hidden
        className={`flex h-8 w-8 shrink-0 items-center justify-center border-2 text-lg font-bold ${
          multipla ? "rounded-lg" : "rounded-full"
        } ${ativo ? "border-white bg-white text-slate-900" : "border-slate-400"}`}
      >
        {ativo ? "✓" : ""}
      </span>
      <span className="flex-1">{children}</span>
    </button>
  );
}

const inputGrande =
  "w-full rounded-2xl border-2 border-slate-300 bg-white px-5 py-4 text-xl text-slate-900 outline-none focus:border-slate-900";

function Contador({
  valor,
  onChange,
  min = 0,
  max = 999,
  unidade,
  rotulo,
}: {
  valor: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  unidade?: string;
  rotulo?: string;
}) {
  const n = valor === "" ? null : Number(valor);
  const mudar = (delta: number) => {
    const base = n ?? (delta > 0 ? min - 1 : min);
    onChange(String(Math.max(min, Math.min(max, base + delta))));
  };
  return (
    <div>
      {rotulo && <p className="mb-2 text-lg text-slate-800">{rotulo}</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => mudar(-1)}
          aria-label="Diminuir"
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-2 border-slate-300 bg-white text-3xl font-bold text-slate-900 active:bg-slate-100"
        >
          −
        </button>
        <input
          type="text"
          inputMode="numeric"
          value={valor}
          onChange={(e) => {
            const d = e.target.value.replace(/\D/g, "").slice(0, 3);
            onChange(d === "" ? "" : String(Math.min(max, Number(d))));
          }}
          aria-label={rotulo ?? "Número"}
          className="h-16 w-full min-w-0 rounded-2xl border-2 border-slate-300 bg-white text-center text-3xl font-bold text-slate-900 outline-none focus:border-slate-900"
        />
        <button
          type="button"
          onClick={() => mudar(1)}
          aria-label="Aumentar"
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-2 border-slate-300 bg-white text-3xl font-bold text-slate-900 active:bg-slate-100"
        >
          +
        </button>
      </div>
      {unidade && <p className="mt-1 text-center text-base text-slate-500">{unidade}</p>}
    </div>
  );
}

function CampoMoeda({ valor, onChange, rotulo }: { valor: string; onChange: (v: string) => void; rotulo?: string }) {
  return (
    <label className="block">
      {rotulo && <span className="mb-2 block text-base text-slate-700">{rotulo}</span>}
      <div className="flex items-center rounded-2xl border-2 border-slate-300 bg-white focus-within:border-slate-900">
        <span className="pl-5 text-xl font-semibold text-slate-500">R$</span>
        <input
          type="text"
          inputMode="decimal"
          value={valor}
          placeholder="0,00"
          onChange={(e) => onChange(mascaraMoeda(e.target.value))}
          className="w-full min-w-0 rounded-2xl bg-transparent px-3 py-4 text-xl text-slate-900 outline-none"
        />
      </div>
    </label>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────

export default function QuestionarioPublicoPage() {
  const params = useParams<{ token: string }>();
  const token = params.token as string;

  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroFatal, setErroFatal] = useState<string | null>(null);
  // Respostas conhecidas (salvas no servidor ou nesta sessão)
  const [rascunhos, setRascunhos] = useState<Record<string, Rascunho>>({});
  const [salvas, setSalvas] = useState<Record<string, true>>({});
  const [pos, setPos] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [revisao, setRevisao] = useState(false);
  const [concluido, setConcluido] = useState(false);
  const [falando, setFalando] = useState(false);
  const [vozDisponivel, setVozDisponivel] = useState(false);
  const [cpf, setCpf] = useState<EstadoCpf>({ estado: "vazio" });
  const topoRef = useRef<HTMLDivElement>(null);

  const perguntas = dados && !dados.jaRespondido ? dados.perguntas : [];
  const porId = useMemo(() => new Map(perguntas.map((p) => [p.id, p])), [perguntas]);

  // Respostas no formato do fluxo: o que está na tela já conta para as condições
  const respostasFluxo = useMemo(() => {
    const lista: RespostaFluxo[] = [];
    for (const [k, r] of Object.entries(rascunhos)) {
      const [pid, inst] = k.split("#");
      const p = porId.get(pid);
      if (!p) continue;
      const rf = respostaFluxoDe(p, Number(inst), r);
      if (rf) lista.push(rf);
    }
    return lista;
  }, [rascunhos, porId]);

  const passos: Passo[] = useMemo(
    () => (dados && !dados.jaRespondido ? montarPassos(perguntas, dados.config, respostasFluxo) : []),
    [dados, perguntas, respostasFluxo],
  );

  useEffect(() => {
    setVozDisponivel(typeof window !== "undefined" && "speechSynthesis" in window);
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/pre-ocupacao-questionario/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message ?? "Este link não é mais válido. Fale com a equipe.");
        }
        return res.json();
      })
      .then((d: Dados) => {
        setDados(d);
        if (d.jaRespondido) return;
        const prefill = d.prefill as unknown as Record<string, string | null>;
        const r: Record<string, Rascunho> = {};
        const s: Record<string, true> = {};
        const mapa = new Map(d.perguntas.map((p) => [p.id, p]));
        for (const resp of d.respostas) {
          const p = mapa.get(resp.perguntaId);
          if (!p) continue;
          r[chave(resp.perguntaId, resp.instancia)] = rascunhoDe(p, resp, prefill);
          s[chave(resp.perguntaId, resp.instancia)] = true;
        }
        setRascunhos(r);
        setSalvas(s);
        // Continua de onde parou: logo depois da última tela respondida
        const ps = montarPassos(
          d.perguntas,
          d.config,
          d.respostas.map((x) => ({ ...x })),
        );
        let ultima = -1;
        ps.forEach((p, i) => {
          if (s[chave(p.perguntaId, p.instancia)]) ultima = i;
        });
        setPos(Math.min(ultima + 1, Math.max(ps.length - 1, 0)));
        if (ultima >= 0 && ultima + 1 >= ps.length) setRevisao(true);
      })
      .catch((e: any) => setErroFatal(e?.message ?? "Este link não é mais válido. Fale com a equipe."))
      .finally(() => setCarregando(false));
  }, [token]);

  const passo = passos[Math.min(pos, Math.max(passos.length - 1, 0))];
  const pergunta = passo ? porId.get(passo.perguntaId) : undefined;
  const k = passo ? chave(passo.perguntaId, passo.instancia) : "";
  const prefill = dados && !dados.jaRespondido ? (dados.prefill as unknown as Record<string, string | null>) : {};
  const atual: Rascunho = pergunta ? rascunhos[k] ?? rascunhoDe(pergunta, undefined, prefill) : { opcoes: [], extras: {}, texto: "" };
  const cfg: PerguntaConfig = pergunta ? cfgPergunta(pergunta) : {};
  // Opções da tela atual — "Quais moradores...?" usa os nomes já respondidos
  const opcoesDaTela: OpcaoConfig[] = pergunta
    ? cfg.opcoesDinamicas
      ? opcoesDinamicas(pergunta, perguntas, dados && !dados.jaRespondido ? dados.config : null, respostasFluxo)
      : opcoesDe(pergunta)
    : [];

  /** Troca {{nome}} e {{telefone}} pelos dados do cadastro (ex.: "O número (11) 9... é o seu principal?"). */
  const textoCom = (t: string | undefined) =>
    (t ?? "")
      .replace(/\{\{pessoa\}\}/gi, passo?.pessoa ?? "esta pessoa")
      .replace(/\{\{ordem\}\}/gi, `${(passo?.instancia ?? 0) + 1}ª`)
      .replace(/\{\{nome\}\}/gi, prefill.NOME ?? "")
      .replace(/\{\{telefone\}\}/gi, prefill.TELEFONE ? mascaraTelefone(prefill.TELEFONE) : "seu telefone")
      // frase que começa com o nome/"você" fica com inicial maiúscula
      .replace(/^\p{Ll}/u, (c) => c.toUpperCase());

  // CPF já salvo antes (continuou depois) conta como conferido
  useEffect(() => {
    if (pergunta?.tipo === "CPF") setCpf(salvas[k] ? { estado: "ok" } : { estado: "vazio" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);

  async function verificarCpf(valor: string) {
    const digitos = valor.replace(/\D/g, "");
    if (digitos.length !== 11) return setCpf({ estado: "vazio" });
    setCpf({ estado: "verificando" });
    try {
      const res = await fetch(`${API}/pre-ocupacao-questionario/${token}/verificar-cpf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpf: digitos }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setCpf({ estado: "erro", mensagem: body.message ?? "Não foi possível conferir o CPF." });
      setCpf({ estado: "ok", nome: body.nome });
    } catch {
      setCpf({ estado: "erro", mensagem: "Não conseguimos conferir. Confira a internet e tente de novo." });
    }
  }

  const pararVoz = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setFalando(false);
  }, []);

  // Troca de tela: para a leitura em voz alta e volta para o topo
  useEffect(() => {
    pararVoz();
    setAviso(null);
    topoRef.current?.scrollIntoView({ block: "start" });
  }, [pos, revisao, pararVoz]);

  function setAtual(patch: Partial<Rascunho>) {
    if (!pergunta) return;
    setRascunhos((rs) => ({ ...rs, [k]: { ...atual, ...patch } }));
    setAviso(null);
  }

  function ouvir() {
    if (!pergunta || !vozDisponivel) return;
    if (falando) return pararVoz();
    const partes = [textoCom(pergunta.enunciado)];
    if (cfg.ajuda) partes.push(textoCom(cfg.ajuda));
    const ops = opcoesDaTela;
    if (ops.length) partes.push("As opções são: " + ops.map((o) => o.label).join(". "));
    const u = new SpeechSynthesisUtterance(partes.join(". "));
    u.lang = "pt-BR";
    u.rate = 0.9;
    const voz = window.speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith("pt"));
    if (voz) u.voice = voz;
    u.onend = () => setFalando(false);
    u.onerror = () => setFalando(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setFalando(true);
  }

  async function salvarAtual(): Promise<boolean> {
    if (!pergunta || pergunta.tipo === "INFO") return true;
    setSalvando(true);
    try {
      const res = await fetch(`${API}/pre-ocupacao-questionario/${token}/salvar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perguntaId: pergunta.id, instancia: passo.instancia, ...payloadDe(pergunta, atual) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Não foi possível salvar.");
      }
      setRascunhos((rs) => ({ ...rs, [k]: atual }));
      setSalvas((s) => ({ ...s, [k]: true }));
      return true;
    } catch (e: any) {
      setAviso(
        e?.message && !/fetch/i.test(e.message)
          ? e.message
          : "Não conseguimos salvar. Confira a internet e toque em Próximo de novo.",
      );
      return false;
    } finally {
      setSalvando(false);
    }
  }

  async function proximo() {
    if (!pergunta) return;
    if (pergunta.obrigatoria && !preenchido(pergunta, atual)) {
      setAviso(
        pergunta.tipo === "ACEITE"
          ? 'Toque em "Eu concordo" nas duas declarações para continuar.'
          : pergunta.tipo === "CPF"
            ? "Digite os 11 números do CPF."
            : "Responda esta pergunta para continuar.",
      );
      return;
    }
    const faltaComplemento = opcoesDaTela.find(
      (o) => o.complemento && !o.complementoOpcional && atual.opcoes.includes(o.label) && !(atual.extras[o.label] ?? "").trim(),
    );
    if (faltaComplemento) {
      setAviso(
        faltaComplemento.complemento === "VALOR"
          ? `Informe o valor de "${faltaComplemento.label}".`
          : `Responda "${faltaComplemento.rotuloComplemento ?? "Qual?"}" de "${faltaComplemento.label}".`,
      );
      document.getElementById(`comp-${faltaComplemento.label}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    if (pergunta.tipo === "CPF" && cpf.estado !== "ok") {
      setAviso(cpf.estado === "verificando" ? "Aguarde, estamos conferindo o CPF." : cpf.mensagem ?? "Confira o CPF.");
      return;
    }
    if (!(await salvarAtual())) return;
    // Depois de salvar, o fluxo pode mudar (ex.: "Sim" abre perguntas novas)
    const novos = montarPassos(perguntas, dados && !dados.jaRespondido ? dados.config : null, [
      ...respostasFluxo.filter((r) => chave(r.perguntaId, r.instancia) !== k),
      ...(respostaFluxoDe(pergunta, passo.instancia, atual) ? [respostaFluxoDe(pergunta, passo.instancia, atual)!] : []),
    ]);
    const i = novos.findIndex((s) => chave(s.perguntaId, s.instancia) === k);
    if (i + 1 >= novos.length) setRevisao(true);
    else setPos(i + 1);
  }

  async function voltar() {
    if (revisao) {
      setRevisao(false);
      setPos(Math.max(passos.length - 1, 0));
      return;
    }
    // Guarda o que já foi digitado, sem exigir resposta para voltar
    if (pergunta && pergunta.tipo !== "INFO" && rascunhos[k]) await salvarAtual();
    setPos((p) => Math.max(0, p - 1));
  }

  async function enviar() {
    setSalvando(true);
    setAviso(null);
    try {
      const res = await fetch(`${API}/pre-ocupacao-questionario/${token}/concluir`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (Array.isArray(err.faltando) && err.faltando.length) {
          const f = err.faltando[0];
          const i = passos.findIndex((s) => s.perguntaId === f.perguntaId && s.instancia === f.instancia);
          setRevisao(false);
          setPos(Math.max(0, i));
          setAviso("Esta pergunta ficou sem resposta. Responda para poder enviar.");
          return;
        }
        throw new Error(err.message ?? "Não foi possível enviar suas respostas.");
      }
      setConcluido(true);
    } catch (e: any) {
      setAviso(e?.message ?? "Não foi possível enviar suas respostas.");
    } finally {
      setSalvando(false);
    }
  }

  // ─── Renderização da resposta da tela atual ─────────────────────────────

  function renderResposta(p: Pergunta) {
    const ops = opcoesDaTela;
    switch (p.tipo) {
      case "INFO":
        return null;
      case "ACEITE":
        return (
          <div className="space-y-4">
            {ops.map((o, i) => {
              const ativo = atual.opcoes.includes(o.label);
              return (
                <div
                  key={o.label}
                  className={`rounded-2xl border-2 p-4 ${ativo ? "border-emerald-600 bg-emerald-50" : "border-slate-300 bg-slate-50"}`}
                >
                  <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Declaração {i + 1}</p>
                  <p className="mb-4 text-lg leading-relaxed text-slate-900">{o.label}</p>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={ativo}
                    onClick={() =>
                      setAtual({ opcoes: ativo ? atual.opcoes.filter((x) => x !== o.label) : [...atual.opcoes, o.label] })
                    }
                    className={`h-14 w-full rounded-2xl text-lg font-bold transition ${
                      ativo ? "bg-emerald-700 text-white" : "border-2 border-slate-900 bg-white text-slate-900 active:bg-slate-100"
                    }`}
                  >
                    {ativo ? "✓ Concordo" : "Eu concordo"}
                  </button>
                </div>
              );
            })}
          </div>
        );
      case "CPF":
        return (
          <div className="space-y-3">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={atual.texto}
              placeholder="000.000.000-00"
              onChange={(e) => {
                const v = mascaraCpf(e.target.value);
                setAtual({ texto: v });
                verificarCpf(v);
              }}
              aria-label="CPF"
              className={`${inputGrande} text-center text-2xl tracking-wider`}
            />
            {cpf.estado === "verificando" && <p className="text-lg text-slate-600">Conferindo o cadastro...</p>}
            {cpf.estado === "ok" && (
              <div role="status" className="rounded-2xl border-2 border-emerald-600 bg-emerald-50 px-4 py-4">
                <p className="text-xl font-bold text-emerald-800">✓ Cadastro encontrado</p>
                {cpf.nome && <p className="mt-1 text-lg text-emerald-900">{cpf.nome}</p>}
                <p className="mt-2 text-base text-emerald-900">Toque em &ldquo;Começar as perguntas&rdquo; para continuar.</p>
              </div>
            )}
            {cpf.estado === "erro" && (
              <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-lg font-semibold text-red-800">
                {cpf.mensagem}
              </p>
            )}
          </div>
        );
      case "ESCOLHA_UNICA":
      case "ESCOLHA_MULTIPLA": {
        const multipla = p.tipo === "ESCOLHA_MULTIPLA";
        const tocar = (o: OpcaoConfig) => {
          const marcada = atual.opcoes.includes(o.label);
          // Campo extra ("Qual?", valor em R$) abre abaixo: rola até ele para não ficar atrás dos botões
          if (o.complemento && !marcada) {
            setTimeout(() => document.getElementById(`comp-${o.label}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 80);
          }
          if (!multipla) return setAtual({ opcoes: [o.label] });
          if (marcada) return setAtual({ opcoes: atual.opcoes.filter((x) => x !== o.label) });
          const exclusivas = ops.filter((x) => x.exclusiva).map((x) => x.label);
          setAtual({ opcoes: o.exclusiva ? [o.label] : [...atual.opcoes.filter((x) => !exclusivas.includes(x)), o.label] });
        };
        return (
          <div className="space-y-3" role={multipla ? "group" : "radiogroup"}>
            {multipla && p.tipo === "ESCOLHA_MULTIPLA" && (
              <p className="text-base text-slate-500">Pode tocar em mais de uma opção.</p>
            )}
            {ops.map((o) => {
              const ativo = atual.opcoes.includes(o.label);
              return (
                <div key={o.label} className="space-y-2">
                  <BotaoOpcao ativo={ativo} multipla={multipla} onClick={() => tocar(o)}>
                    {o.label}
                  </BotaoOpcao>
                  {ativo && o.complemento === "TEXTO" && (
                    <label id={`comp-${o.label}`} className="block pl-2">
                      <span className="mb-1 block text-base text-slate-700">{o.rotuloComplemento ?? "Qual?"}</span>
                      <input
                        type="text"
                        maxLength={300}
                        value={atual.extras[o.label] ?? ""}
                        onChange={(e) => setAtual({ extras: { ...atual.extras, [o.label]: e.target.value } })}
                        className={inputGrande}
                      />
                    </label>
                  )}
                  {ativo && o.complemento === "VALOR" && (
                    <div id={`comp-${o.label}`} className="pl-2">
                      <CampoMoeda
                        rotulo={o.rotuloComplemento ?? "Valor por mês"}
                        valor={atual.extras[o.label] ?? ""}
                        onChange={(v) => setAtual({ extras: { ...atual.extras, [o.label]: v } })}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      }
      case "ESCALA": {
        const min = p.escalaMin ?? 1;
        const max = p.escalaMax ?? 5;
        const notas = Array.from({ length: max - min + 1 }, (_, i) => min + i);
        return (
          <div>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${notas.length}, minmax(0, 1fr))` }}>
              {notas.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={atual.texto === String(n)}
                  onClick={() => setAtual({ texto: String(n) })}
                  className={`h-16 rounded-2xl border-2 text-2xl font-bold transition ${
                    atual.texto === String(n)
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-900 active:bg-slate-100"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            {cfg.escalaLegenda && (
              <div className="mt-2 flex justify-between text-base text-slate-600">
                <span>
                  {min} = {cfg.escalaLegenda.min}
                </span>
                <span>
                  {max} = {cfg.escalaLegenda.max}
                </span>
              </div>
            )}
          </div>
        );
      }
      case "CONTADOR":
        return (
          <Contador
            valor={atual.texto}
            onChange={(v) => setAtual({ texto: v })}
            min={cfg.min ?? 0}
            max={cfg.max ?? 999}
            unidade={cfg.unidade}
          />
        );
      case "MOEDA":
        return <CampoMoeda valor={atual.texto} onChange={(v) => setAtual({ texto: v })} />;
      case "TELEFONE":
        return (
          <input
            type="tel"
            inputMode="tel"
            value={atual.texto}
            onChange={(e) => setAtual({ texto: mascaraTelefone(e.target.value) })}
            placeholder="(11) 99999-9999"
            className={inputGrande}
          />
        );
      case "DATA":
        return <input type="date" value={atual.texto} onChange={(e) => setAtual({ texto: e.target.value })} className={inputGrande} />;
      case "TEXTO_LONGO":
        return (
          <textarea
            rows={5}
            maxLength={5000}
            value={atual.texto}
            onChange={(e) => setAtual({ texto: e.target.value })}
            className={inputGrande}
          />
        );
      case "CAMPOS": {
        const totalCampos = (cfg.campos ?? [])
          .filter((c) => c.tipo === "CONTADOR")
          .reduce((acc, c) => acc + (Number(atual.extras[c.chave]) || 0), 0);
        const comparar = (cfg as PerguntaConfig & { compararComIdades?: { chave: string; menorQue: number } }).compararComIdades;
        let menoresPelasIdades: number | null = null;
        if (comparar) {
          const pIdade = perguntas.find((x) => x.chave === comparar.chave);
          if (pIdade) {
            const idades = respostasFluxo.filter((r) => r.perguntaId === pIdade.id && r.valorNumero !== null);
            if (idades.length) menoresPelasIdades = idades.filter((r) => (r.valorNumero as number) < comparar.menorQue).length;
          }
        }
        return (
          <div className="space-y-6">
            {(cfg.campos ?? []).map((c) =>
              c.tipo === "CONTADOR" ? (
                <Contador
                  key={c.chave}
                  rotulo={c.label}
                  valor={atual.extras[c.chave] ?? ""}
                  onChange={(v) => setAtual({ extras: { ...atual.extras, [c.chave]: v } })}
                />
              ) : (
                <label key={c.chave} className="block">
                  <span className="mb-2 block text-lg text-slate-800">{c.label}</span>
                  <input
                    type="text"
                    maxLength={200}
                    value={atual.extras[c.chave] ?? ""}
                    onChange={(e) => setAtual({ extras: { ...atual.extras, [c.chave]: e.target.value } })}
                    className={inputGrande}
                  />
                </label>
              ),
            )}
            {cfg.mostrarTotal && (
              <div className="rounded-2xl border-2 border-slate-900 bg-slate-50 px-4 py-4">
                <p className="flex items-baseline justify-between gap-3 text-xl font-bold text-slate-950">
                  <span>{cfg.mostrarTotal}</span>
                  <span className="text-3xl">{totalCampos}</span>
                </p>
                {menoresPelasIdades !== null && (
                  <p className="mt-2 text-base text-slate-700">
                    Pelas idades que você informou, {menoresPelasIdades === 1 ? "1 morador tem" : `${menoresPelasIdades} moradores têm`} menos de 18 anos.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      }
      default:
        return (
          <input
            type="text"
            maxLength={500}
            value={atual.texto}
            onChange={(e) => setAtual({ texto: e.target.value })}
            className={inputGrande}
          />
        );
    }
  }

  // ─── Telas ──────────────────────────────────────────────────────────────

  const cartao = "rounded-3xl border border-slate-200 bg-white p-6 shadow-sm";
  const config = dados && !dados.jaRespondido ? dados.config : null;
  const totalPassos = passos.length;
  const progresso = revisao ? 100 : totalPassos ? Math.round((pos / totalPassos) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-50" ref={topoRef}>
      <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-4 pt-5">
        <div className="mb-4 flex items-center justify-center">
          <div className="relative h-14 w-14 shrink-0">
            <Image src={LOGO_URL} alt="SIM José Bonifácio" fill unoptimized className="object-contain" />
          </div>
        </div>

        {carregando && <p className="text-center text-lg text-slate-600">Carregando...</p>}

        {!carregando && erroFatal && (
          <div className={`${cartao} space-y-3 text-center`}>
            <p className="text-4xl">😕</p>
            <p className="text-lg text-slate-700">{erroFatal}</p>
          </div>
        )}

        {!carregando && dados && (dados.jaRespondido || concluido) && (
          <div className={`${cartao} space-y-4 text-center`}>
            <p className="text-5xl">✅</p>
            <p className="text-2xl font-semibold text-slate-950">
              {concluido ? `Obrigado, ${dados.nome}!` : "Você já respondeu este questionário."}
            </p>
            <p className="whitespace-pre-wrap text-lg leading-relaxed text-slate-700">
              {concluido
                ? config?.textoFinal ?? "Suas respostas foram enviadas para a equipe do Trabalho Técnico Social."
                : "Obrigado pela participação! Se precisar corrigir alguma resposta, fale com a equipe."}
            </p>
          </div>
        )}

        {!carregando && dados && !dados.jaRespondido && !concluido && (
          <>
            {/* Progresso */}
            <div className="mb-4">
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm text-slate-600">
                <span className="truncate font-medium">{revisao ? "Tudo pronto" : cfg.secao ?? dados.titulo}</span>
                <span className="shrink-0">{progresso}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-200" aria-hidden>
                <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${progresso}%` }} />
              </div>
            </div>

            <div className={`flex-1 ${aviso ? "pb-56" : "pb-36"}`}>
              {revisao ? (
                <div className={`${cartao} space-y-4 text-center`}>
                  <p className="text-5xl">📝</p>
                  <p className="text-2xl font-semibold text-slate-950">Você chegou ao final!</p>
                  <p className="text-lg text-slate-700">
                    Toque em <strong>Enviar respostas</strong> para entregar o questionário à equipe. Se quiser conferir
                    alguma resposta, toque em Voltar.
                  </p>
                </div>
              ) : (
                pergunta && (
                  <div className={`${cartao} space-y-5`}>
                    {cfg.tempo && (
                      <span
                        className={`mr-2 inline-block rounded-full px-4 py-1.5 text-base font-bold ${
                          cfg.tempo === "HOJE" ? "bg-amber-100 text-amber-900" : "bg-sky-100 text-sky-900"
                        }`}
                      >
                        {cfg.tempo === "HOJE" ? "📍 Sobre HOJE, onde mora agora" : "🏠 Sobre quando morar no José Bonifácio"}
                      </span>
                    )}
                    {passo.rotuloGrupo && (
                      <span className="inline-block rounded-full bg-emerald-100 px-4 py-1.5 text-base font-semibold text-emerald-900">
                        {passo.rotuloGrupo}
                      </span>
                    )}
                    <div className="flex items-start gap-3">
                      <h1 className="flex-1 text-[22px] font-semibold leading-snug text-slate-950 sm:text-2xl">
                        {textoCom(pergunta.enunciado)}
                        {pergunta.obrigatoria && pergunta.tipo !== "INFO" ? null : pergunta.tipo !== "INFO" ? (
                          <span className="ml-2 align-middle text-base font-normal text-slate-500">(opcional)</span>
                        ) : null}
                      </h1>
                      {vozDisponivel && (
                        <button
                          type="button"
                          onClick={ouvir}
                          aria-label={falando ? "Parar leitura" : "Ouvir a pergunta"}
                          className="flex shrink-0 flex-col items-center rounded-2xl border-2 border-slate-300 bg-white px-3 py-2 text-slate-800 active:bg-slate-100"
                        >
                          <span className="text-2xl" aria-hidden>
                            {falando ? "⏹" : "🔊"}
                          </span>
                          <span className="text-xs font-semibold">{falando ? "Parar" : "Ouvir"}</span>
                        </button>
                      )}
                    </div>
                    {cfg.ajuda && (
                      <p
                        className={`whitespace-pre-wrap leading-relaxed text-slate-700 ${
                          pergunta.tipo === "INFO" ? "text-lg" : "text-base"
                        }`}
                      >
                        {textoCom(cfg.ajuda)}
                      </p>
                    )}
                    {renderResposta(pergunta)}
                  </div>
                )
              )}
            </div>

            {/* Botões fixos no rodapé, sempre ao alcance do polegar */}
            <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur">
              {/* Aviso fica junto dos botões: sempre visível, mesmo com a pergunta rolada */}
              {aviso && (
                <p role="alert" className="mx-auto mt-3 w-full max-w-xl px-4">
                  <span className="block rounded-2xl bg-red-50 px-4 py-3 text-lg font-semibold text-red-800">⚠ {aviso}</span>
                </p>
              )}
              <div className="mx-auto flex w-full max-w-xl gap-3 px-4 py-3">
                {(pos > 0 || revisao) && (
                  <button
                    type="button"
                    onClick={voltar}
                    disabled={salvando}
                    className="h-16 flex-1 rounded-2xl border-2 border-slate-300 bg-white text-lg font-semibold text-slate-800 disabled:opacity-50"
                  >
                    ← Voltar
                  </button>
                )}
                {revisao ? (
                  <button
                    type="button"
                    onClick={enviar}
                    disabled={salvando}
                    className="h-16 flex-[2] rounded-2xl bg-emerald-700 text-lg font-bold text-white disabled:opacity-60"
                  >
                    {salvando ? "Enviando..." : "Enviar respostas ✓"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={proximo}
                    disabled={salvando || !pergunta}
                    className="h-16 flex-[2] rounded-2xl bg-slate-900 text-lg font-bold text-white disabled:opacity-60"
                  >
                    {salvando
                      ? "Salvando..."
                      : pergunta?.tipo === "INFO"
                        ? pos === 0
                          ? "Começar →"
                          : "Continuar →"
                        : pergunta?.tipo === "CPF" && cpf.estado === "ok"
                          ? "Começar as perguntas →"
                          : "Próximo →"}
                  </button>
                )}
              </div>
              <p className="pb-2 text-center text-xs text-slate-500">Suas respostas ficam salvas. Pode parar e continuar depois.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
