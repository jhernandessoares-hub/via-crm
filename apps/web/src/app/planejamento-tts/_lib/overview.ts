import type { TtsAtividade, TtsParcela } from "@/lib/planejamento-tts.service";

/**
 * Funções puras dos tiles da Visão Geral.
 * Datas comparadas SEMPRE como string "YYYY-MM-DD" (as datas do banco são
 * meia-noite UTC; `new Date()` local em UTC-3 causaria off-by-one).
 */

export function hojeYmd(): string {
  const n = new Date();
  const mm = String(n.getMonth() + 1).padStart(2, "0");
  const dd = String(n.getDate()).padStart(2, "0");
  return `${n.getFullYear()}-${mm}-${dd}`;
}

/** Recorta "YYYY-MM-DD" de um ISO vindo da API (ou null). */
export function ymd(iso: string | null | undefined): string | null {
  return iso ? iso.slice(0, 10) : null;
}

export function formatYmdBr(isoOuYmd: string | null | undefined): string {
  const v = ymd(isoOuYmd);
  if (!v) return "—";
  const [y, m, d] = v.split("-");
  return `${d}/${m}/${y}`;
}

/** Dias entre hoje e a data (negativo = vencida). */
export function diasAte(iso: string | null | undefined, hoje = hojeYmd()): number | null {
  const alvo = ymd(iso);
  if (!alvo) return null;
  const [ay, am, ad] = alvo.split("-").map(Number);
  const [hy, hm, hd] = hoje.split("-").map(Number);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(hy, hm - 1, hd)) / 86400000);
}

export type Urgencia = "atrasado" | "hoje" | "proximo" | "atencao" | "ok" | "concluido" | "sem-data";

export function urgenciaAtividade(a: TtsAtividade, hoje = hojeYmd()): Urgencia {
  if (a.status === "CONCLUIDO") return "concluido";
  const dias = diasAte(a.prazoLimite, hoje);
  if (dias === null) return "sem-data";
  if (dias < 0) return "atrasado";
  if (dias === 0) return "hoje";
  if (dias <= 7) return "proximo";
  if (dias <= 15) return "atencao";
  return "ok";
}

/** Conta prazos críticos de atividades E de entregáveis de parcela (vencidos, hoje ou ≤7 dias). */
export function prazosCriticos(
  atividades: TtsAtividade[],
  parcelas: TtsParcela[] = [],
  hoje = hojeYmd(),
): number {
  const critico = (u: Urgencia) => u === "atrasado" || u === "hoje" || u === "proximo";

  const deAtividades = atividades.filter((a) => critico(urgenciaAtividade(a, hoje))).length;

  const deParcelas = parcelas.filter((p) => {
    if (p.entregaveisStatus !== "PENDENTE") return false;
    const dias = diasAte(p.entregaveisAte, hoje);
    return dias !== null && dias <= 7;
  }).length;

  return deAtividades + deParcelas;
}

export function concluidas(atividades: TtsAtividade[]): number {
  return atividades.filter((a) => a.status === "CONCLUIDO").length;
}

export function proximoEntregavel(parcelas: TtsParcela[]): TtsParcela | null {
  const pendentes = parcelas
    .filter((p) => p.entregaveisStatus === "PENDENTE" && p.entregaveisAte)
    .sort((a, b) => (ymd(a.entregaveisAte)! < ymd(b.entregaveisAte)! ? -1 : 1));
  return pendentes[0] ?? null;
}

export function proximoRecebimento(parcelas: TtsParcela[]): TtsParcela | null {
  const pendentes = parcelas
    .filter((p) => p.pagamentoStatus !== "RECEBIDO" && p.receberAte)
    .sort((a, b) => (ymd(a.receberAte)! < ymd(b.receberAte)! ? -1 : 1));
  return pendentes[0] ?? null;
}

export function totalRecebido(parcelas: TtsParcela[]): number {
  return parcelas.filter((p) => p.pagamentoStatus === "RECEBIDO").reduce((s, p) => s + p.valor, 0);
}

export function totalContrato(parcelas: TtsParcela[]): number {
  return parcelas.reduce((s, p) => s + p.valor, 0);
}

export type ProximoPrazo = {
  data: string; // YYYY-MM-DD
  titulo: string;
  origem: "atividade" | "parcela";
  urgencia: Urgencia;
  qid?: string | null;
  responsavel?: string | null;
};

export function proximosPrazos(
  atividades: TtsAtividade[],
  parcelas: TtsParcela[],
  limite = 10,
  hoje = hojeYmd(),
): ProximoPrazo[] {
  const itens: ProximoPrazo[] = [];

  for (const a of atividades) {
    if (a.status === "CONCLUIDO") continue;
    const data = ymd(a.prazoLimite);
    if (!data) continue;
    itens.push({
      data,
      titulo: a.titulo,
      origem: "atividade",
      urgencia: urgenciaAtividade(a, hoje),
      qid: a.indicadorQid,
      responsavel: a.responsavel,
    });
  }

  for (const p of parcelas) {
    if (p.entregaveisStatus === "PENDENTE") {
      const data = ymd(p.entregaveisAte);
      if (data) {
        const dias = diasAte(data, hoje)!;
        itens.push({
          data,
          titulo: `Entregáveis mensais — parcela ${p.numero} (${p.competencia})`,
          origem: "parcela",
          urgencia: dias < 0 ? "atrasado" : dias === 0 ? "hoje" : dias <= 7 ? "proximo" : dias <= 15 ? "atencao" : "ok",
        });
      }
    }
  }

  return itens.sort((a, b) => (a.data < b.data ? -1 : 1)).slice(0, limite);
}

export function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
