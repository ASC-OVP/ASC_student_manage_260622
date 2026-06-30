import { formatPhoneNumber, normalizePhoneNumber } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { createDryRunProvider } from "@/lib/sms/dryRunProvider";
import { decryptSecret, maskSecret } from "@/lib/sms/secureSettings";
import type { SmsProvider, SmsProviderStatus, SmsRecipientPayload, SmsSendResult } from "@/lib/sms/types";

const SSODAA_BASE_URL = process.env.SSODAA_API_BASE_URL?.trim() || "https://apis.ssodaa.com";
const SSODAA_PROVIDER = "SSODAA";

export type SsodaaConfig = {
  apiKey: string;
  tokenKey: string;
  defaultSendPhone: string;
  unsubPhone: string;
  senderName: string;
  testReceiverPhone: string;
  isMarketingDefault: boolean;
  source: "database" | "environment";
  lastConnectionStatus?: string | null;
  lastConnectionMessage?: string | null;
  lastConnectionCheckedAt?: Date | null;
};

export async function getSsodaaConfig(academyId: string): Promise<SsodaaConfig | null> {
  const setting = await prisma.smsProviderSetting.findUnique({
    where: { academyId_provider: { academyId, provider: SSODAA_PROVIDER } },
  });

  if (setting?.apiKeyEncrypted || setting?.tokenKeyEncrypted || setting?.defaultSendPhone) {
    const apiKey = decryptSecret(setting.apiKeyEncrypted);
    const tokenKey = decryptSecret(setting.tokenKeyEncrypted);
    return {
      apiKey,
      tokenKey,
      defaultSendPhone: normalizePhoneNumber(setting.defaultSendPhone),
      unsubPhone: normalizePhoneNumber(setting.unsubPhone),
      senderName: setting.senderName?.trim() || process.env.SSODAA_SENDER_NAME?.trim() || "ASC",
      testReceiverPhone: normalizePhoneNumber(setting.testReceiverPhone),
      isMarketingDefault: setting.isMarketingDefault,
      source: "database",
      lastConnectionStatus: setting.lastConnectionStatus,
      lastConnectionMessage: setting.lastConnectionMessage,
      lastConnectionCheckedAt: setting.lastConnectionCheckedAt,
    };
  }

  const apiKey = process.env.SSODAA_API_KEY?.trim() || "";
  const tokenKey = process.env.SSODAA_TOKEN_KEY?.trim() || "";
  const defaultSendPhone = normalizePhoneNumber(process.env.SSODAA_DEFAULT_SEND_PHONE);
  if (!apiKey && !tokenKey && !defaultSendPhone) return null;

  return {
    apiKey,
    tokenKey,
    defaultSendPhone,
    unsubPhone: normalizePhoneNumber(process.env.SSODAA_UNSUB_PHONE),
    senderName: process.env.SSODAA_SENDER_NAME?.trim() || "ASC",
    testReceiverPhone: normalizePhoneNumber(process.env.SSODAA_TEST_RECEIVER_PHONE),
    isMarketingDefault: false,
    source: "environment",
  };
}

export async function getSsodaaProviderStatus(academyId: string): Promise<SmsProviderStatus> {
  let config: SsodaaConfig | null = null;
  let configError: string | null = null;
  try {
    config = await getSsodaaConfig(academyId);
  } catch (error) {
    configError = normalizeSsodaaError(error);
  }

  const dryRun = process.env.SMS_DRY_RUN !== "false";
  const hasApiKey = Boolean(config?.apiKey);
  const hasApiSecret = Boolean(config?.tokenKey);
  const hasSenderNumber = Boolean(config?.defaultSendPhone);
  const canSendActual = !dryRun && hasApiKey && hasApiSecret && hasSenderNumber && config?.lastConnectionStatus !== "FAILED";
  const reason = configError ?? ssodaaDisabledReason({ dryRun, hasApiKey, hasApiSecret, hasSenderNumber, connectionStatus: config?.lastConnectionStatus });

  return {
    provider: "ssodaa",
    dryRun,
    senderNumber: config?.defaultSendPhone || null,
    hasSenderNumber,
    hasApiKey,
    hasApiSecret,
    canSendActual,
    marketingDisabled: false,
    reason: canSendActual ? null : reason,
    connectionStatus: (config?.lastConnectionStatus as SmsProviderStatus["connectionStatus"]) ?? (config ? "NEEDS_CHECK" : null),
    connectionMessage: config?.lastConnectionMessage ?? null,
    checkedAt: config?.lastConnectionCheckedAt?.toISOString() ?? null,
    maskedApiKey: config?.apiKey ? maskSecret(config.apiKey) : null,
    maskedTokenKey: config?.tokenKey ? maskSecret(config.tokenKey) : null,
    unsubPhone: config?.unsubPhone || null,
    senderName: config?.senderName || null,
    testReceiverPhone: config?.testReceiverPhone || null,
    isMarketingDefault: config?.isMarketingDefault ?? false,
    source: config?.source ?? "none",
  };
}

