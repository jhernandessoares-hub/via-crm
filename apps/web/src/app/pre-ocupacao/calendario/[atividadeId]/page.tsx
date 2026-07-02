"use client";

import { useEffect, useState, startTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/lib/api";
import { useSP9Guard } from "../../_lib/useSP9Guard";
import { FileUploadButton } from "../../_lib/FileUploadButton";
import {
  CATEGORIA_LABEL,
  AVALIACAO_LABEL,
  AVALIACAO_OPTIONS,
  PARTICIPANTE_STATUS_LABEL,
  ANEXO_TIPO_LABEL,
  formatDateTime,
} from "../../_lib/constants";

type Anexo = { id: string; tipo: string; url: string; nome: string; legenda: string | null };

type Participante = {
  id: string;
  familiaId: string;
  status: string;
  preenchidoEm: string | null;
  avaliacao: string | null;
  marcadoFaltaPor: string | null;
  familia: { id: string; leadId: string; numero: number; lead: { id: string; nome: string; nomeCorreto: string | null } };
  anexos: { id: string; url: string; nome: string }[];
};

type Atividade = {
  id: string;
  categoria: string;
  dataAgendada: string;
  local: string | null;
  titulo: string | null;
  relatorio: string | null;
  prazoPreenchimentoDias: number;
  anexos: Anexo[];
  participantes: Participante[];
};

export default function AtividadeDetalhePage() {
  const guard = useSP9Guard();
  const params = useParams();
  const atividadeId = params?.atividadeId as string;

  const [data, setData] = useState<Atividade | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [relatorio, setRelatorio] = useState("");
  const [savingRelatorio, setSavingRelatorio] = useState(false);

  const [anexoTipo, setAnexoTipo] = useState("FOTO");

  const [fichaModal, setFichaModal] = useState<Participante | null>(null);

  useEffect(() => {
    if (guard !== true || !atividadeId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guard, atividadeId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/pre-ocupacao/atividades/${atividadeId}`);
      setData(res);
      setRelatorio(res.relatorio ?? "");
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar sessão");
    } finally {
      setLoading(false);
    }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function handleSaveRelatorio() {
    setSavingRelatorio(true);
    try {
      await apiFetch(`/pre-ocupacao/atividades/${atividadeId}`, {
        method: "PATCH",
        body: JSON.stringify({ relatorio: relatorio.trim() || null }),
      });
      showToast("Relatório salvo.");
      await load();
    } catch (e: any) {
      showToast(e?.message ?? "Erro ao salvar relatório");
    } finally {
      setSavingRelatorio(false);
    }
  }

  async function handleUploadEvidencia(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("tipo", anexoTipo);
    try {
      await apiFetch(`/pre-ocupacao/atividades/${atividadeId}/anexos`, { method: "POST", body: fd });
      showToast("Evidência enviada com sucesso.");
      await load();
    } catch (e: any) {
      showToast(e?.message ?? "Erro ao enviar evidência");
    }
  }

  async function handleMarcarFalta(familiaId: string) {
    try {
      await apiFetch(`/pre-ocupacao/atividades/${atividadeId}/participantes/${familiaId}/falta`, {
        method: "PATCH",
      });
      showToast("Falta registrada.");
      await load();
    } catch (e: any) {
      showToast(e?.message ?? "Erro ao registrar falta");
    }
  }

  if (guard === null) return null;

  return (
    <AppShell title="Pré-Ocupação — Sessão">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/pre-ocupacao/calendario" className="text-sm mb-4 inline-block" style={{ color: "var(--shell-subtext)" }}>
          ← Voltar para Calendário
        </Link>

        {loading && <p style={{ color: "var(--shell-subtext)" }}>Carregando...</p>}
        {error && (
          <div className="mb-4 rounded-md px-4 py-3 text-sm" style={{ background: "#fef2f2", color: "#dc2626" }}>
            {error}
          </div>
        )}

        {data && (
          <>
            <Card className="mb-4">
              <CardBody>
                <h1 className="text-xl font-bold" style={{ color: "var(--shell-text)" }}>
                  {CATEGORIA_LABEL[data.categoria] ?? data.categoria}
                  {data.titulo ? ` — ${data.titulo}` : ""}
                </h1>
                <p className="text-sm mt-1" style={{ color: "var(--shell-subtext)" }}>
                  {formatDateTime(data.dataAgendada)}
                  {data.local ? ` · ${data.local}` : ""}
                  {` · Prazo de preenchimento: ${data.prazoPreenchimentoDias} dia(s)`}
                </p>
              </CardBody>
            </Card>

            <Card className="mb-4">
              <CardHeader>
                <CardTitle>Relatório da sessão</CardTitle>
              </CardHeader>
              <CardBody className="space-y-2">
                <textarea
                  value={relatorio}
                  onChange={(e) => setRelatorio(e.target.value)}
                  rows={4}
                  placeholder="Anotações gerais sobre a sessão..."
                  className="w-full rounded-lg border px-3 py-2 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)]"
                />
                <div className="flex justify-end">
                  <button
                    onClick={handleSaveRelatorio}
                    disabled={savingRelatorio}
                    className="px-4 py-2 rounded-lg text-sm font-medium"
                    style={{ background: "var(--via-teal, #1D9E75)", color: "#fff" }}
                  >
                    {savingRelatorio ? "Salvando..." : "Salvar relatório"}
                  </button>
                </div>
              </CardBody>
            </Card>

            <Card className="mb-4">
              <CardHeader>
                <CardTitle>Evidências gerais</CardTitle>
              </CardHeader>
              <CardBody className="space-y-3">
                <div className="flex items-center gap-2">
                  <select
                    value={anexoTipo}
                    onChange={(e) => setAnexoTipo(e.target.value)}
                    className="h-9 rounded-lg border px-2 text-xs bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)]"
                  >
                    {Object.entries(ANEXO_TIPO_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  <FileUploadButton label="Enviar evidência" onSelect={handleUploadEvidencia} />
                </div>
                {data.anexos.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--shell-subtext)" }}>Nenhuma evidência enviada ainda.</p>
                ) : (
                  <ul className="space-y-1">
                    {data.anexos.map((a) => (
                      <li key={a.id} className="text-sm flex items-center gap-2">
                        <Badge variant="default">{ANEXO_TIPO_LABEL[a.tipo] ?? a.tipo}</Badge>
                        <a href={a.url} target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--via-teal, #1D9E75)" }}>
                          {a.nome}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Famílias participantes ({data.participantes.length})</CardTitle>
              </CardHeader>
              <CardBody className="space-y-2">
                {data.participantes.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                    style={{ borderColor: "var(--shell-card-border)" }}
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate" style={{ color: "var(--shell-text)" }}>
                        {p.familia.lead.nomeCorreto ?? p.familia.lead.nome}
                        <span className="ml-2 text-xs font-normal" style={{ color: "var(--shell-subtext)" }}>
                          #{String(p.familia.numero).padStart(4, "0")}
                        </span>
                      </p>
                      {p.status === "CONCLUIDA" && p.avaliacao && (
                        <p className="text-xs" style={{ color: "var(--shell-subtext)" }}>
                          Nota: {AVALIACAO_LABEL[p.avaliacao] ?? p.avaliacao}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={p.status === "FALTOU" ? "error" : p.status === "CONCLUIDA" ? "success" : p.status === "PENDENTE" ? "warning" : "default"}>
                        {PARTICIPANTE_STATUS_LABEL[p.status] ?? p.status}
                      </Badge>
                      {p.status !== "CONCLUIDA" && p.status !== "FALTOU" && (
                        <>
                          <button
                            onClick={() => handleMarcarFalta(p.familiaId)}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium border border-[var(--shell-card-border)]"
                            style={{ color: "var(--shell-text)" }}
                          >
                            Marcar falta
                          </button>
                          <button
                            onClick={() => setFichaModal(p)}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium"
                            style={{ background: "var(--via-teal, #1D9E75)", color: "#fff" }}
                          >
                            Enviar ficha
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>
          </>
        )}
      </div>

      {fichaModal && (
        <FichaModal
          participante={fichaModal}
          onClose={() => setFichaModal(null)}
          onSaved={async () => {
            setFichaModal(null);
            showToast("Ficha registrada com sucesso.");
            await load();
          }}
          atividadeId={atividadeId}
        />
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

function FichaModal({
  participante,
  atividadeId,
  onClose,
  onSaved,
}: {
  participante: Participante;
  atividadeId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [avaliacao, setAvaliacao] = useState("");
  const [transcricaoFicha, setTranscricaoFicha] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!file) {
      setError("Selecione o arquivo da ficha.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (avaliacao) fd.append("avaliacao", avaliacao);
      if (transcricaoFicha.trim()) fd.append("transcricaoFicha", transcricaoFicha.trim());
      await apiFetch(
        `/pre-ocupacao/atividades/${atividadeId}/participantes/${participante.familiaId}/ficha`,
        { method: "POST", body: fd }
      );
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? "Erro ao enviar ficha");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Ficha de ${participante.familia.lead.nomeCorreto ?? participante.familia.lead.nome}`}
      description="Envie o documento da ficha individual de pontuação preenchida na sessão."
      footer={
        <>
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--shell-card-border)]"
            style={{ color: "var(--shell-text)" }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: "var(--via-teal, #1D9E75)", color: "#fff" }}
          >
            {loading ? "Enviando..." : "Salvar ficha"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--shell-subtext)" }}>Arquivo da ficha *</label>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--shell-subtext)" }}>Avaliação (opcional)</label>
          <select
            value={avaliacao}
            onChange={(e) => setAvaliacao(e.target.value)}
            className="w-full h-10 rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)]"
          >
            <option value="">Não informar</option>
            {AVALIACAO_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--shell-subtext)" }}>Transcrição (opcional)</label>
          <textarea
            value={transcricaoFicha}
            onChange={(e) => setTranscricaoFicha(e.target.value)}
            rows={3}
            className="w-full rounded-lg border px-3 py-2 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)]"
          />
        </div>
        {error && <p className="text-sm" style={{ color: "#dc2626" }}>{error}</p>}
      </div>
    </Modal>
  );
}
