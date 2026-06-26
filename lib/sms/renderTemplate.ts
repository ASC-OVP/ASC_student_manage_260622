import type { TemplateContext } from "@/lib/sms/types";

export const supportedTemplateVariables = [
  "studentName",
  "className",
  "lessonDate",
  "attendanceStatus",
  "assignmentName",
  "examName",
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
  length: number;
  messageKind: "SMS" | "LMS";
};

export function renderMessageTemplate(body: string, context: TemplateContext): RenderedTemplate {
  const unknownVariables = new Set<string>();
  const usedVariables = new Set<string>();
  const text = body.replace(variablePattern, (match, rawName: string) => {
    const name = rawName.trim();
    if (!supportedVariableSet.has(name)) {
      unknownVariables.add(name);
      return match;
    }

    usedVariables.add(name);
    return String(context[name as SupportedTemplateVariable] ?? "");
  });

  return {
    text,
    unknownVariables: [...unknownVariables],
    usedVariables: [...usedVariables],
    length: text.length,
    messageKind: text.length > 90 ? "LMS" : "SMS",
  };
}

export function extractUnknownTemplateVariables(body: string) {
  const unknownVariables = new Set<string>();
  for (const match of body.matchAll(variablePattern)) {
    const name = match[1]?.trim();
    if (name && !supportedVariableSet.has(name)) unknownVariables.add(name);
  }
  return [...unknownVariables];
}

export function messageLengthLabel(length: number) {
  if (length <= 90) return `${length}자 / SMS 예상`;
  return `${length}자 / LMS 전환 가능`;
}
