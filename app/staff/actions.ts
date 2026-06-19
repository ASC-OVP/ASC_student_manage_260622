"use server";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { canDeactivateAccount, requireRole, requireUser } from "@/lib/auth";
import { UserRole } from "@/lib/generated/prisma";
import { revalidatePath } from "next/cache";

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || undefined;
}

function getRole(value: string) {
  return Object.values(UserRole).includes(value as UserRole) ? (value as UserRole) : UserRole.ASSISTANT;
}

export async function createStaff(formData: FormData) {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const name = text(formData, "name");
  const loginId = text(formData, "loginId");
  const password = text(formData, "password");
  const role = getRole(String(formData.get("role") ?? "ASSISTANT"));

  if (!name || !loginId || !password) throw new Error("이름, 아이디, 비밀번호는 필수입니다.");

  await prisma.user.create({
    data: {
      academyId: user.academyId,
      name,
      loginId,
      passwordHash: hashPassword(password),
      role,
    },
  });

  revalidatePath("/staff");
}

export async function deleteStaff(formData: FormData) {
  const user = await requireUser();
  if (!canDeactivateAccount(user.role)) return;

  const targetId = text(formData, "userId");
  if (!targetId || targetId === user.id) return;

  const target = await prisma.user.findFirst({ where: { id: targetId, academyId: user.academyId } });
  if (!target || !target.isActive) return;

  if (target.role === UserRole.ADMIN) {
    const activeAdminCount = await prisma.user.count({
      where: {
        academyId: user.academyId,
        role: UserRole.ADMIN,
        isActive: true,
      },
    });

    if (activeAdminCount <= 1) return;
  }

  await prisma.user.update({ where: { id: targetId }, data: { isActive: false } });
  revalidatePath("/staff");
  revalidatePath("/users");
}
