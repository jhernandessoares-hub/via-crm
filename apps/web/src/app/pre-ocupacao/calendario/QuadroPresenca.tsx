"use client";

import { useEffect, useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { apiFetch } from "@/lib/api";
import { formatDate } from "../_lib/constants";
import { baixarCsv } from "../_lib/questionario";

type Situacao = "PRESENTE" | "FALTOU" | "REPOSICAO" | "SEM_LANCAMENTO";

type Quadro = {
  atividades: { id: string; titulo: string; dataAgendada: string }[];
  familias: {
    id: string;
    numero: number;
    nome: string;
    cpf: string | null;
    statusFamilia: string;
    presencas: Record<string, Situacao>;
  }[];
};

const VISUAL: Record<Situacao, { texto: string; cor: string }> = {
  PRESENTE: { texto: "Presente", cor: "#16a34a" },
  FALTOU: { texto: "Faltou", cor: "#dc2626" },
  REPOSICAO: { texto: "Reposição", cor: "#b45309" },
  SEM_LANCAMENTO: { texto: "Sem lançamento", cor: "var(--shell-subtext)" },
};

type Filtro = "" | "com_falta" | "presente_todas";

/** Famílias × atividades: quem compareceu em cada uma. */
export function QuadroPresenca() {
  const router = useRouter();
  const [quadro, setQuadro] = useState<Quadro | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("");

  useEffect(() => {
    apiFetch("/pre-ocupacao/atividades/quadro-presenca")
      .then(setQuadro)
      .catch((e) => setError(e instanceof Error ? e.message : "Erro ao carregar o quadro de presença"));
  }, []);

  if (error) return <p className="text-sm" style={{ color: "#dc2626" }}>{error}</p>;
  if (!quadro) return <p style={{ color: "var(--shell-subtext)" }}>Carregando...</p>;

  const termo = busca.trim().toLowerCase();
  const digitos = termo.replace(/\D/g, "");
  const linhas = quadro.familias.filter((f) => {
    const situacoes = Object.values(f.presencas);
    if (filtro === "com_falta" && !situacoes.includes("FALTOU")) return false;
    if (filtro === "presente_todas" && (situacoes.length === 0 || situacoes.some((s) => s === "FALTOU" || s === "SEM_LANCAMENTO"))) return false;
    if (!termo) return true;
    return (
      f.nome.toLowerCase().includes(termo) ||
      String(f.numero).includes(termo) ||
      (digitos.length >= 3 && (f.cpf ?? "").replace(/\D/g, "").includes(digitos))
    );
  });

  const total = (atividadeId: string, s: Situacao) => quadro.familias.filter((f) => f.presencas[atividadeId] === s).length;

  function baixar() {
    if (!quadro) return;
    baixarCsv(`quadro-presenca-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["Nº", "Família", "CPF", ...quadro.atividades.map((a) => `${formatDate(a.dataAgendada)} ${a.titulo}`), "Presenças", "Reposições", "Faltas"],
      ...linhas.map((f) => {
        const s = Object.values(f.presencas);
        return [
          String(f.numero).padStart(4, "0"),
          f.nome,
          f.cpf ?? "",
          ...quadro.atividades.map((a) => (f.presencas[a.id] ? VISUAL[f.presencas[a.id]].texto : "Não convocada")),
          String(s.filter((x) => x === "PRESENTE").length),
          String(s.filter((x) => x === "REPOSICAO").length),
          String(s.filter((x) => x === "FALTOU").length),
        ];
      }),
    ]);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, CPF ou número da família..."
          className="w-full max-w-md h-10 rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)] outline-none"
        />
        <select
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as Filtro)}
          className="h-10 rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)]"
        >
          <option value="">Todas as famílias</option>
          <option value="com_falta">Com falta sem reposição</option>
          <option value="presente_todas">Sem falta nas convocadas</option>
        </select>
        <button
          onClick={baixar}
          disabled={quadro.atividades.length === 0}
          className="px-4 h-10 rounded-lg text-sm font-medium border border-[var(--shell-card-border)] disabled:opacity-50"
          style={{ color: "var(--shell-text)" }}
        >
          Baixar planilha
        </button>
        <span className="text-xs" style={{ color: "var(--shell-subtext)" }}>
          {linhas.length} de {quadro.familias.length} famílias
        </span>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b align-top" style={{ borderColor: "var(--shell-card-border)" }}>
                <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--shell-subtext)" }}>Nº</th>
                <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--shell-subtext)" }}>Família</th>
                {quadro.atividades.map((a) => (
                  <th key={a.id} className="text-left px-4 py-3 font-medium min-w-[150px]" style={{ color: "var(--shell-text)" }}>
                    <button
                      className="text-left underline"
                      onClick={() => startTransition(() => router.push(`/pre-ocupacao/calendario/${a.id}`))}
                    >
                      {formatDate(a.dataAgendada)}
                    </button>
                    <span className="block text-xs font-normal" style={{ color: "var(--shell-subtext)" }}>{a.titulo}</span>
                    <span className="block text-xs font-normal mt-1">
                      <span style={{ color: VISUAL.PRESENTE.cor }}>{total(a.id, "PRESENTE")} presentes</span>
                      {" · "}
                      <span style={{ color: VISUAL.FALTOU.cor }}>{total(a.id, "FALTOU")} faltas</span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((f) => (
                <tr
                  key={f.id}
                  onClick={() => startTransition(() => router.push(`/pre-ocupacao/familias/${f.id}`))}
                  className="border-b cursor-pointer transition-colors hover:bg-[var(--shell-hover)]"
                  style={{ borderColor: "var(--shell-card-border)" }}
                >
                  <td className="px-4 py-2 font-semibold" style={{ color: "var(--shell-text)" }}>{String(f.numero).padStart(4, "0")}</td>
                  <td className="px-4 py-2" style={{ color: "var(--shell-text)" }}>{f.nome}</td>
                  {quadro.atividades.map((a) => {
                    const s = f.presencas[a.id];
                    return (
                      <td key={a.id} className="px-4 py-2 font-medium" style={{ color: s ? VISUAL[s].cor : "var(--shell-subtext)" }}>
                        {s ? VISUAL[s].texto : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {linhas.length === 0 && (
                <tr>
                  <td colSpan={2 + quadro.atividades.length} className="text-center py-8" style={{ color: "var(--shell-subtext)" }}>
                    Nenhuma família encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-xs" style={{ color: "var(--shell-subtext)" }}>“—” = família não convocada para a atividade.</p>
    </div>
  );
}
