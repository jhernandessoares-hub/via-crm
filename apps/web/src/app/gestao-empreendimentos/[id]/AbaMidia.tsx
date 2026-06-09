"use client";
import { useEffect, useState, useRef } from "react";
import {
  listMedia, uploadMedia, patchMedia, deleteMedia,
  updateDevelopment,
  listObraUpdates, createObraUpdate, updateObraUpdate, deleteObraUpdate,
  uploadObraFoto, deleteObraFoto,
  type DevMedia, type DevMediaCategoria, type DevObraUpdate, type DevObraFoto,
} from "@/lib/developments.service";

const inp = "w-full rounded-lg border border-[var(--shell-card-border)] bg-[var(--shell-input-bg)] px-3 py-2 text-sm text-[var(--shell-text)] outline-none focus:border-[var(--brand-accent)] transition-colors";

type MediaTab = "FOTO_COMERCIAL" | "PANFLETO" | "BOOK";

const MEDIA_TABS: { key: MediaTab; label: string; accept: string; hint: string }[] = [
  { key: "FOTO_COMERCIAL", label: "Fotos Comerciais", accept: "image/*", hint: "JPG, PNG, WEBP" },
  { key: "PANFLETO",       label: "Panfletos",        accept: "image/*,application/pdf", hint: "JPG, PNG, PDF" },
  { key: "BOOK",           label: "Book",             accept: "image/*,application/pdf", hint: "JPG, PNG, PDF" },
];

const isPdf = (url: string) =>
  url.includes("/raw/") || url.toLowerCase().endsWith(".pdf") || url.includes("application/pdf");

// ─── Lightbox ─────────────────────────────────────────────────────────────────

type LightboxItem = { id: string; url: string; name?: string | null };

function LightboxModal({
  items,
  startIndex,
  onClose,
  onDelete,
}: {
  items: LightboxItem[];
  startIndex: number;
  onClose: () => void;
  onDelete?: (id: string) => Promise<void>;
}) {
  const [idx, setIdx] = useState(startIndex);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const item = items[idx];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
      else if (e.key === "ArrowRight") setIdx((i) => Math.min(items.length - 1, i + 1));
      else if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length, onClose]);

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await fetch(item.url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = item.name || "arquivo";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(item.url, "_blank");
    } finally {
      setDownloading(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete(item.id);
      if (items.length <= 1) { onClose(); return; }
      setIdx((i) => Math.min(i, items.length - 2));
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  if (!item) return null;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.93)" }}
      className="flex flex-col"
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <span className="text-sm text-white/80 truncate max-w-[50vw]">{item.name || `Arquivo ${idx + 1}`}</span>
        <div className="flex items-center gap-2 ml-4 shrink-0">
          {/* Contador */}
          {items.length > 1 && (
            <span className="text-xs text-white/50">{idx + 1} / {items.length}</span>
          )}

          {/* Download */}
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition-colors disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {downloading ? "…" : "Baixar"}
          </button>

          {/* Excluir */}
          {onDelete && (
            confirmDelete ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-red-400">Confirmar?</span>
                <button type="button" onClick={handleDelete} disabled={deleting}
                  className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs disabled:opacity-50">
                  {deleting ? "…" : "Sim"}
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)}
                  className="px-2.5 py-1 bg-white/20 hover:bg-white/30 text-white rounded text-xs">
                  Não
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-red-600/80 text-white text-sm transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Excluir
              </button>
            )
          )}

          {/* Fechar */}
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Área principal */}
      <div className="flex-1 flex items-center justify-center min-h-0 relative px-12">
        {/* Seta anterior */}
        {idx > 0 && (
          <button type="button" onClick={() => setIdx((i) => i - 1)}
            className="absolute left-2 flex items-center justify-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 text-white text-xl transition-colors">
            ‹
          </button>
        )}

        {isPdf(item.url) ? (
          <div className="flex flex-col items-center gap-4 text-white text-center p-8">
            <svg className="w-20 h-20 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-lg font-medium">{item.name || "Documento PDF"}</p>
            <a href={item.url} target="_blank" rel="noreferrer"
              className="px-5 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white text-sm transition-colors">
              Abrir PDF em nova aba
            </a>
          </div>
        ) : (
          <img
            src={item.url}
            alt={item.name || ""}
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            style={{ maxHeight: "calc(100vh - 130px)" }}
          />
        )}

        {/* Seta próxima */}
        {idx < items.length - 1 && (
          <button type="button" onClick={() => setIdx((i) => i + 1)}
            className="absolute right-2 flex items-center justify-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 text-white text-xl transition-colors">
            ›
          </button>
        )}
      </div>

      {/* Nome embaixo */}
      {item.name && (
        <div className="text-center text-white/60 text-xs py-3 px-4 truncate shrink-0">
          {item.name}
        </div>
      )}
    </div>
  );
}

