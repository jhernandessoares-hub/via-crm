"use client";

import { useEffect, useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/lib/api";
import { useSP9Guard } from "../_lib/useSP9Guard";
import { formatDate } from "../_lib/constants";
import { QUESTIONARIO_STATUS_LABEL, QUESTIONARIO_STATUS_VARIANT } from "../_lib/questionario";

type Item = {
  id: string;
  titulo: string;
  descricao: string | null;
  status: string;
  criadoEm: string;
  totalPerguntas: number;
  totalEnvios: number;
  enviados: number;
  respondidos: number;
};

export default function QuestionariosPage() {
  const guard = useSP9Guard();
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [criando, setCriando] = useState(false);

  useEffect(() => {
    if (guard !== true) return;
    load();
  }, [guard]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setItems(await apiFetch("/pre-ocupacao/questionarios"));
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar questionários");
    } finally {
      setLoading(false);
    }
  }

  async function criar() {
    if (!titulo.trim()) return;
    setCriando(true);
    try {
      const q = await apiFetch("/pre-ocupacao/questionarios", {
        method: "POST",
        body: JSON.stringify({ titulo: titulo.trim() }),
      });
      startTransition(() => router.push(`/pre-ocupacao/questionarios/${q.id}`));
    } catch (e: any) {
      setError(e?.message ?? "Erro ao criar questionário");
      setCriando(false);
    }
  }

  if (guard === null) return null;

  return (
    <AppShell title="Pré-Ocupação — Questionários">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "var(--shell-text)" }}>
              Questionários
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--shell-subtext)" }}>
              Envie questionários às famílias pelo WhatsApp e acompanhe as respostas.
            </p>
          </div>
          <button
            onClick={() => {
              setTitulo("");
              setNovoAberto(true);
            }}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: "var(--via-teal, #1D9E75)" }}
          >
            Novo questionário
          </button>
        </div>

        {error && (
          <p className="mb-4 text-sm text-red-600">{error}</p>
        )}

        {loading ? (
          <p className="text-sm" style={{ color: "var(--shell-subtext)" }}>Carregando...</p>
        ) : items.length === 0 ? (
          <Card>
            <CardBody>
              <p className="text-sm" style={{ color: "var(--shell-subtext)" }}>
                Nenhum questionário criado ainda. Clique em &ldquo;Novo questionário&rdquo; para começar.
              </p>
            </CardBody>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((q) => {
              const pct = q.totalEnvios ? Math.round((q.respondidos / q.totalEnvios) * 100) : 0;
              return (
                <button
                  key={q.id}
                  onClick={() => startTransition(() => router.push(`/pre-ocupacao/questionarios/${q.id}`))}
                  className="text-left"
                >
                  <Card className="h-full hover:shadow-md transition-shadow">
                    <CardBody>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="font-semibold" style={{ color: "var(--shell-text)" }}>{q.titulo}</p>
                        <Badge variant={QUESTIONARIO_STATUS_VARIANT[q.status] ?? "neutral"}>
                          {QUESTIONARIO_STATUS_LABEL[q.status] ?? q.status}
                        </Badge>
                      </div>
                      <p className="text-xs mb-4" style={{ color: "var(--shell-subtext)" }}>
                        {q.totalPerguntas} pergunta(s) · criado em {formatDate(q.criadoEm)}
                      </p>
                      <div className="flex items-baseline justify-between text-xs mb-1" style={{ color: "var(--shell-subtext)" }}>
                        <span>
                          <strong style={{ color: "var(--shell-text)" }}>{q.respondidos}</strong> de {q.totalEnvios} responderam
                        </span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--shell-hover)" }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--via-teal, #1D9E75)" }} />
                      </div>
                    </CardBody>
                  </Card>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        open={novoAberto}
        onClose={() => setNovoAberto(false)}
        title="Novo questionário"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setNovoAberto(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--shell-card-border)]"
              style={{ color: "var(--shell-text)" }}
            >
              Cancelar
            </button>
            <button
              onClick={criar}
              disabled={criando || !titulo.trim()}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--via-teal, #1D9E75)" }}
            >
              {criando ? "Criando..." : "Criar e adicionar perguntas"}
            </button>
          </div>
        }
      >
        <label className="block text-xs font-medium" style={{ color: "var(--shell-subtext)" }}>
          Título
          <input
            autoFocus
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && criar()}
            placeholder="Ex.: Pesquisa de perfil socioeconômico"
            className="block w-full mt-1 h-10 rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)] outline-none"
          />
        </label>
      </Modal>
    </AppShell>
  );
}
