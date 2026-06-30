"use client";

import { useRouter } from "next/navigation";
import type { CSSProperties, KeyboardEvent } from "react";

type Props = {
  href: string;
  name: string;
  meta: string;
  statusLabel: string;
  statusTone: string;
  teacherName: string;
  assistantName: string;
  studentCount: number;
  schedule: string;
  latestLabel: string;
  latestValue: string;
  averageScore: string;
  attendanceRate: string;
};

export default function ClassOpenCard({
  href,
  name,
  meta,
  statusLabel,
  statusTone,
  teacherName,
  assistantName,
  studentCount,
  schedule,
  latestLabel,
  latestValue,
  averageScore,
  attendanceRate,
}: Props) {
  const router = useRouter();
  const open = () => router.push(href);
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter") open();
  };

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`${name} 상세 화면 열기`}
      title="더블클릭하면 반 상세 화면으로 이동합니다."
      onDoubleClick={open}
      onKeyDown={handleKeyDown}
      style={card}
    >
      <div style={topRow}>
        <div style={minZero}>
          <h3 style={nameStyle}>{name}</h3>
          <p style={metaStyle}>{meta}</p>
        </div>
        <span style={{ ...statusBadge, color: statusTone, borderColor: `${statusTone}55` }}>{statusLabel}</span>
      </div>

      <div style={infoGrid}>
        <Info label="담당 강사" value={teacherName} />
        <Info label="담당 조교" value={assistantName} />
        <Info label="학생 수" value={`${studentCount}명`} />
        <Info label="요일/시간" value={schedule} />
        <Info label="최근 평균" value={averageScore} />
        <Info label="출석률" value={attendanceRate} />
      </div>

      <div style={lessonBox}>
        <span>{latestLabel}</span>
        <b>{latestValue}</b>
      </div>
      <div style={hintRow}>더블클릭 또는 Enter로 상세 열기</div>
    </article>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={infoItem}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

const card: CSSProperties = {
  border: "1px solid var(--asc-border)",
  borderRadius: "var(--asc-radius-lg)",
  background: "var(--asc-bg)",
  padding: 10,
  display: "grid",
  gap: 8,
  color: "var(--asc-text)",
  cursor: "default",
  outlineOffset: 2,
};
const topRow: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" };
const minZero: CSSProperties = { minWidth: 0 };
const nameStyle: CSSProperties = { margin: 0, fontSize: 17, fontWeight: 950, lineHeight: 1.25 };
const metaStyle: CSSProperties = { margin: "4px 0 0", color: "var(--asc-text-muted)", fontSize: 12, fontWeight: 850 };
const statusBadge: CSSProperties = { display: "inline-flex", border: "1px solid", borderRadius: 999, padding: "5px 8px", fontSize: 12, fontWeight: 950, background: "#fff", whiteSpace: "nowrap" };
const infoGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6 };
const infoItem: CSSProperties = { display: "grid", gap: 3, border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-md)", padding: "7px 8px", minWidth: 0, fontSize: 12 };
const lessonBox: CSSProperties = { display: "grid", gap: 3, border: "1px solid var(--asc-primary)", borderRadius: "var(--asc-radius-md)", background: "var(--asc-primary-soft)", color: "var(--asc-primary-hover)", padding: "8px 9px", fontSize: 12 };
const hintRow: CSSProperties = { color: "var(--asc-text-muted)", fontSize: 11, fontWeight: 800, textAlign: "right" };
