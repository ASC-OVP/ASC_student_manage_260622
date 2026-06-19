"use server";

import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ExamResultStatus, OmrAnswerStatus, OmrTemplateType } from "@/lib/generated/prisma";
import { recognizeWithPythonOmr, type PythonOmrAnswer } from "@/lib/omrPythonClient";
import { getOmrTemplate, omrTemplateList } from "@/lib/omrTemplates";
import { OMR_MAX_BATCH_BYTES, OMR_MAX_FILE_BYTES } from "@/lib/omrUploadLimits";
import { recordActivity } from "@/lib/activityLog";

const ANSWER_STATUSES = Object.values(OmrAnswerStatus) as OmrAnswerStatus[];
const TEMPLATE_TYPES = omrTemplateList.map((template) => template.type);
const OMR_UPLOAD_STATUSES = {
  WAITING: "WAITING",
  NEEDS_PHONE: "NEEDS_PHONE",
  MATCHED: "MATCHED",
  MULTIPLE_MATCHES: "MULTIPLE_MATCHES",
  NOT_FOUND: "NOT_FOUND",
  MANUAL: "MANUAL",
  RECOGNIZING: "RECOGNIZING",
  REVIEW_NEEDED: "REVIEW_NEEDED",
  RECOGNIZED: "RECOGNIZED",
  FAILED: "FAILED",
  GRADED: "GRADED",
  GRADED_REVIEW_NEEDED: "GRADED_REVIEW_NEEDED",
} as const;

const PHONE_RECOGNIZE_STATUSES = {
  WAITING: "WAITING",
  OK: "OK",
  LOW_CONFIDENCE: "LOW_CONFIDENCE",
  FAILED: "FAILED",
  MANUAL: "MANUAL",
} as const;

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return value ? String(value).trim() : "";
}

function optionalText(formData: FormData, key: string) {
  const value = text(formData, key);
  return value.length > 0 ? value : undefined;
}

function cleanId(value?: string | null) {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed !== "none" && trimmed !== "-" ? trimmed : undefined;
}

function enumValue<T extends string>(value: string | undefined, values: readonly T[], fallback: T) {
  return value && values.includes(value as T) ? (value as T) : fallback;
}

function scoreValue(value?: string) {
  if (!value) return 1;
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 ? Math.round(score) : 1;
}

function normalizeAnswer(value?: string) {
  if (!value) return null;
  const compact = value.replace(/\s+/g, "").toUpperCase();
  return compact.length > 0 ? compact.slice(0, 20) : null;
}

function phoneLast8(value?: string | null) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8) return null;
  return digits.slice(-8);
}

function normalizePhoneRecognizeStatus(status?: string | null, last8?: string | null) {
  if (status === PHONE_RECOGNIZE_STATUSES.OK) return PHONE_RECOGNIZE_STATUSES.OK;
  if (status === PHONE_RECOGNIZE_STATUSES.LOW_CONFIDENCE) return PHONE_RECOGNIZE_STATUSES.LOW_CONFIDENCE;
  if (status === PHONE_RECOGNIZE_STATUSES.MANUAL) return PHONE_RECOGNIZE_STATUSES.MANUAL;
  if (status === PHONE_RECOGNIZE_STATUSES.FAILED) return PHONE_RECOGNIZE_STATUSES.FAILED;
  return last8 ? PHONE_RECOGNIZE_STATUSES.OK : PHONE_RECOGNIZE_STATUSES.FAILED;
}

function withoutRecognitionNotes(value: string | null | undefined) {
  return value?.replace(/\n?Recognition (error|log): [\s\S]+$/i, "") || undefined;
}

function omrHref(examId: string, params?: Record<string, string | number | null | undefined>) {
  const searchParams = new URLSearchParams({ examId });
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== null && value !== undefined && value !== "") {
      searchParams.set(key, String(value));
    }
  }
  return `/omr?${searchParams.toString()}`;
}

function mapPythonStatus(status: PythonOmrAnswer["status"]) {
  if (status === "OK") return OmrAnswerStatus.RECOGNIZED;
  if (status === "BLANK") return OmrAnswerStatus.BLANK;
  if (status === "MULTI_MARK") return OmrAnswerStatus.MULTIPLE;
  return OmrAnswerStatus.REVIEW_NEEDED;
}

