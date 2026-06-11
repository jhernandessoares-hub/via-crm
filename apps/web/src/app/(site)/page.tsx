"use client";

import Link from "next/link";
import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  DEFAULT_SITE_ID,
  EditorElementStyle,
  SiteBlock,
  SiteBlockType,
  SiteContent,
  SiteCustomField,
  SiteSectionKind,
  cloneSiteContent,
  readSiteContentById,
  writeSiteContentToStorage,
} from "@/lib/site-content";
import EditableText from "@/components/site-editor/EditableText";
import EditableLogo from "@/components/site-editor/EditableLogo";
import BlockRenderer from "@/components/site-editor/BlockRenderer";
import EditorSidebar, { PreviewMode, FIELD_LABELS } from "@/components/site-editor/EditorSidebar";
import SalesContactModal from "@/components/site/SalesContactModal";

// â”€â”€â”€ Tipos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type SelectedField =
  | keyof typeof FIELD_LABELS
  | `customFields.${string}.text`
  | `dynamicBlocks.${string}.text`;
type SelectedVisual = SelectedField | "branding.headerLogo" | "branding.panelLogo";
type SectionKey = SiteCustomField["section"];

// â”€â”€â”€ Constantes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const PANEL_STEPS = [
  ["Primeiro contato", "42 clientes", "bg-slate-950"],
  ["Retorno agendado", "18 clientes", "bg-sky-500"],
  ["Visita em andamento", "11 clientes", "bg-amber-500"],
  ["Documentação", "7 clientes", "bg-violet-500"],
  ["Pós-atendimento", "6 clientes", "bg-emerald-500"],
] as const;

const MAX_HISTORY = 20;

const PREVIEW_WIDTHS: Record<PreviewMode, string | undefined> = {
  desktop: undefined,
  tablet: "768px",
  mobile: "375px",
};

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function cloneContent(c: SiteContent): SiteContent {
  return JSON.parse(JSON.stringify(c)) as SiteContent;
}

function getFieldValue(content: SiteContent, field: SelectedField): string {
  if (field.startsWith("dynamicBlocks.")) {
    const id = field.split(".")[1];
    return content.dynamicBlocks.find((b) => b.id === id)?.text ?? "";
  }
  if (field.startsWith("customFields.")) {
    const id = field.split(".")[1];
    return content.customFields.find((f) => f.id === id)?.text ?? "";
  }
  const [section, key] = field.split(".");
  const block = (content as unknown as Record<string, Record<string, string>>)[section];
  return block?.[key] ?? "";
}

function setFieldValue(content: SiteContent, field: SelectedField, value: string) {
  if (field.startsWith("dynamicBlocks.")) {
    const id = field.split(".")[1];
    const item = content.dynamicBlocks.find((b) => b.id === id);
    if (item) item.text = value;
    return;
  }
  if (field.startsWith("customFields.")) {
    const id = field.split(".")[1];
    const item = content.customFields.find((f) => f.id === id);
    if (item) item.text = value;
    return;
  }
  const [section, key] = field.split(".");
  const block = (content as unknown as Record<string, Record<string, string>>)[section];
  if (block) block[key] = value;
}

async function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const maxWidth = 1600;
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Erro ao processar imagem.")); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.9));
      };
      img.onerror = () => reject(new Error("Não foi possível ler a imagem."));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error("Falha ao carregar o arquivo."));
    reader.readAsDataURL(file);
  });
}

