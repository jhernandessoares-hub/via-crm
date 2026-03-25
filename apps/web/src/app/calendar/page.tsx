"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

type CalendarEvent = {
  id: string;
  title: string;
  description?: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  color: string;
  leadId?: string | null;
  createdAt: string;
};

type EventForm = {
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  color: string;
  leadId: string;
};

type View = "month" | "week" | "day";

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const COLOR_OPTIONS = [
  { value: "blue", label: "Azul", cls: "bg-blue-500" },
  { value: "green", label: "Verde", cls: "bg-emerald-500" },
  { value: "red", label: "Vermelho", cls: "bg-red-500" },
  { value: "amber", label: "Amarelo", cls: "bg-amber-500" },
  { value: "purple", label: "Roxo", cls: "bg-purple-500" },
  { value: "gray", label: "Cinza", cls: "bg-gray-400" },
];

const COLOR_CLASS: Record<string, string> = {
  blue: "bg-blue-500 text-white",
  green: "bg-emerald-500 text-white",
  red: "bg-red-500 text-white",
  amber: "bg-amber-400 text-white",
  purple: "bg-purple-500 text-white",
  gray: "bg-gray-400 text-white",
};

const WEEKDAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// ──────────────────────────────────────────────
// Date helpers
// ──────────────────────────────────────────────

function toLocalISOString(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
}

function startOfWeek(d: Date) {
  const day = d.getDay();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
}

