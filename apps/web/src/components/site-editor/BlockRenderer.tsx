"use client";

import { ChangeEvent, useRef } from "react";
import Image from "next/image";
import { SiteBlock, EditorElementStyle } from "@/lib/site-content";
import EditableText from "./EditableText";
import EditableLogo from "./EditableLogo";

function PlaceholderBlock({
  icon,
  label,
  description,
  active,
  selected,
  styleBox,
  onResize,
  onClick,
  color = "slate",
}: {
  icon: string;
  label: string;
  description: string;
  active: boolean;
  selected: boolean;
  styleBox?: EditorElementStyle;
  onResize: (next: EditorElementStyle) => void;
  onClick: () => void;
  color?: string;
}) {
  const colorMap: Record<string, string> = {
    slate: "border-slate-200 bg-slate-50 text-slate-500",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    sky: "border-sky-200 bg-sky-50 text-sky-700",
    violet: "border-violet-200 bg-violet-50 text-violet-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    green: "border-green-200 bg-green-50 text-green-700",
  };
  const cls = colorMap[color] ?? colorMap.slate;

  return (
    <EditableText
      active={active}
      selected={selected}
      label={label}
      value={`${icon}  ${label}\n${description}`}
      className={`rounded-2xl border-2 border-dashed p-5 text-sm font-medium leading-7 ${cls}`}
      multiline
      styleBox={styleBox}
      minWidth={280}
      minHeight={120}
      onResize={onResize}
      onClick={onClick}
    />
  );
}

