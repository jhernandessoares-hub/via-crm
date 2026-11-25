"use client";

import { useEffect, useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { Card, CardBody } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/lib/api";
import { useSP9Guard } from "../_lib/useSP9Guard";
import { usePodeLancar } from "../_lib/usePodeLancar";
import { CATEGORIA_OPTIONS, formatDate, formatDateTime } from "../_lib/constants";
import { ColarLista } from "../_lib/ColarLista";
import { FamiliaLista } from "../_lib/casar-lista";
import { QuadroPresenca } from "./QuadroPresenca";

type Atividade = {
  id: string;
  categoria: string;
  categoriaLabel: string;
  dataAgendada: string;
  local: string | null;
  titulo: string | null;
  totalFamilias: number;
  concluidas: number;
  faltas: number;
  reposicoes: number;
  semLancamento: number;
};

function Numero({ valor, rotulo, cor }: { valor: number; rotulo: string; cor: string }) {
  return (
    <div className="text-center min-w-[72px]">
      <p className="text-xl font-bold leading-tight" style={{ color: cor }}>{valor}</p>
      <p className="text-xs" style={{ color: "var(--shell-subtext)" }}>{rotulo}</p>
    </div>
  );
}

export default function AtividadesPage() {
  const guard = useSP9Guard();
  const router = useRouter();
  const podeLancar = usePodeLancar();

  const [aba, setAba] = useState<"atividades" | "quadro">("atividades");
  const [items, setItems] = useState<Atividade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (guard !== true) return;
    load();
  }, [guard]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setItems(await apiFetch("/pre-ocupacao/atividades"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar atividades");
    } finally {
      setLoading(false);
    }
  }

  if (guard === null) return null;

  return (
    <AppShell title="Pré-Ocupação — Atividades e Presença">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "var(--shell-text)" }}>Atividades e Presença</h1>
            <p className="text-sm mt-1" style={{ color: "var(--shell-subtext)" }}>
              Reuniões e oficinas do Trabalho Técnico Social, e quem compareceu em cada uma.
            </p>
          </div>
          {podeLancar && (
            <button
              onClick={() => setCreateOpen(true)}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: "var(--via-teal, #1D9E75)", color: "#fff" }}
            >
              + Nova atividade
            </button>
          )}
        </div>

        <div className="flex gap-2 mb-4">
          {([["atividades", "Atividades"], ["quadro", "Quadro de presença"]] as const).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setAba(k)}
              className="px-4 py-2 rounded-lg text-sm font-medium border"
              style={{
                borderColor: aba === k ? "var(--via-teal, #1D9E75)" : "var(--shell-card-border)",
                color: aba === k ? "var(--via-teal, #1D9E75)" : "var(--shell-text)",
              }}
            >
              {l}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-md px-4 py-3 text-sm" style={{ background: "#fef2f2", color: "#dc2626" }}>
            {error}
          </div>
        )}

        {aba === "quadro" && <QuadroPresenca />}

        {aba === "atividades" && (
          <div className="space-y-2">
            {loading && <p style={{ color: "var(--shell-subtext)" }}>Carregando...</p>}
            {!loading && items.length === 0 && (
              <Card>
                <CardBody className="text-center py-8">
                  <p style={{ color: "var(--shell-subtext)" }}>Nenhuma atividade cadastrada ainda.</p>
                </CardBody>
              </Card>
            )}
            {!loading && items.map((s) => {
              const futura = new Date(s.dataAgendada) > new Date();
              return (
                <Card
                  key={s.id}
                  className="cursor-pointer transition-colors hover:bg-[var(--shell-hover)]"
                  onClick={() => startTransition(() => router.push(`/pre-ocupacao/calendario/${s.id}`))}
                >
                  <CardBody className="flex flex-wrap items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium" style={{ color: "var(--shell-text)" }}>
                        {formatDate(s.dataAgendada)} · {s.titulo || s.categoriaLabel}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--shell-subtext)" }}>
                        {s.titulo ? `${s.categoriaLabel} · ` : ""}
                        {formatDateTime(s.dataAgendada)}
                        {s.local ? ` · ${s.local}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3 shrink-0">
                      <Numero valor={s.totalFamilias} rotulo="convocadas" cor="var(--shell-text)" />
                      {!futura && (
                        <>
                          <Numero valor={s.concluidas} rotulo="presentes" cor="#16a34a" />
                          <Numero valor={s.faltas} rotulo="faltas" cor="#dc2626" />
                          <Numero valor={s.reposicoes} rotulo="reposição" cor="#b45309" />
                          {s.semLancamento > 0 && (
                            <Numero valor={s.semLancamento} rotulo="sem lançamento" cor="var(--shell-subtext)" />
                          )}
                        </>
                      )}
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {createOpen && (
        <NovaAtividadeModal
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false);
            startTransition(() => router.push(`/pre-ocupacao/calendario/${id}`));
          }}
        />
      )}
    </AppShell>
  );
}

const CAMPO =
  "w-full h-10 rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)]";

function NovaAtividadeModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [categoria, setCategoria] = useState("");
  const [dataAgendada, setDataAgendada] = useState("");
  const [local, setLocal] = useState("");
  const [titulo, setTitulo] = useState("");
  // Sem padrão: quem não foi convocado não pode levar falta, então a escolha é obrigatória
  const [publico, setPublico] = useState<"" | "todas" | "escolher">("");
  const [familias, setFamilias] = useState<FamiliaLista[]>([]);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [loadingFamilias, setLoadingFamilias] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/pre-ocupacao/atividades/familias-para-lista")
      .then((res: FamiliaLista[]) => setFamilias(res))
      .catch(() => setError("Não foi possível carregar as famílias."))
      .finally(() => setLoadingFamilias(false));
  }, []);

  function toggle(id: string) {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const convocadas = publico === "todas" ? familias.map((f) => f.familiaId) : publico === "escolher" ? [...selecionadas] : [];
  const pronto = !!categoria && !!dataAgendada && convocadas.length > 0;
  const termo = busca.trim().toLowerCase();
  const lista = familias.filter((f) => !termo || f.nome.toLowerCase().includes(termo) || String(f.numero).includes(termo));

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      const criada = await apiFetch("/pre-ocupacao/atividades", {
        method: "POST",
        body: JSON.stringify({
          categoria,
          dataAgendada: new Date(dataAgendada).toISOString(),
          local: local.trim() || undefined,
          titulo: titulo.trim() || undefined,
          familiaIds: convocadas,
        }),
      });
      onCreated(criada.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar atividade");
      setLoading(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Nova atividade"
      description="Pode ser uma atividade que já aconteceu ou que ainda vai acontecer. Nada é enviado às famílias."
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
            disabled={loading || !pronto}
            className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--via-teal, #1D9E75)", color: "#fff" }}
          >
            {loading ? "Criando..." : convocadas.length ? `Criar com ${convocadas.length} famílias` : "Criar atividade"}
          </button>
        </>
      }
    >
      <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block text-xs font-medium" style={{ color: "var(--shell-subtext)" }}>
            Tipo *
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={`${CAMPO} mt-1`}>
              <option value="">Escolha...</option>
              {CATEGORIA_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium" style={{ color: "var(--shell-subtext)" }}>
            Data e hora *
            <input type="datetime-local" value={dataAgendada} onChange={(e) => setDataAgendada(e.target.value)} className={`${CAMPO} mt-1`} />
          </label>
          <label className="block text-xs font-medium" style={{ color: "var(--shell-subtext)" }}>
            Título
            <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: 1ª reunião com as famílias" className={`${CAMPO} mt-1`} />
          </label>
          <label className="block text-xs font-medium" style={{ color: "var(--shell-subtext)" }}>
            Local
            <input type="text" value={local} onChange={(e) => setLocal(e.target.value)} className={`${CAMPO} mt-1`} />
          </label>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium" style={{ color: "var(--shell-subtext)" }}>
            Quem foi convocado? * (só quem foi convocado pode ter falta)
          </p>
          {loadingFamilias ? (
            <p className="text-sm" style={{ color: "var(--shell-subtext)" }}>Carregando famílias...</p>
          ) : (
            <div className="flex flex-wrap gap-4 text-sm" style={{ color: "var(--shell-text)" }}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="publico" checked={publico === "todas"} onChange={() => setPublico("todas")} />
                Todas as famílias ativas ({familias.length})
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="publico" checked={publico === "escolher"} onChange={() => setPublico("escolher")} />
                Só algumas ({selecionadas.size} escolhidas)
              </label>
            </div>
          )}

          {publico === "escolher" && (
            <div className="space-y-3">
              <ColarLista
                familias={familias}
                rotuloAplicar={(n) => `Marcar ${n} famílias como convocadas`}
                onAplicar={(ids) => setSelecionadas((prev) => new Set([...prev, ...ids]))}
              />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Ou busque por nome ou número da família..."
                className={CAMPO}
              />
              <div className="max-h-48 overflow-y-auto rounded-lg border p-2 space-y-1" style={{ borderColor: "var(--shell-card-border)" }}>
                {lista.map((f) => (
                  <label key={f.familiaId} className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--shell-text)" }}>
                    <input type="checkbox" checked={selecionadas.has(f.familiaId)} onChange={() => toggle(f.familiaId)} />
                    <span><b>{String(f.numero).padStart(4, "0")}</b> {f.nome}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && <p className="text-sm" style={{ color: "#dc2626" }}>{error}</p>}
      </div>
    </Modal>
  );
}
