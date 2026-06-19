import { OmrTemplateType } from "@/lib/generated/prisma";

export type OmrQuestionKind = "CHOICE" | "SHORT";

export type OmrTemplateQuestion = {
  no: number;
  section: string;
  kind: OmrQuestionKind;
};

export type OmrTemplate = {
  type: OmrTemplateType;
  label: string;
  subject: string;
  questionCount: number;
  description: string;
  questions: OmrTemplateQuestion[];
};

function range(start: number, end: number, section: string, kind: OmrQuestionKind = "CHOICE") {
  return Array.from({ length: end - start + 1 }, (_, index) => ({
    no: start + index,
    section,
    kind,
  }));
}

export const omrTemplates: Record<OmrTemplateType, OmrTemplate> = {
  KOREAN: {
    type: OmrTemplateType.KOREAN,
    label: "국어 OMR",
    subject: "국어",
    questionCount: 45,
    description: "공통 1-34번, 선택 35-45번",
    questions: [...range(1, 34, "공통"), ...range(35, 45, "선택")],
  },
  MATH: {
    type: OmrTemplateType.MATH,
    label: "수학 OMR",
    subject: "수학",
    questionCount: 30,
    description: "객관식과 단답형 문항",
    questions: [
      ...range(1, 15, "공통 객관식"),
      ...range(16, 22, "공통 단답형", "SHORT"),
      ...range(23, 28, "선택 객관식"),
      ...range(29, 30, "선택 단답형", "SHORT"),
    ],
  },
  INQUIRY: {
    type: OmrTemplateType.INQUIRY,
    label: "탐구 OMR",
    subject: "탐구",
    questionCount: 40,
    description: "제1선택 1-20번, 제2선택 21-40번",
    questions: [...range(1, 20, "제1선택"), ...range(21, 40, "제2선택")],
  },
  ENGLISH: {
    type: OmrTemplateType.ENGLISH,
    label: "영어 OMR",
    subject: "영어",
    questionCount: 45,
    description: "영어 45문항 양식",
    questions: range(1, 45, "영어"),
  },
  OTHER: {
    type: OmrTemplateType.OTHER,
    label: "우마리아T 테스트 OMR",
    subject: "탐구",
    questionCount: 20,
    description: "수험번호란=전화번호 뒤 8자리, 제1선택 객관식 1-20번, 서술형 제외",
    questions: range(1, 20, "제1선택"),
  },
};

export const omrTemplateList = [
  omrTemplates.KOREAN,
  omrTemplates.MATH,
  omrTemplates.INQUIRY,
  omrTemplates.ENGLISH,
  omrTemplates.OTHER,
];

export function getOmrTemplate(type: OmrTemplateType | string | null | undefined) {
  if (type && type in omrTemplates) return omrTemplates[type as OmrTemplateType];
  return omrTemplates.OTHER;
}
