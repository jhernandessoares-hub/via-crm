"use client";

import { useEffect, useRef, useState } from "react";
import {
  EditorElementStyle,
  SiteBlock,
  SiteBlockType,
  SiteContent,
  SiteCustomField,
  SiteSectionKind,
} from "@/lib/site-content";

export type PreviewMode = "desktop" | "tablet" | "mobile";

export const FIELD_LABELS: Record<string, string> = {
  "header.loginLabel": "Botão Entrar (header)",
  "header.ctaLabel": "Botão CTA (header)",
  "nav.problem": "Menu — Problema",
  "nav.solution": "Menu — Solução",
  "nav.plans": "Menu — Planos",
  "hero.badge": "Badge do Hero",
  "hero.titleLine1": "Título hero — linha 1",
  "hero.titleLine2": "Título hero — linha 2",
  "hero.description": "Descrição do Hero",
  "hero.primaryCta": "Botão principal do Hero",
  "hero.secondaryCta": "Botão secundário do Hero",
  "hero.panelEyebrow": "Eyebrow do painel",
  "hero.panelTitle": "Título do painel",
  "hero.panelStatus": "Status do painel",
  "problem.title": "Título — Seção Problema",
  "solution.title": "Título — Seção Solução",
  "solution.description": "Descrição — Seção Solução",
  "plansSection.title": "Título — Seção Planos",
  "plansSection.description": "Descrição — Seção Planos",
  "finalCta.title": "Título — CTA Final",
  "finalCta.description": "Descrição — CTA Final",
  "finalCta.sideText": "Texto lateral — CTA Final",
  "finalCta.buttonLabel": "Botão — CTA Final",
  "branding.headerLogo": "Logo do cabeçalho",
  "branding.panelLogo": "Logo do painel",
};

const BLOCK_TYPE_LABELS: Record<SiteBlockType, string> = {
  text: "Texto",
  title: "Título",
  button: "Botão",
  image: "Imagem",
  card: "Card",
  list: "Lista",
  icon: "Ícone",
  video: "Vídeo",
  form: "Formulário",
  divider: "Divisor",
  "property-search": "Busca de Imóveis",
  "property-grid": "Grid de Imóveis",
  "property-card": "Card de Imóvel",
  "property-map": "Mapa de Imóveis",
  "broker-grid": "Grid de Corretores",
  "whatsapp-button": "Botão WhatsApp",
  "team-card": "Cartão de Corretor",
  "contact-form": "Formulário de Contato",
};

const SECTION_KIND_LABELS: [SiteSectionKind, string, string][] = [
  ["header",     "Cabeçalho", "Barra de navegação no topo da página. Contém logotipo, menu e botão de CTA."],
  ["hero",       "Hero",      "Primeira seção do site. Título grande, descrição e botão principal. Objetivo: prender atenção assim que a página abre."],
  ["cta",        "CTA",       "Chamada para Ação. Convida o visitante a fazer algo: agendar visita, falar no WhatsApp, ver planos. Geralmente no fim da página."],
  ["properties", "Imóveis",   "Seção para exibir grid de imóveis, busca ou mapa integrado ao CRM."],
  ["content",    "Conteúdo",  "Seção genérica para qualquer conteúdo: benefícios, sobre a empresa, depoimentos, planos, etc."],
  ["team",       "Equipe",    "Exibe corretores e parceiros com foto, nome e contato."],
  ["contact",    "Contato",   "Seção com formulário de contato que cria leads automaticamente no CRM."],
  ["footer",     "Rodapé",    "Última seção. Copyright, links institucionais e redes sociais."],
  ["other",      "Outro",     "Seção em branco, sem estilo pré-definido. Use quando nenhum tipo acima se encaixa."],
];

const PRESET_COLORS = [
  "#ffffff", "#f8fafc", "#f1f5f9", "#e2e8f0", "#0f172a", "#1e293b",
  "#0ea5e9", "#6366f1", "#8b5cf6", "#ec4899", "#10b981", "#f59e0b",
  "#ef4444", "#f97316", "#84cc16", "#06b6d4",
];

