import { formatPhoneNumber, normalizePhoneNumber } from "@/lib/phone";
import { renderMessageTemplate } from "@/lib/sms/renderTemplate";
import type { MessageRecipientType, MessageTargetType, SmsRecipientPayload, TemplateContext } from "@/lib/sms/types";

export type MessageStudent = {
  id: string;
  name: string;
  phone?: string | null;
  parentPhone?: string | null;
  parentName?: string | null;
  className?: string | null;
  schoolName?: string | null;
  grade?: string | null;
  templateData?: TemplateContext;
};

export type SkippedRecipient = {
  studentId: string;
  studentName: string;
  recipientType: MessageRecipientType;
  reason: "NO_PHONE" | "DUPLICATE" | "CONSENT_BLOCKED" | "MARKETING_OPT_OUT";
  phone?: string | null;
};

export type RecipientPreviewResult = {
  recipients: SmsRecipientPayload[];
  skipped: SkippedRecipient[];
  duplicateCount: number;
  missingPhoneCount: number;
  blockedByConsentCount: number;
  unknownVariables: string[];
  missingVariables: Array<{ localId: string; receiverName: string; variables: string[] }>;
  maxMessageLength: number;
  maxByteLength: number;
};

type BuildRecipientParams = {
  students: MessageStudent[];
  targetType: MessageTargetType;
  body: string;
  context: TemplateContext;
  blockedNormalizedPhones?: Set<string>;
  isMarketing?: boolean;
  subject?: string;
  unsubPhone?: string | null;
};

export function buildMessageRecipients({
  students,
  targetType,
  body,
  context,
  blockedNormalizedPhones = new Set(),
  isMarketing = false,
  subject,
  unsubPhone,
}: BuildRecipientParams): RecipientPreviewResult {
  const recipients: SmsRecipientPayload[] = [];
  const skipped: SkippedRecipient[] = [];
  const seenPhones = new Set<string>();
  const unknownVariables = new Set<string>();
  const missingVariables: RecipientPreviewResult["missingVariables"] = [];
  let duplicateCount = 0;
  let missingPhoneCount = 0;
  let blockedByConsentCount = 0;
  let maxMessageLength = 0;
  let maxByteLength = 0;

  for (const student of students) {
    const candidateTypes = recipientTypesForTarget(targetType);
    for (const recipientType of candidateTypes) {
      const rawPhone = recipientType === "STUDENT" ? student.phone : student.parentPhone;
      const normalizedPhone = normalizePhoneNumber(rawPhone);

      if (!normalizedPhone) {
        missingPhoneCount += 1;
        skipped.push({ studentId: student.id, studentName: student.name, recipientType, reason: "NO_PHONE", phone: rawPhone });
        continue;
      }

      if (blockedNormalizedPhones.has(normalizedPhone)) {
        blockedByConsentCount += 1;
        skipped.push({
          studentId: student.id,
          studentName: student.name,
          recipientType,
          reason: isMarketing ? "MARKETING_OPT_OUT" : "CONSENT_BLOCKED",
          phone: rawPhone,
        });
        continue;
      }

      if (seenPhones.has(normalizedPhone)) {
        duplicateCount += 1;
        skipped.push({ studentId: student.id, studentName: student.name, recipientType, reason: "DUPLICATE", phone: rawPhone });
        continue;
      }
      seenPhones.add(normalizedPhone);

      const receiverName = recipientType === "STUDENT" ? student.name : student.parentName || `${student.name} 학부모님`;
      const templateData = buildTemplateData(student, recipientType, context, receiverName);
      const rendered = renderMessageTemplate(body, templateData);
      for (const variable of rendered.unknownVariables) unknownVariables.add(variable);
      if (rendered.missingVariables.length > 0) {
        missingVariables.push({ localId: `${student.id}:${recipientType}:${normalizedPhone}`, receiverName, variables: rendered.missingVariables });
      }
      maxMessageLength = Math.max(maxMessageLength, rendered.length);
      maxByteLength = Math.max(maxByteLength, rendered.byteLength);

      recipients.push({
        localId: `${student.id}:${recipientType}:${normalizedPhone}`,
        studentId: student.id,
        studentName: student.name,
        recipientType,
        receiverName,
        phone: formatPhoneNumber(rawPhone),
        normalizedPhone,
        messageText: rendered.text,
        templateData: stringifyTemplateData(templateData),
        missingVariables: rendered.missingVariables,
        messageKind: rendered.messageKind,
        byteLength: rendered.byteLength,
        subject,
        isMarketing,
        unsubPhone,
      });
    }
  }

  return {
    recipients,
    skipped,
    duplicateCount,
    missingPhoneCount,
    blockedByConsentCount,
    unknownVariables: [...unknownVariables],
    missingVariables,
    maxMessageLength,
    maxByteLength,
  };
}

export function buildTemplateData(student: MessageStudent, recipientType: MessageRecipientType, context: TemplateContext, receiverName?: string): TemplateContext {
  const parentName = student.parentName || `${student.name} 학부모님`;
  const merged: TemplateContext = {
    ...context,
    ...student.templateData,
    studentName: student.name,
    parentName,
    parentNameSubject: withKoreanParticle(parentName, "이", "가"),
    parentNameTopic: withKoreanParticle(parentName, "은", "는"),
    className: student.className || String(student.templateData?.className ?? context.className ?? ""),
    level: String(student.templateData?.level ?? context.level ?? student.grade ?? ""),
  };
  if (recipientType === "STUDENT") merged.parentName = receiverName || student.name;
  return merged;
}

function stringifyTemplateData(value: TemplateContext) {
  const data: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (raw !== null && raw !== undefined) data[key] = String(raw);
  }
  return data;
}

function withKoreanParticle(value: string, consonantParticle: string, vowelParticle: string) {
  if (!value) return "";
  const last = value.trim().charCodeAt(value.trim().length - 1);
  if (last < 0xac00 || last > 0xd7a3) return `${value}${vowelParticle}`;
  return `${value}${(last - 0xac00) % 28 === 0 ? vowelParticle : consonantParticle}`;
}

function recipientTypesForTarget(targetType: MessageTargetType): MessageRecipientType[] {
  if (targetType === "STUDENT") return ["STUDENT"];
  if (targetType === "BOTH") return ["STUDENT", "GUARDIAN"];
  return ["GUARDIAN"];
}
