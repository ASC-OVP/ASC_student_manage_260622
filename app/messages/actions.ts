"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canExportFullAcademy, studentWhereForUser } from "@/lib/scopes";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordActivity } from "@/lib/activityLog";
import { ensureDefaultMessageTemplates } from "@/lib/sms/ensureDefaultTemplates";
import { getSmsProvider, getSmsProviderStatus } from "@/lib/sms/provider";
import { buildMessageRecipients, type MessageStudent } from "@/lib/sms/recipients";
import { messageCategories, messageTargetTypes, type MessageCategory, type MessageTargetType } from "@/lib/sms/types";

const categoryValues = messageCategories.map((category) => category.value);
const targetTypeValues = messageTargetTypes.map((targetType) => targetType.value);

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function optionalText(formData: FormData, key: string) {
  const value = text(formData, key);
  return value ? value : undefined;
}

function checked(formData: FormData, key: string) {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

function cleanId(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed && trimmed !== "none" && trimmed !== "-" ? trimmed : null;
}

function categoryValue(value: string): MessageCategory {
  return categoryValues.includes(value as MessageCategory) ? (value as MessageCategory) : "ETC";
}

function targetTypeValue(value: string): MessageTargetType {
  return targetTypeValues.includes(value as MessageTargetType) ? (value as MessageTargetType) : "GUARDIAN";
}

function canComposeMessages(role: string) {
  return role === "ADMIN" || role === "MANAGER" || role === "TEACHER";
}

function canSendActualMessages(role: string) {
  return role === "ADMIN" || role === "MANAGER";
}

function parseStudentIds(raw: string) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return Array.from(new Set(parsed.map(String).map((value) => value.trim()).filter(Boolean)));
    }
  } catch {
    return raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }
  return [];
}

function messageContext(formData: FormData, academyName: string) {
  return {
    className: optionalText(formData, "className"),
    lessonDate: optionalText(formData, "lessonDate"),
    attendanceStatus: optionalText(formData, "attendanceStatus"),
    assignmentName: optionalText(formData, "assignmentName"),
    examName: optionalText(formData, "examName"),
    reportName: optionalText(formData, "reportName"),
    academyName,
    academyPhone: process.env.ACADEMY_PHONE?.trim() || process.env.SMS_SENDER_NUMBER?.trim() || "",
  };
}

async function selectedStudentsForMessage(user: Awaited<ReturnType<typeof requireUser>>, studentIds: string[]) {
  if (studentIds.length === 0) return [];

  const students = await prisma.student.findMany({
    where: {
      AND: [
        studentWhereForUser(user),
        { id: { in: studentIds } },
      ],
    },
    select: {
      id: true,
      name: true,
      phone: true,
      parentPhone: true,
      studentClasses: {
        where: { status: "ACTIVE" },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
        take: 2,
        select: { classGroup: { select: { name: true } } },
      },
    },
  });

  const order = new Map(studentIds.map((id, index) => [id, index]));
  return students
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map<MessageStudent>((student) => ({
      id: student.id,
      name: student.name,
      phone: student.phone,
      parentPhone: student.parentPhone,
      className: student.studentClasses.map((membership) => membership.classGroup.name).join(", "),
    }));
}

async function blockedOperationalPhones(academyId: string, normalizedPhones: string[]) {
  if (normalizedPhones.length === 0) return new Set<string>();
  const rows = await prisma.smsConsent.findMany({
    where: {
      academyId,
      normalizedPhone: { in: normalizedPhones },
      OR: [
        { operationalAllowed: false },
        { optedOutAt: { not: null } },
      ],
    },
    select: { normalizedPhone: true },
  });
  return new Set(rows.map((row) => row.normalizedPhone));
}

function messagesUrl(params?: Record<string, string | number | boolean | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== null && value !== undefined && value !== "") search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `/messages?${query}` : "/messages";
}

export async function ensureDefaultMessageTemplatesAction() {
  const user = await requireUser();
  const created = await ensureDefaultMessageTemplates(user.academyId, user.id);
  if (created) revalidatePath("/messages");
}

export async function createMessageTemplateAction(formData: FormData) {
  const user = await requireUser();
  if (!canComposeMessages(user.role)) redirect(messagesUrl({ tab: "templates", error: "permission" }));

  const name = text(formData, "name");
  const body = text(formData, "body");
  if (!name || !body) redirect(messagesUrl({ tab: "templates", error: "template-empty" }));

  await prisma.messageTemplate.create({
    data: {
      academyId: user.academyId,
      createdById: user.id,
      name,
      category: categoryValue(text(formData, "category")),
      targetType: targetTypeValue(text(formData, "targetType")),
      body,
      isActive: checked(formData, "isActive"),
    },
  });

  await recordActivity({
    actor: user,
    action: "CREATE",
    entityType: "MessageTemplate",
    summary: `문자 템플릿 생성: ${name}`,
  });

  revalidatePath("/messages");
  redirect(messagesUrl({ tab: "templates" }));
}

