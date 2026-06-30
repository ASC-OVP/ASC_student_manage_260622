"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ClassTestType } from "@/lib/generated/prisma";
import { recordActivity } from "@/lib/activityLog";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const CLASS_TEST_TYPES = Object.values(ClassTestType) as ClassTestType[];
const maxGeneratedLessons = 80;

type ManageableClassGroup = NonNullable<Awaited<ReturnType<typeof findManageableClassGroup>>>;

type ClassLessonCandidate = {
  id: string | null;
  position: number;
  title: string;
  lessonDate: string | null;
  startTime: string | null;
  endTime: string | null;
};

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return value ? String(value).trim() : "";
}

function optionalText(formData: FormData, key: string) {
  const value = text(formData, key);
  return value.length > 0 ? value : null;
}

function cleanId(value: string | null | undefined) {
  if (!value) return null;
  return /^[A-Za-z0-9_-]{1,100}$/.test(value) ? value : null;
}

function intOptional(value: string | null, min: number, max: number) {
  if (!value) return null;
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) return null;
  return Math.min(max, Math.max(min, numeric));
}

function enumValue<T extends string>(value: string | null, allowed: readonly T[], fallback: T) {
  return value && allowed.includes(value as T) ? (value as T) : fallback;
}

async function findManageableClassGroup(user: Awaited<ReturnType<typeof requireUser>>, classGroupId: string | null) {
  if (!classGroupId) return null;
  const classGroup = await prisma.classGroup.findFirst({
    where: { id: classGroupId, academyId: user.academyId },
    select: {
      id: true,
      teacherId: true,
      startDate: true,
      endDate: true,
      daysOfWeek: true,
      startTime: true,
      endTime: true,
      schedule: true,
      lessons: { orderBy: { position: "asc" }, select: { id: true, position: true, title: true, lessonDate: true } },
    },
  });
  if (!classGroup) return null;
  if (user.role === "TEACHER" && classGroup.teacherId !== user.id) return null;
  return classGroup;
}

function lessonPositionFromKey(value: string | null) {
  if (!value) return null;
  const match = /^(?:lesson_|generated_)?(\d{1,3})$/.exec(value);
  if (!match) return null;
  const position = Number(match[1]);
  return Number.isInteger(position) && position >= 1 && position <= maxGeneratedLessons ? position : null;
}

function lessonCandidateForPayload(classGroup: ManageableClassGroup, lessonId: string | null, lessonPosition: number | null) {
  const requestedPosition = lessonPosition ?? lessonPositionFromKey(lessonId);
  const storedLesson =
    (lessonId ? classGroup.lessons.find((lesson) => lesson.id === lessonId) ?? null : null) ??
    (requestedPosition ? classGroup.lessons.find((lesson) => lesson.position === requestedPosition) ?? null : null);

  if (storedLesson) {
    return {
      id: storedLesson.id,
      position: storedLesson.position,
      title: storedLesson.title,
      lessonDate: storedLesson.lessonDate,
      startTime: null,
      endTime: null,
    } satisfies ClassLessonCandidate;
  }

  if (!requestedPosition) return null;
  const lessonDate = generatedLessonDates(classGroup).get(requestedPosition) ?? null;
  return {
    id: null,
    position: requestedPosition,
    title: String(requestedPosition) + "\uCC28\uC2DC",
    lessonDate,
    startTime: classGroup.startTime ?? null,
    endTime: classGroup.endTime ?? null,
  } satisfies ClassLessonCandidate;
}

async function ensureClassLesson(classGroup: ManageableClassGroup, lesson: ClassLessonCandidate, academyId: string) {
  if (lesson.id) return lesson;
  const stored = await prisma.classLesson.upsert({
    where: { classGroupId_position: { classGroupId: classGroup.id, position: lesson.position } },
    update: {
      title: lesson.title,
      lessonDate: lesson.lessonDate,
      startTime: lesson.startTime,
      endTime: lesson.endTime,
    },
    create: {
      academyId,
      classGroupId: classGroup.id,
      position: lesson.position,
      title: lesson.title,
      lessonDate: lesson.lessonDate,
      startTime: lesson.startTime,
      endTime: lesson.endTime,
    },
    select: { id: true, position: true, title: true, lessonDate: true },
  });
  return { ...lesson, id: stored.id, position: stored.position, title: stored.title, lessonDate: stored.lessonDate };
}

