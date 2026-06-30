"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordActivity } from "@/lib/activityLog";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOmrTemplate, type OmrTemplateQuestion } from "@/features/omr/lib/omrTemplates";
import {
  defaultQuestionMeta,
  normalizeTags,
  OMR_ANSWER_FORMATS,
  OMR_MAPPING_STATUSES,
} from "@/features/omr/lib/omrQuestionMeta";
import { enumValue, omrHref, optionalText, safeReturnTo, text } from "@/features/omr/lib/omrForm";
import { canManageExam, findExamForUser } from "@/features/omr/lib/omrPermissions";

const ANSWER_FORMAT_VALUES = OMR_ANSWER_FORMATS.map((option) => option.value);
const MAPPING_STATUS_VALUES = OMR_MAPPING_STATUSES.map((option) => option.value);

export async function saveQuestionMetaAction(formData: FormData) {
  const user = await requireUser();
  if (!canManageExam(user.role)) return;

  const examId = text(formData, "examId");
  const returnTo = safeReturnTo(text(formData, "returnTo"));
  if (!examId) return;

  const exam = await findExamForUser(examId, user.academyId);
  if (!exam) return;

  const questions = getSubmittedQuestions(formData, getOmrTemplate(exam.templateType).questions.slice(0, exam.questionCount));
  if (questions.length === 0) return;

  await prisma.$transaction(
    questions.map((question) => {
      const data = questionMetaDataFromForm(formData, question);
      return prisma.examQuestionMeta.upsert({
        where: { examId_questionNo: { examId: exam.id, questionNo: question.no } },
        update: data,
        create: { examId: exam.id, questionNo: question.no, ...data },
      });
    })
  );

  await recordActivity({
    actor: user,
    action: "UPDATE",
    entityType: "ExamQuestionMeta",
    entityId: exam.id,
    summary: `OMR 문항 구조 저장: ${exam.title}`,
    metadata: { examId: exam.id, questionCount: questions.length },
  });

  revalidatePath("/omr");
  redirect(returnTo ?? omrHref(exam.id, { mode: "structure" }));
}

export async function bulkUpdateQuestionMetaAction(formData: FormData) {
  const user = await requireUser();
  if (!canManageExam(user.role)) return;

  const examId = text(formData, "examId");
  const returnTo = safeReturnTo(text(formData, "returnTo"));
  if (!examId) return;

  const exam = await findExamForUser(examId, user.academyId);
  if (!exam) return;

  const questions = getOmrTemplate(exam.templateType).questions.slice(0, exam.questionCount);
  const questionByNo = new Map(questions.map((question) => [question.no, question]));
  const selectedQuestionNos = formData
    .getAll("selectedQuestionNo")
    .map((value) => Number(value))
    .filter((questionNo) => Number.isInteger(questionNo) && questionByNo.has(questionNo));
  if (selectedQuestionNos.length === 0) {
    redirect(returnTo ?? omrHref(exam.id, { mode: "structure" }));
  }

  const updateData = bulkMetaDataFromForm(formData);
  if (Object.keys(updateData).length === 0) {
    redirect(returnTo ?? omrHref(exam.id, { mode: "structure" }));
  }

  await prisma.$transaction(
    selectedQuestionNos.map((questionNo) => {
      const question = questionByNo.get(questionNo)!;
      return prisma.examQuestionMeta.upsert({
        where: { examId_questionNo: { examId: exam.id, questionNo } },
        update: updateData,
        create: { examId: exam.id, questionNo, ...defaultQuestionMeta(question), ...updateData },
      });
    })
  );

  await recordActivity({
    actor: user,
    action: "UPDATE",
    entityType: "ExamQuestionMeta",
    entityId: exam.id,
    summary: `OMR 문항 구조 일괄 수정: ${exam.title}`,
    metadata: { examId: exam.id, questionNos: selectedQuestionNos },
  });

  revalidatePath("/omr");
  redirect(returnTo ?? omrHref(exam.id, { mode: "structure" }));
}

