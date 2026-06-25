"use server";

import { requireUser } from "@/lib/auth";
import { saveAssistantWorkNote } from "@/lib/assistantWorkNotes";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import {
  deletePayrollSettlement,
  getPayrollSettlements,
  isPayrollClosed,
  payrollSettlementKey,
  savePayrollSettlement,
  type PayrollSettlementStatus,
} from "./payrollSettlements";

const SHIFT_STATUSES = ["SCHEDULED", "WORKED", "ABSENT", "CANCELLED"] as const;

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return value ? String(value).trim() : "";
}

function cleanId(value: string) {
  return value && value !== "none" && value !== "-" ? value : "";
}

function dateValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function monthValue(value: string) {
  return /^\d{4}-\d{2}$/.test(value) ? value : "";
}

function timeValue(value: string, fallback: string) {
  return /^\d{2}:\d{2}$/.test(value) ? value : fallback;
}

function intValue(value: string, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : fallback;
}

function statusValue(value: string) {
  return SHIFT_STATUSES.includes(value as (typeof SHIFT_STATUSES)[number]) ? value : "SCHEDULED";
}

function canManageAssistantWork(role: string) {
  return role === "ADMIN" || role === "MANAGER" || role === "TEACHER";
}

function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const startDate = new Date(year, monthNumber - 1, 1);
  const endDate = new Date(year, monthNumber, 0);
  return { start: toYmd(startDate), end: toYmd(endDate) };
}

function toYmd(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function minutesFromTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0);
}

function shiftMinutes(shift: { startTime: string; endTime: string; breakMinutes: number; status: string }) {
  if (shift.status === "ABSENT" || shift.status === "CANCELLED") return 0;
  const raw = Math.max(0, minutesFromTime(shift.endTime) - minutesFromTime(shift.startTime));
  return Math.max(0, raw - shift.breakMinutes);
}

function shiftPay(shift: { startTime: string; endTime: string; breakMinutes: number; hourlyWage: number; status: string }) {
  return Math.round((shiftMinutes(shift) / 60) * shift.hourlyWage);
}

async function closedPayrollRequiresReason(academyId: string, assistantId: string, workDate: string, reason: string) {
  const settlements = await getPayrollSettlements(academyId);
  const settlement = settlements[payrollSettlementKey(assistantId, workDate.slice(0, 7))];
  return isPayrollClosed(settlement) && !reason;
}

function appendEditReason(memo: string | null, reason: string, actorName: string) {
  if (!reason) return memo;
  const line = `마감 후 수정 사유(${actorName}): ${reason.slice(0, 200)}`;
  return [memo, line].filter(Boolean).join("\n");
}

async function resolveAssistantId(formData: FormData, user: { id: string; academyId: string; role: string }) {
  if (user.role === "ASSISTANT") return user.id;
  if (!canManageAssistantWork(user.role)) return "";

  const assistantId = cleanId(text(formData, "assistantId"));
  if (!assistantId) return "";
  const assistant = await prisma.user.findFirst({
    where: {
      id: assistantId,
      academyId: user.academyId,
      role: "ASSISTANT",
      isActive: true,
    },
    select: { id: true },
  });
  return assistant?.id ?? "";
}

export async function saveWorkShiftAction(formData: FormData) {
  const user = await requireUser();
  const assistantId = await resolveAssistantId(formData, user);
  const workDate = dateValue(text(formData, "workDate"));
  if (!assistantId || !workDate) return;

  const shiftId = cleanId(text(formData, "shiftId"));
  const editReason = text(formData, "editReason");
  if (await closedPayrollRequiresReason(user.academyId, assistantId, workDate, editReason)) return;

  const data = {
    assistantId,
    workDate,
    startTime: timeValue(text(formData, "startTime"), "14:00"),
    endTime: timeValue(text(formData, "endTime"), "18:00"),
    breakMinutes: intValue(text(formData, "breakMinutes")),
    hourlyWage: intValue(text(formData, "hourlyWage")),
    status: statusValue(text(formData, "status")),
    memo: appendEditReason(text(formData, "memo") || null, editReason, user.name),
  };

  if (shiftId) {
    const shift = await prisma.assistantWorkShift.findFirst({
      where: {
        id: shiftId,
        academyId: user.academyId,
        ...(user.role === "ASSISTANT" ? { assistantId: user.id } : {}),
      },
      select: { id: true },
    });
    if (!shift) return;

    await prisma.assistantWorkShift.update({
      where: { id: shift.id },
      data,
    });
  } else {
    await prisma.assistantWorkShift.create({
      data: {
        academyId: user.academyId,
        createdById: user.id,
        ...data,
      },
    });
  }

  revalidatePath("/work");
  revalidatePath("/staff");
}

