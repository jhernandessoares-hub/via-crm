"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Filtro no estilo Excel para o título de uma coluna: lista os valores que
 * existem na coluna, com busca e checkbox por valor.
 * `selecionados === null` = sem filtro (todos aparecem).
 */
export default function FiltroColuna({
  titulo,
  valores,
  selecionados,
  onChange,
}: {
  titulo: string;
  valores: string[];
  selecionados: Set<string> | null;
  onChange: (s: Set<string> | null) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  // O popup vai direto no <body> (portal): dentro da tabela ele era cortado quando o
  // filtro deixava a tabela vazia/baixa. Posição calculada a partir do botão ▾.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  function posicionar() {
    const r = botaoRef.current?.getBoundingClientRect();
    if (!r) return;
    const margem = 8;
    const largura = popupRef.current?.offsetWidth ?? 256;
    const altura = popupRef.current?.offsetHeight ?? 340;
    // Perto da borda direita abre para a esquerda; sem espaço embaixo abre para cima
    const left = Math.max(margem, Math.min(r.left, window.innerWidth - largura - margem));
    const cabeEmbaixo = r.bottom + 4 + altura <= window.innerHeight - margem;
    const top = cabeEmbaixo ? r.bottom + 4 : Math.max(margem, r.top - 4 - altura);
    setPos({ top, left });
  }

  // Depois de abrir (e quando a lista muda de tamanho) recalcula com a medida real do popup
  useLayoutEffect(() => {
    if (aberto) posicionar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, busca, valores.length]);

  // Fecha só com clique fora ou Esc. Marcar uma opção muda o tamanho da tabela e
  // faz a página rolar; por isso a rolagem só reposiciona o popup, não fecha.
  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (ref.current?.contains(alvo) || popupRef.current?.contains(alvo)) return;
      setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    document.addEventListener("mousedown", fechar);
    document.addEventListener("keydown", tecla);
    window.addEventListener("scroll", posicionar, true);
    window.addEventListener("resize", posicionar);
    return () => {
      document.removeEventListener("mousedown", fechar);
      document.removeEventListener("keydown", tecla);
      window.removeEventListener("scroll", posicionar, true);
      window.removeEventListener("resize", posicionar);
    };
  }, [aberto]);

  const ativo = selecionados !== null;
  const t = busca.trim().toLowerCase();
  const visiveis = t ? valores.filter((v) => v.toLowerCase().includes(t)) : valores;
  const marcado = (v: string) => !selecionados || selecionados.has(v);
  const todosMarcados = visiveis.every(marcado);

  function alternar(v: string) {
    const s = new Set(selecionados ?? valores);
    if (s.has(v)) s.delete(v);
    else s.add(v);
    onChange(s.size === valores.length ? null : s);
  }

  function alternarTodos() {
    const s = new Set(selecionados ?? valores);
    for (const v of visiveis) {
      if (todosMarcados) s.delete(v);
      else s.add(v);
    }
    onChange(s.size === valores.length ? null : s);
  }

  return (
    <div ref={ref} className="relative inline-flex items-center gap-1">
      <span>{titulo}</span>
      <button
        type="button"
        ref={botaoRef}
        onClick={() => {
          posicionar();
          setAberto((a) => !a);
        }}
        title={ativo ? "Filtro ativo" : "Filtrar"}
        className="h-5 w-5 rounded text-[10px] leading-none"
        style={{
          color: ativo ? "#fff" : "var(--shell-subtext)",
          background: ativo ? "var(--via-teal, #1D9E75)" : "transparent",
          border: ativo ? "none" : "1px solid var(--shell-card-border)",
        }}
      >
        ▾
      </button>
      {aberto && pos && typeof document !== "undefined" && createPortal(
        <div
          ref={popupRef}
          className="fixed z-50 w-64 rounded-lg border shadow-lg p-2 font-normal normal-case"
          style={{ top: pos.top, left: pos.left, background: "var(--shell-card-bg)", borderColor: "var(--shell-card-border)" }}
        >
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar..."
            className="w-full h-8 rounded border px-2 text-xs mb-2 bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)] outline-none"
          />
          <label className="flex items-center gap-2 px-1 py-1 text-xs font-semibold cursor-pointer" style={{ color: "var(--shell-text)" }}>
            <input type="checkbox" checked={todosMarcados} onChange={alternarTodos} />
            Selecionar tudo
          </label>
          <div className="max-h-60 overflow-y-auto">
            {visiveis.map((v) => (
              <label key={v} className="flex items-center gap-2 px-1 py-1 text-xs cursor-pointer" style={{ color: "var(--shell-text)" }}>
                <input type="checkbox" checked={marcado(v)} onChange={() => alternar(v)} />
                <span className="truncate">{v}</span>
              </label>
            ))}
            {visiveis.length === 0 && (
              <p className="px-1 py-2 text-xs" style={{ color: "var(--shell-subtext)" }}>Nada encontrado.</p>
            )}
          </div>
          {ativo && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setAberto(false);
              }}
              className="mt-2 w-full text-xs font-medium py-1"
              style={{ color: "var(--via-teal, #1D9E75)" }}
            >
              Limpar filtro
            </button>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
