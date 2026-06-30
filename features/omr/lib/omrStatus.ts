
import { OmrAnswerStatus } from "@/lib/generated/prisma";
import { omrTemplateList } from "@/features/omr/lib/omrTemplates";

export const ANSWER_STATUSES = Object.values(OmrAnswerStatus) as OmrAnswerStatus[];
export const TEMPLATE_TYPES = omrTemplateList.map((template) => template.type);

export const OMR_UPLOAD_STATUSES = {
  WAITING: "WAITING",
  NEEDS_PHONE: "NEEDS_PHONE",
  MATCHED: "MATCHED",
  MULTIPLE_MATCHES: "MULTIPLE_MATCHES",
  NOT_FOUND: "NOT_FOUND",
  MANUAL: "MANUAL",
  RECOGNIZING: "RECOGNIZING",
  REVIEW_NEEDED: "REVIEW_NEEDED",
  RECOGNIZED: "RECOGNIZED",
  FAILED: "FAILED",
  GRADED: "GRADED",
  GRADED_REVIEW_NEEDED: "GRADED_REVIEW_NEEDED",
} as const;

export const PHONE_RECOGNIZE_STATUSES = {
  WAITING: "WAITING",
  OK: "OK",
  LOW_CONFIDENCE: "LOW_CONFIDENCE",
  FAILED: "FAILED",
  MANUAL: "MANUAL",
} as const;

export function isOmrAutoRecognizeEnabled() {
  const value = process.env.OMR_AUTO_RECOGNIZE;
  if (value === undefined || value === "") return true;
  return value.toLowerCase() === "true";
}