export async function updateMessageTemplateAction(formData: FormData) {
  const user = await requireUser();
  if (!canComposeMessages(user.role)) redirect(messagesUrl({ tab: "templates", error: "permission" }));

  const id = text(formData, "templateId");
  const name = text(formData, "name");
  const body = text(formData, "body");
  if (!id || !name || !body) redirect(messagesUrl({ tab: "templates", error: "template-empty" }));

  await prisma.messageTemplate.updateMany({
    where: { id, academyId: user.academyId },
    data: {
      name,
      category: categoryValue(text(formData, "category")),
      targetType: targetTypeValue(text(formData, "targetType")),
      body,
      isActive: checked(formData, "isActive"),
    },
  });

  await recordActivity({
    actor: user,
    action: "UPDATE",
    entityType: "MessageTemplate",
    entityId: id,
    summary: `문자 템플릿 수정: ${name}`,
  });

  revalidatePath("/messages");
  redirect(messagesUrl({ tab: "templates" }));
}

export async function deleteMessageTemplateAction(formData: FormData) {
  const user = await requireUser();
  if (!canComposeMessages(user.role)) redirect(messagesUrl({ tab: "templates", error: "permission" }));

  const id = text(formData, "templateId");
  if (!id) return;

  const template = await prisma.messageTemplate.findFirst({
    where: { id, academyId: user.academyId },
    select: { id: true, name: true },
  });
  if (!template) return;

  await prisma.messageTemplate.delete({ where: { id: template.id } });

  await recordActivity({
    actor: user,
    action: "DELETE",
    entityType: "MessageTemplate",
    entityId: template.id,
    summary: `문자 템플릿 삭제: ${template.name}`,
  });

  revalidatePath("/messages");
  redirect(messagesUrl({ tab: "templates" }));
}

export async function previewMessageRecipientsAction(formData: FormData) {
  const user = await requireUser();
  if (!canComposeMessages(user.role)) {
    return { recipients: [], skipped: [], duplicateCount: 0, missingPhoneCount: 0, blockedByConsentCount: 0, unknownVariables: [], maxMessageLength: 0 };
  }

  const body = text(formData, "body");
  const students = await selectedStudentsForMessage(user, parseStudentIds(text(formData, "studentIds")));
  const preliminary = buildMessageRecipients({
    students,
    targetType: targetTypeValue(text(formData, "targetType")),
    body,
    context: messageContext(formData, user.academy.name),
  });
  const blockedPhones = await blockedOperationalPhones(user.academyId, preliminary.recipients.map((recipient) => recipient.normalizedPhone));
  return buildMessageRecipients({
    students,
    targetType: targetTypeValue(text(formData, "targetType")),
    body,
    context: messageContext(formData, user.academy.name),
    blockedNormalizedPhones: blockedPhones,
  });
}

