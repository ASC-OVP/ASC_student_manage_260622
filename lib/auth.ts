import crypto from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/lib/generated/prisma";

const SESSION_COOKIE = "asc_user_id";

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, 100000, 64, "sha512")
    .toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, savedHash: string) {
  const [salt, originalHash] = savedHash.split(":");
  if (!salt || !originalHash) return false;
  const hash = crypto
    .pbkdf2Sync(password, salt, 100000, 64, "sha512")
    .toString("hex");
  return hash === originalHash;
}

export async function setSession(userId: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getCurrentUser() {
  const store = await cookies();
  const userId = store.get(SESSION_COOKIE)?.value;
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { academy: true },
  });

  if (!user || !user.isActive) return null;
  return user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(roles: Array<UserRole | string>) {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/dashboard");
  return user;
}

export function canManageStaff(role: UserRole | string) {
  return role === "ADMIN" || role === "MANAGER";
}

export function canDeactivateAccount(role: UserRole | string) {
  return role === "ADMIN" || role === "TEACHER";
}

export function canCreateTask(role: UserRole | string) {
  return role === "ADMIN" || role === "MANAGER" || role === "TEACHER";
}

export function canEditAll(role: UserRole | string) {
  return role === "ADMIN" || role === "MANAGER";
}

export function roleText(role: UserRole | string) {
  if (role === "ADMIN") return "관리자";
  if (role === "MANAGER") return "실장";
  if (role === "TEACHER") return "강사";
  if (role === "ASSISTANT") return "조교";
  return String(role);
}

export const roleLabel = roleText;
