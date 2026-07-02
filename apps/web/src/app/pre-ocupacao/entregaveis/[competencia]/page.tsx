"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/lib/api";
import { useSP9Guard } from "../../_lib/useSP9Guard";
import { ENTREGAVEL_STATUS_LABEL, formatCompetencia, formatDateTime } from "../../_lib/constants";

type Agregado = {
  competencia: string;
  totalSessoes: number;
  listasPresenca: any[];
  fotosVideos: any[];
  fichasIndividuais: any[];
  relatorioConsolidado: string;
};

type Versao = {
  id: string;
  competencia: string;
  versao: number;
  arquivoUrl: string;
  publicId: string;
  nomeArquivo: string;
  geradoEm: string;
  geradoPor: string;
};

type Mensal = {
  id: string;
  competencia: string;
  status: "EM_ANDAMENTO" | "CONSOLIDADO" | "ENVIADO";
  enviadoEm: string | null;
  enviadoPor: string | null;
  enviadoVersaoId: string | null;
  criadoEm: string;
  atualizadoEm: string;
};

const STATUS_OPTIONS: Mensal["status"][] = ["EM_ANDAMENTO", "CONSOLIDADO", "ENVIADO"];

function statusVariant(status: string): "warning" | "info" | "success" | "default" {
  if (status === "EM_ANDAMENTO") return "warning";
  if (status === "CONSOLIDADO") return "info";
  if (status === "ENVIADO") return "success";
  return "default";
}

