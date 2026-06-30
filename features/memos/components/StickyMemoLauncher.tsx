"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import StickyMemoCard from "@/features/memos/components/StickyMemoCard";
import StickyMemoComposer from "@/features/memos/components/StickyMemoComposer";

export type StickyLauncherMemo = {
  id: string;
  content: string;
  color: string;
  updatedAt: string;
};

type Props = {
  memos: StickyLauncherMemo[];
};

type SnapCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

type LauncherPosition = {
  x: number;
  y: number;
  corner?: SnapCorner;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
  size: ElementSize;
};

type ViewportSize = {
  width: number;
  height: number;
};

type ElementSize = {
  width: number;
  height: number;
};

const STORAGE_KEY = "asc-sticky-memo-window-position";
const LEGACY_STORAGE_KEY = "asc-sticky-memo-launcher-position";
const EDGE_GAP = 14;
const DOCK_GAP = 8;
const DRAG_THRESHOLD = 5;
const BUTTON_FALLBACK_SIZE: ElementSize = { width: 42, height: 42 };
const PANEL_FALLBACK_SIZE: ElementSize = { width: 360, height: 460 };

export default function StickyMemoLauncher({ memos }: Props) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<LauncherPosition | null>(null);
  const [viewport, setViewport] = useState<ViewportSize>({ width: 0, height: 0 });
  const [buttonSize, setButtonSize] = useState<ElementSize>(BUTTON_FALLBACK_SIZE);
  const [panelSize, setPanelSize] = useState<ElementSize>(PANEL_FALLBACK_SIZE);
  const [dragging, setDragging] = useState(false);
  const [mounted, setMounted] = useState(false);
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const openRef = useRef(open);
  const panelSizeRef = useRef(panelSize);
  const suppressClickRef = useRef(false);
  const previousUserSelectRef = useRef("");

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    panelSizeRef.current = panelSize;
  }, [panelSize]);

  useEffect(() => {
    const syncLauncherPosition = () => {
      const nextViewport = readViewportSize();
      const measuredButtonSize = getButtonSize(launcherRef.current);
      const savedPosition = readStoredPosition();
      const initialPosition =
        savedPosition ??
        getCornerPosition("bottom-right", nextViewport, measuredButtonSize);

      setViewport(nextViewport);
      setButtonSize(measuredButtonSize);
      setPosition(clampPosition(initialPosition, nextViewport, measuredButtonSize));
      setMounted(true);
    };

    const handleResize = () => {
      const resizedViewport = readViewportSize();
      const resizedButtonSize = getButtonSize(launcherRef.current);
      const resizedSize = openRef.current ? panelSizeRef.current : resizedButtonSize;

      setViewport(resizedViewport);
      setButtonSize(resizedButtonSize);
      setPosition((current) => {
        if (!current) return current;
        if (current.corner) return getCornerPosition(current.corner, resizedViewport, resizedSize);
        return clampPosition(current, resizedViewport, resizedSize);
      });
    };

    const frameId = window.requestAnimationFrame(syncLauncherPosition);
    window.addEventListener("resize", handleResize);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    const measurePanel = () => {
      const rect = panelRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPanelSize({ width: rect.width, height: rect.height });
    };

    const frameId = window.requestAnimationFrame(measurePanel);
    window.addEventListener("resize", measurePanel);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", measurePanel);
    };
  }, [open, memos.length]);

  if (!mounted) return null;

  const currentButtonPosition = position ?? getFallbackButtonPosition();
  const panelPosition = clampPosition(currentButtonPosition, viewport, panelSize);
  const panelPlacement: CSSProperties = { left: panelPosition.x, top: panelPosition.y };
  const launcherPlacement = open
    ? getDockedLauncherPosition(panelPosition, viewport, panelSize, buttonSize)
    : clampPosition(currentButtonPosition, viewport, buttonSize);

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;

    const buttonSize = getButtonSize(launcherRef.current);
    const dragSize = open ? panelSize : buttonSize;
    const startPosition = position ?? getFallbackButtonPosition();

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: startPosition.x,
      originY: startPosition.y,
      moved: false,
      size: dragSize,
    };

    previousUserSelectRef.current = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    suppressClickRef.current = false;
    setPosition(clampPosition(startPosition, readViewportSize(), dragSize));
    setDragging(true);

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can fail if the browser has already cancelled the pointer.
    }
  };

  const handlePanelPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;

    const startPosition = position ?? currentButtonPosition;

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: startPosition.x,
      originY: startPosition.y,
      moved: false,
      size: panelSize,
    };

    previousUserSelectRef.current = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    suppressClickRef.current = false;
    setPosition(clampPosition(startPosition, readViewportSize(), panelSize));
    setDragging(true);

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can fail if the browser has already cancelled the pointer.
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const distance = Math.hypot(dx, dy);
    if (!drag.moved && distance <= DRAG_THRESHOLD) return;

    drag.moved = true;
    suppressClickRef.current = true;
    setPosition(
      clampPosition(
        { x: drag.originX + dx, y: drag.originY + dy },
        readViewportSize(),
        drag.size,
      ),
    );
  };

  const finishPointerDrag = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    dragRef.current = null;
    document.body.style.userSelect = previousUserSelectRef.current;

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The browser may release capture automatically before pointer cancel.
    }

    if (drag.moved) {
      const nextPosition = clampPosition(
        {
          x: drag.originX + event.clientX - drag.startX,
          y: drag.originY + event.clientY - drag.startY,
        },
        readViewportSize(),
        drag.size,
      );
      setPosition(nextPosition);
      saveStoredPosition(nextPosition);
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }

    setDragging(false);
  };

  const handleClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    setOpen((current) => !current);
  };

  return (
    <div style={wrap}>
      {open && (
        <section
          ref={panelRef}
          style={{
            ...panel,
            ...panelPlacement,
            transition: dragging ? "none" : "left 160ms ease, top 160ms ease",
          }}
          aria-label="내 포스트잇 패널"
        >
          <div
            style={{ ...head, cursor: dragging ? "grabbing" : "grab" }}
            onPointerDown={handlePanelPointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishPointerDrag}
            onPointerCancel={finishPointerDrag}
            title="드래그해서 위치 이동"
          >
            <div style={headText}>
              <b>내 포스트잇</b>
              <span>{memos.length}개</span>
            </div>
            <button type="button" onClick={() => setOpen(false)} style={closeButton} aria-label="포스트잇 닫기">×</button>
          </div>

          <StickyMemoComposer placeholder="빠른 메모" rows={2} />

          <div style={list}>
            {memos.map((memo) => (
              <StickyMemoCard
                key={memo.id}
                compact
                memo={{
                  id: memo.id,
                  content: memo.content,
                  color: memo.color,
                  updatedAtText: `${memo.updatedAt} 수정`,
                }}
              />
            ))}
            {memos.length === 0 && (
              <div style={empty}>
                <b>아직 포스트잇이 없습니다.</b>
                <span>짧은 할 일이나 아이디어를 남겨두세요.</span>
              </div>
            )}
          </div>
        </section>
      )}

      <button
        ref={launcherRef}
        type="button"
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerDrag}
        onPointerCancel={finishPointerDrag}
        style={{
          ...launcher,
          left: launcherPlacement.x,
          top: launcherPlacement.y,
          cursor: dragging ? "grabbing" : "grab",
          transform: dragging ? "scale(.98)" : undefined,
          transition: dragging ? "none" : "left 120ms ease, top 120ms ease, transform 120ms ease",
        }}
        aria-expanded={open}
        aria-label="개인 메모 열기"
        title="개인 메모"
      >
        <StickyNoteIcon />
      </button>
    </div>
  );
}

function StickyNoteIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={icon}>
      <path d="M7 3h8.5L21 8.5V19a2 2 0 0 1-2 2H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M15 3v5a1 1 0 0 0 1 1h5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 13h8M8 17h5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function readViewportSize(): ViewportSize {
  if (typeof window === "undefined") return { width: 0, height: 0 };
  return { width: window.innerWidth, height: window.innerHeight };
}

function getButtonSize(button: HTMLButtonElement | null): ElementSize {
  const rect = button?.getBoundingClientRect();
  if (!rect?.width || !rect?.height) return BUTTON_FALLBACK_SIZE;
  return { width: rect.width, height: rect.height };
}

function getFallbackButtonPosition(): LauncherPosition {
  const viewport = readViewportSize();
  if (!viewport.width || !viewport.height) return { x: EDGE_GAP, y: EDGE_GAP, corner: "bottom-right" };
  return getCornerPosition("bottom-right", viewport, BUTTON_FALLBACK_SIZE);
}

function clamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function clampPosition(position: LauncherPosition | { x: number; y: number }, viewport: ViewportSize, size: ElementSize): LauncherPosition {
  if (!viewport.width || !viewport.height) return { x: position.x, y: position.y };

  return {
    x: clamp(position.x, EDGE_GAP, viewport.width - size.width - EDGE_GAP),
    y: clamp(position.y, EDGE_GAP, viewport.height - size.height - EDGE_GAP),
    corner: "corner" in position ? position.corner : undefined,
  };
}