function sanitizeFileName(fileName: string) {
  const ext = path.extname(fileName).toLowerCase().replace(/[^a-z0-9.]/g, "");
  const base = path.basename(fileName, path.extname(fileName)).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "omr";
  return `${Date.now()}-${randomUUID()}-${base}${ext || ".bin"}`;
}

function storedOmrPathToDiskPath(filePath: string | null | undefined) {
  if (!filePath || filePath.startsWith("http://") || filePath.startsWith("https://")) return null;

  const relativePath = filePath.replace(/^\/+/, "");
  if (!relativePath.startsWith("uploads/omr/")) return null;

  const omrRoot = path.resolve(process.cwd(), "public", "uploads", "omr");
  const diskPath = path.resolve(process.cwd(), "public", relativePath);
  if (diskPath !== omrRoot && !diskPath.startsWith(`${omrRoot}${path.sep}`)) return null;

  return diskPath;
}

async function deleteStoredOmrFile(filePath: string | null | undefined) {
  const diskPath = storedOmrPathToDiskPath(filePath);
  if (!diskPath) return;

  try {
    await unlink(diskPath);
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
    if (code !== "ENOENT") {
      console.warn(`Failed to delete OMR file ${diskPath}`, error);
    }
  }
}

function canManageExam(role: string) {
  return role === "ADMIN" || role === "MANAGER" || role === "TEACHER";
}

async function findExamForUser(examId: string, academyId: string) {
  return prisma.exam.findFirst({
    where: { id: examId, academyId },
    include: { answerKeys: true },
  });
}

async function matchStudentByPhoneLast8(academyId: string, last8: string | null, manualStudentId?: string) {
  if (manualStudentId) {
    const student = await prisma.student.findFirst({
      where: { id: manualStudentId, academyId },
      select: { id: true },
    });
    return {
      studentId: student?.id ?? null,
      matchStatus: student ? OMR_UPLOAD_STATUSES.MANUAL : OMR_UPLOAD_STATUSES.NOT_FOUND,
    };
  }

  if (!last8) {
    return { studentId: null, matchStatus: OMR_UPLOAD_STATUSES.NEEDS_PHONE };
  }

  const students = await prisma.student.findMany({
    where: { academyId },
    select: { id: true, phone: true, parentPhone: true },
  });
  const matches = students.filter((student) => phoneLast8(student.phone) === last8 || phoneLast8(student.parentPhone) === last8);

  if (matches.length === 1) {
    return { studentId: matches[0].id, matchStatus: OMR_UPLOAD_STATUSES.MATCHED };
  }

  if (matches.length > 1) {
    return { studentId: null, matchStatus: OMR_UPLOAD_STATUSES.MULTIPLE_MATCHES };
  }

  return { studentId: null, matchStatus: OMR_UPLOAD_STATUSES.NOT_FOUND };
}

export async function createExamAction(formData: FormData) {
  const user = await requireUser();
  if (!canManageExam(user.role)) return;

  const templateType = enumValue(optionalText(formData, "templateType"), TEMPLATE_TYPES, OmrTemplateType.OTHER);
  const template = getOmrTemplate(templateType);
  const title = text(formData, "title");
  const subject = optionalText(formData, "subject") ?? template.subject;
  const examDate = optionalText(formData, "examDate");

  if (!title) return;

  const exam = await prisma.exam.create({
    data: {
      academyId: user.academyId,
      title,
      subject,
      examDate,
      templateType,
      questionCount: template.questionCount,
    },
  });

  await recordActivity({
    actor: user,
    action: "CREATE",
    entityType: "Exam",
    entityId: exam.id,
    summary: `시험 생성: ${title}`,
    metadata: { templateType, subject, examDate },
  });

  revalidatePath("/omr");
  redirect(`/omr?examId=${exam.id}`);
}

