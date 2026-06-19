import type { CSSProperties } from "react";
import AcademyCalendar, { type AcademyCalendarEvent } from "@/components/AcademyCalendar";
import { requireUser } from "@/lib/auth";
import {
  classGroupWhereForUser,
  classStatusLabel,
  classStatusTone,
  effectiveClassStatus,
  formatClassSchedule,
  formatOperatingPeriod,
  parseClassDaysOfWeek,
} from "@/lib/classGroups";
import { prisma } from "@/lib/prisma";
import type { TaskStatus } from "@/lib/generated/prisma";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const user = await requireUser();

  const [classGroups, tasks, classRoomRows, taskStartRows] = await Promise.all([
    prisma.classGroup.findMany({
      where: classGroupWhereForUser(user),
      orderBy: [{ status: "asc" }, { name: "asc" }],
      include: {
        teacher: { select: { id: true, name: true } },
        assistant: { select: { id: true, name: true } },
        classAssistants: {
          orderBy: { createdAt: "asc" },
          include: { assistant: { select: { id: true, name: true } } },
        },
        _count: { select: { studentClasses: true } },
      },
    }),
    prisma.task.findMany({
      where: taskWhereForCalendar(user),
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      include: {
        assignee: { select: { id: true, name: true } },
        classGroup: { select: { id: true, name: true, subject: true, teacherId: true, teacher: { select: { id: true, name: true } } } },
        student: { select: { id: true, name: true, teacherId: true } },
      },
    }),
    prisma.$queryRaw<Array<{ id: string; room: string | null }>>`SELECT "id", "room" FROM "ClassGroup" WHERE "academyId" = ${user.academyId}`,
    prisma.$queryRaw<Array<{ id: string; startDate: Date | string | null }>>`SELECT "id", "startDate" FROM "Task" WHERE "academyId" = ${user.academyId}`,
  ]);

  const roomByClassId = new Map(classRoomRows.map((row) => [row.id, row.room]));
  const startDateByTaskId = new Map(taskStartRows.map((row) => [row.id, coerceDate(row.startDate)]));
  const classGroupsWithRoom = classGroups.map((classGroup) => ({ ...classGroup, room: roomByClassId.get(classGroup.id) ?? null }));
  const tasksWithStartDate = tasks.map((task) => ({ ...task, startDate: startDateByTaskId.get(task.id) ?? null }));

  const classEvents = classGroupsWithRoom.flatMap((classGroup) => classEventsFromClassGroup(classGroup));
  const taskEvents = tasksWithStartDate.map((task) => taskEvent(task));
  const events = [...classEvents, ...taskEvents];
  const overdueCount = tasks.filter((task) => effectiveTaskStatus(task.status, task.dueDate) === "OVERDUE").length;
  const activeClassCount = classGroups.filter((classGroup) => effectiveClassStatus(classGroup) === "ACTIVE").length;

  return (
    <main style={page}>
      <section style={container}>
        <header style={header}>
          <div>
            <p style={eyebrow}>캘린더</p>
            <h1 style={title}>운영 일정 캘린더</h1>
            <p style={desc}>반 수업 반복 일정과 업무 시작일/마감일을 한 화면에서 확인합니다.</p>
          </div>
          <div style={summaryStrip}>
            <Stat label="수업 일정" value={`${classEvents.length}개`} />
            <Stat label="운영중 반" value={`${activeClassCount}개`} />
            <Stat label="업무 일정" value={`${taskEvents.length}개`} />
            <Stat label="지연 업무" value={`${overdueCount}개`} tone={overdueCount ? "danger" : "default"} />
          </div>
        </header>

        <AcademyCalendar
          events={events}
          teachers={uniqueOptions([
            ...classGroupsWithRoom.map((classGroup) => classGroup.teacher && { id: classGroup.teacher.id, label: classGroup.teacher.name }),
            ...tasksWithStartDate.map((task) => task.classGroup?.teacher && { id: task.classGroup.teacher.id, label: task.classGroup.teacher.name }),
          ])}
          assistants={uniqueOptions([
            ...classGroupsWithRoom.flatMap((classGroup) =>
              classGroup.classAssistants.length > 0
                ? classGroup.classAssistants.map((link) => ({ id: link.assistant.id, label: link.assistant.name }))
                : classGroup.assistant
                  ? [{ id: classGroup.assistant.id, label: classGroup.assistant.name }]
                  : []
            ),
            ...tasksWithStartDate.map((task) => ({ id: task.assignee.id, label: task.assignee.name })),
          ])}
          classGroups={classGroupsWithRoom.map((classGroup) => ({ id: classGroup.id, label: classGroup.name }))}
          subjects={uniqueOptions([
            ...classGroupsWithRoom.map((classGroup) => (classGroup.subject ? { id: classGroup.subject, label: classGroup.subject } : null)),
            ...tasksWithStartDate.map((task) => (task.classGroup?.subject ? { id: task.classGroup.subject, label: task.classGroup.subject } : null)),
          ])}
          statuses={uniqueOptions([
            ...classGroupsWithRoom.map((classGroup) => {
              const status = effectiveClassStatus(classGroup);
              return { id: status, label: classStatusLabel(status) };
            }),
            ...tasksWithStartDate.map((task) => {
              const status = effectiveTaskStatus(task.status, task.dueDate);
              return { id: status, label: taskStatusLabel(status) };
            }),
          ])}
        />
      </section>
    </main>
  );
}