export async function applyQuestionTemplateAction(formData: FormData) {
  const user = await requireUser();
  if (!canManageExam(user.role)) return;

  const examId = text(formData, "examId");
  const returnTo = safeReturnTo(text(formData, "returnTo"));
  if (!examId) return;

  const exam = await findExamForUser(examId, user.academyId);
  if (!exam) return;

  const questions = getOmrTemplate(exam.templateType).questions.slice(0, exam.questionCount);
  const existingMetas = await prisma.examQuestionMeta.findMany({ where: { examId: exam.id } });
  const existingByNo = new Map(existingMetas.map((meta) => [meta.questionNo, meta]));

  await prisma.$transaction(
    questions.map((question) => {
      const defaults = defaultQuestionMeta(question);
      const existing = existingByNo.get(question.no);
      const merged = existing
        ? {
            primaryType: existing.primaryType || defaults.primaryType,
            secondaryType: existing.secondaryType || defaults.secondaryType,
            answerFormat: existing.answerFormat || defaults.answerFormat,
            difficulty: existing.difficulty || defaults.difficulty,
            section: existing.section || defaults.section,
            learningGoal: existing.learningGoal || defaults.learningGoal,
            achievementStandard: existing.achievementStandard || defaults.achievementStandard,
            tags: existing.tags || defaults.tags,
            memo: existing.memo || defaults.memo,
            omrMappingStatus: existing.omrMappingStatus && existing.omrMappingStatus !== "UNMAPPED" ? existing.omrMappingStatus : defaults.omrMappingStatus,
          }
        : defaults;

      return prisma.examQuestionMeta.upsert({
        where: { examId_questionNo: { examId: exam.id, questionNo: question.no } },
        update: merged,
        create: { examId: exam.id, questionNo: question.no, ...merged },
      });
    })
  );

  await recordActivity({
    actor: user,
    action: "UPDATE",
    entityType: "ExamQuestionMeta",
    entityId: exam.id,
    summary: `OMR 문항 템플릿 적용: ${exam.title}`,
    metadata: { examId: exam.id, questionCount: questions.length },
  });

  revalidatePath("/omr");
  redirect(returnTo ?? omrHref(exam.id, { mode: "structure" }));
}

function getSubmittedQuestions(formData: FormData, questions: OmrTemplateQuestion[]) {
  const questionByNo = new Map(questions.map((question) => [question.no, question]));
  const submittedQuestionNos = formData
    .getAll("questionNo")
    .map((value) => Number(value))
    .filter((questionNo) => Number.isInteger(questionNo) && questionByNo.has(questionNo));

  if (submittedQuestionNos.length === 0) return questions;
  return submittedQuestionNos.map((questionNo) => questionByNo.get(questionNo)!).filter(Boolean);
}

function questionMetaDataFromForm(formData: FormData, question: OmrTemplateQuestion) {
  const defaults = defaultQuestionMeta(question);
  const answerFormat = enumValue(optionalText(formData, key("answerFormat", question.no)), ANSWER_FORMAT_VALUES, defaults.answerFormat ?? "CHOICE");
  const difficulty = cleanMetaText(formData, key("difficulty", question.no)) ?? defaults.difficulty;
  const mappingStatus = enumValue(optionalText(formData, key("omrMappingStatus", question.no)), MAPPING_STATUS_VALUES, "MAPPED");

  return {
    primaryType: cleanMetaText(formData, key("primaryType", question.no)),
    secondaryType: cleanMetaText(formData, key("secondaryType", question.no)),
    answerFormat,
    difficulty,
    section: cleanMetaText(formData, key("section", question.no)) ?? defaults.section,
    learningGoal: cleanMetaText(formData, key("learningGoal", question.no)),
    achievementStandard: cleanMetaText(formData, key("achievementStandard", question.no)),
    tags: normalizeTags(text(formData, key("tags", question.no))),
    memo: cleanMetaText(formData, key("memo", question.no), 500),
    omrMappingStatus: mappingStatus,
  };
}

function bulkMetaDataFromForm(formData: FormData) {
  const data: Record<string, string | null> = {};
  addIfPresent(data, "primaryType", cleanMetaText(formData, "bulkPrimaryType"));
  addIfPresent(data, "secondaryType", cleanMetaText(formData, "bulkSecondaryType"));
  addIfPresent(data, "answerFormat", optionalText(formData, "bulkAnswerFormat"));
  addIfPresent(data, "difficulty", optionalText(formData, "bulkDifficulty"));
  addIfPresent(data, "tags", normalizeTags(text(formData, "bulkTags")));
  addIfPresent(data, "omrMappingStatus", optionalText(formData, "bulkOmrMappingStatus"));
  return data;
}

function addIfPresent(data: Record<string, string | null>, keyName: string, value: string | null | undefined) {
  if (value !== undefined) data[keyName] = value;
}

function cleanMetaText(formData: FormData, keyName: string, maxLength = 120) {
  const value = optionalText(formData, keyName);
  return value ? value.slice(0, maxLength) : null;
}

function key(name: string, questionNo: number) {
  return `${name}-${questionNo}`;
}


