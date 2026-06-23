"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { MemoType } from "@/lib/generated/prisma";
import { prisma } from "@/lib/prisma";

const memoTypes = Object.values(MemoType) as MemoType[];

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function selectedStudentMemoIds(formData: FormData) {
  return formData
    .getAll("studentMemoIds")
    .map(String)
    .map((value) => value.trim())
    .filter(Boolean);
}

function safeReturnTo(value: string) {
  return value.startsWith("/memos") ? value : "/memos";
}

export async function bulkStudentMemoAction(formData: FormData) {
  const user = await requireUser();
  const action = text(formData, "bulkAction");
  const returnTo = safeReturnTo(text(formData, "returnTo"));
  const ids = selectedStudentMemoIds(formData);

  if (ids.length === 0) redirect(returnTo);

  if (action === "pin" || action === "unpin") {
    await prisma.studentMemo.updateMany({
      where: {
        id: { in: ids },
        student: { academyId: user.academyId },
      },
      data: { isImportant: action === "pin" },
    });
  }

  if (action === "type") {
    const nextType = text(formData, "memoType") as MemoType;
    if (memoTypes.includes(nextType)) {
      await prisma.studentMemo.updateMany({
        where: {
          id: { in: ids },
          student: { academyId: user.academyId },
        },
        data: { type: nextType },
      });
    }
  }

  revalidatePath("/memos");
  revalidatePath("/students");
  redirect(returnTo);
}
