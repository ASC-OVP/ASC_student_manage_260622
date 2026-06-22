"use server";

import { canCreateTask, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma, TaskPriority, TaskStatus, TaskType } from "@/lib/generated/prisma";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { recordActivity } from "@/lib/activityLog";
import { generateDueRecurringTasks } from "@/lib/recurringTasks";

const TASK_STATUSES = Object.values(TaskStatus) as TaskStatus[];
const TASK_PRIORITIES = Object.values(TaskPriority) as TaskPriority[];
const TASK_TYPES = Object.values(TaskType) as TaskType[];
const RECURRENCE_TYPES = ["DAILY", "WEEKLY", "MONTHLY"] as const;
const SIMPLE_TASK_STATUSES: TaskStatus[] = [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.DONE, TaskStatus.HOLD];
const ASSISTANT_CHANGE_STATUSES: TaskStatus[] = [TaskStatus.IN_PROGRESS, TaskStatus.DONE, TaskStatus.HOLD];
const REVIEWABLE_TASK_STATUSES: TaskStatus[] = [TaskStatus.SUBMITTED, TaskStatus.REVIEW];

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return value ? String(value).trim() : "";
}

function optionalText(formData: FormData, key: string) {
  const value = text(formData, key);
  return value.length > 0 ? value : undefined;
}

