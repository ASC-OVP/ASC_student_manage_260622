"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "crypto";
import { canManageClassGroup, canManageClassGroups, canViewClassGroup } from "@/lib/classGroups";
import { ClassGroupStatus, Prisma } from "@/lib/generated/prisma";
import { recordActivity } from "@/lib/activityLog";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const CLASS_GROUP_STATUSES = Object.values(ClassGroupStatus) as ClassGroupStatus[];

export async function createClassGroupAction(formData: FormData) {
  const user = await requireUser();
  if (!canManageClassGroups(user.role)) {
    throw new Error("반을 관리할 권한이 없습니다.");
  }

  const name = text(formData, "name");
  const teacherId = user.role === "TEACHER" ? user.id : cleanId(nullableText(formData, "teacherId"));
  const subject = nullableText(formData, "subject");
  const grade = nullableText(formData, "grade");
  const startDate = nullableText(formData, "startDate");
  const endDate = nullableText(formData, "endDate");
  const daysOfWeek = nullableText(formData, "daysOfWeek");
  const startTime = nullableText(formData, "startTime");
  const endTime = nullableText(formData, "endTime");
  const room = nullableText(formData, "room");
  const schedule = nullableText(formData, "schedule") ?? compactSchedule(daysOfWeek, startTime, endTime);
  const assistantIds = classAssistantIds(formData);
  const assistantId = assistantIds[0] ?? null;
  const status = enumValue(text(formData, "status"), CLASS_GROUP_STATUSES, ClassGroupStatus.ACTIVE);
  const description = nullableText(formData, "description");

  if (!name) {
    throw new Error("반 이름을 입력해 주세요.");
  }

  await validateAssistantIds(user.academyId, assistantIds);

  let createdClassGroupId: string | null = null;

  await prisma.$transaction(async (tx) => {
    const classGroup = await tx.classGroup.create({
      data: {
        academyId: user.academyId,
        name,
        teacherId,
        assistantId,
        subject,
        grade,
        startDate,
        endDate,
        daysOfWeek,
        startTime,
        endTime,
        schedule,
        status,
        description,
      },
    });
    createdClassGroupId = classGroup.id;

    await tx.$executeRaw`UPDATE "ClassGroup" SET "room" = ${room} WHERE "id" = ${classGroup.id}`;
    await syncClassGroupAssistants(tx, user.academyId, classGroup.id, assistantIds);
  });

  await recordActivity({
    actor: user,
    action: "CREATE",
    entityType: "ClassGroup",
    entityId: createdClassGroupId,
    summary: `반 생성: ${name}`,
  });

  revalidateClassPaths(createdClassGroupId);
  redirect(createdClassGroupId ? `/classes?classGroupId=${createdClassGroupId}` : "/classes");
}

export async function updateClassGroupAction(formData: FormData) {
  const user = await requireUser();
  if (!canManageClassGroups(user.role)) {
    throw new Error("반을 관리할 권한이 없습니다.");
  }

  const id = text(formData, "classGroupId");
  const name = text(formData, "name");
  const teacherId = user.role === "TEACHER" ? user.id : cleanId(nullableText(formData, "teacherId"));
  const subject = nullableText(formData, "subject");
  const grade = nullableText(formData, "grade");
  const startDate = nullableText(formData, "startDate");
  const endDate = nullableText(formData, "endDate");
  const daysOfWeek = nullableText(formData, "daysOfWeek");
  const startTime = nullableText(formData, "startTime");
  const endTime = nullableText(formData, "endTime");
  const room = nullableText(formData, "room");
  const schedule = nullableText(formData, "schedule") ?? compactSchedule(daysOfWeek, startTime, endTime);
  const assistantIds = classAssistantIds(formData);
  const assistantId = assistantIds[0] ?? null;
  const status = enumValue(text(formData, "status"), CLASS_GROUP_STATUSES, ClassGroupStatus.ACTIVE);
  const description = nullableText(formData, "description");

  if (!id || !name) {
    throw new Error("수정할 반 정보를 확인해 주세요.");
  }

  const target = await prisma.classGroup.findFirst({
    where: {
      id,
      academyId: user.academyId,
      ...(user.role === "TEACHER" ? { teacherId: user.id } : {}),
    },
    select: { id: true },
  });

  if (!target) {
    throw new Error("반을 찾을 수 없습니다.");
  }

  await validateAssistantIds(user.academyId, assistantIds);

  await prisma.$transaction(async (tx) => {
    await tx.classGroup.update({
      where: { id },
      data: {
        name,
        teacherId,
        assistantId,
        subject,
        grade,
        startDate,
        endDate,
        daysOfWeek,
        startTime,
        endTime,
        schedule,
        status,
        description,
      },
    });

    await tx.$executeRaw`UPDATE "ClassGroup" SET "room" = ${room} WHERE "id" = ${id}`;
    await syncClassGroupAssistants(tx, user.academyId, id, assistantIds);
  });

  await recordActivity({
    actor: user,
    action: "UPDATE",
    entityType: "ClassGroup",
    entityId: id,
    summary: `반 정보 수정: ${name}`,
  });

  revalidateClassPaths(id);
}

