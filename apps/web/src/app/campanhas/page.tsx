"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { Megaphone, Loader2, Play, Pause, XCircle, RefreshCw } from "lucide-react";

type Disparo = {
  id: string; nome: string; status: string;
  totalContatos: number; enviados: number; falhas: number; responderam: number;
  naoResponderam24h: number;
  iniciadaEm: string; concluidaEm: string | null;
  modelo: { nome: string } | null;
  session: { nome: string; phoneNumber: string | null } | null;
};

const STATUS_COLOR: Record<string, string> = {
  RODANDO: "#3b82f6", PAUSADA: "#f59e0b", CONCLUIDA: "#10b981",
  CANCELADA: "#ef4444", PENDENTE: "#6b7280",
};

function Bar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className="w-full rounded-full h-1.5 mt-1" style={{ background: "var(--card-border)" }}>
      <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: "var(--brand-accent)" }} />
    </div>
  );
}

export default function CampanhasPage() {
  const [disparos, setDisparos] = useState<Disparo[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetch() {
    try { setDisparos(await apiFetch("/campanhas/disparos")); } catch {}
  }

  useEffect(() => {
    fetch().finally(() => setLoading(false));
    const t = setInterval(fetch, 5000);
    return () => clearInterval(t);
  }, []);

  async function acao(id: string, endpoint: string) {
    try { await apiFetch(`/campanhas/disparos/${id}/${endpoint}`, { method: "POST" }); fetch(); }
    catch (e: any) { alert(e?.message ?? "Erro"); }
  }

  return (
    <AppShell title="Campanhas">
      <div className="max-w-3xl mx-auto space-y-5">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Campanhas</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            Histórico de todos os disparos via WhatsApp Light
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--text-muted)" }} />
          </div>
        ) : disparos.length === 0 ? (
          <div className="text-center py-16" style={{ color: "var(--text-muted)" }}>
            <Megaphone className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhum disparo realizado ainda</p>
          </div>
        ) : (
          <div className="space-y-3">
            {disparos.map((d) => {
              const pct = d.totalContatos > 0 ? Math.round((d.enviados / d.totalContatos) * 100) : 0;
              return (
                <div key={d.id} className="p-4 rounded-xl border" style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{d.nome}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: `${STATUS_COLOR[d.status] ?? "#6b7280"}20`, color: STATUS_COLOR[d.status] ?? "#6b7280" }}>
                          {d.status}
                        </span>
                        {d.session && (
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>via {d.session.nome}</span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs mt-2 flex-wrap" style={{ color: "var(--text-muted)" }}>
                        <span>Total: <strong style={{ color: "var(--text-primary)" }}>{d.totalContatos}</strong></span>
                        <span style={{ color: "#3b82f6" }}>Enviados: <strong>{d.enviados}</strong></span>
                        <span style={{ color: "#ef4444" }}>Erros: <strong>{d.falhas}</strong></span>
                        <span style={{ color: "#10b981" }}>Responderam: <strong>{d.responderam}</strong></span>
                        {d.naoResponderam24h > 0 && (
                          <span style={{ color: "#f59e0b" }}>Sem resposta +24h: <strong>{d.naoResponderam24h}</strong></span>
                        )}
                        <span style={{ color: "var(--brand-accent)" }}><strong>{pct}%</strong></span>
                      </div>
                      <Bar value={d.enviados} total={d.totalContatos} />
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {d.status === "RODANDO" && (
                        <button onClick={() => acao(d.id, "pause")} className="p-2 rounded-lg"
                          style={{ background: "#f59e0b20", color: "#f59e0b" }}>
                          <Pause className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {d.status === "PAUSADA" && (
                        <button onClick={() => acao(d.id, "resume")} className="p-2 rounded-lg"
                          style={{ background: "#3b82f620", color: "#3b82f6" }}>
                          <Play className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {["RODANDO", "PAUSADA"].includes(d.status) && (
                        <button onClick={() => { if (confirm("Cancelar?")) acao(d.id, "cancel"); }}
                          className="p-2 rounded-lg" style={{ background: "#ef444420", color: "#ef4444" }}>
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
