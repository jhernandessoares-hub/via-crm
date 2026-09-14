"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, Pencil, Check, X, MoveRight, Palette } from "lucide-react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import PipelineFlow from "./PipelineFlow";
import { GROUP_PALETTE, groupColor } from "@/lib/pipeline-groups";

type StageDTO = { id: string; key: string; name: string; sortOrder: number; group: string | null };
type GroupDTO = { id: string; key: string; name: string; color: string | null; sortOrder: number; stages: StageDTO[] };
type TransitionDTO = { id: string; fromStageId: string; toStageId: string };
type StructureDTO = { pipelineId: string; groups: GroupDTO[]; ungrouped: StageDTO[]; transitions: TransitionDTO[] };

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

function EditableName({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  if (!editing) {
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="truncate">{value}</span>
        <IconButton title="Renomear" onClick={() => setEditing(true)}>
          <Pencil className="h-3 w-3" />
        </IconButton>
      </div>
    );
  }

  const save = () => {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed && trimmed !== value) onSave(trimmed);
    else setDraft(value);
  };

  return (
    <div className="flex items-center gap-1 min-w-0">
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        className="w-full min-w-0 rounded-md border px-2 py-1 text-sm"
        style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
      />
      <IconButton title="Salvar" onClick={save}><Check className="h-3.5 w-3.5" /></IconButton>
      <IconButton title="Cancelar" onClick={() => { setDraft(value); setEditing(false); }}><X className="h-3.5 w-3.5" /></IconButton>
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
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-1.5 text-xs font-medium text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)] transition-colors w-full justify-center"
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
        style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
      />
      <IconButton title="Adicionar" onClick={submit}><Check className="h-3.5 w-3.5" /></IconButton>
      <IconButton title="Cancelar" onClick={() => { setValue(""); setOpen(false); }}><X className="h-3.5 w-3.5" /></IconButton>
    </div>
  );
}

