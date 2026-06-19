import type { ClassGroupStatus } from "@/lib/generated/prisma";
import { todayKoreaDate } from "@/lib/date";

export type ClassGroupUser = {
  id: string;
  academyId: string;
  role: string;
};

export type EffectiveClassStatus = "UPCOMING" | "ACTIVE" | "PAUSED" | "ENDED";

type ClassPeriodLike = {
  startDate?: string | null;
  endDate?: string | null;
  daysOfWeek?: string | null;
  status?: ClassGroupStatus | string | null;
};

export function classGroupWhereForUser(user: ClassGroupUser) {
  if (user.role === "TEACHER") {
    return { academyId: user.academyId, teacherId: user.id };
  }

  if (user.role === "ASSISTANT") {
    return {
      academyId: user.academyId,
      OR: [
        { assistantId: user.id },
        { classAssistants: { some: { assistantId: user.id } } },
        { studentClasses: { some: { student: { assistantId: user.id } } } },
      ],
    };
  }

  return { academyId: user.academyId };
}

export function canManageClassGroups(role: string) {
  return role === "ADMIN" || role === "MANAGER" || role === "TEACHER";
}

export function canManageClassGroup(user: ClassGroupUser, classGroup: { teacherId: string | null }) {
  if (user.role === "ADMIN" || user.role === "MANAGER") return true;
  if (user.role === "TEACHER") return classGroup.teacherId === user.id;
  return false;
}

export function canViewClassGroup(
  user: ClassGroupUser,
  classGroup: {
    teacherId: string | null;
    assistantId?: string | null;
    classAssistants?: Array<{ assistantId: string }>;
    studentClasses?: Array<{ student?: { assistantId?: string | null } }>;
  }
) {
  if (user.role === "ADMIN" || user.role === "MANAGER") return true;
  if (user.role === "TEACHER") return classGroup.teacherId === user.id;
  if (user.role === "ASSISTANT") {
    return (
      classGroup.assistantId === user.id ||
      Boolean(classGroup.classAssistants?.some((link) => link.assistantId === user.id)) ||
      Boolean(classGroup.studentClasses?.some((membership) => membership.student?.assistantId === user.id))
    );
  }
  return false;
}

export function effectiveClassStatus(classGroup: ClassPeriodLike, today = todayKoreaDate()): EffectiveClassStatus {
  if (classGroup.status === "PAUSED") return "PAUSED";
  if (classGroup.status === "ENDED") return "ENDED";
  if (classGroup.startDate && today < classGroup.startDate) return "UPCOMING";
  if (classGroup.endDate && today > classGroup.endDate) return "ENDED";
  if (classGroup.status === "UPCOMING" && !classGroup.startDate) return "UPCOMING";
  return "ACTIVE";
}

export function classStatusLabel(status: ClassGroupStatus | EffectiveClassStatus | string | null | undefined) {
  if (status === "UPCOMING") return "운영 예정";
  if (status === "PAUSED") return "휴강";
  if (status === "ENDED") return "종료";
  return "운영중";
}

export function classStatusTone(status: ClassGroupStatus | EffectiveClassStatus | string | null | undefined) {
  if (status === "UPCOMING") return "#2563eb";
  if (status === "PAUSED") return "#f59e0b";
  if (status === "ENDED") return "#6b7280";
  return "#059669";
}

export function formatOperatingPeriod(classGroup: { startDate?: string | null; endDate?: string | null }) {
  if (!classGroup.startDate && !classGroup.endDate) return "-";
  return `${classGroup.startDate ?? "시작 미정"} ~ ${classGroup.endDate ?? "종료 미정"}`;
}

export function formatClassSchedule(classGroup: {
  daysOfWeek?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  schedule?: string | null;
}) {
  const time = [classGroup.startTime, classGroup.endTime].filter(Boolean).join("~");
  return [classGroup.daysOfWeek, time].filter(Boolean).join(" ") || classGroup.schedule || "-";
}

export function parseClassDaysOfWeek(value: string | null | undefined) {
  if (!value) return [];

  const lower = value.toLowerCase();
  const days = new Set<number>();
  const tokens: Array<[RegExp, number]> = [
    [/일|sun|sunday|\b0\b/g, 0],
    [/월|mon|monday|\b1\b/g, 1],
    [/화|tue|tuesday|\b2\b/g, 2],
    [/수|wed|wednesday|\b3\b/g, 3],
    [/목|thu|thursday|\b4\b/g, 4],
    [/금|fri|friday|\b5\b/g, 5],
    [/토|sat|saturday|\b6\b/g, 6],
  ];

  for (const [pattern, day] of tokens) {
    if (pattern.test(lower)) days.add(day);
  }

  return [...days].sort();
}

export function computeClassOperationStats(classGroup: ClassPeriodLike, today = todayKoreaDate()) {
  if (!classGroup.startDate || !classGroup.endDate) {
    return {
      totalWeeks: null,
      currentWeek: null,
      totalSessions: null,
      pastSessions: null,
      remainingSessions: null,
    };
  }

  const start = dateFromYmd(classGroup.startDate);
  const end = dateFromYmd(classGroup.endDate);
  const current = dateFromYmd(today);

  if (!start || !end || !current || start.getTime() > end.getTime()) {
    return {
      totalWeeks: null,
      currentWeek: null,
      totalSessions: null,
      pastSessions: null,
      remainingSessions: null,
    };
  }

  const totalWeeks = Math.max(1, Math.ceil((diffDays(start, end) + 1) / 7));
  const currentWeek =
    current.getTime() < start.getTime()
      ? 0
      : current.getTime() > end.getTime()
        ? totalWeeks
        : Math.min(totalWeeks, Math.max(1, Math.ceil((diffDays(start, current) + 1) / 7)));

  const daysOfWeek = parseClassDaysOfWeek(classGroup.daysOfWeek);
  if (daysOfWeek.length === 0) {
    return {
      totalWeeks,
      currentWeek,
      totalSessions: null,
      pastSessions: null,
      remainingSessions: null,
    };
  }

  const totalSessions = countSessions(start, end, daysOfWeek);
  const pastEnd = new Date(Math.min(current.getTime(), end.getTime()));
  const pastSessions = current.getTime() < start.getTime() ? 0 : countSessions(start, pastEnd, daysOfWeek);

  return {
    totalWeeks,
    currentWeek,
    totalSessions,
    pastSessions,
    remainingSessions: Math.max(0, totalSessions - pastSessions),
  };
}

function countSessions(start: Date, end: Date, daysOfWeek: number[]) {
  let count = 0;
  for (let cursor = new Date(start); cursor.getTime() <= end.getTime(); cursor = addDays(cursor, 1)) {
    if (daysOfWeek.includes(cursor.getDay())) count += 1;
  }
  return count;
}

function dateFromYmd(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

function diffDays(start: Date, end: Date) {
  const ms = stripTime(end).getTime() - stripTime(start).getTime();
  return Math.round(ms / 86_400_000);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function stripTime(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