async function linkedLessonForClassTestPayload(classGroup: ManageableClassGroup, lessonId: string | null, lessonPosition: number | null, academyId: string) {
  const candidate = lessonCandidateForPayload(classGroup, lessonId, lessonPosition);
  return candidate ? ensureClassLesson(classGroup, candidate, academyId) : null;
}

function generatedLessonDates(classGroup: ManageableClassGroup) {
  const days = parseDaysOfWeek(classGroup.daysOfWeek, classGroup.schedule);
  const start = parseLocalDate(classGroup.startDate) ?? firstUpcomingClassDate(days);
  const end = parseLocalDate(classGroup.endDate) ?? addDays(start, 90);
  const lessons = new Map<number, string | null>();
  if (!start || !end || days.length === 0) return lessons;

  const daySet = new Set(days);
  for (let cursor = start; cursor <= end && lessons.size < maxGeneratedLessons; cursor = addDays(cursor, 1)) {
    if (!daySet.has(cursor.getDay())) continue;
    lessons.set(lessons.size + 1, formatDateInput(cursor));
  }
  return lessons;
}

function parseDaysOfWeek(daysOfWeek?: string | null, schedule?: string | null) {
  const source = String(daysOfWeek ?? "") + " " + String(schedule ?? "");
  const days = new Set<number>();
  const koreanDayMap: Record<string, number> = { "\uC77C": 0, "\uC6D4": 1, "\uD654": 2, "\uC218": 3, "\uBAA9": 4, "\uAE08": 5, "\uD1A0": 6 };
  for (const char of source) {
    if (char in koreanDayMap) days.add(koreanDayMap[char]);
  }
  const tokenMap: Record<string, number> = {
    sun: 0,
    sunday: 0,
    mon: 1,
    monday: 1,
    tue: 2,
    tues: 2,
    tuesday: 2,
    wed: 3,
    wednesday: 3,
    thu: 4,
    thur: 4,
    thurs: 4,
    thursday: 4,
    fri: 5,
    friday: 5,
    sat: 6,
    saturday: 6,
  };
  for (const token of source.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
    if (token in tokenMap) days.add(tokenMap[token]);
    const numeric = Number(token);
    if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 6) days.add(numeric);
  }
  return [...days].sort((a, b) => a - b);
}

function parseLocalDate(value?: string | null) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) {
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date: Date | null, days: number) {
  const base = date ? new Date(date) : new Date();
  base.setDate(base.getDate() + days);
  return base;
}

