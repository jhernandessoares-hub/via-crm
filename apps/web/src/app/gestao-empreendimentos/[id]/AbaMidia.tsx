"use client";
import { useEffect, useState, useRef } from "react";
import {
  listMedia, uploadMedia, deleteMedia,
  listObraUpdates, createObraUpdate, updateObraUpdate, deleteObraUpdate,
  uploadObraFoto, deleteObraFoto,
  type DevMedia, type DevMediaCategoria, type DevObraUpdate,
} from "@/lib/developments.service";

const inp = "w-full rounded-lg border border-[var(--shell-card-border)] bg-[var(--shell-input-bg)] px-3 py-2 text-sm text-[var(--shell-text)] outline-none focus:border-[var(--brand-accent)] transition-colors";

type MediaTab = "FOTO_COMERCIAL" | "PANFLETO" | "BOOK";

const MEDIA_TABS: { key: MediaTab; label: string; accept: string; hint: string }[] = [
  { key: "FOTO_COMERCIAL", label: "Fotos Comerciais", accept: "image/*", hint: "JPG, PNG, WEBP" },
  { key: "PANFLETO",       label: "Panfletos",        accept: "image/*,application/pdf", hint: "JPG, PNG, PDF" },
  { key: "BOOK",           label: "Book",             accept: "image/*,application/pdf", hint: "JPG, PNG, PDF" },
];

// ─── Seção de galeria por categoria ──────────────────────────────────────────

