"use client";

import { useEffect, useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { apiFetch } from "@/lib/api";
import { useSP9Guard } from "../_lib/useSP9Guard";
import { ENTREGAVEL_STATUS_LABEL, formatCompetencia, formatDateTime, competenciaAtual } from "../_lib/constants";

type Mensal = {
  id: string;
  competencia: string;
  status: "EM_ANDAMENTO" | "CONSOLIDADO" | "ENVIADO";
  enviadoEm: string | null;
  enviadoPor: string | null;
  criadoEm: string;
  atualizadoEm: string;
};

function statusVariant(status: string): "warning" | "info" | "success" | "default" {
  if (status === "EM_ANDAMENTO") return "warning";
  if (status === "CONSOLIDADO") return "info";
  if (status === "ENVIADO") return "success";
  return "default";
}

export default function EntregaveisPage() {
  const guard = useSP9Guard();
  const router = useRouter();

  const [items, setItems] = useState<Mensal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [competenciaBusca, setCompetenciaBusca] = useState(competenciaAtual());

  useEffect(() => {
    if (guard !== true) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guard]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/pre-ocupacao/entregaveis");
      setItems(res);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar entregáveis");
    } finally {
      setLoading(false);
    }
  }

  function abrirCompetencia(competencia: string) {
    if (!competencia) return;
    startTransition(() => router.push(`/pre-ocupacao/entregaveis/${competencia}`));
  }

  if (guard === null) return null;

  return (
    <AppShell title="Pré-Ocupação — Entregáveis Mensais">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "var(--shell-text)" }}>
              Entregáveis Mensais
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--shell-subtext)" }}>
              Pacote consolidado do Trabalho Técnico Social — listas de presença, fotos/vídeos, fichas e relatório por competência.
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--shell-card-border)]"
            style={{ color: "var(--shell-text)" }}
          >
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>

        {/* Seletor de competência — abre qualquer mês, mesmo sem registro gerado ainda */}
        <Card className="mb-6">
          <CardBody className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--shell-subtext)" }}>
                Consultar competência
              </label>
              <input
                type="month"
                value={competenciaBusca}
                onChange={(e) => setCompetenciaBusca(e.target.value)}
                className="h-10 rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)]"
              />
            </div>
            <button
              onClick={() => abrirCompetencia(competenciaBusca)}
              disabled={!competenciaBusca}
              className="h-10 px-4 rounded-lg text-sm font-medium"
              style={{ background: "var(--via-teal, #1D9E75)", color: "#fff" }}
            >
              Abrir
            </button>
            <p className="text-xs" style={{ color: "var(--shell-subtext)" }}>
              Funciona mesmo que ainda não exista um entregável gerado para o mês — mostra o que já foi capturado nas sessões.
            </p>
          </CardBody>
        </Card>

        {error && (
          <div className="mb-4 rounded-md px-4 py-3 text-sm" style={{ background: "#fef2f2", color: "#dc2626" }}>
            {error}
          </div>
        )}

        <div className="space-y-2">
          {loading && <p style={{ color: "var(--shell-subtext)" }}>Carregando...</p>}
          {!loading && items.length === 0 && (
            <Card>
              <CardBody className="text-center py-8">
                <p style={{ color: "var(--shell-subtext)" }}>
                  Nenhum entregável gerado ainda. Use o seletor acima para consultar uma competência.
                </p>
              </CardBody>
            </Card>
          )}
          {!loading && items.map((m) => (
            <Card
              key={m.id}
              className="cursor-pointer transition-colors hover:bg-[var(--shell-hover)]"
              onClick={() => abrirCompetencia(m.competencia)}
            >
              <CardBody className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium" style={{ color: "var(--shell-text)" }}>
                    {formatCompetencia(m.competencia)}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--shell-subtext)" }}>
                    {m.status === "ENVIADO"
                      ? `Enviado em ${formatDateTime(m.enviadoEm)}${m.enviadoPor ? ` por ${m.enviadoPor}` : ""}`
                      : `Última atualização em ${formatDateTime(m.atualizadoEm)}`}
                  </p>
                </div>
                <Badge variant={statusVariant(m.status)}>{ENTREGAVEL_STATUS_LABEL[m.status] ?? m.status}</Badge>
              </CardBody>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
