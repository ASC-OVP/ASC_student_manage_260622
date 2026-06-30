"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canExportFullAcademy, studentWhereForUser } from "@/lib/scopes";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordActivity } from "@/lib/activityLog";
import { ensureDefaultMessageTemplates } from "@/lib/sms/ensureDefaultTemplates";
import { getSmsProviderForAcademy, getSmsProviderStatusForAcademy } from "@/lib/sms/provider";
import { buildMessageRecipients, type MessageStudent } from "@/lib/sms/recipients";
import { parseTemplateVariables, validateTemplateVariables } from "@/lib/sms/renderTemplate";
import { encryptSecret, hasAppEncryptionKey, jsonStringifySafe } from "@/lib/sms/secureSettings";
import { getRemainingAmount, listSendPhones, normalizeSsodaaError, sendSms } from "@/lib/sms/ssodaa";
import { normalizePhoneNumber } from "@/lib/phone";
import { messageCategories, messageTargetTypes, type MessageCategory, type MessageTargetType, type TemplateContext } from "@/lib/sms/types";

const categoryValues = messageCategories.map((category) => category.value);
const targetTypeValues = messageTargetTypes.map((targetType) => targetType.value);
const SSODAA_PROVIDER = "SSODAA";

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

function canManageSmsSettings(role: string) {
  return role === "ADMIN" || role === "MANAGER";
}

function parseStudentIds(raw: string) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return Array.from(new Set(parsed.map(String).map((value) => value.trim()).filter(Boolean)));
  } catch {
    return raw.split(",").map((value) => value.trim()).filter(Boolean);
  }
  return [];
}

function messageContext(formData: FormData, academyName: string): TemplateContext {
  return {
    className: optionalText(formData, "className"),
    lessonName: optionalText(formData, "lessonName"),
    lessonRound: optionalText(formData, "lessonRound"),
    lessonDate: optionalText(formData, "lessonDate"),
    attendanceStatus: optionalText(formData, "attendanceStatus"),
    assignmentName: optionalText(formData, "assignmentName"),
    examName: optionalText(formData, "examName"),
    examDate: optionalText(formData, "examDate"),
    reportName: optionalText(formData, "reportName"),
    reportLink: optionalText(formData, "reportLink"),
    academyName,
    academyPhone: process.env.ACADEMY_PHONE?.trim() || process.env.SSODAA_DEFAULT_SEND_PHONE?.trim() || process.env.SMS_SENDER_NUMBER?.trim() || "",
  };
}

async function selectedStudentsForMessage(user: Awaited<ReturnType<typeof requireUser>>, studentIds: string[], examId?: string | null) {
  if (studentIds.length === 0) return [];
  const examData = examId ? await examTemplateDataByStudent(user.academyId, examId) : new Map<string, TemplateContext>();

  const students = await prisma.student.findMany({
    where: { AND: [studentWhereForUser(user), { id: { in: studentIds } }] },
    select: {
      id: true,
      name: true,
      phone: true,
      parentPhone: true,
      schoolName: true,
      grade: true,
      currentLevel: true,
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
      schoolName: student.schoolName,
      grade: student.grade,
      templateData: {
        level: student.currentLevel ?? student.grade ?? "",
        ...examData.get(student.id),
      },
    }));
}

