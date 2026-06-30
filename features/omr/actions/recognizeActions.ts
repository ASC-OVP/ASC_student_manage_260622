
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordActivity } from "@/lib/activityLog";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { omrHref, text } from "@/features/omr/lib/omrForm";
import { recognizeOmrUploadInternal } from "@/features/omr/lib/omrRecognitionRunner";
import { OMR_UPLOAD_STATUSES } from "@/features/omr/lib/omrStatus";

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
    summary: "OMR recognition",
  });

  revalidatePath("/omr");
  redirect(result.uploadId ? `/omr/uploads/${result.uploadId}` : result.examId ? omrHref(result.examId, { mode: "results" }) : "/omr");
}

export async function recognizeSelectedOmrUploadsAction(formData: FormData) {
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
  redirect(examId ? omrHref(examId, { mode: "results" }) : "/omr");
}
