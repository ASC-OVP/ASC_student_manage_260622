import type { SmsProvider, SmsProviderStatus, SmsRecipientPayload, SmsSendResult } from "@/lib/sms/types";

export function createDryRunProvider(status: SmsProviderStatus): SmsProvider {
  return {
    name: "dry-run",
    getProviderStatus() {
      return { ...status, dryRun: true, canSendActual: false };
    },
    async sendMessage(message: SmsRecipientPayload) {
      return dryRunResult(message);
    },
    async sendBulkMessages(messages: SmsRecipientPayload[]) {
      return messages.map(dryRunResult);
    },
  };
}

function dryRunResult(message: SmsRecipientPayload): SmsSendResult {
  return {
    localId: message.localId,
    status: "DRY_RUN",
    providerMessageId: `dry-run:${message.localId}`,
    responsePayload: {
      dryRun: true,
      to: message.normalizedPhone,
      length: message.messageText.length,
    },
  };
}
