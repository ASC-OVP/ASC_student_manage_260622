import { prisma } from "@/lib/prisma";

export const payrollSettlementSettingKey = "assistantPayrollSettlements.v1";

export type PayrollSettlementStatus = "FINALIZED" | "PAID";

export type PayrollSettlementRecord = {
  assistantId: string;
  month: string;
  status: PayrollSettlementStatus;
  totalMinutes: number;
  totalPay: number;
  shiftCount: number;
  note?: string;
  updatedById: string;
  updatedByName: string;
  updatedAt: string;
  finalizedAt?: string;
  paidAt?: string;
};

export type PayrollSettlements = Record<string, PayrollSettlementRecord>;

export function payrollSettlementKey(assistantId: string, month: string) {
  return `${assistantId}:${month}`;
}

export function isPayrollClosed(record?: PayrollSettlementRecord) {
  return record?.status === "FINALIZED" || record?.status === "PAID";
}

export async function getPayrollSettlements(academyId: string) {
  const setting = await prisma.academySetting.findUnique({
    where: { academyId_key: { academyId, key: payrollSettlementSettingKey } },
    select: { value: true },
  });

  return normalizePayrollSettlements(parseJson(setting?.value));
}

export async function savePayrollSettlement(academyId: string, record: PayrollSettlementRecord) {
  const settlements = await getPayrollSettlements(academyId);
  settlements[payrollSettlementKey(record.assistantId, record.month)] = record;
  await savePayrollSettlements(academyId, settlements);
}

export async function deletePayrollSettlement(academyId: string, assistantId: string, month: string) {
  const settlements = await getPayrollSettlements(academyId);
  delete settlements[payrollSettlementKey(assistantId, month)];
  await savePayrollSettlements(academyId, settlements);
}

async function savePayrollSettlements(academyId: string, settlements: PayrollSettlements) {
  await prisma.academySetting.upsert({
    where: { academyId_key: { academyId, key: payrollSettlementSettingKey } },
    create: {
      academyId,
      key: payrollSettlementSettingKey,
      value: JSON.stringify(settlements),
    },
    update: {
      value: JSON.stringify(settlements),
    },
  });
}

function normalizePayrollSettlements(value: unknown): PayrollSettlements {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const settlements: PayrollSettlements = {};
  for (const [key, rawRecord] of Object.entries(value as Record<string, unknown>)) {
    if (!rawRecord || typeof rawRecord !== "object" || Array.isArray(rawRecord)) continue;
    const record = rawRecord as Partial<PayrollSettlementRecord>;
    const assistantId = safeId(record.assistantId);
    const month = monthValue(record.month);
    const status = record.status === "PAID" ? "PAID" : record.status === "FINALIZED" ? "FINALIZED" : "";
    if (!assistantId || !month || !status) continue;

    settlements[key] = {
      assistantId,
      month,
      status,
      totalMinutes: nonNegativeInt(record.totalMinutes),
      totalPay: nonNegativeInt(record.totalPay),
      shiftCount: nonNegativeInt(record.shiftCount),
      note: String(record.note ?? "").slice(0, 500) || undefined,
      updatedById: safeId(record.updatedById),
      updatedByName: String(record.updatedByName ?? "").slice(0, 80) || "관리자",
      updatedAt: isoString(record.updatedAt),
      finalizedAt: record.finalizedAt ? isoString(record.finalizedAt) : undefined,
      paidAt: record.paidAt ? isoString(record.paidAt) : undefined,
    };
  }

  return settlements;
}

function parseJson(value?: string) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function safeId(value: unknown) {
  const id = String(value ?? "").trim();
  return /^[A-Za-z0-9_-]{1,80}$/.test(id) ? id : "";
}

function monthValue(value: unknown) {
  const month = String(value ?? "").trim();
  return /^\d{4}-\d{2}$/.test(month) ? month : "";
}

function nonNegativeInt(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : 0;
}

function isoString(value: unknown) {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}
