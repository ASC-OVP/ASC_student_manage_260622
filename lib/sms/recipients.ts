import { formatPhoneNumber, normalizePhoneNumber } from "@/lib/phone";
import { renderMessageTemplate } from "@/lib/sms/renderTemplate";
import type { MessageRecipientType, MessageTargetType, SmsRecipientPayload, TemplateContext } from "@/lib/sms/types";

export type MessageStudent = {
  id: string;
  name: string;
  phone?: string | null;
  parentPhone?: string | null;
  className?: string | null;
};

export type SkippedRecipient = {
  studentId: string;
  studentName: string;
  recipientType: MessageRecipientType;
  reason: "NO_PHONE" | "DUPLICATE" | "CONSENT_BLOCKED";
  phone?: string | null;
};

export type RecipientPreviewResult = {
  recipients: SmsRecipientPayload[];
  skipped: SkippedRecipient[];
  duplicateCount: number;
  missingPhoneCount: number;
  blockedByConsentCount: number;
  unknownVariables: string[];
  maxMessageLength: number;
};

type BuildRecipientParams = {
  students: MessageStudent[];
  targetType: MessageTargetType;
  body: string;
  context: TemplateContext;
  blockedNormalizedPhones?: Set<string>;
};

export function buildMessageRecipients({
  students,
  targetType,
  body,
  context,
  blockedNormalizedPhones = new Set(),
}: BuildRecipientParams): RecipientPreviewResult {
  const recipients: SmsRecipientPayload[] = [];
  const skipped: SkippedRecipient[] = [];
  const seenPhones = new Set<string>();
  const unknownVariables = new Set<string>();
  let duplicateCount = 0;
  let missingPhoneCount = 0;
  let blockedByConsentCount = 0;
  let maxMessageLength = 0;

  for (const student of students) {
    const candidateTypes = recipientTypesForTarget(targetType);
    for (const recipientType of candidateTypes) {
      const rawPhone = recipientType === "STUDENT" ? student.phone : student.parentPhone;
      const normalizedPhone = normalizePhoneNumber(rawPhone);

      if (!normalizedPhone) {
        missingPhoneCount += 1;
        skipped.push({
          studentId: student.id,
          studentName: student.name,
          recipientType,
          reason: "NO_PHONE",
          phone: rawPhone,
        });
        continue;
      }

      if (blockedNormalizedPhones.has(normalizedPhone)) {
        blockedByConsentCount += 1;
        skipped.push({
          studentId: student.id,
          studentName: student.name,
          recipientType,
          reason: "CONSENT_BLOCKED",
          phone: rawPhone,
        });
        continue;
      }

      if (seenPhones.has(normalizedPhone)) {
        duplicateCount += 1;
        skipped.push({
          studentId: student.id,
          studentName: student.name,
          recipientType,
          reason: "DUPLICATE",
          phone: rawPhone,
        });
        continue;
      }

      seenPhones.add(normalizedPhone);

      const rendered = renderMessageTemplate(body, {
        ...context,
        studentName: student.name,
        className: context.className || student.className || "",
      });
      for (const variable of rendered.unknownVariables) unknownVariables.add(variable);
      maxMessageLength = Math.max(maxMessageLength, rendered.length);

      recipients.push({
        localId: `${student.id}:${recipientType}:${normalizedPhone}`,
        studentId: student.id,
        studentName: student.name,
        recipientType,
        receiverName: receiverName(student.name, recipientType),
        phone: formatPhoneNumber(rawPhone),
        normalizedPhone,
        messageText: rendered.text,
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
    maxMessageLength,
  };
}

export function recipientTypesForTarget(targetType: MessageTargetType): MessageRecipientType[] {
  if (targetType === "STUDENT") return ["STUDENT"];
  if (targetType === "GUARDIAN") return ["GUARDIAN"];
  return ["STUDENT", "GUARDIAN"];
}

export function receiverName(studentName: string, recipientType: MessageRecipientType) {
  if (recipientType === "GUARDIAN") return `${studentName} 학생 보호자님`;
  return `${studentName} 학생`;
}