function cleanId(value?: string) {
  if (!value || value === "none" || value === "-") return undefined;
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

function assigneeIdsValue(formData: FormData) {
  return cleanIds([...formData.getAll("assigneeIds"), ...formData.getAll("assigneeId")]);
}

function backPath(formData: FormData, fallback: string) {
  return optionalText(formData, "from") || optionalText(formData, "back") || fallback;
}

function enumValue<T extends string>(value: string | undefined, values: readonly T[], fallback: T) {
  return value && values.includes(value as T) ? (value as T) : fallback;
}

function numberOrUndefined(value?: string) {
  if (!value) return undefined;
  const num = Number(value);
  return Number.isNaN(num) ? undefined : num;
}

function dateOnlyValue(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function timeValue(value?: string) {
  return value && /^\d{2}:\d{2}$/.test(value) ? value : undefined;
}

function dayOfMonthValue(value?: string) {
  const day = Number(value);
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : undefined;
}

function daysOfWeekValue(formData: FormData) {
  return formData
    .getAll("daysOfWeek")
    .map((value) => String(value))
    .filter((value) => /^[0-6]$/.test(value))
    .join(",");
}

function parseDueDate(value?: string, time?: string) {
  if (!value) return undefined;
  const raw = value.includes("T") ? value : time ? `${value}T${time}` : `${value}T23:59`;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function sanitizeColor(value?: string) {
  if (!value) return undefined;
  const color = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : undefined;
}

function classTaskPeriodWarning(
  classGroup: { name: string; startDate: string | null; endDate: string | null } | null,
  startDate?: Date,
  dueDate?: Date
) {
  if (!classGroup || (!classGroup.startDate && !classGroup.endDate)) return undefined;

  const taskStart = startDate ? toYmd(taskDateOnly(startDate)) : undefined;
  const taskEnd = dueDate ? toYmd(taskDateOnly(dueDate)) : taskStart;
  const beforeStart = classGroup.startDate && taskStart && taskStart < classGroup.startDate;
  const afterEnd = classGroup.endDate && taskEnd && taskEnd > classGroup.endDate;

  if (!beforeStart && !afterEnd) return undefined;

  return [
    "[운영기간 확인 필요]",
    `${classGroup.name} 운영기간: ${classGroup.startDate ?? "시작 미정"} ~ ${classGroup.endDate ?? "종료 미정"}`,
    taskStart || taskEnd ? `업무 기간: ${taskStart ?? "시작 미정"} ~ ${taskEnd ?? "마감 미정"}` : "",
  ].filter(Boolean).join("\n");
}

function taskDateOnly(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toYmd(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function canReview(role: string) {
  return role === "ADMIN" || role === "MANAGER" || role === "TEACHER";
}

async function getTaskForUser(taskId: string, user: { id: string; academyId: string; role: string }) {
  return prisma.task.findFirst({
    where: {
      id: taskId,
      academyId: user.academyId,
      ...(user.role === "ASSISTANT"
        ? {
            OR: [
              { assigneeId: user.id },
              { assignees: { some: { assigneeId: user.id } } },
            ],
          }
        : {}),
    },
    include: {
      classGroup: { select: { teacherId: true } },
      student: { select: { teacherId: true, assistantId: true } },
      assignees: { select: { assigneeId: true } },
    },
  });
}

function isAssignedToUser(task: Awaited<ReturnType<typeof getTaskForUser>>, userId: string) {
  if (!task) return false;
  return task.assigneeId === userId || task.assignees.some((assignment) => assignment.assigneeId === userId);
}

function reviewerScope(task: Awaited<ReturnType<typeof getTaskForUser>>, user: { id: string; role: string }) {
  if (!task) return false;
  if (user.role === "ADMIN" || user.role === "MANAGER") return true;
  if (user.role !== "TEACHER") return false;
  return task.creatorId === user.id || task.reviewerId === user.id || task.classGroup?.teacherId === user.id || task.student?.teacherId === user.id;
}

async function addHistory(tx: Prisma.TransactionClient, params: {
  taskId: string;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus;
  changedById: string;
  memo?: string;
  hasEvidence?: boolean;
}) {
  await tx.taskStatusHistory.create({
    data: {
      taskId: params.taskId,
      fromStatus: params.fromStatus,
      toStatus: params.toStatus,
      changedById: params.changedById,
      memo: params.memo,
      hasEvidence: params.hasEvidence ?? false,
    },
  });
}

export async function createTaskAction(formData: FormData) {
  const user = await requireUser();

  if (!canCreateTask(user.role)) {
    redirect("/tasks/new?error=permission");
  }

  const title = text(formData, "title");
  const assigneeIds = assigneeIdsValue(formData);
  const reviewerId = cleanId(optionalText(formData, "reviewerId")) ?? user.id;
  const studentId = cleanId(optionalText(formData, "studentId"));
  const classGroupId = cleanId(optionalText(formData, "classGroupId"));
  const startDate = parseDueDate(optionalText(formData, "startDate"));
  const dueDate = parseDueDate(optionalText(formData, "dueDate"));
  const type = enumValue(optionalText(formData, "type"), TASK_TYPES, TaskType.OTHER);
  const priority = enumValue(optionalText(formData, "priority"), TASK_PRIORITIES, TaskPriority.NORMAL);
  const color = sanitizeColor(optionalText(formData, "color"));
  const checklistLines = text(formData, "checklist")
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-\d.\s]+/, "").trim())
    .filter(Boolean);

  if (!title || assigneeIds.length === 0) {
    redirect("/tasks/new?error=empty");
  }

  const [assignees, reviewer, student, classGroup] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: assigneeIds }, academyId: user.academyId, isActive: true }, select: { id: true } }),
    prisma.user.findFirst({ where: { id: reviewerId, academyId: user.academyId, isActive: true }, select: { id: true } }),
    studentId ? prisma.student.findFirst({ where: { id: studentId, academyId: user.academyId }, select: { id: true } }) : null,
    classGroupId
      ? prisma.classGroup.findFirst({
          where: { id: classGroupId, academyId: user.academyId },
          select: { id: true, name: true, startDate: true, endDate: true },
        })
      : null,
  ]);

  const validAssigneeIds = assigneeIds.filter((id) => assignees.some((assignee) => assignee.id === id));
  if (validAssigneeIds.length === 0) redirect("/tasks/new?error=empty");

  let createdTaskId: string | null = null;

  await prisma.$transaction(async (tx) => {
    const periodWarning = classTaskPeriodWarning(classGroup, startDate, dueDate);
    const description = [optionalText(formData, "description"), periodWarning].filter(Boolean).join("\n\n") || undefined;

    const task = await tx.task.create({
      data: {
        academyId: user.academyId,
        title,
        description,
        type,
        studentId: student?.id,
        classGroupId: classGroup?.id,
        assigneeId: validAssigneeIds[0],
        creatorId: user.id,
        reviewerId: reviewer?.id ?? user.id,
        priority,
        color,
        dueDate,
      },
    });
    createdTaskId = task.id;

    await tx.$executeRaw`UPDATE "Task" SET "startDate" = ${startDate ?? null} WHERE "id" = ${task.id}`;
    await tx.taskAssignee.createMany({
      data: validAssigneeIds.map((id) => ({
        academyId: user.academyId,
        taskId: task.id,
        assigneeId: id,
        color,
      })),
    });
    await addHistory(tx, {
      taskId: task.id,
      fromStatus: null,
      toStatus: TaskStatus.TODO,
      changedById: user.id,
      memo: "업무 생성",
    });

    if (checklistLines.length > 0) {
      await tx.taskChecklistItem.createMany({
        data: checklistLines.map((line, index) => ({
          taskId: task.id,
          title: line,
          order: index,
        })),
      });
    }
  });

  await recordActivity({
    actor: user,
    action: "CREATE",
    entityType: "Task",
    entityId: createdTaskId,
    summary: `업무 생성: ${title}`,
    metadata: { assigneeId: validAssigneeIds[0], assigneeIds: validAssigneeIds, classGroupId: classGroup?.id ?? null, studentId: student?.id ?? null, priority, type },
  });

  revalidatePath("/tasks");
  revalidatePath("/calendar");
  redirect("/tasks");
}

