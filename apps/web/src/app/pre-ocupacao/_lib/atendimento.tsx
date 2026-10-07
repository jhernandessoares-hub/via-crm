"use client";

/**
 * Atendimentos da Pré-Ocupação (evidência TTS para a Verificadora).
 *
 * - `EncerrarConversaPreOcupacaoModal`: aberto pelo "Encerrar conversa" do lead
 *   quando o lead é família ativa — registra o atendimento e encerra a conversa.
 * - `RegistrarAtendimentoModal`: atendimento presencial/telefone lançado na família.
 * - `AtendimentoDetalheModal`: dados + mensagens trocadas de um atendimento.
 */

import { useEffect, useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/lib/api";
import {
  ATENDIMENTO_ASSUNTO_LABEL,
  ATENDIMENTO_MODALIDADE_LABEL,
  ATENDIMENTO_MOTIVO_LABEL,
  ATENDIMENTO_ORIGEM_LABEL,
  formatDateTime,
} from "./constants";

export type AtendimentoMensagem = {
  id: string;
  criadoEm: string;
  direcao: "IN" | "OUT";
  texto: string | null;
  midia: { tipo: string; nome: string | null; mimeType: string | null } | null;
  autor: string | null;
};

export type AtendimentoAnexo = { id: string; url: string; nome: string; mimeType: string | null };

export type Atendimento = {
  id: string;
  familiaId: string;
  leadId: string;
  motivo: string;
  assunto: string;
  modalidade: string;
  descricao: string | null;
  inicioEm: string;
  fimEm: string;
  origem: string;
  atendidoPorNome: string | null;
  anexos: AtendimentoAnexo[];
};

type FormValues = { motivo: string; assunto: string; modalidade: string; descricao: string };

const FORM_VAZIO: FormValues = { motivo: "", assunto: "", modalidade: "ONLINE", descricao: "" };

function validarForm(v: FormValues): string | null {
  if (!v.motivo) return "Escolha o motivo do contato.";
  if (!v.assunto) return "Escolha o assunto.";
  if (v.assunto === "OUTROS" && !v.descricao.trim()) return 'Descreva o atendimento quando o assunto for "Outros".';
  return null;
}

const inputClass =
  "w-full rounded-lg border px-3 py-2 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)] outline-none";

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
      style={{
        borderColor: ativo ? "var(--via-teal, #1D9E75)" : "var(--shell-card-border)",
        background: ativo ? "var(--via-teal, #1D9E75)" : "transparent",
        color: ativo ? "#fff" : "var(--shell-text)",
      }}
    >
      {children}
    </button>
  );
}

