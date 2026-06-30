import Link from "next/link";
import type { CSSProperties } from "react";
import { Badge, PageHeader } from "@/components/ui";
import { requireUser, roleText } from "@/lib/auth";
import { getActivityCountSince, getRecentActivity } from "@/lib/activityLog";
import { effectiveClassStatus } from "@/lib/classGroups";
import { todayKoreaDate } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { canExportFullAcademy } from "@/lib/scopes";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  const user = await requireUser();
  const today = todayKoreaDate();
  const sinceToday = `${today} 00:00:00`;

  const [
    studentCount,
    classGroups,
    openTaskCount,
    overdueTaskCount,
    omrReviewCount,
    logsToday,
    recentLogs,
  ] = await Promise.all([
    prisma.student.count({ where: { academyId: user.academyId } }),
    prisma.classGroup.findMany({
      where: { academyId: user.academyId },
      select: { id: true, name: true, status: true, startDate: true, endDate: true, daysOfWeek: true },
      orderBy: { name: "asc" },
    }),
    prisma.task.count({ where: { academyId: user.academyId, status: { not: "DONE" } } }),
    prisma.task.count({
      where: {
        academyId: user.academyId,
        status: { in: ["TODO", "IN_PROGRESS", "HOLD"] },
        dueDate: { lt: new Date() },
      },
    }),
    prisma.omrUpload.count({
      where: {
        academyId: user.academyId,
        OR: [
          { recognizeStatus: { in: ["REVIEW_NEEDED", "FAILED"] } },
          { gradingStatus: { in: ["WAITING", "GRADED_REVIEW_NEEDED"] } },
        ],
      },
    }),
    getActivityCountSince(user.academyId, sinceToday),
    getRecentActivity(user.academyId, 40),
  ]);

  const activeClassCount = classGroups.filter((classGroup) => effectiveClassStatus(classGroup, today) === "ACTIVE").length;
  const canBackup = canExportFullAcademy(user.role);
  const roleGuide = guideForRole(user.role);

  return (
    <main style={page}>
      <section style={container}>
        <div style={hero}>
          <PageHeader
            eyebrow="운영 점검"
            title="운영 안정화"
            description="운영중인 반, 미완료 업무, 검수 필요한 OMR, 내보내기, 최근 변경 기록을 한 화면에서 확인합니다."
            actions={<div className="asc-status-row"><Badge tone="navy">{user.name}</Badge><Badge>{roleText(user.role)}</Badge></div>}
          />
        </div>

        <div style={statsGrid}>
          <Stat label="학생" value={`${studentCount}명`} note="CSV 내보내기 가능" />
          <Stat label="운영중인 반" value={`${activeClassCount}개`} note={`전체 ${classGroups.length}개`} />
          <Stat label="미완료 업무" value={`${openTaskCount}개`} note={`지연 ${overdueTaskCount}개`} tone={overdueTaskCount > 0 ? "danger" : "default"} />
          <Stat label="OMR 검수" value={`${omrReviewCount}개`} note="인식/채점 확인 필요" tone={omrReviewCount > 0 ? "warn" : "default"} />
          <Stat label="오늘 변경" value={`${logsToday}건`} note="저장/수정/채점 기록" />
        </div>

        <div style={grid}>
          <section style={panel}>
            <div style={panelHead}>
              <div>
                <h2 style={panelTitle}>데이터 내보내기</h2>
                <p style={panelDesc}>권한에 따라 학생 목록 CSV 또는 전체 운영 백업을 받을 수 있습니다.</p>
              </div>
            </div>
            <div style={buttonRow}>
              <a href="/api/export/students" style={primaryButton}>
                학생 CSV 다운로드
              </a>
              {canBackup ? (
                <a href="/api/export/backup" style={secondaryButton}>
                  전체 백업 JSON 다운로드
                </a>
              ) : (
                <span style={disabledButton}>전체 백업은 실장/관리자만 가능</span>
              )}
            </div>
            <p style={hint}>
              백업에는 비밀번호 해시를 제외한 운영 기록만 포함됩니다.
            </p>
          </section>

          <section style={panel}>
            <div style={panelHead}>
              <div>
                <h2 style={panelTitle}>바로가기</h2>
                <p style={panelDesc}>{roleGuide}</p>
              </div>
            </div>
            <div style={shortcutGrid}>
              <Link href="/students" style={shortcut}>학생 현황판</Link>
              <Link href="/classes" style={shortcut}>반 관리</Link>
              <Link href="/tasks" style={shortcut}>업무 관리</Link>
              <Link href="/calendar" style={shortcut}>캘린더</Link>
              <Link href="/omr" style={shortcut}>OMR 검사</Link>
              <Link href="/users" style={shortcut}>계정 관리</Link>
            </div>
          </section>
        </div>

        <section style={panel}>
          <div style={panelHead}>
            <div>
              <h2 style={panelTitle}>최근 변경 기록</h2>
              <p style={panelDesc}>수정, 삭제, 업무 처리, OMR 인식과 채점 같은 주요 작업 기록입니다.</p>
            </div>
          </div>

          <div style={logTableWrap}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>시간</th>
                  <th style={th}>작업자</th>
                  <th style={th}>구분</th>
                  <th style={th}>내용</th>
                </tr>
              </thead>
              <tbody>
                {recentLogs.map((log) => (
                  <tr key={log.id}>
                    <td style={td}>{formatDateTime(log.createdAt)}</td>
                    <td style={td}>{log.actorName ?? "-"}</td>
                    <td style={td}>
                      <span style={badge}>{actionLabel(log.action)}</span>
                    </td>
                    <td style={td}>{log.summary}</td>
                  </tr>
                ))}
                {recentLogs.length === 0 && (
                  <tr>
                    <td style={emptyTd} colSpan={4}>아직 기록된 변경 이력이 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}

function Stat({ label, value, note, tone = "default" }: { label: string; value: string; note: string; tone?: "default" | "warn" | "danger" }) {
  return (
    <div style={{ ...statCard, ...(tone === "warn" ? warnCard : {}), ...(tone === "danger" ? dangerCard : {}) }}>
      <span>{label}</span>
      <b>{value}</b>
      <small>{note}</small>
    </div>
  );
}

function guideForRole(role: string) {
  if (role === "ASSISTANT") return "조교는 일상 업무에 필요한 학생, 반, 업무, OMR 화면을 빠르게 확인합니다.";
  if (role === "TEACHER") return "강사는 담당 반, 학생, 배정 업무, 캘린더, OMR 결과로 바로 이동할 수 있습니다.";
  return "실장과 관리자는 내보내기, 계정, 반, 업무, 시스템 변경 기록을 함께 점검합니다.";
}

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    CREATE: "생성",
    UPDATE: "수정",
    DELETE: "삭제",
    BULK_UPDATE: "일괄 수정",
    EXPORT: "내보내기",
    BACKUP: "백업",
    GRADE: "채점",
    RECOGNIZE: "인식",
    STATUS: "상태 변경",
  };
  return labels[action] ?? action;
}

function formatDateTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const page: CSSProperties = { padding: 12, color: "var(--asc-text)", background: "var(--asc-bg-subtle)", minHeight: "100vh" };
const container: CSSProperties = { width: "100%", maxWidth: "none", margin: 0, display: "flex", flexDirection: "column", gap: 10 };
const hero: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "stretch", background: "var(--asc-surface)", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 12 };
const statsGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(5, minmax(132px, 1fr))", gap: 8 };
const statCard: CSSProperties = { background: "var(--asc-bg)", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 10, display: "flex", flexDirection: "column", gap: 4 };
const warnCard: CSSProperties = { background: "var(--asc-warning-soft)", borderColor: "var(--asc-warning)" };
const dangerCard: CSSProperties = { background: "var(--asc-danger-soft)", borderColor: "var(--asc-danger)" };
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "1.1fr .9fr", gap: 10 };
const panel: CSSProperties = { background: "var(--asc-surface)", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 12 };
const panelHead: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 };
const panelTitle: CSSProperties = { margin: 0, fontSize: 16, fontWeight: 950 };
const panelDesc: CSSProperties = { margin: "3px 0 0", color: "var(--asc-text-muted)", fontSize: 13 };
const buttonRow: CSSProperties = { display: "flex", gap: 6, flexWrap: "wrap" };
const primaryButton: CSSProperties = { background: "var(--asc-primary)", color: "#fff", border: "1px solid var(--asc-primary)", borderRadius: "var(--asc-radius-lg)", padding: "8px 11px", textDecoration: "none", fontWeight: 950 };
const secondaryButton: CSSProperties = { background: "var(--asc-bg)", color: "var(--asc-text)", border: "1px solid var(--asc-border-strong)", borderRadius: "var(--asc-radius-lg)", padding: "8px 11px", textDecoration: "none", fontWeight: 950 };
const disabledButton: CSSProperties = { ...secondaryButton, color: "var(--asc-text-muted)", background: "var(--asc-bg-subtle)" };
const hint: CSSProperties = { margin: "8px 0 0", color: "var(--asc-text-muted)", fontSize: 13 };
const shortcutGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 };
const shortcut: CSSProperties = { border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: "9px 10px", textDecoration: "none", color: "var(--asc-text)", fontWeight: 900, background: "var(--asc-bg-subtle)" };
const logTableWrap: CSSProperties = { overflow: "auto", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)" };
const table: CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th: CSSProperties = { textAlign: "left", background: "var(--asc-bg-subtle)", padding: "8px 9px", borderBottom: "1px solid var(--asc-border)", whiteSpace: "nowrap" };
const td: CSSProperties = { padding: "8px 9px", borderBottom: "1px solid var(--asc-border)", verticalAlign: "top" };
const emptyTd: CSSProperties = { ...td, textAlign: "center", color: "var(--asc-text-muted)", padding: 14 };
const badge: CSSProperties = { display: "inline-flex", alignItems: "center", borderRadius: 999, background: "var(--asc-primary-soft)", color: "var(--asc-primary-hover)", padding: "3px 8px", fontWeight: 900, whiteSpace: "nowrap" };
