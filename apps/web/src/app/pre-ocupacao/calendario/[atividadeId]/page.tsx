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
  rsvpStatus: "AGUARDANDO" | "CONFIRMOU" | "RECUSOU";
  familia: { id: string; leadId: string; numero: number; lead: { id: string; nome: string; nomeCorreto: string | null } };
  anexos: { id: string; url: string; nome: string }[];
};

const RSVP_LABEL: Record<string, string> = {
  AGUARDANDO: "Aguardando confirmação",
  CONFIRMOU: "Confirmou presença",
  RECUSOU: "Não vai comparecer",
};

type MensagemTemplate = { id: string; nome: string; corpo: string };

type Agendamento = {
  id: string;
  mensagem: string;
  agendadoPara: string;
  status: "PENDENTE" | "ERRO";
  erro: string | null;
  familiaIds: string[] | null;
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
  const [addFamiliaModal, setAddFamiliaModal] = useState(false);
  const [conviteModal, setConviteModal] = useState<string[] | "todos" | null>(null);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [templates, setTemplates] = useState<MensagemTemplate[]>([]);
  const [novoTemplateForm, setNovoTemplateForm] = useState(false);
  const [novoTemplateNomeForm, setNovoTemplateNomeForm] = useState("");
  const [novoTemplateCorpoForm, setNovoTemplateCorpoForm] = useState("");
  const [savingTemplateForm, setSavingTemplateForm] = useState(false);

  useEffect(() => {
    if (guard !== true || !atividadeId) return;
    load();
    loadAgendamentos();
    loadTemplates();
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

  async function loadAgendamentos() {
    try {
      const res = await apiFetch(`/pre-ocupacao/atividades/${atividadeId}/agendamentos`);
      setAgendamentos(Array.isArray(res) ? res : []);
    } catch {
      setAgendamentos([]);
    }
  }

  async function handleCancelarAgendamento(id: string) {
    try {
      await apiFetch(`/pre-ocupacao/atividades/agendamentos/${id}/cancelar`, { method: "PATCH" });
      showToast("Agendamento cancelado.");
      await loadAgendamentos();
    } catch (e: any) {
      showToast(e?.message ?? "Erro ao cancelar agendamento");
    }
  }

  async function loadTemplates() {
    try {
      const res = await apiFetch("/pre-ocupacao/templates");
      setTemplates(Array.isArray(res) ? res : []);
    } catch {
      setTemplates([]);
    }
  }

  async function handleCriarTemplate() {
    if (!novoTemplateNomeForm.trim() || !novoTemplateCorpoForm.trim()) return;
    setSavingTemplateForm(true);
    try {
      await apiFetch("/pre-ocupacao/templates", {
        method: "POST",
        body: JSON.stringify({ nome: novoTemplateNomeForm.trim(), corpo: novoTemplateCorpoForm.trim() }),
      });
      setNovoTemplateForm(false);
      setNovoTemplateNomeForm("");
      setNovoTemplateCorpoForm("");
      showToast("Modelo salvo.");
      await loadTemplates();
    } catch (e: any) {
      showToast(e?.message ?? "Erro ao salvar modelo");
    } finally {
      setSavingTemplateForm(false);
    }
  }

  async function handleExcluirTemplate(id: string) {
    try {
      await apiFetch(`/pre-ocupacao/templates/${id}`, { method: "DELETE" });
      showToast("Modelo excluído.");
      await loadTemplates();
    } catch (e: any) {
      showToast(e?.message ?? "Erro ao excluir modelo");
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

            <Card className="mb-4">
              <CardHeader className="flex items-center justify-between">
                <CardTitle>Modelos de mensagem ({templates.length})</CardTitle>
                <button
                  onClick={() => setNovoTemplateForm((v) => !v)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: "var(--via-teal, #1D9E75)", color: "#fff" }}
                >
                  + Novo modelo
                </button>
              </CardHeader>
              <CardBody className="space-y-2">
                {novoTemplateForm && (
                  <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: "var(--shell-card-border)" }}>
                    <input
                      type="text"
                      value={novoTemplateNomeForm}
                      onChange={(e) => setNovoTemplateNomeForm(e.target.value)}
                      placeholder="Nome do modelo (ex: Lembrete 1 dia antes)"
                      className="w-full h-9 rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)]"
                    />
                    <textarea
                      value={novoTemplateCorpoForm}
                      onChange={(e) => setNovoTemplateCorpoForm(e.target.value)}
                      rows={3}
                      placeholder="Mensagem (use {{nome}} pra personalizar)"
                      className="w-full rounded-lg border px-3 py-2 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)] resize-none"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setNovoTemplateForm(false)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--shell-card-border)]"
                        style={{ color: "var(--shell-text)" }}
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleCriarTemplate}
                        disabled={savingTemplateForm || !novoTemplateNomeForm.trim() || !novoTemplateCorpoForm.trim()}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
                        style={{ background: "var(--via-teal, #1D9E75)", color: "#fff" }}
                      >
                        {savingTemplateForm ? "Salvando..." : "Salvar modelo"}
                      </button>
                    </div>
                  </div>
                )}
                {templates.length === 0 && !novoTemplateForm && (
                  <p className="text-sm" style={{ color: "var(--shell-subtext)" }}>
                    Nenhum modelo salvo ainda — crie um pra reusar em convites e lembretes futuros.
                  </p>
                )}
                {templates.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2"
                    style={{ borderColor: "var(--shell-card-border)" }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium" style={{ color: "var(--shell-text)" }}>{t.nome}</p>
                      <p className="text-xs truncate" style={{ color: "var(--shell-subtext)" }}>{t.corpo}</p>
                    </div>
                    <button
                      onClick={() => handleExcluirTemplate(t.id)}
                      className="text-xs shrink-0"
                      style={{ color: "#dc2626" }}
                    >
                      Excluir
                    </button>
                  </div>
                ))}
              </CardBody>
            </Card>

            {agendamentos.length > 0 && (
              <Card className="mb-4">
                <CardHeader>
                  <CardTitle>Envios agendados ({agendamentos.length})</CardTitle>
                </CardHeader>
                <CardBody className="space-y-2">
                  {agendamentos.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                      style={{ borderColor: "var(--shell-card-border)" }}
                    >
                      <div className="min-w-0">
                        <p className="text-sm truncate" style={{ color: "var(--shell-text)" }}>{a.mensagem}</p>
                        <p className="text-xs" style={{ color: "var(--shell-subtext)" }}>
                          {a.familiaIds ? `${a.familiaIds.length} família(s)` : "Todas as famílias"} · Para{" "}
                          {new Date(a.agendadoPara).toLocaleString("pt-BR")}
                          {a.status === "ERRO" && a.erro ? ` · Erro: ${a.erro}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={a.status === "ERRO" ? "error" : "warning"}>
                          {a.status === "ERRO" ? "Erro no envio" : "Pendente"}
                        </Badge>
                        <button
                          onClick={() => handleCancelarAgendamento(a.id)}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium border border-[var(--shell-card-border)]"
                          style={{ color: "var(--shell-text)" }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ))}
                </CardBody>
              </Card>
            )}

            <Card>
              <CardHeader className="flex items-center justify-between">
                <CardTitle>Famílias participantes ({data.participantes.length})</CardTitle>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setConviteModal("todos")}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--shell-card-border)]"
                    style={{ color: "var(--shell-text)" }}
                  >
                    Enviar convite a todos
                  </button>
                  <button
                    onClick={() => setAddFamiliaModal(true)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: "var(--via-teal, #1D9E75)", color: "#fff" }}
                  >
                    + Adicionar família
                  </button>
                </div>
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
                      <Badge variant={p.rsvpStatus === "CONFIRMOU" ? "success" : p.rsvpStatus === "RECUSOU" ? "error" : "default"}>
                        {RSVP_LABEL[p.rsvpStatus] ?? p.rsvpStatus}
                      </Badge>
                      <Badge variant={p.status === "FALTOU" ? "error" : p.status === "CONCLUIDA" ? "success" : p.status === "PENDENTE" ? "warning" : "default"}>
                        {PARTICIPANTE_STATUS_LABEL[p.status] ?? p.status}
                      </Badge>
                      {p.status !== "CONCLUIDA" && p.status !== "FALTOU" && (
                        <>
                          <button
                            onClick={() => setConviteModal([p.familiaId])}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium border border-[var(--shell-card-border)]"
                            style={{ color: "var(--shell-text)" }}
                          >
                            Enviar convite
                          </button>
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

      {addFamiliaModal && data && (
        <AddFamiliaModal
          atividadeId={atividadeId}
          jaParticipantes={new Set(data.participantes.map((p) => p.familiaId))}
          onClose={() => setAddFamiliaModal(false)}
          onSaved={async (qtd) => {
            setAddFamiliaModal(false);
            showToast(`${qtd} família(s) adicionada(s) à sessão.`);
            await load();
          }}
        />
      )}

      {conviteModal && data && (
        <ConviteModal
          atividadeId={atividadeId}
          atividade={data}
          familiaIds={conviteModal === "todos" ? undefined : conviteModal}
          templates={templates}
          onTemplateSaved={loadTemplates}
          onClose={() => setConviteModal(null)}
          onSaved={async (mensagem) => {
            setConviteModal(null);
            showToast(mensagem);
            await loadAgendamentos();
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

type FamiliaOption = { id: string; numero: number; nome: string };

function AddFamiliaModal({
  atividadeId,
  jaParticipantes,
  onClose,
  onSaved,
}: {
  atividadeId: string;
  jaParticipantes: Set<string>;
  onClose: () => void;
  onSaved: (qtd: number) => void;
}) {
  const [familias, setFamilias] = useState<FamiliaOption[]>([]);
  const [loadingFamilias, setLoadingFamilias] = useState(true);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  const familiasFiltradas = familias.filter((f) => {
    if (!busca.trim()) return true;
    const termo = busca.trim().toLowerCase();
    return f.nome.toLowerCase().includes(termo) || String(f.numero).includes(termo);
  });

  useEffect(() => {
    apiFetch("/pre-ocupacao/familias")
      .then((res) => {
        const opts: FamiliaOption[] = (res.items ?? [])
          .filter((f: any) => !jaParticipantes.has(f.id))
          .map((f: any) => ({ id: f.id, numero: f.numero, nome: f.nome }));
        setFamilias(opts);
      })
      .catch(() => setFamilias([]))
      .finally(() => setLoadingFamilias(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(id: string) {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    if (selecionadas.size === 0) {
      setError("Selecione ao menos uma família.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/pre-ocupacao/atividades/${atividadeId}/participantes`, {
        method: "POST",
        body: JSON.stringify({ familiaIds: [...selecionadas] }),
      });
      onSaved(selecionadas.size);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao adicionar famílias");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Adicionar família à sessão"
      description="Selecione as famílias que participarão desta sessão."
      footer={
        <>
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--shell-card-border)]"
            style={{ color: "var(--shell-text)" }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || selecionadas.size === 0}
            className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--via-teal, #1D9E75)", color: "#fff" }}
          >
            {saving ? "Adicionando..." : `Adicionar (${selecionadas.size})`}
          </button>
        </>
      }
    >
      <div className="space-y-2">
        {!loadingFamilias && familias.length > 0 && (
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou número..."
            className="w-full h-9 rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)] outline-none"
          />
        )}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {loadingFamilias && <p className="text-xs" style={{ color: "var(--shell-subtext)" }}>Carregando famílias...</p>}
          {!loadingFamilias && familias.length === 0 && (
            <p className="text-xs" style={{ color: "var(--shell-subtext)" }}>
              Todas as famílias já participam desta sessão.
            </p>
          )}
          {!loadingFamilias && familias.length > 0 && familiasFiltradas.length === 0 && (
            <p className="text-xs" style={{ color: "var(--shell-subtext)" }}>Nenhuma família encontrada.</p>
          )}
          {familiasFiltradas.map((f) => (
            <label key={f.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={selecionadas.has(f.id)} onChange={() => toggle(f.id)} />
              #{String(f.numero).padStart(4, "0")} — {f.nome}
            </label>
          ))}
        </div>
        {error && <p className="text-sm" style={{ color: "#dc2626" }}>{error}</p>}
      </div>
    </Modal>
  );
}

