"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import {
  ArrowLeft, Play, Pause, XCircle, Loader2, Users, Upload,
  CheckCircle, AlertCircle, Clock, MessageSquare,
} from "lucide-react";

type Campanha = {
  id: string;
  nome: string;
  status: string;
  mensagem: string;
  mediaUrl: string | null;
  mediaType: string | null;
  delayMinSegundos: number;
  delayMaxSegundos: number;
  totalContatos: number;
  enviados: number;
  falhas: number;
  responderam: number;
  iniciadaEm: string | null;
  session: { id: string; nome: string; phoneNumber: string | null };
};

type Contato = {
  id: string;
  telefone: string;
  nome: string | null;
  status: string;
  enviadoEm: string | null;
  respondeuEm: string | null;
  erro: string | null;
};

const STATUS_COLOR: Record<string, string> = {
  RASCUNHO: "#6b7280", RODANDO: "#3b82f6", PAUSADA: "#f59e0b",
  CONCLUIDA: "#10b981", CANCELADA: "#ef4444",
};
const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho", RODANDO: "Rodando", PAUSADA: "Pausada",
  CONCLUIDA: "Concluída", CANCELADA: "Cancelada",
};
const CONTATO_COLOR: Record<string, string> = {
  PENDENTE: "#6b7280", ENVIADO: "#3b82f6", FALHA: "#ef4444", RESPONDEU: "#10b981",
};

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-bold" style={{ color: color ?? "var(--text-primary)" }}>{value}</p>
      <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{label}</p>
    </div>
  );
}

function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1" style={{ color: "var(--text-muted)" }}>
        <span>{pct}% enviado</span>
        <span>{value}/{total}</span>
      </div>
      <div className="w-full rounded-full h-2" style={{ background: "var(--card-border)" }}>
        <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: "var(--brand-accent)" }} />
      </div>
    </div>
  );
}

