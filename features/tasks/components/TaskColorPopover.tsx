"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { sheetFillPalette } from "@/lib/colorPalettes";

type Props = {
  taskId: string;
  currentColor: string;
  action: (formData: FormData) => void | Promise<void>;
};

const panelWidth = 236;
const panelHeight = 112;
const viewportGap = 8;

export default function TaskColorPopover({ taskId, currentColor, action }: Props) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const normalizedCurrent = currentColor.toLowerCase();

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    let left = rect.right - panelWidth;
    let top = rect.bottom + 6;

    if (left < viewportGap) left = viewportGap;
    if (left + panelWidth > window.innerWidth - viewportGap) left = window.innerWidth - panelWidth - viewportGap;
    if (top + panelHeight > window.innerHeight - viewportGap) top = rect.top - panelHeight - 6;
    if (top < viewportGap) top = viewportGap;

    setPosition({ top, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && (triggerRef.current?.contains(target) || panelRef.current?.contains(target))) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const handleViewportChange = () => updatePosition();

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, updatePosition]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        style={colorPickerTrigger}
        title="업무 색상 선택"
        aria-label="업무 색상 선택"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span style={currentColorDot(currentColor)} />
      </button>
      {open &&
        createPortal(
          <div ref={panelRef} style={{ ...colorPalettePanel, top: position.top, left: position.left }}>
            {sheetFillPalette.map((color) => {
              const active = normalizedCurrent === color.value.toLowerCase();
              return (
                <form key={color.value} action={action} style={colorSwatchForm} onSubmit={() => setOpen(false)}>
                  <input type="hidden" name="taskId" value={taskId} />
                  <input type="hidden" name="color" value={color.value} />
                  <button
                    type="submit"
                    style={colorPaletteButton(color.value, active)}
                    title={color.label}
                    aria-label={`업무 색상 ${color.label}`}
                  >
                    {active ? "✓" : ""}
                  </button>
                </form>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}

const colorPickerTrigger: CSSProperties = {
  width: 28,
  height: 28,
  display: "grid",
  placeItems: "center",
  border: "1px solid #d1d5db",
  borderRadius: 7,
  background: "#fff",
  cursor: "pointer",
};
const colorPalettePanel: CSSProperties = {
  position: "fixed",
  zIndex: 80,
  width: panelWidth,
  display: "grid",
  gridTemplateColumns: "repeat(8, 22px)",
  gap: 5,
  padding: 9,
  border: "1px solid #d1d5db",
  borderRadius: 8,
  background: "#fff",
  boxShadow: "0 18px 42px rgba(15, 23, 42, 0.22)",
};
const colorSwatchForm: CSSProperties = { display: "contents" };

function currentColorDot(color: string): CSSProperties {
  return {
    width: 16,
    height: 16,
    borderRadius: 999,
    border: "1px solid #94a3b8",
    background: color,
  };
}

function colorPaletteButton(color: string, active: boolean): CSSProperties {
  return {
    width: 22,
    height: 22,
    borderRadius: 999,
    border: active ? "2px solid #111827" : "1px solid #cbd5e1",
    background: color,
    boxShadow: active ? "0 0 0 2px #bfdbfe" : "none",
    color: active ? "#111827" : "transparent",
    fontSize: 13,
    fontWeight: 950,
    lineHeight: "18px",
    cursor: "pointer",
  };
}
