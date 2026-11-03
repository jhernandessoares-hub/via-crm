"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AbaProps, AssembleiaItem, Mesa, ResultadoItem, TEAL, btnPrimario, btnSecundario, inputCls, nomeUnidade } from "../../_lib/assembleia";
import type { PedidoConfirmacao } from "./Confirmar";

const POLL_MS = 3000;

export function BarrasResultado({ r }: { r: ResultadoItem }) {
  const max = Math.max(1, ...r.contagem.map((c) => c.votos));
  return (
    <div className="space-y-2">
      {r.contagem.map((c) => (
        <div key={c.opcao}>
          <div className="flex justify-between text-sm" style={{ color: "var(--shell-text)" }}>
            <span>{c.opcao}</span>
            <strong>{c.votos}</strong>
          </div>
          <div className="h-3 rounded-full overflow-hidden" style={{ background: "var(--shell-hover)" }}>
            <div className="h-full rounded-full" style={{ width: `${(c.votos / max) * 100}%`, background: c.opcao === "Abstenção" ? "#94a3b8" : TEAL }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AbaMesa({
  a,
  isOwner,
  chamar,
  recarregar,
  pedirConfirmacao,
}: AbaProps & { pedirConfirmacao: (p: PedidoConfirmacao) => void }) {
  const [mesa, setMesa] = useState<Mesa | null>(null);
  const sub = { color: "var(--shell-subtext)" };

  useEffect(() => {
    let vivo = true;
    const tick = async () => {
      const m = await chamar("/mesa");
      if (vivo && m) setMesa(m);
    };
    tick();
    const t = setInterval(tick, POLL_MS);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [chamar]);

  // Abriu/fechou item em outra tela: atualiza a pauta
  const abertoId = mesa?.itemAberto?.id ?? null;
  const abertoLocal = a.itens.find((i) => i.status === "ABERTO")?.id ?? null;
  useEffect(() => {
    if (mesa && abertoId !== abertoLocal) recarregar();
  }, [mesa, abertoId, abertoLocal, recarregar]);

  if (!mesa) return <p className="text-sm" style={sub}>Carregando...</p>;

  const conduz = isOwner && a.status === "EM_ANDAMENTO";
  const reuniao = a.tipo === "REUNIAO";

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2 space-y-4">
        <Card>
          <CardBody>
            <div className="flex flex-wrap items-end gap-8">
              <div>
                <p className="text-4xl font-bold" style={{ color: "var(--shell-text)" }}>
                  {mesa.presentes}
                  <span className="text-lg font-normal" style={sub}> / {mesa.totalUnidades}</span>
                </p>
                <p className="text-xs" style={sub}>
                  unidades presentes ({mesa.online} online · {mesa.presencial} no local)
                </p>
              </div>
              {!reuniao && <div>
                {mesa.instalacao.instalada ? (
                  <Badge variant="success">Quórum de instalação atingido</Badge>
                ) : (
                  <Badge variant="warning">Sem quórum de instalação</Badge>
                )}
                <p className="text-xs mt-1" style={sub}>
                  {mesa.instalacao.emSegunda
                    ? "2ª convocação: instala com qualquer número de presentes."
                    : `1ª convocação: precisa de ${mesa.instalacao.minimoPrimeira} unidades presentes.`}
                </p>
              </div>}
              <p className="text-xs" style={sub}>
                Convocação: {mesa.convocadas} enviadas · {mesa.entregues} entregues
              </p>
            </div>
            {a.status === "CONVOCADA" && (
              <p className="text-sm mt-3" style={sub}>
                {reuniao
                  ? "A confirmação de presença já está aberta. Quando chegar o horário, clique em “Iniciar reunião” no topo."
                  : "O credenciamento já está aberto. Quando chegar o horário e o quórum estiver ok, clique em “Iniciar assembleia” no topo."}
              </p>
            )}
          </CardBody>
        </Card>

        {reuniao ? (
          <Card>
            <CardBody>
              <p className="font-semibold mb-2" style={{ color: "var(--shell-text)" }}>Assuntos</p>
              <ol className="space-y-1 text-sm" style={{ color: "var(--shell-text)" }}>
                {a.itens.map((i) => (
                  <li key={i.id}>
                    {i.ordem}. {i.titulo}
                    {i.descricao && <span className="block text-xs" style={sub}>{i.descricao}</span>}
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        ) : a.itens.map((i) => (
          <ItemMesa
            key={i.id}
            item={i}
            mesa={mesa}
            conduz={conduz}
            chamar={chamar}
            recarregar={recarregar}
            pedirConfirmacao={pedirConfirmacao}
          />
        ))}
      </div>

      <Presencial a={a} mesa={mesa} chamar={chamar} recarregar={recarregar} />
    </div>
  );
}

function ItemMesa({
  item,
  mesa,
  conduz,
  chamar,
  recarregar,
  pedirConfirmacao,
}: {
  item: AssembleiaItem;
  mesa: Mesa;
  conduz: boolean;
  chamar: AbaProps["chamar"];
  recarregar: AbaProps["recarregar"];
  pedirConfirmacao: (p: PedidoConfirmacao) => void;
}) {
  const sub = { color: "var(--shell-subtext)" };
  const aberto = mesa.itemAberto?.id === item.id ? mesa.itemAberto : null;
  const candidatosEditaveis = conduz && item.status === "PENDENTE" && item.tipo !== "APROVACAO";
  const [opcoes, setOpcoes] = useState(item.opcoes.filter((o) => o !== "Abstenção").join("\n"));
  useEffect(() => setOpcoes(item.opcoes.filter((o) => o !== "Abstenção").join("\n")), [item.opcoes]);

  return (
    <Card>
      <CardBody>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="font-semibold" style={{ color: "var(--shell-text)" }}>
            {item.ordem}. {item.titulo}
          </p>
          {item.status === "ABERTO" && <Badge variant="warning">Votação aberta</Badge>}
          {item.status === "FECHADO" && <Badge variant={item.resultado?.aprovado ? "success" : "error"}>{item.resultado?.aprovado ? "Aprovado" : "Não aprovado"}</Badge>}
        </div>

        {candidatosEditaveis && (
          <div className="mt-3">
            <label className="block text-xs font-medium" style={sub}>
              {item.tipo === "ELEICAO" ? "Candidatos (um por linha)" : "Opções (uma por linha)"}
              <textarea
                rows={3}
                value={opcoes}
                onChange={(e) => setOpcoes(e.target.value)}
                className="block w-full mt-1 rounded-lg border p-2 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)] outline-none"
              />
            </label>
            <button
              className={`${btnSecundario} mt-2`}
              style={{ color: "var(--shell-text)" }}
              onClick={async () => {
                await chamar(`/itens/${item.id}/opcoes`, { method: "PUT", body: JSON.stringify({ opcoes: opcoes.split("\n").map((o) => o.trim()).filter(Boolean) }) });
                await recarregar();
              }}
            >
              Salvar {item.tipo === "ELEICAO" ? "candidatos" : "opções"}
            </button>
          </div>
        )}

        {aberto && (
          <div className="mt-3 space-y-3">
            <BarrasResultado r={aberto.parcial} />
            <p className="text-xs" style={sub}>
              {aberto.parcial.totalVotos} voto(s) · {aberto.faltamVotar} unidade(s) presente(s) ainda não votaram · necessários para aprovar: {aberto.parcial.necessarios}
            </p>
          </div>
        )}
        {item.status === "FECHADO" && item.resultado && (
          <div className="mt-3 space-y-2">
            <BarrasResultado r={item.resultado} />
            <p className="text-sm" style={{ color: "var(--shell-text)" }}>{item.resultado.resumo}</p>
          </div>
        )}

        {conduz && item.status === "PENDENTE" && !mesa.itemAberto && (
          <button
            className={`${btnPrimario} mt-3`}
            style={{ background: TEAL }}
            onClick={() =>
              pedirConfirmacao({
                titulo: `Abrir votação do item ${item.ordem}`,
                texto: `"${item.titulo}"\n\nO item aparece na tela de todos os credenciados. Cada unidade vota uma vez e o voto não pode ser trocado.`,
                botao: "Abrir votação",
                acao: () => chamar(`/itens/${item.id}/abrir`, { method: "POST" }),
              })
            }
          >
            Abrir votação
          </button>
        )}
        {conduz && aberto && (
          <button
            className={`${btnPrimario} mt-3`}
            style={{ background: "#dc2626" }}
            onClick={() =>
              pedirConfirmacao({
                titulo: `Fechar votação do item ${item.ordem}`,
                texto: `${aberto.parcial.totalVotos} voto(s) registrados${aberto.faltamVotar ? `; ${aberto.faltamVotar} unidade(s) presente(s) ainda não votaram` : ""}.\n\nDepois de fechar, ninguém mais vota neste item e o resultado fica gravado para a ata.`,
                botao: "Fechar e apurar",
                perigo: true,
                acao: () => chamar(`/itens/${item.id}/fechar`, { method: "POST" }),
              })
            }
          >
            Fechar votação
          </button>
        )}
      </CardBody>
    </Card>
  );
}

/** Tablet da mesa: credencia quem está no local (CPF) e registra o voto presencial. */
function Presencial({ a, mesa, chamar, recarregar }: { a: AbaProps["a"]; mesa: Mesa; chamar: AbaProps["chamar"]; recarregar: AbaProps["recarregar"] }) {
  const sub = { color: "var(--shell-subtext)" };
  const [busca, setBusca] = useState("");
  const [unidadeId, setUnidadeId] = useState("");
  const [cpf, setCpf] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const opcoesUnidade = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return a.unidades.filter((u) => !q || `${nomeUnidade(u)} ${u.morador ?? ""}`.toLowerCase().includes(q)).slice(0, 50);
  }, [a.unidades, busca]);
  const u = a.unidades.find((x) => x.id === unidadeId) ?? null;
  const presente = !!u && mesa.unidadesPresentes.includes(u.id);
  const votou = !!u && mesa.unidadesQueVotaram.includes(u.id);
  const aberta = a.status === "CONVOCADA" || a.status === "EM_ANDAMENTO";

  async function credenciar() {
    if (!u) return;
    setOcupado(true);
    setMsg(null);
    const r = await chamar("/presencial/credenciar", { method: "POST", body: JSON.stringify({ unidadeId: u.id, cpf }) });
    setOcupado(false);
    if (r) {
      setMsg({ ok: true, texto: `${r.nome} credenciado(a) pela unidade ${nomeUnidade(u)}.` });
      setCpf("");
      await recarregar();
    }
  }

  async function votar(opcao: string) {
    if (!u || !mesa.itemAberto) return;
    setOcupado(true);
    setMsg(null);
    const r = await chamar("/presencial/votar", { method: "POST", body: JSON.stringify({ unidadeId: u.id, itemId: mesa.itemAberto.id, opcao }) });
    setOcupado(false);
    if (r) setMsg({ ok: true, texto: `Voto da unidade ${nomeUnidade(u)} registrado.` });
  }

  return (
    <Card className="h-fit xl:sticky xl:top-4">
      <CardBody>
        <p className="font-semibold mb-1" style={{ color: "var(--shell-text)" }}>Presencial (tablet da mesa)</p>
        <p className="text-xs mb-3" style={sub}>
          Para quem está no local: escolha a unidade, confira o documento e digite o CPF.
          {a.tipo !== "REUNIAO" && " Depois registre o voto quando o item estiver aberto."}
        </p>
        {!aberta ? (
          <p className="text-sm" style={sub}>Disponível com a assembleia convocada ou em andamento.</p>
        ) : (
          <div className="space-y-3">
            <input placeholder="Buscar unidade ou morador" value={busca} onChange={(e) => setBusca(e.target.value)} className={inputCls} />
            <select value={unidadeId} onChange={(e) => { setUnidadeId(e.target.value); setMsg(null); }} className={inputCls} size={6}>
              {opcoesUnidade.map((x) => (
                <option key={x.id} value={x.id}>
                  {nomeUnidade(x)} · {x.morador ?? "sem morador"}
                  {mesa.unidadesPresentes.includes(x.id) ? " ✓" : ""}
                </option>
              ))}
            </select>
            {u && (
              <>
                <p className="text-sm" style={{ color: "var(--shell-text)" }}>
                  <strong>{nomeUnidade(u)}</strong> · {u.morador ?? "sem morador"}
                  {u.procuradorNome && <span className="block text-xs" style={sub}>Procurador: {u.procuradorNome}</span>}
                </p>
                <div className="flex gap-2">
                  <input placeholder="CPF de quem está presente" inputMode="numeric" value={cpf} onChange={(e) => setCpf(e.target.value)} className={`${inputCls} !mt-0`} />
                  <button disabled={ocupado || cpf.replace(/\D/g, "").length !== 11} onClick={credenciar} className={btnPrimario} style={{ background: TEAL }}>
                    Credenciar
                  </button>
                </div>
                {mesa.itemAberto && presente && !votou && (
                  <div>
                    <p className="text-xs mb-2" style={sub}>Voto no item {mesa.itemAberto.ordem}. {mesa.itemAberto.titulo}</p>
                    <div className="grid grid-cols-1 gap-2">
                      {mesa.itemAberto.opcoes.map((o) => (
                        <button key={o} disabled={ocupado} onClick={() => votar(o)} className="py-3 rounded-lg text-sm font-semibold border" style={{ borderColor: TEAL, color: "var(--shell-text)" }}>
                          {o}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {mesa.itemAberto && votou && <p className="text-sm text-green-600">Esta unidade já votou neste item.</p>}
                {mesa.itemAberto && !presente && <p className="text-xs" style={sub}>Credencie a unidade para registrar o voto.</p>}
              </>
            )}
            {msg && <p className={`text-sm ${msg.ok ? "text-green-600" : "text-red-600"}`}>{msg.texto}</p>}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
