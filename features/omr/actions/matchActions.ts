
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cleanId, enumValue, optionalText, safeReturnTo, text } from "@/features/omr/lib/omrForm";
import { matchStudentByPhoneLast8, phoneLast8 } from "@/features/omr/lib/omrMatching";
import { PHONE_RECOGNIZE_STATUSES, TEMPLATE_TYPES } from "@/features/omr/lib/omrStatus";

export async function updateOmrUploadMatchAction(formData: FormData) {
  const user = await requireUser();
  const uploadId = text(formData, "uploadId");
  const returnTo = safeReturnTo(text(formData, "returnTo"));
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
  if (returnTo) revalidatePath(returnTo);
  redirect(returnTo ?? `/omr/uploads/${upload.id}`);
}

export async function updateOmrUploadSetupAction(formData: FormData) {
  const user = await requireUser();
  const uploadId = text(formData, "uploadId");
  const returnTo = safeReturnTo(text(formData, "returnTo"));
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

  revalidatePath("/omr");
  if (returnTo) revalidatePath(returnTo);
  redirect(returnTo ?? `/omr/uploads/${upload.id}`);
}


