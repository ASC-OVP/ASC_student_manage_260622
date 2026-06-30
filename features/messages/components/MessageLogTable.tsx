import type { CSSProperties } from "react";

export type MessageLogRow = {
  id: string;
  recipientType: string;
  receiverName: string;
  phone: string;
  normalizedPhone: string;
  messageText: string;
  status: string;
  providerMessageId: string | null;
  errorMessage: string | null;
  retried: boolean;
  sentAt: Date | null;
  createdAt: Date;
  student: { name: string } | null;
  job: {
    id: string;
    title: string;
    targetType: string;
    status: string;
    dryRun: boolean;
    createdAt: Date;
    createdBy: { name: string };
    template: { id: string; name: string } | null;
  };
};

type Props = {
  logs: MessageLogRow[];
  templates: Array<{ id: string; name: string }>;
  filters: {
    dateFrom?: string;
    dateTo?: string;
    status?: string;
    templateId?: string;
    query?: string;
    failedOnly?: boolean;
    jobId?: string;
  };
};

const statusOptions = ["ALL", "PENDING", "SENDING", "SUCCESS", "FAILED", "DRY_RUN"];

export default function MessageLogTable({ logs, templates, filters }: Props) {
  return (
    <section style={wrap}>
      <div>
        <h2 style={title}>발송 기록</h2>
        <p style={desc}>dry-run과 실제 발송 결과를 함께 확인합니다. 재발송은 TODO로 남겨두었습니다.</p>
      </div>

      <form method="get" style={filterBar}>
        <input type="hidden" name="tab" value="logs" />
        <input type="date" name="dateFrom" defaultValue={filters.dateFrom ?? ""} style={input} />
        <input type="date" name="dateTo" defaultValue={filters.dateTo ?? ""} style={input} />
        <select name="status" defaultValue={filters.status ?? "ALL"} style={input}>
          {statusOptions.map((status) => <option key={status} value={status}>{status === "ALL" ? "전체 상태" : statusLabel(status)}</option>)}
        </select>
        <select name="templateId" defaultValue={filters.templateId ?? "all"} style={input}>
          <option value="all">전체 템플릿</option>
          {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
        </select>
        <input name="query" defaultValue={filters.query ?? ""} placeholder="학생명/전화번호" style={input} />
        <label style={checkLabel}>
          <input type="checkbox" name="failedOnly" defaultChecked={filters.failedOnly} />
          실패만
        </label>
        <button style={filterButton}>조회</button>
      </form>

      <div style={tableWrap}>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>발송 일시</th>
              <th style={th}>발송자</th>
              <th style={th}>유형</th>
              <th style={th}>템플릿</th>
              <th style={th}>학생명</th>
              <th style={th}>수신자</th>
              <th style={th}>번호</th>
              <th style={th}>내용</th>
              <th style={th}>상태</th>
              <th style={th}>재시도</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const highlighted = filters.jobId === log.job.id;
              return (
                <tr key={log.id} style={highlighted ? highlightedRow : undefined}>
                  <td style={td}>{formatDate(log.sentAt ?? log.createdAt)}</td>
                  <td style={td}>{log.job.createdBy.name}</td>
                  <td style={td}>{log.job.dryRun ? "dry-run" : "운영 알림"}</td>
                  <td style={td}>{log.job.template?.name ?? "-"}</td>
                  <td style={td}>{log.student?.name ?? "-"}</td>
                  <td style={td}>{log.recipientType === "GUARDIAN" ? "보호자" : "학생"}</td>
                  <td style={td}>{log.phone}</td>
                  <td style={messageTd}>
                    <details>
                      <summary style={messageSummary}>{clip(log.messageText, 42)}</summary>
                      <div style={detailBox}>
                        <b>{log.receiverName}</b>
                        <p>{log.messageText}</p>
                        <small>provider message id: {log.providerMessageId ?? "-"}</small>
                        {log.errorMessage && <small style={errorText}>실패 사유: {log.errorMessage}</small>}
                      </div>
                    </details>
                  </td>
                  <td style={td}><span style={statusBadge(log.status)}>{statusLabel(log.status)}</span></td>
                  <td style={td}>{log.retried ? "예" : "아니오"}</td>
                </tr>
              );
            })}
            {logs.length === 0 && (
              <tr>
                <td style={emptyTd} colSpan={10}>발송 기록이 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function statusLabel(status: string) {
  if (status === "PENDING") return "대기";
  if (status === "SENDING") return "발송 중";
  if (status === "SUCCESS") return "성공";
  if (status === "FAILED") return "실패";
  if (status === "DRY_RUN") return "dry-run";
  if (status === "PARTIAL_FAILED") return "일부 실패";
  return status;
}

function statusBadge(status: string): CSSProperties {
  const base: CSSProperties = { borderRadius: 999, padding: "5px 8px", fontSize: 12, fontWeight: 950, whiteSpace: "nowrap" };
  if (status === "SUCCESS") return { ...base, background: "var(--asc-success-soft)", color: "var(--asc-success)" };
  if (status === "FAILED" || status === "PARTIAL_FAILED") return { ...base, background: "var(--asc-danger-soft)", color: "var(--asc-danger)" };
  if (status === "DRY_RUN") return { ...base, background: "var(--asc-info-soft)", color: "var(--asc-info)" };
  return { ...base, background: "#f3f4f6", color: "var(--asc-text-muted)" };
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function clip(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

const wrap: CSSProperties = { display: "grid", gap: 10 };
const title: CSSProperties = { margin: 0, fontSize: 18, fontWeight: 950 };
const desc: CSSProperties = { margin: "4px 0 0", color: "var(--asc-text-muted)", fontSize: 13 };
const filterBar: CSSProperties = { display: "grid", gridTemplateColumns: "150px 150px 150px 180px minmax(160px, 1fr) 90px 80px", gap: 6, alignItems: "center", border: "1px solid var(--asc-border)", borderRadius: 8, background: "#fff", padding: 8 };
const input: CSSProperties = { height: 34, border: "1px solid var(--asc-border)", borderRadius: 8, padding: "0 9px", minWidth: 0 };
const checkLabel: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 900, color: "var(--asc-text-subtle)" };
const filterButton: CSSProperties = { height: 34, border: "1px solid var(--asc-primary)", borderRadius: 8, background: "var(--asc-primary)", color: "#fff", fontWeight: 950 };
const tableWrap: CSSProperties = { overflow: "auto", border: "1px solid var(--asc-border)", borderRadius: 8, background: "#fff" };
const table: CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 1120, fontSize: 13 };
const th: CSSProperties = { position: "sticky", top: 0, background: "#f8fafc", borderBottom: "1px solid var(--asc-border)", padding: "8px 9px", textAlign: "left", whiteSpace: "nowrap", fontWeight: 950 };
const td: CSSProperties = { borderBottom: "1px solid #eef2f7", padding: "8px 9px", whiteSpace: "nowrap", verticalAlign: "top" };
const messageTd: CSSProperties = { ...td, whiteSpace: "normal", minWidth: 260 };
const messageSummary: CSSProperties = { cursor: "pointer", color: "var(--asc-text-subtle)", fontWeight: 850 };
const detailBox: CSSProperties = { marginTop: 8, display: "grid", gap: 5, border: "1px solid #e5e7eb", borderRadius: 8, background: "#f8fafc", padding: 10, whiteSpace: "pre-wrap" };
const errorText: CSSProperties = { color: "var(--asc-danger)", fontWeight: 900 };
const emptyTd: CSSProperties = { padding: 14, textAlign: "center", color: "var(--asc-text-muted)" };
const highlightedRow: CSSProperties = { background: "var(--asc-info-soft)" };
