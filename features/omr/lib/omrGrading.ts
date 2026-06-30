
import { ExamResultStatus, OmrAnswerStatus } from "@/lib/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getOmrTemplate } from "@/features/omr/lib/omrTemplates";
import { enumValue, normalizeAnswer, optionalText, scoreValue, text } from "@/features/omr/lib/omrForm";
import { ANSWER_STATUSES, OMR_UPLOAD_STATUSES } from "@/features/omr/lib/omrStatus";

export async function gradeOmrUploadInternal(uploadId: string, academyId: string, formData?: FormData) {
  const upload = await prisma.omrUpload.findFirst({
    where: { id: uploadId, academyId },
    include: { exam: { include: { answerKeys: true } }, student: true, recognizedAnswers: true },
  });

  if (!upload || !upload.exam || !upload.student || !upload.examId) return null;

  const exam = upload.exam;
  const student = upload.student;

  const template = getOmrTemplate(upload.templateType);
  if (!formData && exam.answerKeys.length === 0) return null;
  if (!formData && upload.recognizedAnswers.length === 0) return null;

  const questions = template.questions.slice(0, exam.questionCount);
  const answerKeyByNo = new Map(exam.answerKeys.map((key) => [key.questionNo, key]));
  const recognizedByNo = new Map(upload.recognizedAnswers.map((answer) => [answer.questionNo, answer]));
  const resultItems = questions.map((question) => {
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