export default function BlockRenderer({
  block,
  active,
  selected,
  styleBox,
  onMove,
  onResize,
  onClick,
  onImageUpload,
}: {
  block: SiteBlock;
  active: boolean;
  selected: boolean;
  styleBox?: EditorElementStyle;
  onMove: (next: EditorElementStyle) => void;
  onResize: (next: EditorElementStyle) => void;
  onClick: () => void;
  onImageUpload?: (src: string) => void;
}) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const commonProps = { active, selected, styleBox, onMove, onResize, onClick };

  async function handleImageFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !onImageUpload) return;
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
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        onImageUpload(canvas.toDataURL("image/jpeg", 0.9));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  // ── Tipos base ──────────────────────────────────────────────────────────────

  if (block.type === "title") {
    return <EditableText {...commonProps} value={block.text ?? ""} label="Título" className="text-4xl font-semibold tracking-tight text-slate-950" minWidth={280} minHeight={80} />;
  }

  if (block.type === "button") {
    return <EditableText {...commonProps} value={block.text ?? ""} label="Botão" className="inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white" minWidth={180} minHeight={52} />;
  }

  if (block.type === "text") {
    return <EditableText {...commonProps} value={block.text ?? ""} label="Texto" multiline className="text-base leading-7 text-slate-700" minWidth={240} minHeight={60} />;
  }

  if (block.type === "card") {
    return <EditableText {...commonProps} value={block.text ?? ""} label="Card" className="rounded-[1.5rem] border border-slate-200 bg-white p-6 text-lg font-semibold text-slate-950 shadow-sm" minWidth={220} minHeight={160} />;
  }

  if (block.type === "list") {
    return (
      <EditableText
        {...commonProps}
        value={block.items?.join("\n") || block.text || ""}
        label="Lista"
        multiline
        className="rounded-2xl border border-slate-200 bg-white p-5 text-base leading-7 text-slate-700"
        minWidth={240}
        minHeight={120}
      />
    );
  }

  if (block.type === "icon") {
    return <EditableText {...commonProps} value={block.text ?? "★"} label="Ícone" className="text-5xl leading-none text-slate-950" minWidth={72} minHeight={72} />;
  }

  if (block.type === "video") {
    if (!active && block.embedUrl) {
      return (
        <div className="overflow-hidden rounded-[1.5rem] border border-slate-200" style={{ width: styleBox?.width ? `${styleBox.width}px` : undefined, height: styleBox?.height ? `${styleBox.height}px` : "220px" }}>
          <iframe src={block.embedUrl} className="h-full w-full" allowFullScreen title="Video" />
        </div>
      );
    }
    return (
      <EditableText
        {...commonProps}
        value={block.embedUrl ? `Vídeo: ${block.embedUrl}` : "Cole a URL do vídeo no editor →"}
        label="Vídeo"
        multiline
        className="rounded-[1.5rem] border border-slate-200 bg-slate-950 p-6 text-base leading-7 text-white"
        minWidth={280}
        minHeight={180}
      />
    );
  }

  if (block.type === "divider") {
    return <EditableText {...commonProps} value="" label="Divisor" className="block h-px w-full bg-slate-300" minWidth={220} minHeight={24} />;
  }

  if (block.type === "form") {
    return (
      <EditableText
        {...commonProps}
        value={block.text ?? "Formulário"}
        label="Formulário"
        className="rounded-[1.5rem] border border-slate-200 bg-white p-6 text-base leading-7 text-slate-700 shadow-sm"
        minWidth={280}
        minHeight={220}
        multiline
      />
    );
  }

  if (block.type === "image") {
    if (!active && block.src) {
      return (
        <div className="overflow-hidden rounded-2xl" style={{ width: styleBox?.width ? `${styleBox.width}px` : undefined, height: styleBox?.height ? `${styleBox.height}px` : "200px" }}>
          <Image src={block.src} alt={block.alt ?? ""} fill unoptimized className="object-cover" />
        </div>
      );
    }
    return (
      <>
        <EditableLogo
          active={active}
          selected={selected}
          label="Imagem"
          src={block.src ?? null}
          alt={block.alt ?? "Imagem"}
          height={styleBox?.height ?? 200}
          styleBox={styleBox}
          minWidth={200}
          minHeight={120}
          onMove={onMove}
          onResize={onResize}
          onClick={() => { onClick(); if (active) imageInputRef.current?.click(); }}
        />
        <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageFile} />
      </>
    );
  }

  // ── Tipos imobiliários ──────────────────────────────────────────────────────

  if (block.type === "property-search") {
    return (
      <PlaceholderBlock
        {...commonProps}
        icon="🔍"
        label="Busca de Imóveis"
        description="Integrado ao catálogo do CRM — filtros por tipo, cidade, preço e quartos."
        color="sky"
        styleBox={{ ...styleBox, width: styleBox?.width ?? 560, height: styleBox?.height ?? 80 }}
      />
    );
  }

  if (block.type === "property-grid") {
    return (
      <PlaceholderBlock
        {...commonProps}
        icon="🏠"
        label="Grid de Imóveis"
        description="Exibe os imóveis cadastrados no CRM com foto, tipo, preço e botão de contato."
        color="emerald"
        styleBox={{ ...styleBox, width: styleBox?.width ?? 600, height: styleBox?.height ?? 240 }}
      />
    );
  }

  if (block.type === "property-card") {
    return (
      <PlaceholderBlock
        {...commonProps}
        icon="🏡"
        label="Card de Imóvel"
        description="Card individual de imóvel com foto, preço e descrição."
        color="emerald"
        styleBox={{ ...styleBox, width: styleBox?.width ?? 280, height: styleBox?.height ?? 200 }}
      />
    );
  }

  if (block.type === "property-map") {
    return (
      <PlaceholderBlock
        {...commonProps}
        icon="📍"
        label="Mapa de Imóveis"
        description="Mapa interativo com pins dos imóveis por localização."
        color="violet"
        styleBox={{ ...styleBox, width: styleBox?.width ?? 600, height: styleBox?.height ?? 360 }}
      />
    );
  }

  if (block.type === "broker-grid") {
    return (
      <PlaceholderBlock
        {...commonProps}
        icon="👥"
        label="Grid de Corretores"
        description="Exibe corretores e imobiliárias parceiras com foto, nome e contato."
        color="amber"
        styleBox={{ ...styleBox, width: styleBox?.width ?? 560, height: styleBox?.height ?? 200 }}
      />
    );
  }

  if (block.type === "whatsapp-button") {
    if (!active && block.phone) {
      return (
        <a
          href={`https://wa.me/55${block.phone.replace(/\D/g, "")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-white shadow hover:bg-emerald-600"
          style={{ width: styleBox?.width ? `${styleBox.width}px` : undefined }}
        >
          <span>💬</span>
          {block.text || "Falar no WhatsApp"}
        </a>
      );
    }
    return (
      <PlaceholderBlock
        {...commonProps}
        icon="💬"
        label={block.text || "Botão WhatsApp"}
        description={block.phone ? `Número: ${block.phone}` : "Configure o número no painel lateral."}
        color="green"
        styleBox={{ ...styleBox, width: styleBox?.width ?? 260, height: styleBox?.height ?? 60 }}
      />
    );
  }

  if (block.type === "team-card") {
    return (
      <div
        className={`flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm ${active ? "cursor-pointer hover:ring-2 hover:ring-sky-300/70" : ""} ${selected ? "ring-2 ring-sky-500" : ""}`}
        style={{ width: styleBox?.width ? `${styleBox.width}px` : "200px" }}
        onClick={onClick}
      >
        {block.src ? (
          <Image src={block.src} alt={block.alt ?? "Corretor"} width={80} height={80} unoptimized className="h-20 w-20 rounded-full object-cover" />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-slate-300 bg-slate-100 text-2xl text-slate-400">
            👤
          </div>
        )}
        <div className="text-sm leading-6 text-slate-700" style={{ whiteSpace: "pre-wrap" }}>
          {block.text || "Nome do Corretor\nCRECI 000000\n(00) 00000-0000"}
        </div>
      </div>
    );
  }

  if (block.type === "contact-form") {
    if (!active) {
      return (
        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm" style={{ width: styleBox?.width ? `${styleBox.width}px` : undefined }}>
          <div className="text-sm font-semibold text-slate-950">{block.text || "Fale conosco"}</div>
          <div className="mt-4 space-y-3">
            <input className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Seu nome" disabled />
            <input className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="WhatsApp" disabled />
            <textarea className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" rows={3} placeholder="Mensagem" disabled />
            <button className="w-full rounded-full bg-slate-950 py-2 text-sm font-semibold text-white" disabled>Enviar</button>
          </div>
        </div>
      );
    }
    return (
      <PlaceholderBlock
        {...commonProps}
        icon="📋"
        label={block.text || "Formulário de contato"}
        description="Envia nome + WhatsApp + mensagem e cria lead no CRM do tenant."
        color="slate"
        styleBox={{ ...styleBox, width: styleBox?.width ?? 360, height: styleBox?.height ?? 260 }}
      />
    );
  }

  return <EditableText {...commonProps} value={block.text ?? ""} label="Bloco" multiline className="text-base leading-7 text-slate-700" minWidth={240} minHeight={60} />;
}