function ConviteModal({
  atividadeId,
  atividade,
  familiaIds,
  templates,
  onTemplateSaved,
  onClose,
  onSaved,
}: {
  atividadeId: string;
  atividade: Atividade;
  familiaIds?: string[];
  templates: MensagemTemplate[];
  onTemplateSaved: () => void;
  onClose: () => void;
  onSaved: (mensagem: string) => void;
}) {
  const categoriaLabel = CATEGORIA_LABEL[atividade.categoria] ?? atividade.categoria;
  const dataLabel = new Date(atividade.dataAgendada).toLocaleDateString("pt-BR");
  const horaLabel = new Date(atividade.dataAgendada).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const localTrecho = atividade.local ? `, em ${atividade.local}` : "";
  const titulo = atividade.titulo || categoriaLabel;
  const defaultTemplate =
    `Olá, {{nome}}! Você está convidado(a) para a sessão "${titulo}" do Trabalho Técnico Social, ` +
    `no dia ${dataLabel} às ${horaLabel}${localTrecho}.`;

  const [mensagem, setMensagem] = useState(defaultTemplate);
  const [preview, setPreview] = useState(defaultTemplate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [templateSelecionado, setTemplateSelecionado] = useState("");
  const [showSalvarTemplate, setShowSalvarTemplate] = useState(false);
  const [novoTemplateNome, setNovoTemplateNome] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);

  const [modo, setModo] = useState<"agora" | "agendar">("agora");
  const [agendadoPara, setAgendadoPara] = useState("");

  useEffect(() => {
    setPreview(mensagem.replace(/\{\{nome\}\}/gi, "Maria da Silva"));
  }, [mensagem]);

  const alvoLabel = familiaIds ? `${familiaIds.length} família(s)` : "todas as famílias participantes";

  function aplicarTemplate(id: string) {
    setTemplateSelecionado(id);
    const t = templates.find((tp) => tp.id === id);
    if (t) setMensagem(t.corpo);
  }

  async function salvarComoTemplate() {
    if (!novoTemplateNome.trim() || !mensagem.trim()) return;
    setSavingTemplate(true);
    try {
      const novo = await apiFetch("/pre-ocupacao/templates", {
        method: "POST",
        body: JSON.stringify({ nome: novoTemplateNome.trim(), corpo: mensagem.trim() }),
      });
      onTemplateSaved();
      setTemplateSelecionado(novo.id);
      setShowSalvarTemplate(false);
      setNovoTemplateNome("");
    } catch (e: any) {
      setError(e?.message ?? "Erro ao salvar modelo");
    } finally {
      setSavingTemplate(false);
    }
  }

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      if (modo === "agendar") {
        if (!agendadoPara) {
          setError("Escolha a data e hora do envio.");
          setSaving(false);
          return;
        }
        await apiFetch(`/pre-ocupacao/atividades/${atividadeId}/convite/agendar`, {
          method: "POST",
          body: JSON.stringify({ familiaIds, mensagem: mensagem.trim(), agendadoPara: new Date(agendadoPara).toISOString() }),
        });
        onSaved(`Envio agendado para ${new Date(agendadoPara).toLocaleString("pt-BR")}.`);
        return;
      }
      const res = await apiFetch(`/pre-ocupacao/atividades/${atividadeId}/convite`, {
        method: "POST",
        body: JSON.stringify({ familiaIds, mensagem: mensagem.trim() }),
      });
      const falhas = (res.resultados ?? []).filter((r: any) => !r.ok).map((r: any) => r.nome);
      onSaved(
        falhas.length === 0
          ? `Convite enviado (${res.enviados}/${res.total}).`
          : `Enviado ${res.enviados}/${res.total} — falhou: ${falhas.join(", ")}`,
      );
    } catch (e: any) {
      setError(e?.message ?? "Erro ao enviar convite");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Enviar convite"
      description={`Convite para ${alvoLabel}. Use {{nome}} pra personalizar.`}
      footer={
        <>
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--shell-card-border)]"
            style={{ color: "var(--shell-text)" }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !mensagem.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--via-teal, #1D9E75)", color: "#fff" }}
          >
            {saving ? (modo === "agendar" ? "Agendando..." : "Enviando...") : modo === "agendar" ? "Agendar" : "Enviar"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {templates.length > 0 && (
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--shell-subtext)" }}>
              Usar modelo salvo
            </label>
            <select
              value={templateSelecionado}
              onChange={(e) => aplicarTemplate(e.target.value)}
              className="w-full h-9 rounded-lg border px-2 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)]"
            >
              <option value="">— Escrever mensagem —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--shell-subtext)" }}>
            Mensagem
          </label>
          <textarea
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            rows={5}
            className="w-full rounded-lg border px-3 py-2 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)] resize-none"
          />
          <p className="mt-1 text-xs" style={{ color: "var(--shell-subtext)" }}>
            O link de confirmação de presença é adicionado automaticamente no fim da mensagem.
          </p>
        </div>

        {!showSalvarTemplate ? (
          <button
            type="button"
            onClick={() => setShowSalvarTemplate(true)}
            disabled={!mensagem.trim()}
            className="text-xs font-medium disabled:opacity-50"
            style={{ color: "var(--via-teal, #1D9E75)" }}
          >
            + Salvar mensagem como modelo
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={novoTemplateNome}
              onChange={(e) => setNovoTemplateNome(e.target.value)}
              placeholder="Nome do modelo (ex: Lembrete 1 dia antes)"
              className="flex-1 h-9 rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)]"
            />
            <button
              type="button"
              onClick={salvarComoTemplate}
              disabled={savingTemplate || !novoTemplateNome.trim()}
              className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
              style={{ background: "var(--via-teal, #1D9E75)", color: "#fff" }}
            >
              Salvar
            </button>
            <button
              type="button"
              onClick={() => setShowSalvarTemplate(false)}
              className="text-xs"
              style={{ color: "var(--shell-subtext)" }}
            >
              Cancelar
            </button>
          </div>
        )}

        {preview !== mensagem && (
          <div className="rounded-lg p-3 text-sm" style={{ background: "var(--brand-accent-muted, #eef8f5)" }}>
            <p className="text-xs font-medium mb-1" style={{ color: "var(--brand-accent, #1D9E75)" }}>
              Preview:
            </p>
            <p style={{ color: "var(--shell-text)" }}>{preview}</p>
          </div>
        )}

        <div className="border-t pt-3" style={{ borderColor: "var(--shell-card-border)" }}>
          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() => setModo("agora")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium border ${modo === "agora" ? "" : "border-[var(--shell-card-border)]"}`}
              style={modo === "agora" ? { background: "var(--via-teal, #1D9E75)", color: "#fff", borderColor: "var(--via-teal, #1D9E75)" } : { color: "var(--shell-text)" }}
            >
              Enviar agora
            </button>
            <button
              type="button"
              onClick={() => setModo("agendar")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium border ${modo === "agendar" ? "" : "border-[var(--shell-card-border)]"}`}
              style={modo === "agendar" ? { background: "var(--via-teal, #1D9E75)", color: "#fff", borderColor: "var(--via-teal, #1D9E75)" } : { color: "var(--shell-text)" }}
            >
              Agendar para depois
            </button>
          </div>
          {modo === "agendar" && (
            <input
              type="datetime-local"
              value={agendadoPara}
              onChange={(e) => setAgendadoPara(e.target.value)}
              min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
              className="w-full h-9 rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)]"
            />
          )}
        </div>

        {error && <p className="text-sm" style={{ color: "#dc2626" }}>{error}</p>}
      </div>
    </Modal>
  );
}
