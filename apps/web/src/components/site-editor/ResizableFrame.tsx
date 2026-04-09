"use client";

import { ReactNode, useEffect, useRef } from "react";
import { EditorElementStyle } from "@/lib/site-content";

type ResizeHandle = "n" | "e" | "s" | "w" | "ne" | "nw" | "se" | "sw";
type MoveState = { startX: number; startY: number; originX: number; originY: number };

const HANDLES: Array<{ handle: ResizeHandle; className: string; cursor: string }> = [
  { handle: "nw", className: "-left-1.5 -top-1.5", cursor: "nwse-resize" },
  { handle: "n", className: "left-1/2 -top-1.5 -translate-x-1/2", cursor: "ns-resize" },
  { handle: "ne", className: "-right-1.5 -top-1.5", cursor: "nesw-resize" },
  { handle: "e", className: "-right-1.5 top-1/2 -translate-y-1/2", cursor: "ew-resize" },
  { handle: "se", className: "-bottom-1.5 -right-1.5", cursor: "nwse-resize" },
  { handle: "s", className: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2", cursor: "ns-resize" },
  { handle: "sw", className: "-bottom-1.5 -left-1.5", cursor: "nesw-resize" },
  { handle: "w", className: "-left-1.5 top-1/2 -translate-y-1/2", cursor: "ew-resize" },
];

export default function ResizableFrame({
  active,
  selected,
  styleBox,
  minWidth = 120,
  minHeight = 48,
  allowMove = true,
  onMove,
  onResize,
  children,
}: {
  active: boolean;
  selected: boolean;
  styleBox?: EditorElementStyle;
  minWidth?: number;
  minHeight?: number;
  allowMove?: boolean;
  onMove?: (next: EditorElementStyle) => void;
  onResize: (next: EditorElementStyle) => void;
  children: ReactNode;
}) {
  const dragRef = useRef<{ handle: ResizeHandle; startX: number; startY: number; startWidth: number; startHeight: number } | null>(null);
  const moveRef = useRef<MoveState | null>(null);

  useEffect(() => {
    if (!active || !selected) return;

    function onPointerMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (drag) {
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        let w = drag.startWidth;
        let h = drag.startHeight;
        if (drag.handle.includes("e")) w = drag.startWidth + dx;
        if (drag.handle.includes("w")) w = drag.startWidth - dx;
        if (drag.handle.includes("s")) h = drag.startHeight + dy;
        if (drag.handle.includes("n")) h = drag.startHeight - dy;
        onResize({ width: Math.max(minWidth, Math.round(w)), height: Math.max(minHeight, Math.round(h)) });
        return;
      }
      const move = moveRef.current;
      if (move && onMove) {
        onMove({ x: Math.round(move.originX + (e.clientX - move.startX)), y: Math.round(move.originY + (e.clientY - move.startY)) });
      }
    }

    function stopDrag() {
      dragRef.current = null;
      moveRef.current = null;
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopDrag);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopDrag);
    };
  }, [active, selected, minHeight, minWidth, onMove, onResize]);

  function startDrag(handle: ResizeHandle, e: React.PointerEvent<HTMLSpanElement>) {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { handle, startX: e.clientX, startY: e.clientY, startWidth: styleBox?.width ?? minWidth, startHeight: styleBox?.height ?? minHeight };
  }

  function startMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!allowMove || !onMove) return;
    e.preventDefault();
    e.stopPropagation();
    moveRef.current = { startX: e.clientX, startY: e.clientY, originX: styleBox?.x ?? 0, originY: styleBox?.y ?? 0 };
  }

  return (
    <div
      className={`relative ${selected ? "z-10" : ""}`}
      style={{
        transform: allowMove && (styleBox?.x || styleBox?.y) ? `translate(${styleBox?.x ?? 0}px, ${styleBox?.y ?? 0}px)` : undefined,
        width: styleBox?.width ? `${styleBox.width}px` : undefined,
        minHeight: styleBox?.height ? `${styleBox.height}px` : undefined,
      }}
    >
      {children}
      {active && selected && allowMove ? (
        <button
          type="button"
          data-move-handle="1"
          onPointerDown={startMove}
          className="absolute -left-2 -top-8 rounded-full bg-slate-950 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white shadow"
        >
          mover
        </button>
      ) : null}
      {active && selected
        ? HANDLES.map((item) => (
            <span
              key={item.handle}
              data-resize-handle="1"
              onPointerDown={(e) => startDrag(item.handle, e)}
              className={`absolute h-3 w-3 rounded-full border border-white bg-sky-500 shadow ${item.className}`}
              style={{ cursor: item.cursor }}
            />
          ))
        : null}
    </div>
  );
}
