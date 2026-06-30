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
  assignmentRate: string;
};

export default function ClassOpenRow({
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
  assignmentRate,
}: Props) {
  const router = useRouter();
  const open = () => router.push(href);
  const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key === "Enter") open();
  };

  return (
    <tr
      role="link"
      tabIndex={0}
      aria-label={`${name} 상세 화면 열기`}
      title="더블클릭하면 반 상세 화면으로 이동합니다."
      onDoubleClick={open}
      onKeyDown={handleKeyDown}
      style={row}
    >
      <td style={nameTd}>
        <div style={nameCell}>
          <b>{name}</b>
          <span>{meta}</span>
        </div>
      </td>
      <td style={td}><span style={{ ...statusBadge, color: statusTone, borderColor: `${statusTone}55` }}>{statusLabel}</span></td>
      <td style={td}>{teacherName}</td>
      <td style={td}>{assistantName}</td>
      <td style={numberTd}>{studentCount}명</td>
      <td style={td}>{schedule}</td>
      <td style={td}>
        <div style={lessonCell}>
          <span>{latestLabel}</span>
          <b>{latestValue}</b>
        </div>
      </td>
      <td style={numberTd}>{averageScore}</td>
      <td style={numberTd}>{attendanceRate}</td>
      <td style={numberTd}>{assignmentRate}</td>
    </tr>
  );
}

const row: CSSProperties = { cursor: "pointer", outlineOffset: -2 };
const td: CSSProperties = { borderBottom: "1px solid var(--asc-border)", padding: "11px 12px", verticalAlign: "middle", whiteSpace: "nowrap", fontSize: 13, fontWeight: 850, color: "var(--asc-text)" };
const nameTd: CSSProperties = { ...td, minWidth: 220 };
const numberTd: CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const nameCell: CSSProperties = { display: "grid", gap: 3, minWidth: 0 };
const statusBadge: CSSProperties = { display: "inline-flex", alignItems: "center", border: "1px solid", borderRadius: 999, padding: "4px 8px", fontSize: 12, fontWeight: 950, background: "#fff", whiteSpace: "nowrap" };
const lessonCell: CSSProperties = { display: "grid", gap: 2, minWidth: 220 };
