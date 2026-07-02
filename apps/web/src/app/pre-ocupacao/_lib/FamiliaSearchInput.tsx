"use client";

/**
 * Autocomplete restrito às famílias já ativadas no Pré-Ocupação — ao
 * contrário do `LeadSearchInput` (que busca qualquer lead de venda via
 * `GET /leads/search`), este componente busca em `GET /pre-ocupacao/familias`
 * (lista já ativada) e filtra localmente. Existe pra impedir que "Criar
 * demanda" ative implicitamente uma família nova a partir de um lead de
 * venda qualquer — só se cria demanda pra quem já está no programa.
 */

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

export type FamiliaSearchResult = {
  id: string;
  leadId: string;
  numero: number;
  nome: string;
  cpf: string | null;
};

export function FamiliaSearchInput({
  label,
  placeholder = "Buscar por nome, CPF ou número da família...",
  value,
  onChange,
}: {
  label?: string;
  placeholder?: string;
  value: FamiliaSearchResult | null;
  onChange: (familia: FamiliaSearchResult | null) => void;
}) {
  const [q, setQ] = useState("");
  const [familias, setFamilias] = useState<FamiliaSearchResult[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch("/pre-ocupacao/familias")
      .then((res) => setFamilias(res.items ?? []))
      .catch(() => setFamilias([]))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const results = q.trim().length >= 1
    ? familias
        .filter((f) => {
          const term = q.trim().toLowerCase();
          return (
            f.nome.toLowerCase().includes(term) ||
            (f.cpf ?? "").toLowerCase().includes(term) ||
            String(f.numero).includes(term)
          );
        })
        .slice(0, 8)
    : [];

  function handleInput(val: string) {
    setQ(val);
    setOpen(val.trim().length >= 1);
  }

  function select(familia: FamiliaSearchResult) {
    onChange(familia);
    setQ("");
    setOpen(false);
  }

  function clear() {
    onChange(null);
    setQ("");
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
            {value.nome}
            <span className="ml-2 text-xs font-normal" style={{ color: "#3b82f6" }}>
              família #{String(value.numero).padStart(4, "0")}
            </span>
          </p>
          {value.cpf && <p className="text-xs" style={{ color: "#3b82f6" }}>CPF: {value.cpf}</p>}
        </div>
      ) : (
        <div className="relative">
          <input
            type="text"
            value={q}
            onChange={(e) => handleInput(e.target.value)}
            placeholder={loaded ? placeholder : "Carregando famílias..."}
            disabled={!loaded}
            className="w-full h-10 rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)] outline-none disabled:opacity-60"
          />
          {open && results.length > 0 && (
            <div
              className="absolute z-30 w-full mt-1 rounded-lg shadow-lg overflow-hidden"
              style={{ border: "1px solid var(--shell-card-border)", background: "var(--shell-card-bg)" }}
            >
              {results.map((familia) => (
                <button
                  key={familia.id}
                  type="button"
                  onClick={() => select(familia)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors"
                  style={{ borderBottom: "1px solid var(--shell-card-border)" }}
                >
                  <span className="font-medium truncate block" style={{ color: "var(--shell-text)" }}>
                    {familia.nome}
                    <span className="ml-2 text-xs font-normal" style={{ color: "var(--shell-subtext)" }}>
                      família #{String(familia.numero).padStart(4, "0")}
                    </span>
                  </span>
                  {familia.cpf && (
                    <span className="text-xs" style={{ color: "var(--shell-subtext)" }}>
                      CPF: {familia.cpf}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          {open && loaded && results.length === 0 && q.trim().length >= 1 && (
            <div
              className="absolute z-30 w-full mt-1 rounded-lg px-3 py-2 text-sm shadow-lg"
              style={{ border: "1px solid var(--shell-card-border)", background: "var(--shell-card-bg)", color: "var(--shell-subtext)" }}
            >
              Nenhuma família do Pré-Ocupação encontrada.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
