
import { OmrAnswerStatus } from "@/lib/generated/prisma";
import { prisma } from "@/lib/prisma";
import { recognizeWithPythonOmr, type PythonOmrAnswer } from "@/features/omr/lib/omrPythonClient";
import { getOmrTemplate } from "@/features/omr/lib/omrTemplates";
import { normalizeAnswer, withoutRecognitionNotes } from "@/features/omr/lib/omrForm";
import { matchStudentByPhoneLast8, normalizePhoneRecognizeStatus, phoneLast8 } from "@/features/omr/lib/omrMatching";
import { OMR_UPLOAD_STATUSES, PHONE_RECOGNIZE_STATUSES } from "@/features/omr/lib/omrStatus";

function mapPythonStatus(status: PythonOmrAnswer["status"]) {
  if (status === "OK") return OmrAnswerStatus.RECOGNIZED;
  if (status === "BLANK") return OmrAnswerStatus.BLANK;
  if (status === "MULTI_MARK") return OmrAnswerStatus.MULTIPLE;
  return OmrAnswerStatus.REVIEW_NEEDED;
}

export async function recognizeOmrUploadInternal(uploadId: string, academyId: string) {
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
