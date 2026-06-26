import crypto from "crypto";
import type { SmsProvider, SmsProviderStatus, SmsRecipientPayload, SmsSendResult } from "@/lib/sms/types";

const SOLAPI_BASE_URL = "https://api.solapi.com";

export function createSolapiProvider(status: SmsProviderStatus): SmsProvider {
  return {
    name: "solapi",
    getProviderStatus() {
      return status;
    },
    async sendMessage(message: SmsRecipientPayload) {
      return sendSolapiMessage(message, status);
    },
    async sendBulkMessages(messages: SmsRecipientPayload[]) {
      const results: SmsSendResult[] = [];
      for (const message of messages) {
        results.push(await sendSolapiMessage(message, status));
      }
      return results;
    },
  };
}

async function sendSolapiMessage(message: SmsRecipientPayload, status: SmsProviderStatus): Promise<SmsSendResult> {
  const apiKey = process.env.SMS_API_KEY;
  const apiSecret = process.env.SMS_API_SECRET;
  const senderNumber = status.senderNumber;

  if (!apiKey || !apiSecret || !senderNumber || status.dryRun || !status.canSendActual) {
    return {
      localId: message.localId,
      status: "FAILED",
      errorMessage: "SMS provider is not configured for actual sending.",
    };
  }

  const body = {
    message: {
      to: message.normalizedPhone,
      from: senderNumber,
      text: message.messageText,
    },
  };

  try {
    const response = await fetch(`${SOLAPI_BASE_URL}/messages/v4/send`, {
      method: "POST",
      headers: {
        Authorization: solapiAuthorization(apiKey, apiSecret),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const responseText = await response.text();
    const parsed = parseJson(responseText);

    if (!response.ok) {
      return {
        localId: message.localId,
        status: "FAILED",
        errorMessage: providerErrorMessage(parsed, response.status),
        responsePayload: sanitizeProviderResponse(parsed ?? responseText),
      };
    }

    return {
      localId: message.localId,
      status: "SUCCESS",
      providerMessageId: providerMessageId(parsed),
      responsePayload: sanitizeProviderResponse(parsed ?? responseText),
    };
  } catch (error) {
    return {
      localId: message.localId,
      status: "FAILED",
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

function solapiAuthorization(apiKey: string, apiSecret: string) {
  const date = new Date().toISOString();
  const salt = crypto.randomUUID();
  const signature = crypto.createHmac("sha256", apiSecret).update(date + salt).digest("hex");
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function providerMessageId(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  return String(record.messageId ?? record.groupId ?? record.requestId ?? "") || null;
}

function providerErrorMessage(payload: unknown, status: number) {
  if (!payload || typeof payload !== "object") return `Solapi request failed with HTTP ${status}.`;
  const record = payload as Record<string, unknown>;
  return String(record.errorMessage ?? record.message ?? record.errorCode ?? `Solapi request failed with HTTP ${status}.`);
}

function sanitizeProviderResponse(payload: unknown) {
  if (!payload || typeof payload !== "object") return payload;
  const record = { ...(payload as Record<string, unknown>) };
  delete record.apiKey;
  delete record.apiSecret;
  delete record.signature;
  return record;
}
