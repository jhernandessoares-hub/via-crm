"use client";

import { useEffect, useState } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import {
  AbaProps,
  ItemTipo,
  PAUTA_SUGERIDA,
  QUORUM_LABEL,
  Quorum,
  TEAL,
  TIPO_LABEL,
  btnPrimario,
  btnSecundario,
  inputCls,
} from "../../_lib/assembleia";

type Rascunho = { titulo: string; descricao: string; tipo: ItemTipo; quorum: Quorum; opcoes: string };

const vazio = (): Rascunho => ({ titulo: "", descricao: "", tipo: "APROVACAO", quorum: "MAIORIA_PRESENTES", opcoes: "" });

export default function AbaPauta({ a, isOwner, chamar, recarregar }: AbaProps) {
  const travada = !isOwner || a.status === "ENCERRADA" || a.itens.some((i) => i.status !== "PENDENTE");
  const [itens, setItens] = useState<Rascunho[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    setItens(
      a.itens.map((i) => ({
        titulo: i.titulo,
        descricao: i.descricao ?? "",
        tipo: i.tipo,
        quorum: i.quorum,
        opcoes: i.opcoes.filter((o) => o !== "Abstenção").join("\n"),
      })),
    );
  }, [a]);

  const mudar = (idx: number, patch: Partial<Rascunho>) => setItens((l) => l.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  const mover = (idx: number, d: -1 | 1) =>
    setItens((l) => {
      const j = idx + d;
      if (j < 0 || j >= l.length) return l;
      const c = [...l];
      [c[idx], c[j]] = [c[j], c[idx]];
      return c;
    });

  async function salvar() {
    setSalvando(true);
    setOk(false);
    const r = await chamar("/itens", {
      method: "PUT",
      body: JSON.stringify({
        itens: itens.map((i) => ({ ...i, opcoes: i.opcoes.split("\n").map((o) => o.trim()).filter(Boolean) })),
      }),
    });
    setSalvando(false);
    if (r) {
      setOk(true);
      await recarregar();
    }
  }

  const sub = { color: "var(--shell-subtext)" };
  const reuniao = a.tipo === "REUNIAO";

  if (travada) {
    return (
      <div className="space-y-3">
        {!isOwner ? null : (
          <p className="text-sm" style={sub}>A votação já começou: a pauta não pode mais ser alterada.</p>
        )}
        {a.itens.map((i) => (
          <Card key={i.id}>
            <CardBody>
              <p className="font-semibold" style={{ color: "var(--shell-text)" }}>
                {i.ordem}. {i.titulo}
              </p>
              {reuniao ? (
                i.descricao && <p className="text-xs mt-1" style={sub}>{i.descricao}</p>
              ) : (
                <p className="text-xs mt-1" style={sub}>
                  {TIPO_LABEL[i.tipo]} · {QUORUM_LABEL[i.quorum]}
                  {i.tipo !== "APROVACAO" && ` · Opções: ${i.opcoes.join(", ")}`}
                </p>
              )}
            </CardBody>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {itens.length === 0 && !reuniao && (
          <button
            className={btnSecundario}
            style={{ color: "var(--shell-text)" }}
            onClick={() => setItens(PAUTA_SUGERIDA.map((p) => ({ ...vazio(), titulo: p.titulo, tipo: p.tipo, quorum: p.quorum })))}
          >
            Usar pauta típica de instalação
          </button>
        )}
        <button className={btnSecundario} style={{ color: "var(--shell-text)" }} onClick={() => setItens((l) => [...l, vazio()])}>
          + Adicionar {reuniao ? "assunto" : "item"}
        </button>
      </div>

      {itens.map((it, idx) => (
        <Card key={idx}>
          <CardBody>
            <div className="flex items-start gap-3">
              <span className="font-bold text-lg pt-6" style={{ color: "var(--shell-text)" }}>{idx + 1}.</span>
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="block text-xs font-medium md:col-span-2" style={sub}>
                  Título
                  <input value={it.titulo} onChange={(e) => mudar(idx, { titulo: e.target.value })} className={inputCls} />
                </label>
                <label className="block text-xs font-medium md:col-span-2" style={sub}>
                  Explicação para o morador (opcional)
                  <input value={it.descricao} onChange={(e) => mudar(idx, { descricao: e.target.value })} className={inputCls} />
                </label>
                {!reuniao && (<>
                <label className="block text-xs font-medium" style={sub}>
                  Tipo de votação
                  <select value={it.tipo} onChange={(e) => mudar(idx, { tipo: e.target.value as ItemTipo })} className={inputCls}>
                    {Object.entries(TIPO_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium" style={sub}>
                  Quórum para aprovar
                  <select value={it.quorum} onChange={(e) => mudar(idx, { quorum: e.target.value as Quorum })} className={inputCls}>
                    {Object.entries(QUORUM_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </label>
                {it.tipo !== "APROVACAO" && (
                  <label className="block text-xs font-medium md:col-span-2" style={sub}>
                    {it.tipo === "ELEICAO" ? "Candidatos (um por linha)" : "Opções (uma por linha)"} · &ldquo;Abstenção&rdquo; entra sozinha
                    <textarea
                      rows={3}
                      value={it.opcoes}
                      onChange={(e) => mudar(idx, { opcoes: e.target.value })}
                      className="block w-full mt-1 rounded-lg border p-2 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)] outline-none"
                    />
                  </label>
                )}
                </>)}
              </div>
              <div className="flex flex-col gap-1 pt-5">
                <button className="text-xs px-2" style={sub} onClick={() => mover(idx, -1)} title="Subir">▲</button>
                <button className="text-xs px-2" style={sub} onClick={() => mover(idx, 1)} title="Descer">▼</button>
                <button className="text-xs px-2 text-red-600" onClick={() => setItens((l) => l.filter((_, i) => i !== idx))} title="Remover">✕</button>
              </div>
            </div>
          </CardBody>
        </Card>
      ))}

      {itens.length > 0 && (
        <div className="flex items-center gap-3">
          <button onClick={salvar} disabled={salvando} className={btnPrimario} style={{ background: TEAL }}>
            {salvando ? "Salvando..." : reuniao ? "Salvar assuntos" : "Salvar pauta"}
          </button>
          {ok && <span className="text-sm text-green-600">Pauta salva.</span>}
        </div>
      )}
      {!reuniao && <p className="text-xs" style={sub}>
        Eleição: pode deixar os candidatos em branco e preencher na aba Mesa, durante a assembleia, antes de abrir a votação do item.
      </p>}
    </div>
  );
}
