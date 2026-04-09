"use client";

import { useRef } from "react";
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

const SECTION_KIND_LABELS: Record<SiteSectionKind, string> = {
  content: "Conteúdo",
  hero: "Hero",
  cta: "CTA",
  footer: "Rodapé",
  properties: "Imóveis",
  team: "Equipe",
  contact: "Contato",
};

const PRESET_COLORS = [
  "#ffffff", "#f8fafc", "#f1f5f9", "#e2e8f0", "#0f172a", "#1e293b",
  "#0ea5e9", "#6366f1", "#8b5cf6", "#ec4899", "#10b981", "#f59e0b",
  "#ef4444", "#f97316", "#84cc16", "#06b6d4",
];

function ColorPicker({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
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
    </label>
  );
}

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

  const isLogo = selectedField === "branding.headerLogo" || selectedField === "branding.panelLogo";
  const selectedDynamicBlock = selectedField.startsWith("dynamicBlocks.")
    ? draft.dynamicBlocks.find((b) => b.id === selectedField.split(".")[1]) ?? null
    : null;
  const selectedCustomField = selectedField.startsWith("customFields.")
    ? draft.customFields.find((f) => f.id === selectedField.split(".")[1]) ?? null
    : null;
  const selectedStyle = isLogo ? null : (draft.editorStyles[selectedField] ?? {});
  const fieldLabel = FIELD_LABELS[selectedField]
    ?? (selectedDynamicBlock ? `${BLOCK_TYPE_LABELS[selectedDynamicBlock.type]} (bloco dinâmico)` : null)
    ?? (selectedCustomField ? `Campo extra — ${selectedCustomField.variant}` : null)
    ?? selectedField;

  function getFieldText(): string {
    if (selectedField.startsWith("dynamicBlocks.")) {
      return selectedDynamicBlock?.text ?? "";
    }
    if (selectedField.startsWith("customFields.")) {
      return selectedCustomField?.text ?? "";
    }
    const [section, key] = selectedField.split(".");
    const block = (draft as unknown as Record<string, Record<string, string>>)[section];
    return block?.[key] ?? "";
  }

  const sectionColor = selectedDynamicBlock
    ? (draft.dynamicSections.find((s) => s.id === selectedDynamicBlock.sectionId)?.bgColor ?? "")
    : "";

  return (
    <aside className="border-l border-slate-200 bg-white/95 shadow-2xl backdrop-blur lg:h-screen lg:overflow-y-auto">
      <div className="p-5 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Editor visual</div>
          <button
            type="button"
            onClick={onMinimize}
            className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            Minimizar
          </button>
        </div>

        {/* Status */}
        <div className="text-sm text-slate-600">{status}</div>

        {/* Preview mode */}
        <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
          {(["desktop", "tablet", "mobile"] as PreviewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => onSetPreview(m)}
              className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${previewMode === m ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {m === "desktop" ? "🖥 Desktop" : m === "tablet" ? "📱 Tablet" : "📱 Mobile"}
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onToggleEdit}
            className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
          >
            {isEditing ? "Visualizar" : "Editar"}
          </button>
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="rounded-full border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"
            title="Desfazer (Ctrl+Z)"
          >
            ↩ Desfazer
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="rounded-full border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"
            title="Refazer (Ctrl+Shift+Z)"
          >
            ↪ Refazer
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={onSaveDraft}
            className={`rounded-full border px-4 py-2 text-sm font-semibold ${isSaveConfirming ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-300 text-slate-700"}`}
          >
            {isSaveConfirming ? "Confirmar salvar" : "Salvar rascunho"}
          </button>
          <button
            onClick={onPublish}
            className="rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
          >
            Publicar
          </button>
          <button
            onClick={onRestore}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
          >
            Restaurar
          </button>
        </div>

        {isEditing && (
          <>
            {/* Elemento selecionado */}
            <div className="rounded-2xl border border-slate-200 p-4 space-y-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Elemento selecionado</div>
                <div className="mt-1 text-sm font-medium text-slate-950">{fieldLabel}</div>
              </div>

              {isLogo ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => logoInputRef.current?.click()} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
                      Upload logo
                    </button>
                    <button
                      onClick={() => onUpdateDraft((next) => {
                        if (selectedField === "branding.panelLogo") next.branding.panelLogo.src = null;
                        else next.branding.headerLogo.src = null;
                      })}
                      className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                    >
                      Remover
                    </button>
                  </div>
                  <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { onLogoUpload(); }} />
                  <label className="block">
                    <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                      Altura: {selectedField === "branding.panelLogo" ? draft.branding.panelLogo.height : draft.branding.headerLogo.height}px
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
                  </label>
                </div>
              ) : (
                <div className="space-y-4">
                  <label className="block">
                    <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Conteúdo</div>
                    <textarea
                      key={selectedField}
                      value={getFieldText()}
                      onChange={(e) => onFieldChange(selectedField, e.target.value)}
                      rows={selectedField.includes("description") || selectedField.includes("title") ? 4 : 3}
                      className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-slate-950"
                    />
                  </label>

                  {selectedDynamicBlock?.type === "whatsapp-button" && (
                    <label className="block">
                      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Número WhatsApp</div>
                      <input
                        value={selectedDynamicBlock.phone ?? ""}
                        onChange={(e) => onUpdateDraft((next) => {
                          const b = next.dynamicBlocks.find((x) => x.id === selectedDynamicBlock.id);
                          if (b) b.phone = e.target.value;
                        })}
                        placeholder="(00) 00000-0000"
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
                      />
                    </label>
                  )}

                  {selectedDynamicBlock?.type === "image" || selectedDynamicBlock?.type === "team-card" ? (
                    <div className="text-xs text-slate-500">Clique no bloco no canvas para fazer upload de imagem.</div>
                  ) : null}

                  {selectedDynamicBlock?.type === "video" && (
                    <label className="block">
                      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">URL do vídeo</div>
                      <input
                        value={selectedDynamicBlock.embedUrl ?? ""}
                        onChange={(e) => onUpdateDraft((next) => {
                          const b = next.dynamicBlocks.find((x) => x.id === selectedDynamicBlock.id);
                          if (b) b.embedUrl = e.target.value;
                        })}
                        placeholder="https://www.youtube.com/embed/..."
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
                      />
                    </label>
                  )}

                  <label className="block">
                    <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                      Tamanho da letra: {selectedStyle?.fontSize ?? 16}px
                    </div>
                    <input type="range" min="12" max="96" value={selectedStyle?.fontSize ?? 16}
                      onChange={(e) => onUpdateStyle(selectedField, { fontSize: Number(e.target.value) })}
                      className="w-full" />
                  </label>

                  <label className="block">
                    <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Fonte</div>
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
                  </label>

                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={selectedStyle?.fontWeight === "bold"}
                        onChange={(e) => onUpdateStyle(selectedField, { fontWeight: e.target.checked ? "bold" : "normal" })} />
                      Negrito
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={selectedStyle?.fontStyle === "italic"}
                        onChange={(e) => onUpdateStyle(selectedField, { fontStyle: e.target.checked ? "italic" : "normal" })} />
                      Itálico
                    </label>
                  </div>

                  <ColorPicker
                    label="Cor do texto"
                    value={selectedStyle?.color}
                    onChange={(v) => onUpdateStyle(selectedField, { color: v })}
                  />

                  <ColorPicker
                    label="Cor de fundo (elemento)"
                    value={selectedStyle?.bgColor}
                    onChange={(v) => onUpdateStyle(selectedField, { bgColor: v })}
                  />

                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-sm">
                    <input type="checkbox" checked={Boolean(selectedStyle?.clickable)}
                      onChange={(e) => onUpdateStyle(selectedField, { clickable: e.target.checked })} />
                    Elemento clicável
                  </label>

                  {selectedStyle?.clickable && (
                    <label className="block">
                      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Link de destino</div>
                      <input
                        value={selectedStyle?.href ?? ""}
                        onChange={(e) => onUpdateStyle(selectedField, { href: e.target.value })}
                        placeholder="/login, #secao, https://..."
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
                      />
                    </label>
                  )}

                  {selectedDynamicBlock && (
                    <>
                      <label className="block">
                        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Mover para faixa</div>
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
                      </label>
                      <button type="button" onClick={onDeleteBlock}
                        className="rounded-full border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700">
                        Excluir bloco
                      </button>
                    </>
                  )}

                  {selectedCustomField && (
                    <button type="button" onClick={onDeleteCustomField}
                      className="rounded-full border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700">
                      Excluir campo
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Cor de fundo da seção do bloco selecionado */}
            {selectedDynamicBlock && (
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 mb-3">Cor de fundo da faixa</div>
                <ColorPicker
                  label=""
                  value={sectionColor || undefined}
                  onChange={(v) => onUpdateDraft((next) => {
                    const sec = next.dynamicSections.find((s) => s.id === selectedDynamicBlock.sectionId);
                    if (sec) sec.bgColor = v;
                  })}
                />
              </div>
            )}

            {/* Nova faixa */}
            <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Nova faixa</div>
              <label className="block">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Nome</div>
                <input value={newSectionName} onChange={(e) => setNewSectionName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950" />
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Tipo</div>
                <select value={newSectionKind} onChange={(e) => setNewSectionKind(e.target.value as SiteSectionKind)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950">
                  {(Object.entries(SECTION_KIND_LABELS) as [SiteSectionKind, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>
              <button onClick={onCreateSection}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
                Adicionar faixa
              </button>
            </div>

            {/* Reordenar faixas */}
            {draft.dynamicSections.length > 0 && (
              <div className="rounded-2xl border border-slate-200 p-4 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Ordem das faixas</div>
                {draft.dynamicSections.map((sec, idx) => (
                  <div key={sec.id} className="flex items-center gap-2">
                    <div className="flex-1 text-sm text-slate-700 truncate">{sec.name}</div>
                    <button onClick={() => onMoveSectionUp(sec.id)} disabled={idx === 0}
                      className="rounded border border-slate-200 px-2 py-1 text-xs disabled:opacity-30">↑</button>
                    <button onClick={() => onMoveSectionDown(sec.id)} disabled={idx === draft.dynamicSections.length - 1}
                      className="rounded border border-slate-200 px-2 py-1 text-xs disabled:opacity-30">↓</button>
                  </div>
                ))}
              </div>
            )}

            {/* Novo bloco */}
            <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Novo bloco</div>
              <label className="block">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Faixa</div>
                <select value={newBlockSectionId} onChange={(e) => setNewBlockSectionId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950">
                  {draft.dynamicSections.length ? (
                    draft.dynamicSections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)
                  ) : (
                    <option value="">Crie uma faixa primeiro</option>
                  )}
                </select>
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Tipo</div>
                <select value={newBlockType} onChange={(e) => setNewBlockType(e.target.value as SiteBlockType)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950">
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
              </label>
              <button onClick={onCreateBlock}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
                Adicionar bloco
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
