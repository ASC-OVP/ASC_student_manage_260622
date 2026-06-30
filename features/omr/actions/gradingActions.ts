
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { StudentTestScoreSource } from "@/lib/generated/prisma";
import { recordActivity } from "@/lib/activityLog";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { omrHref, safeReturnTo, text } from "@/features/omr/lib/omrForm";
import { gradeOmrUploadInternal } from "@/features/omr/lib/omrGrading";
import { OMR_UPLOAD_STATUSES } from "@/features/omr/lib/omrStatus";

export async function gradeOmrAction(formData: FormData) {
  const user = await requireUser();
  const uploadId = text(formData, "uploadId");
  const returnTo = safeReturnTo(text(formData, "returnTo"));
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
  if (returnTo) revalidatePath(returnTo);
  redirect(returnTo ?? `/omr/uploads/${uploadId}`);
}

export async function gradeSelectedOmrUploadsAction(formData: FormData) {
  const user = await requireUser();
  const examId = text(formData, "examId");
  const scope = text(formData, "scope") || "all";
  const selectedIds = formData.getAll("uploadIds").map((value) => String(value)).filter(Boolean);

  if (scope === "selected" && selectedIds.length === 0) {
    revalidatePath("/omr");
    redirect(examId ? omrHref(examId, { mode: "results" }) : "/omr");
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
  redirect(examId ? omrHref(examId, { mode: "results" }) : "/omr");
}

export async function applyOmrResultsToStudentScoresAction(formData: FormData) {
  const user = await requireUser();
  const examId = text(formData, "examId");
  const confirmOverwrite = text(formData, "confirmOverwrite") === "1";

  if (!examId) return;

  const exam = await prisma.exam.findFirst({
    where: { id: examId, academyId: user.academyId },
    include: {
      classTest: true,
      uploads: {
        include: {
          student: { select: { id: true, name: true } },
          results: { orderBy: { createdAt: "desc" }, take: 1 },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!exam) return;

  const baseRedirect = (params: Record<string, string | number | null | undefined>) => redirect(omrHref(exam.id, { mode: "results", ...params }));
  if (!exam.classGroupId || !exam.classTestId) baseRedirect({ applyError: "missing-test" });

  const unmatchedCount = exam.uploads.filter((upload) => !upload.studentId).length;
  const matchedUploads = exam.uploads.filter((upload) => upload.studentId);
  const missingResultCount = matchedUploads.filter((upload) => upload.results.length === 0).length;
  const studentIdCounts = new Map<string, number>();
  for (const upload of matchedUploads) {
    if (!upload.studentId) continue;
    studentIdCounts.set(upload.studentId, (studentIdCounts.get(upload.studentId) ?? 0) + 1);
  }
  const duplicateCount = [...studentIdCounts.values()].filter((count) => count > 1).length;

  if (exam.uploads.length === 0 || unmatchedCount > 0 || missingResultCount > 0 || duplicateCount > 0) {
    baseRedirect({
      applyError: "not-ready",
      unmatched: unmatchedCount,
      missingResult: missingResultCount,
      duplicates: duplicateCount,
    });
  }

  const scoreRows = matchedUploads.map((upload) => {
    const result = upload.results[0];
    if (!upload.studentId || !result) return null;
    return {
      studentId: upload.studentId,
      resultId: result.id,
      score: result.totalScore,
      totalScore: result.maxScore || exam.totalScore || exam.questionCount,
    };
  }).filter((row): row is { studentId: string; resultId: string; score: number; totalScore: number } => Boolean(row));

  const existingScores = await prisma.studentTestScore.findMany({
    where: { academyId: user.academyId, examId: exam.id, studentId: { in: scoreRows.map((row) => row.studentId) } },
    select: { studentId: true },
  });

  if (existingScores.length > 0 && !confirmOverwrite) {
    baseRedirect({ overwrite: existingScores.length });
  }

  await prisma.$transaction(
    scoreRows.map((row) =>
      prisma.studentTestScore.upsert({
        where: { studentId_examId: { studentId: row.studentId, examId: exam.id } },
        update: {
          classGroupId: exam.classGroupId!,
          classTestId: exam.classTestId!,
          score: row.score,
          totalScore: row.totalScore,
          source: StudentTestScoreSource.OMR,
          omrResultId: row.resultId,
        },
        create: {
          academyId: user.academyId,
          studentId: row.studentId,
          classGroupId: exam.classGroupId!,
          classTestId: exam.classTestId!,
          examId: exam.id,
          classLessonId: exam.classLessonId ?? null,
          score: row.score,
          totalScore: row.totalScore,
          source: StudentTestScoreSource.OMR,
          omrResultId: row.resultId,
        },
      })
    )
  );

  await recordActivity({
    actor: user,
    action: "APPLY",
    entityType: "StudentTestScore",
    entityId: exam.id,
    summary: `OMR results applied to student scores: ${scoreRows.length}` ,
    metadata: { examId: exam.id, classGroupId: exam.classGroupId, classTestId: exam.classTestId, count: scoreRows.length, overwrite: confirmOverwrite },
  });

  revalidatePath("/omr");
  revalidatePath("/students");
  baseRedirect({ applied: scoreRows.length });
}