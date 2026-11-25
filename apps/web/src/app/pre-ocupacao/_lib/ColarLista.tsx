"use client";

import { useState } from "react";
import { casarLista, FamiliaLista, ResultadoLista } from "./casar-lista";

/**
 * Cola a lista (convocados ou presença) e reconhece as famílias. Só entra o que é
 * certeza ou o que a pessoa confirmou; o que não foi achado fica à vista.
 */
export function ColarLista({
  familias,
  onAplicar,
  rotuloAplicar,
}: {
  familias: FamiliaLista[];
  onAplicar: (familiaIds: string[]) => void;
  rotuloAplicar: (total: number) => string;
}) {
  const [texto, setTexto] = useState("");
  const [resultado, setResultado] = useState<ResultadoLista | null>(null);
  // índice da linha a confirmar → família escolhida
  const [escolhas, setEscolhas] = useState<Record<number, string>>({});

  const porId = new Map(familias.map((f) => [f.familiaId, f]));
  const rotulo = (id: string) => {
    const f = porId.get(id);
    return f ? `${String(f.numero).padStart(4, "0")} ${f.nome}` : id;
  };

  function procurar() {
    setResultado(casarLista(texto, familias));
    setEscolhas({});
  }

  const ids = resultado
    ? [...new Set([...resultado.certas.map((c) => c.familiaId), ...Object.values(escolhas).filter(Boolean)])]
    : [];

  return (
    <div className="space-y-3 rounded-lg border p-3" style={{ borderColor: "var(--shell-card-border)" }}>
      <p className="text-xs" style={{ color: "var(--shell-subtext)" }}>
        Copie a lista do Excel ou do Word e cole aqui, uma família por linha. Vale nome, CPF ou os dois. Também reconhece o
        nome do cônjuge e de outras pessoas do cadastro.
      </p>
      <textarea
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setResultado(null);
        }}
        rows={5}
        placeholder={"Maria da Silva\nJoão Pereira\t123.456.789-09"}
        className="w-full rounded-lg border px-3 py-2 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)] outline-none"
      />
      <button
        type="button"
        onClick={procurar}
        disabled={!texto.trim()}
        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--shell-card-border)] disabled:opacity-50"
        style={{ color: "var(--shell-text)" }}
      >
        Encontrar famílias
      </button>

      {resultado && (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: "var(--shell-text)" }}>
            <b style={{ color: "#16a34a" }}>{resultado.certas.length}</b> reconhecidas ·{" "}
            <b style={{ color: "#b45309" }}>{resultado.confirmar.length}</b> para confirmar ·{" "}
            <b style={{ color: "#dc2626" }}>{resultado.naoAchadas.length}</b> não encontradas
            {resultado.repetidas > 0 && ` · ${resultado.repetidas} linha(s) de família já reconhecida`}
          </p>

          {resultado.confirmar.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-1" style={{ color: "#b45309" }}>Confirme quem é</p>
              <div className="max-h-48 overflow-y-auto space-y-2">
                {resultado.confirmar.map((c, i) => (
                  <div key={i} className="text-sm">
                    <p style={{ color: "var(--shell-text)" }}>{c.linha.replace(/\t+/g, " · ")}</p>
                    <select
                      value={escolhas[i] ?? ""}
                      onChange={(e) => setEscolhas((prev) => ({ ...prev, [i]: e.target.value }))}
                      className="mt-0.5 w-full h-8 rounded-md border px-2 text-xs bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)]"
                    >
                      <option value="">Nenhuma destas</option>
                      {c.candidatos.map((id) => (
                        <option key={id} value={id}>{rotulo(id)}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {resultado.naoAchadas.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-1" style={{ color: "#dc2626" }}>Não encontradas (marque na mão, se for o caso)</p>
              <div className="max-h-32 overflow-y-auto text-xs space-y-0.5" style={{ color: "var(--shell-text)" }}>
                {resultado.naoAchadas.map((l, i) => (
                  <p key={i}>{l.replace(/\t+/g, " · ")}</p>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => onAplicar(ids)}
            disabled={ids.length === 0}
            className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
            style={{ background: "var(--via-teal, #1D9E75)", color: "#fff" }}
          >
            {rotuloAplicar(ids.length)}
          </button>
        </div>
      )}
    </div>
  );
}