export default function CampanhaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [campanha, setCampanha] = useState<Campanha | null>(null);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [abaContatos, setAbaContatos] = useState<"leads" | "lista">("lista");
  const [listaTexto, setListaTexto] = useState("");
  const [adicionando, setAdicionando] = useState(false);
  const [pagina, setPagina] = useState(1);

  const fetch = useCallback(async () => {
    try {
      const [c, ct] = await Promise.all([
        apiFetch(`/campanhas/${id}`),
        apiFetch(`/campanhas/${id}/contatos?page=${pagina}&limit=30`),
      ]);
      setCampanha(c);
      setContatos(ct.items ?? []);
      setTotal(ct.total ?? 0);
    } catch {}
  }, [id, pagina]);

  useEffect(() => {
    fetch().finally(() => setLoading(false));
  }, [fetch]);

  useEffect(() => {
    if (!campanha || campanha.status !== "RODANDO") return;
    const t = setInterval(fetch, 4000);
    return () => clearInterval(t);
  }, [campanha?.status, fetch]);

  async function acao(endpoint: string) {
    try {
      await apiFetch(`/campanhas/${id}/${endpoint}`, { method: "POST" });
      fetch();
    } catch (e: any) { alert(e?.message ?? "Erro"); }
  }

  async function adicionarLista() {
    const linhas = listaTexto.split("\n").filter((l) => l.trim());
    const contatos = linhas.map((l) => {
      const [telefone, ...restNome] = l.split(",");
      return { telefone: telefone.trim(), nome: restNome.join(",").trim() || undefined };
    });
    if (contatos.length === 0) return;
    setAdicionando(true);
    try {
      const r = await apiFetch(`/campanhas/${id}/contatos/lista`, {
        method: "POST",
        body: JSON.stringify({ contatos }),
      });
      alert(`${r.adicionados} contatos adicionados`);
      setListaTexto("");
      fetch();
    } catch (e: any) { alert(e?.message ?? "Erro"); }
    finally { setAdicionando(false); }
  }

  if (loading || !campanha) {
    return (
      <AppShell title="Campanha">
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--text-muted)" }} />
        </div>
      </AppShell>
    );
  }

  const isRascunho = campanha.status === "RASCUNHO";

  return (
    <AppShell title={campanha.nome}>
      <div className="max-w-3xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/campanhas")} className="p-2 rounded-lg" style={{ color: "var(--text-muted)" }}>
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold truncate" style={{ color: "var(--text-primary)" }}>{campanha.nome}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${STATUS_COLOR[campanha.status]}20`, color: STATUS_COLOR[campanha.status] }}>
                {STATUS_LABEL[campanha.status] ?? campanha.status}
              </span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>via {campanha.session?.nome}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {campanha.status === "RASCUNHO" && <button onClick={() => acao("start")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium" style={{ background: "#3b82f6", color: "#fff" }}><Play className="w-3.5 h-3.5" />Iniciar</button>}
            {campanha.status === "RODANDO" && <button onClick={() => acao("pause")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium" style={{ background: "#f59e0b", color: "#fff" }}><Pause className="w-3.5 h-3.5" />Pausar</button>}
            {campanha.status === "PAUSADA" && <button onClick={() => acao("resume")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium" style={{ background: "#3b82f6", color: "#fff" }}><Play className="w-3.5 h-3.5" />Retomar</button>}
            {["RASCUNHO","RODANDO","PAUSADA"].includes(campanha.status) && (
              <button onClick={() => { if(confirm("Cancelar?")) acao("cancel"); }} className="p-2 rounded-lg" style={{ color: "#ef4444" }}>
                <XCircle className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="p-5 rounded-xl border space-y-4" style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}>
          <ProgressBar value={campanha.enviados} total={campanha.totalContatos} />
          <div className="grid grid-cols-4 gap-4 pt-2 border-t" style={{ borderColor: "var(--card-border)" }}>
            <Stat label="Total" value={campanha.totalContatos} />
            <Stat label="Enviados" value={campanha.enviados} color="#3b82f6" />
            <Stat label="Falhas" value={campanha.falhas} color="#ef4444" />
            <Stat label="Responderam" value={campanha.responderam} color="#10b981" />
          </div>
        </div>

        {/* Mensagem */}
        <div className="p-4 rounded-xl border" style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}>
          <p className="text-xs font-medium mb-2" style={{ color: "var(--text-muted)" }}>MENSAGEM</p>
          <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--text-primary)" }}>{campanha.mensagem}</p>
          <div className="flex items-center gap-3 mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
            <span>Delay: {campanha.delayMinSegundos}s – {campanha.delayMaxSegundos}s</span>
            {campanha.mediaUrl && <span>+ {campanha.mediaType === "VIDEO" ? "Vídeo" : "Imagem"}</span>}
          </div>
        </div>

        {/* Adicionar contatos (só no rascunho) */}
        {isRascunho && (
          <div className="p-5 rounded-xl border space-y-4" style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}>
            <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Adicionar contatos</p>
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-muted)" }}>
                Lista de números (um por linha: telefone, nome)
              </label>
              <textarea
                value={listaTexto}
                onChange={(e) => setListaTexto(e.target.value)}
                placeholder={"11999999999, João Silva\n21988888888, Maria\n31977777777"}
                rows={5}
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none font-mono"
                style={{ borderColor: "var(--card-border)", background: "var(--shell-bg)", color: "var(--text-primary)" }}
              />
              <button
                onClick={adicionarLista}
                disabled={adicionando || !listaTexto.trim()}
                className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ background: "var(--brand-accent)", color: "#fff" }}
              >
                {adicionando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                Adicionar contatos
              </button>
            </div>
          </div>
        )}

        {/* Lista de contatos */}
        <div className="p-5 rounded-xl border" style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}>
          <p className="font-semibold text-sm mb-3" style={{ color: "var(--text-primary)" }}>
            Contatos <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>({total})</span>
          </p>
          {contatos.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: "var(--text-muted)" }}>Nenhum contato adicionado</p>
          ) : (
            <div className="space-y-2">
              {contatos.map((c) => (
                <div key={c.id} className="flex items-center gap-3 py-2 border-b last:border-0" style={{ borderColor: "var(--card-border)" }}>
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: CONTATO_COLOR[c.status] ?? "#6b7280" }} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm" style={{ color: "var(--text-primary)" }}>{c.nome ?? c.telefone}</span>
                    {c.nome && <span className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>{c.telefone}</span>}
                  </div>
                  <span className="text-xs" style={{ color: CONTATO_COLOR[c.status] ?? "var(--text-muted)" }}>{c.status}</span>
                  {c.erro && <span className="text-xs" style={{ color: "#ef4444" }} title={c.erro}>⚠</span>}
                </div>
              ))}
            </div>
          )}
          {total > 30 && (
            <div className="flex justify-center gap-3 mt-3">
              <button disabled={pagina === 1} onClick={() => setPagina(p => p - 1)} className="text-sm px-3 py-1 rounded border disabled:opacity-40" style={{ borderColor: "var(--card-border)" }}>Anterior</button>
              <span className="text-sm self-center" style={{ color: "var(--text-muted)" }}>{pagina}</span>
              <button disabled={pagina * 30 >= total} onClick={() => setPagina(p => p + 1)} className="text-sm px-3 py-1 rounded border disabled:opacity-40" style={{ borderColor: "var(--card-border)" }}>Próximo</button>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