async function examTemplateDataByStudent(academyId: string, examId: string) {
  const exam = await prisma.exam.findFirst({
    where: { id: examId, academyId },
    select: {
      id: true,
      title: true,
      examDate: true,
      totalScore: true,
      questionMetas: { select: { questionNo: true, primaryType: true, secondaryType: true, difficulty: true, tags: true } },
      results: {
        include: { items: true },
      },
    },
  });
  const map = new Map<string, TemplateContext>();
  if (!exam) return map;

  const results = exam.results;
  const average = results.length ? results.reduce((sum, result) => sum + result.totalScore, 0) / results.length : null;
  const rank = new Map(results.slice().sort((a, b) => b.totalScore - a.totalScore).map((result, index) => [result.studentId, index + 1]));
  const metaByNo = new Map(exam.questionMetas.map((meta) => [meta.questionNo, meta]));

  for (const result of results) {
    const wrongItems = result.items.filter((item) => !item.isCorrect);
    const wrongQuestions = wrongItems.map((item) => item.questionNo).sort((a, b) => a - b).join(", ");
    const typeCounts = new Map<string, number>();
    for (const item of wrongItems) {
      const meta = metaByNo.get(item.questionNo);
      const label = meta?.primaryType || meta?.secondaryType || "유형 미지정";
      typeCounts.set(label, (typeCounts.get(label) ?? 0) + 1);
    }
    const weakType = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    const maxScore = result.maxScore || exam.totalScore || 100;
    const wrongRate = result.correctCount + result.wrongCount + result.blankCount > 0
      ? ((result.wrongCount + result.blankCount) / (result.correctCount + result.wrongCount + result.blankCount)) * 100
      : 0;
    const remedialReasons: string[] = [];
    if (result.totalScore < 60) remedialReasons.push("60점 미만");
    if (average !== null && result.totalScore <= average - 15) remedialReasons.push("평균보다 15점 이상 낮음");
    if (wrongRate >= 40) remedialReasons.push("오답률 40% 이상");
    if (result.reviewNeededCount > 0) remedialReasons.push("검수 필요 문항 있음");

    map.set(result.studentId, {
      examName: exam.title,
      examDate: exam.examDate ?? "",
      score: result.totalScore,
      maxScore,
      averageScore: average === null ? "" : average.toFixed(1),
      rank: rank.get(result.studentId) ?? "",
      correctCount: result.correctCount,
      wrongCount: result.wrongCount,
      blankCount: result.blankCount,
      weakType,
      wrongQuestions,
      remedialReason: remedialReasons.join(", "),
    });
  }
  return map;
}

async function blockedPhones(academyId: string, normalizedPhones: string[], isMarketing: boolean) {
  const phones = Array.from(new Set(normalizedPhones.filter(Boolean)));
  if (phones.length === 0) return new Set<string>();
  if (isMarketing) {
    const allowed = await prisma.smsConsent.findMany({
      where: { academyId, normalizedPhone: { in: phones }, marketingAllowed: true, optedOutAt: null },
      select: { normalizedPhone: true },
    });
    const allowedSet = new Set(allowed.map((row) => row.normalizedPhone));
    return new Set(phones.filter((phone) => !allowedSet.has(phone)));
  }

  const rows = await prisma.smsConsent.findMany({
    where: {
      academyId,
      normalizedPhone: { in: phones },
      OR: [{ operationalAllowed: false }, { optedOutAt: { not: null } }],
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
      title: optionalText(formData, "title"),
      category: categoryValue(text(formData, "category")),
      targetType: targetTypeValue(text(formData, "targetType")),
      body,
      variables: JSON.stringify(parseTemplateVariables(body)),
      isMarketing: checked(formData, "isMarketing"),
      isActive: checked(formData, "isActive"),
    },
  });

  await recordActivity({ actor: user, action: "CREATE", entityType: "MessageTemplate", summary: `문자 템플릿 생성: ${name}` });
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
      title: optionalText(formData, "title"),
      category: categoryValue(text(formData, "category")),
      targetType: targetTypeValue(text(formData, "targetType")),
      body,
      variables: JSON.stringify(parseTemplateVariables(body)),
      isMarketing: checked(formData, "isMarketing"),
      isActive: checked(formData, "isActive"),
    },
  });

  await recordActivity({ actor: user, action: "UPDATE", entityType: "MessageTemplate", entityId: id, summary: `문자 템플릿 수정: ${name}` });
  revalidatePath("/messages");
  redirect(messagesUrl({ tab: "templates" }));
}

