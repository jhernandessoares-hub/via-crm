"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Plus, Trash2, ChevronLeft, ChevronRight, Pencil, Check, X,
  MoveRight, Palette, MoreVertical, GripVertical, LogIn,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import PipelineFlow from "./PipelineFlow";
import { GROUP_PALETTE, groupColor } from "@/lib/pipeline-groups";

type StageDTO = { id: string; key: string; name: string; sortOrder: number; group: string | null; isEntryPoint?: boolean };
type GroupDTO = { id: string; key: string; name: string; color: string | null; sortOrder: number; stages: StageDTO[] };
type TransitionDTO = { id: string; fromStageId: string; toStageId: string };
type StructureDTO = { pipelineId: string; groups: GroupDTO[]; ungrouped: StageDTO[]; transitions: TransitionDTO[] };

const INPUT_STYLE = {
  background: "var(--shell-input-bg)",
  color: "var(--shell-input-text)",
  borderColor: "var(--shell-input-border)",
};

/** Fecha um popover com Escape. */
function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
}

function IconButton({ onClick, title, danger, children }: { onClick: () => void; title: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1 rounded-md hover:bg-[var(--shell-hover)] transition-colors ${danger ? "text-red-500" : "text-[var(--shell-subtext)]"}`}
    >
      {children}
    </button>
  );
}

/** Nome editável. O modo de edição é controlado de fora, porque quem dispara é o menu. */
function EditableName({
  value,
  editing,
  onEditingChange,
  onSave,
}: {
  value: string;
  editing: boolean;
  onEditingChange: (v: boolean) => void;
  onSave: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  if (!editing) return <span className="block break-words leading-snug">{value}</span>;

  const save = () => {
    const trimmed = draft.trim();
    onEditingChange(false);
    if (trimmed && trimmed !== value) onSave(trimmed);
    else setDraft(value);
  };

  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") { setDraft(value); onEditingChange(false); }
        }}
        className="w-full min-w-0 rounded-md border px-2 py-1 text-sm"
        style={INPUT_STYLE}
      />
      <IconButton title="Salvar" onClick={save}><Check className="h-3.5 w-3.5" /></IconButton>
      <IconButton title="Cancelar" onClick={() => { setDraft(value); onEditingChange(false); }}><X className="h-3.5 w-3.5" /></IconButton>
    </div>
  );
}

function AddInline({ placeholder, onAdd }: { placeholder: string; onAdd: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-1.5 text-xs font-medium text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)] transition-colors"
        style={{ borderColor: "var(--shell-card-border)" }}
      >
        <Plus className="h-3.5 w-3.5" /> {placeholder}
      </button>
    );
  }

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed) onAdd(trimmed);
    setValue("");
    setOpen(false);
  };

  return (
    <div className="mt-2 flex items-center gap-1">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") { setValue(""); setOpen(false); }
        }}
        placeholder={placeholder}
        className="w-full min-w-0 rounded-md border px-2 py-1 text-sm"
        style={INPUT_STYLE}
      />
      <IconButton title="Adicionar" onClick={submit}><Check className="h-3.5 w-3.5" /></IconButton>
      <IconButton title="Cancelar" onClick={() => { setValue(""); setOpen(false); }}><X className="h-3.5 w-3.5" /></IconButton>
    </div>
  );
}

const MENU_WIDTH = 224; // w-56

/**
 * Menu de ações — um botão só no lugar dos 5 ícones que comiam o nome.
 *
 * O painel vai num portal com `position: fixed`, NÃO dentro do card. O card tem
 * `overflow-hidden` (por causa da faixa colorida arredondada no topo) e a faixa
 * de colunas tem `overflow-x-auto` — que no CSS também passa a cortar na
 * vertical. Com o painel posicionado de forma absoluta lá dentro, o menu do
 * último status de cada coluna era recortado por inteiro: clicava e não
 * aparecia nada.
 */
function RowMenu({ title, children }: { title: string; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEscape(open, () => setOpen(false));

  const toggle = () => {
    if (open) { setOpen(false); return; }
    const r = anchor.current?.getBoundingClientRect();
    if (!r) return;
    // Sem espaço embaixo? abre para cima, ancorado no topo do botão.
    const abreParaCima = window.innerHeight - r.bottom < 300;
    setPos({
      left: Math.max(8, Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
      ...(abreParaCima ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
    });
    setOpen(true);
  };

  // Flutuando por cima de tudo, tem que fechar ao clicar fora e ao rolar a tela,
  // senão fica "solto" longe do botão que o abriu.
  useEffect(() => {
    if (!open) return;
    const fora = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !anchor.current?.contains(t)) setOpen(false);
    };
    const fecha = () => setOpen(false);
    document.addEventListener("mousedown", fora);
    window.addEventListener("scroll", fecha, true);
    window.addEventListener("resize", fecha);
    return () => {
      document.removeEventListener("mousedown", fora);
      window.removeEventListener("scroll", fecha, true);
      window.removeEventListener("resize", fecha);
    };
  }, [open]);

  return (
    <div ref={anchor} className="shrink-0">
      <IconButton title={title} onClick={toggle}>
        <MoreVertical className="h-4 w-4" />
      </IconButton>
      {open && pos && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panel}
            className="fixed z-[100] w-56 overflow-y-auto rounded-xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-1.5 shadow-xl"
            style={{ top: pos.top, bottom: pos.bottom, left: pos.left, maxHeight: "min(70vh, 420px)" }}
          >
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </div>
  );
}

function MenuItem({ onClick, danger, icon, children }: { onClick: () => void; danger?: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-[var(--shell-hover)] transition-colors ${danger ? "text-red-500" : "text-[var(--shell-text)]"}`}
    >
      <span className="shrink-0">{icon}</span>
      {children}
    </button>
  );
}

