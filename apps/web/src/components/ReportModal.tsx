"use client";

import { useState, useEffect } from "react";
import { formatLeadNumber } from "@/lib/format-lead-number";

const FIELD_GROUPS = [
  {
    label: "Identificação",
    fields: [
      { key: "numero", label: "Número" },
      { key: "nome", label: "Nome" },
      { key: "cpf", label: "CPF" },
      { key: "rg", label: "RG" },
      { key: "profissao", label: "Profissão" },
      { key: "naturalidade", label: "Naturalidade" },
    ],
  },
  {
    label: "Contato",
    fields: [
      { key: "telefone", label: "Telefone" },
      { key: "whatsapp", label: "WhatsApp" },
      { key: "email", label: "Email" },
    ],
  },
  {
    label: "Endereço",
    fields: [
      { key: "endereco", label: "Endereço" },
      { key: "cep", label: "CEP" },
      { key: "cidade", label: "Cidade" },
      { key: "uf", label: "UF" },
    ],
  },
  {
    label: "Lead",
    fields: [
      { key: "origem", label: "Origem" },
      { key: "etapa", label: "Etapa" },
      { key: "status", label: "Status" },
      { key: "perfilImovel", label: "Interesse / Produto" },
      { key: "rendaBrutaFamiliar", label: "Renda Bruta" },
      { key: "criadoEm", label: "Data de Criação" },
    ],
  },
  {
    label: "Informações Adicionais",
    fields: [
      { key: "codigoOcorrencia", label: "Código de Ocorrência" },
      { key: "grupoMcmv", label: "Grupo Social" },
      { key: "faixaRenda", label: "Faixa de Renda" },
      { key: "indicacao", label: "Indicação" },
    ],
  },
  {
    label: "Empreendimento / Unidade",
    fields: [
      { key: "unidadeEmpreendimento", label: "Empreendimento" },
      { key: "unidadeNome", label: "Unidade" },
      { key: "unidadeStatus", label: "Status da Unidade" },
      { key: "unidadeValor", label: "Valor Final" },
    ],
  },
];

const ALL_FIELDS = FIELD_GROUPS.flatMap((g) => g.fields);

const DEFAULT_FIELDS = [
  "numero", "nome", "telefone", "origem", "etapa", "status", "perfilImovel", "rendaBrutaFamiliar",
];

interface ReportTemplate {
  id: string;
  name: string;
  fields: string[];
}

const BUILTIN: ReportTemplate = { id: "default", name: "Padrão", fields: DEFAULT_FIELDS };
const LS_TEMPLATES = "lead_report_templates";
const LS_LAST = "lead_report_last_fields";

function loadTemplates(): ReportTemplate[] {
  try { return JSON.parse(localStorage.getItem(LS_TEMPLATES) || "[]"); } catch { return []; }
}