export async function deleteMessageTemplateAction(formData: FormData) {
  const user = await requireUser();
  if (!canComposeMessages(user.role)) redirect(messagesUrl({ tab: "templates", error: "permission" }));

  const id = text(formData, "templateId");
  if (!id) return;
  const template = await prisma.messageTemplate.findFirst({ where: { id, academyId: user.academyId }, select: { id: true, name: true } });
  if (!template) return;

  await prisma.messageTemplate.delete({ where: { id: template.id } });
  await recordActivity({ actor: user, action: "DELETE", entityType: "MessageTemplate", entityId: template.id, summary: `문자 템플릿 삭제: ${template.name}` });
  revalidatePath("/messages");
  redirect(messagesUrl({ tab: "templates" }));
}

export async function previewMessageRecipientsAction(formData: FormData) {
  const user = await requireUser();
  if (!canComposeMessages(user.role)) return emptyPreview();
  const body = text(formData, "body");
  const isMarketing = checked(formData, "isMarketing");
  const students = await selectedStudentsForMessage(user, parseStudentIds(text(formData, "studentIds")), cleanId(text(formData, "examId")));
  const preliminary = buildMessageRecipients({ students, targetType: targetTypeValue(text(formData, "targetType")), body, context: messageContext(formData, user.academy.name), isMarketing });
  const blocked = await blockedPhones(user.academyId, preliminary.recipients.map((recipient) => recipient.normalizedPhone), isMarketing);
  return buildMessageRecipients({
    students,
    targetType: targetTypeValue(text(formData, "targetType")),
    body,
    context: messageContext(formData, user.academy.name),
    blockedNormalizedPhones: blocked,
    isMarketing,
    subject: text(formData, "title"),
    unsubPhone: normalizePhoneNumber(text(formData, "unsubPhone")),
  });
}