export async function sendMessageJobAction(formData: FormData) {
  const user = await requireUser();
  if (!canComposeMessages(user.role)) redirect(messagesUrl({ tab: "compose", error: "permission" }));

  const requestedActual = text(formData, "sendMode") === "actual";
  const providerStatus = getSmsProviderStatus();
  if (requestedActual && !canSendActualMessages(user.role)) {
    redirect(messagesUrl({ tab: "compose", error: "send-permission" }));
  }
  if (requestedActual && !providerStatus.canSendActual) {
    redirect(messagesUrl({ tab: "compose", error: "provider-disabled" }));
  }

  const dryRun = !requestedActual || providerStatus.dryRun;
  const body = text(formData, "body");
  const targetType = targetTypeValue(text(formData, "targetType"));
  const title = text(formData, "title") || "운영 알림 문자";
  const templateId = cleanId(text(formData, "templateId"));
  const studentIds = parseStudentIds(text(formData, "studentIds"));

  if (!body || studentIds.length === 0) redirect(messagesUrl({ tab: "compose", error: "empty" }));

  const [template, students] = await Promise.all([
    templateId
      ? prisma.messageTemplate.findFirst({
          where: { id: templateId, academyId: user.academyId },
          select: { id: true, name: true },
        })
      : null,
    selectedStudentsForMessage(user, studentIds),
  ]);

  if (students.length === 0) redirect(messagesUrl({ tab: "compose", error: "no-students" }));

  const preliminary = buildMessageRecipients({
    students,
    targetType,
    body,
    context: messageContext(formData, user.academy.name),
  });
  const blockedPhones = await blockedOperationalPhones(user.academyId, preliminary.recipients.map((recipient) => recipient.normalizedPhone));
  const preview = buildMessageRecipients({
    students,
    targetType,
    body,
    context: messageContext(formData, user.academy.name),
    blockedNormalizedPhones: blockedPhones,
  });

  if (preview.recipients.length === 0) {
    redirect(messagesUrl({ tab: "compose", error: "no-recipients" }));
  }

  const jobId = randomUUID();
  const recipientRows = preview.recipients.map((recipient) => ({
    id: randomUUID(),
    jobId,
    studentId: recipient.studentId ?? null,
    recipientType: recipient.recipientType,
    receiverName: recipient.receiverName,
    phone: recipient.phone,
    normalizedPhone: recipient.normalizedPhone,
    messageText: recipient.messageText,
    status: "SENDING",
  }));
  const recipientIdByLocalId = new Map(preview.recipients.map((recipient, index) => [recipient.localId, recipientRows[index].id]));
  const providerPayloads = preview.recipients.map((recipient) => ({
    ...recipient,
    localId: recipientIdByLocalId.get(recipient.localId) ?? recipient.localId,
  }));

  await prisma.$transaction([
    prisma.messageJob.create({
      data: {
        id: jobId,
        academyId: user.academyId,
        templateId: template?.id ?? null,
        title,
        targetType,
        status: "SENDING",
        dryRun,
        totalCount: preview.recipients.length,
        successCount: 0,
        failedCount: 0,
        createdById: user.id,
      },
    }),
    prisma.messageRecipient.createMany({ data: recipientRows }),
  ]);

  const provider = getSmsProvider(dryRun);
  const results = await provider.sendBulkMessages(providerPayloads);
  const resultByRecipientId = new Map(results.map((result) => [result.localId, result]));
  const successCount = results.filter((result) => result.status === "SUCCESS" || result.status === "DRY_RUN").length;
  const failedCount = preview.recipients.length - successCount;
  const jobStatus = dryRun
    ? "DRY_RUN"
    : failedCount === 0
      ? "SUCCESS"
      : successCount === 0
        ? "FAILED"
        : "PARTIAL_FAILED";
  const now = new Date();

  await prisma.$transaction([
    ...recipientRows.map((recipient) => {
      const result = resultByRecipientId.get(recipient.id);
      const status = result?.status ?? "FAILED";
      return prisma.messageRecipient.update({
        where: { id: recipient.id },
        data: {
          status,
          providerMessageId: result?.providerMessageId ?? null,
          errorMessage: result?.errorMessage ?? null,
          sentAt: status === "SUCCESS" || status === "DRY_RUN" ? now : null,
        },
      });
    }),
    ...recipientRows.map((recipient) => {
      const result = resultByRecipientId.get(recipient.id);
      return prisma.smsProviderLog.create({
        data: {
          academyId: user.academyId,
          jobId,
          recipientId: recipient.id,
          provider: provider.name,
          requestPayload: JSON.stringify({
            dryRun,
            to: recipient.normalizedPhone,
            fromConfigured: providerStatus.hasSenderNumber,
            length: recipient.messageText.length,
          }).slice(0, 2000),
          responsePayload: result?.responsePayload ? JSON.stringify(result.responsePayload).slice(0, 2000) : null,
          status: result?.status ?? "FAILED",
          errorMessage: result?.errorMessage ?? null,
        },
      });
    }),
    prisma.messageJob.update({
      where: { id: jobId },
      data: {
        status: jobStatus,
        successCount,
        failedCount,
        sentAt: now,
      },
    }),
  ]);

  await recordActivity({
    actor: user,
    action: dryRun ? "DRY_RUN" : "SEND",
    entityType: "MessageJob",
    entityId: jobId,
    summary: `문자 ${dryRun ? "테스트 실행" : "발송"}: ${title}`,
    metadata: {
      templateId: template?.id ?? null,
      targetType,
      totalCount: preview.recipients.length,
      successCount,
      failedCount,
      skippedCount: preview.skipped.length,
      duplicateCount: preview.duplicateCount,
      unknownVariables: preview.unknownVariables,
    },
  });

  revalidatePath("/messages");
  redirect(messagesUrl({ tab: "logs", jobId }));
}

export async function getMessageSettingsStatusAction() {
  await requireUser();
  return getSmsProviderStatus();
}

export async function listMessageTemplatesAction() {
  const user = await requireUser();
  if (!canComposeMessages(user.role) && !canExportFullAcademy(user.role)) return [];
  return prisma.messageTemplate.findMany({
    where: { academyId: user.academyId },
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      category: true,
      targetType: true,
      body: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function listMessageLogsAction() {
  const user = await requireUser();
  return prisma.messageRecipient.findMany({
    where: { job: { academyId: user.academyId } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      recipientType: true,
      receiverName: true,
      phone: true,
      messageText: true,
      status: true,
      providerMessageId: true,
      errorMessage: true,
      sentAt: true,
      createdAt: true,
      student: { select: { name: true } },
      job: {
        select: {
          id: true,
          title: true,
          dryRun: true,
          status: true,
          createdAt: true,
          createdBy: { select: { name: true } },
          template: { select: { name: true } },
        },
      },
    },
  });
}
