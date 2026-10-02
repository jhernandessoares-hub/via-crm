"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  addEdge,
  reconnectEdge,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus, Trash2, Pencil, Check, X, Unlink } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { groupColor } from "@/lib/pipeline-groups";

type StageDTO = {
  id: string;
  key: string;
  name: string;
  sortOrder: number;
  group: string | null;
  posX?: number | null;
  posY?: number | null;
};
type GroupDTO = { id: string; key: string; name: string; color: string | null; sortOrder: number; stages: StageDTO[] };
type TransitionDTO = {
  id: string;
  fromStageId: string;
  toStageId: string;
  forwardRoles?: string[];
  forwardUserIds?: string[];
  backRoles?: string[];
  backUserIds?: string[];
};
type EdgePerms = { forwardRoles: string[]; forwardUserIds: string[]; backRoles: string[]; backUserIds: string[] };
type PermField = keyof EdgePerms;
type TeamUser = { id: string; nome: string; role: string; ativo: boolean };

const ROLE_OPTIONS = [
  { value: "MANAGER", label: "Gerente" },
  { value: "AGENT", label: "Corretor" },
  { value: "PARTNER", label: "Externo Consultivo" },
];

const permsOf = (t: { forwardRoles?: string[]; forwardUserIds?: string[]; backRoles?: string[]; backUserIds?: string[] }): EdgePerms => ({
  forwardRoles: t.forwardRoles ?? [],
  forwardUserIds: t.forwardUserIds ?? [],
  backRoles: t.backRoles ?? [],
  backUserIds: t.backUserIds ?? [],
});
type StructureDTO = { pipelineId: string; groups: GroupDTO[]; ungrouped: StageDTO[]; transitions: TransitionDTO[] };

// Layout padrão: cada Etapa é uma linha, os status vão da esquerda para a direita
// e, passando de STAGES_PER_LINE, quebram para a linha de baixo.
const COLUMN_WIDTH = 260;
const LINE_HEIGHT = 110;
const GROUP_GAP = 50;
const STAGES_PER_LINE = 6;
const NODE_WIDTH = 220;
const SAVE_DEBOUNCE_MS = 800;

const EDGE_COLOR = "#64748B";
/** Bolinha/ponta de ENTRADA do status (verde) e de SAÍDA (laranja). */
const IN_COLOR = "#16A34A";
const OUT_COLOR = "#F97316";
const EDGE_COLOR_SELECTED = "#1D9E75";
const EDGE_WIDTH = 3;
const EDGE_WIDTH_SELECTED = 5;

type EdgeMode = "normal" | "selected" | "in" | "out" | "dim";

/** Estilo de uma seta. Com um status selecionado: entra = verde, sai = laranja, resto apagado. */
function edgeStyle(mode: EdgeMode) {
  const color =
    mode === "selected" ? EDGE_COLOR_SELECTED : mode === "in" ? IN_COLOR : mode === "out" ? OUT_COLOR : EDGE_COLOR;
  const width = mode === "selected" ? EDGE_WIDTH_SELECTED : mode === "in" || mode === "out" ? 4 : EDGE_WIDTH;
  const opacity = mode === "dim" ? 0.12 : 1;
  return {
    style: { strokeWidth: width, stroke: color, opacity },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 20,
      height: 20,
      color: mode === "out" ? OUT_COLOR : mode === "dim" ? EDGE_COLOR : IN_COLOR,
    },
  };
}

type StageNodeData = { label: string; color: string; groupName: string; groupId: string | null };