function ColorPicker({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
  return (
    <div>
      {label && <div className="mb-2 text-xs font-medium text-slate-500">{label}</div>}
      <div className="flex flex-wrap gap-1.5">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={`h-6 w-6 rounded-full border-2 transition ${value === c ? "border-sky-500 scale-110" : "border-transparent hover:border-slate-400"}`}
            style={{ background: c }}
            title={c}
          />
        ))}
        <input
          type="color"
          value={value ?? "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-6 w-6 cursor-pointer rounded-full border border-slate-300 p-0"
          title="Cor personalizada"
        />
      </div>
    </div>
  );
}

type SidebarTab = "structure" | "element";

export default function EditorSidebar({
  draft,
  selectedField,
  status,
  isEditing,
  isSaveConfirming,
  canUndo,
  canRedo,
  previewMode,
  onToggleEdit,
  onSaveDraft,
  onPublish,
  onRestore,
  onUndo,
  onRedo,
  onSetPreview,
  onFieldChange,
  onUpdateStyle,
  onUpdateDraft,
  onLogoUpload,
  onCreateSection,
  onCreateBlock,
  onDeleteBlock,
  onDeleteCustomField,
  onMoveSectionUp,
  onMoveSectionDown,
  onMinimize,
  newSectionName,
  setNewSectionName,
  newSectionKind,
  setNewSectionKind,
  newBlockSectionId,
  setNewBlockSectionId,
  newBlockType,
  setNewBlockType,
}: {
  draft: SiteContent;
  selectedField: string;
  status: string;
  isEditing: boolean;
  isSaveConfirming: boolean;
  canUndo: boolean;
  canRedo: boolean;
  previewMode: PreviewMode;
  onToggleEdit: () => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  onRestore: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSetPreview: (m: PreviewMode) => void;
  onFieldChange: (field: string, value: string) => void;
  onUpdateStyle: (key: string, style: EditorElementStyle) => void;
  onUpdateDraft: (mutator: (next: SiteContent) => void) => void;
  onLogoUpload: () => void;
  onCreateSection: () => void;
  onCreateBlock: () => void;
  onDeleteBlock: () => void;
  onDeleteCustomField: () => void;
  onMoveSectionUp: (id: string) => void;
  onMoveSectionDown: (id: string) => void;
  onMinimize: () => void;
  newSectionName: string;
  setNewSectionName: (v: string) => void;
  newSectionKind: SiteSectionKind;
  setNewSectionKind: (v: SiteSectionKind) => void;
  newBlockSectionId: string;
  setNewBlockSectionId: (v: string) => void;
  newBlockType: SiteBlockType;
  setNewBlockType: (v: SiteBlockType) => void;
}) {
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [activeTab, setActiveTab] = useState<SidebarTab>("structure");
  const [isPublishConfirming, setIsPublishConfirming] = useState(false);
  const [newSectionOpen, setNewSectionOpen] = useState(false);
  const [newElementOpen, setNewElementOpen] = useState(false);

  // Reset publish confirmation after 5s of inactivity
  useEffect(() => {
    if (!isPublishConfirming) return;
    const t = setTimeout(() => setIsPublishConfirming(false), 5000);
    return () => clearTimeout(t);
  }, [isPublishConfirming]);

  function handlePublishClick() {
    if (!isPublishConfirming) { setIsPublishConfirming(true); return; }
    setIsPublishConfirming(false);
    onPublish();
  }

  const isLogo = selectedField === "branding.headerLogo" || selectedField === "branding.panelLogo";
  const selectedDynamicBlock = selectedField.startsWith("dynamicBlocks.")
    ? draft.dynamicBlocks.find((b) => b.id === selectedField.split(".")[1]) ?? null
    : null;
  const selectedCustomField = selectedField.startsWith("customFields.")
    ? draft.customFields.find((f) => f.id === selectedField.split(".")[1]) ?? null
    : null;
  const selectedStyle = isLogo ? null : (draft.editorStyles[selectedField] ?? {});
  const fieldLabel =
    FIELD_LABELS[selectedField] ??
    (selectedDynamicBlock ? `${BLOCK_TYPE_LABELS[selectedDynamicBlock.type]} (bloco)` : null) ??
    (selectedCustomField ? `Campo extra — ${selectedCustomField.variant}` : null) ??
    selectedField;

  const sectionColor = selectedDynamicBlock
    ? (draft.dynamicSections.find((s) => s.id === selectedDynamicBlock.sectionId)?.bgColor ?? "")
    : "";

  // Auto-switch to element tab when user clicks something on the canvas
  useEffect(() => {
    if (selectedField && isEditing) {
      setActiveTab("element");
    }
  }, [selectedField, isEditing]);

  function getFieldText(): string {
    if (selectedField.startsWith("dynamicBlocks.")) return selectedDynamicBlock?.text ?? "";
    if (selectedField.startsWith("customFields.")) return selectedCustomField?.text ?? "";
    const [section, key] = selectedField.split(".");
    const block = (draft as unknown as Record<string, Record<string, string>>)[section];
    return block?.[key] ?? "";
  }

  const PREVIEW_LABELS: Record<PreviewMode, { icon: string; label: string }> = {
    desktop: { icon: "🖥", label: "Desktop" },
    tablet: { icon: "⬜", label: "Tablet" },
    mobile: { icon: "📱", label: "Mobile" },
  };

  return (
    <aside className="flex flex-col border-l border-slate-200 bg-white shadow-2xl lg:h-screen">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
          <span className="text-sm font-bold tracking-tight text-slate-800">Editor Visual</span>
        </div>
        <button
          type="button"
          onClick={onMinimize}
          title="Minimizar"
          className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition text-base"
        >
          ←
        </button>
      </div>

      {/* ── Preview mode ── */}
      <div className="px-3 py-2 border-b border-slate-100">
        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          {(["desktop", "tablet", "mobile"] as PreviewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => onSetPreview(m)}
              className={`flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium transition ${
                previewMode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <span>{PREVIEW_LABELS[m].icon}</span>
              <span>{PREVIEW_LABELS[m].label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Status ── */}
      <div className="px-4 py-1.5 border-b border-slate-100">
        <p className="text-xs text-slate-500 truncate">{status}</p>
      </div>

      {/* ── Tabs (edit mode only) ── */}
      {isEditing && (
        <div className="flex border-b border-slate-200">
          {([["structure", "Estrutura"], ["element", "Elemento"]] as [SidebarTab, string][]).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-xs font-semibold transition ${
                activeTab === tab
                  ? "border-b-2 border-slate-900 text-slate-900"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── Dica de tipos de seção (abaixo das tabs, só na aba Estrutura) ── */}
      {isEditing && activeTab === "structure" && (
        <div className="flex justify-end px-3 pt-2">
          <div className="group relative">
            <button
              type="button"
              className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-[10px] font-bold text-slate-400 hover:border-sky-400 hover:text-sky-500 transition"
            >
              ?
            </button>
            <div className="pointer-events-none absolute right-0 top-8 z-50 w-64 rounded-2xl border border-slate-200 bg-white shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-150 overflow-hidden">
              {SECTION_KIND_LABELS.map(([, label, desc]) => (
                <div key={label} className="border-b border-slate-100 px-4 py-2.5 last:border-0">
                  <p className="text-xs font-semibold text-slate-800">{label}</p>
                  <p className="text-[11px] leading-4 text-slate-500 mt-0.5">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto">

        {/* VIEW MODE — no editing */}
        {!isEditing && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
            <div className="text-3xl">✏️</div>
            <p className="text-sm text-slate-500">
              Clique em <strong>Editar</strong> para começar a personalizar o site.
            </p>
          </div>
        )}

        {/* EDIT MODE — tab: Estrutura */}
        {isEditing && activeTab === "structure" && (
          <div className="p-4 space-y-4">

            {/* Nova seção */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden">
              <button
                type="button"
                onClick={() => setNewSectionOpen((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-100 transition"
              >
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Nova Seção</p>
                <span className={`text-slate-400 text-base font-light transition-transform duration-200 ${newSectionOpen ? "rotate-45" : ""}`}>+</span>
              </button>
              {newSectionOpen && (
                <div className="px-4 pb-4 space-y-3">
                  <input
                    value={newSectionName}
                    onChange={(e) => setNewSectionName(e.target.value)}
                    placeholder="Nome da seção..."
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-950"
                  />
                  <select
                    value={newSectionKind}
                    onChange={(e) => setNewSectionKind(e.target.value as SiteSectionKind)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-950"
                  >
                    {SECTION_KIND_LABELS.map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => { onCreateSection(); setNewSectionOpen(false); setNewSectionName(""); }}
                    className="w-full rounded-xl bg-slate-900 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition"
                  >
                    Criar seção
                  </button>
                </div>
              )}
            </div>

            {/* Suas seções */}
            <div className="rounded-2xl border border-slate-200 p-4 space-y-1.5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Suas seções</p>
              {draft.dynamicSections.length === 0 ? (
                <p className="text-xs text-slate-400">Nenhuma seção criada ainda.</p>
              ) : (
                draft.dynamicSections.map((sec, idx) => (
                  <div key={sec.id} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                    <div className="h-2 w-2 rounded-full bg-sky-400 shrink-0" />
                    <div className="flex-1 text-sm font-medium text-slate-700 truncate">{sec.name}</div>
                    <button
                      onClick={() => onMoveSectionUp(sec.id)}
                      disabled={idx === 0}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 disabled:opacity-30 hover:bg-slate-100 transition"
                    >↑</button>
                    <button
                      onClick={() => onMoveSectionDown(sec.id)}
                      disabled={idx === draft.dynamicSections.length - 1}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 disabled:opacity-30 hover:bg-slate-100 transition"
                    >↓</button>
                  </div>
                ))
              )}
            </div>

          </div>
        )}

        {/* EDIT MODE — tab: Elemento */}
        {isEditing && activeTab === "element" && (
          <div className="p-4 space-y-4">

            {!selectedField ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12 px-4 text-center">
                <div className="text-3xl">👆</div>
                <p className="text-sm text-slate-500">Clique em qualquer texto ou elemento no canvas para editá-lo.</p>
              </div>
            ) : (
              <>
                {/* Elemento selecionado — badge */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs text-slate-400 uppercase tracking-wider">Editando</div>
                  <div className="mt-0.5 text-sm font-semibold text-slate-900 truncate">{fieldLabel}</div>
                </div>

                {isLogo ? (
                  /* ── Logo editor ── */
                  <div className="rounded-2xl border border-slate-200 p-4 space-y-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Logo</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => logoInputRef.current?.click()}
                        className="flex-1 rounded-xl bg-slate-900 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition"
                      >
                        Upload
                      </button>
                      <button
                        onClick={() => onUpdateDraft((next) => {
                          if (selectedField === "branding.panelLogo") next.branding.panelLogo.src = null;
                          else next.branding.headerLogo.src = null;
                        })}
                        className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                      >
                        Remover
                      </button>
                    </div>
                    <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={() => onLogoUpload()} />
                    <div>
                      <div className="mb-1 flex justify-between text-xs text-slate-500">
                        <span>Altura</span>
                        <span className="font-medium text-slate-700">
                          {selectedField === "branding.panelLogo" ? draft.branding.panelLogo.height : draft.branding.headerLogo.height}px
                        </span>
                      </div>
                      <input
                        type="range" min="24" max="96"
                        value={selectedField === "branding.panelLogo" ? draft.branding.panelLogo.height : draft.branding.headerLogo.height}
                        onChange={(e) => onUpdateDraft((next) => {
                          if (selectedField === "branding.panelLogo") next.branding.panelLogo.height = Number(e.target.value);
                          else next.branding.headerLogo.height = Number(e.target.value);
                        })}
                        className="w-full"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    {/* ── Conteúdo ── */}
                    <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Conteúdo</p>
                      <textarea
                        key={selectedField}
                        value={getFieldText()}
                        onChange={(e) => onFieldChange(selectedField, e.target.value)}
                        rows={selectedField.includes("description") || selectedField.includes("title") ? 4 : 3}
                        className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
                      />

                      {selectedDynamicBlock?.type === "whatsapp-button" && (
                        <div>
                          <div className="mb-1 text-xs text-slate-500">Número WhatsApp</div>
                          <input
                            value={selectedDynamicBlock.phone ?? ""}
                            onChange={(e) => onUpdateDraft((next) => {
                              const b = next.dynamicBlocks.find((x) => x.id === selectedDynamicBlock.id);
                              if (b) b.phone = e.target.value;
                            })}
                            placeholder="(00) 00000-0000"
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
                          />
                        </div>
                      )}

                      {(selectedDynamicBlock?.type === "image" || selectedDynamicBlock?.type === "team-card") && (
                        <p className="text-xs text-slate-400">Clique no bloco no canvas para fazer upload de imagem.</p>
                      )}

                      {selectedDynamicBlock?.type === "video" && (
                        <div>
                          <div className="mb-1 text-xs text-slate-500">URL do vídeo</div>
                          <input
                            value={selectedDynamicBlock.embedUrl ?? ""}
                            onChange={(e) => onUpdateDraft((next) => {
                              const b = next.dynamicBlocks.find((x) => x.id === selectedDynamicBlock.id);
                              if (b) b.embedUrl = e.target.value;
                            })}
                            placeholder="https://www.youtube.com/embed/..."
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
                          />
                        </div>
                      )}
                    </div>

                    {/* ── Tipografia ── */}
                    <div className="rounded-2xl border border-slate-200 p-4 space-y-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Tipografia</p>

                      <div>
                        <div className="mb-1 flex justify-between text-xs text-slate-500">
                          <span>Tamanho</span>
                          <span className="font-medium text-slate-700">{selectedStyle?.fontSize ?? 16}px</span>
                        </div>
                        <input
                          type="range" min="12" max="96"
                          value={selectedStyle?.fontSize ?? 16}
                          onChange={(e) => onUpdateStyle(selectedField, { fontSize: Number(e.target.value) })}
                          className="w-full"
                        />
                      </div>

                      <div>
                        <div className="mb-1 text-xs text-slate-500">Fonte</div>
                        <select
                          value={selectedStyle?.fontFamily ?? "sans"}
                          onChange={(e) => onUpdateStyle(selectedField, { fontFamily: e.target.value as EditorElementStyle["fontFamily"] })}
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
                        >
                          <option value="sans">Sans-serif</option>
                          <option value="serif">Serif</option>
                          <option value="mono">Mono</option>
                          <option value="display">Display</option>
                        </select>
                      </div>

                      <div className="flex gap-4">
                        <label className="flex cursor-pointer select-none items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={selectedStyle?.fontWeight === "bold"}
                            onChange={(e) => onUpdateStyle(selectedField, { fontWeight: e.target.checked ? "bold" : "normal" })}
                            className="rounded"
                          />
                          <span className="font-bold text-slate-700">N</span>
                          <span className="text-slate-600">Negrito</span>
                        </label>
                        <label className="flex cursor-pointer select-none items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={selectedStyle?.fontStyle === "italic"}
                            onChange={(e) => onUpdateStyle(selectedField, { fontStyle: e.target.checked ? "italic" : "normal" })}
                            className="rounded"
                          />
                          <span className="italic text-slate-700">I</span>
                          <span className="text-slate-600">Itálico</span>
                        </label>
                      </div>
                    </div>

                    {/* ── Cores ── */}
                    <div className="rounded-2xl border border-slate-200 p-4 space-y-5">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Cores</p>
                      <ColorPicker
                        label="Cor do texto"
                        value={selectedStyle?.color}
                        onChange={(v) => onUpdateStyle(selectedField, { color: v })}
                      />
                      <ColorPicker
                        label="Fundo do elemento"
                        value={selectedStyle?.bgColor}
                        onChange={(v) => onUpdateStyle(selectedField, { bgColor: v })}
                      />
                      {selectedDynamicBlock && (
                        <ColorPicker
                          label="Fundo da seção"
                          value={sectionColor || undefined}
                          onChange={(v) => onUpdateDraft((next) => {
                            const sec = next.dynamicSections.find((s) => s.id === selectedDynamicBlock.sectionId);
                            if (sec) sec.bgColor = v;
                          })}
                        />
                      )}
                    </div>

                    {/* ── Link ── */}
                    <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
                      <label className="flex cursor-pointer select-none items-center gap-2">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedStyle?.clickable)}
                          onChange={(e) => onUpdateStyle(selectedField, { clickable: e.target.checked })}
                          className="rounded"
                        />
                        <span className="text-sm font-medium text-slate-700">Elemento clicável</span>
                      </label>
                      {selectedStyle?.clickable && (
                        <div>
                          <div className="mb-1 text-xs text-slate-500">Link de destino</div>
                          <input
                            value={selectedStyle?.href ?? ""}
                            onChange={(e) => onUpdateStyle(selectedField, { href: e.target.value })}
                            placeholder="/login, #secao, https://..."
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
                          />
                        </div>
                      )}
                    </div>

                    {/* ── Mover bloco de seção ── */}
                    {selectedDynamicBlock && (
                      <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Mover bloco para seção</p>
                        <select
                          value={selectedDynamicBlock.sectionId}
                          onChange={(e) => onUpdateDraft((next) => {
                            const b = next.dynamicBlocks.find((x) => x.id === selectedDynamicBlock.id);
                            if (b) b.sectionId = e.target.value;
                          })}
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
                        >
                          {draft.dynamicSections.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* ── Excluir ── */}
                    {(selectedDynamicBlock || selectedCustomField) && (
                      <button
                        type="button"
                        onClick={selectedDynamicBlock ? onDeleteBlock : onDeleteCustomField}
                        className="w-full rounded-xl border border-rose-200 bg-rose-50 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 transition"
                      >
                        {selectedDynamicBlock ? "Excluir bloco" : "Excluir campo"}
                      </button>
                    )}
                  </>
                )}
              </>
            )}

            {/* ── Adicionar novo elemento ── */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden">
              <button
                type="button"
                onClick={() => setNewElementOpen((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-100 transition"
              >
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Novo Elemento</p>
                <span className={`text-slate-400 text-base font-light transition-transform duration-200 ${newElementOpen ? "rotate-45" : ""}`}>+</span>
              </button>
              {newElementOpen && (
                <div className="px-4 pb-4 space-y-3">
                  {draft.dynamicSections.length === 0 ? (
                    <p className="text-xs text-slate-400">Crie uma seção em <strong>Estrutura</strong> antes de adicionar elementos.</p>
                  ) : (
                    <>
                      <div>
                        <div className="mb-1 text-xs text-slate-500">Seção de destino</div>
                        <select
                          value={newBlockSectionId}
                          onChange={(e) => setNewBlockSectionId(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-950"
                        >
                          {draft.dynamicSections.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <div className="mb-1 text-xs text-slate-500">Tipo</div>
                        <select
                          value={newBlockType}
                          onChange={(e) => setNewBlockType(e.target.value as SiteBlockType)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-950"
                        >
                          <optgroup label="Conteúdo">
                            {(["title","text","button","image","card","list","icon","video","divider","form","contact-form"] as SiteBlockType[]).map((t) => (
                              <option key={t} value={t}>{BLOCK_TYPE_LABELS[t]}</option>
                            ))}
                          </optgroup>
                          <optgroup label="Imobiliário">
                            {(["property-search","property-grid","property-card","property-map","whatsapp-button","team-card","broker-grid"] as SiteBlockType[]).map((t) => (
                              <option key={t} value={t}>{BLOCK_TYPE_LABELS[t]}</option>
                            ))}
                          </optgroup>
                        </select>
                      </div>
                      <button
                        onClick={() => { onCreateBlock(); setNewElementOpen(false); }}
                        className="w-full rounded-xl bg-slate-900 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition"
                      >
                        Adicionar elemento
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

          </div>
        )}

      </div>

      {/* ── Bottom action bar (sticky) ── */}
      <div className="shrink-0 border-t border-slate-200 bg-white px-4 pt-3 pb-4 space-y-2">

        {/* Undo / Redo + mode toggle */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="Desfazer (Ctrl+Z)"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:opacity-30"
          >
            ↩
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="Refazer (Ctrl+Shift+Z)"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:opacity-30"
          >
            ↪
          </button>
          <div className="flex-1" />
          <button
            onClick={onToggleEdit}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              isEditing
                ? "border border-slate-200 text-slate-700 hover:bg-slate-50"
                : "bg-slate-900 text-white hover:bg-slate-700"
            }`}
          >
            {isEditing ? "Visualizar" : "Editar"}
          </button>
        </div>

        {/* Save + Publish */}
        <div className="flex gap-2">
          <button
            onClick={onSaveDraft}
            className={`flex-1 rounded-xl border py-2 text-sm font-semibold transition ${
              isSaveConfirming
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : "border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            {isSaveConfirming ? "Confirmar" : "Salvar"}
          </button>
          <button
            onClick={handlePublishClick}
            className={`flex-1 rounded-xl py-2 text-sm font-bold text-white transition ${
              isPublishConfirming
                ? "bg-amber-500 hover:bg-amber-600"
                : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {isPublishConfirming ? "⚠ Confirmar?" : "Publicar"}
          </button>
        </div>

        {/* Restore */}
        <button
          onClick={onRestore}
          className="w-full rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
        >
          Restaurar versão publicada
        </button>

      </div>
    </aside>
  );
}