/** Motivo → (abre) Assunto, modalidade e descrição. */
function AtendimentoFormFields({ value, onChange }: { value: FormValues; onChange: (v: FormValues) => void }) {
  const set = (patch: Partial<FormValues>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold mb-2" style={{ color: "var(--shell-subtext)" }}>
          Motivo do contato *
        </p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(ATENDIMENTO_MOTIVO_LABEL).map(([k, label]) => (
            <Chip key={k} ativo={value.motivo === k} onClick={() => set({ motivo: k })}>
              {label}
            </Chip>
          ))}
        </div>
      </div>

      {value.motivo && (
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: "var(--shell-subtext)" }}>
            {ATENDIMENTO_MOTIVO_LABEL[value.motivo]} sobre *
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(ATENDIMENTO_ASSUNTO_LABEL).map(([k, label]) => (
              <Chip key={k} ativo={value.assunto === k} onClick={() => set({ assunto: k })}>
                {label}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold mb-2" style={{ color: "var(--shell-subtext)" }}>
          Modalidade
        </p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(ATENDIMENTO_MODALIDADE_LABEL).map(([k, label]) => (
            <Chip key={k} ativo={value.modalidade === k} onClick={() => set({ modalidade: k })}>
              {label}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold mb-2" style={{ color: "var(--shell-subtext)" }}>
          Descrição breve{value.assunto === "OUTROS" ? " *" : ""}
        </p>
        <textarea
          value={value.descricao}
          onChange={(e) => set({ descricao: e.target.value })}
          rows={3}
          maxLength={2000}
          placeholder="Ex.: Família perguntou quando será feita a ligação de energia do apartamento."
          className={inputClass}
        />
      </div>
    </div>
  );
}

/** Abre mídia da mensagem pelo proxy autenticado do lead (mesmo endpoint do chat). */
async function abrirMidia(leadId: string, eventId: string) {
  const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/leads/${encodeURIComponent(leadId)}/events/${encodeURIComponent(eventId)}/download`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );
  if (!res.ok) throw new Error(`Falha ao abrir arquivo (${res.status})`);
  const url = URL.createObjectURL(await res.blob());
  window.open(url, "_blank", "noopener");
}

const MIDIA_LABEL: Record<string, string> = {
  image: "📷 Imagem",
  video: "🎥 Vídeo",
  audio: "🎵 Áudio",
  document: "📄 Documento",
  sticker: "🖼️ Figurinha",
};

export function MensagensAtendimento({ leadId, mensagens }: { leadId: string; mensagens: AtendimentoMensagem[] }) {
  const [erro, setErro] = useState<string | null>(null);
  if (mensagens.length === 0) {
    return (
      <p className="text-xs" style={{ color: "var(--shell-subtext)" }}>
        Nenhuma mensagem nesta conversa.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {erro && (
        <p className="text-xs" style={{ color: "#dc2626" }}>
          {erro}
        </p>
      )}
      {mensagens.map((m) => (
        <div key={m.id} className={"flex " + (m.direcao === "OUT" ? "justify-end" : "justify-start")}>
          <div
            className="max-w-[85%] rounded-xl border px-3 py-2 text-sm"
            style={
              m.direcao === "OUT"
                ? { background: "#dbeafe", borderColor: "#bfdbfe", color: "#172554" }
                : { background: "var(--shell-card-bg)", borderColor: "var(--shell-card-border)", color: "var(--shell-text)" }
            }
          >
            {m.midia && (
              <button
                type="button"
                onClick={() => abrirMidia(leadId, m.id).catch((e) => setErro(e?.message ?? "Falha ao abrir arquivo"))}
                className="block text-xs font-medium underline mb-1"
              >
                {MIDIA_LABEL[m.midia.tipo] ?? "📎 Arquivo"}
                {m.midia.nome ? ` · ${m.midia.nome}` : ""} (abrir)
              </button>
            )}
            {m.texto && <p className="whitespace-pre-wrap break-words">{m.texto}</p>}
            <p className="mt-1 text-[10px] opacity-70 text-right">
              {m.direcao === "IN" ? "Família" : m.autor ?? "Equipe"} · {formatDateTime(m.criadoEm)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

const btnPrimario = "px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50";
const btnSecundario = "px-4 py-2 rounded-lg text-sm font-medium border disabled:opacity-50";

/**
 * Substitui o "Sim, encerrar" simples quando o lead é família ativa na Pré-Ocupação.
 * Salvar registra o atendimento e encerra a conversa; "Não foi atendimento" só encerra.
 */
export function EncerrarConversaPreOcupacaoModal({
  leadId,
  familiaNumero,
  mensagens,
  onEncerrarSemRegistro,
  onRegistrado,
  onCancel,
}: {
  leadId: string;
  familiaNumero: number;
  mensagens: AtendimentoMensagem[];
  onEncerrarSemRegistro: () => Promise<void>;
  onRegistrado: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormValues>(FORM_VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  async function salvar() {
    const msg = validarForm(form);
    if (msg) return setErro(msg);
    setSalvando(true);
    setErro(null);
    try {
      await apiFetch(`/pre-ocupacao/leads/${leadId}/atendimentos`, { method: "POST", body: JSON.stringify(form) });
      setSalvo(true);
    } catch (e: any) {
      setErro(e?.message ?? "Erro ao registrar atendimento");
    } finally {
      setSalvando(false);
    }
  }

  async function encerrarSemRegistro() {
    setSalvando(true);
    setErro(null);
    try {
      await onEncerrarSemRegistro();
    } catch (e: any) {
      setErro(e?.message ?? "Erro ao encerrar conversa");
      setSalvando(false);
    }
  }

  if (salvo) {
    return (
      <Modal
        open
        onClose={onRegistrado}
        title="Atendimento registrado"
        size="sm"
        footer={
          <button onClick={onRegistrado} className={btnPrimario} style={{ background: "var(--via-teal, #1D9E75)", color: "#fff" }}>
            OK
          </button>
        }
      >
        <p className="text-sm" style={{ color: "var(--shell-text)" }}>
          ✅ Atendimento salvo na Pré-Ocupação (Família #{String(familiaNumero).padStart(4, "0")}) e conversa encerrada.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onCancel}
      size="lg"
      title="Encerrar conversa — família em Pré-Ocupação"
      description={`Este contato já está em Pré-Ocupação (Família #${String(familiaNumero).padStart(4, "0")}). Registre o motivo do atendimento.`}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2 w-full">
          <button
            onClick={encerrarSemRegistro}
            disabled={salvando}
            className={btnSecundario}
            style={{ borderColor: "var(--shell-card-border)", color: "var(--shell-subtext)" }}
            title="Bom dia, corrente, gif... encerra sem contar como atendimento"
          >
            Não foi atendimento — só encerrar
          </button>
          <div className="flex gap-2">
            <button onClick={onCancel} disabled={salvando} className={btnSecundario} style={{ borderColor: "var(--shell-card-border)", color: "var(--shell-text)" }}>
              Cancelar
            </button>
            <button onClick={salvar} disabled={salvando} className={btnPrimario} style={{ background: "var(--via-teal, #1D9E75)", color: "#fff" }}>
              {salvando ? "Salvando..." : "Salvar atendimento"}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <AtendimentoFormFields value={form} onChange={setForm} />
        {erro && (
          <p className="text-sm" style={{ color: "#dc2626" }}>
            {erro}
          </p>
        )}
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: "var(--shell-subtext)" }}>
            Mensagens trocadas nesta conversa ({mensagens.length})
          </p>
          <div
            className="max-h-72 overflow-y-auto rounded-lg border p-3"
            style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-bg)" }}
          >
            <MensagensAtendimento leadId={leadId} mensagens={mensagens} />
          </div>
        </div>
      </div>
    </Modal>
  );
}

