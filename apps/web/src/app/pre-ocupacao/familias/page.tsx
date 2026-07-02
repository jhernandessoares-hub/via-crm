"use client";

import { useEffect, useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { apiFetch } from "@/lib/api";
import { useSP9Guard } from "../_lib/useSP9Guard";
import { formatDate } from "../_lib/constants";

type FamiliaItem = {
  id: string;
  numero: number;
  leadId: string;
  nome: string;
  cpf: string | null;
  statusFamilia: string;
  status: "EM_DIA" | "COM_PENDENCIA";
  faltas: number;
  ativadoEm: string;
  demandasTotal: number;
  demandasAbertas: number;
  demandasEncerradas: number;
};

type Dashboard = { total: number; emDia: number; comPendencia: number };

function csvEscape(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

function baixarRelatorio(items: FamiliaItem[]) {
  const header = ["Nº", "Família", "CPF", "Incluída em", "Demandas (total)", "Demandas abertas", "Demandas encerradas", "Status", "Faltas"];
  const rows = items.map((f) => [
    String(f.numero).padStart(4, "0"),
    f.nome,
    f.cpf || "",
    formatDate(f.ativadoEm),
    String(f.demandasTotal),
    String(f.demandasAbertas),
    String(f.demandasEncerradas),
    f.status === "EM_DIA" ? "Em dia" : "Com pendência",
    String(f.faltas),
  ]);
  const csv = [header, ...rows].map((r) => r.map((v) => csvEscape(String(v))).join(";")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `familias-pre-ocupacao-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function FamiliasPage() {
  const guard = useSP9Guard();
  const router = useRouter();

  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [items, setItems] = useState<FamiliaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "EM_DIA" | "COM_PENDENCIA">("");

  useEffect(() => {
    if (guard !== true) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guard]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/pre-ocupacao/familias");
      setDashboard(res.dashboard);
      setItems(res.items);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar famílias");
    } finally {
      setLoading(false);
    }
  }

  const filtered = items.filter((f) => {
    if (statusFilter && f.status !== statusFilter) return false;
    if (!q.trim()) return true;
    const term = q.trim().toLowerCase();
    return (
      f.nome.toLowerCase().includes(term) ||
      (f.cpf ?? "").toLowerCase().includes(term) ||
      String(f.numero).includes(term)
    );
  });

  if (guard === null) return null;

  return (
    <AppShell title="Pré-Ocupação — Famílias">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "var(--shell-text)" }}>
              Famílias
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--shell-subtext)" }}>
              Trabalho Técnico Social — acompanhamento das famílias no Pré-Ocupação.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => baixarRelatorio(filtered)}
              disabled={items.length === 0}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--shell-card-border)] disabled:opacity-50"
              style={{ color: "var(--shell-text)" }}
            >
              Baixar relatório
            </button>
            <button
              onClick={load}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--shell-card-border)]"
              style={{ color: "var(--shell-text)" }}
            >
              {loading ? "Atualizando..." : "Atualizar"}
            </button>
          </div>
        </div>

        {/* Dashboard cards — clicáveis, filtram a listagem */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Card
            className="cursor-pointer transition-colors hover:bg-[var(--shell-hover)]"
            onClick={() => setStatusFilter("")}
          >
            <CardBody style={statusFilter === "" ? { boxShadow: "inset 0 0 0 2px var(--via-teal, #1D9E75)" } : undefined}>
              <p className="text-xs font-medium" style={{ color: "var(--shell-subtext)" }}>
                Total no Pré-Ocupação
              </p>
              <p className="text-2xl font-bold mt-1" style={{ color: "var(--shell-text)" }}>
                {dashboard?.total ?? "—"}
              </p>
            </CardBody>
          </Card>
          <Card
            className="cursor-pointer transition-colors hover:bg-[var(--shell-hover)]"
            onClick={() => setStatusFilter((s) => (s === "EM_DIA" ? "" : "EM_DIA"))}
          >
            <CardBody style={statusFilter === "EM_DIA" ? { boxShadow: "inset 0 0 0 2px #16a34a" } : undefined}>
              <p className="text-xs font-medium" style={{ color: "var(--shell-subtext)" }}>
                Em dia
              </p>
              <p className="text-2xl font-bold mt-1" style={{ color: "#16a34a" }}>
                {dashboard?.emDia ?? "—"}
              </p>
            </CardBody>
          </Card>
          <Card
            className="cursor-pointer transition-colors hover:bg-[var(--shell-hover)]"
            onClick={() => setStatusFilter((s) => (s === "COM_PENDENCIA" ? "" : "COM_PENDENCIA"))}
          >
            <CardBody style={statusFilter === "COM_PENDENCIA" ? { boxShadow: "inset 0 0 0 2px #dc2626" } : undefined}>
              <p className="text-xs font-medium" style={{ color: "var(--shell-subtext)" }}>
                Com pendência
              </p>
              <p className="text-2xl font-bold mt-1" style={{ color: "#dc2626" }}>
                {dashboard?.comPendencia ?? "—"}
              </p>
            </CardBody>
          </Card>
        </div>

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome, CPF ou número da família..."
            className="w-full max-w-md h-10 rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)] outline-none"
          />
        </div>

        {error && (
          <div className="mb-4 rounded-md px-4 py-3 text-sm" style={{ background: "#fef2f2", color: "#dc2626" }}>
            {error}
          </div>
        )}

        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--shell-card-border)" }}>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--shell-subtext)" }}>Nº</th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--shell-subtext)" }}>Família</th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--shell-subtext)" }}>CPF</th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--shell-subtext)" }}>Empreendimento</th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--shell-subtext)" }}>Unidade</th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--shell-subtext)" }}>Incluída em</th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--shell-subtext)" }}>Demandas</th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--shell-subtext)" }}>Status</th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--shell-subtext)" }}>Faltas</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={9} className="text-center py-8" style={{ color: "var(--shell-subtext)" }}>
                      Carregando...
                    </td>
                  </tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center py-8" style={{ color: "var(--shell-subtext)" }}>
                      Nenhuma família encontrada.
                    </td>
                  </tr>
                )}
                {!loading && filtered.map((f) => (
                  <tr
                    key={f.id}
                    onClick={() => startTransition(() => router.push(`/pre-ocupacao/familias/${f.id}`))}
                    className="border-b cursor-pointer transition-colors hover:bg-[var(--shell-hover)]"
                    style={{ borderColor: "var(--shell-card-border)" }}
                  >
                    <td className="px-4 py-3" style={{ color: "var(--shell-text)" }}>
                      {String(f.numero).padStart(4, "0")}
                    </td>
                    <td className="px-4 py-3 font-medium" style={{ color: "var(--shell-text)" }}>
                      {f.nome}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--shell-subtext)" }}>
                      {f.cpf || "—"}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--shell-subtext)" }}>—</td>
                    <td className="px-4 py-3" style={{ color: "var(--shell-subtext)" }}>—</td>
                    <td className="px-4 py-3" style={{ color: "var(--shell-subtext)" }}>
                      {formatDate(f.ativadoEm)}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--shell-text)" }}>
                      {f.demandasTotal}
                      {f.demandasTotal > 0 && (
                        <span className="text-xs" style={{ color: "var(--shell-subtext)" }}>
                          {" "}({f.demandasAbertas} abertas, {f.demandasEncerradas} encerradas)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={f.status === "EM_DIA" ? "success" : "error"}>
                        {f.status === "EM_DIA" ? "Em dia" : "Com pendência"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--shell-text)" }}>
                      {f.faltas}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
