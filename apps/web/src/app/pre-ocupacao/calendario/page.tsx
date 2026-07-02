"use client";

import { useEffect, useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { Card, CardBody } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/lib/api";
import { useSP9Guard } from "../_lib/useSP9Guard";
import { CATEGORIA_OPTIONS, formatDateTime } from "../_lib/constants";

type Sessao = {
  id: string;
  categoria: string;
  categoriaLabel: string;
  dataAgendada: string;
  local: string | null;
  titulo: string | null;
  totalFamilias: number;
  concluidas: number;
};

type FamiliaOption = { id: string; numero: number; nome: string };

export default function CalendarioPage() {
  const guard = useSP9Guard();
  const router = useRouter();

  const [items, setItems] = useState<Sessao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (guard !== true) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guard]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/pre-ocupacao/atividades");
      setItems(res);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar sessões");
    } finally {
      setLoading(false);
    }
  }

  if (guard === null) return null;

  return (
    <AppShell title="Pré-Ocupação — Calendário">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "var(--shell-text)" }}>
              Calendário de Sessões
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--shell-subtext)" }}>
              Sessões do Trabalho Técnico Social com as famílias.
            </p>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: "var(--via-teal, #1D9E75)", color: "#fff" }}
          >
            + Nova sessão
          </button>
        </div>

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
                <p style={{ color: "var(--shell-subtext)" }}>Nenhuma sessão agendada ainda.</p>
              </CardBody>
            </Card>
          )}
          {!loading && items.map((s) => (
            <Card
              key={s.id}
              className="cursor-pointer transition-colors hover:bg-[var(--shell-hover)]"
              onClick={() => startTransition(() => router.push(`/pre-ocupacao/calendario/${s.id}`))}
            >
              <CardBody className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium" style={{ color: "var(--shell-text)" }}>
                    {s.categoriaLabel}
                    {s.titulo ? ` — ${s.titulo}` : ""}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--shell-subtext)" }}>
                    {formatDateTime(s.dataAgendada)}
                    {s.local ? ` · ${s.local}` : ""}
                  </p>
                </div>
                <p className="text-sm font-medium shrink-0" style={{ color: "var(--shell-text)" }}>
                  {s.concluidas} de {s.totalFamilias} famílias já pontuaram
                </p>
              </CardBody>
            </Card>
          ))}
        </div>
      </div>

      {createOpen && (
        <NovaSessaoModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            load();
          }}
        />
      )}
    </AppShell>
  );
}

function NovaSessaoModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [categoria, setCategoria] = useState(CATEGORIA_OPTIONS[0]?.value ?? "");
  const [dataAgendada, setDataAgendada] = useState("");
  const [local, setLocal] = useState("");
  const [titulo, setTitulo] = useState("");
  const [prazoPreenchimentoDias, setPrazoPreenchimentoDias] = useState("");
  const [familias, setFamilias] = useState<FamiliaOption[]>([]);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [loadingFamilias, setLoadingFamilias] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/pre-ocupacao/familias")
      .then((res) => {
        const opts: FamiliaOption[] = (res.items ?? []).map((f: any) => ({ id: f.id, numero: f.numero, nome: f.nome }));
        setFamilias(opts);
      })
      .catch(() => {})
      .finally(() => setLoadingFamilias(false));
  }, []);

  function toggleFamilia(id: string) {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    if (!categoria || !dataAgendada) {
      setError("Categoria e data são obrigatórias.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiFetch("/pre-ocupacao/atividades", {
        method: "POST",
        body: JSON.stringify({
          categoria,
          dataAgendada: new Date(dataAgendada).toISOString(),
          local: local.trim() || undefined,
          titulo: titulo.trim() || undefined,
          prazoPreenchimentoDias: prazoPreenchimentoDias ? Number(prazoPreenchimentoDias) : undefined,
          familiaIds: selecionadas.size > 0 ? [...selecionadas] : undefined,
        }),
      });
      onCreated();
    } catch (e: any) {
      setError(e?.message ?? "Erro ao criar sessão");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Nova sessão"
      description="Se nenhuma família for selecionada, todas as famílias ativas serão incluídas."
      size="lg"
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
            {loading ? "Criando..." : "Criar sessão"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--shell-subtext)" }}>Categoria *</label>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="w-full h-10 rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)]"
            >
              {CATEGORIA_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--shell-subtext)" }}>Data e hora *</label>
            <input
              type="datetime-local"
              value={dataAgendada}
              onChange={(e) => setDataAgendada(e.target.value)}
              className="w-full h-10 rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)]"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--shell-subtext)" }}>Local</label>
            <input
              type="text"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              className="w-full h-10 rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--shell-subtext)" }}>Prazo p/ preenchimento (dias)</label>
            <input
              type="number"
              min={1}
              value={prazoPreenchimentoDias}
              onChange={(e) => setPrazoPreenchimentoDias(e.target.value)}
              placeholder="5 (padrão)"
              className="w-full h-10 rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)]"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--shell-subtext)" }}>Título (opcional)</label>
          <input
            type="text"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            className="w-full h-10 rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)]"
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--shell-subtext)" }}>
            Famílias participantes ({selecionadas.size > 0 ? `${selecionadas.size} selecionada(s)` : "todas as ativas"})
          </label>
          <div
            className="max-h-48 overflow-y-auto rounded-lg border p-2 space-y-1"
            style={{ borderColor: "var(--shell-card-border)" }}
          >
            {loadingFamilias && <p className="text-xs" style={{ color: "var(--shell-subtext)" }}>Carregando famílias...</p>}
            {!loadingFamilias && familias.length === 0 && (
              <p className="text-xs" style={{ color: "var(--shell-subtext)" }}>Nenhuma família disponível.</p>
            )}
            {familias.map((f) => (
              <label key={f.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={selecionadas.has(f.id)}
                  onChange={() => toggleFamilia(f.id)}
                />
                <span style={{ color: "var(--shell-text)" }}>
                  #{String(f.numero).padStart(4, "0")} — {f.nome}
                </span>
              </label>
            ))}
          </div>
        </div>

        {error && <p className="text-sm" style={{ color: "#dc2626" }}>{error}</p>}
      </div>
    </Modal>
  );
}