function agoraLocalInput(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/** Atendimento presencial/telefone lançado dentro da família (sem conversa de WhatsApp). */
export function RegistrarAtendimentoModal({
  familiaId,
  onClose,
  onSalvo,
}: {
  familiaId: string;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const [form, setForm] = useState<FormValues>({ ...FORM_VAZIO, modalidade: "PRESENCIAL" });
  const [dataHora, setDataHora] = useState(agoraLocalInput);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  async function salvar() {
    const msg = validarForm(form);
    if (msg) return setErro(msg);
    if (!dataHora) return setErro("Informe a data e hora do atendimento.");
    setSalvando(true);
    setErro(null);
    try {
      const atendimento = await apiFetch(`/pre-ocupacao/familias/${familiaId}/atendimentos`, {
        method: "POST",
        body: JSON.stringify({ ...form, dataHora: new Date(dataHora).toISOString() }),
      });
      for (const file of arquivos) {
        const fd = new FormData();
        fd.append("file", file);
        await apiFetch(`/pre-ocupacao/atendimentos/${atendimento.id}/anexos`, { method: "POST", body: fd });
      }
      setSalvo(true);
    } catch (e: any) {
      setErro(e?.message ?? "Erro ao registrar atendimento");
    } finally {
      setSalvando(false);
    }
  }

  if (salvo) {
    return (
      <Modal
        open
        onClose={onSalvo}
        title="Atendimento registrado"
        size="sm"
        footer={
          <button onClick={onSalvo} className={btnPrimario} style={{ background: "var(--via-teal, #1D9E75)", color: "#fff" }}>
            OK
          </button>
        }
      >
        <p className="text-sm" style={{ color: "var(--shell-text)" }}>
          ✅ Atendimento salvo na Pré-Ocupação.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Registrar atendimento"
      description="Atendimento presencial ou por telefone com esta família."
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button onClick={onClose} disabled={salvando} className={btnSecundario} style={{ borderColor: "var(--shell-card-border)", color: "var(--shell-text)" }}>
            Cancelar
          </button>
          <button onClick={salvar} disabled={salvando} className={btnPrimario} style={{ background: "var(--via-teal, #1D9E75)", color: "#fff" }}>
            {salvando ? "Salvando..." : "Salvar atendimento"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: "var(--shell-subtext)" }}>
            Data e hora *
          </p>
          <input
            type="datetime-local"
            value={dataHora}
            max={agoraLocalInput()}
            onChange={(e) => setDataHora(e.target.value)}
            className={inputClass + " max-w-xs"}
          />
        </div>
        <AtendimentoFormFields value={form} onChange={setForm} />
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: "var(--shell-subtext)" }}>
            Anexos (foto, lista de presença...) — opcional
          </p>
          <input
            type="file"
            multiple
            onChange={(e) => setArquivos(Array.from(e.target.files ?? []))}
            className="text-sm"
            style={{ color: "var(--shell-text)" }}
          />
          {arquivos.length > 0 && (
            <p className="text-xs mt-1" style={{ color: "var(--shell-subtext)" }}>
              {arquivos.length} arquivo(s) selecionado(s)
            </p>
          )}
        </div>
        {erro && (
          <p className="text-sm" style={{ color: "#dc2626" }}>
            {erro}
          </p>
        )}
      </div>
    </Modal>
  );
}

