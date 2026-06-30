import { normalizePhoneNumber } from "@/lib/phone";
import { createDryRunProvider } from "@/lib/sms/dryRunProvider";
import { createSolapiProvider } from "@/lib/sms/solapi";
import { createSsodaaProvider, getSsodaaProviderStatus } from "@/lib/sms/ssodaa";
import type { SmsProvider, SmsProviderName, SmsProviderStatus } from "@/lib/sms/types";

export function getSmsProvider(forceDryRun = false): SmsProvider {
  const status = getSmsProviderStatus();
  if (forceDryRun || status.dryRun || !status.canSendActual) return createDryRunProvider(status);
  if (status.provider === "solapi") return createSolapiProvider(status);
  return createDryRunProvider(status);
}

export async function getSmsProviderForAcademy(academyId: string, forceDryRun = false): Promise<SmsProvider> {
  const status = await getSmsProviderStatusForAcademy(academyId);
  if (forceDryRun || status.dryRun || !status.canSendActual) return createDryRunProvider({ ...status, dryRun: true, canSendActual: false });
  if (status.provider === "ssodaa") return createSsodaaProvider(academyId, status);
  if (status.provider === "solapi") return createSolapiProvider(status);
  return createDryRunProvider(status);
}

export function getSmsProviderStatus(): SmsProviderStatus {
  const provider = providerName(process.env.SMS_PROVIDER);
  const apiKey = process.env.SMS_API_KEY?.trim();
  const apiSecret = process.env.SMS_API_SECRET?.trim();
  const senderNumber = normalizePhoneNumber(process.env.SMS_SENDER_NUMBER);
  const dryRun = process.env.SMS_DRY_RUN !== "false";
  const hasApiKey = Boolean(apiKey);
  const hasApiSecret = Boolean(apiSecret);
  const hasSenderNumber = Boolean(senderNumber);
  const canSendActual = !dryRun && provider === "solapi" && hasApiKey && hasApiSecret && hasSenderNumber;

  return {
    provider,
    dryRun,
    senderNumber: senderNumber || null,
    hasSenderNumber,
    hasApiKey,
    hasApiSecret,
    canSendActual,
    marketingDisabled: true,
    reason: canSendActual ? null : disabledReason({ dryRun, provider, hasApiKey, hasApiSecret, hasSenderNumber }),
    source: provider === "solapi" && (hasApiKey || hasApiSecret || hasSenderNumber) ? "environment" : "none",
  };
}

export async function getSmsProviderStatusForAcademy(academyId: string): Promise<SmsProviderStatus> {
  const requestedProvider = providerName(process.env.SMS_PROVIDER);
  const ssodaaStatus = await getSsodaaProviderStatus(academyId);
  if (requestedProvider === "ssodaa" || ssodaaStatus.source !== "none") return ssodaaStatus;
  return getSmsProviderStatus();
}

function providerName(value?: string): SmsProviderName {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "solapi") return "solapi";
  if (normalized === "ssodaa") return "ssodaa";
  return "dry-run";
}

function disabledReason({
  dryRun,
  provider,
  hasApiKey,
  hasApiSecret,
  hasSenderNumber,
}: {
  dryRun: boolean;
  provider: SmsProviderName;
  hasApiKey: boolean;
  hasApiSecret: boolean;
  hasSenderNumber: boolean;
}) {
  if (dryRun) return "SMS_DRY_RUN이 false가 아니므로 실제 발송이 차단되어 있습니다.";
  if (provider !== "solapi") return "실제 발송 provider가 설정되어 있지 않습니다. 쏘다는 문자 발송 설정에서 저장하거나 SMS_PROVIDER=ssodaa로 설정하세요.";
  if (!hasApiKey) return "SMS_API_KEY가 설정되어 있지 않습니다.";
  if (!hasApiSecret) return "SMS_API_SECRET이 설정되어 있지 않습니다.";
  if (!hasSenderNumber) return "SMS_SENDER_NUMBER가 설정되어 있지 않습니다.";
  return "실제 발송 조건을 확인해야 합니다.";
}
