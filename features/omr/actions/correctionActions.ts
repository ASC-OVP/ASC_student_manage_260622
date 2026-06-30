
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { OmrAnswerStatus } from "@/lib/generated/prisma";
import { recordActivity } from "@/lib/activityLog";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOmrTemplate } from "@/features/omr/lib/omrTemplates";
import { enumValue, normalizeAnswer, optionalText, safeReturnTo, scoreValue, text } from "@/features/omr/lib/omrForm";
import { ANSWER_STATUSES } from "@/features/omr/lib/omrStatus";

export async function saveOmrCorrectionsAction(formData: FormData) {
  const user = await requireUser();
  const uploadId = text(formData, "uploadId");
  const returnTo = safeReturnTo(text(formData, "returnTo"));
  if (!uploadId) return;

  const upload = await prisma.omrUpload.findFirst({
    where: { id: uploadId, academyId: user.academyId },
    include: { exam: { include: { answerKeys: true } }, recognizedAnswers: true },
  });

  if (!upload || !upload.exam || !upload.examId) return;

  const template = getOmrTemplate(upload.templateType);
  const questions = template.questions.slice(0, upload.exam.questionCount);
  const answerKeyByNo = new Map(upload.exam.answerKeys.map((key) => [key.questionNo, key]));

  await prisma.$transaction(async (tx) => {
    for (const question of questions) {
      const studentAnswer = normalizeAnswer(text(formData, `student-${question.no}`));
      const correctAnswer = normalizeAnswer(text(formData, `correct-${question.no}`)) ?? answerKeyByNo.get(question.no)?.answer ?? null;
      const statusInput = enumValue(optionalText(formData, `status-${question.no}`), ANSWER_STATUSES, studentAnswer ? OmrAnswerStatus.MANUAL : OmrAnswerStatus.BLANK);
      const point = scoreValue(text(formData, `score-${question.no}`) || String(answerKeyByNo.get(question.no)?.score ?? 1));

      if (correctAnswer) {
        await tx.examAnswerKey.upsert({
          where: { examId_questionNo: { examId: upload.exam!.id, questionNo: question.no } },
          update: { answer: correctAnswer, score: point },
          create: { examId: upload.exam!.id, questionNo: question.no, answer: correctAnswer, score: point },
        });
      }

      await tx.omrRecognizedAnswer.upsert({
        where: { omrUploadId_questionNo: { omrUploadId: upload.id, questionNo: question.no } },
        update: {
          correctedAnswer: studentAnswer,
          finalAnswer: studentAnswer,
          status: studentAnswer ? statusInput : OmrAnswerStatus.BLANK,
        },
        create: {
          omrUploadId: upload.id,
          questionNo: question.no,
          recognizedAnswer: studentAnswer,
          correctedAnswer: studentAnswer,
          finalAnswer: studentAnswer,
          confidence: statusInput === OmrAnswerStatus.MANUAL ? 1 : null,
          status: studentAnswer ? statusInput : OmrAnswerStatus.BLANK,
        },
      });
    }
  });

  await recordActivity({
    actor: user,
    action: "UPDATE",
    entityType: "OmrUpload",
    entityId: uploadId,
    summary: `OMR 검수 답안 수정 저장: ${upload.fileName}`,
    metadata: { examId: upload.examId },
  });

  revalidatePath("/omr");
  if (returnTo) revalidatePath(returnTo);
  redirect(returnTo ?? `/omr/uploads/${uploadId}`);
}