export default function EntregavelDetalhePage() {
  const guard = useSP9Guard();
  const params = useParams();
  const competencia = params?.competencia as string;

  const [agregado, setAgregado] = useState<Agregado | null>(null);
  const [versoes, setVersoes] = useState<Versao[]>([]);
  const [mensal, setMensal] = useState<Mensal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [gerarOpen, setGerarOpen] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [agr, vers, lista] = await Promise.all([
        apiFetch(`/pre-ocupacao/entregaveis/${competencia}`),
        apiFetch(`/pre-ocupacao/entregaveis/${competencia}/versoes`),
        apiFetch("/pre-ocupacao/entregaveis"),
      ]);
      setAgregado(agr);
      setVersoes(vers);
      setMensal((lista as Mensal[]).find((m) => m.competencia === competencia) ?? null);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar entregável");
    } finally {
      setLoading(false);
    }
  }, [competencia]);

  useEffect(() => {
    if (guard !== true || !competencia) return;
    load();
  }, [guard, competencia, load]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function executarGerar() {
    setGerando(true);
    try {
      await apiFetch(`/pre-ocupacao/entregaveis/${competencia}/gerar`, { method: "POST" });
      setGerarOpen(false);
      showToast("Nova versão gerada com sucesso.");
      await load();
    } catch (e: any) {
      showToast(e?.message ?? "Erro ao gerar versão");
    } finally {
      setGerando(false);
    }
  }

  function handleGerarClick() {
    if (versoes.length > 0) {
      setGerarOpen(true);
    } else {
      executarGerar();
    }
  }

  async function handleAlterarStatus(novoStatus: Mensal["status"]) {
    if (mensal?.status === novoStatus) return;
    setStatusBusy(true);
    try {
      const body: any = { status: novoStatus };
      if (novoStatus === "ENVIADO" && versoes[0]) body.enviadoVersaoId = versoes[0].id;
      await apiFetch(`/pre-ocupacao/entregaveis/${competencia}/status`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      showToast("Status atualizado.");
      await load();
    } catch (e: any) {
      showToast(e?.message ?? "Erro ao atualizar status");
    } finally {
      setStatusBusy(false);
    }
  }

  if (guard === null) return null;

  const statusAtual = mensal?.status ?? "EM_ANDAMENTO";
  const proximaVersao = (versoes[0]?.versao ?? 0) + 1;

  return (
    <AppShell title="Pré-Ocupação — Entregável Mensal">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/pre-ocupacao/entregaveis" className="text-sm mb-4 inline-block" style={{ color: "var(--shell-subtext)" }}>
          ← Voltar para Entregáveis Mensais
        </Link>

        {loading && <p style={{ color: "var(--shell-subtext)" }}>Carregando...</p>}
        {error && (
          <div className="mb-4 rounded-md px-4 py-3 text-sm" style={{ background: "#fef2f2", color: "#dc2626" }}>
            {error}
          </div>
        )}

        {!loading && agregado && (
          <>
            <Card className="mb-4">
              <CardBody className="flex items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-bold" style={{ color: "var(--shell-text)" }}>
                    {formatCompetencia(competencia)}
                  </h1>
                  <p className="text-sm mt-1" style={{ color: "var(--shell-subtext)" }}>
                    {agregado.totalSessoes} sessão(ões) do período{mensal ? ` · atualizado em ${formatDateTime(mensal.atualizadoEm)}` : ""}
                  </p>
                </div>
                <Badge variant={statusVariant(statusAtual)}>{ENTREGAVEL_STATUS_LABEL[statusAtual] ?? statusAtual}</Badge>
              </CardBody>
            </Card>

            {/* Resumo agregado */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <Card>
                <CardBody>
                  <p className="text-xs font-medium" style={{ color: "var(--shell-subtext)" }}>Listas de presença</p>
                  <p className="text-2xl font-bold mt-1" style={{ color: "var(--shell-text)" }}>{agregado.listasPresenca.length}</p>
                </CardBody>
              </Card>
              <Card>
                <CardBody>
                  <p className="text-xs font-medium" style={{ color: "var(--shell-subtext)" }}>Fotos/Vídeos</p>
                  <p className="text-2xl font-bold mt-1" style={{ color: "var(--shell-text)" }}>{agregado.fotosVideos.length}</p>
                </CardBody>
              </Card>
              <Card>
                <CardBody>
                  <p className="text-xs font-medium" style={{ color: "var(--shell-subtext)" }}>Fichas individuais</p>
                  <p className="text-2xl font-bold mt-1" style={{ color: "var(--shell-text)" }}>{agregado.fichasIndividuais.length}</p>
                </CardBody>
              </Card>
            </div>

            <Card className="mb-4">
              <CardHeader>
                <CardTitle>Relatório consolidado</CardTitle>
              </CardHeader>
              <CardBody>
                {agregado.relatorioConsolidado ? (
                  <textarea
                    readOnly
                    value={agregado.relatorioConsolidado}
                    rows={10}
                    className="w-full rounded-lg border px-3 py-2 text-sm resize-y bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)]"
                  />
                ) : (
                  <p className="text-sm" style={{ color: "var(--shell-subtext)" }}>
                    Nenhum relatório de sessão registrado nesta competência ainda.
                  </p>
                )}
              </CardBody>
            </Card>

            <Card className="mb-4">
              <CardHeader>
                <CardTitle>Status do entregável</CardTitle>
              </CardHeader>
              <CardBody className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleAlterarStatus(s)}
                    disabled={statusBusy || statusAtual === s}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
                    style={
                      statusAtual === s
                        ? { background: "var(--via-teal, #1D9E75)", borderColor: "var(--via-teal, #1D9E75)", color: "#fff" }
                        : { borderColor: "var(--shell-card-border)", color: "var(--shell-text)" }
                    }
                  >
                    {ENTREGAVEL_STATUS_LABEL[s]}
                  </button>
                ))}
              </CardBody>
            </Card>

            <Card>
              <CardHeader className="flex items-center justify-between">
                <CardTitle>Versões geradas</CardTitle>
                <button
                  onClick={handleGerarClick}
                  disabled={gerando}
                  className="px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: "var(--via-teal, #1D9E75)", color: "#fff" }}
                >
                  {gerando ? "Gerando..." : "Gerar"}
                </button>
              </CardHeader>
              <CardBody className="space-y-2">
                <div
                  className="rounded-md px-3 py-2 text-xs"
                  style={{ background: "#fffbeb", color: "#92400e" }}
                >
                  O arquivo compactado (ZIP) desta versão ainda está em preparação — a geração automática do pacote
                  não foi implementada nesta fase. O resumo acima já reflete tudo o que foi capturado nas sessões.
                </div>
                {versoes.length === 0 && (
                  <p className="text-sm" style={{ color: "var(--shell-subtext)" }}>Nenhuma versão gerada ainda.</p>
                )}
                {versoes.map((v, idx) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                    style={{ borderColor: "var(--shell-card-border)" }}
                  >
                    <div>
                      <p className="text-sm font-medium" style={{ color: "var(--shell-text)" }}>
                        v{v.versao} — {v.nomeArquivo}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--shell-subtext)" }}>
                        Gerado em {formatDateTime(v.geradoEm)} por {v.geradoPor}
                      </p>
                    </div>
                    {idx === 0 && <Badge variant="teal">Oficial</Badge>}
                  </div>
                ))}
              </CardBody>
            </Card>
          </>
        )}
      </div>

      {gerarOpen && (
        <Modal
          open
          onClose={() => setGerarOpen(false)}
          title="Gerar nova versão"
          description={`Isso vai gerar a v${proximaVersao}, que substitui a v${proximaVersao - 1} como oficial. Tem certeza?`}
          footer={
            <>
              <button
                onClick={() => setGerarOpen(false)}
                disabled={gerando}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--shell-card-border)]"
                style={{ color: "var(--shell-text)" }}
              >
                Cancelar
              </button>
              <button
                onClick={executarGerar}
                disabled={gerando}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: "var(--via-teal, #1D9E75)", color: "#fff" }}
              >
                {gerando ? "Gerando..." : "Confirmar geração"}
              </button>
            </>
          }
        >
          <p className="text-sm" style={{ color: "var(--shell-text)" }}>
            As versões anteriores não são apagadas — ficam disponíveis no histórico abaixo.
          </p>
        </Modal>
      )}

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
