"use client";

import { useEffect, useState } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { AbaProps, TEAL, btnPrimario, inputCls, isoParaInput } from "../../_lib/assembleia";

const CAMPOS_EDITAL = [
  ["{{nome}}", "nome do morador"],
  ["{{unidade}}", "torre e unidade"],
  ["{{data}}", "data e hora da 1ª convocação"],
  ["{{video}}", "link da sala de vídeo"],
  ["{{pauta}}", "itens da pauta, numerados"],
  ["{{link}}", "link individual da unidade"],
];

export default function AbaDados({ a, isOwner, chamar, recarregar }: AbaProps) {
  const [f, setF] = useState(() => inicial(a));
  const [salvando, setSalvando] = useState(false);
  const [ok, setOk] = useState(false);
  const bloqueado = !isOwner || a.status === "ENCERRADA";
  const horarioBloqueado = bloqueado || a.status === "EM_ANDAMENTO";

  useEffect(() => setF(inicial(a)), [a]);

  async function salvar() {
    setSalvando(true);
    setOk(false);
    const body: Record<string, unknown> = {
      titulo: f.titulo,
      linkVideo: f.linkVideo,
      presidenteNome: f.presidenteNome,
      secretarioNome: f.secretarioNome,
      edital: f.edital,
    };
    if (!horarioBloqueado) {
      body.dataPrimeiraConvocacao = new Date(f.primeira).toISOString();
      body.dataSegundaConvocacao = new Date(f.segunda).toISOString();
    }
    const r = await chamar("", { method: "PATCH", body: JSON.stringify(body) });
    setSalvando(false);
    if (r) {
      setOk(true);
      await recarregar();
    }
  }

  const label = "block text-xs font-medium";
  const reuniao = a.tipo === "REUNIAO";
  const sub = { color: "var(--shell-subtext)" };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardBody>
          <div className="space-y-3">
            <label className={label} style={sub}>
              Título
              <input disabled={bloqueado} value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} className={inputCls} />
            </label>
            <div className={`grid grid-cols-1 gap-3 ${reuniao ? "" : "sm:grid-cols-2"}`}>
              <label className={label} style={sub}>
                {reuniao ? "Data e hora" : "1ª convocação"}
                <input type="datetime-local" disabled={horarioBloqueado} value={f.primeira} onChange={(e) => setF({ ...f, primeira: e.target.value })} className={inputCls} />
              </label>
              <label className={label} style={sub} hidden={reuniao}>
                2ª convocação
                <input type="datetime-local" disabled={horarioBloqueado} value={f.segunda} onChange={(e) => setF({ ...f, segunda: e.target.value })} className={inputCls} />
              </label>
            </div>
            <label className={label} style={sub}>
              Link da sala de vídeo (Meet, Zoom ou Teams)
              <input disabled={bloqueado} value={f.linkVideo} onChange={(e) => setF({ ...f, linkVideo: e.target.value })} className={inputCls} />
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className={label} style={sub}>
                Presidente da mesa
                <input disabled={bloqueado} value={f.presidenteNome} onChange={(e) => setF({ ...f, presidenteNome: e.target.value })} className={inputCls} />
              </label>
              <label className={label} style={sub}>
                Secretário(a) da mesa
                <input disabled={bloqueado} value={f.secretarioNome} onChange={(e) => setF({ ...f, secretarioNome: e.target.value })} className={inputCls} />
              </label>
            </div>
            <p className="text-xs" style={sub} hidden={reuniao}>
              O edital costuma exigir antecedência mínima (em geral 8 a 10 dias, conforme a convenção). Confira antes de convocar.
            </p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <label className={label} style={sub}>
            {reuniao ? "Texto do convite" : "Texto do edital"} (vai pelo WhatsApp para cada unidade)
            <textarea
              disabled={bloqueado}
              value={f.edital}
              onChange={(e) => setF({ ...f, edital: e.target.value })}
              rows={16}
              className="block w-full mt-1 rounded-lg border p-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)] outline-none"
            />
          </label>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={sub}>
            {CAMPOS_EDITAL.map(([k, v]) => (
              <span key={k}>
                <code>{k}</code> {v}
              </span>
            ))}
          </div>
        </CardBody>
      </Card>

      {!bloqueado && (
        <div className="lg:col-span-2 flex items-center gap-3">
          <button onClick={salvar} disabled={salvando} className={btnPrimario} style={{ background: TEAL }}>
            {salvando ? "Salvando..." : "Salvar"}
          </button>
          {ok && <span className="text-sm text-green-600">Salvo.</span>}
        </div>
      )}
    </div>
  );
}

function inicial(a: AbaProps["a"]) {
  return {
    titulo: a.titulo,
    primeira: isoParaInput(a.dataPrimeiraConvocacao),
    segunda: isoParaInput(a.dataSegundaConvocacao),
    linkVideo: a.linkVideo ?? "",
    presidenteNome: a.presidenteNome ?? "",
    secretarioNome: a.secretarioNome ?? "",
    edital: a.edital,
  };
}
