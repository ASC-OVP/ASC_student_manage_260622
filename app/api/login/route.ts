import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  verifyPassword,
} from "@/lib/auth";

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
  const academyCode = text(formData, "academyCode");
  const loginId = text(formData, "loginId");
  const password = text(formData, "password");

  if (!academyCode || !loginId || !password) {
    return redirectTo("/login?error=empty");
  }

  const academy = await prisma.academy.findUnique({
    where: { code: academyCode },
  });
  if (!academy) {
    return redirectTo("/login?error=invalid");
  }

  const user = await prisma.user.findUnique({
    where: { academyId_loginId: { academyId: academy.id, loginId } },
  });
  if (!user || !user.isActive || !verifyPassword(password, user.passwordHash)) {
    return redirectTo("/login?error=invalid");
  }

  const response = redirectTo("/dashboard");
  response.cookies.set(SESSION_COOKIE, user.id, SESSION_COOKIE_OPTIONS);
  return response;
}