export async function createRecurringTaskAction(formData: FormData) {
  const user = await requireUser();
  if (!canCreateTask(user.role)) redirect("/tasks?tab=recurring&error=permission");

  const title = text(formData, "title");
  const assigneeId = text(formData, "assigneeId");
  const studentId = cleanId(optionalText(formData, "studentId"));
  const classGroupId = cleanId(optionalText(formData, "classGroupId"));
  const type = enumValue(optionalText(formData, "type"), TASK_TYPES, TaskType.OTHER);
  const priority = enumValue(optionalText(formData, "priority"), TASK_PRIORITIES, TaskPriority.NORMAL);
  const recurrenceType = enumValue(optionalText(formData, "recurrenceType"), RECURRENCE_TYPES, "WEEKLY");
  const startDate = dateOnlyValue(optionalText(formData, "startDate"));
  const endDate = dateOnlyValue(optionalText(formData, "endDate"));
  const dueTime = timeValue(optionalText(formData, "dueTime"));
  const dayOfMonth = dayOfMonthValue(optionalText(formData, "dayOfMonth"));
  const daysOfWeek = daysOfWeekValue(formData);
  const isActive = formData.get("isActive") !== "off";

  if (!title || !assigneeId || !startDate) {
    redirect("/tasks?tab=recurring&newRecurring=1&error=empty");
  }

  const [assignee, student, classGroup] = await Promise.all([
    prisma.user.findFirst({ where: { id: assigneeId, academyId: user.academyId, isActive: true }, select: { id: true } }),
    studentId ? prisma.student.findFirst({ where: { id: studentId, academyId: user.academyId }, select: { id: true } }) : null,
    classGroupId ? prisma.classGroup.findFirst({ where: { id: classGroupId, academyId: user.academyId }, select: { id: true } }) : null,
  ]);

  if (!assignee) redirect("/tasks?tab=recurring&newRecurring=1&error=empty");

  const recurringTask = await prisma.recurringTask.create({
    data: {
      academyId: user.academyId,
      title,
      description: optionalText(formData, "description"),
      type,
      assigneeId,
      creatorId: user.id,
      studentId: student?.id,
      classGroupId: classGroup?.id,
      priority,
      recurrenceType,
      daysOfWeek: recurrenceType === "WEEKLY" ? daysOfWeek || null : null,
      dayOfMonth: recurrenceType === "MONTHLY" ? dayOfMonth ?? Number(startDate.slice(-2)) : null,
      startDate,
      endDate,
      dueTime,
      isActive,
    },
  });

  await generateDueRecurringTasks(user);

  await recordActivity({
    actor: user,
    action: "CREATE",
    entityType: "RecurringTask",
    entityId: recurringTask.id,
    summary: `정기 업무 생성: ${title}`,
    metadata: { assigneeId, classGroupId: classGroup?.id ?? null, studentId: student?.id ?? null, recurrenceType },
  });

  revalidatePath("/tasks");
  revalidatePath("/calendar");
  redirect("/tasks?tab=recurring");
}