// â”€â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function SitePage() {
  const searchParams = useSearchParams();
  const siteId = searchParams.get("site") || DEFAULT_SITE_ID;
  const templateId = searchParams.get("templateId") || null;
  const siteApiId = searchParams.get("siteApiId") || null;

  const [draft, setDraft] = useState<SiteContent>(cloneSiteContent());
  const [history, setHistory] = useState<SiteContent[]>([]);
  const [future, setFuture] = useState<SiteContent[]>([]);
  const [salesModalOpen, setSalesModalOpen] = useState(false);

  const [editorMode, setEditorMode] = useState(false);
  const [isEditorMinimized, setIsEditorMinimized] = useState(false);
  const [isEditing, setIsEditing] = useState(true);
  const [selectedField, setSelectedField] = useState<SelectedVisual>("hero.titleLine1");
  const [status, setStatus] = useState("Modo de edição local ativo.");
  const [isSaveConfirming, setIsSaveConfirming] = useState(false);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("desktop");
  const [newSectionName, setNewSectionName] = useState("");
  const [newSectionKind, setNewSectionKind] = useState<SiteSectionKind>("hero");
  const [newBlockSectionId, setNewBlockSectionId] = useState("");
  const [newBlockType, setNewBlockType] = useState<SiteBlockType>("text");
  const [alignmentGuide, setAlignmentGuide] = useState<{ section: SectionKey; x?: number; y?: number } | null>(null);

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const sectionCanvasRefs = useRef<Partial<Record<SectionKey, HTMLDivElement | null>>>({});
  const dragRef = useRef<{ fieldId: SelectedField; section: SectionKey; startX: number; startY: number; originX: number; originY: number } | null>(null);

  // Load content
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEditorMode(params.get("editor") === "1");
    const loaded = readSiteContentById(siteId);
    setDraft(cloneContent(loaded));

    const sync = () => setDraft(cloneContent(readSiteContentById(siteId)));
    window.addEventListener("storage", sync);
    window.addEventListener("via-site-content-updated", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("via-site-content-updated", sync);
    };
  }, [siteId]);

  // Undo/redo keyboard
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!editorMode) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        if (e.shiftKey) { handleRedo(); } else { handleUndo(); }
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // Save confirm timeout
  useEffect(() => {
    if (!isSaveConfirming) return;
    const t = window.setTimeout(() => setIsSaveConfirming(false), 5000);
    return () => window.clearTimeout(t);
  }, [isSaveConfirming]);

  // Sync default block section
  useEffect(() => {
    if (!newBlockSectionId && draft.dynamicSections.length) {
      setNewBlockSectionId(draft.dynamicSections[0].id);
    }
  }, [draft.dynamicSections, newBlockSectionId]);

  // â”€â”€â”€ Draft mutations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const pushHistory = useCallback((prev: SiteContent) => {
    setHistory((h) => [...h.slice(-MAX_HISTORY + 1), cloneContent(prev)]);
    setFuture([]);
  }, []);

  const updateDraft = useCallback((mutator: (next: SiteContent) => void) => {
    setDraft((current) => {
      pushHistory(current);
      const next = cloneContent(current);
      mutator(next);
      return next;
    });
    setIsSaveConfirming(false);
  }, [pushHistory]);

  const updateElementStyle = useCallback((key: SelectedVisual, nextStyle: EditorElementStyle) => {
    updateDraft((next) => {
      next.editorStyles[key] = { ...(next.editorStyles[key] ?? {}), ...nextStyle };
    });
  }, [updateDraft]);

  function handleUndo() {
    setHistory((h) => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      setFuture((f) => [cloneContent(draft), ...f.slice(0, MAX_HISTORY - 1)]);
      setDraft(cloneContent(prev));
      return h.slice(0, -1);
    });
  }

  function handleRedo() {
    setFuture((f) => {
      if (!f.length) return f;
      const next = f[0];
      setHistory((h) => [...h.slice(-MAX_HISTORY + 1), cloneContent(draft)]);
      setDraft(cloneContent(next));
      return f.slice(1);
    });
  }

  // â”€â”€â”€ Save / Publish â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function saveDraft() {
    if (!isSaveConfirming) { setIsSaveConfirming(true); setStatus("Clique novamente para confirmar."); return; }
    writeSiteContentToStorage(draft, siteId);
    setIsSaveConfirming(false);
    setStatus("Rascunho salvo neste navegador.");
    window.dispatchEvent(new Event("via-site-content-updated"));
    if (templateId) {
      const token = localStorage.getItem("adminToken");
      const API = process.env.NEXT_PUBLIC_API_URL || "";
      fetch(`${API}/admin/sites/templates/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ contentJson: draft }),
      }).catch(() => null);
    } else if (siteApiId) {
      const token = localStorage.getItem("accessToken");
      const API = process.env.NEXT_PUBLIC_API_URL || "";
      fetch(`${API}/sites/${siteApiId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ contentJson: draft }),
      })
        .then(() => setStatus("Rascunho salvo no servidor."))
        .catch(() => setStatus("Erro ao salvar no servidor."));
    }
  }

  function publishSite() {
    writeSiteContentToStorage(draft, siteId);
    window.dispatchEvent(new Event("via-site-content-updated"));
    if (templateId) {
      const token = localStorage.getItem("adminToken");
      const API = process.env.NEXT_PUBLIC_API_URL || "";
      Promise.all([
        fetch(`${API}/admin/sites/templates/${templateId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ contentJson: draft }),
        }),
        fetch(`${API}/admin/sites/templates/${templateId}/publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        }),
      ]).catch(() => null).then(() => setStatus("Template publicado e salvo no servidor."));
    } else if (siteApiId) {
      const token = localStorage.getItem("accessToken");
      const API = process.env.NEXT_PUBLIC_API_URL || "";
      Promise.all([
        fetch(`${API}/sites/${siteApiId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ contentJson: draft }),
        }),
        fetch(`${API}/sites/${siteApiId}/publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        }),
      ]).catch(() => null).then(() => setStatus("Site publicado e salvo no servidor."));
    } else {
      setStatus("Site publicado! (local)");
    }
  }

  function restoreDraft() {
    setDraft(cloneContent(readSiteContentById(siteId)));
    setIsSaveConfirming(false);
    setStatus("Restaurado para o último rascunho salvo.");
  }

  // â”€â”€â”€ Image uploads â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async function handleHeroImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const src = await resizeImage(file);
      updateDraft((next) => { next.hero.image.src = src; next.hero.image.alt = file.name.replace(/\.[^.]+$/, "") || next.hero.image.alt; });
      setStatus("Imagem carregada. Clique em salvar.");
    } catch (err) { setStatus(err instanceof Error ? err.message : "Falha ao carregar."); }
    finally { e.target.value = ""; }
  }

  async function handleLogoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const src = await resizeImage(file);
      const target = selectedField === "branding.panelLogo" ? "panelLogo" : "headerLogo";
      updateDraft((next) => { next.branding[target].src = src; next.branding[target].alt = file.name.replace(/\.[^.]+$/, ""); });
      setStatus("Logo carregada. Clique em salvar.");
    } catch (err) { setStatus(err instanceof Error ? err.message : "Falha ao carregar."); }
    finally { e.target.value = ""; }
  }

  async function handleBlockImageUpload(blockId: string, src: string) {
    updateDraft((next) => {
      const block = next.dynamicBlocks.find((b) => b.id === blockId);
      if (block) block.src = src;
    });
    setStatus("Imagem do bloco atualizada. Clique em salvar.");
  }

  // â”€â”€â”€ Sections & Blocks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function createSection() {
    const id = `section-${Date.now()}`;
    updateDraft((next) => { next.dynamicSections.push({ id, name: newSectionName.trim() || "Nova seção", kind: newSectionKind }); });
    setNewBlockSectionId(id);
    setStatus("Nova seção criada.");
  }

  function moveSectionUp(id: string) {
    updateDraft((next) => {
      const idx = next.dynamicSections.findIndex((s) => s.id === id);
      if (idx <= 0) return;
      [next.dynamicSections[idx - 1], next.dynamicSections[idx]] = [next.dynamicSections[idx], next.dynamicSections[idx - 1]];
    });
  }

  function moveSectionDown(id: string) {
    updateDraft((next) => {
      const idx = next.dynamicSections.findIndex((s) => s.id === id);
      if (idx < 0 || idx >= next.dynamicSections.length - 1) return;
      [next.dynamicSections[idx], next.dynamicSections[idx + 1]] = [next.dynamicSections[idx + 1], next.dynamicSections[idx]];
    });
  }

  function createBlock() {
    if (!newBlockSectionId) { setStatus("Crie uma seção antes de adicionar um elemento."); return; }
    const id = `block-${Date.now()}`;
    const defaults: Record<SiteBlockType, Partial<SiteBlock> & EditorElementStyle> = {
      text: { text: "Novo texto", width: 320, height: 60, fontSize: 16 },
      title: { text: "Novo título", width: 420, height: 88, fontSize: 36, fontWeight: "bold" },
      button: { text: "Novo botão", width: 220, height: 52, fontSize: 16, fontWeight: "bold", clickable: true },
      image: { src: null, alt: "Nova imagem", width: 280, height: 180 },
      card: { text: "Novo card", width: 280, height: 180, fontSize: 18, fontWeight: "bold" },
      list: { text: "Nova lista", items: ["Item 1", "Item 2", "Item 3"], width: 320, height: 120, fontSize: 16 },
      icon: { text: "★", width: 72, height: 72, fontSize: 36 },
      video: { embedUrl: "", width: 360, height: 220 },
      form: { text: "Formulário", width: 340, height: 240 },
      "contact-form": { text: "Fale conosco", width: 360, height: 260 },
      divider: { width: 360, height: 24 },
      "property-search": { text: "Busca de Imóveis", width: 560, height: 80 },
      "property-grid": { text: "Grid de Imóveis", width: 600, height: 240 },
      "property-card": { text: "Card de Imóvel", width: 280, height: 200 },
      "property-map": { text: "Mapa de Imóveis", width: 600, height: 360 },
      "broker-grid": { text: "Grid de Corretores", width: 560, height: 200 },
      "whatsapp-button": { text: "Falar no WhatsApp", phone: "", width: 260, height: 60 },
      "team-card": { text: "Nome do Corretor\nCRECI 000000\n(00) 00000-0000", src: null, alt: "Foto", width: 200, height: 240 },
    };
    const preset = defaults[newBlockType];
    updateDraft((next) => {
      next.dynamicBlocks.push({
        id, sectionId: newBlockSectionId, type: newBlockType,
        text: preset.text ?? "", items: preset.items, src: preset.src ?? null,
        alt: preset.alt ?? "", embedUrl: preset.embedUrl ?? "", phone: preset.phone ?? undefined,
      });
      next.editorStyles[`dynamicBlocks.${id}.text`] = {
        width: preset.width, height: preset.height, fontSize: preset.fontSize,
        fontWeight: preset.fontWeight, clickable: preset.clickable, fontFamily: "sans",
      };
    });
    setSelectedField(`dynamicBlocks.${id}.text`);
    setStatus("Bloco criado.");
  }

  function deleteSelectedBlock() {
    const id = selectedField.startsWith("dynamicBlocks.") ? selectedField.split(".")[1] : null;
    if (!id) return;
    updateDraft((next) => {
      next.dynamicBlocks = next.dynamicBlocks.filter((b) => b.id !== id);
      delete next.editorStyles[`dynamicBlocks.${id}.text`];
    });
    setSelectedField("hero.titleLine1");
    setStatus("Bloco removido.");
  }

  function deleteSelectedCustomField() {
    const id = selectedField.startsWith("customFields.") ? selectedField.split(".")[1] : null;
    if (!id) return;
    updateDraft((next) => {
      next.customFields = next.customFields.filter((f) => f.id !== id);
      delete next.editorStyles[`customFields.${id}.text`];
    });
    setSelectedField("hero.titleLine1");
    setStatus("Campo removido.");
  }

  // â”€â”€â”€ Snapping â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const fieldsBySection = useCallback(
    (section: SectionKey) => draft.customFields.filter((f) => f.section === section),
    [draft.customFields],
  );

  const getElementStyle = useCallback((key: SelectedVisual): EditorElementStyle => draft.editorStyles[key] ?? {}, [draft.editorStyles]);

  const snapPosition = useCallback((fieldId: SelectedField, section: SectionKey, nextX: number, nextY: number) => {
    const container = sectionCanvasRefs.current[section];
    const style = getElementStyle(fieldId);
    const width = style.width ?? 280;
    const containerWidth = container?.clientWidth ?? 720;
    const threshold = 12;
    const others = fieldsBySection(section).filter((f) => `customFields.${f.id}.text` !== fieldId);

    let snappedX = Math.max(0, Math.min(nextX, Math.max(0, containerWidth - width)));
    let snappedY = Math.max(0, nextY);
    let guideX: number | undefined;
    let guideY: number | undefined;

    const xCandidates = [
      { value: 0, guide: 0 },
      { value: Math.max(0, (containerWidth - width) / 2), guide: containerWidth / 2 },
      { value: Math.max(0, containerWidth - width), guide: containerWidth },
    ];
    others.forEach((f) => {
      const s = getElementStyle(`customFields.${f.id}.text`);
      const ow = s.width ?? 280;
      const ox = s.x ?? 0;
      xCandidates.push({ value: ox, guide: ox }, { value: ox + ow / 2 - width / 2, guide: ox + ow / 2 }, { value: ox + ow - width, guide: ox + ow });
    });
    const yCandidates = [{ value: 0, guide: 0 }];
    others.forEach((f) => {
      const s = getElementStyle(`customFields.${f.id}.text`);
      const oh = s.height ?? 56;
      const oy = s.y ?? 0;
      yCandidates.push({ value: oy, guide: oy }, { value: oy + oh, guide: oy + oh });
    });
    xCandidates.forEach((c) => { if (Math.abs(snappedX - c.value) <= threshold) { snappedX = c.value; guideX = c.guide; } });
    yCandidates.forEach((c) => { if (Math.abs(snappedY - c.value) <= threshold) { snappedY = c.value; guideY = c.guide; } });
    return { x: Math.round(snappedX), y: Math.round(snappedY), guide: guideX !== undefined || guideY !== undefined ? { section, x: guideX, y: guideY } : null };
  }, [fieldsBySection, getElementStyle]);

  const interactiveEditing = editorMode && isEditing;

  useEffect(() => {
    if (!interactiveEditing) return;
    function onPointerMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      const snapped = snapPosition(drag.fieldId, drag.section, drag.originX + e.clientX - drag.startX, drag.originY + e.clientY - drag.startY);
      updateElementStyle(drag.fieldId, { x: snapped.x, y: snapped.y });
      setAlignmentGuide(snapped.guide);
    }
    function stopDrag() { dragRef.current = null; setAlignmentGuide(null); }
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopDrag);
    return () => { window.removeEventListener("pointermove", onPointerMove); window.removeEventListener("pointerup", stopDrag); };
  }, [interactiveEditing, snapPosition, updateElementStyle]);

  // â”€â”€â”€ Custom field canvas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function renderCustomFieldCanvas(section: SectionKey, toneClass: string) {
    const items = fieldsBySection(section);
    if (!items.length) return null;
    const estimatedHeight = items.reduce((max, item, i) => {
      const s = getElementStyle(`customFields.${item.id}.text`);
      return Math.max(max, (s.y ?? i * 72) + (s.height ?? 56) + 24);
    }, 120);
    return (
      <div
        ref={(node) => { sectionCanvasRefs.current[section] = node; }}
        className={`relative mt-6 overflow-hidden rounded-2xl border border-dashed ${toneClass}`}
        style={{ minHeight: `${estimatedHeight}px` }}
      >
        {alignmentGuide?.section === section && alignmentGuide.x !== undefined && (
          <div className="pointer-events-none absolute inset-y-0 w-px bg-sky-400/80" style={{ left: `${alignmentGuide.x}px` }} />
        )}
        {alignmentGuide?.section === section && alignmentGuide.y !== undefined && (
          <div className="pointer-events-none absolute inset-x-0 h-px bg-sky-400/80" style={{ top: `${alignmentGuide.y}px` }} />
        )}
        {items.map((item, i) => {
          const fieldId = `customFields.${item.id}.text` as SelectedField;
          const s = getElementStyle(fieldId);
          const variantClass =
            item.variant === "title" ? "text-3xl font-semibold tracking-tight text-current" :
            item.variant === "button" ? "inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white" :
            "text-base leading-7 text-current";
          return (
            <div
              key={item.id} id={item.id}
              className={`absolute scroll-mt-24 ${interactiveEditing ? "cursor-move" : ""}`}
              style={{ left: `${s.x ?? 0}px`, top: `${s.y ?? i * 72}px` }}
              onPointerDown={(e) => {
                if (!interactiveEditing) return;
                const target = e.target as HTMLElement;
                if (target.closest("[data-resize-handle='1']")) return;
                dragRef.current = { fieldId, section, startX: e.clientX, startY: e.clientY, originX: s.x ?? 0, originY: s.y ?? i * 72 };
                setSelectedField(fieldId);
              }}
            >
              <EditableText
                active={interactiveEditing} selected={selectedField === fieldId} label="Bloco"
                value={item.text} onClick={() => setSelectedField(fieldId)} className={variantClass}
                styleBox={s} minWidth={item.variant === "title" ? 260 : 220}
                minHeight={item.variant === "button" ? 52 : 52} allowMove={false}
                onResize={(ns) => updateElementStyle(fieldId, ns)}
                onTextChange={(v) => updateDraft((next) => setFieldValue(next, fieldId, v))}
              />
            </div>
          );
        })}
      </div>
    );
  }

  // â”€â”€â”€ Dynamic sections â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function renderDynamicSections() {
    return draft.dynamicSections.map((section) => {
      const blocks = draft.dynamicBlocks.filter((b) => b.sectionId === section.id);

      // ── Cabeçalho VIA padrão — só quando não há blocos próprios ───────────
      if (section.kind === "header" && blocks.length === 0) {
        return (
          <div key={section.id} id={section.id} className="px-6 pt-6 lg:px-8">
            {interactiveEditing && <div className="mb-2 text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">{section.name}</div>}
            <header className="flex items-center justify-between rounded-full border border-slate-200/80 bg-white/80 px-5 py-3 shadow-sm backdrop-blur">
              <EditableLogo active={interactiveEditing} selected={selectedField === "branding.headerLogo"} label="Logo principal" src={view.branding.headerLogo.src} alt={view.branding.headerLogo.alt} height={view.branding.headerLogo.height} styleBox={getElementStyle("branding.headerLogo")} minWidth={160} minHeight={40} onMove={(ns) => updateElementStyle("branding.headerLogo", ns)} onResize={(ns) => updateElementStyle("branding.headerLogo", ns)} onClick={() => setSelectedField("branding.headerLogo")} />
              <div className="flex items-center gap-5">
                <nav className="flex items-center gap-5 text-sm font-medium text-slate-600">
                  {interactiveEditing ? (
                    <EditableText active={interactiveEditing} selected={selectedField === "nav.problem"} label="Menu Problema" value={view.nav.problem} onClick={() => setSelectedField("nav.problem")} onTextChange={(v) => updateDraft((next) => setFieldValue(next, "nav.problem", v))} className="text-sm font-medium text-slate-600" styleBox={getElementStyle("nav.problem")} minWidth={90} minHeight={36} onMove={(ns) => updateElementStyle("nav.problem", ns)} onResize={(ns) => updateElementStyle("nav.problem", ns)} />
                  ) : <a href="#problema" className="text-sm font-medium text-slate-600 transition hover:text-slate-950">{view.nav.problem}</a>}
                  {interactiveEditing ? (
                    <EditableText active={interactiveEditing} selected={selectedField === "nav.solution"} label="Menu Solução" value={view.nav.solution} onClick={() => setSelectedField("nav.solution")} onTextChange={(v) => updateDraft((next) => setFieldValue(next, "nav.solution", v))} className="text-sm font-medium text-slate-600" styleBox={getElementStyle("nav.solution")} minWidth={90} minHeight={36} onMove={(ns) => updateElementStyle("nav.solution", ns)} onResize={(ns) => updateElementStyle("nav.solution", ns)} />
                  ) : <a href="#solucao" className="text-sm font-medium text-slate-600 transition hover:text-slate-950">{view.nav.solution}</a>}
                  {interactiveEditing ? (
                    <EditableText active={interactiveEditing} selected={selectedField === "nav.plans"} label="Menu Planos" value={view.nav.plans} onClick={() => setSelectedField("nav.plans")} onTextChange={(v) => updateDraft((next) => setFieldValue(next, "nav.plans", v))} className="text-sm font-medium text-slate-600" styleBox={getElementStyle("nav.plans")} minWidth={90} minHeight={36} onMove={(ns) => updateElementStyle("nav.plans", ns)} onResize={(ns) => updateElementStyle("nav.plans", ns)} />
                  ) : <a href="#planos" className="text-sm font-medium text-slate-600 transition hover:text-slate-950">{view.nav.plans}</a>}
                </nav>
                {interactiveEditing ? (
                  <EditableText active={interactiveEditing} selected={selectedField === "header.loginLabel"} label="Botão Entrar" value={view.header.loginLabel} onClick={() => setSelectedField("header.loginLabel")} onTextChange={(v) => updateDraft((next) => setFieldValue(next, "header.loginLabel", v))} className="hidden text-sm font-medium text-slate-600 sm:inline-flex" styleBox={getElementStyle("header.loginLabel")} minWidth={90} minHeight={36} onMove={(ns) => updateElementStyle("header.loginLabel", ns)} onResize={(ns) => updateElementStyle("header.loginLabel", ns)} />
                ) : (
                  <Link href="/login" className="hidden text-sm font-medium text-slate-600 transition hover:text-slate-950 sm:inline-flex">{view.header.loginLabel}</Link>
                )}
                {interactiveEditing ? (
                  <EditableText active={interactiveEditing} selected={selectedField === "header.ctaLabel"} label="Botão CTA header" value={view.header.ctaLabel} onClick={() => setSelectedField("header.ctaLabel")} onTextChange={(v) => updateDraft((next) => setFieldValue(next, "header.ctaLabel", v))} className="inline-flex items-center rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white" styleBox={getElementStyle("header.ctaLabel")} minWidth={150} minHeight={44} onMove={(ns) => updateElementStyle("header.ctaLabel", ns)} onResize={(ns) => updateElementStyle("header.ctaLabel", ns)} />
                ) : (
                  <Link href="/login" className="inline-flex items-center rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">{view.header.ctaLabel}</Link>
                )}
              </div>
            </header>
          </div>
        );
      }

      const sectionStyle: React.CSSProperties = section.bgColor ? { backgroundColor: section.bgColor } : {};
      const defaultBg =
        section.bgColor ? "" :
        section.kind === "hero" ? "bg-gradient-to-b from-slate-50 to-slate-100" :
        section.kind === "cta" ? "bg-slate-950 text-white" :
        section.kind === "footer" ? "bg-slate-100" :
        section.kind === "properties" ? "bg-slate-50" :
        section.kind === "team" ? "bg-white" :
        section.kind === "contact" ? "bg-slate-50" :
        "bg-white";

      return (
        <section key={section.id} id={section.id} className={`${!section.bgColor ? "border-t border-slate-200" : ""} ${defaultBg}`} style={sectionStyle}>
          <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
            {interactiveEditing && <div className="mb-4 text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">{section.name}</div>}
            <div className={`relative min-h-[120px] ${editorMode ? "rounded-[2rem] border border-dashed border-slate-200/60 p-6" : ""}`}>
              {blocks.length ? (
                <div className="flex flex-wrap gap-6">
                  {blocks.map((block) => {
                    const fieldId = `dynamicBlocks.${block.id}.text` as SelectedField;
                    const style = getElementStyle(fieldId);
                    return (
                      <div key={block.id} id={block.id} className="scroll-mt-24">
                        <BlockRenderer
                          block={block}
                          active={interactiveEditing}
                          selected={selectedField === fieldId}
                          styleBox={style}
                          onMove={(ns) => updateElementStyle(fieldId, ns)}
                          onResize={(ns) => updateElementStyle(fieldId, ns)}
                          onClick={() => setSelectedField(fieldId)}
                          onImageUpload={(src) => handleBlockImageUpload(block.id, src)}
                          onTextChange={(v) => updateDraft((next) => { const b = next.dynamicBlocks.find((x) => x.id === block.id); if (b) b.text = v; })}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : editorMode ? (
                <div className="text-sm text-slate-400">Esta seção ainda não tem elementos. Adicione pelo painel lateral.</div>
              ) : null}
            </div>
          </div>
        </section>
      );
    });
  }

  // â”€â”€â”€ View â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const view = draft;
  const showEditorSidebar = editorMode && !isEditorMinimized;
  const previewWidth = PREVIEW_WIDTHS[previewMode];

  return (
    <div className={`${showEditorSidebar ? "lg:flex lg:h-screen lg:overflow-hidden" : "min-h-screen"}`}>
      {/* Canvas */}
      <div className={`flex-1 min-w-0 ${showEditorSidebar ? "lg:overflow-y-auto" : ""}`}>
        <div
          className="mx-auto transition-all duration-300"
          style={previewWidth ? { maxWidth: previewWidth, border: "1px solid #e2e8f0", borderRadius: "1rem", overflow: "hidden", margin: "1rem auto" } : undefined}
        >
          <main
            className={`min-h-screen text-slate-950 ${!view.theme?.pageBg ? "bg-white" : ""}`}
            style={{
              backgroundColor: view.theme?.pageBg,
              fontFamily: view.theme?.fontFamily === "serif" ? "Georgia, 'Times New Roman', serif" : view.theme?.fontFamily === "mono" ? "'Courier New', monospace" : undefined,
              "--site-primary": view.theme?.primaryColor ?? "#0f172a",
              "--site-accent": view.theme?.accentColor ?? "#10b981",
            } as React.CSSProperties}
          >
            {/* Cabeçalho — no modo público sempre aparece; no editor só quando não há seção "header" dinâmica */}
            {(!editorMode || !draft.dynamicSections.some((s) => s.kind === "header")) && (
              !interactiveEditing ? (
                <div className="sticky top-0 z-40 px-6 pt-4 pb-2 lg:px-8">
                  <header className="flex items-center justify-between rounded-full border border-slate-700/60 bg-slate-800/90 px-5 py-3 shadow-lg shadow-slate-900/20 backdrop-blur">
                    <EditableLogo active={interactiveEditing} selected={selectedField === "branding.headerLogo"} label="Logo principal" src={view.branding.headerLogo.src} alt={view.branding.headerLogo.alt} height={view.branding.headerLogo.height} styleBox={getElementStyle("branding.headerLogo")} minWidth={160} minHeight={40} onMove={(ns) => updateElementStyle("branding.headerLogo", ns)} onResize={(ns) => updateElementStyle("branding.headerLogo", ns)} onClick={() => setSelectedField("branding.headerLogo")} />
                    <div className="flex items-center gap-5">
                      <nav className="flex items-center gap-5 text-sm font-medium text-slate-200">
                        <a href="#problema" className="text-sm font-medium text-slate-200 transition hover:text-white">{view.nav.problem}</a>
                        <a href="#solucao" className="text-sm font-medium text-slate-200 transition hover:text-white">{view.nav.solution}</a>
                        <a href="#planos" className="text-sm font-medium text-slate-200 transition hover:text-white">{view.nav.plans}</a>
                      </nav>
                      <Link href="/login" className="hidden text-sm font-medium text-slate-200 transition hover:text-white sm:inline-flex">{view.header.loginLabel}</Link>
                      <Link href="/login" className="inline-flex items-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-200">{view.header.ctaLabel}</Link>
                    </div>
                  </header>
                </div>
              ) : (
                <div className="px-6 pt-6 lg:px-8">
                  <header className="flex items-center justify-between rounded-full border border-slate-200/80 bg-white/80 px-5 py-3 shadow-sm backdrop-blur">
                    <EditableLogo active={interactiveEditing} selected={selectedField === "branding.headerLogo"} label="Logo principal" src={view.branding.headerLogo.src} alt={view.branding.headerLogo.alt} height={view.branding.headerLogo.height} styleBox={getElementStyle("branding.headerLogo")} minWidth={160} minHeight={40} onMove={(ns) => updateElementStyle("branding.headerLogo", ns)} onResize={(ns) => updateElementStyle("branding.headerLogo", ns)} onClick={() => setSelectedField("branding.headerLogo")} />
                    <div className="flex items-center gap-5">
                      <nav className="flex items-center gap-5 text-sm font-medium text-slate-600">
                        {interactiveEditing ? (
                          <EditableText active={interactiveEditing} selected={selectedField === "nav.problem"} label="Menu Problema" value={view.nav.problem} onClick={() => setSelectedField("nav.problem")} onTextChange={(v) => updateDraft((next) => setFieldValue(next, "nav.problem", v))} className="text-sm font-medium text-slate-600" styleBox={getElementStyle("nav.problem")} minWidth={90} minHeight={36} onMove={(ns) => updateElementStyle("nav.problem", ns)} onResize={(ns) => updateElementStyle("nav.problem", ns)} />
                        ) : <a href="#problema" className="text-sm font-medium text-slate-600 transition hover:text-slate-950">{view.nav.problem}</a>}
                        {interactiveEditing ? (
                          <EditableText active={interactiveEditing} selected={selectedField === "nav.solution"} label="Menu Solução" value={view.nav.solution} onClick={() => setSelectedField("nav.solution")} onTextChange={(v) => updateDraft((next) => setFieldValue(next, "nav.solution", v))} className="text-sm font-medium text-slate-600" styleBox={getElementStyle("nav.solution")} minWidth={90} minHeight={36} onMove={(ns) => updateElementStyle("nav.solution", ns)} onResize={(ns) => updateElementStyle("nav.solution", ns)} />
                        ) : <a href="#solucao" className="text-sm font-medium text-slate-600 transition hover:text-slate-950">{view.nav.solution}</a>}
                        {interactiveEditing ? (
                          <EditableText active={interactiveEditing} selected={selectedField === "nav.plans"} label="Menu Planos" value={view.nav.plans} onClick={() => setSelectedField("nav.plans")} onTextChange={(v) => updateDraft((next) => setFieldValue(next, "nav.plans", v))} className="text-sm font-medium text-slate-600" styleBox={getElementStyle("nav.plans")} minWidth={90} minHeight={36} onMove={(ns) => updateElementStyle("nav.plans", ns)} onResize={(ns) => updateElementStyle("nav.plans", ns)} />
                        ) : <a href="#planos" className="text-sm font-medium text-slate-600 transition hover:text-slate-950">{view.nav.plans}</a>}
                      </nav>
                      {interactiveEditing ? (
                        <EditableText active={interactiveEditing} selected={selectedField === "header.loginLabel"} label="Botão Entrar" value={view.header.loginLabel} onClick={() => setSelectedField("header.loginLabel")} onTextChange={(v) => updateDraft((next) => setFieldValue(next, "header.loginLabel", v))} className="hidden text-sm font-medium text-slate-600 sm:inline-flex" styleBox={getElementStyle("header.loginLabel")} minWidth={90} minHeight={36} onMove={(ns) => updateElementStyle("header.loginLabel", ns)} onResize={(ns) => updateElementStyle("header.loginLabel", ns)} />
                      ) : (
                        <Link href="/login" className="hidden text-sm font-medium text-slate-600 transition hover:text-slate-950 sm:inline-flex">{view.header.loginLabel}</Link>
                      )}
                      {interactiveEditing ? (
                        <EditableText active={interactiveEditing} selected={selectedField === "header.ctaLabel"} label="Botão CTA header" value={view.header.ctaLabel} onClick={() => setSelectedField("header.ctaLabel")} onTextChange={(v) => updateDraft((next) => setFieldValue(next, "header.ctaLabel", v))} className="inline-flex items-center rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white" styleBox={getElementStyle("header.ctaLabel")} minWidth={150} minHeight={44} onMove={(ns) => updateElementStyle("header.ctaLabel", ns)} onResize={(ns) => updateElementStyle("header.ctaLabel", ns)} />
                      ) : (
                        <Link href="/login" className="inline-flex items-center rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">{view.header.ctaLabel}</Link>
                      )}
                    </div>
                  </header>
                </div>
              )
            )}

            {/* Seções do template base — no modo público sempre aparecem; no editor só quando não há seções dinâmicas */}
            {(!editorMode || draft.dynamicSections.length === 0) && <>
            <section className="mx-auto max-w-7xl px-6 pb-16 pt-2 lg:px-8">
              <div className="grid items-start gap-14 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:py-10">
                <div className="max-w-3xl">
                  <EditableText active={interactiveEditing} selected={selectedField === "hero.badge"} label="Badge hero" value={view.hero.badge} onClick={() => setSelectedField("hero.badge")} onTextChange={(v) => updateDraft((next) => setFieldValue(next, "hero.badge", v))} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs font-semibold tracking-wide text-emerald-700 uppercase" styleBox={getElementStyle("hero.badge")} minWidth={180} minHeight={38} onMove={(ns) => updateElementStyle("hero.badge", ns)} onResize={(ns) => updateElementStyle("hero.badge", ns)} />
                  <div className="mt-6 space-y-3">
                    <EditableText active={interactiveEditing} selected={selectedField === "hero.titleLine1"} label="Título hero linha 1" value={view.hero.titleLine1} onClick={() => setSelectedField("hero.titleLine1")} onTextChange={(v) => updateDraft((next) => setFieldValue(next, "hero.titleLine1", v))} className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl" styleBox={getElementStyle("hero.titleLine1")} minWidth={280} minHeight={72} onMove={(ns) => updateElementStyle("hero.titleLine1", ns)} onResize={(ns) => updateElementStyle("hero.titleLine1", ns)} />
                    <EditableText active={interactiveEditing} selected={selectedField === "hero.titleLine2"} label="Título hero linha 2" value={view.hero.titleLine2} onClick={() => setSelectedField("hero.titleLine2")} onTextChange={(v) => updateDraft((next) => setFieldValue(next, "hero.titleLine2", v))} className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl" styleBox={getElementStyle("hero.titleLine2")} minWidth={280} minHeight={72} onMove={(ns) => updateElementStyle("hero.titleLine2", ns)} onResize={(ns) => updateElementStyle("hero.titleLine2", ns)} />
                  </div>
                  <div className="mt-6 max-w-2xl">
                    <EditableText active={interactiveEditing} selected={selectedField === "hero.description"} label="Descrição hero" value={view.hero.description} onClick={() => setSelectedField("hero.description")} onTextChange={(v) => updateDraft((next) => setFieldValue(next, "hero.description", v))} multiline className="text-lg leading-8 text-slate-600" styleBox={getElementStyle("hero.description")} minWidth={320} minHeight={120} onMove={(ns) => updateElementStyle("hero.description", ns)} onResize={(ns) => updateElementStyle("hero.description", ns)} />
                  </div>
                  <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    {interactiveEditing ? (
                      <EditableText active={interactiveEditing} selected={selectedField === "hero.primaryCta"} label="Botão principal hero" value={view.hero.primaryCta} onClick={() => setSelectedField("hero.primaryCta")} onTextChange={(v) => updateDraft((next) => setFieldValue(next, "hero.primaryCta", v))} className="inline-flex items-center justify-center rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white" styleBox={getElementStyle("hero.primaryCta")} minWidth={180} minHeight={48} onMove={(ns) => updateElementStyle("hero.primaryCta", ns)} onResize={(ns) => updateElementStyle("hero.primaryCta", ns)} />
                    ) : (
                      <Link href="/login" className="inline-flex items-center justify-center rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">{view.hero.primaryCta}</Link>
                    )}
                    {interactiveEditing ? (
                      <EditableText active={interactiveEditing} selected={selectedField === "hero.secondaryCta"} label="Botão secundário hero" value={view.hero.secondaryCta} onClick={() => setSelectedField("hero.secondaryCta")} onTextChange={(v) => updateDraft((next) => setFieldValue(next, "hero.secondaryCta", v))} className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700" styleBox={getElementStyle("hero.secondaryCta")} minWidth={160} minHeight={48} onMove={(ns) => updateElementStyle("hero.secondaryCta", ns)} onResize={(ns) => updateElementStyle("hero.secondaryCta", ns)} />
                    ) : (
                      <a href="#planos" className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">{view.hero.secondaryCta}</a>
                    )}
                  </div>
                  {renderCustomFieldCanvas("hero", "border-slate-200 bg-white/40")}
                  <div className="mt-10 grid gap-4 sm:grid-cols-3">
                    {view.metrics.map((m) => (
                      <div key={m.value} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                        <div className="text-3xl font-bold text-emerald-600">{m.value}</div>
                        <div className="mt-2 text-sm leading-6 text-slate-500">{m.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute -left-6 top-8 h-32 w-32 rounded-full bg-emerald-200/40 blur-3xl" />
                  <div className="absolute -right-8 bottom-10 h-40 w-40 rounded-full bg-sky-200/50 blur-3xl" />
                  <div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-950 p-6 text-white shadow-2xl shadow-slate-300/60">
                    <div className="flex items-center justify-between border-b border-white/10 pb-4">
                      <div>
                        <EditableLogo active={interactiveEditing} selected={selectedField === "branding.panelLogo"} label="Logo painel" src={view.branding.panelLogo.src} alt={view.branding.panelLogo.alt} height={view.branding.panelLogo.height} styleBox={getElementStyle("branding.panelLogo")} minWidth={150} minHeight={40} onMove={(ns) => updateElementStyle("branding.panelLogo", ns)} onResize={(ns) => updateElementStyle("branding.panelLogo", ns)} dark onClick={() => setSelectedField("branding.panelLogo")} />
                        <div className="mt-3 max-w-60">
                          <EditableText active={interactiveEditing} selected={selectedField === "hero.panelEyebrow"} label="Eyebrow painel" value={view.hero.panelEyebrow} onClick={() => setSelectedField("hero.panelEyebrow")} onTextChange={(v) => updateDraft((next) => setFieldValue(next, "hero.panelEyebrow", v))} className="text-xs uppercase tracking-[0.28em] text-slate-400" styleBox={getElementStyle("hero.panelEyebrow")} minWidth={160} minHeight={36} onMove={(ns) => updateElementStyle("hero.panelEyebrow", ns)} onResize={(ns) => updateElementStyle("hero.panelEyebrow", ns)} />
                        </div>
                        <div className="mt-2">
                          <EditableText active={interactiveEditing} selected={selectedField === "hero.panelTitle"} label="Título painel" value={view.hero.panelTitle} onClick={() => setSelectedField("hero.panelTitle")} onTextChange={(v) => updateDraft((next) => setFieldValue(next, "hero.panelTitle", v))} className="text-2xl font-semibold text-white" styleBox={getElementStyle("hero.panelTitle")} minWidth={220} minHeight={56} onMove={(ns) => updateElementStyle("hero.panelTitle", ns)} onResize={(ns) => updateElementStyle("hero.panelTitle", ns)} />
                        </div>
                      </div>
                      <EditableText active={interactiveEditing} selected={selectedField === "hero.panelStatus"} label="Status painel" value={view.hero.panelStatus} onClick={() => setSelectedField("hero.panelStatus")} onTextChange={(v) => updateDraft((next) => setFieldValue(next, "hero.panelStatus", v))} className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300" styleBox={getElementStyle("hero.panelStatus")} minWidth={90} minHeight={34} onMove={(ns) => updateElementStyle("hero.panelStatus", ns)} onResize={(ns) => updateElementStyle("hero.panelStatus", ns)} />
                    </div>

                    {view.hero.image.src ? (
                      <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                        <div className="relative h-64 w-full">
                          <img src={view.hero.image.src} alt={view.hero.image.alt} className={`absolute inset-0 h-full w-full ${view.hero.image.fit === "cover" ? "object-cover" : "object-contain"}`} style={{ objectPosition: `center ${view.hero.image.positionY}%`, transform: `scale(${view.hero.image.scale / 100})` }} />
                        </div>
                      </div>
                    ) : interactiveEditing ? (
                      <button type="button" onClick={() => imageInputRef.current?.click()} className="mt-5 w-full rounded-2xl border border-dashed border-white/20 bg-white/5 p-8 text-center text-sm text-slate-300">
                        Clique para inserir imagem no painel
                      </button>
                    ) : null}

                    <div className="mt-6 grid gap-4 sm:grid-cols-2">
                      <div className="rounded-2xl bg-white/5 p-5"><div className="text-sm text-slate-400">Atendimentos ativos</div><div className="mt-2 text-4xl font-semibold">184</div><div className="mt-2 text-sm text-emerald-300">acompanhamento centralizado</div></div>
                      <div className="rounded-2xl bg-white/5 p-5"><div className="text-sm text-slate-400">Retornos agendados</div><div className="mt-2 text-4xl font-semibold">37</div><div className="mt-2 text-sm text-sky-300">agenda integrada</div></div>
                    </div>

                    <div className="mt-4 rounded-2xl bg-white p-5 text-slate-950">
                      <div className="flex items-center justify-between">
                        <div><div className="text-sm text-slate-500">Rotina da semana</div><div className="mt-1 text-xl font-semibold">Do primeiro contato ao acompanhamento</div></div>
                        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">5 etapas-chave</div>
                      </div>
                      <div className="mt-5 space-y-3">
                        {PANEL_STEPS.map(([step, amount, color]) => (
                          <div key={step} className="space-y-1">
                            <div className="flex items-center justify-between text-sm"><span className="font-medium text-slate-700">{step}</span><span className="text-slate-500">{amount}</span></div>
                            <div className="h-2 rounded-full bg-slate-100"><div className={`h-2 rounded-full ${color}`} style={{ width: step === "Primeiro contato" ? "88%" : step === "Retorno agendado" ? "66%" : step === "Visita em andamento" ? "52%" : step === "Documentação" ? "41%" : "34%" }} /></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleHeroImageChange} />
                </div>
              </div>
            </section>

            {/* Seções fixas legadas */}
            <section id="problema" className="scroll-mt-24 bg-slate-950 text-white">
              <div className="mx-auto grid max-w-7xl gap-10 px-6 py-20 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">{view.problem.eyebrow}</div>
                  <EditableText active={interactiveEditing} selected={selectedField === "problem.title"} label="Título Problema" value={view.problem.title} onClick={() => setSelectedField("problem.title")} onTextChange={(v) => updateDraft((next) => setFieldValue(next, "problem.title", v))} multiline className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl" styleBox={getElementStyle("problem.title")} minWidth={260} minHeight={110} onResize={(ns) => updateElementStyle("problem.title", ns)} />
                  {renderCustomFieldCanvas("problem", "border-white/20 bg-white/5")}
                </div>
                <div className="grid gap-4">
                  {view.problem.items.map((pain, i) => (
                    <div key={pain} className="flex items-start gap-4 rounded-2xl border border-white/10 bg-white/5 p-6">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-slate-300 ring-1 ring-white/10">
                        {i + 1}
                      </span>
                      <div className="text-base leading-7 text-slate-300">{pain}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section id="solucao" className="scroll-mt-24 mx-auto max-w-7xl px-6 py-16 lg:px-8">
              <div className="max-w-3xl">
                <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">{view.solution.eyebrow}</div>
                <EditableText active={interactiveEditing} selected={selectedField === "solution.title"} label="Título Solução" value={view.solution.title} onClick={() => setSelectedField("solution.title")} onTextChange={(v) => updateDraft((next) => setFieldValue(next, "solution.title", v))} multiline className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl" styleBox={getElementStyle("solution.title")} minWidth={320} minHeight={96} onResize={(ns) => updateElementStyle("solution.title", ns)} />
                <EditableText active={interactiveEditing} selected={selectedField === "solution.description"} label="Descrição Solução" value={view.solution.description} onClick={() => setSelectedField("solution.description")} onTextChange={(v) => updateDraft((next) => setFieldValue(next, "solution.description", v))} multiline className="mt-4 text-lg leading-8 text-slate-600" styleBox={getElementStyle("solution.description")} minWidth={320} minHeight={120} onResize={(ns) => updateElementStyle("solution.description", ns)} />
                {renderCustomFieldCanvas("solution", "border-slate-200 bg-white/40")}
              </div>
              <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {view.features.map((f, i) => (
                  <article key={f.title} className="group rounded-[1.75rem] border border-slate-100 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-emerald-100 hover:shadow-md">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-sm font-bold text-emerald-600 ring-1 ring-emerald-100">
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <h3 className="mt-5 text-lg font-semibold text-slate-950">{f.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-slate-500">{f.description}</p>
                  </article>
                ))}
              </div>
            </section>

            <section id="planos" className="scroll-mt-24 bg-slate-950 text-white">
              <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
                <div className="max-w-3xl">
                  <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">{view.plansSection.eyebrow}</div>
                  <EditableText active={interactiveEditing} selected={selectedField === "plansSection.title"} label="Título Planos" value={view.plansSection.title} onClick={() => setSelectedField("plansSection.title")} onTextChange={(v) => updateDraft((next) => setFieldValue(next, "plansSection.title", v))} multiline className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl" styleBox={getElementStyle("plansSection.title")} minWidth={320} minHeight={100} onResize={(ns) => updateElementStyle("plansSection.title", ns)} />
                  <EditableText active={interactiveEditing} selected={selectedField === "plansSection.description"} label="Descrição Planos" value={view.plansSection.description} onClick={() => setSelectedField("plansSection.description")} onTextChange={(v) => updateDraft((next) => setFieldValue(next, "plansSection.description", v))} multiline className="mt-4 text-lg leading-8 text-slate-300" styleBox={getElementStyle("plansSection.description")} minWidth={320} minHeight={110} onResize={(ns) => updateElementStyle("plansSection.description", ns)} />
                  {renderCustomFieldCanvas("plans", "border-white/20 bg-white/5")}
                </div>
                <div className="mt-10 grid gap-5 lg:grid-cols-3">
                  {view.plans.map((plan) => (
                    <article key={plan.name} className={`rounded-[1.75rem] border p-6 ${plan.featured ? "border-emerald-300 bg-white text-slate-950 shadow-2xl" : "border-white/10 bg-white/5"}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div><h3 className="text-2xl font-semibold">{plan.name}</h3><p className={`mt-2 text-sm leading-6 ${plan.featured ? "text-slate-600" : "text-slate-300"}`}>{plan.description}</p></div>
                        {plan.featured && <div className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">Mais escolhido</div>}
                      </div>
                      <div className="mt-8 text-3xl font-semibold">{plan.price}</div>
                      <div className="mt-6 space-y-3">
                        {plan.items.map((item) => (
                          <div key={item} className={`flex items-center gap-3 text-sm ${plan.featured ? "text-slate-700" : "text-slate-200"}`}>
                            <svg className={`h-4 w-4 shrink-0 ${plan.featured ? "text-emerald-500" : "text-emerald-300"}`} viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            {item}
                          </div>
                        ))}
                      </div>
                      <button type="button" onClick={() => setSalesModalOpen(true)} className={`mt-8 inline-flex w-full items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition ${plan.featured ? "bg-slate-950 text-white hover:bg-slate-800" : "bg-white text-slate-950 hover:bg-slate-200"}`}>
                        Falar com vendas
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            <section id="cta-final" className="scroll-mt-24 mx-auto max-w-7xl px-6 py-16 lg:px-8">
              <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl">
                <div className="grid gap-8 px-6 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:px-10 lg:py-12">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">{view.finalCta.eyebrow}</div>
                    <EditableText active={interactiveEditing} selected={selectedField === "finalCta.title"} label="Título CTA Final" value={view.finalCta.title} onClick={() => setSelectedField("finalCta.title")} onTextChange={(v) => updateDraft((next) => setFieldValue(next, "finalCta.title", v))} multiline className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl" styleBox={getElementStyle("finalCta.title")} minWidth={320} minHeight={100} onResize={(ns) => updateElementStyle("finalCta.title", ns)} />
                    <EditableText active={interactiveEditing} selected={selectedField === "finalCta.description"} label="Descrição CTA Final" value={view.finalCta.description} onClick={() => setSelectedField("finalCta.description")} onTextChange={(v) => updateDraft((next) => setFieldValue(next, "finalCta.description", v))} multiline className="mt-4 text-lg leading-8 text-slate-600" styleBox={getElementStyle("finalCta.description")} minWidth={320} minHeight={120} onResize={(ns) => updateElementStyle("finalCta.description", ns)} />
                    {renderCustomFieldCanvas("finalCta", "border-slate-200 bg-slate-50")}
                  </div>
                  <div className="flex flex-col justify-center gap-4 rounded-[1.5rem] bg-slate-950 p-6 text-white">
                    <EditableText active={interactiveEditing} selected={selectedField === "finalCta.sideText"} label="Texto lateral CTA" value={view.finalCta.sideText} onClick={() => setSelectedField("finalCta.sideText")} onTextChange={(v) => updateDraft((next) => setFieldValue(next, "finalCta.sideText", v))} multiline className="text-sm leading-7 text-slate-300" styleBox={getElementStyle("finalCta.sideText")} minWidth={260} minHeight={120} onResize={(ns) => updateElementStyle("finalCta.sideText", ns)} />
                    {interactiveEditing ? (
                      <EditableText active={interactiveEditing} selected={selectedField === "finalCta.buttonLabel"} label="Botão CTA Final" value={view.finalCta.buttonLabel} onClick={() => setSelectedField("finalCta.buttonLabel")} onTextChange={(v) => updateDraft((next) => setFieldValue(next, "finalCta.buttonLabel", v))} className="inline-flex items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950" styleBox={getElementStyle("finalCta.buttonLabel")} minWidth={180} minHeight={48} onResize={(ns) => updateElementStyle("finalCta.buttonLabel", ns)} />
                    ) : (
                      <button type="button" onClick={() => setSalesModalOpen(true)} className="inline-flex items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100">
                        {view.finalCta.buttonLabel}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </section>

            </>}

            {!interactiveEditing && draft.dynamicSections.length === 0 && (
              <footer className="border-t border-slate-100 bg-slate-950 py-12 px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                  <div className="flex flex-col items-start gap-8 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      {view.branding.headerLogo.src ? (
                        <img src={view.branding.headerLogo.src} alt={view.branding.headerLogo.alt || "VIA CRM"} className="h-8 w-auto brightness-0 invert" />
                      ) : (
                        <span className="text-base font-bold text-white">VIA CRM</span>
                      )}
                      <p className="mt-3 text-sm text-slate-400 max-w-xs">CRM imobiliário para atendimento, operação e gestão.</p>
                    </div>
                    <div className="flex flex-col gap-6 sm:flex-row sm:gap-12">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Produto</div>
                        <ul className="space-y-2 text-sm text-slate-400">
                          <li><a href="#problema" className="hover:text-white transition">O problema</a></li>
                          <li><a href="#solucao" className="hover:text-white transition">A solução</a></li>
                          <li><a href="#planos" className="hover:text-white transition">Planos</a></li>
                        </ul>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Acesso</div>
                        <ul className="space-y-2 text-sm text-slate-400">
                          <li><Link href="/login" className="hover:text-white transition">Entrar</Link></li>
                          <li><Link href="/login" className="hover:text-white transition">Agendar demo</Link></li>
                        </ul>
                      </div>
                    </div>
                  </div>
                  <div className="mt-10 border-t border-slate-800 pt-6 text-xs text-slate-600">
                    &copy; {new Date().getFullYear()} VIA CRM &middot; Todos os direitos reservados
                  </div>
                </div>
              </footer>
            )}

            {editorMode && renderDynamicSections()}
          </main>
        </div>
      </div>

      {/* Editor minimizado */}
      {editorMode && isEditorMinimized && (
        <button type="button" onClick={() => setIsEditorMinimized(false)} className="fixed right-4 top-4 z-40 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-xl">
          Abrir editor
        </button>
      )}

      {/* Logo input hidden */}
      <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />

      {/* Editor sidebar */}
      {showEditorSidebar && (
        <div className="w-[380px] flex-shrink-0">
          <EditorSidebar
            draft={draft}
            selectedField={selectedField}
            status={status}
            isEditing={isEditing}
            isSaveConfirming={isSaveConfirming}
            canUndo={history.length > 0}
            canRedo={future.length > 0}
            previewMode={previewMode}
            onToggleEdit={() => setIsEditing((e) => !e)}
            onSaveDraft={saveDraft}
            onPublish={publishSite}
            onRestore={restoreDraft}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onSetPreview={setPreviewMode}
            onFieldChange={(field, value) => updateDraft((next) => setFieldValue(next, field as SelectedField, value))}
            onUpdateStyle={updateElementStyle}
            onUpdateDraft={updateDraft}
            onLogoUpload={() => logoInputRef.current?.click()}
            onCreateSection={createSection}
            onCreateBlock={createBlock}
            onDeleteBlock={deleteSelectedBlock}
            onDeleteCustomField={deleteSelectedCustomField}
            onMoveSectionUp={moveSectionUp}
            onMoveSectionDown={moveSectionDown}
            onMinimize={() => setIsEditorMinimized(true)}
            newSectionName={newSectionName}
            setNewSectionName={setNewSectionName}
            newSectionKind={newSectionKind}
            setNewSectionKind={setNewSectionKind}
            newBlockSectionId={newBlockSectionId}
            setNewBlockSectionId={setNewBlockSectionId}
            newBlockType={newBlockType}
            setNewBlockType={setNewBlockType}
          />
        </div>
      )}

      <SalesContactModal open={salesModalOpen} onClose={() => setSalesModalOpen(false)} />
    </div>
  );
}