export async function listSendPhones(academyId: string) {
  const response = await ssodaaRequest(academyId, "/sms/sendphone/list", {});
  return extractPhoneList(response).map(formatPhoneNumber);
}

export async function getRemainingAmount(academyId: string) {
  const response = await ssodaaRequest(academyId, "/sms/remaining/amount", {});
  return extractAmount(response);
}

export async function getSentMessages(academyId: string, filters: Record<string, string | number | undefined> = {}) {
  return ssodaaRequest(academyId, "/sms/sent/list", filters);
}

export async function sendSms(academyId: string, payload: {
  recipient: SmsRecipientPayload;
  subject?: string;
  sendTime?: string;
  sendPhone?: string;
}) {
  const config = await requireSsodaaConfig(academyId);
  const isMarketing = Boolean(payload.recipient.isMarketing);
  const messageBody = buildSsodaaMessageBody(payload.recipient.messageText, isMarketing, config.unsubPhone);
  const requestPayload = {
    msg_type: payload.recipient.messageKind ?? (payload.recipient.byteLength && payload.recipient.byteLength > 90 ? "LMS" : "SMS"),
    dest_phone: payload.recipient.normalizedPhone,
    send_phone: normalizePhoneNumber(payload.sendPhone) || config.defaultSendPhone,
    subject: payload.subject || payload.recipient.subject || config.senderName || "ASC",
    msg_body: messageBody,
    send_time: payload.sendTime || "",
    msg_ad: isMarketing ? "Y" : "N",
    unsub_phone: isMarketing ? config.unsubPhone : "",
  };

  const response = await ssodaaRequestWithConfig(config, "/sms/send/sms", requestPayload);
  return {
    response,
    providerMessageId: extractProviderMessageId(response),
    requestPayload,
  };
}

export function createSsodaaProvider(academyId: string, status: SmsProviderStatus): SmsProvider {
  if (status.dryRun || !status.canSendActual) return createDryRunProvider({ ...status, dryRun: true, canSendActual: false });

  return {
    name: "ssodaa",
    getProviderStatus() {
      return status;
    },
    async sendMessage(message: SmsRecipientPayload) {
      try {
        const sent = await sendSms(academyId, { recipient: message, subject: message.subject });
        return {
          localId: message.localId,
          status: "SUCCESS",
          providerMessageId: sent.providerMessageId,
          responsePayload: sent.response,
        } satisfies SmsSendResult;
      } catch (error) {
        return {
          localId: message.localId,
          status: "FAILED",
          errorMessage: normalizeSsodaaError(error),
        } satisfies SmsSendResult;
      }
    },
    async sendBulkMessages(messages: SmsRecipientPayload[]) {
      const results: SmsSendResult[] = [];
      for (const message of messages) results.push(await this.sendMessage(message));
      return results;
    },
  };
}

async function requireSsodaaConfig(academyId: string) {
  const config = await getSsodaaConfig(academyId);
  if (!config?.apiKey) throw new Error("쏘다 API Key가 설정되어 있지 않습니다.");
  if (!config.tokenKey) throw new Error("쏘다 Token Key가 설정되어 있지 않습니다.");
  if (!config.defaultSendPhone) throw new Error("쏘다 기본 발신번호가 설정되어 있지 않습니다.");
  return config;
}

async function ssodaaRequest(academyId: string, path: string, body: Record<string, unknown>) {
  const config = await requireSsodaaConfig(academyId);
  return ssodaaRequestWithConfig(config, path, body);
}