function MediaGallery({ devId, categoria, accept, hint }: { devId: string; categoria: DevMediaCategoria; accept: string; hint: string }) {
  const [items, setItems] = useState<DevMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [tituloMap, setTituloMap] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoading(true);
    listMedia(devId, categoria).then(setItems).finally(() => setLoading(false));
  }, [devId, categoria]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const titulo = tituloMap[categoria] || "";
    for (let i = 0; i < files.length; i++) {
      setUploadProgress(files.length > 1 ? `Enviando ${i + 1}/${files.length}…` : "Enviando…");
      try {
        const created = await uploadMedia(devId, files[i], categoria, titulo || undefined);
        setItems((prev) => [...prev, created]);
      } catch { /* continua para o próximo */ }
    }
    setUploadProgress(null);
    if (titulo) setTituloMap((prev) => ({ ...prev, [categoria]: "" }));
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleDelete(id: string) {
    await deleteMedia(devId, id);
    setItems((prev) => prev.filter((m) => m.id !== id));
    setConfirmDelete(null);
  }

  const isPdf = (url: string) => url.includes("/raw/") || url.toLowerCase().endsWith(".pdf") || url.includes("application/pdf");

  if (loading) return <div className="py-8 text-center text-sm text-[var(--shell-subtext)]">Carregando…</div>;

  return (
    <div className="space-y-4">
      {/* Formulário de upload */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs text-[var(--shell-subtext)] mb-1">Título (opcional)</label>
          <input
            className={inp}
            placeholder="Ex: Fachada principal"
            value={tituloMap[categoria] || ""}
            onChange={(e) => setTituloMap((prev) => ({ ...prev, [categoria]: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--shell-subtext)] mb-1">Arquivo ({hint})</label>
          <div className="flex gap-2 items-center">
            <input ref={fileRef} type="file" accept={accept} multiple className="hidden" id={`upload-${categoria}`} onChange={handleUpload} disabled={!!uploadProgress} />
            <label
              htmlFor={`upload-${categoria}`}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium cursor-pointer transition-colors ${
                uploadProgress
                  ? "opacity-50 cursor-not-allowed border-[var(--shell-card-border)] text-[var(--shell-subtext)]"
                  : "border-[var(--brand-accent)] text-[var(--brand-accent)] hover:bg-[var(--brand-accent)] hover:text-white"
              }`}
            >
              {uploadProgress ?? "＋ Adicionar"}
            </label>
          </div>
        </div>
      </div>

      {/* Grid de itens */}
      {items.length === 0 ? (
        <div className="py-10 text-center rounded-xl border border-dashed border-[var(--shell-card-border)] text-sm text-[var(--shell-subtext)]">
          Nenhum arquivo ainda. Clique em "Adicionar" para fazer upload.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {items.map((item) => (
            <div key={item.id} className="group relative rounded-xl overflow-hidden border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)]">
              {isPdf(item.url) ? (
                <a href={item.url} target="_blank" rel="noreferrer"
                  className="flex flex-col items-center justify-center h-32 gap-2 text-[var(--shell-subtext)] hover:text-[var(--brand-accent)] transition-colors p-3">
                  <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-xs text-center leading-tight">{item.titulo || "PDF"}</span>
                </a>
              ) : (
                <a href={item.url} target="_blank" rel="noreferrer" className="block">
                  <img src={item.url} alt={item.titulo || ""} className="w-full h-32 object-cover" />
                </a>
              )}
              {item.titulo && (
                <div className="px-2 py-1 text-xs text-[var(--shell-subtext)] truncate border-t border-[var(--shell-card-border)]">
                  {item.titulo}
                </div>
              )}
              {/* Botão excluir */}
              {confirmDelete === item.id ? (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2 p-2">
                  <span className="text-white text-xs text-center">Excluir?</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => handleDelete(item.id)}
                      className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700">Sim</button>
                    <button type="button" onClick={() => setConfirmDelete(null)}
                      className="px-3 py-1 bg-gray-600 text-white rounded text-xs hover:bg-gray-700">Não</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(item.id)}
                  className="absolute top-1 right-1 p-1 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Seção de Evolução de Obra ────────────────────────────────────────────────

function ObraUpdateCard({ devId, update, onDeleted, onUpdated }: {
  devId: string;
  update: DevObraUpdate;
  onDeleted: (id: string) => void;
  onUpdated: (u: DevObraUpdate) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [confirmDeleteUpdate, setConfirmDeleteUpdate] = useState(false);
  const [confirmDeleteFoto, setConfirmDeleteFoto] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({ dataAtualizacao: update.dataAtualizacao.slice(0, 10), titulo: update.titulo || "", observacoes: update.observacoes || "", percentualAvanco: update.percentualAvanco ?? 0 });
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUploadFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    let fotos = [...update.fotos];
    for (let i = 0; i < files.length; i++) {
      setUploadProgress(files.length > 1 ? `Enviando ${i + 1}/${files.length}…` : "Enviando…");
      try {
        const foto = await uploadObraFoto(devId, update.id, files[i]);
        fotos = [...fotos, foto];
        onUpdated({ ...update, fotos });
      } catch { /* continua */ }
    }
    setUploadProgress(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleDeleteFoto(fotoId: string) {
    await deleteObraFoto(devId, update.id, fotoId);
    onUpdated({ ...update, fotos: update.fotos.filter((f) => f.id !== fotoId) });
    setConfirmDeleteFoto(null);
  }

  async function handleDeleteUpdate() {
    await deleteObraUpdate(devId, update.id);
    onDeleted(update.id);
  }

  async function handleSaveEdit() {
    setSaving(true);
    try {
      const updated = await updateObraUpdate(devId, update.id, {
        dataAtualizacao: editData.dataAtualizacao,
        titulo: editData.titulo || undefined,
        observacoes: editData.observacoes || undefined,
        percentualAvanco: editData.percentualAvanco,
      });
      onUpdated({ ...updated, fotos: update.fotos });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  const fmtDate = (d: string) => {
    const dt = new Date(d);
    return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  };

  return (
    <div className="rounded-xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] overflow-hidden">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <input type="date" className={inp + " w-auto"} value={editData.dataAtualizacao}
                  onChange={(e) => setEditData((p) => ({ ...p, dataAtualizacao: e.target.value }))} />
                <input className={inp + " flex-1 min-w-[160px]"} placeholder="Título (opcional)" value={editData.titulo}
                  onChange={(e) => setEditData((p) => ({ ...p, titulo: e.target.value }))} />
              </div>
              <textarea className={inp} rows={2} placeholder="Observações (opcional)" value={editData.observacoes}
                onChange={(e) => setEditData((p) => ({ ...p, observacoes: e.target.value }))} />
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-[var(--shell-subtext)]">Avanço da obra</label>
                  <span className="text-xs font-semibold text-[var(--brand-accent)]">{editData.percentualAvanco}%</span>
                </div>
                <input type="range" min={0} max={100} step={1}
                  value={editData.percentualAvanco}
                  onChange={(e) => setEditData((p) => ({ ...p, percentualAvanco: Number(e.target.value) }))}
                  className="w-full accent-[var(--brand-accent)] h-2 cursor-pointer" />
                <div className="flex justify-between text-[10px] text-[var(--shell-subtext)] mt-0.5">
                  <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={handleSaveEdit} disabled={saving}
                  className="px-3 py-1 bg-[var(--brand-accent)] text-white text-xs rounded hover:opacity-90 disabled:opacity-50">
                  {saving ? "Salvando…" : "Salvar"}
                </button>
                <button type="button" onClick={() => setEditing(false)}
                  className="px-3 py-1 border border-[var(--shell-card-border)] text-[var(--shell-subtext)] text-xs rounded hover:border-[var(--shell-text)]">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm text-[var(--shell-text)]">{fmtDate(update.dataAtualizacao)}</span>
                {update.titulo && <span className="text-sm text-[var(--shell-subtext)]">— {update.titulo}</span>}
                {update.percentualAvanco != null && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-[var(--brand-accent)]/10 text-[var(--brand-accent)]">
                    🏗️ {update.percentualAvanco}%
                  </span>
                )}
                <span className="text-xs text-[var(--shell-subtext)] ml-auto">{update.fotos.length} foto{update.fotos.length !== 1 ? "s" : ""}</span>
              </div>
              {update.observacoes && (
                <p className="text-xs text-[var(--shell-subtext)] mt-0.5 line-clamp-2">{update.observacoes}</p>
              )}
            </>
          )}
        </div>

        {!editing && (
          <div className="flex items-center gap-1 shrink-0">
            <button type="button" onClick={() => setEditing(true)} title="Editar"
              className="p-1.5 rounded-lg text-[var(--shell-subtext)] hover:text-[var(--shell-text)] hover:bg-[var(--shell-hover-bg)] transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            {confirmDeleteUpdate ? (
              <div className="flex items-center gap-1">
                <span className="text-xs text-red-500">Excluir?</span>
                <button type="button" onClick={handleDeleteUpdate}
                  className="px-2 py-0.5 bg-red-600 text-white rounded text-xs hover:bg-red-700">Sim</button>
                <button type="button" onClick={() => setConfirmDeleteUpdate(false)}
                  className="px-2 py-0.5 bg-gray-500 text-white rounded text-xs hover:bg-gray-600">Não</button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmDeleteUpdate(true)} title="Excluir atualização"
                className="p-1.5 rounded-lg text-[var(--shell-subtext)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
            <button type="button" onClick={() => setExpanded((v) => !v)}
              className="p-1.5 rounded-lg text-[var(--shell-subtext)] hover:text-[var(--shell-text)] hover:bg-[var(--shell-hover-bg)] transition-colors">
              <svg className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Fotos expandidas */}
      {expanded && (
        <div className="border-t border-[var(--shell-card-border)] px-4 py-3 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {update.fotos.map((foto) => (
              <div key={foto.id} className="group relative rounded-xl overflow-hidden border border-[var(--shell-card-border)]">
                <a href={foto.url} target="_blank" rel="noreferrer">
                  <img src={foto.url} alt={foto.legenda || ""} className="w-full h-28 object-cover" />
                </a>
                {foto.legenda && (
                  <div className="px-2 py-1 text-xs text-[var(--shell-subtext)] truncate border-t border-[var(--shell-card-border)]">{foto.legenda}</div>
                )}
                {confirmDeleteFoto === foto.id ? (
                  <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2 p-2">
                    <span className="text-white text-xs">Excluir?</span>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => handleDeleteFoto(foto.id)}
                        className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700">Sim</button>
                      <button type="button" onClick={() => setConfirmDeleteFoto(null)}
                        className="px-3 py-1 bg-gray-600 text-white rounded text-xs hover:bg-gray-700">Não</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmDeleteFoto(foto.id)}
                    className="absolute top-1 right-1 p-1 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}

            {/* Botão adicionar foto inline */}
            <div className="flex items-center justify-center rounded-xl border border-dashed border-[var(--shell-card-border)] h-28">
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" id={`obra-foto-${update.id}`} onChange={handleUploadFoto} disabled={!!uploadProgress} />
              <label htmlFor={`obra-foto-${update.id}`}
                className={`flex flex-col items-center gap-1 cursor-pointer text-[var(--shell-subtext)] hover:text-[var(--brand-accent)] transition-colors ${uploadProgress ? "opacity-50 pointer-events-none" : ""}`}>
                {uploadProgress ? (
                  <span className="text-xs text-center px-1">{uploadProgress}</span>
                ) : (
                  <>
                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="text-xs">Fotos</span>
                  </>
                )}
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Seção principal Evolução de Obra ─────────────────────────────────────────

function ObraEvolution({ devId }: { devId: string }) {
  const [updates, setUpdates] = useState<DevObraUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ dataAtualizacao: new Date().toISOString().slice(0, 10), titulo: "", observacoes: "", percentualAvanco: 0 });

  useEffect(() => {
    listObraUpdates(devId).then(setUpdates).finally(() => setLoading(false));
  }, [devId]);

  async function handleCreate() {
    if (!form.dataAtualizacao) return;
    setSaving(true);
    try {
      const created = await createObraUpdate(devId, {
        dataAtualizacao: form.dataAtualizacao,
        titulo: form.titulo || undefined,
        observacoes: form.observacoes || undefined,
        percentualAvanco: form.percentualAvanco,
      });
      setUpdates((prev) => [created, ...prev]);
      setShowForm(false);
      setForm({ dataAtualizacao: new Date().toISOString().slice(0, 10), titulo: "", observacoes: "", percentualAvanco: 0 });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="py-8 text-center text-sm text-[var(--shell-subtext)]">Carregando…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--shell-text)]">Histórico de atualizações</h3>
        <button type="button" onClick={() => setShowForm((v) => !v)}
          className="px-4 py-1.5 rounded-lg border border-[var(--brand-accent)] text-[var(--brand-accent)] text-sm font-medium hover:bg-[var(--brand-accent)] hover:text-white transition-colors">
          {showForm ? "Cancelar" : "＋ Nova Atualização"}
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--shell-subtext)] mb-1">Data <span className="text-red-500">*</span></label>
              <input type="date" className={inp} value={form.dataAtualizacao}
                onChange={(e) => setForm((p) => ({ ...p, dataAtualizacao: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--shell-subtext)] mb-1">Título (opcional)</label>
              <input className={inp} placeholder="Ex: Laje do 5º andar concluída"
                value={form.titulo} onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-[var(--shell-subtext)] mb-1">Observações (opcional)</label>
            <textarea className={inp} rows={2} placeholder="Descreva o andamento da obra…"
              value={form.observacoes} onChange={(e) => setForm((p) => ({ ...p, observacoes: e.target.value }))} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs text-[var(--shell-subtext)]">Avanço da obra</label>
              <span className="text-xs font-semibold text-[var(--brand-accent)]">{form.percentualAvanco}%</span>
            </div>
            <input type="range" min={0} max={100} step={1}
              value={form.percentualAvanco}
              onChange={(e) => setForm((p) => ({ ...p, percentualAvanco: Number(e.target.value) }))}
              className="w-full accent-[var(--brand-accent)] h-2 cursor-pointer" />
            <div className="flex justify-between text-[10px] text-[var(--shell-subtext)] mt-0.5">
              <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
            </div>
          </div>
          <button type="button" onClick={handleCreate} disabled={saving || !form.dataAtualizacao}
            className="px-5 py-2 rounded-lg bg-[var(--brand-accent)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
            {saving ? "Salvando…" : "Criar Atualização"}
          </button>
        </div>
      )}

      {updates.length === 0 && !showForm ? (
        <div className="py-10 text-center rounded-xl border border-dashed border-[var(--shell-card-border)] text-sm text-[var(--shell-subtext)]">
          Nenhuma atualização registrada. Clique em "Nova Atualização" para começar.
        </div>
      ) : (
        <div className="space-y-3">
          {updates.map((u) => (
            <ObraUpdateCard
              key={u.id}
              devId={devId}
              update={u}
              onDeleted={(id) => setUpdates((prev) => prev.filter((x) => x.id !== id))}
              onUpdated={(updated) => setUpdates((prev) => prev.map((x) => x.id === updated.id ? updated : x))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── AbaMidia (componente principal exportado) ────────────────────────────────

export default function AbaMidia({ devId }: { devId: string }) {
  const [mediaTab, setMediaTab] = useState<MediaTab>("FOTO_COMERCIAL");

  return (
    <div className="space-y-8">
      {/* Seção de Mídia Comercial */}
      <section className="rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--shell-card-border)]">
          <h2 className="text-base font-semibold text-[var(--shell-text)]">🖼️ Mídia Comercial</h2>
          <p className="text-xs text-[var(--shell-subtext)] mt-0.5">Fotos comerciais, panfletos e book do empreendimento.</p>
        </div>
        {/* Sub-tabs */}
        <div className="border-b border-[var(--shell-card-border)] flex">
          {MEDIA_TABS.map(({ key, label }) => (
            <button key={key} type="button" onClick={() => setMediaTab(key)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                mediaTab === key
                  ? "border-[var(--brand-accent)] text-[var(--brand-accent)]"
                  : "border-transparent text-[var(--shell-subtext)] hover:text-[var(--shell-text)]"
              }`}>
              {label}
            </button>
          ))}
        </div>
        <div className="p-5">
          {MEDIA_TABS.map(({ key, accept, hint }) =>
            mediaTab === key ? (
              <MediaGallery key={key} devId={devId} categoria={key} accept={accept} hint={hint} />
            ) : null
          )}
        </div>
      </section>

      {/* Seção de Evolução de Obra */}
      <section className="rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--shell-card-border)]">
          <h2 className="text-base font-semibold text-[var(--shell-text)]">🏗️ Evolução de Obra</h2>
          <p className="text-xs text-[var(--shell-subtext)] mt-0.5">Registre atualizações do progresso da obra com fotos e datas.</p>
        </div>
        <div className="p-5">
          <ObraEvolution devId={devId} />
        </div>
      </section>
    </div>
  );
}