function getValue(lead: any, key: string, stages?: { id: string; name: string }[]): string {
  switch (key) {
    case "numero":
      return formatLeadNumber(lead.numero, lead.reentradaCount ?? 1) ?? "";
    case "nome":
      return lead.nomeCorreto || lead.nome || "";
    case "etapa": {
      const name = lead.stageName || stages?.find((s) => s.id === lead.stageId)?.name;
      return name || "";
    }
    case "rendaBrutaFamiliar":
      return lead.rendaBrutaFamiliar != null
        ? `R$ ${Number(lead.rendaBrutaFamiliar).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
        : "";
    case "criadoEm":
      return lead.criadoEm ? new Date(lead.criadoEm).toLocaleDateString("pt-BR") : "";
    case "codigoOcorrencia":
      return (lead.cadastroOrigem as any)?.codigoOcorrencia || "";
    case "grupoMcmv":
      return (lead.cadastroOrigem as any)?.grupoMcmv || "";
    case "faixaRenda":
      return (lead.cadastroOrigem as any)?.faixaRenda || "";
    case "indicacao":
      return (lead.cadastroOrigem as any)?.indicacao || "";
    case "unidadeEmpreendimento": {
      const units: any[] = lead.developmentUnits || [];
      return units.map((u: any) => u.development?.nome).filter(Boolean).join("; ");
    }
    case "unidadeNome": {
      const units: any[] = lead.developmentUnits || [];
      return units.map((u: any) => [u.tower?.nome, u.nome].filter(Boolean).join(" · ")).join("; ");
    }
    case "unidadeStatus": {
      const STATUS: Record<string, string> = {
        DISPONIVEL: "Disponível", PROPOSTA: "Proposta",
        RESERVADO: "Reservado", VENDIDO: "Vendido", BLOQUEADO: "Bloqueado",
      };
      const units: any[] = lead.developmentUnits || [];
      return units.map((u: any) => STATUS[u.status] || u.status).join("; ");
    }
    case "unidadeValor": {
      const units: any[] = lead.developmentUnits || [];
      return units
        .filter((u: any) => u.finalPrice)
        .map((u: any) => `R$ ${Number(u.finalPrice).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`)
        .join("; ");
    }
    default:
      return lead[key] || "";
  }
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  leads: any[];
  stages?: { id: string; name: string }[];
}

export function ReportModal({ isOpen, onClose, leads, stages }: Props) {
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [selectedId, setSelectedId] = useState("default");
  const [fields, setFields] = useState<string[]>(DEFAULT_FIELDS);
  const [saveInput, setSaveInput] = useState("");
  const [showSave, setShowSave] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const saved = loadTemplates();
    setTemplates(saved);
    try {
      const last = JSON.parse(localStorage.getItem(LS_LAST) || "null");
      if (Array.isArray(last) && last.length > 0) {
        setFields(last);
        setSelectedId("custom");
      } else {
        setFields([...DEFAULT_FIELDS]);
        setSelectedId("default");
      }
    } catch {
      setFields([...DEFAULT_FIELDS]);
      setSelectedId("default");
    }
    setShowSave(false);
    setSaveInput("");
  }, [isOpen]);

  const allTemplates = [BUILTIN, ...templates];

  function loadTemplate(id: string) {
    setSelectedId(id);
    if (id === "default") { setFields([...DEFAULT_FIELDS]); return; }
    const t = templates.find((t) => t.id === id);
    if (t) setFields([...t.fields]);
  }

  function toggleField(key: string) {
    setFields((prev) => {
      const next = prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key];
      setSelectedId("custom");
      return next;
    });
  }

  function toggleGroup(keys: string[], checked: boolean) {
    setFields((prev) => {
      const next = checked
        ? Array.from(new Set([...prev, ...keys]))
        : prev.filter((f) => !keys.includes(f));
      setSelectedId("custom");
      return next;
    });
  }

  function saveTemplate() {
    if (!saveInput.trim()) return;
    const newT: ReportTemplate = { id: crypto.randomUUID(), name: saveInput.trim(), fields: [...fields] };
    const updated = [...templates, newT];
    setTemplates(updated);
    localStorage.setItem(LS_TEMPLATES, JSON.stringify(updated));
    setSelectedId(newT.id);
    setSaveInput("");
    setShowSave(false);
  }

  function deleteTemplate(id: string) {
    const updated = templates.filter((t) => t.id !== id);
    setTemplates(updated);
    localStorage.setItem(LS_TEMPLATES, JSON.stringify(updated));
    if (selectedId === id) { setSelectedId("default"); setFields([...DEFAULT_FIELDS]); }
  }

  function buildRows() {
    const selected = ALL_FIELDS.filter((f) => fields.includes(f.key));
    return { selected, rows: leads.map((l) => selected.map((f) => getValue(l, f.key, stages))) };
  }

  function exportCSV() {
    localStorage.setItem(LS_LAST, JSON.stringify(fields));
    const { selected, rows } = buildRows();
    const header = selected.map((f) => f.label).join(";");
    const body = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + header + "\n" + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onClose();
  }

  function exportPDF() {
    localStorage.setItem(LS_LAST, JSON.stringify(fields));
    const { selected, rows } = buildRows();
    const date = new Date().toLocaleDateString("pt-BR");
    const ths = selected.map((f) => `<th>${f.label}</th>`).join("");
    const trs = rows.map((r) => `<tr>${r.map((v) => `<td>${v}</td>`).join("")}</tr>`).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório de Leads</title>
<style>
  body{font-family:Arial,sans-serif;font-size:10px;margin:20px}
  h1{font-size:13px;margin-bottom:4px}
  p{font-size:10px;color:#666;margin-bottom:10px}
  table{border-collapse:collapse;width:100%}
  th,td{border:1px solid #ccc;padding:3px 6px;text-align:left}
  th{background:#f0f0f0;font-weight:bold}
  tr:nth-child(even){background:#fafafa}
  @media print{button{display:none}}
</style></head>
<body>
<h1>Relatório de Leads</h1>
<p>Gerado em ${date} &mdash; ${leads.length} registro${leads.length !== 1 ? "s" : ""}</p>
<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 500);
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
    >
      <div
        className="relative flex w-full max-w-2xl flex-col rounded-xl border shadow-xl"
        style={{
          background: "var(--shell-bg)",
          borderColor: "var(--shell-card-border)",
          maxHeight: "90vh",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: "var(--shell-card-border)" }}
        >
          <h2 className="text-base font-semibold text-[var(--shell-text)]">Configurar Relatório</h2>
          <button
            onClick={onClose}
            className="text-xl leading-none text-[var(--shell-subtext)] hover:text-[var(--shell-text)]"
          >
            ×
          </button>
        </div>

        {/* Template bar */}
        <div
          className="flex flex-wrap items-center gap-2 border-b px-5 py-3"
          style={{ borderColor: "var(--shell-card-border)" }}
        >
          <span className="text-xs text-[var(--shell-subtext)]">Modelo:</span>
          <select
            value={selectedId}
            onChange={(e) => loadTemplate(e.target.value)}
            className="rounded border px-2 py-1 text-sm"
            style={{
              borderColor: "var(--shell-card-border)",
              background: "var(--shell-bg)",
              color: "var(--shell-text)",
            }}
          >
            {selectedId === "custom" && <option value="custom">Personalizado</option>}
            {allTemplates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>

          {selectedId !== "default" && selectedId !== "custom" && (
            <button
              onClick={() => deleteTemplate(selectedId)}
              className="text-xs text-red-500 hover:underline"
            >
              Excluir
            </button>
          )}

          {!showSave ? (
            <button
              onClick={() => setShowSave(true)}
              className="rounded border px-3 py-1 text-xs transition-colors hover:bg-[var(--shell-hover)]"
              style={{ borderColor: "var(--shell-card-border)", color: "var(--shell-text)" }}
            >
              Salvar modelo
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={saveInput}
                onChange={(e) => setSaveInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveTemplate();
                  if (e.key === "Escape") setShowSave(false);
                }}
                placeholder="Nome do modelo..."
                className="w-36 rounded border px-2 py-1 text-sm"
                style={{
                  borderColor: "var(--shell-card-border)",
                  background: "var(--shell-bg)",
                  color: "var(--shell-text)",
                }}
              />
              <button
                onClick={saveTemplate}
                className="text-xs text-[var(--brand-accent)] hover:underline"
              >
                Salvar
              </button>
              <button
                onClick={() => setShowSave(false)}
                className="text-xs text-[var(--shell-subtext)] hover:underline"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>

        {/* Fields */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-6">
            {FIELD_GROUPS.map((group) => {
              const groupKeys = group.fields.map((f) => f.key);
              const allChecked = groupKeys.every((k) => fields.includes(k));
              const someChecked = groupKeys.some((k) => fields.includes(k));
              return (
                <div key={group.label}>
                  <label className="mb-2 flex cursor-pointer items-center gap-2 select-none">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                      onChange={(e) => toggleGroup(groupKeys, e.target.checked)}
                    />
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--shell-subtext)]">
                      {group.label}
                    </span>
                  </label>
                  <div className="ml-1 space-y-1.5">
                    {group.fields.map((f) => (
                      <label key={f.key} className="flex cursor-pointer items-center gap-2 select-none">
                        <input
                          type="checkbox"
                          checked={fields.includes(f.key)}
                          onChange={() => toggleField(f.key)}
                        />
                        <span className="text-sm text-[var(--shell-text)]">{f.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between border-t px-5 py-4"
          style={{ borderColor: "var(--shell-card-border)" }}
        >
          <span className="text-xs text-[var(--shell-subtext)]">
            {leads.length} lead{leads.length !== 1 ? "s" : ""} · {fields.length} coluna{fields.length !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCSV}
              disabled={fields.length === 0}
              className="rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors hover:bg-[var(--shell-hover)] disabled:opacity-50"
              style={{ borderColor: "var(--shell-card-border)", color: "var(--shell-text)" }}
            >
              ↓ Excel
            </button>
            <button
              onClick={exportPDF}
              disabled={fields.length === 0}
              className="rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors hover:bg-[var(--shell-hover)] disabled:opacity-50"
              style={{ borderColor: "var(--shell-card-border)", color: "var(--shell-text)" }}
            >
              ↓ PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
