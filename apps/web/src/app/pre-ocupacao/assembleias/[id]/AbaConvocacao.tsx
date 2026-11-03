"use client";

import { useMemo, useState } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { formatDateTime } from "../../_lib/constants";
import { AbaProps, AssembleiaUnidade, ENVIO_LABEL, TEAL, btnPrimario, btnSecundario, inputCls, nomeUnidade } from "../../_lib/assembleia";
import type { PedidoConfirmacao } from "./Confirmar";

type Filtro = "TODAS" | "NAO_CONVOCADA" | "FALHA" | "NAO_ENTREGUE" | "SEM_MORADOR";

const FILTROS: { id: Filtro; label: string; teste: (u: AssembleiaUnidade) => boolean }[] = [
  { id: "TODAS", label: "Todas", teste: () => true },
  { id: "NAO_CONVOCADA", label: "Não convocadas", teste: (u) => !!u.leadId && !u.statusEnvio },
  { id: "FALHA", label: "Falha no envio", teste: (u) => u.statusEnvio === "FALHA" },
  { id: "NAO_ENTREGUE", label: "Enviado sem entrega", teste: (u) => u.statusEnvio === "ENVIADO" && !u.entregueEm && !u.linkAbertoEm },
  { id: "SEM_MORADOR", label: "Sem morador no cadastro", teste: (u) => !u.leadId },
];