export async function updateRecurringTaskAction(formData: FormData) {
  const user = await requireUser();
  if (!canCreateTask(user.role)) return;

  const id = text(formData, "recurringTaskId");
  if (!id) return;

  const recurringTask = await prisma.recurringTask.findFirst({
    where: { id, academyId: user.academyId },
    include: { classGroup: { select: { teacherId: true } }, student: { select: { teacherId: true } } },
  });
  if (!recurringTask) return;
  if (user.role === "TEACHER" && recurringTask.creatorId !== user.id && recurringTask.classGroup?.teacherId !== user.id && recurringTask.student?.teacherId !== user.id) return;

  const title = text(formData, "title");
  const assigneeId = text(formData, "assigneeId");
  const startDate = dateOnlyValue(optionalText(formData, "startDate"));
  if (!title || !assigneeId || !startDate) return;

  const studentId = cleanId(optionalText(formData, "studentId"));
  const classGroupId = cleanId(optionalText(formData, "classGroupId"));
  const recurrenceType = enumValue(optionalText(formData, "recurrenceType"), RECURRENCE_TYPES, "WEEKLY");
  const daysOfWeek = daysOfWeekValue(formData);
  const dayOfMonth = dayOfMonthValue(optionalText(formData, "dayOfMonth"));

  await prisma.recurringTask.update({
    where: { id },
    data: {
      title,
      description: optionalText(formData, "description"),
      type: enumValue(optionalText(formData, "type"), TASK_TYPES, TaskType.OTHER),
      assigneeId,
      studentId,
      classGroupId,
      priority: enumValue(optionalText(formData, "priority"), TASK_PRIORITIES, TaskPriority.NORMAL),
      recurrenceType,
      daysOfWeek: recurrenceType === "WEEKLY" ? daysOfWeek || null : null,
      dayOfMonth: recurrenceType === "MONTHLY" ? dayOfMonth ?? Number(startDate.slice(-2)) : null,
      startDate,
      endDate: dateOnlyValue(optionalText(formData, "endDate")),
      dueTime: timeValue(optionalText(formData, "dueTime")),
      isActive: formData.get("isActive") === "on",
    },
  });

  await recordActivity({
    actor: user,
    action: "UPDATE",
    entityType: "RecurringTask",
    entityId: id,
    summary: `정기 업무 수정: ${title}`,
  });

  revalidatePath("/tasks");
  revalidatePath("/calendar");
  redirect("/tasks?tab=recurring");
}

export async function toggleRecurringTaskAction(formData: FormData) {
  const user = await requireUser();
  if (!canCreateTask(user.role)) return;
  const id = text(formData, "recurringTaskId");
  const isActive = text(formData, "isActive") === "true";
  if (!id) return;

  const recurringTask = await prisma.recurringTask.findFirst({
    where: { id, academyId: user.academyId },
    select: { id: true, title: true, creatorId: true, classGroup: { select: { teacherId: true } } },
  });
  if (!recurringTask) return;
  if (user.role === "TEACHER" && recurringTask.creatorId !== user.id && recurringTask.classGroup?.teacherId !== user.id) return;

  await prisma.recurringTask.update({
    where: { id },
    data: { isActive },
  });

  await recordActivity({
    actor: user,
    action: "UPDATE",
    entityType: "RecurringTask",
    entityId: id,
    summary: `정기 업무 ${isActive ? "활성화" : "비활성화"}: ${recurringTask.title}`,
  });

  revalidatePath("/tasks");
  redirect("/tasks?tab=recurring");
}

export async function generateRecurringTasksAction() {
  const user = await requireUser();
  const createdCount = await generateDueRecurringTasks(user);

  await recordActivity({
    actor: user,
    action: "CREATE",
    entityType: "RecurringTask",
    summary: `정기 업무 실제 업무 생성: ${createdCount}건`,
    metadata: { createdCount },
  });

  revalidatePath("/tasks");
  revalidatePath("/calendar");
  redirect("/tasks");
}

