import type { OmrAnswerFormat, OmrQuestionKind, OmrTemplateQuestion } from "@/features/omr/lib/omrTemplates";

export const OMR_PRIMARY_TYPES = ["계산형", "개념형", "응용형", "서술형", "자료해석형", "혼합형"] as const;
export const OMR_SECONDARY_TYPES = ["수치대입", "정의판단", "사례적용", "근거서술", "그래프해석", "객관식+주관식 혼합"] as const;

export const OMR_ANSWER_FORMATS = [
  { value: "CHOICE", label: "객관식" },
  { value: "SHORT", label: "단답형" },
  { value: "WRITTEN", label: "서술형" },
  { value: "MIXED", label: "혼합형" },
] as const satisfies Array<{ value: OmrAnswerFormat; label: string }>;

export const OMR_DIFFICULTIES = [
  { value: "EASY", label: "쉬움" },
  { value: "MEDIUM", label: "보통" },
  { value: "HARD", label: "어려움" },
] as const;

export const OMR_MAPPING_STATUSES = [
  { value: "UNMAPPED", label: "미설정" },
  { value: "TEMPLATE", label: "템플릿" },
  { value: "MAPPED", label: "매핑 완료" },
  { value: "REVIEW_NEEDED", label: "확인 필요" },
] as const;

export function answerFormatFromKind(kind: OmrQuestionKind): OmrAnswerFormat {
  return kind === "SHORT" ? "SHORT" : "CHOICE";
}

export function defaultQuestionMeta(question: OmrTemplateQuestion) {
  return {
    primaryType: question.defaultPrimaryType ?? null,
    secondaryType: question.defaultSecondaryType ?? null,
    answerFormat: question.defaultAnswerFormat ?? answerFormatFromKind(question.kind),
    difficulty: question.defaultDifficulty ?? null,
    section: question.section,
    learningGoal: question.defaultLearningGoal ?? null,
    achievementStandard: null,
    tags: tagsToText(question.defaultTags),
    memo: null,
    omrMappingStatus: "TEMPLATE",
  };
}

export function answerFormatLabel(value?: string | null) {
  return OMR_ANSWER_FORMATS.find((option) => option.value === value)?.label ?? (value || "-");
}

export function difficultyLabel(value?: string | null) {
  return OMR_DIFFICULTIES.find((option) => option.value === value)?.label ?? (value || "-");
}

export function mappingStatusLabel(value?: string | null) {
  return OMR_MAPPING_STATUSES.find((option) => option.value === value)?.label ?? (value || "-");
}

export function tagsToText(tags?: string[] | null) {
  return tags?.map((tag) => tag.trim()).filter(Boolean).join(", ") || null;
}

export function normalizeTags(value?: string | null) {
  return String(value ?? "")
    .split(/[,#，]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12)
    .join(", ") || null;
}

export function splitTags(value?: string | null) {
  return String(value ?? "")
    .split(/[,#，]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

