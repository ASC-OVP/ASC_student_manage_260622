"use client";

import { useState, type CSSProperties } from "react";
import { createStickyMemoAction, deleteStickyMemoAction, updateStickyMemoAction } from "@/app/memos/actions";

export type StickyLauncherMemo = {
  id: string;
  content: string;
  color: string;
  updatedAt: string;
};

type Props = {
  memos: StickyLauncherMemo[];
};

const colors = [
  { value: "#FEF3C7", label: "노랑" },
  { value: "#DBEAFE", label: "파랑" },
  { value: "#DCFCE7", label: "초록" },
  { value: "#FCE7F3", label: "분홍" },
  { value: "#EDE9FE", label: "보라" },
  { value: "#FFE4E6", label: "장미" },
];

export default function StickyMemoLauncher({ memos }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div style={wrap}>
      {open && (
        <section style={panel} aria-label="내 포스트잇 패널">
          <div style={head}>
            <div style={headText}>
              <b>내 포스트잇</b>
              <span>{memos.length}개</span>
            </div>
            <button type="button" onClick={() => setOpen(false)} style={closeButton} aria-label="포스트잇 닫기">×</button>
          </div>

          <form action={createStickyMemoAction} style={compose}>
            <textarea name="content" rows={3} required placeholder="빠른 메모" style={textarea} />
            <div style={formFoot}>
              <ColorRadios name="color" current="#FEF3C7" />
              <button style={primaryButton}>추가</button>
            </div>
          </form>

          <div style={list}>
            {memos.map((memo) => (
              <article key={memo.id} style={{ ...sticky, background: memo.color || "#FEF3C7" }}>
                <form action={updateStickyMemoAction} style={editForm}>
                  <input type="hidden" name="stickyMemoId" value={memo.id} />
                  <textarea name="content" rows={4} required defaultValue={memo.content} style={stickyText} />
                  <ColorRadios name="color" current={memo.color} compact />
                  <div style={cardFoot}>
                    <small>{memo.updatedAt}</small>
                    <button style={smallButton}>저장</button>
                  </div>
                </form>
                <form action={deleteStickyMemoAction} style={deleteForm}>
                  <input type="hidden" name="stickyMemoId" value={memo.id} />
                  <button style={deleteButton}>삭제</button>
                </form>
              </article>
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
        type="button"
        onClick={() => setOpen((current) => !current)}
        style={launcher}
        aria-expanded={open}
        aria-label="내 포스트잇 열기"
        title="내 포스트잇"
      >
        메모
      </button>
    </div>
  );
}

function ColorRadios({ name, current, compact = false }: { name: string; current: string; compact?: boolean }) {
  return (
    <div style={compact ? colorRowCompact : colorRow}>
      {colors.map((color) => (
        <label key={color.value} title={color.label} style={swatchLabel}>
          <input type="radio" name={name} value={color.value} defaultChecked={(current || "#FEF3C7").toUpperCase() === color.value} style={radio} />
          <span style={{ ...swatch, background: color.value }} />
        </label>
      ))}
    </div>
  );
}

const wrap: CSSProperties = { position: "fixed", right: 18, bottom: 18, zIndex: 60, display: "grid", justifyItems: "end", gap: 10, pointerEvents: "none" };
const launcher: CSSProperties = { pointerEvents: "auto", minWidth: 58, height: 44, borderRadius: 999, border: "1px solid #facc15", background: "#fef3c7", color: "#713f12", boxShadow: "0 12px 26px rgba(15,23,42,.2)", fontWeight: 950, fontSize: 14, cursor: "pointer", padding: "0 14px" };
const panel: CSSProperties = { pointerEvents: "auto", width: "min(380px, calc(100vw - 24px))", maxHeight: "min(620px, calc(100vh - 92px))", overflowY: "auto", background: "#fff", border: "1px solid #d1d5db", borderRadius: 10, boxShadow: "0 22px 58px rgba(15,23,42,.24)", padding: 12, display: "grid", gap: 10 };
const head: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 };
const headText: CSSProperties = { display: "flex", flexDirection: "column", gap: 2 };
const closeButton: CSSProperties = { width: 30, height: 30, border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", fontWeight: 950, cursor: "pointer" };
const compose: CSSProperties = { display: "grid", gap: 8, border: "1px solid #fde68a", borderRadius: 8, padding: 9, background: "#fffbeb" };
const textarea: CSSProperties = { width: "100%", minWidth: 0, border: "1px solid #d1d5db", borderRadius: 7, padding: 9, resize: "vertical", lineHeight: 1.45 };
const formFoot: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" };
const primaryButton: CSSProperties = { height: 30, border: 0, borderRadius: 7, background: "#111827", color: "#fff", padding: "0 10px", fontWeight: 950 };
const list: CSSProperties = { display: "grid", gap: 8 };
const sticky: CSSProperties = { position: "relative", border: "1px solid rgba(146,64,14,.2)", borderRadius: 7, padding: 10, minHeight: 138, boxShadow: "0 6px 14px rgba(15,23,42,.08)" };
const editForm: CSSProperties = { display: "grid", gap: 7 };
const stickyText: CSSProperties = { border: 0, outline: "none", resize: "vertical", background: "transparent", color: "#111827", fontWeight: 800, lineHeight: 1.42, paddingRight: 42 };
const cardFoot: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, color: "#6b7280", fontSize: 12 };
const smallButton: CSSProperties = { height: 26, border: "1px solid rgba(17,24,39,.22)", borderRadius: 7, background: "rgba(255,255,255,.75)", color: "#111827", padding: "0 8px", fontSize: 12, fontWeight: 950 };
const deleteForm: CSSProperties = { position: "absolute", right: 10, top: 10 };
const deleteButton: CSSProperties = { height: 24, border: "1px solid rgba(153,27,27,.2)", borderRadius: 6, background: "rgba(255,255,255,.75)", color: "#991b1b", padding: "0 7px", fontSize: 11, fontWeight: 950 };
const colorRow: CSSProperties = { display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" };
const colorRowCompact: CSSProperties = { ...colorRow, paddingRight: 42 };
const swatchLabel: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 3, cursor: "pointer" };
const radio: CSSProperties = { width: 12, height: 12, margin: 0 };
const swatch: CSSProperties = { width: 18, height: 18, borderRadius: 999, border: "1px solid rgba(17,24,39,.25)" };
const empty: CSSProperties = { border: "1px dashed #d1d5db", borderRadius: 8, padding: 18, textAlign: "center", color: "#6b7280", fontWeight: 900, display: "grid", gap: 5, background: "#fffbeb" };
