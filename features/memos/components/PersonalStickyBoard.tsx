import type { CSSProperties } from "react";
import StickyMemoComposer from "@/features/memos/components/StickyMemoComposer";
import StickyMemoCard from "@/features/memos/components/StickyMemoCard";

export type StickyMemoView = {
  id: string;
  content: string;
  color: string;
  updatedAt: Date;
};

type Props = {
  memos: StickyMemoView[];
};

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

      <StickyMemoComposer placeholder="빠른 메모를 적어두세요." rows={2} />

      <div style={grid}>
        {memos.map((memo) => (
          <StickyMemoCard
            key={memo.id}
            memo={{
              id: memo.id,
              content: memo.content,
              color: memo.color,
              updatedAtText: `${formatDateTime(memo.updatedAt)} 수정`,
            }}
          />
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

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const panel: CSSProperties = { background: "#fff", border: "1px solid #dfe3ea", borderRadius: 8, padding: 12, display: "grid", gap: 10, minWidth: 0 };
const head: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 };
const eyebrow: CSSProperties = { margin: "0 0 4px", color: "#ca8a04", fontWeight: 950, fontSize: 12 };
const title: CSSProperties = { margin: 0, fontSize: 18, fontWeight: 950 };
const desc: CSSProperties = { margin: "3px 0 0", color: "#6b7280", fontSize: 12 };
const countBadge: CSSProperties = { border: "1px solid #fde68a", borderRadius: 999, background: "#fffbeb", color: "#92400e", padding: "5px 8px", fontSize: 12, fontWeight: 950, whiteSpace: "nowrap" };
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(158px, 1fr))", gap: 7 };
const empty: CSSProperties = { gridColumn: "1 / -1", border: "1px dashed #d1d5db", borderRadius: 8, padding: 14, textAlign: "center", color: "#6b7280", fontWeight: 900, display: "grid", gap: 4, background: "#fffdf3" };

