"use client";

import { useRef } from "react";
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
  style,
  multiline,
  styleBox,
  minWidth,
  minHeight,
  allowMove,
  onMove,
  onResize,
  onClick,
  onTextChange,
}: {
  active: boolean;
  selected: boolean;
  label: string;
  value: string;
  className: string;
  style?: React.CSSProperties;
  multiline?: boolean;
  styleBox?: EditorElementStyle;
  minWidth?: number;
  minHeight?: number;
  allowMove?: boolean;
  onMove?: (next: EditorElementStyle) => void;
  onResize: (next: EditorElementStyle) => void;
  onClick: () => void;
  onTextChange?: (value: string) => void;
}) {
  // When active + selected + editable: render textarea inline in the canvas
  const isInlineEditing = active && selected && Boolean(onTextChange);

  const isLink = !active && Boolean(styleBox?.clickable && styleBox?.href);
  const ringClass = selected ? "ring-2 ring-sky-500 ring-offset-4 ring-offset-transparent" : "";
  const hoverClass =
    active && !isInlineEditing
      ? "cursor-text rounded-2xl transition hover:ring-2 hover:ring-sky-300/70"
      : isLink
      ? "cursor-pointer"
      : "cursor-default";
  const sharedClass = `w-full text-left ${hoverClass} ${ringClass}`;

  const contentStyle: React.CSSProperties = {
    ...(multiline ? { whiteSpace: "pre-wrap" } : undefined),
    ...style,
    fontSize: styleBox?.fontSize ? `${styleBox.fontSize}px` : undefined,
    ...(styleBox?.color !== undefined ? { color: styleBox.color } : {}),
  };

  const textClasses =
    `${className} ${getFontFamilyClass(styleBox?.fontFamily)} ${getFontWeightClass(styleBox?.fontWeight)} ${getFontStyleClass(styleBox?.fontStyle)}`.trim();

  const labelEl = active ? (
    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-600">{label}</div>
  ) : null;

  const content = (
    <>
      {labelEl}
      {isInlineEditing ? (
        <textarea
          autoFocus
          value={value}
          onChange={(e) => onTextChange!(e.target.value)}
          rows={multiline ? 4 : 2}
          className={`w-full resize-none border-0 bg-transparent p-0 outline-none ring-0 focus:ring-0 ${textClasses}`}
          style={contentStyle}
        />
      ) : (
        <div className={textClasses} style={contentStyle}>
          {value}
        </div>
      )}
    </>
  );

  const minHeightStyle = styleBox?.height ? `${styleBox.height}px` : undefined;

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
      {isInlineEditing ? (
        /* When editing inline: plain div, textarea handles input */
        <div className={sharedClass} style={{ minHeight: minHeightStyle }}>
          {content}
        </div>
      ) : active ? (
        /* Edit mode but not selected: clickable button to select */
        <button type="button" onClick={onClick} className={sharedClass} style={{ minHeight: minHeightStyle }}>
          {content}
        </button>
      ) : isLink ? (
        <a href={styleBox?.href} className={sharedClass} style={{ minHeight: minHeightStyle }}>
          {content}
        </a>
      ) : (
        <div className={sharedClass} style={{ minHeight: minHeightStyle }}>
          {content}
        </div>
      )}
    </ResizableFrame>
  );
}
