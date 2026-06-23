import { requireUser, roleText } from "@/lib/auth";
import { effectiveClassStatus, parseClassDaysOfWeek } from "@/lib/classGroups";
import { todayKoreaDate } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

const studentStatusText: Record<string, string> = {
  ACTIVE: "재원",
  WATCH: "주의",
  PAUSED: "휴원",
  LEFT: "퇴원",
};

const taskStatusText: Record<string, string> = {
  TODO: "대기",
  IN_PROGRESS: "진행",
  DONE: "완료",
  HOLD: "보류",
};

const attendanceText: Record<string, string> = {
  PRESENT: "현장",
  LATE: "지각",
  VIDEO: "영상",
  MAKEUP: "보강",
  MATERIAL: "자료",
  EARLY_LEAVE: "조퇴",
  SKIP: "출튀",
  ABSENT: "결석",
  EXCUSED: "부재",
  LEFT: "퇴원",
};

export const dynamic = "force-dynamic";

const DASHBOARD_LIST_LIMIT = 5;

export default async function DashboardPage() {
  const user = await requireUser();
  const today = todayKoreaDate();

  const [
    totalStudents,
    activeStudents,
    watchStudents,
    pausedStudents,
    leftStudents,
    todayAttendance,
    todayAssignments,
    recentMemos,
    openTaskCount,
    openTasks,
    staff,
    recentStudents,
    classGroups,
  ] = await Promise.all([
    prisma.student.count({ where: { academyId: user.academyId } }),
    prisma.student.count({ where: { academyId: user.academyId, status: "ACTIVE" } }),
    prisma.student.count({ where: { academyId: user.academyId, status: "WATCH" } }),
    prisma.student.count({ where: { academyId: user.academyId, status: "PAUSED" } }),
    prisma.student.count({ where: { academyId: user.academyId, status: "LEFT" } }),
    prisma.attendanceRecord.findMany({
      where: { academyId: user.academyId, date: today },
      include: { student: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.assignmentRecord.findMany({
      where: { academyId: user.academyId, date: today },
      include: { student: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.studentMemo.findMany({
      where: { student: { academyId: user.academyId } },
      include: { student: true, writer: true },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.task.count({ where: { academyId: user.academyId, status: { not: "DONE" } } }),
    prisma.task.findMany({
      where: { academyId: user.academyId, status: { not: "DONE" } },
      include: { assignee: true, student: true },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: 8,
    }),
    prisma.user.findMany({
      where: { academyId: user.academyId, isActive: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
    prisma.student.findMany({
      where: { academyId: user.academyId },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.classGroup.findMany({
      where: { academyId: user.academyId },
      select: {
        startDate: true,
        endDate: true,
        daysOfWeek: true,
        status: true,
        lessons: {
          where: { lessonDate: { not: null } },
          select: { lessonDate: true },
        },
        studentClasses: {
          where: {
            status: "ACTIVE",
            AND: [
              { OR: [{ joinedAt: null }, { joinedAt: { lte: today } }] },
              { OR: [{ leftAt: null }, { leftAt: { gte: today } }] },
            ],
            student: { status: { in: ["ACTIVE", "WATCH"] } },
          },
          select: { studentId: true },
        },
      },
    }),
  ]);

  const todayStudentIds = new Set<string>();
  for (const classGroup of classGroups) {
    if (!isClassOnDate(classGroup, today)) continue;
    for (const membership of classGroup.studentClasses) {
      todayStudentIds.add(membership.studentId);
    }
  }

  const todayTargetStudentCount = todayStudentIds.size;
  const todayClassAttendance = todayAttendance.filter((record) => todayStudentIds.has(record.studentId));
  const todayClassAssignments = todayAssignments.filter((record) => todayStudentIds.has(record.studentId));

  const attendanceChecked = todayClassAttendance.length;
  const presentCount = todayClassAttendance.filter((record) => record.status === "PRESENT").length;
  const issueAttendance = todayClassAttendance.filter((record) => record.status !== "PRESENT");
  const assignmentChecked = todayClassAssignments.length;
  const assignmentDone = todayClassAssignments.filter((record) => record.status === "DONE").length;
  const assignmentIssues = todayClassAssignments.filter((record) => record.status === "PARTIAL" || record.status === "MISSING");

  const managers = staff.filter((member) => member.role === "ADMIN" || member.role === "MANAGER");
  const teachers = staff.filter((member) => member.role === "TEACHER");
  const assistants = staff.filter((member) => member.role === "ASSISTANT");

  return (
    <main style={page}>
      <section style={container}>
        <div style={header}>
          <div>
            <h1 style={title}>{user.academy.name} 대시보드</h1>
            <p style={desc}>{today} 기준 학생·메모·업무·직원 현황입니다.</p>
          </div>

          <div style={actions}>
            <Link href="/students" style={primaryButton}>학생 현황판</Link>
            <Link href="/tasks/new" style={secondaryButton}>업무 생성</Link>
            <Link href="/memos/new" style={secondaryButton}>메모 추가</Link>
          </div>
        </div>

        <div style={stats}>
          <Stat href="/students" label="전체 학생" value={`${totalStudents}명`} note={`재원 ${activeStudents}명`} />
          <Stat href="/students?sort=name" label="주의 학생" value={`${watchStudents}명`} note={`휴원 ${pausedStudents}명 · 퇴원 ${leftStudents}명`} tone="warn" />
          <Stat href={`/students?date=${today}&tab=attendance`} label="오늘 출석 체크" value={`${attendanceChecked}/${todayTargetStudentCount}`} note={`현장 ${presentCount}명`} />
          <Stat href={`/students?date=${today}&tab=assignment`} label="오늘 과제 체크" value={`${assignmentChecked}/${todayTargetStudentCount}`} note={`완료 ${assignmentDone}명`} />
          <Stat href="/tasks" label="미완료 업무" value={`${openTaskCount}개`} note="대기·진행·보류" tone="task" />
        </div>

        <div style={mainGrid}>
          <Panel
            title="오늘 출석/과제 이슈"
            href={`/students?date=${today}`}
            empty={issueAttendance.length === 0 && assignmentIssues.length === 0}
            emptyText="오늘 표시된 출석·과제 이슈가 없습니다."
          >
            {issueAttendance.slice(0, 5).map((record) => (
              <LineItem
                key={`a-${record.id}`}
                href={`/students/${record.studentId}`}
                title={record.student.name}
                meta={`출석 ${attendanceText[record.status] ?? record.status}`}
                tone="warn"
              />
            ))}
            {assignmentIssues.slice(0, 5).map((record) => (
              <LineItem
                key={`h-${record.id}`}
                href={`/students/${record.studentId}`}
                title={record.student.name}
                meta={`과제 ${record.status === "PARTIAL" ? "부분" : "미완료"}`}
                tone="danger"
              />
            ))}
          </Panel>

          <Panel title="최근 메모" href="/memos" empty={recentMemos.length === 0} emptyText="아직 메모가 없습니다.">
            {recentMemos.map((memo) => (
              <LineItem
                key={memo.id}
                href={`/students/${memo.studentId}`}
                title={`${memo.isImportant ? "중요 · " : ""}${memo.student.name}`}
                meta={`${memo.content} · ${memo.writer.name}`}
              />
            ))}
          </Panel>

          <Panel title="업무 현황" href="/tasks" empty={openTasks.length === 0} emptyText="미완료 업무가 없습니다.">
            {openTasks.slice(0, DASHBOARD_LIST_LIMIT).map((task) => (
              <LineItem
                key={task.id}
                href={`/tasks/${task.id}`}
                title={task.title}
                meta={`${taskStatusText[task.status]} · ${task.assignee.name}${task.student ? ` · ${task.student.name}` : ""}`}
                tone={task.priority === "URGENT" || task.priority === "HIGH" ? "danger" : "task"}
              />
            ))}
            {openTaskCount > DASHBOARD_LIST_LIMIT && <MoreRow href="/tasks" count={openTaskCount - DASHBOARD_LIST_LIMIT} label="업무" />}
          </Panel>

          <Panel title="직원/계정" href="/users" empty={staff.length === 0} emptyText="활성 계정이 없습니다.">
            <div style={roleSummary}>
              <RoleBadge label="실장/관리자" value={managers.length} />
              <RoleBadge label="강사" value={teachers.length} />
              <RoleBadge label="조교" value={assistants.length} />
            </div>
            {staff.slice(0, DASHBOARD_LIST_LIMIT).map((member) => (
              <LineItem key={member.id} href="/users" title={member.name} meta={`${roleText(member.role)} · ${member.loginId}`} />
            ))}
            {staff.length > DASHBOARD_LIST_LIMIT && <MoreRow href="/users" count={staff.length - DASHBOARD_LIST_LIMIT} label="계정" />}
          </Panel>
        </div>

        <section style={widePanel}>
          <div style={panelHead}>
            <div>
              <h2 style={panelTitle}>최근 등록 학생</h2>
              <p style={panelDesc}>학생 상세로 바로 이동해서 메모와 기록을 확인할 수 있습니다.</p>
            </div>
            <Link href="/students/new" style={smallLink}>학생 추가</Link>
          </div>

          <div style={studentGrid}>
            {recentStudents.map((student) => (
              <Link key={student.id} href={`/students/${student.id}`} style={studentTile}>
                <b>{student.name}</b>
                <span>{student.schoolName ?? "학교 미입력"} · {student.grade ?? "학년 미입력"}</span>
                <small>{studentStatusText[student.status] ?? student.status}</small>
              </Link>
            ))}
            {recentStudents.length === 0 && <p style={empty}>등록된 학생이 없습니다.</p>}
          </div>
        </section>
      </section>
    </main>
  );
}

function Stat({
  href,
  label,
  value,
  note,
  tone = "default",
}: {
  href: string;
  label: string;
  value: string;
  note: string;
  tone?: "default" | "warn" | "task";
}) {
  return (
    <Link href={href} style={{ ...statCard, ...(tone === "warn" ? warnCard : {}), ...(tone === "task" ? taskCard : {}) }}>
      <span style={statLabel}>{label}</span>
      <b style={statValue}>{value}</b>
      <small style={statNote}>{note}</small>
    </Link>
  );
}

function Panel({
  title,
  href,
  empty,
  emptyText,
  children,
}: {
  title: string;
  href: string;
  empty: boolean;
  emptyText: string;
  children: ReactNode;
}) {
  return (
    <section style={panel}>
      <div style={panelHead}>
        <h2 style={panelTitle}>{title}</h2>
        <Link href={href} style={smallLink}>전체 보기</Link>
      </div>
      <div style={list}>{empty ? <p style={emptyStyle}>{emptyText}</p> : children}</div>
    </section>
  );
}

function LineItem({
  href,
  title,
  meta,
  tone = "default",
}: {
  href: string;
  title: string;
  meta: string;
  tone?: "default" | "warn" | "danger" | "task";
}) {
  return (
    <Link href={href} style={lineItem}>
      <span style={{ ...dot, ...(tone === "warn" ? warnDot : {}), ...(tone === "danger" ? dangerDot : {}), ...(tone === "task" ? taskDot : {}) }} />
      <span style={lineText}>
        <b>{title}</b>
        <small>{meta}</small>
      </span>
    </Link>
  );
}

function RoleBadge({ label, value }: { label: string; value: number }) {
  return (
    <span style={roleBadge}>
      <b>{value}</b>
      {label}
    </span>
  );
}

function isClassOnDate(
  classGroup: {
    startDate: string | null;
    endDate: string | null;
    daysOfWeek: string | null;
    status: string | null;
    lessons: Array<{ lessonDate: string | null }>;
  },
  date: string
) {
  if (effectiveClassStatus(classGroup, date) !== "ACTIVE") return false;

  const savedLessons = classGroup.lessons.filter((lesson) => lesson.lessonDate);
  if (savedLessons.length > 0) {
    return savedLessons.some((lesson) => lesson.lessonDate === date);
  }

  const dateValue = dateFromYmd(date);
  if (!dateValue) return false;
  if (classGroup.startDate && date < classGroup.startDate) return false;
  if (classGroup.endDate && date > classGroup.endDate) return false;

  const daysOfWeek = parseClassDaysOfWeek(classGroup.daysOfWeek);
  return daysOfWeek.includes(dateValue.getDay());
}

function dateFromYmd(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

function MoreRow({ href, count, label }: { href: string; count: number; label: string }) {
  return (
    <Link href={href} style={moreRow}>
      +{count}개 {label} 더 보기
    </Link>
  );
}

const page: CSSProperties = { padding: 16, color: "#111827" };
const container: CSSProperties = { width: "100%", maxWidth: "none", margin: 0 };
const header: CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18, marginBottom: 18 };
const title: CSSProperties = { fontSize: 34, fontWeight: 950, margin: "0 0 8px" };
const desc: CSSProperties = { margin: 0, color: "#6b7280" };
const actions: CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" };
const primaryButton: CSSProperties = { background: "#111827", color: "#fff", borderRadius: 10, padding: "12px 16px", fontWeight: 950, textDecoration: "none" };
const secondaryButton: CSSProperties = { background: "#fff", color: "#111827", border: "1px solid #d1d5db", borderRadius: 10, padding: "12px 16px", fontWeight: 950, textDecoration: "none" };
const stats: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(5, minmax(160px, 1fr))", gap: 12, marginBottom: 16 };
const statCard: CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, textDecoration: "none", color: "#111827", display: "flex", flexDirection: "column", gap: 8, minHeight: 116 };
const warnCard: CSSProperties = { borderColor: "#fde68a", background: "#fffbeb" };
const taskCard: CSSProperties = { borderColor: "#bfdbfe", background: "#eff6ff" };
const statLabel: CSSProperties = { color: "#6b7280", fontWeight: 900 };
const statValue: CSSProperties = { fontSize: 24, lineHeight: 1 };
const statNote: CSSProperties = { color: "#4b5563", fontWeight: 800 };
const mainGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14, marginBottom: 16 };
const panel: CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, minHeight: 320 };
const widePanel: CSSProperties = { ...panel, minHeight: 0 };
const panelHead: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 };
const panelTitle: CSSProperties = { margin: 0, fontSize: 18, fontWeight: 950 };
const panelDesc: CSSProperties = { margin: "6px 0 0", color: "#6b7280", fontSize: 13 };
const smallLink: CSSProperties = { color: "#2563eb", textDecoration: "none", fontWeight: 900, whiteSpace: "nowrap" };
const list: CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };
const lineItem: CSSProperties = { display: "flex", gap: 10, padding: "10px 0", borderBottom: "1px solid #f3f4f6", color: "#111827", textDecoration: "none" };
const dot: CSSProperties = { width: 9, height: 9, borderRadius: 999, background: "#9ca3af", marginTop: 5, flex: "0 0 auto" };
const warnDot: CSSProperties = { background: "#f59e0b" };
const dangerDot: CSSProperties = { background: "#dc2626" };
const taskDot: CSSProperties = { background: "#2563eb" };
const lineText: CSSProperties = { display: "flex", flexDirection: "column", gap: 4, minWidth: 0 };
const moreRow: CSSProperties = { display: "block", marginTop: 2, padding: "9px 10px", borderRadius: 8, background: "#f8fafc", color: "#2563eb", textDecoration: "none", fontWeight: 950, textAlign: "center", border: "1px solid #e5e7eb" };
const emptyStyle: CSSProperties = { margin: 0, color: "#6b7280", fontWeight: 800 };
const roleSummary: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 8 };
const roleBadge: CSSProperties = { display: "flex", flexDirection: "column", gap: 4, border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, fontSize: 12, color: "#4b5563" };
const studentGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 };
const studentTile: CSSProperties = { display: "flex", flexDirection: "column", gap: 6, border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, textDecoration: "none", color: "#111827", background: "#f9fafb" };
const empty: CSSProperties = { margin: 0, color: "#6b7280" };