function MenuDivider() {
  return <div className="my-1 h-px" style={{ background: "var(--shell-divider)" }} />;
}

/** Grade de cores da Etapa, usada dentro do menu. */
function ColorSwatches({ value, current, onPick }: { value: string | null; current: string; onPick: (c: string | null) => void }) {
  return (
    <div className="px-2.5 py-2">
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--shell-subtext)]">
        <Palette className="h-3.5 w-3.5" /> Cor da etapa
      </p>
      <div className="grid grid-cols-5 gap-1.5">
        {GROUP_PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            onClick={() => onPick(c)}
            className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
            style={{ background: c, borderColor: value?.toLowerCase() === c ? "var(--shell-text)" : "transparent" }}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <input
          type="color"
          value={current}
          onChange={(e) => onPick(e.target.value)}
          className="h-6 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
          title="Cor personalizada"
        />
        <button type="button" onClick={() => onPick(null)} className="text-xs text-[var(--shell-subtext)] hover:underline">
          Cor automática
        </button>
      </div>
    </div>
  );
}

export default function PipelineSettingsPage() {
  const [data, setData] = useState<StructureDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"colunas" | "fluxo">("colunas");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ stageId: string; groupId: string } | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);

  // O backend já recusa (requireOwner em todas as rotas de edição) e o item some do
  // menu de Configurações, mas quem digita a URL direto merece o motivo, e não um
  // "não foi possível carregar" genérico. Mesmo padrão de /settings/branding.
  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      if (user?.role !== "OWNER") setUnauthorized(true);
    } catch { /* sem user no storage — o AuthGuard cuida */ }
  }, []);

  const load = () => {
    setLoading(true);
    apiFetch("/pipeline/structure")
      .then((d: any) => setData(d))
      .catch(() => setError("Não foi possível carregar a pipeline."))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const withErrorHandling = async (fn: () => Promise<any>) => {
    setError(null);
    try {
      await fn();
      load();
    } catch (e: any) {
      setError(e?.message || "Não foi possível concluir a ação.");
    }
  };

  const addGroup = (name: string) =>
    withErrorHandling(() => apiFetch("/pipeline/groups", { method: "POST", body: JSON.stringify({ name }) }));

  const renameGroup = (id: string, name: string) =>
    withErrorHandling(() => apiFetch(`/pipeline/groups/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }));

  const setGroupColor = (id: string, color: string | null) =>
    withErrorHandling(() => apiFetch(`/pipeline/groups/${id}`, { method: "PATCH", body: JSON.stringify({ color }) }));

  const deleteGroup = (id: string) => {
    if (!confirm("Remover esta etapa? Só é possível se ela não tiver nenhum status dentro.")) return;
    withErrorHandling(() => apiFetch(`/pipeline/groups/${id}`, { method: "DELETE" }));
  };

  const reorderGroup = (group: GroupDTO, direction: -1 | 1) => {
    if (!data) return;
    const gs = [...data.groups].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = gs.findIndex((g) => g.id === group.id);
    const swapWith = gs[idx + direction];
    if (!swapWith) return;
    withErrorHandling(async () => {
      await apiFetch(`/pipeline/groups/${group.id}`, { method: "PATCH", body: JSON.stringify({ sortOrder: swapWith.sortOrder }) });
      await apiFetch(`/pipeline/groups/${swapWith.id}`, { method: "PATCH", body: JSON.stringify({ sortOrder: group.sortOrder }) });
    });
  };

  const addStage = (groupId: string, name: string) =>
    withErrorHandling(() => apiFetch("/pipeline/stages", { method: "POST", body: JSON.stringify({ name, groupId }) }));

  const renameStage = (id: string, name: string) =>
    withErrorHandling(() => apiFetch(`/pipeline/stages/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }));

  /** Marca onde o lead novo nasce. Exatamente um por funil — o backend desmarca o anterior. */
  const setEntryStage = (id: string) =>
    withErrorHandling(() => apiFetch(`/pipeline/stages/${id}/entry`, { method: "PATCH" }));

  const deleteStage = (id: string) => {
    if (!confirm("Remover este status? Só é possível se não houver nenhum lead nele.")) return;
    withErrorHandling(() => apiFetch(`/pipeline/stages/${id}`, { method: "DELETE" }));
  };

  /** Trocar um Status de Etapa não move lead — só muda a que Etapa ele pertence. */
  const moveStageToGroup = (stageId: string, groupId: string) => {
    if (!groupId) return;
    withErrorHandling(() => apiFetch(`/pipeline/stages/${stageId}/group`, { method: "PATCH", body: JSON.stringify({ groupId }) }));
  };

  /** Solta o status arrastado antes do alvo e grava a ordem inteira de uma vez. */
  const dropOn = (group: GroupDTO, targetId: string) => {
    const d = drag;
    setDrag(null);
    setOverId(null);
    if (!d || d.groupId !== group.id || d.stageId === targetId) return;

    const ordered = group.stages.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((s) => s.id);
    const from = ordered.indexOf(d.stageId);
    if (from < 0) return;
    ordered.splice(from, 1);
    const to = ordered.indexOf(targetId);
    ordered.splice(to < 0 ? ordered.length : to, 0, d.stageId);

    withErrorHandling(() =>
      apiFetch("/pipeline/stages/reorder", {
        method: "PATCH",
        body: JSON.stringify({ groupId: group.id, orderedStageIds: ordered }),
      }),
    );
  };

  if (unauthorized) {
    return (
      <AppShell title="Etapas e Status">
        <div className="flex h-64 items-center justify-center text-[var(--shell-subtext)]">
          Acesso restrito ao proprietário da conta.
        </div>
      </AppShell>
    );
  }

  if (loading) {
    return (
      <AppShell title="Etapas e Status">
        <div className="flex h-64 items-center justify-center text-[var(--shell-subtext)]">Carregando...</div>
      </AppShell>
    );
  }

  const groups = (data?.groups ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const ungrouped = (data?.ungrouped ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <AppShell title="Etapas e Status">
      <div className="max-w-full space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--shell-text)]">Etapas e Status</h1>
          <p className="mt-1 text-sm text-[var(--shell-subtext)]">
            As Etapas são as colunas do seu funil. Cada Etapa tem Status dentro dela — os passos que um lead passa
            até avançar para a próxima Etapa. Isso reflete exatamente o funil que sua conta usa hoje.
          </p>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>}

        <div className="flex gap-2">
          {([["colunas", "Colunas"], ["fluxo", "Fluxo"]] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className="rounded-xl px-4 py-2 text-sm font-medium transition-colors"
              style={tab === key ? { background: "#1D9E75", color: "#fff" } : { background: "var(--shell-hover)", color: "var(--shell-subtext)" }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "fluxo" && data && <PipelineFlow data={data} onChanged={load} />}

        {tab === "colunas" && (
          <>
            <p className="text-xs text-[var(--shell-subtext)]">
              Arraste um status pela alça <GripVertical className="inline h-3 w-3" /> para mudar a ordem dentro da
              Etapa. O botão <MoreVertical className="inline h-3 w-3" /> abre as opções de renomear, mudar de Etapa,
              cor e excluir.
            </p>

            <div className="flex items-start gap-4 overflow-x-auto pb-4">
              {groups.map((group, groupIdx) => {
                const stages = group.stages.slice().sort((a, b) => a.sortOrder - b.sortOrder);
                const color = groupColor(group.color, groupIdx);
                return (
                  <div
                    key={group.id}
                    className="w-72 shrink-0 overflow-hidden rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)]"
                  >
                    <div style={{ background: color, height: 6 }} />
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2 border-b pb-3" style={{ borderColor: "var(--shell-divider)" }}>
                        <div className="min-w-0 flex-1 text-[15px] font-bold" style={{ color }}>
                          <EditableName
                            value={group.name}
                            editing={editingId === group.id}
                            onEditingChange={(v) => setEditingId(v ? group.id : null)}
                            onSave={(v) => renameGroup(group.id, v)}
                          />
                        </div>
                        <RowMenu title="Opções da etapa">
                          {(close) => (
                            <>
                              <MenuItem icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => { setEditingId(group.id); close(); }}>
                                Renomear
                              </MenuItem>
                              <MenuDivider />
                              <ColorSwatches value={group.color} current={color} onPick={(c) => { setGroupColor(group.id, c); close(); }} />
                              <MenuDivider />
                              <MenuItem icon={<ChevronLeft className="h-3.5 w-3.5" />} onClick={() => { reorderGroup(group, -1); close(); }}>
                                Mover para a esquerda
                              </MenuItem>
                              <MenuItem icon={<ChevronRight className="h-3.5 w-3.5" />} onClick={() => { reorderGroup(group, 1); close(); }}>
                                Mover para a direita
                              </MenuItem>
                              <MenuDivider />
                              <MenuItem danger icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => { deleteGroup(group.id); close(); }}>
                                Excluir etapa
                              </MenuItem>
                            </>
                          )}
                        </RowMenu>
                      </div>

                      <div className="space-y-1.5 pt-3">
                        {stages.map((stage) => (
                          <div
                            key={stage.id}
                            onDragOver={(e) => {
                              if (drag?.groupId !== group.id) return;
                              e.preventDefault();
                              setOverId(stage.id);
                            }}
                            onDrop={(e) => { e.preventDefault(); dropOn(group, stage.id); }}
                            className="rounded-lg text-[15px] font-medium transition-shadow"
                            style={{
                              background: `${color}14`,
                              borderLeft: `4px solid ${color}`,
                              boxShadow: overId === stage.id && drag?.stageId !== stage.id ? `0 -2px 0 0 ${color}` : undefined,
                              opacity: drag?.stageId === stage.id ? 0.4 : 1,
                            }}
                          >
                            <div className="flex items-start gap-1 px-1.5 py-2">
                              <span
                                draggable
                                onDragStart={() => setDrag({ stageId: stage.id, groupId: group.id })}
                                onDragEnd={() => { setDrag(null); setOverId(null); }}
                                title="Arraste para mudar a ordem"
                                className="mt-0.5 shrink-0 cursor-grab p-0.5 text-[var(--shell-subtext)] active:cursor-grabbing"
                              >
                                <GripVertical className="h-4 w-4" />
                              </span>
                              <div className="min-w-0 flex-1 py-0.5 text-[var(--shell-text)]">
                                <EditableName
                                  value={stage.name}
                                  editing={editingId === stage.id}
                                  onEditingChange={(v) => setEditingId(v ? stage.id : null)}
                                  onSave={(v) => renameStage(stage.id, v)}
                                />
                                {stage.isEntryPoint && (
                                  <span
                                    className="mt-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                                    style={{ background: `${color}2e`, color }}
                                    title="Todo lead novo nasce neste status"
                                  >
                                    <LogIn className="h-2.5 w-2.5" /> Entrada dos leads
                                  </span>
                                )}
                              </div>
                              <RowMenu title="Opções do status">
                                {(close) => (
                                  <>
                                    <MenuItem icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => { setEditingId(stage.id); close(); }}>
                                      Renomear
                                    </MenuItem>
                                    {!stage.isEntryPoint && (
                                      <MenuItem icon={<LogIn className="h-3.5 w-3.5" />} onClick={() => { setEntryStage(stage.id); close(); }}>
                                        Entrada dos leads novos
                                      </MenuItem>
                                    )}
                                    <MenuDivider />
                                    <div className="px-2.5 py-2">
                                      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--shell-subtext)]">
                                        <MoveRight className="h-3.5 w-3.5" /> Mover para a etapa
                                      </p>
                                      <select
                                        defaultValue=""
                                        onChange={(e) => { if (e.target.value) { moveStageToGroup(stage.id, e.target.value); close(); } }}
                                        className="w-full rounded-md border px-2 py-1 text-xs"
                                        style={INPUT_STYLE}
                                      >
                                        <option value="" disabled>Escolha a etapa...</option>
                                        {groups.filter((g) => g.id !== group.id).map((g) => (
                                          <option key={g.id} value={g.id}>{g.name}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <MenuDivider />
                                    <MenuItem danger icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => { deleteStage(stage.id); close(); }}>
                                      Excluir status
                                    </MenuItem>
                                  </>
                                )}
                              </RowMenu>
                            </div>
                          </div>
                        ))}
                        <AddInline placeholder="Novo status" onAdd={(name) => addStage(group.id, name)} />
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Funil legado (anterior a existir Etapa) — sem isto, um tenant cujos
                  status estão todos soltos abriria esta tela em branco. */}
              {ungrouped.length > 0 && (
                <div className="w-72 shrink-0 overflow-hidden rounded-2xl border border-dashed border-[var(--shell-card-border)] bg-[var(--shell-card-bg)]">
                  <div style={{ background: "#94a3b8", height: 6 }} />
                  <div className="p-4">
                    <div className="border-b pb-3" style={{ borderColor: "var(--shell-divider)" }}>
                      <span className="text-[15px] font-bold text-[var(--shell-subtext)]">Sem etapa</span>
                      <p className="mt-1 text-[11px] leading-snug text-[var(--shell-subtext)]">
                        Status do funil antigo, de antes de existir Etapa. Use o menu para colocar cada um dentro de
                        uma Etapa — nenhum lead sai do lugar.
                      </p>
                    </div>
                    <div className="space-y-1.5 pt-3">
                      {ungrouped.map((stage) => (
                        <div key={stage.id} className="rounded-lg text-[15px] font-medium" style={{ background: "var(--shell-hover)" }}>
                          <div className="flex items-start gap-1 px-2.5 py-2">
                            <div className="min-w-0 flex-1 py-0.5 text-[var(--shell-text)]">
                              <EditableName
                                value={stage.name}
                                editing={editingId === stage.id}
                                onEditingChange={(v) => setEditingId(v ? stage.id : null)}
                                onSave={(v) => renameStage(stage.id, v)}
                              />
                            </div>
                            <RowMenu title="Opções do status">
                              {(close) => (
                                <>
                                  <MenuItem icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => { setEditingId(stage.id); close(); }}>
                                    Renomear
                                  </MenuItem>
                                  <MenuDivider />
                                  <div className="px-2.5 py-2">
                                    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--shell-subtext)]">
                                      <MoveRight className="h-3.5 w-3.5" /> Mover para a etapa
                                    </p>
                                    <select
                                      defaultValue=""
                                      onChange={(e) => { if (e.target.value) { moveStageToGroup(stage.id, e.target.value); close(); } }}
                                      className="w-full rounded-md border px-2 py-1 text-xs"
                                      style={INPUT_STYLE}
                                    >
                                      <option value="" disabled>Escolha a etapa...</option>
                                      {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                                    </select>
                                  </div>
                                  <MenuDivider />
                                  <MenuItem danger icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => { deleteStage(stage.id); close(); }}>
                                    Excluir status
                                  </MenuItem>
                                </>
                              )}
                            </RowMenu>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="w-72 shrink-0">
                <AddInline placeholder="Nova etapa" onAdd={addGroup} />
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