export async function sendMessageJobAction(formData: FormData) {
  const user = await requireUser();
  if (!canComposeMessages(user.role)) redirect(messagesUrl({ tab: "compose", error: "permission" }));

  const requestedActual = text(formData, "sendMode") === "actual";
  const providerStatus = await getSmsProviderStatusForAcademy(user.academyId);
  if (requestedActual && !canSendActualMessages(user.role)) redirect(messagesUrl({ tab: "compose", error: "send-permission" }));
  if (requestedActual && !providerStatus.canSendActual) redirect(messagesUrl({ tab: "compose", error: "provider-disabled" }));

  const dryRun = !requestedActual || providerStatus.dryRun;
  const body = text(formData, "body");
  const targetType = targetTypeValue(text(formData, "targetType"));
  const title = text(formData, "title") || "운영 알림 문자";
  const templateId = cleanId(text(formData, "templateId"));
  const examId = cleanId(text(formData, "examId"));
  const studentIds = parseStudentIds(text(formData, "studentIds"));
  const isMarketing = checked(formData, "isMarketing");

  if (!body || studentIds.length === 0) redirect(messagesUrl({ tab: "compose", error: "empty" }));
  const variableCheck = validateTemplateVariables(body);
  if (variableCheck.unknownVariables.length > 0) redirect(messagesUrl({ tab: "compose", error: "unknown-variables" }));
  if (!examId && variableCheck.variables.some((name) => ["score", "maxScore", "averageScore", "rank", "correctCount", "wrongCount", "blankCount", "weakType", "wrongQuestions", "remedialReason"].includes(name))) {
    redirect(messagesUrl({ tab: "compose", error: "exam-required" }));
  }

  const [template, students] = await Promise.all([
    templateId ? prisma.messageTemplate.findFirst({ where: { id: templateId, academyId: user.academyId }, select: { id: true, name: true } }) : null,
    selectedStudentsForMessage(user, studentIds, examId),
  ]);
  if (students.length === 0) redirect(messagesUrl({ tab: "compose", error: "no-students" }));

  const preliminary = buildMessageRecipients({ students, targetType, body, context: messageContext(formData, user.academy.name), isMarketing, subject: title, unsubPhone: providerStatus.unsubPhone });
  const blocked = await blockedPhones(user.academyId, preliminary.recipients.map((recipient) => recipient.normalizedPhone), isMarketing);
  const preview = buildMessageRecipients({
    students,
    targetType,
    body,
    context: messageContext(formData, user.academy.name),
    blockedNormalizedPhones: blocked,
    isMarketing,
    subject: title,
    unsubPhone: providerStatus.unsubPhone,
  });

  if (preview.recipients.length === 0) redirect(messagesUrl({ tab: "compose", error: "no-recipients" }));
  if (requestedActual && preview.unknownVariables.length > 0) redirect(messagesUrl({ tab: "compose", error: "unknown-variables" }));
  if (requestedActual && preview.missingVariables.length > 0) redirect(messagesUrl({ tab: "compose", error: "missing-variables" }));
  if (requestedActual && isMarketing && !providerStatus.unsubPhone) redirect(messagesUrl({ tab: "compose", error: "marketing-unsub" }));

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
    templateData: jsonStringifySafe(recipient.templateData) ?? null,
    missingVariables: jsonStringifySafe(recipient.missingVariables ?? []) ?? null,
    status: "SENDING",
  }));
  const recipientIdByLocalId = new Map(preview.recipients.map((recipient, index) => [recipient.localId, recipientRows[index].id]));
  const providerPayloads = preview.recipients.map((recipient) => ({ ...recipient, localId: recipientIdByLocalId.get(recipient.localId) ?? recipient.localId }));

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

  const provider = await getSmsProviderForAcademy(user.academyId, dryRun);
  const results = await provider.sendBulkMessages(providerPayloads);
  const resultByRecipientId = new Map(results.map((result) => [result.localId, result]));
  const successCount = results.filter((result) => result.status === "SUCCESS" || result.status === "SENT" || result.status === "DRY_RUN").length;
  const failedCount = preview.recipients.length - successCount;
  const jobStatus = dryRun ? "DRY_RUN" : failedCount === 0 ? "SUCCESS" : successCount === 0 ? "FAILED" : "PARTIAL_FAILED";
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
          sentAt: status === "SUCCESS" || status === "SENT" || status === "DRY_RUN" ? now : null,
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
            byteLength: recipient.messageText.length,
            marketing: isMarketing,
          }).slice(0, 2000),
          responsePayload: result?.responsePayload ? JSON.stringify(result.responsePayload).slice(0, 2000) : null,
          status: result?.status ?? "FAILED",
          errorMessage: result?.errorMessage ?? null,
        },
      });
    }),
    prisma.messageJob.update({ where: { id: jobId }, data: { status: jobStatus, successCount, failedCount, sentAt: now } }),
  ]);

  await recordActivity({
    actor: user,
    action: dryRun ? "DRY_RUN" : "SEND",
    entityType: "MessageJob",
    entityId: jobId,
    summary: `문자 ${dryRun ? "테스트 실행" : "발송"}: ${title}`,
    metadata: { templateId: template?.id ?? null, targetType, totalCount: preview.recipients.length, successCount, failedCount, skippedCount: preview.skipped.length, duplicateCount: preview.duplicateCount, unknownVariables: preview.unknownVariables },
  });

  revalidatePath("/messages");
  redirect(messagesUrl({ tab: "logs", jobId }));
}

