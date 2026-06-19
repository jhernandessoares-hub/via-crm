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
  rendaBrutaFamiliar?: number | null;
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

function formatMoney(v: number | null | undefined): string {
  if (v == null) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const COL = "36px 80px 1.4fr 1.1fr 1fr 1.2fr 1.1fr 1fr 0.9fr";

const SEL_STYLE: React.CSSProperties = {
  width: "100%", fontSize: 11, padding: "2px 4px", borderRadius: 4,
  border: "1px solid var(--shell-card-border)",
  background: "var(--shell-bg)", color: "var(--shell-text)",
};
const INPUT_STYLE: React.CSSProperties = { ...SEL_STYLE };

export default function BaseFriaPage() {
  const { can } = usePermissions();
  const canCampaign = can("base_fria", "campaign");

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Filtros
  const [showFilters, setShowFilters] = useState(false);
  const [interesseFilter, setInteresseFilter] = useState("");
  const [responsavelFilter, setResponsavelFilter] = useState("");
  const [campanhaFilter, setCampanhaFilter] = useState(""); // "" | "sim" | "nao"
  const [rendaMin, setRendaMin] = useState("");
  const [rendaMax, setRendaMax] = useState("");

  // Campanha
  const [modalOpen, setModalOpen] = useState(false);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [modeloId, setModeloId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [enviando, setEnviando] = useState(false);
  // Composição inline de campanha (sem precisar cadastrar antes em Campanhas)
  const [modoNovo, setModoNovo] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novaMensagem, setNovaMensagem] = useState("");
  const [delayMin, setDelayMin] = useState(10);
  const [delayMax, setDelayMax] = useState(20);

  // Campanhas criadas (disparos)
  const [disparosOpen, setDisparosOpen] = useState(false);
  const [disparos, setDisparos] = useState<any[]>([]);
  const [loadingDisparos, setLoadingDisparos] = useState(false);

  function openDisparos() {
    setDisparosOpen(true);
    setLoadingDisparos(true);
    apiFetch("/campanhas/disparos")
      .then((d) => setDisparos(Array.isArray(d) ? d : []))
      .catch(() => setDisparos([]))
      .finally(() => setLoadingDisparos(false));
  }

  function openCampaignModal() {
    if (selected.size === 0) {
      alert("Selecione os leads primeiro.");
      return;
    }
    setModeloId("");
    setSessionId("");
    setNovoNome("");
    setNovaMensagem("");
    setDelayMin(10);
    setDelayMax(20);
    Promise.all([
      apiFetch("/campanhas/modelos").catch(() => []),
      apiFetch("/inbox-wa-light").catch(() => []),
    ]).then(([mods, sess]) => {
      const lista = Array.isArray(mods) ? mods : [];
      setModelos(lista);
      setSessions(Array.isArray(sess) ? sess.filter((s: Session) => s.status === "CONNECTED") : []);
      // Sem modelo cadastrado → já abre no modo "Nova mensagem"
      setModoNovo(lista.length === 0);
      setModalOpen(true);
    });
  }

  async function dispararCampanha() {
    if (!sessionId) {
      alert("Escolha a sessão de WhatsApp.");
      return;
    }
    setEnviando(true);
    try {
      // Modo "Nova mensagem": cria o modelo na hora (fica salvo para reuso) e usa o id.
      let mid = modeloId;
      if (modoNovo) {
        if (!novaMensagem.trim()) {
          alert("Escreva a mensagem da campanha.");
          setEnviando(false);
          return;
        }
        const min = Math.max(10, delayMin || 10);
        const max = Math.max(min, delayMax || min);
        const novo = await apiFetch("/campanhas/modelos", {
          method: "POST",
          body: JSON.stringify({
            nome: novoNome.trim() || `Base Fria — ${new Date().toLocaleDateString("pt-BR")}`,
            mensagem: novaMensagem.trim(),
            delayMinSegundos: min,
            delayMaxSegundos: max,
          }),
        });
        mid = novo?.id;
      }
      if (!mid) {
        alert("Escolha um modelo ou escreva uma mensagem.");
        setEnviando(false);
        return;
      }
      const r = await apiFetch("/campanhas/disparos/base-fria", {
        method: "POST",
        body: JSON.stringify({ modeloId: mid, sessionId, leadIds: [...selected] }),
      });
      const ignorados = r?.ignorados ?? 0;
      alert(`Campanha iniciada para ${r?.totalContatos ?? 0} lead(s).${ignorados ? ` ${ignorados} ignorado(s) (sem telefone ou já em campanha).` : ""}`);
      setModalOpen(false);
      setSelected(new Set());
      setModeloId("");
      setSessionId("");
      setNovoNome("");
      setNovaMensagem("");
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

  const responsaveis = useMemo(() => {
    const s = new Set<string>();
    for (const l of leads) if (l.assignedUserName) s.add(l.assignedUserName);
    return [...s].sort();
  }, [leads]);

  const filtered = useMemo(() => {
    const min = rendaMin ? parseFloat(rendaMin.replace(/\./g, "").replace(",", ".")) : null;
    const max = rendaMax ? parseFloat(rendaMax.replace(/\./g, "").replace(",", ".")) : null;
    return leads.filter((l) => {
      if (interesseFilter && l.interesse !== interesseFilter) return false;
      if (responsavelFilter && l.assignedUserName !== responsavelFilter) return false;
      if (campanhaFilter === "sim" && !l.emCampanha) return false;
      if (campanhaFilter === "nao" && l.emCampanha) return false;
      if (min != null && (l.rendaBrutaFamiliar ?? -Infinity) < min) return false;
      if (max != null && (l.rendaBrutaFamiliar ?? Infinity) > max) return false;
      return true;
    });
  }, [leads, interesseFilter, responsavelFilter, campanhaFilter, rendaMin, rendaMax]);

  const activeFilterCount =
    (interesseFilter ? 1 : 0) + (responsavelFilter ? 1 : 0) + (campanhaFilter ? 1 : 0) + (rendaMin || rendaMax ? 1 : 0);

  function clearFilters() {
    setInteresseFilter("");
    setResponsavelFilter("");
    setCampanhaFilter("");
    setRendaMin("");
    setRendaMax("");
  }

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
        <button
          onClick={() => setShowFilters((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
          style={{
            borderColor: activeFilterCount ? "var(--brand-accent)" : "var(--shell-card-border)",
            color: activeFilterCount ? "var(--brand-accent)" : "var(--shell-text)",
            background: showFilters ? "var(--shell-hover)" : "transparent",
          }}
        >
          ▼ Filtros{activeFilterCount > 0 && ` (${activeFilterCount})`}
        </button>
        {activeFilterCount > 0 && (
          <button onClick={clearFilters} className="text-xs text-[var(--shell-subtext)] underline hover:text-[var(--shell-text)]">
            Limpar filtros
          </button>
        )}
        {canCampaign && (
          <div className="ml-auto flex items-center gap-2">
            {selected.size > 0 && (
              <span className="text-xs text-[var(--shell-subtext)]">{selected.size} selecionado(s)</span>
            )}
            <button
              onClick={openDisparos}
              className="rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors hover:bg-[var(--shell-hover)]"
              style={{ borderColor: "var(--shell-card-border)", color: "var(--shell-text)" }}
            >
              📋 Campanhas criadas
            </button>
            <button
              onClick={openCampaignModal}
              className="rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors hover:bg-[var(--shell-hover)]"
              style={{ borderColor: "var(--brand-accent)", color: "var(--brand-accent)" }}
            >
              📣 Criar campanha
            </button>
          </div>
        )}
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border" style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-card-bg)" }}>
        <div className="grid gap-2 border-b px-4 py-3 text-xs font-semibold uppercase tracking-wide"
          style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-bg)", color: "var(--shell-subtext)", gridTemplateColumns: COL }}>
          <div>{canCampaign && <input type="checkbox" checked={allSelected} onChange={toggleAll} />}</div>
          <div>Número</div><div>Nome</div><div>Telefone</div><div>Renda</div><div>Interesse</div>
          <div>Campanha</div><div>Responsável</div><div>Desde</div>
        </div>

        {/* Linha de filtros */}
        {showFilters && (
          <div className="grid items-center gap-2 border-b px-4 py-2"
            style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-hover)", gridTemplateColumns: COL }}>
            <div /><div />
            <div /> {/* Nome */}
            <div /> {/* Telefone */}
            <div className="flex gap-1">
              <input style={INPUT_STYLE} placeholder="mín" value={rendaMin} onChange={(e) => setRendaMin(e.target.value)} />
              <input style={INPUT_STYLE} placeholder="máx" value={rendaMax} onChange={(e) => setRendaMax(e.target.value)} />
            </div>
            <select style={SEL_STYLE} value={interesseFilter} onChange={(e) => setInteresseFilter(e.target.value)}>
              <option value="">Todos</option>
              {interesses.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <select style={SEL_STYLE} value={campanhaFilter} onChange={(e) => setCampanhaFilter(e.target.value)}>
              <option value="">Todas</option>
              <option value="sim">Em campanha</option>
              <option value="nao">Sem campanha</option>
            </select>
            <select style={SEL_STYLE} value={responsavelFilter} onChange={(e) => setResponsavelFilter(e.target.value)}>
              <option value="">Todos</option>
              {responsaveis.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <div />
          </div>
        )}

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
                <div className="truncate text-sm text-[var(--shell-subtext)]"><MaskedField field="lead.financeiro">{formatMoney(l.rendaBrutaFamiliar)}</MaskedField></div>
                <div className="truncate text-sm text-[var(--shell-subtext)]" title={l.interesse ?? undefined}>
                  {l.interesse || "—"}
                  {l.interesseOrigem === "MANUAL" && l.interesse && <span className="ml-1 text-[10px] text-amber-600" title="Editado manualmente">✎</span>}
                </div>
                <div className="min-w-0">
                  {l.emCampanha ? (
                    <span className="inline-block rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                      📣 {l.emCampanhaDesde ? formatDate(l.emCampanhaDesde) : "ativa"}
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

            {/* Alternância: usar modelo salvo ou compor nova mensagem aqui mesmo */}
            <div className="mt-4 inline-flex rounded-lg border p-1" style={{ borderColor: "var(--shell-card-border)" }}>
              <button
                type="button"
                onClick={() => setModoNovo(false)}
                className="rounded-md px-3 py-1 text-sm"
                style={{ background: !modoNovo ? "var(--shell-hover)" : "transparent", color: !modoNovo ? "var(--shell-text)" : "var(--shell-subtext)", fontWeight: !modoNovo ? 600 : 400 }}
              >
                Modelo salvo
              </button>
              <button
                type="button"
                onClick={() => setModoNovo(true)}
                className="rounded-md px-3 py-1 text-sm"
                style={{ background: modoNovo ? "var(--shell-hover)" : "transparent", color: modoNovo ? "var(--shell-text)" : "var(--shell-subtext)", fontWeight: modoNovo ? 600 : 400 }}
              >
                Nova mensagem
              </button>
            </div>

            {!modoNovo ? (
              <>
                <label className="mt-3 block text-sm font-medium text-[var(--shell-text)]">Modelo</label>
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
                  <p className="mt-1 text-xs text-amber-600">Nenhum modelo salvo. Use "Nova mensagem".</p>
                )}
              </>
            ) : (
              <>
                <label className="mt-3 block text-sm font-medium text-[var(--shell-text)]">Nome (para reuso) — opcional</label>
                <input
                  value={novoNome}
                  onChange={(e) => setNovoNome(e.target.value)}
                  placeholder="Ex.: Reaquecimento lançamento X"
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-bg)", color: "var(--shell-text)" }}
                />
                <label className="mt-3 block text-sm font-medium text-[var(--shell-text)]">Mensagem</label>
                <textarea
                  value={novaMensagem}
                  onChange={(e) => setNovaMensagem(e.target.value)}
                  placeholder="Use {{nome}} para personalizar com o nome do lead."
                  rows={4}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-bg)", color: "var(--shell-text)" }}
                />
                <div className="mt-2 flex items-center gap-2">
                  <label className="text-xs text-[var(--shell-subtext)]">Delay entre envios (s):</label>
                  <input type="number" min={10} value={delayMin} onChange={(e) => setDelayMin(Math.max(10, parseInt(e.target.value) || 10))}
                    className="w-16 rounded-lg border px-2 py-1 text-sm text-center" style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-bg)", color: "var(--shell-text)" }} />
                  <span className="text-xs text-[var(--shell-subtext)]">a</span>
                  <input type="number" min={delayMin} value={delayMax} onChange={(e) => setDelayMax(Math.max(delayMin, parseInt(e.target.value) || delayMin))}
                    className="w-16 rounded-lg border px-2 py-1 text-sm text-center" style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-bg)", color: "var(--shell-text)" }} />
                </div>
              </>
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
              <Button size="sm" onClick={dispararCampanha} loading={enviando} disabled={!sessionId || (modoNovo ? !novaMensagem.trim() : !modeloId)}>
                Iniciar campanha
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: campanhas criadas (disparos da Base Fria) */}
      {disparosOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
          <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl border shadow-xl" style={{ background: "var(--shell-card-bg)", borderColor: "var(--shell-card-border)" }}>
            <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--shell-card-border)" }}>
              <h2 className="text-lg font-semibold text-[var(--shell-text)]">Campanhas criadas (WhatsApp Light)</h2>
              <button onClick={() => setDisparosOpen(false)} className="text-[var(--shell-subtext)] hover:text-[var(--shell-text)]">✕</button>
            </div>
            <div className="overflow-y-auto p-5">
              {loadingDisparos ? (
                <p className="text-sm text-[var(--shell-subtext)]">Carregando…</p>
              ) : disparos.length === 0 ? (
                <p className="text-sm text-[var(--shell-subtext)]">Nenhuma campanha criada ainda.</p>
              ) : (
                <div className="space-y-2">
                  {disparos.map((d) => {
                    const statusColor: Record<string, string> = {
                      RODANDO: "bg-blue-100 text-blue-700",
                      PAUSADA: "bg-amber-100 text-amber-700",
                      CONCLUIDA: "bg-emerald-100 text-emerald-700",
                      CANCELADA: "bg-slate-100 text-slate-600",
                      RASCUNHO: "bg-slate-100 text-slate-600",
                    };
                    return (
                      <div key={d.id} className="rounded-lg border p-3" style={{ borderColor: "var(--shell-card-border)" }}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1.5">
                            {typeof d.nome === "string" && d.nome.startsWith("Base Fria") && (
                              <span className="shrink-0 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">❄️ Base Fria</span>
                            )}
                            <span className="truncate font-medium text-[var(--shell-text)]" title={d.nome}>{d.nome}</span>
                          </span>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusColor[d.status] ?? "bg-slate-100 text-slate-600"}`}>{d.status}</span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--shell-subtext)]">
                          <span>📇 {d.totalContatos ?? 0} contatos</span>
                          <span>📤 {d.enviados ?? 0} enviados</span>
                          <span>💬 {d.responderam ?? 0} responderam</span>
                          {d.falhas ? <span>⚠️ {d.falhas} falhas</span> : null}
                          {d.session?.nome && <span>📱 {d.session.nome}</span>}
                          {d.iniciadaEm && <span>🕒 {new Date(d.iniciadaEm).toLocaleString("pt-BR")}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex justify-end border-t px-5 py-3" style={{ borderColor: "var(--shell-card-border)" }}>
              <Button variant="outline" size="sm" onClick={() => setDisparosOpen(false)}>Fechar</Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
