"use server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return value ? String(value).trim() : "";
}

function dateValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

export async function saveCalendarPrivateMemoAction(formData: FormData) {
  const user = await requireUser();
  const date = dateValue(text(formData, "date"));
  const content = text(formData, "content");
  if (!date) return;

  if (!content) {
    await prisma.calendarPrivateMemo.deleteMany({
      where: {
        userId: user.id,
        date,
      },
    });
  } else {
    await prisma.calendarPrivateMemo.upsert({
      where: {
        userId_date: {
          userId: user.id,
          date,
        },
      },
      update: { content },
      create: {
        academyId: user.academyId,
        userId: user.id,
        date,
        content,
      },
    });
  }

  revalidatePath("/calendar");
}
