import type { TemplateContext } from "@/lib/sms/types";

export const supportedTemplateVariables = [
  "studentName",
  "parentName",
  "parentNameSubject",
  "parentNameTopic",
  "className",
  "lessonName",
  "lessonRound",
  "lessonDate",
  "attendanceStatus",
  "assignmentName",
  "examName",
  "examDate",
  "score",
  "maxScore",
  "averageScore",
  "rank",
  "level",
  "correctCount",
  "wrongCount",
  "blankCount",
  "highestScore",
  "feedback",
  "weakType",
  "wrongQuestions",
  "remedialReason",
  "reportLink",
  "reportName",
  "academyName",
  "academyPhone",
] as const;

export type SupportedTemplateVariable = (typeof supportedTemplateVariables)[number];

const supportedVariableSet = new Set<string>(supportedTemplateVariables);
const variablePattern = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

export type RenderedTemplate = {
  text: string;
  unknownVariables: string[];
  usedVariables: string[];
  missingVariables: string[];
  length: number;
  byteLength: number;
  messageKind: "SMS" | "LMS";
};

export function parseTemplateVariables(body: string) {
  const variables = new Set<string>();
  for (const match of body.matchAll(variablePattern)) {
    const name = match[1]?.trim();
    if (name) variables.add(name);
  }
  return [...variables];
}

export function validateTemplateVariables(body: string) {
  const variables = parseTemplateVariables(body);
  return {
    variables,
    unknownVariables: variables.filter((name) => !supportedVariableSet.has(name)),
  };
}

export function renderMessageTemplate(body: string, context: TemplateContext): RenderedTemplate {
  const unknownVariables = new Set<string>();
  const usedVariables = new Set<string>();
  const missingVariables = new Set<string>();
  const text = body.replace(variablePattern, (match, rawName: string) => {
    const name = rawName.trim();
    if (!supportedVariableSet.has(name)) {
      unknownVariables.add(name);
      return match;
    }

    usedVariables.add(name);
    const value = context[name];
    if (value === null || value === undefined || String(value).trim() === "") {
      missingVariables.add(name);
      return "";
    }
    return String(value);
  });
  const byteLength = messageByteLength(text);

  return {
    text,
    unknownVariables: [...unknownVariables],
    usedVariables: [...usedVariables],
    missingVariables: [...missingVariables],
    length: text.length,
    byteLength,
    messageKind: byteLength > 90 ? "LMS" : "SMS",
  };
}

export function getMissingVariables(body: string, context: TemplateContext) {
  return renderMessageTemplate(body, context).missingVariables;
}

export function extractUnknownTemplateVariables(body: string) {
  return validateTemplateVariables(body).unknownVariables;
}

export function messageByteLength(value: string) {
  let bytes = 0;
  for (const char of value) bytes += char.charCodeAt(0) <= 0x7f ? 1 : 2;
  return bytes;
}

export function messageLengthLabel(byteLength: number) {
  if (byteLength <= 90) return `${byteLength} byte / SMS 예상`;
  return `${byteLength} byte / LMS 전환 가능`;
}