export async function updateTaskStatus(formData: FormData) {
  const user = await requireUser();
  const id = text(formData, "taskId") || text(formData, "id");
  const nextStatus = enumValue(text(formData, "status"), TASK_STATUSES, TaskStatus.TODO);
  const memo = optionalText(formData, "memo");

  if (!id) return;
  if (!SIMPLE_TASK_STATUSES.includes(nextStatus)) return;

  const task = await getTaskForUser(id, user);
  if (!task) return;

  if (user.role === "ASSISTANT" && !ASSISTANT_CHANGE_STATUSES.includes(nextStatus)) {
    return;
  }

  if (user.role !== "ASSISTANT" && !reviewerScope(task, user)) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id },
      data: {
        status: nextStatus,
        completedAt: nextStatus === TaskStatus.DONE ? new Date() : null,
        actualMinutes: nextStatus === TaskStatus.DONE ? numberOrUndefined(optionalText(formData, "actualMinutes")) : undefined,
      },
    });
    await addHistory(tx, {
      taskId: id,
      fromStatus: task.status,
      toStatus: nextStatus,
      changedById: user.id,
      memo,
    });
  });

  await recordActivity({
    actor: user,
    action: "STATUS",
    entityType: "Task",
    entityId: id,
    summary: `업무 상태 변경: ${task.status} -> ${nextStatus}`,
    metadata: { taskId: id, fromStatus: task.status, toStatus: nextStatus, memo },
  });

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${id}`);
  revalidatePath("/calendar");
}

export async function startTaskAction(formData: FormData) {
  const user = await requireUser();
  const taskId = text(formData, "taskId");
  if (!taskId) return;

  const task = await getTaskForUser(taskId, user);
  if (!task) return;
  if (user.role === "ASSISTANT" && !isAssignedToUser(task, user.id)) return;
  if (user.role !== "ASSISTANT" && !reviewerScope(task, user)) return;

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.IN_PROGRESS },
    });
    await addHistory(tx, {
      taskId,
      fromStatus: task.status,
      toStatus: TaskStatus.IN_PROGRESS,
      changedById: user.id,
      memo: optionalText(formData, "memo") ?? "Started work",
    });
  });

  await recordActivity({
    actor: user,
    action: "STATUS",
    entityType: "Task",
    entityId: taskId,
    summary: `업무 진행 시작`,
    metadata: { taskId, fromStatus: task.status, toStatus: TaskStatus.IN_PROGRESS },
  });

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/calendar");
  redirect(backPath(formData, `/tasks/${taskId}`));
}

export async function submitTaskAction(formData: FormData) {
  const user = await requireUser();
  const taskId = text(formData, "taskId");
  const content = text(formData, "content");
  const evidenceType = optionalText(formData, "evidenceType") ?? "TEXT";
  const fileUrl = optionalText(formData, "fileUrl");
  const actualMinutes = numberOrUndefined(optionalText(formData, "actualMinutes"));

  if (!taskId || !content) return;

  const task = await getTaskForUser(taskId, user);
  if (!task) return;
  if (user.role === "ASSISTANT" && !isAssignedToUser(task, user.id)) return;
  if (user.role !== "ASSISTANT" && !reviewerScope(task, user)) return;

  await prisma.$transaction(async (tx) => {
    await tx.taskSubmission.create({
      data: {
        taskId,
        submittedById: user.id,
        content,
        evidenceType,
        fileUrl,
        actualMinutes,
      },
    });
    await tx.task.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.DONE,
        submittedAt: new Date(),
        completedAt: new Date(),
        actualMinutes,
        evidenceSummary: content.slice(0, 500),
      },
    });
    await addHistory(tx, {
      taskId,
      fromStatus: task.status,
      toStatus: TaskStatus.DONE,
      changedById: user.id,
      memo: content,
      hasEvidence: true,
    });
  });

  await recordActivity({
    actor: user,
    action: "STATUS",
    entityType: "Task",
    entityId: taskId,
    summary: `업무 완료 처리`,
    metadata: { taskId, fromStatus: task.status, toStatus: TaskStatus.DONE, evidenceType, actualMinutes },
  });

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/calendar");
  redirect(backPath(formData, `/tasks/${taskId}`));
}

export async function reviewTaskAction(formData: FormData) {
  const user = await requireUser();
  if (!canReview(user.role)) return;

  const taskId = text(formData, "taskId");
  const decision = text(formData, "decision");
  const comment = text(formData, "comment");

  if (!taskId) return;

  const task = await getTaskForUser(taskId, user);
  if (!task) return;
  if (!reviewerScope(task, user)) return;
  if (!REVIEWABLE_TASK_STATUSES.includes(task.status)) return;

  const nextStatus =
    decision === "APPROVE"
      ? TaskStatus.DONE
      : decision === "REVIEW"
        ? TaskStatus.REVIEW
        : TaskStatus.REJECTED;

  if (nextStatus === TaskStatus.REJECTED && !comment) return;

  await prisma.$transaction(async (tx) => {
    await tx.taskReview.create({
      data: {
        taskId,
        reviewerId: user.id,
        decision,
        comment,
      },
    });
    await tx.task.update({
      where: { id: taskId },
      data: {
        status: nextStatus,
        approvedAt: nextStatus === TaskStatus.DONE ? new Date() : undefined,
        rejectedAt: nextStatus === TaskStatus.REJECTED ? new Date() : undefined,
        completedAt: nextStatus === TaskStatus.DONE ? new Date() : undefined,
      },
    });
    await addHistory(tx, {
      taskId,
      fromStatus: task.status,
      toStatus: nextStatus,
      changedById: user.id,
      memo: comment || (nextStatus === TaskStatus.DONE ? "Approved" : "In review"),
      hasEvidence: task.submittedAt !== null,
    });
  });

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/calendar");
  redirect(backPath(formData, `/tasks/${taskId}`));
}

export async function updateTaskChecklistItemAction(formData: FormData) {
  const user = await requireUser();
  const itemId = text(formData, "itemId");
  const taskId = text(formData, "taskId");
  const isDone = formData.get("isDone") === "on";

  if (!itemId || !taskId) return;

  const task = await getTaskForUser(taskId, user);
  if (!task) return;
  if (user.role === "ASSISTANT" && !isAssignedToUser(task, user.id)) return;
  if (user.role !== "ASSISTANT" && !reviewerScope(task, user)) return;

  await prisma.taskChecklistItem.updateMany({
    where: { id: itemId, taskId },
    data: {
      isDone,
      doneAt: isDone ? new Date() : null,
      doneById: isDone ? user.id : null,
    },
  });

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
}

// 이름 다르게 import해도 깨지지 않도록 유지
export async function updateTaskStatusAction(formData: FormData) {
  return updateTaskStatus(formData);
}

export async function updateTaskColorAction(formData: FormData) {
  const user = await requireUser();
  const taskId = text(formData, "taskId");
  const color = sanitizeColor(text(formData, "color"));
  if (!taskId || !color) return;

  const task = await getTaskForUser(taskId, user);
  if (!task) return;

  if (user.role === "ASSISTANT") {
    if (!isAssignedToUser(task, user.id)) return;
    await prisma.taskAssignee.upsert({
      where: { taskId_assigneeId: { taskId, assigneeId: user.id } },
      update: { color },
      create: {
        academyId: user.academyId,
        taskId,
        assigneeId: user.id,
        color,
      },
    });
  } else {
    if (!reviewerScope(task, user)) return;
    await prisma.task.update({
      where: { id: taskId },
      data: { color },
    });
  }

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/calendar");
}

export async function deleteTaskAction(formData: FormData) {
  const user = await requireUser();

  const id = text(formData, "taskId") || text(formData, "id");
  if (!id) return;
  if (user.role === "ASSISTANT") return;

  const task = await prisma.task.findFirst({
    where: {
      id,
      academyId: user.academyId,
    },
    select: {
      title: true,
      creatorId: true,
      reviewerId: true,
      classGroup: { select: { teacherId: true } },
    },
  });

  if (!task) return;

  const canDelete = user.role === "ADMIN" || user.role === "MANAGER" || task.creatorId === user.id || task.reviewerId === user.id || task.classGroup?.teacherId === user.id;
  if (!canDelete) return;

  await prisma.task.deleteMany({
    where: {
      id,
      academyId: user.academyId,
    },
  });

  await recordActivity({
    actor: user,
    action: "DELETE",
    entityType: "Task",
    entityId: id,
    summary: `업무 삭제: ${task.title}`,
  });

  revalidatePath("/tasks");
  revalidatePath("/calendar");
  redirect("/tasks");
}

export async function createTaskComment(formData: FormData) {
  const user = await requireUser();

  const taskId = text(formData, "taskId");
  const content = text(formData, "content");

  if (!taskId || !content) return;

  const task = await getTaskForUser(taskId, user);
  if (!task) return;

  await prisma.taskComment.create({
    data: {
      taskId,
      writerId: user.id,
      content,
    },
  });

  await recordActivity({
    actor: user,
    action: "CREATE",
    entityType: "TaskComment",
    entityId: taskId,
    summary: `업무 메모 작성`,
    metadata: { taskId },
  });

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
  redirect(backPath(formData, `/tasks/${taskId}`));
}

export async function createTaskCommentAction(formData: FormData) {
  return createTaskComment(formData);
}

export async function addTaskComment(formData: FormData) {
  return createTaskComment(formData);
}
