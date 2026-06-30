
"use server";

import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordActivity } from "@/lib/activityLog";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OMR_MAX_BATCH_BYTES, OMR_MAX_FILE_BYTES } from "@/features/omr/lib/omrUploadLimits";
import { omrHref, optionalText, text } from "@/features/omr/lib/omrForm";
import { deleteStoredOmrFile, sanitizeFileName } from "@/features/omr/lib/omrFileStorage";
import { recognizeOmrUploadInternal } from "@/features/omr/lib/omrRecognitionRunner";
import { isOmrAutoRecognizeEnabled, OMR_UPLOAD_STATUSES, PHONE_RECOGNIZE_STATUSES } from "@/features/omr/lib/omrStatus";

export async function uploadOmrAction(formData: FormData) {
  const user = await requireUser();
  const examId = text(formData, "examId");
  const files = formData
    .getAll("files")
    .concat(formData.getAll("file"))
    .filter((value): value is File => value instanceof File && value.size > 0);
  const memo = optionalText(formData, "memo");

  if (!examId || files.length === 0) return;

  const exam = await prisma.exam.findFirst({
    where: { id: examId, academyId: user.academyId },
    include: { answerKeys: true },
  });

  if (!exam) return;

  const totalUploadBytes = files
    .filter((file) => file.size <= OMR_MAX_FILE_BYTES)
    .reduce((sum, file) => sum + file.size, 0);
  if (totalUploadBytes > OMR_MAX_BATCH_BYTES) {
    redirect(omrHref(exam.id, { mode: "upload", uploadError: "batch-too-large" }));
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "omr");
  await mkdir(uploadDir, { recursive: true });

  const createdUploadIds: string[] = [];
  let skippedLargeFiles = 0;

  for (const file of files) {
    if (file.size > OMR_MAX_FILE_BYTES) {
      skippedLargeFiles += 1;
      continue;
    }

    const storedFileName = sanitizeFileName(file.name || "omr-upload");
    const diskPath = path.join(uploadDir, storedFileName);
    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(diskPath, bytes);

    const upload = await prisma.omrUpload.create({
      data: {
        academyId: user.academyId,
        studentId: null,
        examId: exam.id,
        templateType: exam.templateType,
        fileName: file.name || storedFileName,
        fileType: file.type || "application/octet-stream",
        fileSize: file.size,
        filePath: `/uploads/omr/${storedFileName}`,
        memo,
        status: "UPLOADED",
      },
    });

    await prisma.$executeRaw`
      UPDATE "OmrUpload"
      SET "phoneLast8" = ${null},
          "phoneRecognizeStatus" = ${PHONE_RECOGNIZE_STATUSES.WAITING},
          "matchStatus" = ${OMR_UPLOAD_STATUSES.NEEDS_PHONE},
          "recognizeStatus" = ${OMR_UPLOAD_STATUSES.WAITING},
          "gradingStatus" = ${OMR_UPLOAD_STATUSES.WAITING}
      WHERE "id" = ${upload.id}
    `;

    createdUploadIds.push(upload.id);
  }

  if (createdUploadIds.length === 0 && skippedLargeFiles > 0) {
    redirect(omrHref(exam.id, { mode: "upload", uploadError: "file-too-large", skipped: skippedLargeFiles }));
  }

  let recognizedCount = 0;
  let failedCount = 0;

  if (isOmrAutoRecognizeEnabled()) {
    for (const uploadId of createdUploadIds) {
      try {
        await recognizeOmrUploadInternal(uploadId, user.academyId);
        recognizedCount += 1;
      } catch (error) {
        failedCount += 1;
        console.error(`OMR upload auto-processing failed for upload ${uploadId}`, error);
        await prisma.omrUpload.update({ where: { id: uploadId }, data: { status: "MANUAL_REVIEW_READY" } });
        await prisma.$executeRaw`
          UPDATE "OmrUpload"
          SET "recognizeStatus" = ${OMR_UPLOAD_STATUSES.FAILED},
              "gradingStatus" = ${OMR_UPLOAD_STATUSES.REVIEW_NEEDED}
          WHERE "id" = ${uploadId}
        `;
      }
    }
  }

  await recordActivity({
    actor: user,
    action: "CREATE",
    entityType: "OmrUpload",
    entityId: createdUploadIds[0] ?? null,
    summary: `OMR 업로드: ${files.length}개`,
    metadata: { examId: exam.id, fileCount: files.length, recognizedCount, failedCount },
  });

  revalidatePath("/omr");
  redirect(
    omrHref(exam.id, {
      mode: "results",
      uploadWarning: skippedLargeFiles > 0 ? "file-too-large" : null,
      skipped: skippedLargeFiles || null,
    })
  );
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
  redirect(nextExamId ? omrHref(nextExamId, { mode: "results" }) : "/omr");
}