function taskWhereForCalendar(user: { id: string; academyId: string; role: string }) {
  if (user.role === "ASSISTANT") {
    return { academyId: user.academyId, assigneeId: user.id };
  }

  if (user.role === "TEACHER") {
    return {
      academyId: user.academyId,
      OR: [
        { creatorId: user.id },
        { assigneeId: user.id },
        { classGroup: { teacherId: user.id } },
        { student: { teacherId: user.id } },
      ],
    };
  }

  return { academyId: user.academyId };
}

function classEventsFromClassGroup(classGroup: {
  id: string;
  name: string;
  subject: string | null;
  grade: string | null;
  daysOfWeek: string | null;
  startTime: string | null;
  endTime: string | null;
  startDate: string | null;
  endDate: string | null;
  room: string | null;
  schedule: string | null;
  description: string | null;
  status: string;
  teacher: { id: string; name: string } | null;
  assistant: { id: string; name: string } | null;
  classAssistants: Array<{ assistantId: string; assistant: { id: string; name: string } }>;
  _count: { studentClasses: number };
}): AcademyCalendarEvent[] {
  const effectiveStatus = effectiveClassStatus(classGroup);
  if (effectiveStatus === "PAUSED") return [];

  const daysOfWeek = parseClassDaysOfWeek(classGroup.daysOfWeek);
  if (daysOfWeek.length === 0) return [];

  const assistantNames =
    classGroup.classAssistants.length > 0
      ? classGroup.classAssistants.map((link) => link.assistant.name).join(", ")
      : classGroup.assistant?.name ?? null;
  const firstAssistant = classGroup.classAssistants[0]?.assistant ?? classGroup.assistant;
  const color = classStatusTone(effectiveStatus);

  return [
    {
      id: `class-${classGroup.id}`,
      title: classGroup.name,
      daysOfWeek,
      startTime: classGroup.startTime || "09:00",
      endTime: classGroup.endTime || undefined,
      startRecur: classGroup.startDate || isoDate(addDays(new Date(), -120)),
      endRecur: classGroup.endDate || isoDate(addDays(new Date(), 240)),
      backgroundColor: color,
      borderColor: color,
      textColor: "#fff",
      extendedProps: {
        type: "class",
        sourceId: classGroup.id,
        teacherId: classGroup.teacher?.id ?? null,
        teacherName: classGroup.teacher?.name ?? null,
        assistantId: firstAssistant?.id ?? null,
        assistantName: assistantNames,
        classGroupId: classGroup.id,
        className: classGroup.name,
        subject: classGroup.subject,
        grade: classGroup.grade,
        room: classGroup.room,
        status: effectiveStatus,
        description: classGroup.description,
        studentCount: classGroup._count.studentClasses,
        scheduleText: `${formatClassSchedule(classGroup)} · ${formatOperatingPeriod(classGroup)}`,
        operationPeriod: formatOperatingPeriod(classGroup),
      },
    },
  ];
}