function StageNode({ data, selected }: NodeProps<Node<StageNodeData>>) {
  return (
    <div style={{ width: NODE_WIDTH }}>
      <div className="mb-1 truncate px-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--shell-subtext)]">
        {data.groupName}
      </div>
      <div
        className="relative rounded-xl px-4 py-3 text-center text-sm font-bold leading-snug text-white shadow-sm"
        style={{
          background: data.color,
          outline: selected ? "3px solid #111827" : "none",
          outlineOffset: 2,
        }}
      >
        <Handle
          type="target"
          position={Position.Left}
          style={{ width: 14, height: 14, background: IN_COLOR, border: "3px solid #fff", boxShadow: "0 0 0 1px #15803d" }}
        />
        {data.label}
        <Handle
          type="source"
          position={Position.Right}
          style={{ width: 14, height: 14, background: OUT_COLOR, border: "3px solid #fff", boxShadow: "0 0 0 1px #c2410c" }}
        />
      </div>
    </div>
  );
}

const nodeTypes = { stageNode: StageNode };

export default function PipelineFlow({ data, onChanged }: { data: StructureDTO; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGroupId, setNewGroupId] = useState("");

  const groups = useMemo(() => data.groups.slice().sort((a, b) => a.sortOrder - b.sortOrder), [data.groups]);

  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: Node<StageNodeData>[] = [];

    const push = (s: StageDTO, groupName: string, groupId: string | null, color: string, index: number, yBase: number) => {
      const col = index % STAGES_PER_LINE;
      const line = Math.floor(index / STAGES_PER_LINE);
      nodes.push({
        id: s.id,
        type: "stageNode",
        position:
          s.posX != null && s.posY != null
            ? { x: s.posX, y: s.posY }
            : { x: col * COLUMN_WIDTH, y: yBase + line * LINE_HEIGHT },
        data: { label: s.name, color, groupName, groupId },
      });
    };

    let yBase = 0;
    groups.forEach((g, gi) => {
      const color = groupColor(g.color, gi);
      const sorted = g.stages.slice().sort((a, b) => a.sortOrder - b.sortOrder);
      sorted.forEach((s, i) => push(s, g.name, g.id, color, i, yBase));
      yBase += Math.max(1, Math.ceil(sorted.length / STAGES_PER_LINE)) * LINE_HEIGHT + GROUP_GAP;
    });

    data.ungrouped.forEach((s, i) => push(s, "Sem etapa", null, "#64748B", i, yBase));

    const edges: Edge[] = data.transitions.map((t) => ({
      id: t.id,
      source: t.fromStageId,
      target: t.toStageId,
      data: permsOf(t),
      ...edgeStyle("normal"),
    }));

    return { initialNodes: nodes, initialEdges: edges };
  }, [groups, data.ungrouped, data.transitions]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // repinta: seta selecionada mais grossa; com status selecionado, entra = verde, sai = laranja
  const selectedIds = useMemo(() => new Set(nodes.filter((n) => n.selected).map((n) => n.id)), [nodes]);
  const paintedEdges = useMemo(
    () =>
      edges.map((e) => {
        let mode: EdgeMode = "normal";
        if (e.selected) mode = "selected";
        else if (selectedIds.size > 0) {
          const out = selectedIds.has(e.source);
          const inn = selectedIds.has(e.target);
          mode = out && !inn ? "out" : inn && !out ? "in" : out && inn ? "normal" : "dim";
        }
        return { ...e, ...edgeStyle(mode), zIndex: mode === "in" || mode === "out" || mode === "selected" ? 10 : 0 };
      }),
    [edges, selectedIds],
  );

  const selectedNodes = useMemo(() => nodes.filter((n) => n.selected), [nodes]);
  const selectedEdge = useMemo(() => edges.find((e) => e.selected) ?? null, [edges]);
  const nameById = useMemo(() => new Map(nodes.map((n) => [n.id, (n.data as StageNodeData).label])), [nodes]);

  // ── posições: acumula o que foi arrastado e grava em lote ────────────────────
  const pending = useRef<Map<string, { posX: number; posY: number }>>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPositions = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (pending.current.size === 0) return;
    const positions = [...pending.current.entries()].map(([stageId, p]) => ({ stageId, ...p }));
    pending.current.clear();
    setSaving(true);
    try {
      await apiFetch("/pipeline/stages/positions", { method: "PATCH", body: JSON.stringify({ positions }) });
    } catch (e: any) {
      setError(e?.message || "Não foi possível salvar a posição.");
    } finally {
      setSaving(false);
    }
  }, []);

  const queuePositions = useCallback(
    (moved: Node[]) => {
      for (const n of moved) pending.current.set(n.id, { posX: n.position.x, posY: n.position.y });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flushPositions, SAVE_DEBOUNCE_MS);
    },
    [flushPositions],
  );

  useEffect(() => () => void flushPositions(), [flushPositions]);

  // arrastar um nó sozinho leva junto todos os que estiverem selecionados
  const onNodeDragStop = useCallback(
    (_: unknown, node: Node, dragged: Node[]) => queuePositions(dragged?.length ? dragged : [node]),
    [queuePositions],
  );
  const onSelectionDragStop = useCallback((_: unknown, ns: Node[]) => queuePositions(ns), [queuePositions]);

  // ── setas: criar, religar, excluir ──────────────────────────────────────────
  const onConnect = useCallback(
    async (connection: Connection) => {
      setError(null);
      try {
        const created: TransitionDTO = await apiFetch("/pipeline/transitions", {
          method: "POST",
          body: JSON.stringify({ fromStageId: connection.source, toStageId: connection.target }),
        });
        setEdges((eds) => addEdge({ ...connection, id: created.id, data: permsOf(created), ...edgeStyle("normal") }, eds));
      } catch (e: any) {
        setError(e?.message || "Não foi possível criar essa transição.");
      }
    },
    [setEdges],
  );

  /** Desvincular/editar: arrasta a ponta da seta pra outro status. */
  const onReconnect = useCallback(
    async (oldEdge: Edge, newConnection: Connection) => {
      setError(null);
      try {
        const created: TransitionDTO = await apiFetch("/pipeline/transitions", {
          method: "POST",
          body: JSON.stringify({ fromStageId: newConnection.source, toStageId: newConnection.target }),
        });
        // Se largou de volta no mesmo par, o upsert devolve a MESMA linha —
        // apagar aqui destruiria a seta que o usuário acabou de reposicionar.
        if (created.id !== oldEdge.id) {
          await apiFetch(`/pipeline/transitions/${oldEdge.id}`, { method: "DELETE" });
        }
        setEdges((eds) =>
          reconnectEdge(oldEdge, newConnection, eds).map((e) =>
            e.id === oldEdge.id ? { ...e, id: created.id } : e,
          ),
        );
      } catch (e: any) {
        setError(e?.message || "Não foi possível religar essa seta.");
      }
    },
    [setEdges],
  );

  const onEdgesDelete = useCallback(async (deleted: Edge[]) => {
    setError(null);
    for (const edge of deleted) {
      try {
        await apiFetch(`/pipeline/transitions/${edge.id}`, { method: "DELETE" });
      } catch (e: any) {
        setError(e?.message || "Não foi possível remover essa transição.");
      }
    }
  }, []);

  const deleteSelectedEdge = useCallback(async () => {
    if (!selectedEdge) return;
    const id = selectedEdge.id;
    setEdges((eds) => eds.filter((e) => e.id !== id));
    setError(null);
    try {
      await apiFetch(`/pipeline/transitions/${id}`, { method: "DELETE" });
    } catch (e: any) {
      setError(e?.message || "Não foi possível remover essa seta.");
    }
  }, [selectedEdge, setEdges]);

  // ── ações de status ─────────────────────────────────────────────────────────
  const act = async (fn: () => Promise<any>) => {
    setError(null);
    await flushPositions();
    try {
      await fn();
      onChanged();
    } catch (e: any) {
      setError(e?.message || "Não foi possível concluir a ação.");
    }
  };

  // ── permissões da seta selecionada (quem pode avançar / voltar) ──────────────
  const [team, setTeam] = useState<TeamUser[] | null>(null);
  useEffect(() => {
    if (!selectedEdge || team) return;
    apiFetch("/users")
      .then((d: TeamUser[]) => setTeam((Array.isArray(d) ? d : []).filter((u) => u.ativo && u.role !== "OWNER")))
      .catch(() => setTeam([]));
  }, [selectedEdge, team]);

  const edgePerms = useMemo<EdgePerms | null>(
    () => (selectedEdge ? permsOf((selectedEdge.data ?? {}) as Partial<EdgePerms>) : null),
    [selectedEdge],
  );

  const toggleEdgePerm = useCallback(
    async (field: PermField, value: string) => {
      if (!selectedEdge) return;
      const id = selectedEdge.id;
      const cur = permsOf((selectedEdge.data ?? {}) as Partial<EdgePerms>);
      const next = cur[field].includes(value) ? cur[field].filter((v) => v !== value) : [...cur[field], value];
      setEdges((eds) => eds.map((e) => (e.id === id ? { ...e, data: { ...cur, [field]: next } } : e)));
      setError(null);
      try {
        await apiFetch(`/pipeline/transitions/${id}/permissions`, {
          method: "PATCH",
          body: JSON.stringify({ [field]: next }),
        });
      } catch (e: any) {
        setEdges((eds) => eds.map((x) => (x.id === id ? { ...x, data: cur } : x)));
        setError(e?.message || "Não foi possível salvar a permissão.");
      }
    },
    [selectedEdge, setEdges],
  );

  const single = selectedNodes.length === 1 ? selectedNodes[0] : null;

  const doRename = () => {
    const name = renameDraft.trim();
    const id = renamingId;
    setRenamingId(null);
    if (!id || !name) return;
    act(() => apiFetch(`/pipeline/stages/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }));
  };

  const doDeleteStages = () => {
    if (selectedNodes.length === 0) return;
    const label =
      selectedNodes.length === 1
        ? `Remover o status "${(selectedNodes[0].data as StageNodeData).label}"?`
        : `Remover ${selectedNodes.length} status?`;
    if (!confirm(`${label} Só é possível nos que não tiverem nenhum lead.`)) return;
    const ids = selectedNodes.map((n) => n.id);
    act(async () => {
      for (const id of ids) await apiFetch(`/pipeline/stages/${id}`, { method: "DELETE" });
    });
  };

  const moveSelectedToGroup = (groupId: string) => {
    if (!groupId || selectedNodes.length === 0) return;
    const ids = selectedNodes.map((n) => n.id);
    act(async () => {
      for (const id of ids) {
        await apiFetch(`/pipeline/stages/${id}/group`, { method: "PATCH", body: JSON.stringify({ groupId }) });
      }
    });
  };

  const doCreate = () => {
    const name = newName.trim();
    if (!name || !newGroupId) return;
    setCreating(false);
    setNewName("");
    act(() => apiFetch("/pipeline/stages", { method: "POST", body: JSON.stringify({ name, groupId: newGroupId }) }));
  };

  const addGroup = () => {
    const name = prompt("Nome da nova Etapa:")?.trim();
    if (!name) return;
    act(() => apiFetch("/pipeline/groups", { method: "POST", body: JSON.stringify({ name }) }));
  };

  const btn = "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium";
  const inputStyle = {
    background: "var(--shell-input-bg)",
    color: "var(--shell-input-text)",
    borderColor: "var(--shell-input-border)",
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-2">
        {!creating ? (
          <button
            type="button"
            onClick={() => { setCreating(true); setNewGroupId(groups[0]?.id ?? ""); }}
            disabled={groups.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            style={{ background: "#1D9E75" }}
          >
            <Plus className="h-3.5 w-3.5" /> Novo status
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") doCreate(); if (e.key === "Escape") setCreating(false); }}
              placeholder="Nome do status"
              className="rounded-md border px-2 py-1 text-xs"
              style={inputStyle}
            />
            <select
              value={newGroupId}
              onChange={(e) => setNewGroupId(e.target.value)}
              className="rounded-md border px-2 py-1 text-xs"
              style={inputStyle}
            >
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <button type="button" onClick={doCreate} className="p-1 text-[var(--shell-subtext)]" title="Criar"><Check className="h-4 w-4" /></button>
            <button type="button" onClick={() => setCreating(false)} className="p-1 text-[var(--shell-subtext)]" title="Cancelar"><X className="h-4 w-4" /></button>
          </div>
        )}

        <button type="button" onClick={addGroup} className={`${btn} text-[var(--shell-subtext)]`} style={{ borderColor: "var(--shell-card-border)" }}>
          <Plus className="h-3.5 w-3.5" /> Nova etapa
        </button>

        <div className="mx-1 h-5 w-px" style={{ background: "var(--shell-divider)" }} />

        {selectedEdge ? (
          <>
            <span className="text-xs text-[var(--shell-subtext)]">
              Seta:{" "}
              <strong className="text-[var(--shell-text)]">{nameById.get(selectedEdge.source) ?? "?"}</strong>
              {" → "}
              <strong className="text-[var(--shell-text)]">{nameById.get(selectedEdge.target) ?? "?"}</strong>
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-[var(--shell-subtext)]">
              <Unlink className="h-3 w-3" /> arraste a ponta pra outro status pra religar
            </span>
            <button type="button" onClick={deleteSelectedEdge} className={`${btn} text-red-500`} style={{ borderColor: "var(--shell-card-border)" }}>
              <Trash2 className="h-3 w-3" /> Excluir seta
            </button>
          </>
        ) : renamingId && single ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") doRename(); if (e.key === "Escape") setRenamingId(null); }}
              className="rounded-md border px-2 py-1 text-xs"
              style={inputStyle}
            />
            <button type="button" onClick={doRename} className="p-1 text-[var(--shell-subtext)]" title="Salvar"><Check className="h-4 w-4" /></button>
            <button type="button" onClick={() => setRenamingId(null)} className="p-1 text-[var(--shell-subtext)]" title="Cancelar"><X className="h-4 w-4" /></button>
          </div>
        ) : selectedNodes.length > 0 ? (
          <>
            <span className="text-xs text-[var(--shell-subtext)]">
              {single ? (
                <>Selecionado: <strong className="text-[var(--shell-text)]">{(single.data as StageNodeData).label}</strong></>
              ) : (
                <><strong className="text-[var(--shell-text)]">{selectedNodes.length} status</strong> selecionados</>
              )}
            </span>

            {single && (
              <button
                type="button"
                onClick={() => { setRenameDraft((single.data as StageNodeData).label); setRenamingId(single.id); }}
                className={`${btn} text-[var(--shell-subtext)]`}
                style={{ borderColor: "var(--shell-card-border)" }}
              >
                <Pencil className="h-3 w-3" /> Renomear
              </button>
            )}

            <select
              value=""
              onChange={(e) => e.target.value && moveSelectedToGroup(e.target.value)}
              className="rounded-md border px-2 py-1 text-xs"
              style={inputStyle}
            >
              <option value="">{single ? "Mover para a etapa..." : `Mover os ${selectedNodes.length} para...`}</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>

            <button type="button" onClick={doDeleteStages} className={`${btn} text-red-500`} style={{ borderColor: "var(--shell-card-border)" }}>
              <Trash2 className="h-3 w-3" /> Excluir
            </button>
          </>
        ) : (
          <span className="text-xs text-[var(--shell-subtext)]">
            Clique num status ou numa seta para editar
          </span>
        )}

        <span className="ml-auto text-xs text-[var(--shell-subtext)]">{saving ? "Salvando..." : "Alterações salvas"}</span>
      </div>

      {selectedEdge && edgePerms && (
        <div className="grid gap-3 rounded-xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-3 text-xs md:grid-cols-2">
          {([
            { key: "forward", title: "Pode avançar", hint: "Vazio = todos podem. O dono sempre pode.", roles: "forwardRoles", users: "forwardUserIds", from: nameById.get(selectedEdge.source), to: nameById.get(selectedEdge.target) },
            { key: "back", title: "Pode voltar", hint: "Vazio = só o dono. O dono sempre pode.", roles: "backRoles", users: "backUserIds", from: nameById.get(selectedEdge.target), to: nameById.get(selectedEdge.source) },
          ] as const).map((c) => (
            <div key={c.key}>
              <div className="font-semibold text-[var(--shell-text)]">
                {c.title}: {c.from ?? "?"} → {c.to ?? "?"}
              </div>
              <div className="mb-1.5 text-[var(--shell-subtext)]">{c.hint}</div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {ROLE_OPTIONS.map((r) => (
                  <label key={r.value} className="inline-flex items-center gap-1.5 text-[var(--shell-text)]">
                    <input
                      type="checkbox"
                      checked={edgePerms[c.roles].includes(r.value)}
                      onChange={() => toggleEdgePerm(c.roles, r.value)}
                    />
                    {r.label}
                  </label>
                ))}
              </div>
              <details className="mt-1.5">
                <summary className="cursor-pointer text-[var(--shell-subtext)]">
                  Pessoas específicas ({edgePerms[c.users].length})
                </summary>
                <div className="mt-1 max-h-32 space-y-1 overflow-auto">
                  {(team ?? []).length === 0 && <div className="text-[var(--shell-subtext)]">{team ? "Nenhum usuário." : "Carregando..."}</div>}
                  {(team ?? []).map((u) => (
                    <label key={u.id} className="flex items-center gap-1.5 text-[var(--shell-text)]">
                      <input
                        type="checkbox"
                        checked={edgePerms[c.users].includes(u.id)}
                        onChange={() => toggleEdgePerm(c.users, u.id)}
                      />
                      {u.nome}
                    </label>
                  ))}
                </div>
              </details>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-[var(--shell-subtext)]">
        <strong>Setas:</strong> puxe da bolinha <span style={{ color: OUT_COLOR }}>●</span> laranja (saída, à direita)
        até a bolinha <span style={{ color: IN_COLOR }}>●</span> verde (entrada, à esquerda) de outro status para criar.
        {" "}<strong>Clique num status</strong> para ver o que <span style={{ color: IN_COLOR }}>entra nele (verde)</span> e o que{" "}
        <span style={{ color: OUT_COLOR }}>sai dele (laranja)</span>; o resto fica apagado.
        Clique numa seta para selecioná-la — daí dá pra arrastar a ponta dela para outro status (religar) ou excluir.
        {" "}
        <strong>Vários de uma vez:</strong> segure <kbd>Shift</kbd> e arraste no fundo para selecionar em caixa, ou
        clique segurando <kbd>Ctrl</kbd>. Os selecionados arrastam juntos e podem ser movidos de Etapa ou excluídos em lote.
        {" "}A posição das caixas fica salva. Só as setas decidem para onde um lead pode ir (e voltar é o caminho inverso da seta, liberado só ao dono ou a quem você marcar): status sem nenhuma seta saindo não tem destino (o lead continua nele).
      </p>

      {edges.length === 0 && nodes.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Este funil ainda não tem nenhuma seta desenhada.</strong> Sem setas, nenhum lead consegue mudar de
          status — só as setas decidem os caminhos. Os leads continuam no status em que estão.
        </div>
      )}

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      <div style={{ height: 620 }} className="rounded-2xl border border-[var(--shell-card-border)] overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={paintedEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onReconnect={onReconnect}
          edgesReconnectable
          reconnectRadius={24}
          onEdgesDelete={onEdgesDelete}
          onNodeDragStop={onNodeDragStop}
          onSelectionDragStop={onSelectionDragStop}
          multiSelectionKeyCode={["Control", "Meta"]}
          selectionKeyCode="Shift"
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}