/** Escolhe a cor da Etapa. Presets + cor livre + voltar para a automática. */
function ColorPicker({ value, current, onPick }: { value: string | null; current: string; onPick: (c: string | null) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <IconButton title="Cor da etapa" onClick={() => setOpen((o) => !o)}>
        <span className="flex items-center gap-1">
          <span className="block h-3.5 w-3.5 rounded-full border border-black/15" style={{ background: current }} />
          <Palette className="h-3 w-3" />
        </span>
      </IconButton>

      {open && (
        <div
          className="absolute right-0 top-8 z-20 w-52 rounded-xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-3 shadow-lg"
        >
          <div className="grid grid-cols-5 gap-2">
            {GROUP_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                onClick={() => { onPick(c); setOpen(false); }}
                className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
                style={{ background: c, borderColor: value?.toLowerCase() === c ? "var(--shell-text)" : "transparent" }}
              />
            ))}
          </div>

          <label className="mt-3 flex items-center gap-2 text-xs text-[var(--shell-subtext)]">
            <input
              type="color"
              value={current}
              onChange={(e) => onPick(e.target.value)}
              className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
            />
            Cor personalizada
          </label>

          <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2" style={{ borderColor: "var(--shell-divider)" }}>
            <button
              type="button"
              onClick={() => { onPick(null); setOpen(false); }}
              className="text-xs text-[var(--shell-subtext)] hover:underline"
            >
              Cor automática
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-xs font-medium text-[var(--shell-text)]">
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Seletor de destino que aparece embaixo do status quando se clica em "mover". */
function MoveTarget({
  groups,
  currentGroupId,
  onPick,
  onCancel,
}: {
  groups: GroupDTO[];
  currentGroupId: string | null;
  onPick: (groupId: string) => void;
  onCancel: () => void;
}) {
  const options = groups.filter((g) => g.id !== currentGroupId);
  return (
    <div className="flex items-center gap-1 px-2.5 pb-2">
      <MoveRight className="h-3.5 w-3.5 shrink-0 text-[var(--shell-subtext)]" />
      <select
        autoFocus
        defaultValue=""
        onChange={(e) => e.target.value && onPick(e.target.value)}
        className="w-full min-w-0 rounded-md border px-2 py-1 text-xs"
        style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
      >
        <option value="" disabled>Mover para a etapa...</option>
        {options.map((g) => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </select>
      <IconButton title="Cancelar" onClick={onCancel}><X className="h-3.5 w-3.5" /></IconButton>
    </div>
  );
}

export default function PipelineSettingsPage() {
  const [data, setData] = useState<StructureDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"colunas" | "fluxo">("colunas");
  const [movingId, setMovingId] = useState<string | null>(null);

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
    const groups = [...data.groups].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = groups.findIndex((g) => g.id === group.id);
    const swapWith = groups[idx + direction];
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

  const deleteStage = (id: string) => {
    if (!confirm("Remover este status? Só é possível se não houver nenhum lead nele.")) return;
    withErrorHandling(() => apiFetch(`/pipeline/stages/${id}`, { method: "DELETE" }));
  };

  const reorderStage = (groupStages: StageDTO[], stage: StageDTO, direction: -1 | 1) => {
    const sorted = [...groupStages].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((s) => s.id === stage.id);
    const swapWith = sorted[idx + direction];
    if (!swapWith) return;
    withErrorHandling(async () => {
      await apiFetch(`/pipeline/stages/${stage.id}`, { method: "PATCH", body: JSON.stringify({ sortOrder: swapWith.sortOrder }) });
      await apiFetch(`/pipeline/stages/${swapWith.id}`, { method: "PATCH", body: JSON.stringify({ sortOrder: stage.sortOrder }) });
    });
  };

  /** Move um ou vários status pra dentro de uma Etapa. Só troca a que Etapa o
   *  status pertence — nenhum lead muda de status nem sai do lugar. */
  const moveStagesToGroup = (stageIds: string[], groupId: string) => {
    if (!groupId || stageIds.length === 0) return;
    setMovingId(null);
    withErrorHandling(async () => {
      for (const id of stageIds) {
        await apiFetch(`/pipeline/stages/${id}/group`, { method: "PATCH", body: JSON.stringify({ groupId }) });
      }
    });
  };

  if (loading) {
    return (
      <AppShell title="Etapas e Status">
        <div className="flex items-center justify-center h-64 text-[var(--shell-subtext)]">Carregando...</div>
      </AppShell>
    );
  }

  const groups = (data?.groups ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const ungrouped = (data?.ungrouped ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <AppShell title="Etapas e Status">
      <div className="max-w-full py-8 px-4 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--shell-text)]">Etapas e Status</h1>
          <p className="text-sm text-[var(--shell-subtext)] mt-1">
            As Etapas são as colunas do seu funil. Cada Etapa tem Status dentro dela — os passos que um lead passa
            até avançar para a próxima Etapa. Isso reflete exatamente o funil que sua conta usa hoje.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>
        )}

        <div className="flex gap-2">
          {([["colunas", "Colunas"], ["fluxo", "Fluxo"]] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className="rounded-xl px-4 py-2 text-sm font-medium transition-colors"
              style={tab === key
                ? { background: "#1D9E75", color: "#fff" }
                : { background: "var(--shell-hover)", color: "var(--shell-subtext)" }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "fluxo" && data && <PipelineFlow data={data} onChanged={load} />}

        {tab === "colunas" && (
        <div className="flex gap-4 overflow-x-auto pb-4 items-start">
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
                <div className="flex items-center justify-between gap-2 pb-3 border-b" style={{ borderColor: "var(--shell-divider)" }}>
                  <div className="font-bold text-[15px] min-w-0 flex-1" style={{ color }}>
                    <EditableName value={group.name} onSave={(v) => renameGroup(group.id, v)} />
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <ColorPicker value={group.color} current={color} onPick={(c) => setGroupColor(group.id, c)} />
                    <IconButton title="Mover etapa para a esquerda" onClick={() => reorderGroup(group, -1)}><ChevronUp className="h-3.5 w-3.5 -rotate-90" /></IconButton>
                    <IconButton title="Mover etapa para a direita" onClick={() => reorderGroup(group, 1)}><ChevronDown className="h-3.5 w-3.5 -rotate-90" /></IconButton>
                    <IconButton title="Remover etapa" danger onClick={() => deleteGroup(group.id)}><Trash2 className="h-3.5 w-3.5" /></IconButton>
                  </div>
                </div>

                <div className="pt-3 space-y-1.5">
                  {stages.map((stage) => (
                    <div
                      key={stage.id}
                      className="rounded-lg text-[15px] font-medium"
                      style={{ background: `${color}14`, borderLeft: `4px solid ${color}` }}
                    >
                      <div className="flex items-center justify-between gap-1.5 px-2.5 py-2">
                        <div className="min-w-0 flex-1 text-[var(--shell-text)]">
                          <EditableName value={stage.name} onSave={(v) => renameStage(stage.id, v)} />
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <IconButton title="Mover para cima" onClick={() => reorderStage(stages, stage, -1)}><ChevronUp className="h-3.5 w-3.5" /></IconButton>
                          <IconButton title="Mover para baixo" onClick={() => reorderStage(stages, stage, 1)}><ChevronDown className="h-3.5 w-3.5" /></IconButton>
                          <IconButton title="Mover para outra etapa" onClick={() => setMovingId(movingId === stage.id ? null : stage.id)}><MoveRight className="h-3.5 w-3.5" /></IconButton>
                          <IconButton title="Remover status" danger onClick={() => deleteStage(stage.id)}><Trash2 className="h-3.5 w-3.5" /></IconButton>
                        </div>
                      </div>
                      {movingId === stage.id && (
                        <MoveTarget
                          groups={groups}
                          currentGroupId={group.id}
                          onPick={(groupId) => moveStagesToGroup([stage.id], groupId)}
                          onCancel={() => setMovingId(null)}
                        />
                      )}
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
                <div className="pb-3 border-b" style={{ borderColor: "var(--shell-divider)" }}>
                  <span className="font-bold text-[15px] text-[var(--shell-subtext)]">Sem etapa</span>
                  <p className="mt-1 text-[11px] leading-snug text-[var(--shell-subtext)]">
                    Status do funil antigo, de antes de existir Etapa. Use a seta para colocar cada um
                    dentro de uma Etapa — nenhum lead sai do lugar.
                  </p>
                </div>
                <div className="pt-3 space-y-1.5">
                  {ungrouped.map((stage) => (
                    <div key={stage.id} className="rounded-lg text-[15px] font-medium" style={{ background: "var(--shell-hover)" }}>
                      <div className="flex items-center justify-between gap-1.5 px-2.5 py-2">
                        <div className="min-w-0 flex-1 text-[var(--shell-text)]">
                          <EditableName value={stage.name} onSave={(v) => renameStage(stage.id, v)} />
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <IconButton title="Mover para uma etapa" onClick={() => setMovingId(movingId === stage.id ? null : stage.id)}><MoveRight className="h-3.5 w-3.5" /></IconButton>
                          <IconButton title="Remover status" danger onClick={() => deleteStage(stage.id)}><Trash2 className="h-3.5 w-3.5" /></IconButton>
                        </div>
                      </div>
                      {movingId === stage.id && (
                        <MoveTarget
                          groups={groups}
                          currentGroupId={null}
                          onPick={(groupId) => moveStagesToGroup([stage.id], groupId)}
                          onCancel={() => setMovingId(null)}
                        />
                      )}
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
        )}
      </div>
    </AppShell>
  );
}