function taskEvent(task: {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: string;
  startDate: Date | null;
  dueDate: Date | null;
  createdAt: Date;
  assignee: { id: string; name: string };
  classGroup: { id: string; name: string; subject: string | null; teacherId: string | null; teacher: { id: string; name: string } | null } | null;
  student: { id: string; name: string; teacherId: string | null } | null;
}): AcademyCalendarEvent {
  const range = normalizeTaskRange(task.startDate, task.dueDate, task.createdAt);
  const status = effectiveTaskStatus(task.status, task.dueDate);
  const color = taskColor(status);

  return {
    id: `task-${task.id}`,
    title: task.title,
    start: range.start,
    end: range.end,
    allDay: true,
    backgroundColor: color,
    borderColor: color,
    textColor: "#fff",
    extendedProps: {
      type: "task",
      sourceId: task.id,
      assigneeId: task.assignee.id,
      assigneeName: task.assignee.name,
      teacherId: task.classGroup?.teacher?.id ?? task.classGroup?.teacherId ?? task.student?.teacherId ?? null,
      teacherName: task.classGroup?.teacher?.name ?? null,
      classGroupId: task.classGroup?.id ?? null,
      className: task.classGroup?.name ?? null,
      studentName: task.student?.name ?? null,
      subject: task.classGroup?.subject ?? null,
      status,
      priority: task.priority,
      description: task.description,
      scheduleText: `${formatDate(task.startDate ?? range.startDate)} 시작 -> ${formatDate(task.dueDate ?? range.endDate)} 마감`,
    },
  };
}

function normalizeTaskRange(startDate: Date | null, dueDate: Date | null, createdAt: Date) {
  const start = stripTime(startDate ?? dueDate ?? createdAt);
  const endBase = stripTime(dueDate ?? startDate ?? createdAt);
  const orderedStart = start.getTime() <= endBase.getTime() ? start : endBase;
  const orderedEnd = start.getTime() <= endBase.getTime() ? endBase : start;

  return {
    start: isoDate(orderedStart),
    end: isoDate(addDays(orderedEnd, 1)),
    startDate: orderedStart,
    endDate: orderedEnd,
  };
}

function effectiveTaskStatus(status: TaskStatus | string, dueDate: Date | null) {
  if (status !== "DONE" && dueDate && dueDate.getTime() < Date.now()) return "OVERDUE";
  return status;
}

function taskColor(status: string) {
  if (status === "DONE") return "#16a34a";
  if (status === "IN_PROGRESS") return "#2563eb";
  if (status === "HOLD") return "#d97706";
  if (status === "OVERDUE") return "#dc2626";
  return "#64748b";
}

function taskStatusLabel(status: string) {
  if (status === "TODO") return "해야 함";
  if (status === "IN_PROGRESS") return "진행 중";
  if (status === "DONE") return "완료";
  if (status === "HOLD") return "보류";
  if (status === "OVERDUE") return "지연";
  return status;
}

function uniqueOptions(items: Array<{ id: string; label: string } | null | undefined>) {
  const map = new Map<string, string>();
  for (const item of items) {
    if (item?.id && !map.has(item.id)) map.set(item.id, item.label);
  }
  return [...map.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label, "ko"));
}

function coerceDate(value: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function stripTime(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit" }).format(date);
}

function Stat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "danger" }) {
  return (
    <div style={{ ...stat, ...(tone === "danger" ? dangerStat : {}) }}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

const page: CSSProperties = { padding: 20, color: "#111827", background: "#f3f4f6", minHeight: "100vh" };
const container: CSSProperties = { maxWidth: 1700, margin: "0 auto", display: "grid", gap: 12 };
const header: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-end",
  border: "1px solid #dfe3ea",
  borderRadius: 10,
  background: "#fff",
  padding: 16,
};
const eyebrow: CSSProperties = { margin: "0 0 4px", color: "#2563eb", fontWeight: 950, fontSize: 12 };
const title: CSSProperties = { margin: 0, fontSize: 28, fontWeight: 950 };
const desc: CSSProperties = { margin: "6px 0 0", color: "#6b7280", fontSize: 14 };
const summaryStrip: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" };
const stat: CSSProperties = { minWidth: 102, border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px", display: "grid", gap: 3, background: "#fff" };
const dangerStat: CSSProperties = { borderColor: "#fecaca", background: "#fef2f2", color: "#991b1b" };