async function ssodaaRequestWithConfig(config: SsodaaConfig, path: string, body: Record<string, unknown>) {
  const response = await fetch(`${SSODAA_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "x-api-key": config.apiKey,
    },
    body: JSON.stringify({ token_key: config.tokenKey, ...body }),
    cache: "no-store",
  });

  const text = await response.text();
  let json: unknown = text;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!response.ok || isSsodaaFailure(json)) {
    throw new SsodaaApiError(response.status, json);
  }

  return json;
}

function isSsodaaFailure(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  const code = String(obj.code ?? obj.result_code ?? obj.resultCode ?? obj.status ?? "").toLowerCase();
  const success = obj.success;
  if (success === false) return true;
  return Boolean(code && !["0", "00", "0000", "success", "ok", "200"].includes(code));
}

class SsodaaApiError extends Error {
  constructor(public status: number, public payload: unknown) {
    super("Ssodaa API request failed");
  }
}

export function normalizeSsodaaError(error: unknown) {
  if (error instanceof SsodaaApiError) {
    const message = extractMessage(error.payload);
    if (message) return message;
    if (error.status === 401 || error.status === 403) return "API Key, Token Key 또는 서버 IP 등록 상태를 확인해주세요.";
    return `쏘다 API 요청에 실패했습니다. 상태 코드: ${error.status}`;
  }
  if (error instanceof Error) return error.message;
  return "쏘다 API 요청에 실패했습니다.";
}

function extractMessage(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const candidates = [obj.message, obj.msg, obj.error, obj.errorMessage, obj.result_msg, obj.resultMessage];
  const found = candidates.find((item) => typeof item === "string" && item.trim());
  return typeof found === "string" ? found : null;
}

function extractPhoneList(value: unknown): string[] {
  const arrays: unknown[] = [];
  if (Array.isArray(value)) arrays.push(value);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of ["data", "list", "items", "sendphones", "sendPhones"]) {
      if (Array.isArray(obj[key])) arrays.push(obj[key]);
    }
  }
  return arrays.flatMap((items) =>
    Array.isArray(items)
      ? items.map((item) => {
          if (typeof item === "string") return normalizePhoneNumber(item);
          if (item && typeof item === "object") {
            const row = item as Record<string, unknown>;
            const rawPhone = row.send_phone ?? row.sendPhone ?? row.phone ?? row.number ?? row.send_phone_number;
            return typeof rawPhone === "string" || typeof rawPhone === "number" ? normalizePhoneNumber(String(rawPhone)) : "";
          }
          return "";
        })
      : [],
  ).filter(Boolean);
}

function extractAmount(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const nested = obj.data && typeof obj.data === "object" ? (obj.data as Record<string, unknown>) : obj;
  for (const key of ["amount", "remaining_amount", "remainingAmount", "point", "points", "balance"]) {
    const raw = nested[key];
    const number = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/,/g, ""));
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function extractProviderMessageId(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const nested = obj.data && typeof obj.data === "object" ? (obj.data as Record<string, unknown>) : obj;
  const id = nested.msg_id ?? nested.messageId ?? nested.message_id ?? nested.id ?? nested.group_id ?? nested.groupId;
  return id ? String(id) : null;
}

function buildSsodaaMessageBody(message: string, isMarketing: boolean, unsubPhone: string) {
  if (!isMarketing) return message;
  const prefix = message.trimStart().startsWith("(광고)") ? "" : "(광고) ";
  const unsub = unsubPhone ? `\n무료수신거부 ${formatPhoneNumber(unsubPhone)}` : "";
  return `${prefix}${message}${message.includes("무료수신거부") ? "" : unsub}`;
}

function ssodaaDisabledReason({ dryRun, hasApiKey, hasApiSecret, hasSenderNumber, connectionStatus }: {
  dryRun: boolean;
  hasApiKey: boolean;
  hasApiSecret: boolean;
  hasSenderNumber: boolean;
  connectionStatus?: string | null;
}) {
  if (dryRun) return "SMS_DRY_RUN이 false가 아니므로 실제 발송이 차단되어 있습니다.";
  if (!hasApiKey) return "쏘다 API Key가 설정되어 있지 않습니다.";
  if (!hasApiSecret) return "쏘다 Token Key가 설정되어 있지 않습니다.";
  if (!hasSenderNumber) return "쏘다 기본 발신번호가 설정되어 있지 않습니다.";
  if (connectionStatus === "FAILED") return "쏘다 API 연결 테스트가 실패 상태입니다.";
  return "쏘다 API 설정 확인이 필요합니다.";
}