// ─── Galeria de mídia ─────────────────────────────────────────────────────────

function MediaGallery({
  devId, categoria, accept, hint,
  capaUrl, onCapaChange,
}: {
  devId: string;
  categoria: DevMediaCategoria;
  accept: string;
  hint: string;
  capaUrl?: string | null;
  onCapaChange?: (url: string | null) => void;
}) {
  const [items, setItems] = useState<DevMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [tituloMap, setTituloMap] = useState<Record<string, string>>({});
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [lightbox, setLightbox] = useState<{ index: number } | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoading(true);
    listMedia(devId, categoria).then(setItems).finally(() => setLoading(false));
  }, [devId, categoria]);

  useEffect(() => {
    if (editingTitleId) titleInputRef.current?.focus();
  }, [editingTitleId]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const titulo = tituloMap[categoria] || "";
    for (let i = 0; i < files.length; i++) {
      setUploadProgress(files.length > 1 ? `Enviando ${i + 1}/${files.length}…` : "Enviando…");
      try {
        const created = await uploadMedia(devId, files[i], categoria, titulo || undefined);
        setItems((prev) => [...prev, created]);
      } catch { /* continua */ }
    }
    setUploadProgress(null);
    if (titulo) setTituloMap((prev) => ({ ...prev, [categoria]: "" }));
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleDelete(id: string) {
    const item = items.find((m) => m.id === id);
    await deleteMedia(devId, id);
    setItems((prev) => prev.filter((m) => m.id !== id));
    if (item && capaUrl === item.url && onCapaChange) onCapaChange(null);
  }

  function startEditTitle(item: DevMedia) {
    setEditingTitleId(item.id);
    setTitleDraft(item.titulo || "");
  }

  async function commitTitle(id: string) {
    const item = items.find((m) => m.id === id);
    if (!item) return;
    const newTitle = titleDraft.trim() || null;
    if (newTitle === (item.titulo ?? null)) { setEditingTitleId(null); return; }
    try {
      const updated = await patchMedia(devId, id, { titulo: newTitle });
      setItems((prev) => prev.map((m) => m.id === id ? { ...m, titulo: updated.titulo } : m));
    } finally {
      setEditingTitleId(null);
    }
  }

  function handleTitleKeyDown(e: React.KeyboardEvent, id: string) {
    if (e.key === "Enter") { e.preventDefault(); commitTitle(id); }
    if (e.key === "Escape") setEditingTitleId(null);
  }

  async function toggleCapa(item: DevMedia) {
    if (!onCapaChange) return;
    const newCapa = capaUrl === item.url ? null : item.url;
    onCapaChange(newCapa);
    await updateDevelopment(devId, { capaUrl: newCapa });
  }

  const lightboxItems: LightboxItem[] = items.map((m) => ({ id: m.id, url: m.url, name: m.titulo }));

  if (loading) return <div className="py-8 text-center text-sm text-[var(--shell-subtext)]">Carregando…</div>;

  return (
    <div className="space-y-4">
      {/* Upload */}
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

      {categoria === "FOTO_COMERCIAL" && items.length > 0 && (
        <p className="text-[11px] text-[var(--shell-subtext)]">
          Clique na imagem para ampliar · ☆ define a capa do card · clique no nome para renomear
        </p>
      )}

      {items.length === 0 ? (
        <div className="py-10 text-center rounded-xl border border-dashed border-[var(--shell-card-border)] text-sm text-[var(--shell-subtext)]">
          Nenhum arquivo ainda. Clique em "Adicionar" para fazer upload.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {items.map((item, i) => {
            const isCapa = categoria === "FOTO_COMERCIAL" && !isPdf(item.url) && capaUrl === item.url;
            return (
              <div key={item.id} className="group relative rounded-xl overflow-hidden border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)]">
                {/* Thumbnail clicável */}
                <button
                  type="button"
                  onClick={() => setLightbox({ index: i })}
                  className="block w-full"
                >
                  {isPdf(item.url) ? (
                    <div className="flex flex-col items-center justify-center h-32 gap-2 text-[var(--shell-subtext)] hover:text-[var(--brand-accent)] transition-colors p-3">
                      <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="text-xs text-center leading-tight">{item.titulo || "PDF"}</span>
                    </div>
                  ) : (
                    <img src={item.url} alt={item.titulo || ""} className="w-full h-32 object-cover" />
                  )}
                </button>

                {/* Título editável */}
                <div className="px-2 py-1 border-t border-[var(--shell-card-border)]">
                  {editingTitleId === item.id ? (
                    <input
                      ref={titleInputRef}
                      className="w-full text-xs bg-transparent outline-none border-b border-[var(--brand-accent)] text-[var(--shell-text)] py-0.5"
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      onBlur={() => commitTitle(item.id)}
                      onKeyDown={(e) => handleTitleKeyDown(e, item.id)}
                      placeholder="Adicionar nome…"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEditTitle(item)}
                      className="w-full text-left text-xs text-[var(--shell-subtext)] hover:text-[var(--shell-text)] truncate transition-colors"
                      title="Clique para renomear"
                    >
                      {item.titulo || <span className="opacity-40">Adicionar nome…</span>}
                    </button>
                  )}
                </div>

                {/* Estrela de capa (só Fotos Comerciais, não PDF) */}
                {categoria === "FOTO_COMERCIAL" && !isPdf(item.url) && onCapaChange && (
                  <button
                    type="button"
                    onClick={() => toggleCapa(item)}
                    title={isCapa ? "Remover capa" : "Definir como capa"}
                    className={`absolute top-1 left-1 p-1 rounded-full transition-all ${
                      isCapa
                        ? "bg-yellow-400/90 text-yellow-900"
                        : "bg-black/40 text-white opacity-0 group-hover:opacity-100 hover:bg-yellow-400/90 hover:text-yellow-900"
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={isCapa ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <LightboxModal
          items={lightboxItems}
          startIndex={lightbox.index}
          onClose={() => setLightbox(null)}
          onDelete={async (id) => {
            await handleDelete(id);
            setItems((prev) => {
              // lightbox index atualizado via re-render
              return prev;
            });
          }}
        />
      )}
    </div>
  );
}

// ─── Card de atualização de obra ──────────────────────────────────────────────

function ObraUpdateCard({ devId, update, onDeleted, onUpdated }: {
  devId: string;
  update: DevObraUpdate;
  onDeleted: (id: string) => void;
  onUpdated: (u: DevObraUpdate) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [confirmDeleteUpdate, setConfirmDeleteUpdate] = useState(false);
  const [lightbox, setLightbox] = useState<{ index: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({
    dataAtualizacao: update.dataAtualizacao.slice(0, 10),
    titulo: update.titulo || "",
    observacoes: update.observacoes || "",
    percentualAvanco: update.percentualAvanco ?? 0,
  });
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

  const fotoLightboxItems: LightboxItem[] = update.fotos.map((f) => ({ id: f.id, url: f.url, name: f.legenda }));

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
                <span className="text-xs text-[var(--shell-subtext)] ml-auto">
                  {update.fotos.length} foto{update.fotos.length !== 1 ? "s" : ""}
                </span>
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

      {/* Fotos */}
      {expanded && (
        <div className="border-t border-[var(--shell-card-border)] px-4 py-3 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {update.fotos.map((foto, i) => (
              <div key={foto.id} className="group relative rounded-xl overflow-hidden border border-[var(--shell-card-border)]">
                <button type="button" onClick={() => setLightbox({ index: i })} className="block w-full">
                  <img src={foto.url} alt={foto.legenda || ""} className="w-full h-28 object-cover" />
                </button>
                {foto.legenda && (
                  <div className="px-2 py-1 text-xs text-[var(--shell-subtext)] truncate border-t border-[var(--shell-card-border)]">
                    {foto.legenda}
                  </div>
                )}
              </div>
            ))}

            {/* Botão adicionar */}
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

      {/* Lightbox de fotos da obra */}
      {lightbox && (
        <LightboxModal
          items={fotoLightboxItems}
          startIndex={lightbox.index}
          onClose={() => setLightbox(null)}
          onDelete={async (id) => {
            await handleDeleteFoto(id);
          }}
        />
      )}
    </div>
  );
}

// ─── Evolução de Obra ─────────────────────────────────────────────────────────

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

// ─── AbaMidia ─────────────────────────────────────────────────────────────────

export default function AbaMidia({ devId, capaUrl: initialCapaUrl }: { devId: string; capaUrl?: string | null }) {
  const [mediaTab, setMediaTab] = useState<MediaTab>("FOTO_COMERCIAL");
  const [capaUrl, setCapaUrl] = useState<string | null>(initialCapaUrl ?? null);

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--shell-card-border)]">
          <h2 className="text-base font-semibold text-[var(--shell-text)]">🖼️ Mídia Comercial</h2>
          <p className="text-xs text-[var(--shell-subtext)] mt-0.5">Fotos comerciais, panfletos e book do empreendimento.</p>
        </div>
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
              <MediaGallery
                key={key}
                devId={devId}
                categoria={key}
                accept={accept}
                hint={hint}
                capaUrl={key === "FOTO_COMERCIAL" ? capaUrl : undefined}
                onCapaChange={key === "FOTO_COMERCIAL" ? setCapaUrl : undefined}
              />
            ) : null
          )}
        </div>
      </section>

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