export async function saveSsodaaSettingsAction(formData: FormData) {
  const user = await requireUser();
  if (!canManageSmsSettings(user.role)) redirect(messagesUrl({ tab: "settings", error: "settings-permission" }));

  const apiKey = text(formData, "apiKey");
  const tokenKey = text(formData, "tokenKey");
  const existing = await prisma.smsProviderSetting.findUnique({ where: { academyId_provider: { academyId: user.academyId, provider: SSODAA_PROVIDER } } });
  if ((apiKey || tokenKey || !existing) && !hasAppEncryptionKey()) redirect(messagesUrl({ tab: "settings", settingsStatus: "encryption-required" }));

  await prisma.smsProviderSetting.upsert({
    where: { academyId_provider: { academyId: user.academyId, provider: SSODAA_PROVIDER } },
    create: {
      academyId: user.academyId,
      provider: SSODAA_PROVIDER,
      apiKeyEncrypted: encryptSecret(apiKey),
      tokenKeyEncrypted: encryptSecret(tokenKey),
      defaultSendPhone: normalizePhoneNumber(text(formData, "defaultSendPhone")),
      unsubPhone: normalizePhoneNumber(text(formData, "unsubPhone")),
      senderName: text(formData, "senderName") || user.academy.name,
      testReceiverPhone: normalizePhoneNumber(text(formData, "testReceiverPhone")),
      isMarketingDefault: checked(formData, "isMarketingDefault"),
      lastConnectionStatus: "NEEDS_CHECK",
      lastConnectionMessage: "저장되었습니다. 연결 테스트를 실행해주세요.",
      lastConnectionCheckedAt: new Date(),
    },
    update: {
      ...(apiKey ? { apiKeyEncrypted: encryptSecret(apiKey) } : {}),
      ...(tokenKey ? { tokenKeyEncrypted: encryptSecret(tokenKey) } : {}),
      defaultSendPhone: normalizePhoneNumber(text(formData, "defaultSendPhone")),
      unsubPhone: normalizePhoneNumber(text(formData, "unsubPhone")),
      senderName: text(formData, "senderName") || user.academy.name,
      testReceiverPhone: normalizePhoneNumber(text(formData, "testReceiverPhone")),
      isMarketingDefault: checked(formData, "isMarketingDefault"),
      lastConnectionStatus: "NEEDS_CHECK",
      lastConnectionMessage: "저장되었습니다. 연결 테스트를 실행해주세요.",
      lastConnectionCheckedAt: new Date(),
    },
  });

  await recordActivity({ actor: user, action: "UPDATE", entityType: "SmsProviderSetting", summary: "쏘다 문자 발송 설정 저장" });
  revalidatePath("/messages");
  redirect(messagesUrl({ tab: "settings", settingsStatus: "saved" }));
}

export async function testSsodaaConnectionAction() {
  const user = await requireUser();
  if (!canManageSmsSettings(user.role)) redirect(messagesUrl({ tab: "settings", error: "settings-permission" }));
  try {
    const [amount, phones] = await Promise.all([getRemainingAmount(user.academyId), listSendPhones(user.academyId)]);
    await updateSsodaaConnection(user.academyId, "CONNECTED", `연결됨. 잔여 포인트 ${amount ?? "확인됨"}, 발신번호 ${phones.length}개`);
    revalidatePath("/messages");
    redirect(messagesUrl({ tab: "settings", settingsStatus: "connected" }));
  } catch (error) {
    const message = normalizeSsodaaError(error);
    await updateSsodaaConnection(user.academyId, "FAILED", message);
    revalidatePath("/messages");
    redirect(messagesUrl({ tab: "settings", settingsStatus: "failed" }));
  }
}

export async function loadSsodaaSendPhonesAction() {
  const user = await requireUser();
  if (!canManageSmsSettings(user.role)) redirect(messagesUrl({ tab: "settings", error: "settings-permission" }));
  try {
    const phones = await listSendPhones(user.academyId);
    await updateSsodaaConnection(user.academyId, "CONNECTED", `등록 발신번호: ${phones.join(", ") || "없음"}`);
    revalidatePath("/messages");
    redirect(messagesUrl({ tab: "settings", settingsStatus: "phones" }));
  } catch (error) {
    await updateSsodaaConnection(user.academyId, "FAILED", normalizeSsodaaError(error));
    revalidatePath("/messages");
    redirect(messagesUrl({ tab: "settings", settingsStatus: "failed" }));
  }
}

