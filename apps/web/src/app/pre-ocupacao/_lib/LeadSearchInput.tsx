"use client";

/**
 * Autocomplete de lead por nome/telefone/CPF/número — mesmo endpoint
 * (`GET /leads/search?q=`) e mesmo padrão visual do `LeadSearchInput` já
 * existente em `apps/web/src/app/leads/duplicados/page.tsx`. Não foi
 * exportado de lá (componente local, não exportado hoje, e evitar mexer
 * naquele arquivo enquanto outro fluxo de trabalho roda em paralelo) — a
 * lógica foi replicada aqui, simplificada para o caso de uso do Pré-Ocupação
 * (não precisa de excluded/campos de merge).
 */

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatLeadNumber } from "@/lib/format-lead-number";

export type LeadSearchResult = {
  id: string;
  nome: string;
  nomeCorreto: string | null;
  telefone: string | null;
  email: string | null;
  cpf: string | null;
  numero: number | null;
  stage: { nome: string } | null;
};

export function LeadSearchInput({
  label,
  placeholder = "Buscar por nome, telefone, CPF ou número...",
  value,
  onChange,
}: {
  label?: string;
  placeholder?: string;
  value: LeadSearchResult | null;
  onChange: (lead: LeadSearchResult | null) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<LeadSearchResult[]>([]);
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
        const data: LeadSearchResult[] = await apiFetch(`/leads/search?q=${encodeURIComponent(val.trim())}`);
        setResults(data);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }

  function select(lead: LeadSearchResult) {
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
    <div ref={containerRef} className="space-y-1.5">
      {label && (
        <p className="text-xs font-medium" style={{ color: "var(--shell-subtext)" }}>
          {label}
        </p>
      )}

      {value ? (
        <div
          className="rounded-lg p-3 relative"
          style={{ border: "2px solid #2563eb", background: "#eff6ff" }}
        >
          <button
            type="button"
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
        </div>
      ) : (
        <div className="relative">
          <input
            type="text"
            value={q}
            onChange={(e) => handleInput(e.target.value)}
            placeholder={placeholder}
            className="w-full h-10 rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)] outline-none"
          />
          {searching && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: "var(--shell-subtext)" }}>
              ...
            </span>
          )}
          {open && results.length > 0 && (
            <div
              className="absolute z-30 w-full mt-1 rounded-lg shadow-lg overflow-hidden"
              style={{ border: "1px solid var(--shell-card-border)", background: "var(--shell-card-bg)" }}
            >
              {results.map((lead) => (
                <button
                  key={lead.id}
                  type="button"
                  onClick={() => select(lead)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors"
                  style={{ borderBottom: "1px solid var(--shell-card-border)" }}
                >
                  <span className="font-medium truncate block" style={{ color: "var(--shell-text)" }}>
                    {lead.nomeCorreto ?? lead.nome}
                    {lead.numero && (
                      <span className="ml-2 text-xs font-normal" style={{ color: "var(--shell-subtext)" }}>
                        #{formatLeadNumber(lead.numero, 1)}
                      </span>
                    )}
                  </span>
                  <span className="text-xs" style={{ color: "var(--shell-subtext)" }}>
                    {[lead.telefone, lead.cpf, lead.stage?.nome].filter(Boolean).join(" · ")}
                  </span>
                </button>
              ))}
            </div>
          )}
          {open && !searching && results.length === 0 && q.trim().length >= 2 && (
            <div
              className="absolute z-30 w-full mt-1 rounded-lg px-3 py-2 text-sm shadow-lg"
              style={{ border: "1px solid var(--shell-card-border)", background: "var(--shell-card-bg)", color: "var(--shell-subtext)" }}
            >
              Nenhum lead encontrado.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
