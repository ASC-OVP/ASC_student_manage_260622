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

function redirectTo(request: Request, path: string) {
  const url = new URL(path, request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto");

  if (host) {
    url.host = host.split(",")[0].trim();
  }

  if (proto) {
    url.protocol = `${proto.split(",")[0].trim()}:`;
  }

  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const academyCode = text(formData, "academyCode");
  const loginId = text(formData, "loginId");
  const password = text(formData, "password");

  if (!academyCode || !loginId || !password) {
    return redirectTo(request, "/login?error=empty");
  }

  const academy = await prisma.academy.findUnique({
    where: { code: academyCode },
  });
  if (!academy) {
    return redirectTo(request, "/login?error=invalid");
  }

  const user = await prisma.user.findUnique({
    where: { academyId_loginId: { academyId: academy.id, loginId } },
  });
  if (!user || !user.isActive || !verifyPassword(password, user.passwordHash)) {
    return redirectTo(request, "/login?error=invalid");
  }

  const response = redirectTo(request, "/dashboard");
  response.cookies.set(SESSION_COOKIE, user.id, SESSION_COOKIE_OPTIONS);
  return response;
}
