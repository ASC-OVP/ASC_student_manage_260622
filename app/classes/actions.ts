"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClassGroup, deleteClassGroup, updateClassGroup } from "@/app/students/actions";
import { canManageClassGroup, canViewClassGroup } from "@/lib/classGroups";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function createClassGroupAction(formData: FormData) {
  await createClassGroup(formData);
  redirect("/classes");
}

export async function updateClassGroupAction(formData: FormData) {
  return updateClassGroup(formData);
}

export async function deleteClassGroupAction(formData: FormData) {
  return deleteClassGroup(formData);
}

export async function createClassMemoAction(formData: FormData) {
  const user = await requireUser();
  const classGroupId = text(formData, "classGroupId");
  const content = text(formData, "content");
  if (!classGroupId || !content) return;

  const classGroup = await prisma.classGroup.findFirst({
    where: { id: classGroupId, academyId: user.academyId },
    select: {
      id: true,
      teacherId: true,
      assistantId: true,
      classAssistants: { select: { assistantId: true } },
    },
  });

  if (!classGroup || !canViewClassGroup(user, classGroup)) {
    throw new Error("반 메모를 작성할 권한이 없습니다.");
  }

  await prisma.classMemo.create({
    data: {
      academyId: user.academyId,
      classGroupId,
      writerId: user.id,
      content,
    },
  });

  revalidatePath("/classes");
  revalidatePath(`/classes/${classGroupId}`);
}

export async function deleteClassMemoAction(formData: FormData) {
  const user = await requireUser();
  const memoId = text(formData, "memoId");
  if (!memoId) return;

  const memo = await prisma.classMemo.findFirst({
    where: { id: memoId, academyId: user.academyId },
    include: {
      classGroup: {
        select: {
          id: true,
          teacherId: true,
          assistantId: true,
          classAssistants: { select: { assistantId: true } },
        },
      },
    },
  });

  if (!memo) return;
  const canDelete = memo.writerId === user.id || canManageClassGroup(user, memo.classGroup);
  if (!canDelete) {
    throw new Error("반 메모를 삭제할 권한이 없습니다.");
  }

  await prisma.classMemo.delete({ where: { id: memoId } });
  revalidatePath("/classes");
  revalidatePath(`/classes/${memo.classGroup.id}`);
}

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return value ? String(value).trim() : "";
}