function firstUpcomingClassDate(days: number[]) {
  if (days.length === 0) return null;
  const today = new Date();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  for (let offset = 0; offset < 14; offset += 1) {
    const candidate = addDays(base, offset);
    if (days.includes(candidate.getDay())) return candidate;
  }
  return base;
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function classTestPayload(formData: FormData) {
  const name = text(formData, "name").slice(0, 80);
  const type = enumValue(optionalText(formData, "type"), CLASS_TEST_TYPES, ClassTestType.SINGLE);
  const lessonId = cleanId(optionalText(formData, "lessonId"));
  const lessonPosition = intOptional(optionalText(formData, "lessonPosition"), 1, 200);
  return { name, type, lessonId, lessonPosition };
}

export async function createClassTestAction(formData: FormData) {
  const user = await requireUser();
  if (!["ADMIN", "MANAGER", "TEACHER"].includes(user.role)) return;

  const classGroupId = cleanId(text(formData, "classGroupId"));
  const classGroup = await findManageableClassGroup(user, classGroupId);
  const payload = classTestPayload(formData);
  if (!classGroup || !payload.name) return;

  const linkedLesson =
    payload.type === ClassTestType.SINGLE
      ? await linkedLessonForClassTestPayload(classGroup, payload.lessonId, payload.lessonPosition, user.academyId)
      : null;

  if (payload.type === ClassTestType.SINGLE && !linkedLesson) return;

  const classTest = await prisma.classTest.create({
    data: {
      academyId: user.academyId,
      classGroupId: classGroup.id,
      classLessonId: linkedLesson?.id ?? null,
      lessonPosition: linkedLesson?.position ?? null,
      name: payload.name,
      type: payload.type,
      active: true,
    },
  });

  await recordActivity({
    actor: user,
    action: "CREATE",
    entityType: "ClassTest",
    entityId: classTest.id,
    summary: "Class test created: " + payload.name,
    metadata: { classGroupId: classGroup.id, type: payload.type, lessonPosition: linkedLesson?.position ?? null },
  });

  revalidatePath("/students");
  revalidatePath("/omr");
  redirect("/students?classGroupId=" + encodeURIComponent(classGroup.id) + "&testId=" + encodeURIComponent(classTest.id));
}

export async function updateClassTestAction(formData: FormData) {
  const user = await requireUser();
  if (!["ADMIN", "MANAGER", "TEACHER"].includes(user.role)) return;

  const classTestId = cleanId(text(formData, "classTestId"));
  const classGroupId = cleanId(text(formData, "classGroupId"));
  const classGroup = await findManageableClassGroup(user, classGroupId);
  const payload = classTestPayload(formData);
  if (!classTestId || !classGroup || !payload.name) return;

  const existing = await prisma.classTest.findFirst({
    where: { id: classTestId, academyId: user.academyId, classGroupId: classGroup.id },
    select: { id: true },
  });
  if (!existing) return;

  const linkedLesson =
    payload.type === ClassTestType.SINGLE
      ? await linkedLessonForClassTestPayload(classGroup, payload.lessonId, payload.lessonPosition, user.academyId)
      : null;
  if (payload.type === ClassTestType.SINGLE && !linkedLesson) return;

  const active = formData.get("active") === "1" || formData.get("active") === "on";

  await prisma.classTest.update({
    where: { id: classTestId },
    data: {
      classLessonId: linkedLesson?.id ?? null,
      lessonPosition: linkedLesson?.position ?? null,
      name: payload.name,
      type: payload.type,
      active,
    },
  });

  await recordActivity({
    actor: user,
    action: "UPDATE",
    entityType: "ClassTest",
    entityId: classTestId,
    summary: "Class test updated: " + payload.name,
    metadata: { classGroupId: classGroup.id, type: payload.type, lessonPosition: linkedLesson?.position ?? null, active },
  });

  revalidatePath("/students");
  revalidatePath("/omr");
  redirect("/students?classGroupId=" + encodeURIComponent(classGroup.id) + "&testId=" + encodeURIComponent(classTestId));
}

export async function deactivateClassTestAction(formData: FormData) {
  const user = await requireUser();
  if (!["ADMIN", "MANAGER", "TEACHER"].includes(user.role)) return;

  const classTestId = cleanId(text(formData, "classTestId"));
  const classGroupId = cleanId(text(formData, "classGroupId"));
  const classGroup = await findManageableClassGroup(user, classGroupId);
  if (!classTestId || !classGroup) return;

  const existing = await prisma.classTest.findFirst({
    where: { id: classTestId, academyId: user.academyId, classGroupId: classGroup.id },
    select: { id: true, name: true },
  });
  if (!existing) return;

  await prisma.classTest.update({ where: { id: classTestId }, data: { active: false } });

  await recordActivity({
    actor: user,
    action: "UPDATE",
    entityType: "ClassTest",
    entityId: classTestId,
    summary: "Class test deactivated: " + existing.name,
    metadata: { classGroupId: classGroup.id },
  });

  revalidatePath("/students");
  revalidatePath("/omr");
  redirect("/students?classGroupId=" + encodeURIComponent(classGroup.id));
}
