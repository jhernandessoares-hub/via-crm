"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatDateTime } from "../../_lib/constants";
import { AbaProps, QUORUM_LABEL, TEAL, btnPrimario } from "../../_lib/assembleia";
import { BarrasResultado } from "./AbaMesa";

const dt = (v: string | null | undefined) => (v ? new Date(v).toLocaleString("pt-BR") : "");

/**
 * Resultado de cada item e os anexos da ata numa planilha: resumo, prova de convocação,
 * lista de presença, mapa de votos por unidade e o log completo. A ata em Word vem
 * depois, quando houver o modelo do advogado/cartório.
 */
export default function AbaResultado({ a, chamar }: Pick<AbaProps, "a" | "chamar">) {
  const [baixando, setBaixando] = useState(false);
  const sub = { color: "var(--shell-subtext)" };
  const reuniao = a.tipo === "REUNIAO";

  async function baixar() {
    setBaixando(true);
    const r = await chamar("/relatorio");
    setBaixando(false);
    if (!r) return;
    const wb = XLSX.utils.book_new();
    const add = (nome: string, linhas: Record<string, unknown>[]) =>
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas.length ? linhas : [{ "": "Sem registros" }]), nome);

    if (!reuniao) add(
      "Resultado",
      a.itens.map((i) => ({
        Item: i.ordem,
        Assunto: i.titulo,
        Quórum: QUORUM_LABEL[i.quorum],
        Situação: i.status === "FECHADO" ? (i.resultado?.aprovado ? "Aprovado" : "Não aprovado") : "Não votado",
        Votos: i.resultado?.contagem.map((c) => `${c.opcao}: ${c.votos}`).join(" | ") ?? "",
        "Votos necessários": i.resultado?.necessarios ?? "",
        Resumo: i.resultado?.resumo ?? "",
        "Aberto em": dt(i.abertoEm),
        "Fechado em": dt(i.fechadoEm),
      })),
    );
    add(
      "Convocação",
      r.unidades.map((u: any) => ({
        Unidade: u.unidade,
        Morador: u.morador ?? "",
        Situação: u.convocacao,
        "Enviado em": dt(u.enviadoEm),
        "Entregue em": dt(u.entregueEm),
        "Abriu o link em": dt(u.linkAbertoEm),
        Erro: u.erro ?? "",
        Presente: u.presente ? "Sim" : "Não",
      })),
    );
    add(
      "Presença",
      r.presencas.map((p: any) => ({ Unidade: p.unidade, Nome: p.nome, CPF: p.cpf, Papel: p.papel, Forma: p.origem, "Entrou em": dt(p.entrouEm) })),
    );
    add(
      "Votos",
      r.votos.map((v: any) => ({ Item: v.item, Unidade: v.unidade, Nome: v.nome, CPF: v.cpf, Voto: v.opcao, Forma: v.origem, Em: dt(v.em) })),
    );
    add(
      "Log",
      r.eventos.map((e: any) => ({ Em: dt(e.em), Evento: e.tipo, Unidade: e.unidade ?? "", Detalhe: e.detalhe ?? "", Por: e.por ?? "" })),
    );
    XLSX.writeFile(wb, `${a.titulo} - anexos.xlsx`.replace(/[\\/:*?"<>|]/g, ""));
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold" style={{ color: "var(--shell-text)" }}>{reuniao ? "Lista de presença e anexos" : "Anexos da ata"}</p>
              <p className="text-xs mt-1" style={sub}>
                {reuniao
                  ? "Planilha com prova de convocação, lista de presença e log com data e hora de cada ação. CPF sai mascarado."
                  : "Planilha com resultado, prova de convocação, lista de presença, mapa de votos por unidade e log com data e hora de cada ação. CPF sai mascarado."}
                {a.iniciadaEm && ` Iniciada em ${formatDateTime(a.iniciadaEm)}.`}
                {a.encerradaEm && ` Encerrada em ${formatDateTime(a.encerradaEm)}.`}
              </p>
            </div>
            <button onClick={baixar} disabled={baixando} className={btnPrimario} style={{ background: TEAL }}>
              {baixando ? "Gerando..." : "Baixar anexos (.xlsx)"}
            </button>
          </div>
        </CardBody>
      </Card>

      {!reuniao && a.itens.map((i) => (
        <Card key={i.id}>
          <CardBody>
            <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
              <p className="font-semibold" style={{ color: "var(--shell-text)" }}>
                {i.ordem}. {i.titulo}
              </p>
              {i.status === "FECHADO" ? (
                <Badge variant={i.resultado?.aprovado ? "success" : "error"}>{i.resultado?.aprovado ? "Aprovado" : "Não aprovado"}</Badge>
              ) : (
                <Badge variant="neutral">{i.status === "ABERTO" ? "Em votação" : "Não votado"}</Badge>
              )}
            </div>
            {i.resultado ? (
              <>
                <BarrasResultado r={i.resultado} />
                <p className="text-sm mt-2" style={{ color: "var(--shell-text)" }}>{i.resultado.resumo}</p>
                <p className="text-xs mt-1" style={sub}>
                  {i.resultado.presentes} unidades presentes de {i.resultado.totalUnidades} · {QUORUM_LABEL[i.quorum]}
                </p>
              </>
            ) : (
              <p className="text-xs" style={sub}>{QUORUM_LABEL[i.quorum]}</p>
            )}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