function getCornerPosition(corner: SnapCorner, viewport: ViewportSize, size: ElementSize): LauncherPosition {
  const left = EDGE_GAP;
  const right = Math.max(EDGE_GAP, viewport.width - size.width - EDGE_GAP);
  const top = EDGE_GAP;
  const bottom = Math.max(EDGE_GAP, viewport.height - size.height - EDGE_GAP);

  return {
    x: corner.endsWith("right") ? right : left,
    y: corner.startsWith("bottom") ? bottom : top,
    corner,
  };
}

function isSnapCorner(value: unknown): value is SnapCorner {
  return value === "top-left" || value === "top-right" || value === "bottom-left" || value === "bottom-right";
}

function readStoredPosition(): LauncherPosition | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { corner?: unknown; x?: unknown; y?: unknown };
    const viewport = readViewportSize();
    if (isSnapCorner(parsed.corner)) return getCornerPosition(parsed.corner, viewport, BUTTON_FALLBACK_SIZE);

    if (typeof parsed.x === "number" && typeof parsed.y === "number") {
      return clampPosition({ x: parsed.x, y: parsed.y }, viewport, BUTTON_FALLBACK_SIZE);
    }
  } catch {
    return null;
  }

  return null;
}

function saveStoredPosition(position: LauncherPosition) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ x: Math.round(position.x), y: Math.round(position.y) }));
  } catch {
    // localStorage can be unavailable in private browsing or restricted environments.
  }
}

function getDockedLauncherPosition(
  panelPosition: LauncherPosition,
  viewport: ViewportSize,
  panelSize: ElementSize,
  buttonSize: ElementSize,
): LauncherPosition {
  if (!viewport.width || !viewport.height) return panelPosition;

  const rightX = panelPosition.x + panelSize.width + DOCK_GAP;
  const leftX = panelPosition.x - buttonSize.width - DOCK_GAP;
  const y = clamp(panelPosition.y, EDGE_GAP, viewport.height - buttonSize.height - EDGE_GAP);

  if (rightX <= viewport.width - buttonSize.width - EDGE_GAP) return { x: rightX, y };
  if (leftX >= EDGE_GAP) return { x: leftX, y };

  return {
    x: clamp(panelPosition.x + panelSize.width - buttonSize.width - DOCK_GAP, EDGE_GAP, viewport.width - buttonSize.width - EDGE_GAP),
    y: clamp(panelPosition.y + DOCK_GAP, EDGE_GAP, viewport.height - buttonSize.height - EDGE_GAP),
  };
}

const wrap: CSSProperties = { position: "fixed", inset: 0, zIndex: 60, pointerEvents: "none" };
const launcher: CSSProperties = {
  position: "fixed",
  pointerEvents: "auto",
  width: 42,
  height: 42,
  display: "grid",
  placeItems: "center",
  borderRadius: 14,
  border: "1px solid #facc15",
  background: "#fef3c7",
  color: "#713f12",
  boxShadow: "0 10px 22px rgba(15,23,42,.18)",
  cursor: "grab",
  padding: 0,
  touchAction: "none",
  userSelect: "none",
};
const icon: CSSProperties = { display: "block", pointerEvents: "none" };
const panel: CSSProperties = { position: "fixed", pointerEvents: "auto", width: "min(360px, calc(100vw - 28px))", maxHeight: "min(600px, calc(100vh - 28px))", overflowY: "auto", background: "#fff", border: "1px solid #d1d5db", borderRadius: 10, boxShadow: "0 18px 44px rgba(15,23,42,.2)", padding: 10, display: "grid", gap: 9 };
const head: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, touchAction: "none", userSelect: "none" };
const headText: CSSProperties = { display: "flex", flexDirection: "column", gap: 1 };
const closeButton: CSSProperties = { width: 28, height: 28, border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", fontWeight: 950, cursor: "pointer" };
const list: CSSProperties = { display: "grid", gap: 7 };
const empty: CSSProperties = { border: "1px dashed #d1d5db", borderRadius: 8, padding: 14, textAlign: "center", color: "#6b7280", fontWeight: 900, display: "grid", gap: 4, background: "#fffbeb" };

