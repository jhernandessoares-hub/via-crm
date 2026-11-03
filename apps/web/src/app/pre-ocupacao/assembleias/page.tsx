"use client";

import { useEffect, useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/lib/api";
import { useSP9Guard } from "../_lib/useSP9Guard";
import { useIsOwner } from "../_lib/useIsOwner";
import { formatDateTime } from "../_lib/constants";
import {
  ASSEMBLEIA_STATUS_LABEL,
  ASSEMBLEIA_STATUS_VARIANT,
  EDITAL_PADRAO,
  EDITAL_REUNIAO_PADRAO,
  ENCONTRO_LABEL,
  TEAL,
  TipoEncontro,
  btnPrimario,
  inputCls,
} from "../_lib/assembleia";

type Item = {
  id: string;
  tipo: TipoEncontro;
  titulo: string;
  status: string;
  empreendimento: string | null;
  dataPrimeiraConvocacao: string;
  totalItens: number;
  totalUnidades: number;
};

const TITULO_PADRAO: Record<TipoEncontro, string> = {
  ASSEMBLEIA: "Assembleia Geral de Instalação do Condomínio",
  REUNIAO: "Reunião do Condomínio",
};

export default function AssembleiasPage() {
  const guard = useSP9Guard();
  const router = useRouter();
  const isOwner = useIsOwner();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const [devs, setDevs] = useState<{ id: string; nome: string }[]>([]);
  const [form, setForm] = useState({
    tipo: "ASSEMBLEIA" as TipoEncontro,
    titulo: TITULO_PADRAO.ASSEMBLEIA,
    developmentId: "",
    primeira: "",
    linkVideo: "",
  });
  const [criando, setCriando] = useState(false);

  useEffect(() => {
    if (guard !== true) return;
    load();
  }, [guard]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setItems(await apiFetch("/pre-ocupacao/assembleias"));
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar assembleias e reuniões");
    } finally {
      setLoading(false);
    }
  }

  async function abrirNovo() {
    setNovoAberto(true);
    try {
      const lista = await apiFetch("/pre-ocupacao/assembleias/empreendimentos");
      setDevs(lista);
      if (lista.length === 1) setForm((f) => ({ ...f, developmentId: lista[0].id }));
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar empreendimentos");
    }
  }

  async function criar() {
    if (!form.titulo.trim() || !form.developmentId || !form.primeira) return;
    setCriando(true);
    try {
      const primeira = new Date(form.primeira);
      const a = await apiFetch("/pre-ocupacao/assembleias", {
        method: "POST",
        body: JSON.stringify({
          tipo: form.tipo,
          titulo: form.titulo.trim(),
          developmentId: form.developmentId,
          dataPrimeiraConvocacao: primeira.toISOString(),
          dataSegundaConvocacao: new Date(primeira.getTime() + 30 * 60_000).toISOString(),
          linkVideo: form.linkVideo.trim(),
          edital: form.tipo === "REUNIAO" ? EDITAL_REUNIAO_PADRAO : EDITAL_PADRAO,
        }),
      });
      startTransition(() => router.push(`/pre-ocupacao/assembleias/${a.id}`));
    } catch (e: any) {
      setError(e?.message ?? "Erro ao criar");
      setCriando(false);
    }
  }

  if (guard === null) return null;

  return (
    <AppShell title="Pré-Ocupação — Assembleias e Reuniões">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "var(--shell-text)" }}>
              Assembleias e Reuniões
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--shell-subtext)" }}>
              Convoque as unidades e confirme a presença por CPF. Nas assembleias, conduza a votação item a item.
            </p>
          </div>
          {isOwner && (
            <button onClick={abrirNovo} className={btnPrimario} style={{ background: TEAL }}>
              Nova assembleia ou reunião
            </button>
          )}
        </div>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {loading ? (
          <p className="text-sm" style={{ color: "var(--shell-subtext)" }}>Carregando...</p>
        ) : items.length === 0 ? (
          <Card>
            <CardBody>
              <p className="text-sm" style={{ color: "var(--shell-subtext)" }}>
                Nenhuma assembleia ou reunião criada ainda.
              </p>
            </CardBody>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((a) => (
              <button
                key={a.id}
                onClick={() => startTransition(() => router.push(`/pre-ocupacao/assembleias/${a.id}`))}
                className="text-left"
              >
                <Card className="h-full hover:shadow-md transition-shadow">
                  <CardBody>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--shell-subtext)" }}>
                          {ENCONTRO_LABEL[a.tipo] ?? a.tipo}
                        </p>
                        <p className="font-semibold" style={{ color: "var(--shell-text)" }}>{a.titulo}</p>
                      </div>
                      <Badge variant={ASSEMBLEIA_STATUS_VARIANT[a.status] ?? "neutral"}>
                        {ASSEMBLEIA_STATUS_LABEL[a.status] ?? a.status}
                      </Badge>
                    </div>
                    <p className="text-xs" style={{ color: "var(--shell-subtext)" }}>
                      {a.empreendimento ?? "—"} · {formatDateTime(a.dataPrimeiraConvocacao)}
                    </p>
                    <p className="text-xs mt-2" style={{ color: "var(--shell-subtext)" }}>
                      {a.totalItens} {a.tipo === "REUNIAO" ? "assunto(s)" : "item(ns) na pauta"} · {a.totalUnidades} unidades
                    </p>
                  </CardBody>
                </Card>
              </button>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={novoAberto}
        onClose={() => setNovoAberto(false)}
        title="Nova assembleia ou reunião"
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
              disabled={criando || !form.titulo.trim() || !form.developmentId || !form.primeira}
              className={btnPrimario}
              style={{ background: TEAL }}
            >
              {criando ? "Criando..." : form.tipo === "REUNIAO" ? "Criar e montar os assuntos" : "Criar e montar a pauta"}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(["ASSEMBLEIA", "REUNIAO"] as TipoEncontro[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    tipo: t,
                    // Troca o título só se ainda for o sugerido
                    titulo: Object.values(TITULO_PADRAO).includes(f.titulo) ? TITULO_PADRAO[t] : f.titulo,
                  }))
                }
                className="rounded-lg border p-3 text-left"
                style={{ borderColor: form.tipo === t ? TEAL : "var(--shell-card-border)" }}
              >
                <p className="text-sm font-semibold" style={{ color: "var(--shell-text)" }}>{ENCONTRO_LABEL[t]}</p>
                <p className="text-xs" style={{ color: "var(--shell-subtext)" }}>
                  {t === "ASSEMBLEIA" ? "Com votação e quórum (instalação, ordinária, extraordinária)" : "Sem votação: conselho, síndico, moradores"}
                </p>
              </button>
            ))}
          </div>
          <label className="block text-xs font-medium" style={{ color: "var(--shell-subtext)" }}>
            Título
            <input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} className={inputCls} />
          </label>
          <label className="block text-xs font-medium" style={{ color: "var(--shell-subtext)" }}>
            Empreendimento (todas as unidades dele são convocadas)
            <select
              value={form.developmentId}
              onChange={(e) => setForm({ ...form, developmentId: e.target.value })}
              className={inputCls}
            >
              <option value="">Escolha...</option>
              {devs.map((d) => (
                <option key={d.id} value={d.id}>{d.nome}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium" style={{ color: "var(--shell-subtext)" }}>
            {form.tipo === "REUNIAO" ? "Data e hora" : "Data e hora da 1ª convocação (a 2ª fica 30 min depois; dá para mudar depois)"}
            <input
              type="datetime-local"
              value={form.primeira}
              onChange={(e) => setForm({ ...form, primeira: e.target.value })}
              className={inputCls}
            />
          </label>
          <label className="block text-xs font-medium" style={{ color: "var(--shell-subtext)" }}>
            Link da sala de vídeo (Meet, Zoom ou Teams)
            <input
              value={form.linkVideo}
              placeholder="https://meet.google.com/..."
              onChange={(e) => setForm({ ...form, linkVideo: e.target.value })}
              className={inputCls}
            />
          </label>
        </div>
      </Modal>
    </AppShell>
  );
}
