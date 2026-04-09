"use client";

import ResizableFrame from "./ResizableFrame";
import { EditorElementStyle } from "@/lib/site-content";

export function getFontFamilyClass(fontFamily?: EditorElementStyle["fontFamily"]) {
  if (fontFamily === "serif") return "font-serif";
  if (fontFamily === "mono") return "font-mono";
  if (fontFamily === "display") return "font-black tracking-tight";
  return "";
}

export function getFontWeightClass(fontWeight?: EditorElementStyle["fontWeight"]) {
  return fontWeight === "bold" ? "font-bold" : "";
}

export function getFontStyleClass(fontStyle?: EditorElementStyle["fontStyle"]) {
  return fontStyle === "italic" ? "italic" : "";
}

export default function EditableText({
  active,
  selected,
  label,
  value,
  className,
  multiline,
  styleBox,
  minWidth,
  minHeight,
  allowMove,
  onMove,
  onResize,
  onClick,
}: {
  active: boolean;
  selected: boolean;
  label: string;
  value: string;
  className: string;
  multiline?: boolean;
  styleBox?: EditorElementStyle;
  minWidth?: number;
  minHeight?: number;
  allowMove?: boolean;
  onMove?: (next: EditorElementStyle) => void;
  onResize: (next: EditorElementStyle) => void;
  onClick: () => void;
}) {
  const isLink = !active && Boolean(styleBox?.clickable && styleBox?.href);
  const ringClass = selected ? "ring-2 ring-sky-500 ring-offset-4 ring-offset-transparent" : "";
  const hoverClass = active ? "cursor-text rounded-2xl transition hover:ring-2 hover:ring-sky-300/70" : isLink ? "cursor-pointer" : "cursor-default";
  const sharedClass = `w-full text-left ${hoverClass} ${ringClass}`;

  const contentStyle: React.CSSProperties = {
    ...(multiline ? { whiteSpace: "pre-wrap" } : undefined),
    fontSize: styleBox?.fontSize ? `${styleBox.fontSize}px` : undefined,
    color: styleBox?.color ?? undefined,
  };

  const content = (
    <>
      {active ? <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-600">{label}</div> : null}
      <div
        className={`${className} ${getFontFamilyClass(styleBox?.fontFamily)} ${getFontWeightClass(styleBox?.fontWeight)} ${getFontStyleClass(styleBox?.fontStyle)}`.trim()}
        style={contentStyle}
      >
        {value}
      </div>
    </>
  );

  return (
    <ResizableFrame
      active={active}
      selected={selected}
      styleBox={styleBox}
      minWidth={minWidth}
      minHeight={minHeight}
      allowMove={allowMove}
      onMove={onMove}
      onResize={onResize}
    >
      {active ? (
        <button type="button" onClick={onClick} className={sharedClass} style={{ minHeight: styleBox?.height ? `${styleBox.height}px` : undefined }}>
          {content}
        </button>
      ) : isLink ? (
        <a href={styleBox?.href} className={sharedClass} style={{ minHeight: styleBox?.height ? `${styleBox.height}px` : undefined }}>
          {content}
        </a>
      ) : (
        <div className={sharedClass} style={{ minHeight: styleBox?.height ? `${styleBox.height}px` : undefined }}>
          {content}
        </div>
      )}
    </ResizableFrame>
  );
}
