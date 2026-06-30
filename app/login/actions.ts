"use server";

import { prisma } from "@/lib/prisma";
import { setSession, verifyPassword } from "@/lib/auth";
import { redirect } from "next/navigation";

function getText(formData: FormData, key: string) {
  const value = formData.get(key);
  if (!value) return "";
  return String(value).trim();
}

export async function loginAction(formData: FormData) {
  const academyCode = getText(formData, "academyCode");
  const loginId = getText(formData, "loginId");
  const password = getText(formData, "password");

  if (!academyCode || !loginId || !password) {
    redirect("/login?error=empty");
  }

  const academy = await prisma.academy.findUnique({
    where: {
      code: academyCode,
    },
  });

  if (!academy) {
    redirect("/login?error=invalid");
  }

  const user = await prisma.user.findUnique({
    where: {
      academyId_loginId: {
        academyId: academy.id,
        loginId,
      },
    },
  });

  if (!user || !user.isActive || !verifyPassword(password, user.passwordHash)) {
    redirect("/login?error=invalid");
  }

  await setSession(user.id);

  redirect("/dashboard");
}