function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Returns the 42 cells (6 rows × 7 cols) for a month calendar */
function buildMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const startOffset = first.getDay(); // 0=Sun
  const gridStart = new Date(year, month, 1 - startOffset);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function formatDateForInput(d: Date, time = "08:00") {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${time}`;
}

function formatDisplayDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatShortTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// ──────────────────────────────────────────────
// Empty form
// ──────────────────────────────────────────────

function emptyForm(date?: Date): EventForm {
  const base = date || new Date();
  return {
    title: "",
    description: "",
    startAt: formatDateForInput(base, "08:00"),
    endAt: formatDateForInput(base, "09:00"),
    allDay: false,
    color: "blue",
    leadId: "",
  };
}

function eventToForm(ev: CalendarEvent): EventForm {
  return {
    title: ev.title,
    description: ev.description ?? "",
    startAt: toLocalISOString(new Date(ev.startAt)),
    endAt: toLocalISOString(new Date(ev.endAt)),
    allDay: ev.allDay,
    color: ev.color,
    leadId: ev.leadId ?? "",
  };
}

// ──────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────

export default function CalendarPage() {
  const today = useMemo(() => new Date(), []);

  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [form, setForm] = useState<EventForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Compute visible range based on view
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (view === "month") {
      const grid = buildMonthGrid(anchor.getFullYear(), anchor.getMonth());
      return { rangeStart: grid[0], rangeEnd: endOfDay(grid[41]) };
    }
    if (view === "week") {
      const ws = startOfWeek(anchor);
      return { rangeStart: ws, rangeEnd: endOfDay(addDays(ws, 6)) };
    }
    return { rangeStart: startOfDay(anchor), rangeEnd: endOfDay(anchor) };
  }, [view, anchor]);

  useEffect(() => {
    loadEvents();
  }, [rangeStart, rangeEnd]);

  async function loadEvents() {
    setLoading(true);
    try {
      const data = await apiFetch(
        `/calendar/events?start=${rangeStart.toISOString()}&end=${rangeEnd.toISOString()}`,
      );
      setEvents(Array.isArray(data) ? data : []);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  // ── Navigation ────────────────────────────────

  function navigate(dir: -1 | 1) {
    if (view === "month") {
      setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + dir, 1));
    } else if (view === "week") {
      setAnchor((a) => addDays(a, dir * 7));
    } else {
      setAnchor((a) => addDays(a, dir));
    }
  }

  function goToday() {
    if (view === "month") setAnchor(new Date(today.getFullYear(), today.getMonth(), 1));
    else setAnchor(today);
  }

  // ── Modal ─────────────────────────────────────

  function openCreate(date?: Date) {
    setEditingEvent(null);
    setForm(emptyForm(date));
    setFormError(null);
    setConfirmDelete(false);
    setModalOpen(true);
  }

  function openEdit(ev: CalendarEvent) {
    setEditingEvent(ev);
    setForm(eventToForm(ev));
    setFormError(null);
    setConfirmDelete(false);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingEvent(null);
    setConfirmDelete(false);
  }

  async function saveEvent() {
    setFormError(null);
    if (!form.title.trim()) { setFormError('"Título" é obrigatório.'); return; }
    if (!form.startAt) { setFormError('"Início" é obrigatório.'); return; }
    if (!form.endAt) { setFormError('"Fim" é obrigatório.'); return; }
    if (new Date(form.endAt) <= new Date(form.startAt)) {
      setFormError('"Fim" deve ser posterior ao "Início".'); return;
    }

    setSaving(true);
    try {
      const body = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        startAt: new Date(form.startAt).toISOString(),
        endAt: new Date(form.endAt).toISOString(),
        allDay: form.allDay,
        color: form.color,
        leadId: form.leadId.trim() || undefined,
      };

      if (editingEvent) {
        await apiFetch(`/calendar/events/${editingEvent.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch("/calendar/events", { method: "POST", body: JSON.stringify(body) });
      }
      closeModal();
      await loadEvents();
    } catch (e: any) {
      setFormError(e?.message || "Erro ao salvar evento.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteEvent() {
    if (!editingEvent) return;
    setDeleting(true);
    try {
      await apiFetch(`/calendar/events/${editingEvent.id}`, { method: "DELETE" });
      closeModal();
      await loadEvents();
    } catch (e: any) {
      setFormError(e?.message || "Erro ao excluir evento.");
    } finally {
      setDeleting(false);
    }
  }

  // ── Events per day helper ─────────────────────

  function eventsOnDay(d: Date) {
    return events.filter((ev) => isSameDay(new Date(ev.startAt), d));
  }

  // ── Month grid ────────────────────────────────

  const monthGrid = useMemo(
    () => buildMonthGrid(anchor.getFullYear(), anchor.getMonth()),
    [anchor],
  );

  // ── Header label ──────────────────────────────

  const headerLabel = useMemo(() => {
    if (view === "month") return `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`;
    if (view === "week") {
      const ws = startOfWeek(anchor);
      const we = addDays(ws, 6);
      return `${ws.getDate()}/${ws.getMonth() + 1} – ${we.getDate()}/${we.getMonth() + 1}/${we.getFullYear()}`;
    }
    return anchor.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  }, [view, anchor]);

  // ── Week days ─────────────────────────────────

  const weekDays = useMemo(() => {
    const ws = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  }, [anchor]);

  return (
    <AppShell title="Agenda">
      <div className="flex flex-col gap-4" style={{ height: "calc(100vh - 8.5rem)" }}>

        {/* ── Toolbar ── */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            onClick={goToday}
            className="rounded-md border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Hoje
          </button>
          <button
            onClick={() => navigate(-1)}
            className="rounded-md border px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
          >
            ‹
          </button>
          <button
            onClick={() => navigate(1)}
            className="rounded-md border px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
          >
            ›
          </button>
          <h2 className="text-sm font-semibold text-gray-900 flex-1 capitalize">{headerLabel}</h2>

          {loading && <span className="text-xs text-gray-400">Carregando...</span>}

          {/* View tabs */}
          <div className="flex rounded-md border overflow-hidden text-xs">
            {(["month", "week", "day"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => { setView(v); if (v !== "month") setAnchor(today); }}
                className={`px-3 py-1.5 font-medium transition ${
                  view === v ? "bg-slate-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {v === "month" ? "Mês" : v === "week" ? "Semana" : "Dia"}
              </button>
            ))}
          </div>

          <button
            onClick={() => openCreate()}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            + Novo evento
          </button>
        </div>

        {/* ── Month View ── */}
        {view === "month" && (
          <div className="flex-1 overflow-hidden rounded-xl border bg-white flex flex-col">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b text-center">
              {WEEKDAYS_SHORT.map((d) => (
                <div key={d} className="py-2 text-xs font-semibold text-gray-500">
                  {d}
                </div>
              ))}
            </div>

            {/* Grid cells */}
            <div className="flex-1 grid grid-cols-7 grid-rows-6 overflow-hidden">
              {monthGrid.map((day, idx) => {
                const isCurrentMonth = day.getMonth() === anchor.getMonth();
                const isToday = isSameDay(day, today);
                const dayEvents = eventsOnDay(day);

                return (
                  <div
                    key={idx}
                    onClick={() => openCreate(day)}
                    className={`border-r border-b p-1 cursor-pointer hover:bg-gray-50 transition min-h-0 flex flex-col ${
                      !isCurrentMonth ? "bg-gray-50/60" : ""
                    } ${idx % 7 === 6 ? "border-r-0" : ""}`}
                  >
                    {/* Date number */}
                    <div className="flex justify-end mb-1">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                          isToday
                            ? "bg-slate-900 text-white"
                            : isCurrentMonth
                            ? "text-gray-800"
                            : "text-gray-300"
                        }`}
                      >
                        {day.getDate()}
                      </span>
                    </div>

                    {/* Events */}
                    <div className="flex flex-col gap-0.5 overflow-hidden">
                      {dayEvents.slice(0, 3).map((ev) => (
                        <button
                          key={ev.id}
                          onClick={(e) => { e.stopPropagation(); openEdit(ev); }}
                          className={`w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium ${
                            COLOR_CLASS[ev.color] || COLOR_CLASS.blue
                          }`}
                        >
                          {ev.allDay ? "" : `${formatShortTime(ev.startAt)} `}
                          {ev.title}
                        </button>
                      ))}
                      {dayEvents.length > 3 && (
                        <span className="text-[10px] text-gray-400 px-1">
                          +{dayEvents.length - 3} mais
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Week View ── */}
        {view === "week" && (
          <div className="flex-1 overflow-auto rounded-xl border bg-white">
            <div className="grid grid-cols-7 border-b sticky top-0 bg-white z-10">
              {weekDays.map((d) => {
                const isToday = isSameDay(d, today);
                return (
                  <div
                    key={d.toISOString()}
                    onClick={() => openCreate(d)}
                    className="border-r last:border-r-0 py-2 text-center cursor-pointer hover:bg-gray-50"
                  >
                    <div className="text-xs text-gray-500">
                      {WEEKDAYS_SHORT[d.getDay()]}
                    </div>
                    <div
                      className={`mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                        isToday ? "bg-slate-900 text-white" : "text-gray-800"
                      }`}
                    >
                      {d.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-7 divide-x min-h-64">
              {weekDays.map((d) => {
                const dayEvents = eventsOnDay(d);
                return (
                  <div
                    key={d.toISOString()}
                    onClick={() => openCreate(d)}
                    className="p-1 flex flex-col gap-1 cursor-pointer hover:bg-gray-50/50 min-h-32"
                  >
                    {dayEvents.map((ev) => (
                      <button
                        key={ev.id}
                        onClick={(e) => { e.stopPropagation(); openEdit(ev); }}
                        className={`w-full text-left rounded px-2 py-1 text-xs font-medium leading-tight ${
                          COLOR_CLASS[ev.color] || COLOR_CLASS.blue
                        }`}
                      >
                        <div className="truncate">{ev.title}</div>
                        {!ev.allDay && (
                          <div className="opacity-80">{formatShortTime(ev.startAt)}</div>
                        )}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Day View ── */}
        {view === "day" && (
          <div className="flex-1 overflow-auto rounded-xl border bg-white">
            <div className="border-b px-4 py-3 sticky top-0 bg-white z-10">
              <h3 className="text-sm font-semibold text-gray-900 capitalize">
                {anchor.toLocaleDateString("pt-BR", {
                  weekday: "long", day: "2-digit", month: "long",
                })}
              </h3>
            </div>

            <div className="p-4">
              {eventsOnDay(anchor).length === 0 ? (
                <button
                  onClick={() => openCreate(anchor)}
                  className="w-full rounded-lg border-2 border-dashed border-gray-200 py-12 text-sm text-gray-400 hover:border-gray-300 hover:text-gray-500 transition"
                >
                  Nenhum evento hoje. Clique para criar.
                </button>
              ) : (
                <div className="space-y-2">
                  {eventsOnDay(anchor).map((ev) => (
                    <button
                      key={ev.id}
                      onClick={() => openEdit(ev)}
                      className={`w-full text-left rounded-lg px-4 py-3 ${
                        COLOR_CLASS[ev.color] || COLOR_CLASS.blue
                      }`}
                    >
                      <div className="font-semibold text-sm">{ev.title}</div>
                      {!ev.allDay && (
                        <div className="text-xs opacity-80 mt-0.5">
                          {formatShortTime(ev.startAt)} – {formatShortTime(ev.endAt)}
                        </div>
                      )}
                      {ev.description && (
                        <div className="text-xs opacity-80 mt-1 truncate">{ev.description}</div>
                      )}
                    </button>
                  ))}
                  <button
                    onClick={() => openCreate(anchor)}
                    className="w-full rounded-lg border-2 border-dashed border-gray-200 py-3 text-xs text-gray-400 hover:border-gray-300 transition"
                  >
                    + Adicionar evento
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Modal criar/editar ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            {/* Modal header */}
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-base font-semibold text-gray-900">
                {editingEvent ? "Editar evento" : "Novo evento"}
              </h2>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Modal body */}
            <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Título <span className="text-red-400">*</span>
                </label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                  placeholder="Nome do evento"
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Descrição</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  rows={2}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                  placeholder="Detalhes opcionais"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="allDay"
                  checked={form.allDay}
                  onChange={(e) => setForm((p) => ({ ...p, allDay: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="allDay" className="text-sm text-gray-700 cursor-pointer">
                  Dia inteiro
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Início <span className="text-red-400">*</span>
                  </label>
                  <input
                    type={form.allDay ? "date" : "datetime-local"}
                    value={form.allDay ? form.startAt.slice(0, 10) : form.startAt}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        startAt: form.allDay ? `${e.target.value}T00:00` : e.target.value,
                      }))
                    }
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Fim <span className="text-red-400">*</span>
                  </label>
                  <input
                    type={form.allDay ? "date" : "datetime-local"}
                    value={form.allDay ? form.endAt.slice(0, 10) : form.endAt}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        endAt: form.allDay ? `${e.target.value}T23:59` : e.target.value,
                      }))
                    }
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                  />
                </div>
              </div>

              {/* Color picker */}
              <div>
                <label className="mb-2 block text-xs font-medium text-gray-600">Cor</label>
                <div className="flex gap-2 flex-wrap">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setForm((p) => ({ ...p, color: c.value }))}
                      title={c.label}
                      className={`h-7 w-7 rounded-full transition ${c.cls} ${
                        form.color === c.value
                          ? "ring-2 ring-offset-2 ring-slate-900"
                          : "opacity-70 hover:opacity-100"
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Lead vinculado{" "}
                  <span className="font-normal text-gray-400">(ID opcional)</span>
                </label>
                <input
                  value={form.leadId}
                  onChange={(e) => setForm((p) => ({ ...p, leadId: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm font-mono outline-none focus:border-slate-400"
                  placeholder="UUID do lead"
                />
              </div>

              {formError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {formError}
                </div>
              )}

              {confirmDelete && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 flex items-center gap-3">
                  <span className="text-sm text-red-700 flex-1">Confirmar exclusão?</span>
                  <button
                    onClick={deleteEvent}
                    disabled={deleting}
                    className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleting ? "Excluindo..." : "Excluir"}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between border-t px-5 py-4">
              <div>
                {editingEvent && !confirmDelete && (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Excluir evento
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={closeModal}
                  className="rounded-md border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveEvent}
                  disabled={saving}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {saving ? "Salvando..." : editingEvent ? "Salvar" : "Criar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
