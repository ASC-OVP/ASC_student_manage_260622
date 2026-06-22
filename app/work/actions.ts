"use server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

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
  const data = {
    assistantId,
    workDate,
    startTime: timeValue(text(formData, "startTime"), "14:00"),
    endTime: timeValue(text(formData, "endTime"), "18:00"),
    breakMinutes: intValue(text(formData, "breakMinutes")),
    hourlyWage: intValue(text(formData, "hourlyWage")),
    status: statusValue(text(formData, "status")),
    memo: text(formData, "memo") || null,
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
