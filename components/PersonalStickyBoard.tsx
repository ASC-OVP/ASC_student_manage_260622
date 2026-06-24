import type { CSSProperties } from "react";
import { createStickyMemoAction, deleteStickyMemoAction, updateStickyMemoAction } from "@/app/memos/actions";

export type StickyMemoView = {
  id: string;
  content: string;
  color: string;
  updatedAt: Date;
};

type Props = {
  memos: StickyMemoView[];
};

const colors = [
  { value: "#FEF3C7", label: "노랑" },
  { value: "#DBEAFE", label: "파랑" },
  { value: "#DCFCE7", label: "초록" },
  { value: "#FCE7F3", label: "분홍" },
  { value: "#EDE9FE", label: "보라" },
  { value: "#FFE4E6", label: "장미" },
];

export default function PersonalStickyBoard({ memos }: Props) {
  return (
    <section style={panel}>
      <div style={head}>
        <div>
          <p style={eyebrow}>내 포스트잇 보드</p>
          <h2 style={title}>개인 메모 공간</h2>
          <p style={desc}>나만 보는 할 일, 아이디어, 임시 메모입니다.</p>
        </div>
        <span style={countBadge}>{memos.length}개</span>
      </div>

      <form action={createStickyMemoAction} style={compose}>
        <textarea name="content" required rows={2} placeholder="빠른 메모를 적어두세요." style={textarea} />
        <div style={bottomBar}>
          <ColorRadios name="color" current="#FEF3C7" />
          <button style={primaryButton}>추가</button>
        </div>
      </form>

      <div style={grid}>
        {memos.map((memo) => (
          <article key={memo.id} style={{ ...sticky, background: memo.color || "#FEF3C7" }}>
            <form action={updateStickyMemoAction} style={stickyForm}>
              <input type="hidden" name="stickyMemoId" value={memo.id} />
              <textarea name="content" defaultValue={memo.content} required rows={4} style={stickyText} />
              <ColorRadios name="color" current={memo.color} compact />
              <div style={cardFoot}>
                <small>{formatDateTime(memo.updatedAt)} 수정</small>
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
            <b>아직 내 포스트잇이 없습니다.</b>
            <span>할 일, 아이디어, 상담 전 체크할 내용을 적어두세요.</span>
          </div>
        )}
      </div>
    </section>
  );
}

function ColorRadios({ name, current, compact = false }: { name: string; current: string; compact?: boolean }) {
  return (
    <div style={compact ? colorRowCompact : colorRow} aria-label="포스트잇 색상">
      {colors.map((color) => (
        <label key={color.value} title={color.label} style={swatchLabel}>
          <input type="radio" name={name} value={color.value} defaultChecked={(current || "#FEF3C7").toUpperCase() === color.value} style={srOnly} />
          <span style={{ ...swatch, background: color.value }} />
        </label>
      ))}
    </div>
  );
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const panel: CSSProperties = { background: "#fff", border: "1px solid #dfe3ea", borderRadius: 10, padding: 14, display: "grid", gap: 12, minWidth: 0 };
const head: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 };
const eyebrow: CSSProperties = { margin: "0 0 4px", color: "#ca8a04", fontWeight: 950, fontSize: 12 };
const title: CSSProperties = { margin: 0, fontSize: 20, fontWeight: 950 };
const desc: CSSProperties = { margin: "5px 0 0", color: "#6b7280", fontSize: 13 };
const countBadge: CSSProperties = { border: "1px solid #fde68a", borderRadius: 999, background: "#fffbeb", color: "#92400e", padding: "6px 9px", fontSize: 12, fontWeight: 950, whiteSpace: "nowrap" };
const compose: CSSProperties = { display: "grid", gap: 8, border: "1px solid #fde68a", borderRadius: 8, padding: 9, background: "#fffbeb" };
const textarea: CSSProperties = { width: "100%", minWidth: 0, border: "1px solid #d1d5db", borderRadius: 7, padding: 9, background: "#fff", resize: "vertical", lineHeight: 1.4 };
const bottomBar: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" };
const primaryButton: CSSProperties = { height: 30, border: 0, borderRadius: 7, background: "#111827", color: "#fff", padding: "0 11px", fontWeight: 950 };
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 9 };
const sticky: CSSProperties = { position: "relative", border: "1px solid rgba(146, 64, 14, .16)", borderRadius: 7, padding: 10, minHeight: 150, boxShadow: "0 6px 15px rgba(15, 23, 42, .07)" };
const stickyForm: CSSProperties = { display: "grid", gap: 8 };
const stickyText: CSSProperties = { width: "100%", minWidth: 0, border: 0, outline: "none", resize: "vertical", background: "transparent", lineHeight: 1.42, color: "#111827", fontWeight: 800, paddingRight: 42 };
const cardFoot: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, color: "#6b7280", fontSize: 12 };
const smallButton: CSSProperties = { height: 26, border: "1px solid rgba(17,24,39,.2)", borderRadius: 7, background: "rgba(255,255,255,.72)", color: "#111827", padding: "0 8px", fontSize: 12, fontWeight: 950 };
const deleteForm: CSSProperties = { position: "absolute", right: 10, top: 10 };
const deleteButton: CSSProperties = { height: 24, border: "1px solid rgba(153,27,27,.2)", borderRadius: 6, background: "rgba(255,255,255,.72)", color: "#991b1b", padding: "0 7px", fontSize: 11, fontWeight: 950 };
const colorRow: CSSProperties = { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" };
const colorRowCompact: CSSProperties = { ...colorRow, paddingRight: 44 };
const swatchLabel: CSSProperties = { display: "inline-grid", placeItems: "center", cursor: "pointer" };
const swatch: CSSProperties = { width: 18, height: 18, borderRadius: 999, border: "2px solid rgba(17,24,39,.22)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.72)" };
const srOnly: CSSProperties = { position: "absolute", opacity: 0, pointerEvents: "none", width: 1, height: 1 };
const empty: CSSProperties = { gridColumn: "1 / -1", border: "1px dashed #d1d5db", borderRadius: 8, padding: 20, textAlign: "center", color: "#6b7280", fontWeight: 900, display: "grid", gap: 5, background: "#fffdf3" };
