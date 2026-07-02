"use client";

import { useEffect, useState, useRef, startTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/lib/api";
import { formatLeadNumber } from "@/lib/format-lead-number";
import { useSP9Guard } from "../../_lib/useSP9Guard";
import { LeadSearchInput, type LeadSearchResult } from "../../_lib/LeadSearchInput";
import {
  AVALIACAO_LABEL,
  AVALIACAO_OPTIONS,
  AVALIACAO_EMOJI,
  OCORRENCIA_STATUS_LABEL,
  OCORRENCIA_ORIGEM_LABEL,
  OCORRENCIA_TIPO_LABEL,
  formatDateTime,
} from "../../_lib/constants";
import { type Ocorrencia, localDisplay, diasEmAberto } from "../_shared";

export default function DemandaDetalhePage() {
  const guard = useSP9Guard();
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [ocorrencia, setOcorrencia] = useState<Ocorrencia | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [vincularOpen, setVincularOpen] = useState(false);
  const [encerrarOpen, setEncerrarOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [vincularError, setVincularError] = useState<string | null>(null);
  const [lead, setLead] = useState<LeadSearchResult | null>(null);
  const [anexoNome, setAnexoNome] = useState("");
  const [pendingAnexoFile, setPendingAnexoFile] = useState<File | null>(null);
  const [anexoSalvando, setAnexoSalvando] = useState(false);
  const anexoFileInputRef = useRef<HTMLInputElement>(null);
  const [previewAnexo, setPreviewAnexo] = useState<{ url: string; nome: string; mimeType: string | null } | null>(null);
  const [chatTexto, setChatTexto] = useState("");
  const [chatFile, setChatFile] = useState<File | null>(null);
  const [chatSending, setChatSending] = useState(false);
  const chatFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (guard !== true || !id) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guard, id]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/pre-ocupacao/demandas/${id}`);
      setOcorrencia(res);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar demanda");
    } finally {
      setLoading(false);
    }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function handleVincular() {
    if (!lead || !ocorrencia) return;
    setBusy(true);
    setVincularError(null);
    try {
      await apiFetch(`/pre-ocupacao/demandas/${ocorrencia.id}/vincular-familia`, {
        method: "POST",
        body: JSON.stringify({ leadId: lead.id }),
      });
      setVincularOpen(false);
      showToast("Família vinculada com sucesso.");
      await load();
    } catch (e: any) {
      setVincularError(e?.message ?? "Erro ao vincular família");
    } finally {
      setBusy(false);
    }
  }

  async function handleSalvarAnexo() {
    if (!pendingAnexoFile || !ocorrencia) return;
    setAnexoSalvando(true);
    const fd = new FormData();
    fd.append("file", pendingAnexoFile);
    if (anexoNome.trim()) fd.append("nome", anexoNome.trim());
    try {
      await apiFetch(`/pre-ocupacao/demandas/${ocorrencia.id}/anexos`, { method: "POST", body: fd });
      setAnexoNome("");
      setPendingAnexoFile(null);
      if (anexoFileInputRef.current) anexoFileInputRef.current.value = "";
      showToast("Documento salvo com sucesso.");
      await load();
    } catch (e: any) {
      showToast(e?.message ?? "Erro ao salvar documento");
    } finally {
      setAnexoSalvando(false);
    }
  }

  async function handleSendAndamento() {
    if ((!chatTexto.trim() && !chatFile) || !ocorrencia) return;
    setChatSending(true);
    try {
      const fd = new FormData();
      if (chatTexto.trim()) fd.append("texto", chatTexto.trim());
      if (chatFile) fd.append("file", chatFile);
      await apiFetch(`/pre-ocupacao/demandas/${ocorrencia.id}/andamentos`, { method: "POST", body: fd });
      setChatTexto("");
      setChatFile(null);
      if (chatFileInputRef.current) chatFileInputRef.current.value = "";
      await load();
    } catch (e: any) {
      showToast(e?.message ?? "Erro ao enviar mensagem");
    } finally {
      setChatSending(false);
    }
  }

  if (guard === null) return null;

  return (
    <AppShell title="Pré-Ocupação — Demanda">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <button
          onClick={() => startTransition(() => router.push("/pre-ocupacao/demandas"))}
          className="text-sm mb-4"
          style={{ color: "var(--shell-subtext)" }}
        >
          ← Voltar para Demandas
        </button>

        {loading && <p style={{ color: "var(--shell-subtext)" }}>Carregando...</p>}
        {error && (
          <div className="mb-4 rounded-md px-4 py-3 text-sm" style={{ background: "#fef2f2", color: "#dc2626" }}>
            {error}
          </div>
        )}

        {ocorrencia && (
          <>
            <div className="flex items-start justify-between mb-4 gap-3">
              <h1 className="text-xl font-bold" style={{ color: "var(--shell-text)" }}>
                Demanda #{ocorrencia.numero} — {ocorrencia.titulo}
              </h1>
              {ocorrencia.status === "ABERTA" && (
                <button
                  onClick={() => setEncerrarOpen(true)}
                  className="px-4 py-2 rounded-lg text-sm font-medium shrink-0"
                  style={{ background: "#dc2626", color: "#fff" }}
                >
                  Encerrar demanda
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
              <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardBody className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <p>
                    <span style={{ color: "var(--shell-subtext)" }}>Status:</span>{" "}
                    <Badge
                      variant={ocorrencia.status === "ABERTA" ? "warning" : "default"}
                      style={{ fontSize: "13px", fontWeight: 700, padding: "4px 12px" }}
                    >
                      {OCORRENCIA_STATUS_LABEL[ocorrencia.status] ?? ocorrencia.status}
                    </Badge>
                  </p>
                  <p><span style={{ color: "var(--shell-subtext)" }}>Origem:</span> {OCORRENCIA_ORIGEM_LABEL[ocorrencia.origem] ?? ocorrencia.origem}</p>
                  <p><span style={{ color: "var(--shell-subtext)" }}>Tipo:</span> {ocorrencia.tipo ? (OCORRENCIA_TIPO_LABEL[ocorrencia.tipo] ?? ocorrencia.tipo) : "—"}</p>
                  <p><span style={{ color: "var(--shell-subtext)" }}>Local do atendimento:</span> {localDisplay(ocorrencia)}</p>
                  <p><span style={{ color: "var(--shell-subtext)" }}>Aberta em:</span> {formatDateTime(ocorrencia.abertaEm)}</p>
                  <p><span style={{ color: "var(--shell-subtext)" }}>Aberta por:</span> {ocorrencia.criadoPor || "—"}</p>
                  {ocorrencia.encerradaEm && (
                    <p><span style={{ color: "var(--shell-subtext)" }}>Encerrada em:</span> {formatDateTime(ocorrencia.encerradaEm)}</p>
                  )}
                  <p>
                    <span style={{ color: "var(--shell-subtext)" }}>Dias em aberto:</span> {diasEmAberto(ocorrencia)}
                    {ocorrencia.status === "ENCERRADA" ? " (encerrada)" : ""}
                  </p>
                </div>
                {ocorrencia.observacoes && (
                  <div className="rounded-lg p-3" style={{ background: "#eff6ff", border: "1px solid #bfdbfe" }}>
                    <p className="text-xs font-semibold mb-1" style={{ color: "#1e40af" }}>
                      Motivo do atendimento
                    </p>
                    <p className="text-sm font-medium" style={{ color: "#1e3a8a" }}>{ocorrencia.observacoes}</p>
                  </div>
                )}

                <div className="rounded-lg border p-3" style={{ borderColor: "var(--shell-card-border)" }}>
                  <p className="text-xs font-medium mb-1" style={{ color: "var(--shell-subtext)" }}>Família</p>
                  {ocorrencia.familia ? (
                    <p style={{ color: "var(--shell-text)" }}>
                      {ocorrencia.familia.lead.nomeCorreto ?? ocorrencia.familia.lead.nome}
                      {" "}
                      <span style={{ color: "var(--shell-subtext)" }}>
                        (lead #{formatLeadNumber(ocorrencia.familia.lead.numero, ocorrencia.familia.lead.reentradaCount) || "—"} · família #{String(ocorrencia.familia.numero).padStart(4, "0")})
                      </span>
                      {ocorrencia.familia.lead.cpf ? ` — CPF: ${ocorrencia.familia.lead.cpf}` : ""}
                    </p>
                  ) : vincularOpen ? (
                    <div className="space-y-2">
                      <LeadSearchInput value={lead} onChange={setLead} />
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => setVincularOpen(false)}
                          disabled={busy}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--shell-card-border)]"
                          style={{ color: "var(--shell-text)" }}
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={handleVincular}
                          disabled={busy || !lead}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium"
                          style={{ background: "var(--via-teal, #1D9E75)", color: "#fff" }}
                        >
                          {busy ? "Vinculando..." : "Vincular"}
                        </button>
                      </div>
                      {vincularError && <p className="text-xs" style={{ color: "#dc2626" }}>{vincularError}</p>}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <p style={{ color: "var(--shell-subtext)" }}>Sem família vinculada.</p>
                      <button
                        onClick={() => setVincularOpen(true)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{ background: "var(--via-teal, #1D9E75)", color: "#fff" }}
                      >
                        Vincular família
                      </button>
                    </div>
                  )}
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <p className="text-xs font-medium mb-2" style={{ color: "var(--shell-subtext)" }}>
                  Andamentos {ocorrencia.andamentos && ocorrencia.andamentos.length > 0 ? `(${ocorrencia.andamentos.length})` : ""}
                </p>

                <div className="max-h-80 overflow-y-auto space-y-2 mb-2 pr-1">
                  {(!ocorrencia.andamentos || ocorrencia.andamentos.length === 0) && (
                    <p className="text-xs" style={{ color: "var(--shell-subtext)" }}>
                      Nenhum andamento ainda. Mande uma mensagem abaixo.
                    </p>
                  )}
                  {ocorrencia.andamentos?.map((a) => (
                    <div key={a.id} className="rounded-lg p-2.5 text-xs" style={{ background: "var(--shell-bg)" }}>
                      {a.texto && <p style={{ color: "var(--shell-text)" }}>{a.texto}</p>}
                      {a.anexos && a.anexos.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {a.anexos.map((anexo) => (
                            <button
                              key={anexo.id}
                              type="button"
                              onClick={() => setPreviewAnexo(anexo)}
                              className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] underline"
                              style={{ background: "var(--shell-card-bg)", color: "var(--via-teal, #1D9E75)" }}
                            >
                              📎 {anexo.nome}
                            </button>
                          ))}
                        </div>
                      )}
                      <p className="mt-1" style={{ color: "var(--shell-subtext)" }}>
                        {formatDateTime(a.criadoEm)}{a.criadoPor ? ` · ${a.criadoPor}` : ""}
                      </p>
                    </div>
                  ))}
                </div>

                {ocorrencia.status === "ABERTA" && (
                  <div className="space-y-1.5 border-t pt-2" style={{ borderColor: "var(--shell-card-border)" }}>
                    {chatFile && (
                      <div className="flex items-center gap-2 text-xs rounded px-2 py-1" style={{ background: "var(--shell-bg)" }}>
                        <span style={{ color: "var(--shell-text)" }}>📎 {chatFile.name}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setChatFile(null);
                            if (chatFileInputRef.current) chatFileInputRef.current.value = "";
                          }}
                          className="text-[11px] underline"
                          style={{ color: "#dc2626" }}
                        >
                          remover
                        </button>
                      </div>
                    )}
                    <div className="flex items-end gap-2">
                      <input
                        ref={chatFileInputRef}
                        type="file"
                        className="hidden"
                        onChange={(e) => setChatFile(e.target.files?.[0] ?? null)}
                      />
                      <button
                        type="button"
                        onClick={() => chatFileInputRef.current?.click()}
                        disabled={chatSending}
                        className="h-9 w-9 shrink-0 rounded-full border flex items-center justify-center"
                        style={{ borderColor: "var(--shell-card-border)", color: "var(--shell-text)" }}
                        title="Anexar arquivo"
                      >
                        📎
                      </button>
                      <textarea
                        value={chatTexto}
                        onChange={(e) => setChatTexto(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSendAndamento();
                          }
                        }}
                        rows={1}
                        placeholder="Digite uma mensagem..."
                        className="flex-1 rounded-lg border px-3 py-2 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)] resize-none"
                      />
                      <button
                        type="button"
                        onClick={handleSendAndamento}
                        disabled={chatSending || (!chatTexto.trim() && !chatFile)}
                        className="h-9 px-4 rounded-lg text-sm font-medium shrink-0 disabled:opacity-50"
                        style={{ background: "var(--via-teal, #1D9E75)", color: "#fff" }}
                      >
                        {chatSending ? "..." : "Salvar"}
                      </button>
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>

            {ocorrencia.status === "ENCERRADA" && (
              <Card>
                <CardBody>
                  <p className="text-xs font-medium mb-1" style={{ color: "var(--shell-subtext)" }}>
                    Encerramento — {formatDateTime(ocorrencia.encerradaEm)}
                  </p>
                  <p style={{ color: "var(--shell-text)" }}>
                    Avaliação: {ocorrencia.avaliacao ? `${AVALIACAO_EMOJI[ocorrencia.avaliacao] ?? ""} ${AVALIACAO_LABEL[ocorrencia.avaliacao] ?? ocorrencia.avaliacao}` : "—"}
                  </p>
                  {ocorrencia.semResposta && (
                    <p className="mt-1 text-xs font-medium" style={{ color: "#b45309" }}>A família não respondeu.</p>
                  )}
                  {ocorrencia.resolucao && <p className="mt-1" style={{ color: "var(--shell-subtext)" }}>{ocorrencia.resolucao}</p>}
                </CardBody>
              </Card>
            )}
              </div>

              <div className="lg:col-span-1">
            <Card>
              <CardBody>
                <div className="flex items-center justify-between mb-2 gap-2">
                  <p className="text-xs font-medium shrink-0" style={{ color: "var(--shell-subtext)" }}>Anexos</p>
                  {!pendingAnexoFile && (
                    <>
                      <input
                        ref={anexoFileInputRef}
                        type="file"
                        className="hidden"
                        onChange={(e) => setPendingAnexoFile(e.target.files?.[0] ?? null)}
                      />
                      <button
                        type="button"
                        onClick={() => anexoFileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium border-[var(--shell-card-border)]"
                        style={{ color: "var(--shell-text)" }}
                      >
                        📎 Anexar arquivo
                      </button>
                    </>
                  )}
                </div>

                {pendingAnexoFile && (
                  <div className="mb-3 rounded-lg p-2.5 space-y-2" style={{ background: "var(--shell-bg)" }}>
                    <p className="text-xs" style={{ color: "var(--shell-text)" }}>Arquivo escolhido: {pendingAnexoFile.name}</p>
                    <input
                      type="text"
                      value={anexoNome}
                      onChange={(e) => setAnexoNome(e.target.value)}
                      placeholder="Nome do documento"
                      className="w-full h-9 rounded-lg border px-2 text-xs bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)]"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPendingAnexoFile(null);
                          setAnexoNome("");
                          if (anexoFileInputRef.current) anexoFileInputRef.current.value = "";
                        }}
                        disabled={anexoSalvando}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--shell-card-border)]"
                        style={{ color: "var(--shell-text)" }}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleSalvarAnexo}
                        disabled={anexoSalvando}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{ background: "var(--via-teal, #1D9E75)", color: "#fff" }}
                      >
                        {anexoSalvando ? "Salvando..." : "Salvar documento"}
                      </button>
                    </div>
                  </div>
                )}

                {ocorrencia.anexos.length === 0 ? (
                  <p className="text-xs" style={{ color: "var(--shell-subtext)" }}>Nenhum anexo.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {ocorrencia.anexos.map((a) => (
                      <li key={a.id} className="text-xs">
                        <button
                          type="button"
                          onClick={() => setPreviewAnexo(a)}
                          className="underline font-medium"
                          style={{ color: "var(--via-teal, #1D9E75)" }}
                        >
                          {a.nome}
                        </button>
                        <span style={{ color: "var(--shell-subtext)" }}>
                          {" — "}{formatDateTime(a.criadoEm)}{a.criadoPor ? ` · ${a.criadoPor}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
              </div>
            </div>
          </>
        )}
      </div>

      {previewAnexo && (
        <AnexoPreviewModal anexo={previewAnexo} onClose={() => setPreviewAnexo(null)} />
      )}

      {encerrarOpen && ocorrencia && (
        <EncerrarDemandaModal
          ocorrencia={ocorrencia}
          onClose={() => setEncerrarOpen(false)}
          onEncerrada={async () => {
            setEncerrarOpen(false);
            showToast("Demanda encerrada com sucesso.");
            await load();
          }}
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

/** Visualiza o anexo dentro do próprio sistema (sem abrir nova aba). */
function AnexoPreviewModal({
  anexo,
  onClose,
}: {
  anexo: { url: string; nome: string; mimeType: string | null };
  onClose: () => void;
}) {
  const isImage = anexo.mimeType?.startsWith("image/");
  const isPdf = anexo.mimeType === "application/pdf";

  return (
    <Modal open onClose={onClose} title={anexo.nome} size="lg">
      <div className="flex flex-col items-center">
        {isImage ? (
          <img src={anexo.url} alt={anexo.nome} className="max-h-[70vh] max-w-full rounded-lg object-contain" />
        ) : isPdf ? (
          <iframe src={anexo.url} className="w-full h-[70vh] rounded-lg border" style={{ borderColor: "var(--shell-card-border)" }} />
        ) : (
          <div className="py-10 text-center">
            <p className="text-sm mb-3" style={{ color: "var(--shell-subtext)" }}>
              Não é possível visualizar este tipo de arquivo aqui.
            </p>
            <a
              href={anexo.url}
              target="_blank"
              rel="noreferrer"
              className="inline-block px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: "var(--via-teal, #1D9E75)", color: "#fff" }}
            >
              Abrir arquivo
            </a>
          </div>
        )}
      </div>
    </Modal>
  );
}

function EncerrarDemandaModal({
  ocorrencia,
  onClose,
  onEncerrada,
}: {
  ocorrencia: Ocorrencia;
  onClose: () => void;
  onEncerrada: () => void;
}) {
  const [avaliacao, setAvaliacao] = useState("");
  const [resolucao, setResolucao] = useState("");
  const [anexoFile, setAnexoFile] = useState<File | null>(null);
  const [anexoNome, setAnexoNome] = useState("");
  const [semResposta, setSemResposta] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const anexoFileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit() {
    if (!resolucao.trim()) {
      setError("Descreva como a demanda foi resolvida.");
      return;
    }
    if (!avaliacao) {
      setError("Selecione uma nota pro atendimento.");
      return;
    }
    if (!semResposta && !anexoFile) {
      setError("Anexe uma evidência (foto ou print da conversa), ou marque que a família não respondeu.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (anexoFile) {
        const fd = new FormData();
        fd.append("texto", "Evidência do encerramento");
        fd.append("file", anexoFile);
        if (anexoNome.trim()) fd.append("nome", anexoNome.trim());
        await apiFetch(`/pre-ocupacao/demandas/${ocorrencia.id}/andamentos`, { method: "POST", body: fd });
      }
      await apiFetch(`/pre-ocupacao/demandas/${ocorrencia.id}/encerrar`, {
        method: "PATCH",
        body: JSON.stringify({ avaliacao, resolucao: resolucao.trim(), semResposta }),
      });
      onEncerrada();
    } catch (e: any) {
      setError(e?.message ?? "Erro ao encerrar demanda");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Encerrar demanda"
      description="Registre como foi resolvido e avalie o atendimento. Esta ação não pode ser desfeita."
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
            style={{ background: "#dc2626", color: "#fff" }}
          >
            {loading ? "Encerrando..." : "Confirmar encerramento"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--shell-subtext)" }}>Como foi resolvido *</label>
          <textarea
            value={resolucao}
            onChange={(e) => setResolucao(e.target.value)}
            rows={3}
            className="w-full rounded-lg border px-3 py-2 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--shell-subtext)" }}>Nota do atendimento *</label>
          <div className="flex gap-2">
            {AVALIACAO_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setAvaliacao(o.value)}
                title={o.label}
                className="flex-1 flex flex-col items-center gap-1 rounded-lg border py-2 transition-colors"
                style={{
                  borderColor: avaliacao === o.value ? "var(--via-teal, #1D9E75)" : "var(--shell-card-border)",
                  background: avaliacao === o.value ? "var(--via-teal-soft, #e6f5ef)" : "transparent",
                }}
              >
                <span className="text-2xl">{AVALIACAO_EMOJI[o.value] ?? "❓"}</span>
                <span className="text-[11px]" style={{ color: "var(--shell-text)" }}>{o.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--shell-subtext)" }}>
            Evidência — foto ou print da conversa {semResposta ? "" : "*"}
          </label>
          <label className="flex items-center gap-2 text-xs mb-2" style={{ color: "var(--shell-subtext)" }}>
            <input
              type="checkbox"
              checked={semResposta}
              onChange={(e) => {
                setSemResposta(e.target.checked);
                if (e.target.checked) {
                  setAnexoFile(null);
                  setAnexoNome("");
                }
              }}
            />
            A família não respondeu (não há evidência pra anexar)
          </label>
          {!semResposta && (
            <>
              <input
                type="text"
                value={anexoNome}
                onChange={(e) => setAnexoNome(e.target.value)}
                placeholder="Nome do arquivo (opcional)"
                className="w-full h-9 rounded-lg border px-3 text-sm mb-2 bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)]"
              />
              <input
                ref={anexoFileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => setAnexoFile(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => anexoFileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium border-[var(--shell-card-border)]"
                style={{ color: "var(--shell-text)" }}
              >
                📎 {anexoFile ? "Trocar arquivo" : "Escolher arquivo"}
              </button>
              {anexoFile && (
                <span className="ml-2 text-xs" style={{ color: "var(--shell-subtext)" }}>
                  {anexoFile.name}
                </span>
              )}
            </>
          )}
        </div>
        {error && <p className="text-sm" style={{ color: "#dc2626" }}>{error}</p>}
      </div>
    </Modal>
  );
}
