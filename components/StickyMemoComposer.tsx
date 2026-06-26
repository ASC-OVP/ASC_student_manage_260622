"use client";

import { useState, type CSSProperties } from "react";
import { createStickyMemoAction } from "@/app/memos/actions";
import {
  defaultStickyMemoColor,
  getStickyMemoColorTheme,
  normalizeStickyMemoColor,
  stickyMemoColors,
} from "@/components/stickyMemoColors";

type Props = {
  placeholder: string;
  rows?: number;
  buttonLabel?: string;
};

export default function StickyMemoComposer({ placeholder, rows = 2, buttonLabel = "추가" }: Props) {
  const [selectedColor, setSelectedColor] = useState(defaultStickyMemoColor);
  const selected = normalizeStickyMemoColor(selectedColor);
  const theme = getStickyMemoColorTheme(selected);

  return (
    <form
      action={createStickyMemoAction}
      style={{
        ...compose,
        background: theme.surface,
        borderColor: `${theme.border}99`,
      }}
    >
      <textarea
        name="content"
        rows={rows}
        required
        placeholder={placeholder}
        style={{
          ...textarea,
          background: "transparent",
        }}
      />
      <div style={bottomBar}>
        <div style={colorRow} aria-label="포스트잇 색상">
          {stickyMemoColors.map((color) => {
            const isSelected = selected === color.value;

            return (
              <label key={color.value} title={color.label} style={swatchLabel}>
                <input
                  type="radio"
                  name="color"
                  value={color.value}
                  checked={isSelected}
                  onChange={() => setSelectedColor(color.value)}
                  style={srOnly}
                />
                <span
                  style={{
                    ...swatch,
                    background: color.value,
                    borderColor: isSelected ? color.accent : "rgba(17, 24, 39, .22)",
                    boxShadow: isSelected
                      ? `0 0 0 2px ${color.shadow}, inset 0 0 0 1px rgba(255,255,255,.82)`
                      : "inset 0 0 0 1px rgba(255,255,255,.7)",
                    transform: isSelected ? "translateY(-1px)" : undefined,
                  }}
                >
                  {isSelected && <span style={{ ...swatchCheck, color: color.accent }}>✓</span>}
                </span>
              </label>
            );
          })}
        </div>
        <button type="submit" style={primaryButton}>
          {buttonLabel}
        </button>
      </div>
    </form>
  );
}

const compose: CSSProperties = {
  display: "grid",
  gap: 6,
  border: "1px solid rgba(250,204,21,.6)",
  borderRadius: 8,
  padding: 10,
  transition: "background-color .16s ease, border-color .16s ease",
};
const textarea: CSSProperties = {
  width: "100%",
  minWidth: 0,
  minHeight: 60,
  border: 0,
  borderRadius: 0,
  padding: 0,
  color: "#111827",
  resize: "vertical",
  lineHeight: 1.42,
  outline: "none",
  transition: "background-color .16s ease, border-color .16s ease",
};
const bottomBar: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 6, alignItems: "center", flexWrap: "wrap" };
const primaryButton: CSSProperties = { height: 30, border: 0, borderRadius: 7, background: "#111827", color: "#fff", padding: "0 10px", fontSize: 12, fontWeight: 950 };
const colorRow: CSSProperties = { display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" };
const swatchLabel: CSSProperties = { display: "inline-grid", placeItems: "center", cursor: "pointer", borderRadius: 999 };
const swatch: CSSProperties = {
  width: 17,
  height: 17,
  borderRadius: 999,
  border: "2px solid rgba(17,24,39,.22)",
  display: "grid",
  placeItems: "center",
  transition: "border-color .16s ease, box-shadow .16s ease, transform .16s ease",
};
const swatchCheck: CSSProperties = { fontSize: 11, fontWeight: 950, lineHeight: 1 };
const srOnly: CSSProperties = { position: "absolute", opacity: 0, pointerEvents: "none", width: 1, height: 1 };
