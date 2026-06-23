import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function redirectTo(path: string) {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: path },
  });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const academyName = text(formData, "academyName");
  const academyCode = text(formData, "academyCode");
  const name = text(formData, "name");
  const loginId = text(formData, "loginId");
  const password = text(formData, "password");

  if (!academyName || !academyCode || !name || !loginId || !password) {
    return redirectTo("/setup?error=empty");
  }

  const existingAcademy = await prisma.academy.findUnique({
    where: { code: academyCode },
    select: { id: true },
  });

  if (existingAcademy) {
    return redirectTo("/setup?error=duplicate");
  }

  await prisma.$transaction(async (tx) => {
    const academy = await tx.academy.create({
      data: { name: academyName, code: academyCode },
      select: { id: true },
    });

    await tx.user.create({
      data: {
        academyId: academy.id,
        name,
        loginId,
        passwordHash: hashPassword(password),
        role: "ADMIN",
      },
    });
  });

  return redirectTo("/login?created=1");
}
