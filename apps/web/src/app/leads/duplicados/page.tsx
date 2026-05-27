"use client";

import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { formatLeadNumber } from "@/lib/format-lead-number";

// ─── Types ────────────────────────────────────────────────────────────────────

type LeadUnit = {
  id: string;
  nome: string;
  status: string;
  towerNome: string | null;
  developmentNome: string | null;
};

type LeadSummary = {
  id: string;
  nome: string;
  nomeCorreto: string | null;
  telefone: string | null;
  email: string | null;
  cpf: string | null;
  criadoEm: string;
  source: string | null;
  numero: number | null;
  stage: { nome: string } | null;
  assignedUser: { nome: string } | null;
  developmentUnits: LeadUnit[];
};

type DuplicateGroup =
  | { tipo: "CERTA"; motivo: string; leads: LeadSummary[] }
  | { tipo: "POSSIVEL"; score: number; motivo: string; leads: LeadSummary[] };

type DuplicatesResult = {
  grupos: DuplicateGroup[];
  totalCerta: number;
  totalPossivel: number;
};

// ─── Field labels ─────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  nome: "Nome",
  nomeCorreto: "Nome correto",
  telefone: "Telefone",
  email: "E-mail",
  cpf: "CPF",
  rg: "RG",
  profissao: "Profissão",
  empresa: "Empresa",
  endereco: "Endereço",
  cep: "CEP",
  cidade: "Cidade",
  uf: "UF",
  stageId: "Etapa",
  assignedUserId: "Responsável",
  origem: "Origem",
  observacao: "Observação",
};

type FieldKey = keyof typeof FIELD_LABELS;

