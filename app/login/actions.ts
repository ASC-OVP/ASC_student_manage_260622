"use server";

import { prisma } from "@/lib/prisma";
import { setSession, verifyPassword } from "@/lib/auth";
import { redirect } from "next/navigation";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function loginAction(formData: FormData) {
  const academyCode = text(formData, "academyCode");
  const loginId = text(formData, "loginId");
  const password = text(formData, "password");
  if (!academyCode || !loginId || !password) redirect("/login?error=empty");

  const academy = await prisma.academy.findUnique({ where: { code: academyCode } });
  if (!academy) redirect("/login?error=invalid");

  const user = await prisma.user.findUnique({ where: { academyId_loginId: { academyId: academy.id, loginId } } });
  if (!user || !user.isActive || !verifyPassword(password, user.passwordHash)) {
    redirect("/login?error=invalid");
  }

  await setSession(user.id);
  redirect("/dashboard");
}
