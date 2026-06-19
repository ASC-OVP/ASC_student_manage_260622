"use server";

import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function createFirstWorkspace(formData: FormData) {
  const academyName = text(formData, "academyName");
  const academyCode = text(formData, "academyCode");
  const name = text(formData, "name");
  const loginId = text(formData, "loginId");
  const password = text(formData, "password");

  if (!academyName || !academyCode || !name || !loginId || !password) {
    redirect("/setup?error=empty");
  }

  const existingAcademy = await prisma.academy.findUnique({
    where: { code: academyCode },
    select: { id: true },
  });

  if (existingAcademy) {
    redirect("/setup?error=duplicate");
  }

  const academy = await prisma.academy.create({ data: { name: academyName, code: academyCode } });
  await prisma.user.create({
    data: {
      academyId: academy.id,
      name,
      loginId,
      passwordHash: hashPassword(password),
      role: "ADMIN",
    },
  });

  redirect("/login?created=1");
}