export async function saveAnswerKeyAction(formData: FormData) {
  const user = await requireUser();
  if (!canManageExam(user.role)) return;

  const examId = text(formData, "examId");
  if (!examId) return;

  const exam = await findExamForUser(examId, user.academyId);
  if (!exam) return;

  const template = getOmrTemplate(exam.templateType);

  await prisma.$transaction(
    template.questions.map((question) => {
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
  redirect(`/omr?examId=${examId}`);
}

export async function uploadOmrAction(formData: FormData) {
  const user = await requireUser();
  const examId = text(formData, "examId");
  const files = formData
    .getAll("files")
    .concat(formData.getAll("file"))
    .filter((value): value is File => value instanceof File && value.size > 0);
  const memo = optionalText(formData, "memo");

  if (!examId || files.length === 0) return;

  const exam = await prisma.exam.findFirst({ where: { id: examId, academyId: user.academyId } });

  if (!exam) return;

  const totalUploadBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalUploadBytes > OMR_MAX_BATCH_BYTES) {
    redirect(omrHref(exam.id, { uploadError: "batch-too-large" }));
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "omr");
  await mkdir(uploadDir, { recursive: true });

  let firstUploadId: string | null = null;
  let skippedLargeFiles = 0;

  for (const [index, file] of files.entries()) {
    if (file.size > OMR_MAX_FILE_BYTES) {
      skippedLargeFiles += 1;
      continue;
    }

    const storedFileName = sanitizeFileName(file.name || "omr-upload");
    const diskPath = path.join(uploadDir, storedFileName);
    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(diskPath, bytes);

    const last8 = phoneLast8(text(formData, `phoneLast8-${index}`) || text(formData, `phone-${index}`));
    const manualStudentId = cleanId(text(formData, `studentId-${index}`) || text(formData, "studentId"));
    const match = await matchStudentByPhoneLast8(user.academyId, last8, manualStudentId);
    const uploadStatus = match.studentId ? "UPLOADED" : match.matchStatus;

    const upload = await prisma.omrUpload.create({
      data: {
        academyId: user.academyId,
        studentId: match.studentId,
        examId: exam.id,
        templateType: exam.templateType,
        fileName: file.name || storedFileName,
        fileType: file.type || "application/octet-stream",
        fileSize: file.size,
        filePath: `/uploads/omr/${storedFileName}`,
        memo,
        status: uploadStatus,
      },
    });

    await prisma.$executeRaw`
      UPDATE "OmrUpload"
      SET "phoneLast8" = ${last8},
          "phoneRecognizeStatus" = ${last8 ? PHONE_RECOGNIZE_STATUSES.MANUAL : PHONE_RECOGNIZE_STATUSES.WAITING},
          "matchStatus" = ${match.matchStatus},
          "recognizeStatus" = ${OMR_UPLOAD_STATUSES.WAITING},
          "gradingStatus" = ${OMR_UPLOAD_STATUSES.WAITING}
      WHERE "id" = ${upload.id}
    `;

    firstUploadId ??= upload.id;
  }

  if (!firstUploadId && skippedLargeFiles > 0) {
    redirect(omrHref(exam.id, { uploadError: "file-too-large", skipped: skippedLargeFiles }));
  }

  await recordActivity({
    actor: user,
    action: "CREATE",
    entityType: "OmrUpload",
    entityId: firstUploadId,
    summary: `OMR 업로드: ${files.length}개`,
    metadata: { examId: exam.id, fileCount: files.length },
  });

  revalidatePath("/omr");
  redirect(
    firstUploadId
      ? omrHref(exam.id, { uploadId: firstUploadId, uploadWarning: skippedLargeFiles > 0 ? "file-too-large" : null, skipped: skippedLargeFiles || null })
      : omrHref(exam.id)
  );
}

export async function updateOmrUploadMatchAction(formData: FormData) {
  const user = await requireUser();
  const uploadId = text(formData, "uploadId");
  if (!uploadId) return;

  const upload = await prisma.omrUpload.findFirst({
    where: { id: uploadId, academyId: user.academyId },
    select: { id: true, examId: true },
  });

  if (!upload) return;

  const last8 = phoneLast8(text(formData, "phoneLast8"));
  const manualStudentId = cleanId(text(formData, "studentId"));
  const match = await matchStudentByPhoneLast8(user.academyId, last8, manualStudentId);

  await prisma.omrUpload.update({
    where: { id: upload.id },
    data: {
      studentId: match.studentId,
      status: match.studentId ? "UPLOADED" : match.matchStatus,
    },
  });
  await prisma.$executeRaw`
    UPDATE "OmrUpload"
    SET "phoneLast8" = ${last8},
        "phoneRecognizeStatus" = ${PHONE_RECOGNIZE_STATUSES.MANUAL},
        "matchStatus" = ${match.matchStatus}
    WHERE "id" = ${upload.id}
  `;

  revalidatePath("/omr");
  redirect(upload.examId ? `/omr?examId=${upload.examId}&uploadId=${upload.id}` : `/omr?uploadId=${upload.id}`);
}

export async function updateOmrUploadSetupAction(formData: FormData) {
  const user = await requireUser();
  const uploadId = text(formData, "uploadId");
  if (!uploadId) return;

  const upload = await prisma.omrUpload.findFirst({
    where: { id: uploadId, academyId: user.academyId },
    select: { id: true, examId: true, templateType: true },
  });

  if (!upload) return;

  const nextExamId = cleanId(text(formData, "examId"));
  const nextExam = nextExamId
    ? await prisma.exam.findFirst({
        where: { id: nextExamId, academyId: user.academyId },
        select: { id: true, templateType: true },
      })
    : null;
  const nextTemplateType = enumValue(optionalText(formData, "templateType"), TEMPLATE_TYPES, nextExam?.templateType ?? upload.templateType);

  await prisma.omrUpload.update({
    where: { id: upload.id },
    data: {
      examId: nextExam?.id ?? upload.examId,
      templateType: nextTemplateType,
    },
  });

  const redirectExamId = nextExam?.id ?? upload.examId;
  revalidatePath("/omr");
  redirect(redirectExamId ? `/omr?examId=${redirectExamId}&uploadId=${upload.id}` : `/omr?uploadId=${upload.id}`);
}

export async function deleteOmrUploadAction(formData: FormData) {
  const user = await requireUser();
  const uploadId = text(formData, "uploadId");
  const examId = text(formData, "examId");

  if (!uploadId) return;

  const upload = await prisma.omrUpload.findFirst({
    where: { id: uploadId, academyId: user.academyId },
    select: {
      id: true,
      examId: true,
      fileName: true,
      filePath: true,
      previewImagePath: true,
    },
  });

  if (!upload) return;

  await prisma.omrUpload.delete({ where: { id: upload.id } });
  await Promise.all([deleteStoredOmrFile(upload.filePath), deleteStoredOmrFile(upload.previewImagePath)]);

  await recordActivity({
    actor: user,
    action: "DELETE",
    entityType: "OmrUpload",
    entityId: upload.id,
    summary: `OMR 업로드 삭제: ${upload.fileName}`,
  });

  const nextExamId = upload.examId ?? examId;
  revalidatePath("/omr");
  redirect(nextExamId ? `/omr?examId=${nextExamId}` : "/omr");
}

async function recognizeOmrUploadInternal(uploadId: string, academyId: string) {
  const upload = await prisma.omrUpload.findFirst({
    where: { id: uploadId, academyId },
    include: { exam: true },
  });

  if (!upload || !upload.exam) return { examId: null as string | null, uploadId };

  const template = getOmrTemplate(upload.templateType);
  let recognizedAnswers: Array<{
    questionNo: number;
    recognizedAnswer: string | null;
    confidence: number;
    status: OmrAnswerStatus;
  }>;
  let recognitionFailed = false;
  let recognitionError: string | null = null;
  let recognitionLogs: string[] = [];
  let previewImagePath: string | null = null;
  let recognitionEngine: string | null = null;
  let recognizedPhoneLast8 = upload.phoneLast8;
  let phoneRecognizeStatus: string = PHONE_RECOGNIZE_STATUSES.WAITING;
  let nextStudentId = upload.studentId;
  let nextMatchStatus = upload.matchStatus;

  await prisma.$executeRaw`
    UPDATE "OmrUpload"
    SET "recognizeStatus" = ${OMR_UPLOAD_STATUSES.RECOGNIZING}
    WHERE "id" = ${upload.id}
  `;

  try {
    const result = await recognizeWithPythonOmr(upload.filePath, upload.templateType);
    const pythonPhoneLast8 = phoneLast8(result.phoneLast8);
    phoneRecognizeStatus = normalizePhoneRecognizeStatus(result.phoneRecognizeStatus, pythonPhoneLast8);
    if (pythonPhoneLast8) {
      const match = await matchStudentByPhoneLast8(upload.academyId, pythonPhoneLast8);
      recognizedPhoneLast8 = pythonPhoneLast8;
      nextStudentId = match.studentId;
      nextMatchStatus = match.matchStatus;
    } else if (!recognizedPhoneLast8) {
      nextStudentId = null;
      nextMatchStatus = OMR_UPLOAD_STATUSES.NEEDS_PHONE;
    }
    previewImagePath = result.previewImagePath ?? null;
    recognitionEngine = result.engine?.name ?? null;
    recognitionLogs = [
      ...(result.logs ?? []),
      ...(result.warnings ?? []).map((warning) => `warning=${warning}`),
      result.engine
        ? `engine=${result.engine.name}, opencv=${Boolean(result.engine.usesOpenCV)}, omrChecker=${Boolean(result.engine.usesOmrChecker)}, formScanner=${Boolean(result.engine.usesFormScanner)}`
        : "",
    ].filter(Boolean);
    recognizedAnswers = result.answers.map((answer) => ({
      questionNo: answer.questionNo,
      recognizedAnswer: normalizeAnswer(answer.recognizedAnswer ?? undefined),
      confidence: answer.confidence ?? 0,
      status: mapPythonStatus(answer.status),
    }));
  } catch (error) {
    recognitionFailed = true;
    phoneRecognizeStatus = recognizedPhoneLast8 ? PHONE_RECOGNIZE_STATUSES.MANUAL : PHONE_RECOGNIZE_STATUSES.FAILED;
    recognitionError = error instanceof Error ? error.message : String(error);
    console.error("OMR recognition failed", error);
    recognizedAnswers = template.questions.map((question) => ({
      questionNo: question.no,
      recognizedAnswer: null,
      confidence: 0,
      status: OmrAnswerStatus.REVIEW_NEEDED,
    }));
  }

  const reviewNeeded = recognizedAnswers.some((answer) =>
    answer.status === OmrAnswerStatus.REVIEW_NEEDED || answer.status === OmrAnswerStatus.MULTIPLE
  );

  await prisma.$transaction([
    prisma.omrRecognizedAnswer.deleteMany({ where: { omrUploadId: upload.id } }),
    ...recognizedAnswers.map((answer) =>
      prisma.omrRecognizedAnswer.create({
        data: {
          omrUploadId: upload.id,
          questionNo: answer.questionNo,
          recognizedAnswer: answer.recognizedAnswer,
          correctedAnswer: null,
          confidence: answer.confidence,
          status: answer.status,
        },
      })
    ),
    prisma.omrUpload.update({
      where: { id: upload.id },
      data: {
        studentId: nextStudentId,
        status: !nextStudentId ? "MATCH_REQUIRED" : recognitionFailed ? "MANUAL_REVIEW_READY" : reviewNeeded ? "RECOGNIZED_REVIEW_NEEDED" : "RECOGNIZED",
        previewImagePath,
        recognitionEngine,
        recognitionLog: recognitionFailed ? recognitionError : recognitionLogs.join("\n") || null,
        memo: withoutRecognitionNotes(upload.memo),
      },
    }),
  ]);

  await prisma.$executeRaw`
    UPDATE "OmrUpload"
    SET "phoneLast8" = ${recognizedPhoneLast8},
        "phoneRecognizeStatus" = ${phoneRecognizeStatus},
        "matchStatus" = ${nextMatchStatus},
        "recognizeStatus" = ${recognitionFailed ? OMR_UPLOAD_STATUSES.REVIEW_NEEDED : reviewNeeded ? OMR_UPLOAD_STATUSES.REVIEW_NEEDED : OMR_UPLOAD_STATUSES.RECOGNIZED},
        "gradingStatus" = ${OMR_UPLOAD_STATUSES.WAITING}
    WHERE "id" = ${upload.id}
  `;

  return { examId: upload.exam.id, uploadId: upload.id };
}

export async function recognizeOmrAction(formData: FormData) {
  const user = await requireUser();
  const uploadId = text(formData, "uploadId");
  if (!uploadId) return;

  const result = await recognizeOmrUploadInternal(uploadId, user.academyId);

  await recordActivity({
    actor: user,
    action: "RECOGNIZE",
    entityType: "OmrUpload",
    entityId: uploadId,
    summary: `OMR 인식 실행`,
  });

  revalidatePath("/omr");
  redirect(result.examId ? `/omr?examId=${result.examId}&uploadId=${result.uploadId}` : "/omr");
}

export async function recognizeSelectedOmrUploadsAction(formData: FormData) {
  const user = await requireUser();
  const examId = text(formData, "examId");
  const scope = text(formData, "scope") || "all";
  const selectedIds = formData.getAll("uploadIds").map((value) => String(value)).filter(Boolean);

  if (scope === "selected" && selectedIds.length === 0) {
    revalidatePath("/omr");
    redirect(examId ? `/omr?examId=${examId}` : "/omr");
  }

  const uploads = await prisma.omrUpload.findMany({
    where: {
      academyId: user.academyId,
      ...(examId ? { examId } : {}),
      ...(scope === "selected" ? { id: { in: selectedIds } } : selectedIds.length > 0 ? { id: { in: selectedIds } } : {}),
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  for (const upload of uploads) {
    try {
      await recognizeOmrUploadInternal(upload.id, user.academyId);
    } catch (error) {
      console.error(`OMR recognition failed for upload ${upload.id}`, error);
      await prisma.omrUpload.update({ where: { id: upload.id }, data: { status: "MANUAL_REVIEW_READY" } });
      await prisma.$executeRaw`
        UPDATE "OmrUpload"
        SET "recognizeStatus" = ${OMR_UPLOAD_STATUSES.REVIEW_NEEDED}
        WHERE "id" = ${upload.id}
      `;
    }
  }

  await recordActivity({
    actor: user,
    action: "RECOGNIZE",
    entityType: "OmrUpload",
    summary: `OMR 일괄 인식 실행: ${uploads.length}개`,
    metadata: { examId: examId || null, uploadIds: uploads.map((upload) => upload.id) },
  });

  revalidatePath("/omr");
  redirect(examId ? `/omr?examId=${examId}` : "/omr");
}

export async function gradeOmrAction(formData: FormData) {
  const user = await requireUser();
  const uploadId = text(formData, "uploadId");
  if (!uploadId) return;

  const result = await gradeOmrUploadInternal(uploadId, user.academyId, formData);

  if (!result) return;

  await recordActivity({
    actor: user,
    action: "GRADE",
    entityType: "OmrUpload",
    entityId: uploadId,
    summary: `OMR 채점 저장: ${result.studentName} / ${result.examTitle} / ${result.totalScore}점`,
    metadata: {
      studentId: result.studentId,
      examId: result.examId,
      correctCount: result.correctCount,
      wrongCount: result.wrongCount,
      blankCount: result.blankCount,
      reviewNeededCount: result.reviewNeededCount,
      totalScore: result.totalScore,
      maxScore: result.maxScore,
    },
  });

  revalidatePath("/omr");
  revalidatePath("/students");
  revalidatePath(`/students/${result.studentId}`);
  redirect(`/omr?examId=${result.examId}&uploadId=${uploadId}`);
}

export async function gradeSelectedOmrUploadsAction(formData: FormData) {
  const user = await requireUser();
  const examId = text(formData, "examId");
  const scope = text(formData, "scope") || "all";
  const selectedIds = formData.getAll("uploadIds").map((value) => String(value)).filter(Boolean);

  if (scope === "selected" && selectedIds.length === 0) {
    revalidatePath("/omr");
    redirect(examId ? `/omr?examId=${examId}` : "/omr");
  }

  const uploads = await prisma.omrUpload.findMany({
    where: {
      academyId: user.academyId,
      ...(examId ? { examId } : {}),
      ...(scope === "selected" ? { id: { in: selectedIds } } : selectedIds.length > 0 ? { id: { in: selectedIds } } : {}),
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  let savedCount = 0;
  let skippedCount = 0;

  for (const upload of uploads) {
    try {
      const result = await gradeOmrUploadInternal(upload.id, user.academyId);
      if (result) {
        savedCount += 1;
      } else {
        skippedCount += 1;
      }
    } catch (error) {
      skippedCount += 1;
      console.error(`OMR grading failed for upload ${upload.id}`, error);
      await prisma.$executeRaw`
        UPDATE "OmrUpload"
        SET "gradingStatus" = ${OMR_UPLOAD_STATUSES.REVIEW_NEEDED}
        WHERE "id" = ${upload.id}
      `;
    }
  }

  await recordActivity({
    actor: user,
    action: "GRADE",
    entityType: "OmrUpload",
    summary: `OMR 일괄 채점/성적 등록: ${savedCount}건 저장, ${skippedCount}건 건너뜀`,
    metadata: { examId: examId || null, uploadIds: uploads.map((upload) => upload.id), savedCount, skippedCount },
  });

  revalidatePath("/omr");
  revalidatePath("/students");
  redirect(examId ? `/omr?examId=${examId}` : "/omr");
}

async function gradeOmrUploadInternal(uploadId: string, academyId: string, formData?: FormData) {
  const upload = await prisma.omrUpload.findFirst({
    where: { id: uploadId, academyId },
    include: { exam: { include: { answerKeys: true } }, student: true, recognizedAnswers: true },
  });

  if (!upload || !upload.exam || !upload.student || !upload.examId) return null;

  const exam = upload.exam;
  const student = upload.student;

  const template = getOmrTemplate(upload.templateType);
  if (!formData && exam.answerKeys.length === 0) return null;

  const answerKeyByNo = new Map(exam.answerKeys.map((key) => [key.questionNo, key]));
  const recognizedByNo = new Map(upload.recognizedAnswers.map((answer) => [answer.questionNo, answer]));
  const resultItems = template.questions.map((question) => {
    const recognized = recognizedByNo.get(question.no);
    const dbAnswer = recognized?.finalAnswer ?? recognized?.correctedAnswer ?? recognized?.recognizedAnswer ?? undefined;
    const studentAnswer = formData ? normalizeAnswer(text(formData, `student-${question.no}`)) : normalizeAnswer(dbAnswer);
    const correctAnswer = formData
      ? normalizeAnswer(text(formData, `correct-${question.no}`)) ?? answerKeyByNo.get(question.no)?.answer ?? null
      : answerKeyByNo.get(question.no)?.answer ?? null;
    const statusInput = formData
      ? enumValue(optionalText(formData, `status-${question.no}`), ANSWER_STATUSES, studentAnswer ? OmrAnswerStatus.MANUAL : OmrAnswerStatus.BLANK)
      : recognized?.correctedAnswer || recognized?.finalAnswer
        ? OmrAnswerStatus.MANUAL
        : recognized?.status ?? (studentAnswer ? OmrAnswerStatus.RECOGNIZED : OmrAnswerStatus.BLANK);
    const point = formData ? scoreValue(text(formData, `score-${question.no}`) || String(answerKeyByNo.get(question.no)?.score ?? 1)) : answerKeyByNo.get(question.no)?.score ?? 1;
    const confidence = recognized?.confidence ?? (statusInput === OmrAnswerStatus.RECOGNIZED ? 0.8 : 1);
    const lowConfidenceWrong = Boolean(studentAnswer && correctAnswer && confidence <= 0.5 && statusInput !== OmrAnswerStatus.MANUAL);
    const itemStatus = lowConfidenceWrong ? ExamResultStatus.WRONG : resultStatus(studentAnswer, correctAnswer, statusInput);
    const isCorrect = itemStatus === ExamResultStatus.CORRECT;

    return {
      questionNo: question.no,
      studentAnswer,
      correctAnswer,
      answerStatus: lowConfidenceWrong
        ? OmrAnswerStatus.REVIEW_NEEDED
        : studentAnswer
          ? statusInput === OmrAnswerStatus.REVIEW_NEEDED
            ? OmrAnswerStatus.MANUAL
            : statusInput
          : OmrAnswerStatus.BLANK,
      confidence,
      isCorrect,
      status: itemStatus,
      score: isCorrect ? point : 0,
      maxScore: correctAnswer ? point : 0,
      answerKeyScore: point,
    };
  });

  const totalScore = resultItems.reduce((sum, item) => sum + item.score, 0);
  const maxScore = resultItems.reduce((sum, item) => sum + item.maxScore, 0);
  const correctCount = resultItems.filter((item) => item.status === ExamResultStatus.CORRECT).length;
  const wrongCount = resultItems.filter((item) => item.status === ExamResultStatus.WRONG).length;
  const blankCount = resultItems.filter((item) => item.status === ExamResultStatus.BLANK).length;
  const reviewNeededCount = resultItems.filter((item) => item.status === ExamResultStatus.REVIEW_NEEDED || item.status === ExamResultStatus.MULTIPLE).length;
  const scoreDate = exam.examDate || new Date().toISOString().slice(0, 10);
  const scoreTitle = `${exam.title} OMR`;

  await prisma.$transaction(async (tx) => {
    await tx.examResult.deleteMany({ where: { academyId, omrUploadId: upload.id } });

    for (const item of resultItems) {
      if (item.correctAnswer) {
        await tx.examAnswerKey.upsert({
          where: { examId_questionNo: { examId: exam.id, questionNo: item.questionNo } },
          update: { answer: item.correctAnswer, score: item.answerKeyScore },
          create: { examId: exam.id, questionNo: item.questionNo, answer: item.correctAnswer, score: item.answerKeyScore },
        });
      }

      await tx.omrRecognizedAnswer.upsert({
        where: { omrUploadId_questionNo: { omrUploadId: upload.id, questionNo: item.questionNo } },
        update: {
          correctedAnswer: item.studentAnswer,
          confidence: item.confidence,
          status: item.answerStatus,
        },
        create: {
          omrUploadId: upload.id,
          questionNo: item.questionNo,
          recognizedAnswer: item.studentAnswer,
          correctedAnswer: item.studentAnswer,
          confidence: item.confidence,
          status: item.answerStatus,
        },
      });

      await tx.$executeRaw`
        UPDATE "OmrRecognizedAnswer"
        SET "finalAnswer" = ${item.studentAnswer}
        WHERE "omrUploadId" = ${upload.id} AND "questionNo" = ${item.questionNo}
      `;
    }

    const result = await tx.examResult.create({
      data: {
        academyId,
        studentId: student.id,
        examId: exam.id,
        omrUploadId: upload.id,
        totalScore,
        maxScore,
        correctCount,
        wrongCount,
        blankCount,
        reviewNeededCount,
      },
    });

    await tx.examResultItem.createMany({
      data: resultItems.map((item) => ({
        examResultId: result.id,
        questionNo: item.questionNo,
        studentAnswer: item.studentAnswer,
        correctAnswer: item.correctAnswer,
        isCorrect: item.isCorrect,
        status: item.status,
        score: item.score,
      })),
    });

    await tx.scoreRecord.upsert({
      where: {
        studentId_date_title: {
          studentId: student.id,
          date: scoreDate,
          title: scoreTitle,
        },
      },
      update: {
        score: totalScore,
        maxScore: maxScore || template.questionCount,
        memo: `OMR grading ${correctCount}/${template.questionCount}, review ${reviewNeededCount}`,
      },
      create: {
        academyId,
        studentId: student.id,
        date: scoreDate,
        title: scoreTitle,
        score: totalScore,
        maxScore: maxScore || template.questionCount,
        memo: `OMR grading ${correctCount}/${template.questionCount}, review ${reviewNeededCount}`,
      },
    });

    await tx.omrUpload.update({
      where: { id: upload.id },
      data: { status: reviewNeededCount > 0 ? "GRADED_REVIEW_NEEDED" : "GRADED" },
    });
    await tx.$executeRaw`
      UPDATE "OmrUpload"
      SET "gradingStatus" = ${reviewNeededCount > 0 ? OMR_UPLOAD_STATUSES.GRADED_REVIEW_NEEDED : OMR_UPLOAD_STATUSES.GRADED},
          "recognizeStatus" = CASE
            WHEN "recognizeStatus" = ${OMR_UPLOAD_STATUSES.FAILED} THEN ${OMR_UPLOAD_STATUSES.REVIEW_NEEDED}
            ELSE ${OMR_UPLOAD_STATUSES.RECOGNIZED}
          END
      WHERE "id" = ${upload.id}
    `;
  });

  return {
    examId: exam.id,
    examTitle: exam.title,
    studentId: student.id,
    studentName: student.name,
    totalScore,
    maxScore,
    correctCount,
    wrongCount,
    blankCount,
    reviewNeededCount,
  };
}

function resultStatus(studentAnswer: string | null, correctAnswer: string | null, status: OmrAnswerStatus) {
  if (status === OmrAnswerStatus.MULTIPLE) return ExamResultStatus.MULTIPLE;
  if (!studentAnswer) return ExamResultStatus.BLANK;
  if (!correctAnswer) return ExamResultStatus.REVIEW_NEEDED;
  return studentAnswer === correctAnswer ? ExamResultStatus.CORRECT : ExamResultStatus.WRONG;
}
