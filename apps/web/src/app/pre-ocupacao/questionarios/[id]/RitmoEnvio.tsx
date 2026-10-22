"use client";

import { useEffect, useState } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "../../_lib/constants";
import { Questionario } from "../../_lib/questionario";

/** Média do intervalo aleatório entre mensagens (8 a 20 segundos). */
const SEGUNDOS_POR_MENSAGEM = 14;

/**
 * Andamento do disparo e o botão de pausar/retomar. O ritmo fica a critério da
 * equipe; o sistema só pausa sozinho quando o envio falha 3 vezes seguidas
 * (WhatsApp desconectado ou com restrição). Atualiza a cada 30s.
 */
export default function RitmoEnvio({ questionario }: { questionario: Questionario }) {
  const [q, setQ] = useState(questionario);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => setQ(questionario), [questionario]);
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        setQ(await apiFetch(`/pre-ocupacao/questionarios/${questionario.id}`));
      } catch {
        /* mantém o último estado */
      }
    }, 30_000);
    return () => clearInterval(t);
  }, [questionario.id]);

  async function acao(rota: "pausar-envios" | "retomar-envios") {
    setSalvando(true);
    setErro(null);
    try {
      setQ(await apiFetch(`/pre-ocupacao/questionarios/${q.id}/${rota}`, { method: "POST" }));
    } catch (e: any) {
      setErro(e?.message ?? "Erro");
    } finally {
      setSalvando(false);
    }
  }

  const minutos = Math.ceil((q.aguardandoEnvio * SEGUNDOS_POR_MENSAGEM) / 60);
  const previsao = minutos >= 60 ? `cerca de ${Math.floor(minutos / 60)}h${String(minutos % 60).padStart(2, "0")}` : `cerca de ${minutos} min`;
  const sub = { color: "var(--shell-subtext)" };

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--shell-text)" }}>Envio pelo WhatsApp</p>
            <p className="text-xs mt-0.5" style={sub}>
              Uma mensagem por vez, com intervalo de 8 a 20 segundos. Se falhar 3 vezes seguidas, o envio pausa sozinho para proteger o número.
            </p>
            <p className="text-xs mt-1" style={sub}>
              Hoje: <strong>{q.enviadosHoje}</strong> enviada(s) · <strong>{q.aguardandoEnvio}</strong> na fila
              {q.aguardandoEnvio > 0 && !q.envioPausadoEm && ` · termina em ${previsao}`}
            </p>
          </div>
          {q.status === "PUBLICADO" && !q.envioPausadoEm && (
            <button
              onClick={() => acao("pausar-envios")}
              disabled={salvando}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-red-300 text-red-600 disabled:opacity-50"
            >
              Pausar envios
            </button>
          )}
        </div>

        {q.envioPausadoEm && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ background: "#fef2f2" }}>
            <p className="text-sm text-red-700">
              <strong>Envios pausados</strong> desde {formatDateTime(q.envioPausadoEm)}. {q.envioPausaMotivo}
              <br />
              <span className="text-xs">Nada sai até retomar. Se foi pausa automática, confira se o WhatsApp está conectado antes.</span>
            </p>
            <button
              onClick={() => acao("retomar-envios")}
              disabled={salvando}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--via-teal, #1D9E75)" }}
            >
              Retomar envios
            </button>
          </div>
        )}

        {erro && <p className="text-xs text-red-600">{erro}</p>}
      </CardBody>
    </Card>
  );
}