export async function deleteClassGroupAction(formData: FormData) {
  const user = await requireUser();
  if (!canManageClassGroups(user.role)) {
    throw new Error("반을 관리할 권한이 없습니다.");
  }

  const id = text(formData, "classGroupId");
  if (!id) {
    throw new Error("삭제할 반을 확인해 주세요.");
  }

  const target = await prisma.classGroup.findFirst({
    where: {
      id,
      academyId: user.academyId,
      ...(user.role === "TEACHER" ? { teacherId: user.id } : {}),
    },
    select: { id: true, name: true },
  });

  if (!target) {
    throw new Error("반을 찾을 수 없습니다.");
  }

  await prisma.$transaction([
    prisma.studentClass.deleteMany({ where: { academyId: user.academyId, classGroupId: id } }),
    prisma.classGroup.delete({ where: { id } }),
  ]);

  await recordActivity({
    actor: user,
    action: "DELETE",
    entityType: "ClassGroup",
    entityId: id,
    summary: `반 삭제: ${target.name}`,
  });

  revalidateClassPaths(id);
  redirect("/classes");
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

function nullableText(formData: FormData, key: string) {
  const value = text(formData, key);
  return value.length > 0 ? value : null;
}

function cleanId(value: string | null) {
  if (!value || value === "none" || value === "-") return null;
  return value;
}

function cleanIds(values: FormDataEntryValue[]) {
  return Array.from(
    new Set(
      values
        .map((value) => cleanId(String(value).trim()))
        .filter((value): value is string => Boolean(value))
    )
  );
}

function classAssistantIds(formData: FormData) {
  const selectedIds = cleanIds(formData.getAll("assistantIds"));
  const legacyId = cleanId(nullableText(formData, "assistantId"));
  return selectedIds.length > 0 || formData.has("assistantIds") ? selectedIds : legacyId ? [legacyId] : [];
}

function enumValue<T extends string>(value: string, values: readonly T[], fallback: T) {
  return values.includes(value as T) ? (value as T) : fallback;
}

async function validateAssistantIds(academyId: string, assistantIds: string[]) {
  if (assistantIds.length === 0) return;

  const assistants = await prisma.user.findMany({
    where: { id: { in: assistantIds }, academyId, role: "ASSISTANT", isActive: true },
    select: { id: true },
  });

  if (assistants.length !== assistantIds.length) {
    throw new Error("담당 조교 정보를 확인해 주세요.");
  }
}

async function syncClassGroupAssistants(
  tx: Prisma.TransactionClient,
  academyId: string,
  classGroupId: string,
  assistantIds: string[]
) {
  await tx.classGroupAssistant.deleteMany({
    where: { academyId, classGroupId },
  });

  if (assistantIds.length === 0) return;

  await tx.classGroupAssistant.createMany({
    data: assistantIds.map((assistantId) => ({
      id: randomUUID(),
      academyId,
      classGroupId,
      assistantId,
    })),
  });
}

function compactSchedule(daysOfWeek: string | null, startTime: string | null, endTime: string | null) {
  const time = [startTime, endTime].filter(Boolean).join("~");
  return [daysOfWeek, time].filter(Boolean).join(" ");
}

function revalidateClassPaths(classGroupId?: string | null) {
  revalidatePath("/students");
  revalidatePath("/classes");
  revalidatePath("/classes/new");
  revalidatePath("/calendar");
  if (classGroupId) revalidatePath(`/classes/${classGroupId}`);
}
