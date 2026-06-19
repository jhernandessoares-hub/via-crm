"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Snowflake } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiFetch } from "@/lib/api";
import { formatLeadNumber } from "@/lib/format-lead-number";
import { MaskedField } from "@/components/MaskedValue";
import { usePermissions } from "@/lib/permissions";

type Lead = {
  id: string;
  numero?: number | null;
  reentradaCount?: number | null;
  nome?: string;
  nomeCorreto?: string | null;
  telefone?: string;
  interesse?: string | null;
  interesseOrigem?: string | null;
  assignedUserName?: string | null;
  baseFriaDesde?: string | null;
  criadoEm?: string;
  emCampanha?: boolean;
  emCampanhaDesde?: string | null;
};

type Modelo = { id: string; nome: string; mensagem: string };
type Session = { id: string; nome: string; status: string; phoneNumber: string | null };

function displayName(l: Lead): string {
  return l.nomeCorreto || l.nome || "Sem nome";
}

function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-BR");
}

const COL = "36px 90px 1.4fr 1.1fr 1.2fr 1fr 1fr 1fr";

export default function BaseFriaPage() {
  const { can } = usePermissions();
  const canCampaign = can("base_fria", "campaign");

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Campanha
  const [modalOpen, setModalOpen] = useState(false);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [modeloId, setModeloId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [enviando, setEnviando] = useState(false);

  function openCampaignModal() {
    Promise.all([
      apiFetch("/campanhas/modelos").catch(() => []),
      apiFetch("/whatsapp-unofficial").catch(() => []),
    ]).then(([mods, sess]) => {
      setModelos(Array.isArray(mods) ? mods : []);
      setSessions(Array.isArray(sess) ? sess.filter((s: Session) => s.status === "CONNECTED") : []);
      setModalOpen(true);
    });
  }

  async function dispararCampanha() {
    if (!modeloId || !sessionId) {
      alert("Escolha o modelo e a sessão de WhatsApp.");
      return;
    }
    setEnviando(true);
    try {
      const r = await apiFetch("/campanhas/disparos/base-fria", {
        method: "POST",
        body: JSON.stringify({ modeloId, sessionId, leadIds: [...selected] }),
      });
      const ignorados = r?.ignorados ?? 0;
      alert(`Campanha iniciada para ${r?.totalContatos ?? 0} lead(s).${ignorados ? ` ${ignorados} ignorado(s) (sem telefone ou já em campanha).` : ""}`);
      setModalOpen(false);
      setSelected(new Set());
      setModeloId("");
      setSessionId("");
      load();
    } catch (e: any) {
      alert(e?.message ?? "Erro ao iniciar a campanha.");
    } finally {
      setEnviando(false);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch(`/leads/base-fria${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
      setLeads(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }

  // Carrega na montagem e quando a busca muda (debounce simples)
  useEffect(() => {
    const t = setTimeout(() => load(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const interesses = useMemo(() => {
    const s = new Set<string>();
    for (const l of leads) if (l.interesse) s.add(l.interesse);
    return [...s].sort();
  }, [leads]);

  const [interesseFilter, setInteresseFilter] = useState("");
  const filtered = useMemo(
    () => (interesseFilter ? leads.filter((l) => l.interesse === interesseFilter) : leads),
    [leads, interesseFilter],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = filtered.length > 0 && filtered.every((l) => selected.has(l.id));
  function toggleAll() {
    setSelected((prev) => {
      if (allSelected) {
        const next = new Set(prev);
        filtered.forEach((l) => next.delete(l.id));
        return next;
      }
      const next = new Set(prev);
      filtered.forEach((l) => next.add(l.id));
      return next;
    });
  }

  return (
    <AppShell title="Base Fria">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-[var(--shell-text)]">
            <Snowflake className="h-6 w-6 text-sky-500" /> Base Fria
          </h1>
          <p className="mt-0.5 text-sm text-[var(--shell-subtext)]">
            Leads esfriados disponíveis para reaquecimento · {filtered.length} leads
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={load} loading={loading}>
          {loading ? "Carregando..." : "Atualizar"}
        </Button>
        <Input className="w-56" placeholder="Buscar nome, telefone, CPF..." value={q} onChange={(e) => setQ(e.target.value)} />
        {interesses.length > 0 && (
          <select
            value={interesseFilter}
            onChange={(e) => setInteresseFilter(e.target.value)}
            className="rounded-lg border px-3 py-1.5 text-sm"
            style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-bg)", color: "var(--shell-text)" }}
          >
            <option value="">Todos os interesses</option>
            {interesses.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        )}
        {canCampaign && selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-[var(--shell-subtext)]">{selected.size} selecionado(s)</span>
            <button
              onClick={openCampaignModal}
              className="rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors hover:bg-[var(--shell-hover)]"
              style={{ borderColor: "var(--brand-accent)", color: "var(--brand-accent)" }}
            >
              📣 Escolher campanha
            </button>
          </div>
        )}
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border" style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-card-bg)" }}>
        <div className="grid gap-2 border-b px-4 py-3 text-xs font-semibold uppercase tracking-wide"
          style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-bg)", color: "var(--shell-subtext)", gridTemplateColumns: COL }}>
          <div>{canCampaign && <input type="checkbox" checked={allSelected} onChange={toggleAll} />}</div>
          <div>Número</div><div>Nome</div><div>Telefone</div><div>Interesse</div>
          <div>Campanha</div><div>Responsável</div><div>Na Base Fria desde</div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-6 text-sm text-[var(--shell-subtext)]">
            {loading ? "Carregando..." : "Nenhum lead na Base Fria."}
          </div>
        ) : (
          filtered.map((l) => {
            const numero = formatLeadNumber(l.numero, l.reentradaCount ?? 1);
            return (
              <div key={l.id} className="grid items-center gap-2 border-b px-4 py-3 last:border-b-0 hover:bg-[var(--shell-hover)] transition-colors"
                style={{ borderColor: "var(--shell-card-border)", gridTemplateColumns: COL }}>
                <div>{canCampaign && <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} />}</div>
                <div className="truncate font-mono text-sm text-[var(--shell-subtext)]">{numero || "—"}</div>
                <div className="min-w-0">
                  <Link href={`/leads/${l.id}`} className="block truncate font-medium text-[var(--shell-text)] hover:underline">{displayName(l)}</Link>
                </div>
                <div className="truncate text-sm text-[var(--shell-subtext)]"><MaskedField field="lead.telefone">{l.telefone || "—"}</MaskedField></div>
                <div className="truncate text-sm text-[var(--shell-subtext)]" title={l.interesse ?? undefined}>
                  {l.interesse || "—"}
                  {l.interesseOrigem === "MANUAL" && l.interesse && <span className="ml-1 text-[10px] text-amber-600" title="Editado manualmente">✎</span>}
                </div>
                <div className="min-w-0">
                  {l.emCampanha ? (
                    <span className="inline-block rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700" title={l.emCampanhaDesde ? `Desde ${formatDate(l.emCampanhaDesde)}` : undefined}>
                      📣 Em campanha{l.emCampanhaDesde ? ` · ${formatDate(l.emCampanhaDesde)}` : ""}
                    </span>
                  ) : (
                    <span className="text-sm text-[var(--shell-subtext)]">—</span>
                  )}
                </div>
                <div className="truncate text-sm text-[var(--shell-subtext)]"><MaskedField field="lead.responsavel">{l.assignedUserName || "—"}</MaskedField></div>
                <div className="truncate whitespace-nowrap text-xs text-[var(--shell-subtext)]">{formatDate(l.baseFriaDesde || l.criadoEm)}</div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal: escolher campanha de reaquecimento */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
          <div className="w-full max-w-md rounded-xl border p-5 shadow-xl" style={{ background: "var(--shell-card-bg)", borderColor: "var(--shell-card-border)" }}>
            <h2 className="text-lg font-semibold text-[var(--shell-text)]">Campanha de reaquecimento</h2>
            <p className="mt-1 text-sm text-[var(--shell-subtext)]">
              {selected.size} lead(s) selecionado(s). Cada lead recebe a mensagem uma vez (delay anti-ban).
            </p>

            <label className="mt-4 block text-sm font-medium text-[var(--shell-text)]">Modelo</label>
            <select
              value={modeloId}
              onChange={(e) => setModeloId(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-bg)", color: "var(--shell-text)" }}
            >
              <option value="">Selecione um modelo…</option>
              {modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
            {modelos.length === 0 && (
              <p className="mt-1 text-xs text-amber-600">Nenhum modelo cadastrado. Crie um em Campanhas.</p>
            )}

            <label className="mt-4 block text-sm font-medium text-[var(--shell-text)]">Sessão de WhatsApp (Light)</label>
            <select
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-bg)", color: "var(--shell-text)" }}
            >
              <option value="">Selecione uma sessão conectada…</option>
              {sessions.map((s) => <option key={s.id} value={s.id}>{s.nome}{s.phoneNumber ? ` · ${s.phoneNumber}` : ""}</option>)}
            </select>
            {sessions.length === 0 && (
              <p className="mt-1 text-xs text-amber-600">Nenhuma sessão WhatsApp Light conectada.</p>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setModalOpen(false)} disabled={enviando}>
                Cancelar
              </Button>
              <Button size="sm" onClick={dispararCampanha} loading={enviando} disabled={!modeloId || !sessionId}>
                Iniciar campanha
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