export async function sendSsodaaTestMessageAction(formData: FormData) {
  const user = await requireUser();
  if (!canManageSmsSettings(user.role)) redirect(messagesUrl({ tab: "settings", error: "settings-permission" }));
  const phone = normalizePhoneNumber(text(formData, "testReceiverPhone"));
  if (!phone) redirect(messagesUrl({ tab: "settings", settingsStatus: "test-phone-required" }));
  const jobId = randomUUID();
  const recipientId = randomUUID();
  const messageText = `[${user.academy.name}] 쏘다 API 테스트 문자입니다.`;

  await prisma.$transaction([
    prisma.messageJob.create({ data: { id: jobId, academyId: user.academyId, title: "쏘다 테스트 문자", targetType: "TEST", status: "SENDING", dryRun: false, totalCount: 1, createdById: user.id } }),
    prisma.messageRecipient.create({ data: { id: recipientId, jobId, recipientType: "TEST", receiverName: "테스트 수신자", phone, normalizedPhone: phone, messageText, status: "SENDING" } }),
  ]);

  try {
    const sent = await sendSms(user.academyId, {
      recipient: { localId: recipientId, recipientType: "GUARDIAN", receiverName: "테스트 수신자", phone, normalizedPhone: phone, messageText, messageKind: "SMS", byteLength: messageText.length },
      subject: "쏘다 테스트",
    });
    await prisma.$transaction([
      prisma.messageRecipient.update({ where: { id: recipientId }, data: { status: "SUCCESS", providerMessageId: sent.providerMessageId, sentAt: new Date() } }),
      prisma.messageJob.update({ where: { id: jobId }, data: { status: "SUCCESS", successCount: 1, failedCount: 0, sentAt: new Date() } }),
      prisma.smsProviderLog.create({ data: { academyId: user.academyId, jobId, recipientId, provider: "ssodaa", requestPayload: JSON.stringify({ to: phone, test: true }).slice(0, 2000), responsePayload: JSON.stringify(sent.response).slice(0, 2000), status: "SUCCESS" } }),
    ]);
    revalidatePath("/messages");
    redirect(messagesUrl({ tab: "settings", settingsStatus: "test-sent" }));
  } catch (error) {
    const message = normalizeSsodaaError(error);
    await prisma.$transaction([
      prisma.messageRecipient.update({ where: { id: recipientId }, data: { status: "FAILED", errorMessage: message } }),
      prisma.messageJob.update({ where: { id: jobId }, data: { status: "FAILED", failedCount: 1, sentAt: new Date() } }),
      prisma.smsProviderLog.create({ data: { academyId: user.academyId, jobId, recipientId, provider: "ssodaa", requestPayload: JSON.stringify({ to: phone, test: true }).slice(0, 2000), status: "FAILED", errorMessage: message } }),
    ]);
    revalidatePath("/messages");
    redirect(messagesUrl({ tab: "settings", settingsStatus: "test-failed" }));
  }
}

async function updateSsodaaConnection(academyId: string, status: string, message: string) {
  await prisma.smsProviderSetting.upsert({
    where: { academyId_provider: { academyId, provider: SSODAA_PROVIDER } },
    create: { academyId, provider: SSODAA_PROVIDER, lastConnectionStatus: status, lastConnectionMessage: message, lastConnectionCheckedAt: new Date() },
    update: { lastConnectionStatus: status, lastConnectionMessage: message, lastConnectionCheckedAt: new Date() },
  });
}

export async function getMessageSettingsStatusAction() {
  const user = await requireUser();
  return getSmsProviderStatusForAcademy(user.academyId);
}

export async function listMessageTemplatesAction() {
  const user = await requireUser();
  if (!canComposeMessages(user.role) && !canExportFullAcademy(user.role)) return [];
  return prisma.messageTemplate.findMany({
    where: { academyId: user.academyId },
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    select: { id: true, name: true, category: true, targetType: true, title: true, body: true, variables: true, isMarketing: true, isActive: true, createdAt: true, updatedAt: true },
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
      job: { select: { id: true, title: true, dryRun: true, status: true, createdAt: true, createdBy: { select: { name: true } }, template: { select: { name: true } } } },
    },
  });
}

function emptyPreview() {
  return { recipients: [], skipped: [], duplicateCount: 0, missingPhoneCount: 0, blockedByConsentCount: 0, unknownVariables: [], missingVariables: [], maxMessageLength: 0, maxByteLength: 0 };
}
