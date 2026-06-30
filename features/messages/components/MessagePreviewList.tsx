"use client";

import type { CSSProperties } from "react";
import { messageLengthLabel } from "@/lib/sms/renderTemplate";
import type { RecipientPreviewResult } from "@/lib/sms/recipients";

type Props = {
  preview: RecipientPreviewResult;
  selectedRecipientId?: string;
  onSelectRecipient?: (localId: string) => void;
};

export default function MessagePreviewList({ preview, selectedRecipientId, onSelectRecipient }: Props) {
  const studentCount = preview.recipients.filter((recipient) => recipient.recipientType === "STUDENT").length;
  const guardianCount = preview.recipients.filter((recipient) => recipient.recipientType === "GUARDIAN").length;

  return (
    <section style={panel}>
      <div style={summaryGrid}>
        <Summary label="발송 대상" value={`${preview.recipients.length}명`} />
        <Summary label="학생" value={`${studentCount}명`} />
        <Summary label="학부모" value={`${guardianCount}명`} />
        <Summary label="제외" value={`${preview.skipped.length}건`} tone={preview.skipped.length > 0 ? "warn" : "default"} />
        <Summary label="누락 변수" value={`${preview.missingVariables.length}명`} tone={preview.missingVariables.length > 0 ? "warn" : "default"} />
        <Summary label="최대 길이" value={messageLengthLabel(preview.maxByteLength)} tone={preview.maxByteLength > 90 ? "warn" : "default"} />
      </div>

      {preview.unknownVariables.length > 0 && <div style={warningBox}>허용되지 않은 변수: {preview.unknownVariables.map((variable) => `{{${variable}}}`).join(", ")}</div>}
      {preview.missingVariables.length > 0 && <div style={warningBox}>{preview.missingVariables.slice(0, 3).map((item) => `${item.receiverName}: ${item.variables.map((name) => `{{${name}}}`).join(", ")}`).join(" / ")}</div>}

      <div style={tableWrap}>
        <table style={table}>
          <thead><tr><th style={th}>수신자</th><th style={th}>유형</th><th style={th}>전화번호</th><th style={th}>상태</th></tr></thead>
          <tbody>
            {preview.recipients.slice(0, 80).map((recipient) => (
              <tr key={recipient.localId} onClick={() => onSelectRecipient?.(recipient.localId)} style={selectedRecipientId === recipient.localId ? selectedRow : undefined}>
                <td style={td}>{recipient.receiverName}</td>
                <td style={td}>{recipient.recipientType === "GUARDIAN" ? "학부모" : "학생"}</td>
                <td style={td}>{recipient.phone}</td>
                <td style={td}>{recipient.missingVariables?.length ? `누락 ${recipient.missingVariables.length}` : `${recipient.byteLength ?? 0} byte`}</td>
              </tr>
            ))}
            {preview.recipients.length === 0 && <tr><td style={emptyTd} colSpan={4}>발송 대상이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>

      {preview.skipped.length > 0 && (
        <details style={details}>
          <summary style={summary}>제외된 대상 보기</summary>
          <div style={skipList}>{preview.skipped.slice(0, 80).map((skip, index) => <span key={`${skip.studentId}-${skip.recipientType}-${index}`} style={skipPill}>{skip.studentName} / {skip.recipientType === "GUARDIAN" ? "학부모" : "학생"} / {skipReason(skip.reason)}</span>)}</div>
        </details>
      )}
    </section>
  );
}

function Summary({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warn" }) {
  return <div style={{ ...summaryCard, ...(tone === "warn" ? summaryWarn : {}) }}><span>{label}</span><b>{value}</b></div>;
}

function skipReason(reason: string) {
  if (reason === "NO_PHONE") return "전화번호 없음";
  if (reason === "DUPLICATE") return "중복 번호";
  if (reason === "CONSENT_BLOCKED") return "수신 제한";
  if (reason === "MARKETING_OPT_OUT") return "광고 수신 미동의";
  return reason;
}

const panel: CSSProperties = { display: "grid", gap: 9 };
const summaryGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(92px, 1fr))", gap: 6 };
const summaryCard: CSSProperties = { border: "1px solid var(--asc-border)", borderRadius: 8, background: "var(--asc-bg-subtle)", padding: 8, display: "grid", gap: 3, color: "var(--asc-text-subtle)", fontSize: 12, fontWeight: 800 };
const summaryWarn: CSSProperties = { borderColor: "#ffd166", background: "var(--asc-warning-soft)", color: "var(--asc-warning-text)" };
const warningBox: CSSProperties = { border: "1px solid #ffd166", borderRadius: 8, background: "var(--asc-warning-soft)", color: "var(--asc-warning-text)", padding: 8, fontWeight: 900, fontSize: 12 };
const tableWrap: CSSProperties = { overflow: "auto", border: "1px solid var(--asc-border)", borderRadius: 8, background: "#fff", maxHeight: 260 };
const table: CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
const th: CSSProperties = { position: "sticky", top: 0, background: "#f8fafc", borderBottom: "1px solid var(--asc-border)", padding: "8px 9px", textAlign: "left", whiteSpace: "nowrap", fontWeight: 950 };
const td: CSSProperties = { borderBottom: "1px solid #eef2f7", padding: "8px 9px", whiteSpace: "nowrap", verticalAlign: "top", cursor: "pointer" };
const selectedRow: CSSProperties = { background: "var(--asc-primary-soft)" };
const emptyTd: CSSProperties = { padding: 14, textAlign: "center", color: "var(--asc-text-muted)" };
const details: CSSProperties = { border: "1px solid var(--asc-border)", borderRadius: 8, padding: 8, background: "#fff" };
const summary: CSSProperties = { cursor: "pointer", fontWeight: 950 };
const skipList: CSSProperties = { display: "flex", gap: 5, flexWrap: "wrap", marginTop: 7 };
const skipPill: CSSProperties = { border: "1px solid #fed7aa", borderRadius: 999, background: "#fff7ed", color: "#9a3412", padding: "5px 8px", fontSize: 12, fontWeight: 850 };