export default function AbaConvocacao({
  a,
  isOwner,
  chamar,
  recarregar,
  pedirConfirmacao,
}: AbaProps & { pedirConfirmacao: (p: PedidoConfirmacao) => void }) {
  const [filtro, setFiltro] = useState<Filtro>("TODAS");
  const [busca, setBusca] = useState("");
  const [proc, setProc] = useState<{ u: AssembleiaUnidade; nome: string; cpf: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const sub = { color: "var(--shell-subtext)" };
  const podeConvocar = isOwner && (a.status === "RASCUNHO" || a.status === "CONVOCADA" || a.status === "EM_ANDAMENTO");

  const n = useMemo(() => {
    const u = a.unidades;
    return {
      total: u.length,
      comMorador: u.filter((x) => x.leadId).length,
      naoConvocadas: u.filter((x) => x.leadId && !x.statusEnvio).length,
      naFila: u.filter((x) => x.statusEnvio === "PENDENTE").length,
      enviadas: u.filter((x) => x.statusEnvio === "ENVIADO").length,
      entregues: u.filter((x) => x.entregueEm || x.linkAbertoEm).length,
      falhas: u.filter((x) => x.statusEnvio === "FALHA").length,
    };
  }, [a.unidades]);

  const lista = useMemo(() => {
    const f = FILTROS.find((x) => x.id === filtro)!;
    const q = busca.trim().toLowerCase();
    return a.unidades.filter((u) => f.teste(u) && (!q || `${nomeUnidade(u)} ${u.morador ?? ""}`.toLowerCase().includes(q)));
  }, [a.unidades, filtro, busca]);

  async function reenviar(u: AssembleiaUnidade) {
    setOcupado(u.id);
    await chamar(`/unidades/${u.id}/reenviar`, { method: "POST" });
    setOcupado(null);
    await recarregar();
  }

  async function salvarProcurador() {
    if (!proc) return;
    setOcupado(proc.u.id);
    const r = await chamar(`/unidades/${proc.u.id}/procurador`, { method: "PATCH", body: JSON.stringify({ nome: proc.nome, cpf: proc.cpf }) });
    setOcupado(null);
    if (r) {
      setProc(null);
      await recarregar();
    }
  }

  const Numero = ({ v, l }: { v: number; l: string }) => (
    <div>
      <p className="text-2xl font-bold" style={{ color: "var(--shell-text)" }}>{v}</p>
      <p className="text-xs" style={sub}>{l}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
            <Numero v={n.total} l="unidades no total" />
            <Numero v={n.comMorador} l="com morador" />
            <Numero v={n.naoConvocadas} l="não convocadas" />
            <Numero v={n.naFila} l="na fila" />
            <Numero v={n.enviadas} l="enviadas" />
            <Numero v={n.entregues} l="entregues / abriram" />
            <Numero v={n.falhas} l="com falha" />
          </div>
          <p className="text-xs mt-3" style={sub}>
            A assembleia só vale se todos os condôminos forem convocados (art. 1.354 do Código Civil). Unidades sem morador no cadastro
            não recebem WhatsApp: convoque por outro meio (edital no mural, carta) e registre um procurador se for o caso.
          </p>
          {a.envioPausadoEm && (
            <p className="text-sm mt-3 text-amber-600">Convocação pausada. {a.envioPausaMotivo}</p>
          )}
          {podeConvocar && (
            <div className="flex flex-wrap gap-2 mt-4">
              {n.naoConvocadas > 0 && (
                <button
                  className={btnPrimario}
                  style={{ background: TEAL }}
                  onClick={() =>
                    pedirConfirmacao({
                      titulo: "Enviar convocação",
                      texto: `O edital vai pelo WhatsApp, com link individual, para ${n.naoConvocadas} unidade(s), uma de cada vez (8 a 20 segundos entre mensagens).\n\nConfira antes o texto na aba "Dados e edital" e a pauta.`,
                      botao: "Enviar",
                      acao: () => chamar("/convocar", { method: "POST", body: "{}" }),
                    })
                  }
                >
                  Convocar {n.naoConvocadas} unidade(s)
                </button>
              )}
              {n.falhas > 0 && (
                <button
                  className={btnSecundario}
                  style={{ color: "var(--shell-text)" }}
                  onClick={() =>
                    pedirConfirmacao({
                      titulo: "Tentar de novo as falhas",
                      texto: `${n.falhas} unidade(s) com falha voltam para a fila do WhatsApp.`,
                      botao: "Tentar de novo",
                      acao: () =>
                        chamar("/convocar", {
                          method: "POST",
                          body: JSON.stringify({ unidadeIds: a.unidades.filter((u) => u.statusEnvio === "FALHA").map((u) => u.id) }),
                        }),
                    })
                  }
                >
                  Tentar de novo as {n.falhas} falha(s)
                </button>
              )}
              {a.status !== "RASCUNHO" &&
                (a.envioPausadoEm ? (
                  <button className={btnSecundario} style={{ color: "var(--shell-text)" }} onClick={async () => { await chamar("/retomar-convocacao", { method: "POST" }); await recarregar(); }}>
                    Retomar envios
                  </button>
                ) : (
                  n.naFila > 0 && (
                    <button className={btnSecundario} style={{ color: "var(--shell-text)" }} onClick={async () => { await chamar("/pausar-convocacao", { method: "POST" }); await recarregar(); }}>
                      Pausar envios
                    </button>
                  )
                ))}
              {(a.status === "RASCUNHO" || a.status === "CONVOCADA") && (
                <button className={btnSecundario} style={{ color: "var(--shell-text)" }} onClick={async () => { await chamar("/unidades/sincronizar", { method: "POST" }); await recarregar(); }}>
                  Atualizar lista de unidades
                </button>
              )}
              <button className={btnSecundario} style={{ color: "var(--shell-text)" }} onClick={recarregar}>
                Recarregar
              </button>
            </div>
          )}
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltro(f.id)}
            className="px-3 py-1 rounded-full text-xs font-medium border"
            style={{
              borderColor: filtro === f.id ? TEAL : "var(--shell-card-border)",
              color: filtro === f.id ? TEAL : "var(--shell-subtext)",
            }}
          >
            {f.label} ({a.unidades.filter(f.teste).length})
          </button>
        ))}
        <input placeholder="Buscar unidade ou morador" value={busca} onChange={(e) => setBusca(e.target.value)} className={`${inputCls} !mt-0 max-w-xs`} />
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs" style={sub}>
                <th className="p-3">Unidade</th>
                <th className="p-3">Morador</th>
                <th className="p-3">Convocação</th>
                <th className="p-3">Entregue</th>
                <th className="p-3">Abriu o link</th>
                <th className="p-3">Procurador</th>
                <th className="p-3">Presente</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((u) => (
                <tr key={u.id} className="border-t" style={{ borderColor: "var(--shell-card-border)", color: "var(--shell-text)" }}>
                  <td className="p-3 whitespace-nowrap">{nomeUnidade(u)}</td>
                  <td className="p-3">
                    {u.morador ?? <span style={sub}>sem morador</span>}
                    {u.leadId && !u.temCpf && <span className="block text-xs text-amber-600">sem CPF no cadastro</span>}
                  </td>
                  <td className="p-3">
                    {u.statusEnvio ? (
                      <Badge variant={u.statusEnvio === "FALHA" ? "error" : u.statusEnvio === "ENVIADO" ? "success" : "info"}>
                        {ENVIO_LABEL[u.statusEnvio] ?? u.statusEnvio}
                      </Badge>
                    ) : (
                      <span style={sub}>—</span>
                    )}
                    {u.ultimoEnvioErro && <span className="block text-xs text-red-600 max-w-xs">{u.ultimoEnvioErro}</span>}
                  </td>
                  <td className="p-3 text-xs whitespace-nowrap">{u.entregueEm ? formatDateTime(u.entregueEm) : "—"}</td>
                  <td className="p-3 text-xs whitespace-nowrap">{u.linkAbertoEm ? formatDateTime(u.linkAbertoEm) : "—"}</td>
                  <td className="p-3 text-xs">{u.procuradorNome ?? "—"}</td>
                  <td className="p-3">{u.presente ? <Badge variant="success">Sim</Badge> : <span style={sub}>—</span>}</td>
                  <td className="p-3 whitespace-nowrap text-right">
                    {isOwner && a.status !== "ENCERRADA" && (
                      <>
                        {u.leadId && a.status !== "RASCUNHO" && u.statusEnvio !== "PENDENTE" && (
                          <button className="text-xs underline mr-3" style={{ color: TEAL }} disabled={ocupado === u.id} onClick={() => reenviar(u)}>
                            {ocupado === u.id ? "Enviando..." : u.statusEnvio ? "Reenviar" : "Enviar"}
                          </button>
                        )}
                        <button
                          className="text-xs underline"
                          style={sub}
                          onClick={() => setProc({ u, nome: u.procuradorNome ?? "", cpf: u.procuradorCpf ?? "" })}
                        >
                          Procurador
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={!!proc}
        onClose={() => setProc(null)}
        title={proc ? `Procurador da unidade ${nomeUnidade(proc.u)}` : ""}
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setProc(null)} className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--shell-card-border)]" style={{ color: "var(--shell-text)" }}>
              Cancelar
            </button>
            <button onClick={salvarProcurador} disabled={!!ocupado} className={btnPrimario} style={{ background: TEAL }}>
              Salvar
            </button>
          </div>
        }
      >
        {proc && (
          <div className="space-y-3">
            <p className="text-xs" style={sub}>
              Só registre depois de conferir a procuração assinada (guarde a cópia). O procurador poderá votar pela unidade com o CPF dele,
              online pelo link da unidade ou presencialmente na mesa. Deixe os dois campos vazios para remover.
            </p>
            <label className="block text-xs font-medium" style={sub}>
              Nome
              <input value={proc.nome} onChange={(e) => setProc({ ...proc, nome: e.target.value })} className={inputCls} />
            </label>
            <label className="block text-xs font-medium" style={sub}>
              CPF
              <input inputMode="numeric" value={proc.cpf} onChange={(e) => setProc({ ...proc, cpf: e.target.value })} className={inputCls} />
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
}