/** Dados do atendimento + mensagens trocadas + atalho para a conversa completa no lead. */
export function AtendimentoDetalheModal({ atendimentoId, onClose }: { atendimentoId: string; onClose: () => void }) {
  const router = useRouter();
  const [data, setData] = useState<(Atendimento & { mensagens: AtendimentoMensagem[] }) | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    apiFetch(`/pre-ocupacao/atendimentos/${atendimentoId}`)
      .then(setData)
      .catch((e: any) => setErro(e?.message ?? "Erro ao carregar atendimento"));
  }, [atendimentoId]);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Atendimento"
      footer={
        <div className="flex flex-wrap justify-between gap-2 w-full">
          {data ? (
            <button
              onClick={() => startTransition(() => router.push(`/leads/${data.leadId}`))}
              className={btnPrimario}
              style={{ background: "var(--via-teal, #1D9E75)", color: "#fff" }}
            >
              Ver conversa completa no lead de venda →
            </button>
          ) : (
            <span />
          )}
          <button onClick={onClose} className={btnSecundario} style={{ borderColor: "var(--shell-card-border)", color: "var(--shell-text)" }}>
            Fechar
          </button>
        </div>
      }
    >
      {erro && (
        <p className="text-sm" style={{ color: "#dc2626" }}>
          {erro}
        </p>
      )}
      {!data && !erro && (
        <p className="text-sm" style={{ color: "var(--shell-subtext)" }}>
          Carregando...
        </p>
      )}
      {data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Info label="Data">{formatDateTime(data.inicioEm)}</Info>
            <Info label="Modalidade">{ATENDIMENTO_MODALIDADE_LABEL[data.modalidade] ?? data.modalidade}</Info>
            <Info label="Motivo">{ATENDIMENTO_MOTIVO_LABEL[data.motivo] ?? data.motivo}</Info>
            <Info label="Assunto">{ATENDIMENTO_ASSUNTO_LABEL[data.assunto] ?? data.assunto}</Info>
            <Info label="Atendido por">{data.atendidoPorNome || "—"}</Info>
            <Info label="Registro">{ATENDIMENTO_ORIGEM_LABEL[data.origem] ?? data.origem}</Info>
          </div>
          {data.descricao && <Info label="Descrição">{data.descricao}</Info>}
          {data.anexos.length > 0 && (
            <Info label="Anexos">
              <div className="flex flex-wrap gap-2 mt-1">
                {data.anexos.map((a) => (
                  <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="text-xs underline">
                    📎 {a.nome}
                  </a>
                ))}
              </div>
            </Info>
          )}
          {data.origem !== "MANUAL" && (
            <div>
              <p className="text-xs font-semibold mb-2" style={{ color: "var(--shell-subtext)" }}>
                Mensagens trocadas ({data.mensagens.length})
              </p>
              <div
                className="max-h-96 overflow-y-auto rounded-lg border p-3"
                style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-bg)" }}
              >
                <MensagensAtendimento leadId={data.leadId} mensagens={data.mensagens} />
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--shell-subtext)" }}>
        {label}
      </p>
      <div className="whitespace-pre-wrap" style={{ color: "var(--shell-text)" }}>
        {children}
      </div>
    </div>
  );
}
