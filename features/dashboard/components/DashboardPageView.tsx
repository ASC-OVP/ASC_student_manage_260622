import { requireUser } from "@/lib/auth";
import { effectiveClassStatus, parseClassDaysOfWeek } from "@/lib/classGroups";
import { todayKoreaDate } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ButtonLink, PageHeader } from "@/components/ui";

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
  SUBMITTED: "확인",
  REVIEW: "검토",
  REJECTED: "재처리",
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

type Tone = "default" | "warn" | "danger" | "task" | "success";

const DASHBOARD_LIST_LIMIT = 5;
const DASHBOARD_MEMO_LIMIT = 6;

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
    studentMemos,
    classMemos,
    taskComments,
    importantStudentMemoCount,
    openTaskCount,
    openTasks,
    attentionStudents,
    classGroups,
    classTaskCounts,
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
      include: {
        student: {
          include: {
            studentClasses: {
              where: { status: "ACTIVE" },
              include: { classGroup: { select: { id: true, name: true } } },
              take: 2,
            },
          },
        },
        writer: true,
      },
      orderBy: { createdAt: "desc" },
      take: DASHBOARD_MEMO_LIMIT,
    }),
    prisma.classMemo.findMany({
      where: { academyId: user.academyId },
      include: { classGroup: true, writer: true },
      orderBy: { createdAt: "desc" },
      take: DASHBOARD_MEMO_LIMIT,
    }),
    prisma.taskComment.findMany({
      where: { task: { academyId: user.academyId } },
      include: {
        writer: true,
        task: {
          select: {
            id: true,
            title: true,
            student: { select: { name: true } },
            classGroup: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: DASHBOARD_MEMO_LIMIT,
    }),
    prisma.studentMemo.count({ where: { isImportant: true, student: { academyId: user.academyId } } }),
    prisma.task.count({ where: { academyId: user.academyId, status: { not: "DONE" } } }),
    prisma.task.findMany({
      where: { academyId: user.academyId, status: { not: "DONE" } },
      include: { assignee: true, student: true, classGroup: true },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: 8,
    }),
    prisma.student.findMany({
      where: {
        academyId: user.academyId,
        OR: [
          { status: "WATCH" },
          { status: "PAUSED" },
          { status: "LEFT" },
          { memos: { some: { isImportant: true } } },
        ],
      },
      include: {
        studentClasses: {
          where: { status: "ACTIVE" },
          include: { classGroup: { select: { id: true, name: true } } },
          take: 2,
        },
        memos: {
          where: { isImportant: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    prisma.classGroup.findMany({
      where: { academyId: user.academyId },
      select: {
        id: true,
        name: true,
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
        _count: { select: { memos: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.task.groupBy({
      by: ["classGroupId"],
      where: { academyId: user.academyId, status: { not: "DONE" }, classGroupId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const classNameByStudentId = new Map<string, string>();
  const todayStudentIds = new Set<string>();
  for (const classGroup of classGroups) {
    const isTodayClass = isClassOnDate(classGroup, today);
    for (const membership of classGroup.studentClasses) {
      if (!classNameByStudentId.has(membership.studentId)) {
        classNameByStudentId.set(membership.studentId, classGroup.name);
      }
      if (isTodayClass) todayStudentIds.add(membership.studentId);
    }
  }

  const todayTargetStudentCount = todayStudentIds.size;
  const todayClassAttendance = todayAttendance.filter((record) => todayStudentIds.has(record.studentId));
  const todayClassAssignments = todayAssignments.filter((record) => todayStudentIds.has(record.studentId));

  const attendanceChecked = todayClassAttendance.length;
  const attendanceUnchecked = Math.max(todayTargetStudentCount - attendanceChecked, 0);
  const presentCount = todayClassAttendance.filter((record) => record.status === "PRESENT").length;
  const issueAttendance = todayClassAttendance.filter((record) => record.status !== "PRESENT");
  const assignmentChecked = todayClassAssignments.length;
  const assignmentUnchecked = Math.max(todayTargetStudentCount - assignmentChecked, 0);
  const assignmentDone = todayClassAssignments.filter((record) => record.status === "DONE").length;
  const assignmentIssues = todayClassAssignments.filter((record) => record.status === "PARTIAL" || record.status === "MISSING");

  const openTasksByClassId = new Map(classTaskCounts.map((row) => [row.classGroupId ?? "", row._count._all]));

  const recentMemoAlerts = [
    ...studentMemos.map((memo) => ({
      key: `student:${memo.id}`,
      targetType: "학생",
      targetLabel: [memo.student.name, memo.student.studentClasses[0]?.classGroup.name].filter(Boolean).join(" / "),
      href: `/students/${memo.studentId}?tab=memos`,
      content: memo.content,
      writerName: memo.writer.name,
      createdAt: memo.createdAt,
      isImportant: memo.isImportant,
    })),
    ...classMemos.map((memo) => ({
      key: `class:${memo.id}`,
      targetType: "반",
      targetLabel: memo.classGroup.name,
      href: `/classes/${memo.classGroupId}`,
      content: memo.content,
      writerName: memo.writer.name,
      createdAt: memo.createdAt,
      isImportant: false,
    })),
    ...taskComments.map((comment) => ({
      key: `task:${comment.id}`,
      targetType: "업무",
      targetLabel: [comment.task.title, comment.task.student?.name, comment.task.classGroup?.name].filter(Boolean).join(" / "),
      href: `/tasks/${comment.taskId}`,
      content: comment.content,
      writerName: comment.writer.name,
      createdAt: comment.createdAt,
      isImportant: false,
    })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, DASHBOARD_MEMO_LIMIT);

  const priorityItems = [
    openTaskCount > 0
      ? {
          key: "tasks",
          title: "미완료 업무",
          meta: `${openTaskCount}개 업무가 아직 남아 있습니다.`,
          href: "/tasks",
          action: "업무 보기",
          tone: "task" as const,
        }
      : null,
    attendanceUnchecked > 0
      ? {
          key: "attendance",
          title: "오늘 출석 체크 미완료",
          meta: `${attendanceUnchecked}명 미체크 · 확인 ${attendanceChecked}/${todayTargetStudentCount}`,
          href: `/students?date=${today}&tab=attendance`,
          action: "출석 체크",
          tone: "warn" as const,
        }
      : null,
    assignmentUnchecked > 0
      ? {
          key: "assignment",
          title: "오늘 과제 체크 미완료",
          meta: `${assignmentUnchecked}명 미체크 · 완료 ${assignmentDone}/${todayTargetStudentCount}`,
          href: `/students?date=${today}&tab=assignment`,
          action: "과제 체크",
          tone: "warn" as const,
        }
      : null,
    watchStudents > 0
      ? {
          key: "watch",
          title: "주의 학생 확인",
          meta: `${watchStudents}명 주의 상태 · 휴원 ${pausedStudents}명`,
          href: "/students?sort=name",
          action: "학생 확인",
          tone: "danger" as const,
        }
      : null,
    importantStudentMemoCount > 0
      ? {
          key: "memo",
          title: "중요 메모 확인",
          meta: `${importantStudentMemoCount}개 중요 메모가 있습니다.`,
          href: "/memos?important=1",
          action: "메모 확인",
          tone: "warn" as const,
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  const managementStudents = buildManagementStudents({
    attentionStudents,
    issueAttendance,
    assignmentIssues,
    classNameByStudentId,
  });

  const classSignals = classGroups
    .map((classGroup) => {
      const studentIds = classGroup.studentClasses.map((membership) => membership.studentId);
      const todayClass = isClassOnDate(classGroup, today);
      const attendanceCount = todayClass ? todayAttendance.filter((record) => studentIds.includes(record.studentId)).length : 0;
      const assignmentCount = todayClass ? todayAssignments.filter((record) => studentIds.includes(record.studentId)).length : 0;
      const openClassTaskCount = openTasksByClassId.get(classGroup.id) ?? 0;
      const memoCount = classGroup._count.memos;
      const needsCheck =
        (todayClass && studentIds.length > 0 && (attendanceCount < studentIds.length || assignmentCount < studentIds.length)) ||
        openClassTaskCount > 0 ||
        memoCount > 0;

      return {
        id: classGroup.id,
        name: classGroup.name,
        studentCount: studentIds.length,
        todayClass,
        attendanceCount,
        assignmentCount,
        openClassTaskCount,
        memoCount,
        needsCheck,
      };
    })
    .sort((a, b) => Number(b.needsCheck) - Number(a.needsCheck) || Number(b.todayClass) - Number(a.todayClass) || a.name.localeCompare(b.name))
    .slice(0, 6);

  return (
    <main style={page}>
      <section style={container}>
        <div style={header}>
          <PageHeader
            eyebrow="대시보드"
            title={`${user.academy.name} 운영 보드`}
            description={`${today} 기준 학생·반·업무·메모 운영 신호입니다.`}
            actions={
              <div className="asc-action-group">
                <ButtonLink href="/students" size="sm">학생 현황판</ButtonLink>
                <ButtonLink href="/tasks/new" variant="tertiary" size="sm">업무 생성</ButtonLink>
                <ButtonLink href="/memos/new" variant="tertiary" size="sm">메모 추가</ButtonLink>
              </div>
            }
          />
        </div>

        <div style={stats}>
          <Stat href="/students" label="전체 학생" value={`${totalStudents}명`} note={`재원 ${activeStudents}명`} />
          <Stat href="/students?sort=name" label="주의 학생" value={`${watchStudents}명`} note={`휴원 ${pausedStudents}명 · 퇴원 ${leftStudents}명`} tone="warn" />
          <Stat href={`/students?date=${today}&tab=attendance`} label="오늘 출석 체크" value={`${attendanceChecked}/${todayTargetStudentCount}`} note={`현장 ${presentCount}명`} />
          <Stat href={`/students?date=${today}&tab=assignment`} label="오늘 과제 체크" value={`${assignmentChecked}/${todayTargetStudentCount}`} note={`완료 ${assignmentDone}명`} />
          <Stat href="/tasks" label="미완료 업무" value={`${openTaskCount}개`} note="대기·진행·보류" tone="task" />
        </div>

        <div style={focusGrid}>
          <Panel title="오늘 우선 처리" href="/tasks" empty={priorityItems.length === 0} emptyText="오늘 우선 처리할 항목이 없습니다.">
            {priorityItems.map((item) => (
              <PriorityItem key={item.key} title={item.title} meta={item.meta} href={item.href} action={item.action} tone={item.tone} />
            ))}
          </Panel>

          <Panel title="업무 현황" href="/tasks" empty={openTasks.length === 0} emptyText="미완료 업무가 없습니다.">
            {openTasks.slice(0, DASHBOARD_LIST_LIMIT).map((task) => (
              <LineItem
                key={task.id}
                href={`/tasks/${task.id}`}
                title={task.title}
                meta={`${taskStatusText[task.status] ?? task.status} · ${task.assignee.name}${task.student ? ` · ${task.student.name}` : ""}${task.classGroup ? ` · ${task.classGroup.name}` : ""}`}
                tone={task.priority === "URGENT" || task.priority === "HIGH" ? "danger" : "task"}
              />
            ))}
            {openTaskCount > DASHBOARD_LIST_LIMIT && <MoreRow href="/tasks" count={openTaskCount - DASHBOARD_LIST_LIMIT} label="업무" />}
          </Panel>
        </div>

        <div style={bottomGrid}>
          <Panel title="관리 필요 학생" href="/students?sort=name" empty={managementStudents.length === 0} emptyText="현재 관리 필요 학생이 없습니다.">
            {managementStudents.map((student) => (
              <StudentAttentionItem key={student.id} student={student} />
            ))}
          </Panel>

          <Panel title="반별 운영 신호" href="/classes" empty={classSignals.length === 0} emptyText="표시할 반 운영 신호가 없습니다.">
            {classSignals.map((classGroup) => (
              <ClassSignalItem key={classGroup.id} classGroup={classGroup} />
            ))}
          </Panel>

          <Panel
            title="최근 메모"
            href="/memos"
            empty={recentMemoAlerts.length === 0}
            emptyText="최근 확인할 메모가 없습니다."
            emptyActionHref="/memos/new"
            emptyActionLabel="메모 추가"
          >
            {recentMemoAlerts.map((memo) => (
              <MemoAlertItem key={memo.key} memo={memo} />
            ))}
          </Panel>
        </div>
      </section>
    </main>
  );
}

function buildManagementStudents({
  attentionStudents,
  issueAttendance,
  assignmentIssues,
  classNameByStudentId,
}: {
  attentionStudents: Array<{
    id: string;
    name: string;
    status: string;
    studentClasses: Array<{ classGroup: { name: string } }>;
    memos: Array<{ content: string }>;
  }>;
  issueAttendance: Array<{ studentId: string; status: string; student: { id: string; name: string; status: string } }>;
  assignmentIssues: Array<{ studentId: string; status: string; student: { id: string; name: string; status: string } }>;
  classNameByStudentId: Map<string, string>;
}) {
  const rows = new Map<string, { id: string; name: string; className: string; reason: string; status: string; tone: Tone }>();

  for (const student of attentionStudents) {
    const reasons = [];
    if (student.status === "WATCH") reasons.push("수동 주의 학생");
    if (student.status === "PAUSED" || student.status === "LEFT") reasons.push(`${studentStatusText[student.status] ?? student.status} 상태`);
    if (student.memos[0]) reasons.push("중요 메모 있음");

    rows.set(student.id, {
      id: student.id,
      name: student.name,
      className: student.studentClasses[0]?.classGroup.name ?? classNameByStudentId.get(student.id) ?? "반 미지정",
      reason: reasons.join(" · ") || "확인 필요",
      status: studentStatusText[student.status] ?? student.status,
      tone: student.status === "LEFT" ? "danger" : "warn",
    });
  }

  for (const record of issueAttendance) {
    if (rows.has(record.studentId)) continue;
    rows.set(record.studentId, {
      id: record.studentId,
      name: record.student.name,
      className: classNameByStudentId.get(record.studentId) ?? "오늘 수업",
      reason: `출석 확인 필요 · ${attendanceText[record.status] ?? record.status}`,
      status: studentStatusText[record.student.status] ?? record.student.status,
      tone: "warn",
    });
  }

  for (const record of assignmentIssues) {
    if (rows.has(record.studentId)) continue;
    rows.set(record.studentId, {
      id: record.studentId,
      name: record.student.name,
      className: classNameByStudentId.get(record.studentId) ?? "오늘 수업",
      reason: `과제 확인 필요 · ${record.status === "PARTIAL" ? "부분 완료" : "미완료"}`,
      status: studentStatusText[record.student.status] ?? record.student.status,
      tone: "danger",
    });
  }

  return [...rows.values()].slice(0, 6);
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
  emptyActionHref,
  emptyActionLabel,
  children,
}: {
  title: string;
  href: string;
  empty: boolean;
  emptyText: string;
  emptyActionHref?: string;
  emptyActionLabel?: string;
  children: ReactNode;
}) {
  return (
    <section style={panel}>
      <div style={panelHead}>
        <h2 style={panelTitle}>{title}</h2>
        <Link href={href} style={smallLink}>전체 보기</Link>
      </div>
      <div style={list}>
        {empty ? <EmptyState text={emptyText} actionHref={emptyActionHref} actionLabel={emptyActionLabel} /> : children}
      </div>
    </section>
  );
}

function EmptyState({ text, actionHref, actionLabel }: { text: string; actionHref?: string; actionLabel?: string }) {
  return (
    <div style={emptyBox}>
      <p style={emptyStyle}>{text}</p>
      {actionHref && actionLabel && <Link href={actionHref} style={smallGhostButton}>{actionLabel}</Link>}
    </div>
  );
}

function PriorityItem({ title, meta, href, action, tone }: { title: string; meta: string; href: string; action: string; tone: Tone }) {
  return (
    <Link href={href} style={{ ...priorityItem, ...(tone === "danger" ? dangerItem : {}), ...(tone === "warn" ? warnItem : {}), ...(tone === "task" ? taskItem : {}) }}>
      <span style={priorityBody}>
        <b>{title}</b>
        <small>{meta}</small>
      </span>
      <span style={priorityAction}>{action}</span>
    </Link>
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
  tone?: Tone;
}) {
  return (
    <Link href={href} style={lineItem}>
      <span style={{ ...dot, ...(tone === "warn" ? warnDot : {}), ...(tone === "danger" ? dangerDot : {}), ...(tone === "task" ? taskDot : {}), ...(tone === "success" ? successDot : {}) }} />
      <span style={lineText}>
        <b>{title}</b>
        <small>{meta}</small>
      </span>
    </Link>
  );
}

function StudentAttentionItem({
  student,
}: {
  student: { id: string; name: string; className: string; reason: string; status: string; tone: Tone };
}) {
  return (
    <Link href={`/students/${student.id}`} style={compactCard}>
      <span style={compactMain}>
        <b>{student.name}</b>
        <small>{student.className} · {student.reason}</small>
      </span>
      <StatusTag label={student.status} tone={student.tone} />
    </Link>
  );
}

function ClassSignalItem({
  classGroup,
}: {
  classGroup: {
    id: string;
    name: string;
    studentCount: number;
    todayClass: boolean;
    attendanceCount: number;
    assignmentCount: number;
    openClassTaskCount: number;
    memoCount: number;
    needsCheck: boolean;
  };
}) {
  return (
    <Link href={`/classes/${classGroup.id}`} style={compactCard}>
      <span style={compactMain}>
        <b>{classGroup.name}</b>
        <small>
          학생 {classGroup.studentCount}명 · 출석 {classGroup.todayClass ? `${classGroup.attendanceCount}/${classGroup.studentCount}` : "-"} · 과제{" "}
          {classGroup.todayClass ? `${classGroup.assignmentCount}/${classGroup.studentCount}` : "-"}
        </small>
        <small>업무 {classGroup.openClassTaskCount}개 · 메모 {classGroup.memoCount}개</small>
      </span>
      <StatusTag label={classGroup.needsCheck ? "확인 필요" : "정상"} tone={classGroup.needsCheck ? "warn" : "success"} />
    </Link>
  );
}

function MemoAlertItem({
  memo,
}: {
  memo: {
    href: string;
    targetType: string;
    targetLabel: string;
    content: string;
    writerName: string;
    createdAt: Date;
    isImportant: boolean;
  };
}) {
  return (
    <Link href={memo.href} style={memoItem}>
      <span style={memoTopLine}>
        <b>{memo.targetLabel || "기타"}</b>
        <span style={memoBadges}>
          {memo.isImportant && <StatusTag label="중요" tone="danger" />}
          <StatusTag label={memo.targetType} tone="task" />
        </span>
      </span>
      <span style={memoContent}>{clipText(memo.content, 72)}</span>
      <small style={memoMeta}>{memo.writerName} · {formatDate(memo.createdAt)}</small>
    </Link>
  );
}

function StatusTag({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span style={{ ...statusTag, ...(tone === "warn" ? warnTag : {}), ...(tone === "danger" ? dangerTag : {}), ...(tone === "task" ? taskTag : {}), ...(tone === "success" ? successTag : {}) }}>
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

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit" }).format(date);
}

function clipText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

const page: CSSProperties = { padding: 12, color: "var(--asc-text)", background: "var(--asc-bg-subtle)", minHeight: "100vh" };
const container: CSSProperties = { width: "100%", maxWidth: "none", margin: 0, display: "grid", gap: 10 };
const header: CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 };
const stats: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(5, minmax(140px, 1fr))", gap: 8 };
const statCard: CSSProperties = { background: "var(--asc-surface)", border: "1px solid var(--asc-border)", borderRadius: 8, padding: 11, textDecoration: "none", color: "var(--asc-text)", display: "flex", flexDirection: "column", gap: 5, minHeight: 84 };
const warnCard: CSSProperties = { borderColor: "#ffd166", background: "var(--asc-warning-soft)" };
const taskCard: CSSProperties = { borderColor: "#b1cefb", background: "var(--asc-primary-soft)" };
const statLabel: CSSProperties = { color: "var(--asc-text-muted)", fontWeight: 900 };
const statValue: CSSProperties = { fontSize: 21, lineHeight: 1 };
const statNote: CSSProperties = { color: "var(--asc-text-subtle)", fontWeight: 800 };
const focusGrid: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1.55fr) minmax(320px, 1fr)", gap: 10, alignItems: "stretch" };
const bottomGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 };
const panel: CSSProperties = { background: "var(--asc-surface)", border: "1px solid var(--asc-border)", borderRadius: 8, padding: 12, display: "flex", flexDirection: "column" };
const panelHead: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 };
const panelTitle: CSSProperties = { margin: 0, fontSize: 16, fontWeight: 950 };
const smallLink: CSSProperties = { color: "var(--asc-primary)", textDecoration: "none", fontWeight: 900, whiteSpace: "nowrap" };
const list: CSSProperties = { display: "flex", flexDirection: "column", gap: 6, flex: 1 };
const lineItem: CSSProperties = { display: "flex", gap: 8, padding: "7px 0", borderBottom: "1px solid #f3f4f6", color: "#111827", textDecoration: "none" };
const dot: CSSProperties = { width: 9, height: 9, borderRadius: 999, background: "#9ca3af", marginTop: 5, flex: "0 0 auto" };
const warnDot: CSSProperties = { background: "#f59e0b" };
const dangerDot: CSSProperties = { background: "#dc2626" };
const taskDot: CSSProperties = { background: "var(--asc-primary)" };
const successDot: CSSProperties = { background: "#16a34a" };
const lineText: CSSProperties = { display: "flex", flexDirection: "column", gap: 4, minWidth: 0 };
const priorityItem: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: 9, border: "1px solid var(--asc-border)", borderRadius: 8, color: "var(--asc-text)", textDecoration: "none", background: "var(--asc-bg-subtle)" };
const priorityBody: CSSProperties = { display: "flex", flexDirection: "column", gap: 4, minWidth: 0 };
const priorityAction: CSSProperties = { color: "var(--asc-primary)", fontSize: 12, fontWeight: 950, whiteSpace: "nowrap" };
const warnItem: CSSProperties = { background: "var(--asc-warning-soft)", borderColor: "#ffd166" };
const dangerItem: CSSProperties = { background: "var(--asc-danger-soft)", borderColor: "#f5b5a7" };
const taskItem: CSSProperties = { background: "var(--asc-primary-soft)", borderColor: "#b1cefb" };
const compactCard: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, border: "1px solid var(--asc-border)", borderRadius: 8, padding: 9, color: "var(--asc-text)", textDecoration: "none", background: "var(--asc-bg-subtle)" };
const compactMain: CSSProperties = { display: "flex", flexDirection: "column", gap: 4, minWidth: 0 };
const memoItem: CSSProperties = { display: "grid", gap: 5, padding: "10px 0", borderBottom: "1px solid #f3f4f6", color: "#111827", textDecoration: "none" };
const memoTopLine: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" };
const memoBadges: CSSProperties = { display: "inline-flex", gap: 4, alignItems: "center", flexWrap: "wrap" };
const memoContent: CSSProperties = { color: "var(--asc-text-subtle)", lineHeight: 1.35 };
const memoMeta: CSSProperties = { color: "var(--asc-text-muted)", fontWeight: 800 };
const statusTag: CSSProperties = { display: "inline-flex", alignItems: "center", height: 22, borderRadius: 999, background: "var(--asc-bg-subtle)", color: "var(--asc-text-subtle)", padding: "0 8px", fontSize: 11, fontWeight: 950, whiteSpace: "nowrap" };
const warnTag: CSSProperties = { background: "var(--asc-warning-soft)", color: "var(--asc-warning-text)" };
const dangerTag: CSSProperties = { background: "var(--asc-danger-soft)", color: "var(--asc-danger)" };
const taskTag: CSSProperties = { background: "var(--asc-primary-soft)", color: "var(--asc-primary-hover)" };
const successTag: CSSProperties = { background: "var(--asc-success-soft)", color: "var(--asc-success)" };
const moreRow: CSSProperties = { display: "block", marginTop: 2, padding: "9px 10px", borderRadius: 8, background: "var(--asc-primary-soft)", color: "var(--asc-primary-hover)", textDecoration: "none", fontWeight: 950, textAlign: "center", border: "1px solid var(--asc-border)" };
const emptyBox: CSSProperties = { minHeight: 72, display: "grid", placeItems: "center", gap: 6, border: "1px dashed var(--asc-border-subtle)", borderRadius: 8, padding: 12, background: "var(--asc-bg-subtle)", textAlign: "center" };
const emptyStyle: CSSProperties = { margin: 0, color: "var(--asc-text-muted)", fontWeight: 800 };
const smallGhostButton: CSSProperties = { border: "1px solid var(--asc-border-strong)", borderRadius: 8, color: "var(--asc-text)", background: "var(--asc-surface)", padding: "8px 10px", textDecoration: "none", fontWeight: 950 };
