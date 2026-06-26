"use client";

import type { CSSProperties } from "react";
import { messageLengthLabel } from "@/lib/sms/renderTemplate";
import type { RecipientPreviewResult } from "@/lib/sms/recipients";

type Props = {
  preview: RecipientPreviewResult;
};

export default function MessagePreviewList({ preview }: Props) {
  const studentCount = preview.recipients.filter((recipient) => recipient.recipientType === "STUDENT").length;
  const guardianCount = preview.recipients.filter((recipient) => recipient.recipientType === "GUARDIAN").length;

  return (
    <section style={panel}>
      <div style={summaryGrid}>
        <Summary label="발송 대상" value={`${preview.recipients.length}명`} />
        <Summary label="학생" value={`${studentCount}명`} />
        <Summary label="보호자" value={`${guardianCount}명`} />
        <Summary label="제외" value={`${preview.skipped.length}건`} tone={preview.skipped.length > 0 ? "warn" : "default"} />
        <Summary label="중복 제거" value={`${preview.duplicateCount}건`} />
        <Summary label="최대 길이" value={messageLengthLabel(preview.maxMessageLength)} tone={preview.maxMessageLength > 90 ? "warn" : "default"} />
      </div>

      {preview.unknownVariables.length > 0 && (
        <div style={warningBox}>
          알 수 없는 변수: {preview.unknownVariables.map((variable) => `{{${variable}}}`).join(", ")}
        </div>
      )}

      <div style={tableWrap}>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>수신자</th>
              <th style={th}>유형</th>
              <th style={th}>전화번호</th>
              <th style={th}>메시지 미리보기</th>
            </tr>
          </thead>
          <tbody>
            {preview.recipients.slice(0, 80).map((recipient) => (
              <tr key={recipient.localId}>
                <td style={td}>{recipient.receiverName}</td>
                <td style={td}>{recipient.recipientType === "GUARDIAN" ? "보호자" : "학생"}</td>
                <td style={td}>{recipient.phone}</td>
                <td style={messageTd}>{recipient.messageText}</td>
              </tr>
            ))}
            {preview.recipients.length === 0 && (
              <tr>
                <td style={emptyTd} colSpan={4}>발송 대상이 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {preview.skipped.length > 0 && (
        <details style={details}>
          <summary style={summary}>제외된 대상 보기</summary>
          <div style={skipList}>
            {preview.skipped.slice(0, 80).map((skip, index) => (
              <span key={`${skip.studentId}-${skip.recipientType}-${index}`} style={skipPill}>
                {skip.studentName} / {skip.recipientType === "GUARDIAN" ? "보호자" : "학생"} / {skipReason(skip.reason)}
              </span>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function Summary({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warn" }) {
  return (
    <div style={{ ...summaryCard, ...(tone === "warn" ? summaryWarn : {}) }}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function skipReason(reason: string) {
  if (reason === "NO_PHONE") return "전화번호 없음";
  if (reason === "DUPLICATE") return "중복 번호";
  if (reason === "CONSENT_BLOCKED") return "수신 제한";
  return reason;
}

const panel: CSSProperties = { display: "grid", gap: 9 };
const summaryGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(6, minmax(108px, 1fr))", gap: 6 };
const summaryCard: CSSProperties = { border: "1px solid var(--asc-border)", borderRadius: 8, background: "var(--asc-bg-subtle)", padding: 8, display: "grid", gap: 3, color: "var(--asc-text-subtle)", fontSize: 12, fontWeight: 800 };
const summaryWarn: CSSProperties = { borderColor: "#ffd166", background: "var(--asc-warning-soft)", color: "var(--asc-warning-text)" };
const warningBox: CSSProperties = { border: "1px solid #ffd166", borderRadius: 8, background: "var(--asc-warning-soft)", color: "var(--asc-warning-text)", padding: 8, fontWeight: 900 };
const tableWrap: CSSProperties = { overflow: "auto", border: "1px solid var(--asc-border)", borderRadius: 8, background: "#fff", maxHeight: 320 };
const table: CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th: CSSProperties = { position: "sticky", top: 0, background: "#f8fafc", borderBottom: "1px solid var(--asc-border)", padding: "8px 9px", textAlign: "left", whiteSpace: "nowrap", fontWeight: 950 };
const td: CSSProperties = { borderBottom: "1px solid #eef2f7", padding: "8px 9px", whiteSpace: "nowrap", verticalAlign: "top" };
const messageTd: CSSProperties = { ...td, whiteSpace: "normal", minWidth: 360, color: "var(--asc-text-subtle)" };
const emptyTd: CSSProperties = { padding: 14, textAlign: "center", color: "var(--asc-text-muted)" };
const details: CSSProperties = { border: "1px solid var(--asc-border)", borderRadius: 8, padding: 8, background: "#fff" };
const summary: CSSProperties = { cursor: "pointer", fontWeight: 950 };
const skipList: CSSProperties = { display: "flex", gap: 5, flexWrap: "wrap", marginTop: 7 };
const skipPill: CSSProperties = { border: "1px solid #fed7aa", borderRadius: 999, background: "#fff7ed", color: "#9a3412", padding: "5px 8px", fontSize: 12, fontWeight: 850 };