const MERGE_FIELDS: FieldKey[] = [
  "nome",
  "nomeCorreto",
  "telefone",
  "email",
  "cpf",
  "rg",
  "profissao",
  "empresa",
  "endereco",
  "cep",
  "cidade",
  "uf",
  "origem",
  "observacao",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countFilledFields(lead: LeadSummary): number {
  return [
    lead.nome,
    lead.nomeCorreto,
    lead.telefone,
    lead.email,
    lead.cpf,
    lead.stage,
    lead.assignedUser,
  ].filter(Boolean).length;
}

function getFieldValue(lead: LeadSummary, field: FieldKey): string {
  switch (field) {
    case "nome":
      return lead.nome ?? "";
    case "nomeCorreto":
      return lead.nomeCorreto ?? "";
    case "telefone":
      return lead.telefone ?? "";
    case "email":
      return lead.email ?? "";
    case "cpf":
      return lead.cpf ?? "";
    case "origem":
      return lead.source ?? "";
    default:
      return "";
  }
}

// ─── LeadSearchInput ─────────────────────────────────────────────────────────

function LeadSearchInput({
  label,
  excluded,
  value,
  onChange,
}: {
  label: string;
  excluded: LeadSummary | null;
  value: LeadSummary | null;
  onChange: (lead: LeadSummary | null) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<LeadSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleInput(val: string) {
    setQ(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!val.trim() || val.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data: LeadSummary[] = await apiFetch(`/leads/search?q=${encodeURIComponent(val.trim())}`);
        setResults(data.filter((l) => l.id !== excluded?.id));
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }

  function select(lead: LeadSummary) {
    onChange(lead);
    setQ("");
    setResults([]);
    setOpen(false);
  }

  function clear() {
    onChange(null);
    setQ("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="flex-1 min-w-[220px] space-y-2">
      <p className="text-xs font-semibold" style={{ color: "var(--text-muted, #6b7280)" }}>{label}</p>

      {value ? (
        <div
          className="rounded-lg p-3 relative"
          style={{ border: "2px solid #2563eb", background: "#eff6ff" }}
        >
          <button
            onClick={clear}
            className="absolute top-2 right-2 text-xs px-1.5 py-0.5 rounded"
            style={{ background: "#dbeafe", color: "#1d4ed8" }}
          >
            Trocar
          </button>
          <p className="font-semibold text-sm pr-12 truncate" style={{ color: "#1e40af" }}>
            {value.nomeCorreto ?? value.nome}
            {value.numero && (
              <span className="ml-2 text-xs font-normal" style={{ color: "#3b82f6" }}>
                #{formatLeadNumber(value.numero, 1)}
              </span>
            )}
          </p>
          {value.telefone && <p className="text-xs" style={{ color: "#3b82f6" }}>{value.telefone}</p>}
          {value.cpf && <p className="text-xs" style={{ color: "#3b82f6" }}>CPF: {value.cpf}</p>}
          {value.stage && <p className="text-xs" style={{ color: "#3b82f6" }}>Etapa: {value.stage.nome}</p>}
        </div>
      ) : (
        <div className="relative">
          <input
            type="text"
            value={q}
            onChange={(e) => handleInput(e.target.value)}
            placeholder="Buscar por nome, telefone ou CPF..."
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{
              border: "1px solid var(--border, #e5e7eb)",
              background: "var(--card-bg, #fff)",
              color: "var(--text, #111)",
            }}
          />
          {searching && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: "var(--text-muted, #6b7280)" }}>
              ...
            </span>
          )}
          {open && results.length > 0 && (
            <div
              className="absolute z-30 w-full mt-1 rounded-lg shadow-lg overflow-hidden"
              style={{ border: "1px solid var(--border, #e5e7eb)", background: "var(--card-bg, #fff)" }}
            >
              {results.map((lead) => (
                <button
                  key={lead.id}
                  onClick={() => select(lead)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors"
                  style={{ borderBottom: "1px solid var(--border, #e5e7eb)" }}
                >
                  <span className="font-medium truncate block" style={{ color: "var(--text, #111)" }}>
                    {lead.nomeCorreto ?? lead.nome}
                    {lead.numero && (
                      <span className="ml-2 text-xs font-normal" style={{ color: "var(--text-muted, #6b7280)" }}>
                        #{formatLeadNumber(lead.numero, 1)}
                      </span>
                    )}
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-muted, #6b7280)" }}>
                    {[lead.telefone, lead.cpf, lead.stage?.nome].filter(Boolean).join(" · ")}
                  </span>
                </button>
              ))}
            </div>
          )}
          {open && !searching && results.length === 0 && q.trim().length >= 2 && (
            <div
              className="absolute z-30 w-full mt-1 rounded-lg px-3 py-2 text-sm shadow-lg"
              style={{ border: "1px solid var(--border, #e5e7eb)", background: "var(--card-bg, #fff)", color: "var(--text-muted, #6b7280)" }}
            >
              Nenhum lead encontrado.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ManualMergeSection ───────────────────────────────────────────────────────

function ManualMergeSection({ onMerge }: { onMerge: (group: DuplicateGroup) => void }) {
  const [open, setOpen] = useState(false);
  const [leadA, setLeadA] = useState<LeadSummary | null>(null);
  const [leadB, setLeadB] = useState<LeadSummary | null>(null);

  function handleMerge() {
    if (!leadA || !leadB) return;
    const group: DuplicateGroup = {
      tipo: "CERTA",
      motivo: "Mesclagem manual",
      leads: [leadA, leadB],
    };
    onMerge(group);
  }

  return (
    <div
      className="rounded-lg mb-6"
      style={{ border: "1px solid var(--border, #e5e7eb)", background: "var(--card-bg, #fff)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full px-4 py-3 text-left"
      >
        <span className="text-base">🔀</span>
        <span className="font-semibold text-sm" style={{ color: "var(--text, #111)" }}>
          Mesclar manualmente
        </span>
        <span className="ml-auto text-xs" style={{ color: "var(--text-muted, #6b7280)" }}>
          {open ? "Ocultar" : "Selecionar dois leads para unificar"}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t" style={{ borderColor: "var(--border, #e5e7eb)" }}>
          <p className="text-xs mt-3 mb-3" style={{ color: "var(--text-muted, #6b7280)" }}>
            Busque e selecione dois leads quaisquer para mesclá-los, independente de serem detectados como duplicatas.
          </p>
          <div className="flex flex-wrap gap-4">
            <LeadSearchInput
              label="Lead A (vencedor por padrão)"
              excluded={leadB}
              value={leadA}
              onChange={setLeadA}
            />
            <LeadSearchInput
              label="Lead B"
              excluded={leadA}
              value={leadB}
              onChange={setLeadB}
            />
          </div>
          {leadA && leadB && (
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleMerge}
                className="px-5 py-2 rounded-lg text-sm font-medium"
                style={{ background: "#2563eb", color: "#fff" }}
              >
                ⚡ Mesclar estes dois leads
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── MergeModal ───────────────────────────────────────────────────────────────

function MergeModal({
  group,
  onClose,
  onSuccess,
}: {
  group: DuplicateGroup;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const leads = group.leads;

  // Determinar winner padrão: mais campos preenchidos, ou menor número sequencial
  const defaultWinnerIdx =
    countFilledFields(leads[0]) >= countFilledFields(leads[1])
      ? 0
      : 1;

  const [winnerIdx, setWinnerIdx] = useState(defaultWinnerIdx);
  const [choices, setChoices] = useState<Record<FieldKey, "winner" | "source">>(
    () => {
      const initial: Record<string, "winner" | "source"> = {};
      for (const field of MERGE_FIELDS) {
        const aVal = getFieldValue(leads[defaultWinnerIdx], field);
        const bVal = getFieldValue(leads[1 - defaultWinnerIdx], field);
        // Auto-seleciona o lado que tem valor; se ambos têm, winner
        if (!aVal && bVal) {
          initial[field] = "source";
        } else {
          initial[field] = "winner";
        }
      }
      return initial as Record<FieldKey, "winner" | "source">;
    }
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const winner = leads[winnerIdx];
  const source = leads[1 - winnerIdx];

  function toggleWinner() {
    const newWinnerIdx = 1 - winnerIdx;
    setWinnerIdx(newWinnerIdx);
    // Recalcular choices com o novo winner
    const newChoices: Record<string, "winner" | "source"> = {};
    for (const field of MERGE_FIELDS) {
      const aVal = getFieldValue(leads[newWinnerIdx], field);
      const bVal = getFieldValue(leads[1 - newWinnerIdx], field);
      if (!aVal && bVal) {
        newChoices[field] = "source";
      } else {
        newChoices[field] = "winner";
      }
    }
    setChoices(newChoices as Record<FieldKey, "winner" | "source">);
  }

  function setChoice(field: FieldKey, side: "winner" | "source") {
    setChoices((prev) => ({ ...prev, [field]: side }));
  }

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      // Converter choices para fieldChoices do backend
      // winner = leads[winnerIdx], source = leads[1 - winnerIdx]
      const fieldChoices: Record<string, string> = {};
      for (const field of MERGE_FIELDS) {
        fieldChoices[field] = choices[field];
      }
      await apiFetch(`/leads/${winner.id}/merge`, {
        method: "POST",
        body: JSON.stringify({ sourceLeadId: source.id, fieldChoices }),
      });
      onSuccess();
    } catch (e: any) {
      setError(e?.message ?? "Erro ao mesclar leads");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl"
        style={{ background: "var(--card-bg, #fff)", border: "1px solid var(--border, #e5e7eb)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "var(--border, #e5e7eb)" }}>
          <h2 className="text-lg font-semibold" style={{ color: "var(--text, #111)" }}>
            Mesclar leads duplicados
          </h2>
          <button
            onClick={onClose}
            className="text-2xl leading-none"
            style={{ color: "var(--text-muted, #6b7280)" }}
          >
            &times;
          </button>
        </div>

        {/* Winner selector */}
        <div className="px-6 pt-4 pb-2 flex gap-3">
          {leads.map((lead, idx) => {
            const isWinner = idx === winnerIdx;
            return (
              <button
                key={lead.id}
                onClick={() => { if (!isWinner) toggleWinner(); }}
                className="flex-1 rounded-lg px-4 py-2 text-sm font-medium border transition-colors text-left"
                style={{
                  borderColor: isWinner ? "#16a34a" : "var(--border, #e5e7eb)",
                  background: isWinner ? "#f0fdf4" : "var(--card-bg, #fff)",
                  color: isWinner ? "#15803d" : "var(--text, #111)",
                }}
              >
                <span className="font-semibold">{isWinner ? "Vencedor" : "Fonte (sera arquivado)"}</span>
                <br />
                <span className="text-xs truncate">{lead.nomeCorreto ?? lead.nome}</span>
                {lead.numero && (
                  <span className="ml-2 text-xs" style={{ color: "var(--text-muted, #6b7280)" }}>
                    #{formatLeadNumber(lead.numero, 1)}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <p className="px-6 pb-2 text-xs" style={{ color: "var(--text-muted, #6b7280)" }}>
          Clique em um card acima para trocar o vencedor. Os eventos, documentos e participantes do lead fonte
          serao transferidos para o vencedor.
        </p>

        {/* Field picker */}
        <div className="px-6 pb-4 space-y-2">
          <p className="text-sm font-medium pt-2" style={{ color: "var(--text, #111)" }}>
            Escolha qual valor manter em cada campo:
          </p>
          {MERGE_FIELDS.map((field) => {
            const winnerVal = getFieldValue(winner, field);
            const sourceVal = getFieldValue(source, field);

            // Pula campos onde ambos estão vazios
            if (!winnerVal && !sourceVal) return null;

            return (
              <div key={field} className="grid grid-cols-3 gap-2 items-center">
                <span className="text-xs font-medium" style={{ color: "var(--text-muted, #6b7280)" }}>
                  {FIELD_LABELS[field]}
                </span>
                {/* Winner value */}
                <button
                  onClick={() => setChoice(field, "winner")}
                  className="text-left text-xs rounded-md px-3 py-1.5 border transition-colors truncate"
                  style={{
                    borderColor: choices[field] === "winner" ? "#16a34a" : "var(--border, #e5e7eb)",
                    background: choices[field] === "winner" ? "#f0fdf4" : "transparent",
                    color: choices[field] === "winner" ? "#15803d" : "var(--text, #111)",
                  }}
                  title={winnerVal || "(vazio)"}
                >
                  {winnerVal || <em style={{ color: "var(--text-muted, #6b7280)" }}>(vazio)</em>}
                </button>
                {/* Source value */}
                <button
                  onClick={() => setChoice(field, "source")}
                  className="text-left text-xs rounded-md px-3 py-1.5 border transition-colors truncate"
                  style={{
                    borderColor: choices[field] === "source" ? "#16a34a" : "var(--border, #e5e7eb)",
                    background: choices[field] === "source" ? "#f0fdf4" : "transparent",
                    color: choices[field] === "source" ? "#15803d" : "var(--text, #111)",
                  }}
                  title={sourceVal || "(vazio)"}
                >
                  {sourceVal || <em style={{ color: "var(--text-muted, #6b7280)" }}>(vazio)</em>}
                </button>
              </div>
            );
          })}
        </div>

        {error && (
          <div className="mx-6 mb-3 rounded-md px-3 py-2 text-sm" style={{ background: "#fef2f2", color: "#dc2626" }}>
            {error}
          </div>
        )}

        {/* Footer */}
        <div
          className="flex items-center justify-between gap-3 px-6 py-4 border-t"
          style={{ borderColor: "var(--border, #e5e7eb)" }}
        >
          <p className="text-xs" style={{ color: "var(--text-muted, #6b7280)" }}>
            <strong>{winner.nomeCorreto ?? winner.nome}</strong> sobrevive.{" "}
            <strong>{source.nomeCorreto ?? source.nome}</strong> sera arquivado.
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-sm font-medium border"
              style={{ borderColor: "var(--border, #e5e7eb)", color: "var(--text, #111)" }}
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: "#16a34a", color: "#fff" }}
            >
              {loading ? "Mesclando..." : "Confirmar mesclagem"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── LeadCard ─────────────────────────────────────────────────────────────────

function LeadCard({ lead }: { lead: LeadSummary }) {
  return (
    <div
      className="flex-1 rounded-lg p-4 text-sm space-y-1"
      style={{ background: "var(--card-bg-muted, #f9fafb)", border: "1px solid var(--border, #e5e7eb)" }}
    >
      <p className="font-semibold truncate" style={{ color: "var(--text, #111)" }}>
        {lead.nomeCorreto ?? lead.nome}
        {lead.numero && (
          <span className="ml-2 text-xs font-normal" style={{ color: "var(--text-muted, #6b7280)" }}>
            #{formatLeadNumber(lead.numero, 1)}
          </span>
        )}
      </p>
      {lead.telefone && (
        <p style={{ color: "var(--text-muted, #6b7280)" }}>{lead.telefone}</p>
      )}
      {lead.email && (
        <p className="truncate" style={{ color: "var(--text-muted, #6b7280)" }}>{lead.email}</p>
      )}
      {lead.cpf && (
        <p style={{ color: "var(--text-muted, #6b7280)" }}>CPF: {lead.cpf}</p>
      )}
      {lead.stage && (
        <p style={{ color: "var(--text-muted, #6b7280)" }}>Etapa: {lead.stage.nome}</p>
      )}
      {lead.assignedUser && (
        <p style={{ color: "var(--text-muted, #6b7280)" }}>Resp.: {lead.assignedUser.nome}</p>
      )}
      {lead.developmentUnits && lead.developmentUnits.length > 0 && (
        <div className="mt-1 pt-1 border-t" style={{ borderColor: "var(--border, #e5e7eb)" }}>
          {lead.developmentUnits.map((u) => (
            <p key={u.id} className="text-xs" style={{ color: "var(--text-muted, #6b7280)" }}>
              🏢 {u.developmentNome}{u.towerNome ? ` · ${u.towerNome}` : ""} · {u.nome}
              <span className="ml-1 px-1 rounded text-[10px] font-semibold"
                style={{ background: u.status === "VENDIDO" ? "#fef2f2" : u.status === "PROPOSTA" ? "#fff7ed" : "#f0fdf4", color: u.status === "VENDIDO" ? "#dc2626" : u.status === "PROPOSTA" ? "#ea580c" : "#16a34a" }}>
                {u.status}
              </span>
            </p>
          ))}
        </div>
      )}
      <p className="text-xs" style={{ color: "var(--text-muted, #6b7280)" }}>
        Criado em {new Date(lead.criadoEm).toLocaleDateString("pt-BR")}
      </p>
    </div>
  );
}

// ─── GroupRow ─────────────────────────────────────────────────────────────────

function GroupRow({
  group,
  onMerge,
  onDeleteLead,
  onIgnore,
}: {
  group: DuplicateGroup;
  onMerge: (group: DuplicateGroup) => void;
  onDeleteLead: (leadId: string, groupLeads: LeadSummary[]) => void;
  onIgnore: (group: DuplicateGroup) => void;
}) {
  const scoreLabel = group.tipo === "POSSIVEL"
    ? `${Math.round(group.score * 100)}% — ${group.motivo}`
    : group.motivo;
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(lead: LeadSummary) {
    if (!confirm(`Excluir "${lead.nomeCorreto ?? lead.nome}"?\n\nEsta ação é irreversível (soft-delete).`)) return;
    setDeletingId(lead.id);
    try {
      await apiFetch(`/leads/${lead.id}?reason=Duplicata+removida+manualmente`, { method: "DELETE" });
      onDeleteLead(lead.id, group.leads);
    } catch (e: any) {
      alert(e?.message ?? "Erro ao excluir lead");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div
      className="rounded-lg p-4"
      style={{ border: "1px solid var(--border, #e5e7eb)", background: "var(--card-bg, #fff)" }}
    >
      <div className="flex flex-wrap gap-3">
        {group.leads.map((lead) => (
          <div key={lead.id} className="flex-1 min-w-[220px] space-y-2">
            <LeadCard lead={lead} />
            <button
              disabled={deletingId === lead.id}
              onClick={() => handleDelete(lead)}
              className="w-full px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50"
              style={{ borderColor: "#fca5a5", color: "#dc2626", background: "transparent" }}
            >
              {deletingId === lead.id ? "Excluindo..." : "🗑 Excluir este lead"}
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs" style={{ color: "var(--text-muted, #6b7280)" }}>
          {scoreLabel}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onIgnore(group)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
            style={{ borderColor: "var(--border, #e5e7eb)", color: "var(--text-muted, #6b7280)" }}
          >
            Não são duplicatas
          </button>
          <button
            onClick={() => onMerge(group)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{ background: "var(--brand-accent, #2563eb)", color: "#fff" }}
          >
            ⚡ Mesclar os dois
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LS_KEY = "via_crm_ignored_duplicate_groups";

function groupKey(group: DuplicateGroup): string {
  return group.leads.map((l) => l.id).sort().join("|");
}

function loadIgnored(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveIgnored(set: Set<string>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify([...set]));
  } catch {}
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DuplicadosPage() {
  const [data, setData] = useState<DuplicatesResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [certaOpen, setCertaOpen] = useState(true);
  const [possivelOpen, setPossivelOpen] = useState(true);
  const [mergeGroup, setMergeGroup] = useState<DuplicateGroup | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [ignoredKeys, setIgnoredKeys] = useState<Set<string>>(new Set());
  const [manualMergeKey, setManualMergeKey] = useState(0);

  // Grupos em state local para poder remover após merge/delete/ignore
  const [grupos, setGrupos] = useState<DuplicateGroup[]>([]);

  useEffect(() => {
    setIgnoredKeys(loadIgnored());
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/leads/duplicates");
      setData(res);
      setGrupos(res.grupos);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar duplicatas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function handleMergeSuccess() {
    if (!mergeGroup) return;
    const isManual = mergeGroup.motivo === "Mesclagem manual";
    setGrupos((prev) => prev.filter((g) => g !== mergeGroup));
    setMergeGroup(null);
    if (isManual) setManualMergeKey((k) => k + 1);
    setToast("Mesclagem realizada com sucesso!");
    setTimeout(() => setToast(null), 3500);
  }

  function handleDeleteLead(leadId: string, groupLeads: LeadSummary[]) {
    setGrupos((prev) =>
      prev
        .map((g) => {
          const remaining = g.leads.filter((l) => l.id !== leadId);
          if (remaining.length < 2) return null;
          return { ...g, leads: remaining };
        })
        .filter(Boolean) as DuplicateGroup[]
    );
    setToast("Lead excluído com sucesso!");
    setTimeout(() => setToast(null), 3500);
  }

  function handleIgnore(group: DuplicateGroup) {
    const key = groupKey(group);
    const next = new Set(ignoredKeys);
    next.add(key);
    setIgnoredKeys(next);
    saveIgnored(next);
    setToast("Grupo descartado — não aparecerá mais.");
    setTimeout(() => setToast(null), 3500);
  }

  const visibleGrupos = grupos.filter((g) => !ignoredKeys.has(groupKey(g)));
  const certaGroups = visibleGrupos.filter((g) => g.tipo === "CERTA");
  const possivelGroups = visibleGrupos.filter((g) => g.tipo === "POSSIVEL");

  return (
    <AppShell title="Leads Duplicados">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "var(--text, #111)" }}>
              Leads Duplicados
            </h1>
            {data && (
              <p className="text-sm mt-1" style={{ color: "var(--text-muted, #6b7280)" }}>
                {certaGroups.length} duplicata(s) certa(s) &bull; {possivelGroups.length} possivel(is)
              </p>
            )}
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-medium border"
            style={{ borderColor: "var(--border, #e5e7eb)", color: "var(--text, #111)" }}
          >
            {loading ? "Verificando..." : "Verificar agora"}
          </button>
        </div>

        {/* Manual merge */}
        <ManualMergeSection key={manualMergeKey} onMerge={setMergeGroup} />

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-md px-4 py-3 text-sm" style={{ background: "#fef2f2", color: "#dc2626" }}>
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-12" style={{ color: "var(--text-muted, #6b7280)" }}>
            Analisando leads...
          </div>
        )}

        {/* Grupos CERTA */}
        {!loading && certaGroups.length > 0 && (
          <section className="mb-6">
            <button
              type="button"
              onClick={() => setCertaOpen((v) => !v)}
              className="flex items-center gap-2 mb-3 w-full text-left"
            >
              <span
                className="inline-block w-3 h-3 rounded-full"
                style={{ background: "#dc2626" }}
              />
              <span className="font-semibold text-base" style={{ color: "var(--text, #111)" }}>
                Duplicata certa ({certaGroups.length})
              </span>
              <span className="ml-auto text-xs" style={{ color: "var(--text-muted, #6b7280)" }}>
                {certaOpen ? "Ocultar" : "Mostrar"}
              </span>
            </button>
            {certaOpen && (
              <div className="space-y-3">
                {certaGroups.map((g, i) => (
                  <GroupRow key={i} group={g} onMerge={setMergeGroup} onDeleteLead={handleDeleteLead} onIgnore={handleIgnore} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Grupos POSSIVEL */}
        {!loading && possivelGroups.length > 0 && (
          <section className="mb-6">
            <button
              type="button"
              onClick={() => setPossivelOpen((v) => !v)}
              className="flex items-center gap-2 mb-3 w-full text-left"
            >
              <span
                className="inline-block w-3 h-3 rounded-full"
                style={{ background: "#ca8a04" }}
              />
              <span className="font-semibold text-base" style={{ color: "var(--text, #111)" }}>
                Possivel duplicata ({possivelGroups.length})
              </span>
              <span className="ml-auto text-xs" style={{ color: "var(--text-muted, #6b7280)" }}>
                {possivelOpen ? "Ocultar" : "Mostrar"}
              </span>
            </button>
            {possivelOpen && (
              <div className="space-y-3">
                {possivelGroups.map((g, i) => (
                  <GroupRow key={i} group={g} onMerge={setMergeGroup} onDeleteLead={handleDeleteLead} onIgnore={handleIgnore} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Empty state */}
        {!loading && !error && certaGroups.length === 0 && possivelGroups.length === 0 && (
          <div className="text-center py-16" style={{ color: "var(--text-muted, #6b7280)" }}>
            <p className="text-lg font-medium mb-1">Nenhuma duplicata encontrada!</p>
            <p className="text-sm">Sua base de leads esta limpa.</p>
          </div>
        )}
      </div>

      {/* Merge modal */}
      {mergeGroup && (
        <MergeModal
          group={mergeGroup}
          onClose={() => setMergeGroup(null)}
          onSuccess={handleMergeSuccess}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 rounded-lg px-4 py-3 text-sm font-medium shadow-lg"
          style={{ background: "#16a34a", color: "#fff" }}
        >
          {toast}
        </div>
      )}
    </AppShell>
  );
}
