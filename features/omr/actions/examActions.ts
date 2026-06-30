
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ClassTestType, OmrTemplateType } from "@/lib/generated/prisma";
import { recordActivity } from "@/lib/activityLog";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOmrTemplate } from "@/features/omr/lib/omrTemplates";
import { cleanId, enumValue, intValue, normalizeAnswer, omrHref, optionalText, scoreValue, text } from "@/features/omr/lib/omrForm";
import { deleteStoredOmrFile } from "@/features/omr/lib/omrFileStorage";
import { canManageExam, findExamForUser } from "@/features/omr/lib/omrPermissions";

const OMR_TEMPLATE_TYPES = Object.values(OmrTemplateType) as OmrTemplateType[];

function optionalInt(value: string | undefined, min: number, max: number) {
  if (!value) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

type OmrLessonCandidate = {
  id: string | null;
  position: number;
  title: string;
  lessonDate: string | null;
  startTime: string | null;
  endTime: string | null;
};

type OmrLessonClassGroup = {
  lessons: Array<{ id: string; position: number; title: string; lessonDate: string | null }>;
  startDate: string | null;
  endDate: string | null;
  daysOfWeek: string | null;
  startTime: string | null;
  endTime: string | null;
  schedule: string | null;
};

function resolveOmrTargetLesson(classGroup: OmrLessonClassGroup, targetLessonId: string) {
  const storedById = classGroup.lessons.find((lesson) => lesson.id === targetLessonId);
  if (storedById) return omrStoredLessonCandidate(storedById);

  const position = omrLessonPositionFromKey(targetLessonId);
  if (!position) return null;

  const storedByPosition = classGroup.lessons.find((lesson) => lesson.position === position);
  if (storedByPosition) return omrStoredLessonCandidate(storedByPosition);

  return generatedOmrLessonCandidate(classGroup, position);
}

function omrStoredLessonCandidate(lesson: { id: string; position: number; title: string; lessonDate: string | null }): OmrLessonCandidate {
  return { id: lesson.id, position: lesson.position, title: lesson.title, lessonDate: lesson.lessonDate, startTime: null, endTime: null };
}

function omrLessonPositionFromKey(value: string) {
  const match = /^(?:lesson_|generated_)?(\d{1,3})$/.exec(value);
  if (!match) return null;
  const position = Number(match[1]);
  return Number.isInteger(position) && position >= 1 && position <= 80 ? position : null;
}

function generatedOmrLessonCandidate(classGroup: OmrLessonClassGroup, position: number): OmrLessonCandidate | null {
  const scheduled = generatedOmrLessons(classGroup);
  const lessonDate = scheduled.get(position) ?? null;
  return {
    id: null,
    position,
    title: String(position) + "\uCC28\uC2DC",
    lessonDate,
    startTime: classGroup.startTime ?? null,
    endTime: classGroup.endTime ?? null,
  };
}

function generatedOmrLessons(classGroup: OmrLessonClassGroup) {
  const days = parseOmrDaysOfWeek(classGroup.daysOfWeek, classGroup.schedule);
  const start = parseOmrLocalDate(classGroup.startDate) ?? firstUpcomingOmrClassDate(days);
  const end = parseOmrLocalDate(classGroup.endDate) ?? addOmrDays(start, 90);
  const lessons = new Map<number, string | null>();
  if (!start || !end || days.length === 0) return lessons;

  const daySet = new Set(days);
  for (let cursor = start; cursor <= end && lessons.size < 80; cursor = addOmrDays(cursor, 1)) {
    if (!daySet.has(cursor.getDay())) continue;
    lessons.set(lessons.size + 1, formatOmrDateInput(cursor));
  }
  return lessons;
}

function parseOmrDaysOfWeek(daysOfWeek?: string | null, schedule?: string | null) {
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

function parseOmrLocalDate(value?: string | null) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) {
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addOmrDays(date: Date | null, days: number) {
  const base = date ? new Date(date) : new Date();
  base.setDate(base.getDate() + days);
  return base;
}

function firstUpcomingOmrClassDate(days: number[]) {
  if (days.length === 0) return null;
  const today = new Date();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  for (let offset = 0; offset < 14; offset += 1) {
    const candidate = addOmrDays(base, offset);
    if (days.includes(candidate.getDay())) return candidate;
  }
  return base;
}

function formatOmrDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

export async function createExamAction(formData: FormData) {
  const user = await requireUser();
  if (!canManageExam(user.role)) return;

  const classGroupId = cleanId(text(formData, "classGroupId"));
  const classTestId = cleanId(text(formData, "classTestId"));
  const targetLessonId = text(formData, "targetLessonId");

  if (!classGroupId || !classTestId || !targetLessonId) return;

  const classGroup = await prisma.classGroup.findFirst({
    where: { id: classGroupId, academyId: user.academyId },
    select: {
      id: true,
      name: true,
      subject: true,
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

  if (!classGroup) return;
  if (user.role === "TEACHER" && classGroup.teacherId !== user.id) return;

  const lessonById = new Map(classGroup.lessons.map((lesson) => [lesson.id, lesson]));
  const targetLesson = resolveOmrTargetLesson(classGroup, targetLessonId);
  if (!targetLesson) return;

  const classTest = await prisma.classTest.findFirst({
    where: { id: classTestId, academyId: user.academyId, classGroupId: classGroup.id, active: true },
    select: {
      id: true,
      name: true,
      type: true,
      subject: true,
      classLessonId: true,
      lessonPosition: true,
      totalScore: true,
      questionCount: true,
      templateType: true,
    },
  });

  if (!classTest) return;

  const linkedLesson =
    (classTest.classLessonId ? lessonById.get(classTest.classLessonId) ? omrStoredLessonCandidate(lessonById.get(classTest.classLessonId)!) : null : null) ??
    (classTest.lessonPosition ? resolveOmrTargetLesson(classGroup, "lesson_" + String(classTest.lessonPosition)) : null);

  if (classTest.type === ClassTestType.SINGLE && linkedLesson && linkedLesson.position !== targetLesson.position) return;

  const effectiveLessonInput = classTest.type === ClassTestType.SINGLE ? linkedLesson ?? targetLesson : targetLesson;
  const templateType = enumValue(optionalText(formData, "templateType"), OMR_TEMPLATE_TYPES, classTest.templateType ?? OmrTemplateType.OTHER);
  const template = getOmrTemplate(templateType);
  const questionCount = intValue(optionalText(formData, "questionCount"), classTest.questionCount ?? template.questionCount, 1, 200);
  const totalScore = optionalInt(optionalText(formData, "totalScore"), 1, 1000) ?? classTest.totalScore;

  const exam = await prisma.$transaction(async (tx) => {
    const effectiveLesson = effectiveLessonInput.id
      ? effectiveLessonInput
      : await tx.classLesson.upsert({
          where: { classGroupId_position: { classGroupId: classGroup.id, position: effectiveLessonInput.position } },
          update: {
            title: effectiveLessonInput.title,
            lessonDate: effectiveLessonInput.lessonDate,
            startTime: effectiveLessonInput.startTime,
            endTime: effectiveLessonInput.endTime,
          },
          create: {
            academyId: user.academyId,
            classGroupId: classGroup.id,
            position: effectiveLessonInput.position,
            title: effectiveLessonInput.title,
            lessonDate: effectiveLessonInput.lessonDate,
            startTime: effectiveLessonInput.startTime,
            endTime: effectiveLessonInput.endTime,
          },
        });

    const existingExam = await tx.exam.findFirst({
      where: {
        academyId: user.academyId,
        classGroupId: classGroup.id,
        classTestId: classTest.id,
        OR: [{ classLessonId: effectiveLesson.id }, { lessonPosition: effectiveLesson.position }],
      },
      orderBy: [{ lessonPosition: "asc" }, { createdAt: "asc" }],
    });

    if (existingExam) return existingExam;

    const title = String(effectiveLesson.position) + "\uCC28\uC2DC " + classTest.name;

    return tx.exam.create({
      data: {
        academyId: user.academyId,
        classGroupId: classGroup.id,
        classTestId: classTest.id,
        classLessonId: effectiveLesson.id,
        lessonPosition: effectiveLesson.position,
        title,
        subject: classTest.subject ?? classGroup.subject ?? template.subject,
        examDate: effectiveLesson.lessonDate ?? null,
        templateType,
        questionCount,
        totalScore,
      },
    });
  });

  await recordActivity({
    actor: user,
    action: "CREATE",
    entityType: "Exam",
    entityId: exam.id,
    summary: "OMR exam created: " + exam.title,
    metadata: { templateType: exam.templateType, classGroupId: classGroup.id, classTestId: exam.classTestId, lessonPosition: exam.lessonPosition, questionCount: exam.questionCount },
  });

  revalidatePath("/omr");
  revalidatePath("/students");
  redirect(omrHref(exam.id, { mode: "answers" }));
}

export async function saveAnswerKeyAction(formData: FormData) {
  const user = await requireUser();
  if (!canManageExam(user.role)) return;

  const examId = text(formData, "examId");
  if (!examId) return;

  const exam = await findExamForUser(examId, user.academyId);
  if (!exam) return;

  const template = getOmrTemplate(exam.templateType);
  const questions = template.questions.slice(0, exam.questionCount);

  await prisma.$transaction(
    questions.map((question) => {
      const answer = normalizeAnswer(text(formData, `correct-${question.no}`));
      const score = scoreValue(text(formData, `score-${question.no}`));

      if (!answer) {
        return prisma.examAnswerKey.deleteMany({
          where: { examId, questionNo: question.no },
        });
      }

      return prisma.examAnswerKey.upsert({
        where: { examId_questionNo: { examId, questionNo: question.no } },
        update: { answer, score },
        create: { examId, questionNo: question.no, answer, score },
      });
    })
  );

  await recordActivity({
    actor: user,
    action: "UPDATE",
    entityType: "ExamAnswerKey",
    entityId: examId,
    summary: `정답 저장: ${exam.title}`,
  });

  revalidatePath("/omr");
  redirect(omrHref(examId, { mode: "answers" }));
}

export async function deleteExamAction(formData: FormData) {
  const user = await requireUser();
  if (!canManageExam(user.role)) return;

  const examId = text(formData, "examId");
  if (!examId) return;

  const exam = await prisma.exam.findFirst({
    where: { id: examId, academyId: user.academyId },
    select: {
      id: true,
      title: true,
      uploads: {
        select: {
          id: true,
          filePath: true,
          previewImagePath: true,
        },
      },
    },
  });

  if (!exam) return;

  await prisma.$transaction([
    prisma.examResult.deleteMany({ where: { academyId: user.academyId, examId: exam.id } }),
    prisma.examAnswerKey.deleteMany({ where: { examId: exam.id } }),
    prisma.omrUpload.deleteMany({ where: { academyId: user.academyId, examId: exam.id } }),
    prisma.exam.delete({ where: { id: exam.id } }),
  ]);

  const storedPaths = new Set(
    exam.uploads
      .flatMap((upload) => [upload.filePath, upload.previewImagePath])
      .filter((filePath): filePath is string => Boolean(filePath))
  );
  await Promise.all([...storedPaths].map((filePath) => deleteStoredOmrFile(filePath)));

  await recordActivity({
    actor: user,
    action: "DELETE",
    entityType: "Exam",
    entityId: exam.id,
    summary: `OMR 검사 삭제: ${exam.title}`,
    metadata: { uploadCount: exam.uploads.length, scoreRecordPolicy: "kept" },
  });

  revalidatePath("/omr");
  redirect("/omr");
}