export async function deleteWorkShiftAction(formData: FormData) {
  const user = await requireUser();
  const shiftId = cleanId(text(formData, "shiftId"));
  if (!shiftId) return;

  const shift = await prisma.assistantWorkShift.findFirst({
    where: {
      id: shiftId,
      academyId: user.academyId,
      ...(user.role === "ASSISTANT" ? { assistantId: user.id } : {}),
    },
    select: { assistantId: true, workDate: true },
  });
  if (!shift) return;

  const editReason = text(formData, "editReason");
  if (await closedPayrollRequiresReason(user.academyId, shift.assistantId, shift.workDate, editReason)) return;

  await prisma.assistantWorkShift.deleteMany({
    where: {
      id: shiftId,
      academyId: user.academyId,
      ...(user.role === "ASSISTANT" ? { assistantId: user.id } : {}),
    },
  });

  revalidatePath("/work");
  revalidatePath("/staff");
}

export async function updatePayrollSettlementAction(formData: FormData) {
  const user = await requireUser();
  if (!canManageAssistantWork(user.role)) return;

  const assistantId = await resolveAssistantId(formData, user);
  const month = monthValue(text(formData, "month"));
  const nextStatus = text(formData, "settlementStatus");
  const note = text(formData, "settlementNote");
  if (!assistantId || !month) return;

  if (nextStatus === "OPEN") {
    await deletePayrollSettlement(user.academyId, assistantId, month);
    revalidatePath("/work");
    revalidatePath("/staff");
    return;
  }

  const status: PayrollSettlementStatus = nextStatus === "PAID" ? "PAID" : "FINALIZED";
  const { start, end } = monthRange(month);
  const shifts = await prisma.assistantWorkShift.findMany({
    where: {
      academyId: user.academyId,
      assistantId,
      workDate: { gte: start, lte: end },
    },
    select: {
      startTime: true,
      endTime: true,
      breakMinutes: true,
      hourlyWage: true,
      status: true,
    },
  });

  const existing = (await getPayrollSettlements(user.academyId))[payrollSettlementKey(assistantId, month)];
  const now = new Date().toISOString();
  await savePayrollSettlement(user.academyId, {
    assistantId,
    month,
    status,
    totalMinutes: shifts.reduce((sum, shift) => sum + shiftMinutes(shift), 0),
    totalPay: shifts.reduce((sum, shift) => sum + shiftPay(shift), 0),
    shiftCount: shifts.length,
    note: note || existing?.note,
    updatedById: user.id,
    updatedByName: user.name,
    updatedAt: now,
    finalizedAt: existing?.finalizedAt ?? now,
    paidAt: status === "PAID" ? now : existing?.paidAt,
  });

  revalidatePath("/work");
  revalidatePath("/staff");
}

export async function saveAssistantWorkNoteAction(formData: FormData) {
  const user = await requireUser();
  if (!canManageAssistantWork(user.role)) return;

  const assistantId = cleanId(text(formData, "assistantId"));
  if (!assistantId) return;

  const assistant = await prisma.user.findFirst({
    where: {
      id: assistantId,
      academyId: user.academyId,
      role: "ASSISTANT",
      isActive: true,
    },
    select: { id: true },
  });
  if (!assistant) return;

  await saveAssistantWorkNote({
    academyId: user.academyId,
    assistantId,
    content: text(formData, "content"),
    actor: { id: user.id, name: user.name },
  });

  revalidatePath("/work");
  revalidatePath("/staff");
}
