"use client";

import Image from "next/image";
import ResizableFrame from "./ResizableFrame";
import { EditorElementStyle } from "@/lib/site-content";

export default function EditableLogo({
  active,
  selected,
  label,
  src,
  alt,
  height,
  dark,
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
  src: string | null;
  alt: string;
  height: number;
  dark?: boolean;
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
  const wStyle: React.CSSProperties = {
    width: styleBox?.width ? `${styleBox.width}px` : undefined,
    minHeight: styleBox?.height ? `${styleBox.height}px` : undefined,
  };

  const content = (
    <>
      <span className="sr-only">{label}</span>
      {src ? (
        <Image
          src={src}
          alt={alt}
          width={styleBox?.width ?? 240}
          height={styleBox?.height ?? height}
          unoptimized
          className={`object-contain ${dark ? "brightness-0 invert" : ""}`}
          style={{ width: styleBox?.width ? `${styleBox.width}px` : "auto", height: styleBox?.height ? `${styleBox.height}px` : `${height}px` }}
        />
      ) : (
        <span
          className={`inline-flex items-center justify-center rounded-2xl border border-dashed px-4 text-xs font-semibold uppercase tracking-[0.22em] ${dark ? "border-white/20 text-slate-300" : "border-slate-300 text-slate-500"}`}
          style={{ width: styleBox?.width ? `${styleBox.width}px` : undefined, height: styleBox?.height ? `${styleBox.height}px` : `${height}px`, minWidth: "180px" }}
        >
          Inserir logo
        </span>
      )}
    </>
  );

  return (
    <ResizableFrame active={active} selected={selected} styleBox={styleBox} minWidth={minWidth} minHeight={minHeight} allowMove={allowMove} onMove={onMove} onResize={onResize}>
      {active ? (
        <button type="button" onClick={onClick} className={`inline-flex rounded-2xl cursor-pointer transition hover:ring-2 hover:ring-sky-300/70 ${ringClass}`} style={wStyle}>
          {content}
        </button>
      ) : isLink ? (
        <a href={styleBox?.href} className={`inline-flex rounded-2xl ${ringClass}`} style={wStyle}>{content}</a>
      ) : (
        <div className={`inline-flex rounded-2xl ${ringClass}`} style={wStyle}>{content}</div>
      )}
    </ResizableFrame>
  );
}
