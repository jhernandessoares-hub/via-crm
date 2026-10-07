"use client";

import { useEffect, useState, startTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { apiFetch } from "@/lib/api";
import { formatLeadNumber } from "@/lib/format-lead-number";
import { maskPhone } from "@/lib/format";
import { useSP9Guard } from "../../_lib/useSP9Guard";
import {
  CATEGORIA_LABEL,
  OCORRENCIA_STATUS_LABEL,
  PARTICIPANTE_STATUS_LABEL,
  FAMILIA_STATUS_LABEL,
  formatDate,
  formatDateTime,
  ATENDIMENTO_ASSUNTO_LABEL,
  ATENDIMENTO_MODALIDADE_LABEL,
  ATENDIMENTO_MOTIVO_LABEL,
} from "../../_lib/constants";
import { Atendimento, AtendimentoDetalheModal, RegistrarAtendimentoModal } from "../../_lib/atendimento";

type Participacao = {
  id: string;
  atividadeId: string;
  status: string;
  preenchidoEm: string | null;
  avaliacao: string | null;
  atividade: { id: string; categoria: string; dataAgendada: string; titulo: string | null; local: string | null };
};

type Ocorrencia = {
  id: string;
  numero: number;
  titulo: string;
  status: string;
  abertaEm: string;
  encerradaEm: string | null;
  avaliacao: string | null;
};

type Detalhe = {
  familia: {
    id: string;
    leadId: string;
    numero: number;
    status: string;
    ativadoEm: string;
    ativadoPor: string;
    lead: {
      id: string;
      nome: string;
      nomeCorreto: string | null;
      cpf: string | null;
      telefone: string | null;
      numero: number | null;
      reentradaCount: number | null;
    };
  };
  status: "EM_DIA" | "COM_PENDENCIA";
  faltas: number;
  empreendimento: string | null;
  unidade: string | null;
  participacoes: Participacao[];
  ocorrencias: Ocorrencia[];
};

export default function FamiliaDetalhePage() {
  const guard = useSP9Guard();
  const router = useRouter();
  const params = useParams();
  const familiaId = params?.familiaId as string;

  const [data, setData] = useState<Detalhe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [atendimentoAberto, setAtendimentoAberto] = useState<string | null>(null);
  const [registrarOpen, setRegistrarOpen] = useState(false);

  useEffect(() => {
    if (guard !== true || !familiaId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guard, familiaId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [res, lista] = await Promise.all([
        apiFetch(`/pre-ocupacao/familias/${familiaId}`),
        apiFetch(`/pre-ocupacao/familias/${familiaId}/atendimentos`),
      ]);
      setData(res);
      setAtendimentos(lista);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar família");
    } finally {
      setLoading(false);
    }
  }

  if (guard === null) return null;

  return (
    <AppShell title="Pré-Ocupação — Família">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <button
          onClick={() => startTransition(() => router.push("/pre-ocupacao/familias"))}
          className="text-sm mb-4"
          style={{ color: "var(--shell-subtext)" }}
        >
          ← Voltar para Famílias
        </button>

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
                <div className="flex items-start justify-between">
                  <div>
                    <h1 className="text-xl font-bold" style={{ color: "var(--shell-text)" }}>
                      Família #{String(data.familia.numero).padStart(4, "0")} — {data.familia.lead.nomeCorreto ?? data.familia.lead.nome}
                    </h1>
                    <p className="text-sm mt-1" style={{ color: "var(--shell-subtext)" }}>
                      {data.familia.lead.cpf ? `CPF: ${data.familia.lead.cpf}` : "CPF não informado"}
                      {data.familia.lead.telefone ? ` · ${maskPhone(data.familia.lead.telefone)}` : " · Telefone não informado"}
                    </p>
                    <p className="text-sm mt-1" style={{ color: "var(--shell-subtext)" }}>
                      {data.empreendimento ? `${data.empreendimento} · Unidade ${data.unidade}` : "Empreendimento/Unidade não vinculados"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge variant={data.status === "EM_DIA" ? "success" : "error"}>
                      {data.status === "EM_DIA" ? "Em dia" : "Com pendência"}
                    </Badge>
                    <Badge variant="default">{FAMILIA_STATUS_LABEL[data.familia.status] ?? data.familia.status}</Badge>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-4 text-xs" style={{ color: "var(--shell-subtext)" }}>
                  <span>Incluída em {formatDate(data.familia.ativadoEm)} por {data.familia.ativadoPor}</span>
                  <span>Faltas: {data.faltas}</span>
                </div>
                <div className="mt-4">
                  <Link
                    href={`/leads/${data.familia.leadId}`}
                    className="inline-block px-4 py-2 rounded-lg text-sm font-medium"
                    style={{ background: "var(--via-teal, #1D9E75)", color: "#fff" }}
                  >
                    Ir até o lead de venda{" "}
                    {formatLeadNumber(data.familia.lead.numero, data.familia.lead.reentradaCount) &&
                      `#${formatLeadNumber(data.familia.lead.numero, data.familia.lead.reentradaCount)}`}{" "}
                    →
                  </Link>
                </div>
              </CardBody>
            </Card>

            <Card className="mb-4">
              <CardHeader className="flex items-center justify-between">
                <CardTitle>Atendimentos ({atendimentos.length})</CardTitle>
                <button
                  onClick={() => setRegistrarOpen(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: "var(--via-teal, #1D9E75)", color: "#fff" }}
                >
                  + Registrar atendimento
                </button>
              </CardHeader>
              <CardBody className="space-y-2">
                {atendimentos.length === 0 && (
                  <p className="text-sm" style={{ color: "var(--shell-subtext)" }}>
                    Nenhum atendimento registrado para esta família.
                  </p>
                )}
                {atendimentos.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setAtendimentoAberto(a.id)}
                    className="w-full text-left flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-[var(--shell-hover)]"
                    style={{ borderColor: "var(--shell-card-border)" }}
                  >
                    <div className="min-w-0">
                      <p className="font-medium" style={{ color: "var(--shell-text)" }}>
                        {ATENDIMENTO_MOTIVO_LABEL[a.motivo] ?? a.motivo} — {ATENDIMENTO_ASSUNTO_LABEL[a.assunto] ?? a.assunto}
                      </p>
                      <p className="text-xs" style={{ color: "var(--shell-subtext)" }}>
                        {formatDateTime(a.inicioEm)}
                        {a.atendidoPorNome ? ` · ${a.atendidoPorNome}` : ""}
                      </p>
                      {a.descricao && (
                        <p className="text-xs mt-0.5 truncate" style={{ color: "var(--shell-subtext)" }}>
                          {a.descricao}
                        </p>
                      )}
                    </div>
                    <Badge variant="default">{ATENDIMENTO_MODALIDADE_LABEL[a.modalidade] ?? a.modalidade}</Badge>
                  </button>
                ))}
              </CardBody>
            </Card>

            <Card className="mb-4">
              <CardHeader>
                <CardTitle>Histórico de participações em sessões</CardTitle>
              </CardHeader>
              <CardBody className="space-y-2">
                {data.participacoes.length === 0 && (
                  <p className="text-sm" style={{ color: "var(--shell-subtext)" }}>
                    Nenhuma participação registrada ainda.
                  </p>
                )}
                {data.participacoes.map((p) => (
                  <Link
                    key={p.id}
                    href={`/pre-ocupacao/calendario/${p.atividadeId}`}
                    className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-[var(--shell-hover)]"
                    style={{ borderColor: "var(--shell-card-border)" }}
                  >
                    <div>
                      <p className="font-medium" style={{ color: "var(--shell-text)" }}>
                        {CATEGORIA_LABEL[p.atividade.categoria] ?? p.atividade.categoria}
                        {p.atividade.titulo ? ` — ${p.atividade.titulo}` : ""}
                      </p>
                      <p className="text-xs" style={{ color: "var(--shell-subtext)" }}>
                        {formatDateTime(p.atividade.dataAgendada)}
                        {p.atividade.local ? ` · ${p.atividade.local}` : ""}
                      </p>
                    </div>
                    <Badge variant={p.status === "FALTOU" ? "error" : p.status === "CONCLUIDA" ? "success" : p.status === "PENDENTE" ? "warning" : "default"}>
                      {PARTICIPANTE_STATUS_LABEL[p.status] ?? p.status}
                    </Badge>
                  </Link>
                ))}
              </CardBody>
            </Card>

            <Card>
              <CardHeader className="flex items-center justify-between">
                <CardTitle>Demandas desta família</CardTitle>
                <button
                  onClick={() =>
                    startTransition(() =>
                      router.push(`/pre-ocupacao/demandas?criar=1&familiaId=${data.familia.id}&leadId=${data.familia.leadId}`)
                    )
                  }
                  className="px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: "var(--via-teal, #1D9E75)", color: "#fff" }}
                >
                  + Criar demanda
                </button>
              </CardHeader>
              <CardBody className="space-y-2">
                {data.ocorrencias.length === 0 && (
                  <p className="text-sm" style={{ color: "var(--shell-subtext)" }}>
                    Nenhuma demanda registrada para esta família.
                  </p>
                )}
                {data.ocorrencias.map((o) => (
                  <Link
                    key={o.id}
                    href={`/pre-ocupacao/demandas/${o.id}`}
                    className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-[var(--shell-hover)]"
                    style={{ borderColor: "var(--shell-card-border)" }}
                  >
                    <div>
                      <p className="font-medium" style={{ color: "var(--shell-text)" }}>
                        #{o.numero} — {o.titulo}
                      </p>
                      <p className="text-xs" style={{ color: "var(--shell-subtext)" }}>
                        Aberta em {formatDate(o.abertaEm)}
                        {o.encerradaEm ? ` · Encerrada em ${formatDate(o.encerradaEm)}` : ""}
                      </p>
                    </div>
                    <Badge variant={o.status === "ABERTA" ? "warning" : "default"}>
                      {OCORRENCIA_STATUS_LABEL[o.status] ?? o.status}
                    </Badge>
                  </Link>
                ))}
              </CardBody>
            </Card>
          </>
        )}
      </div>

      {atendimentoAberto && (
        <AtendimentoDetalheModal atendimentoId={atendimentoAberto} onClose={() => setAtendimentoAberto(null)} />
      )}
      {registrarOpen && data && (
        <RegistrarAtendimentoModal
          familiaId={data.familia.id}
          onClose={() => setRegistrarOpen(false)}
          onSalvo={() => {
            setRegistrarOpen(false);
            load();
          }}
        />
      )}
    </AppShell>
  );
}
