"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageAnnouncements, requireUser } from "@/lib/auth";
import { AnnouncementPriority, MemoType } from "@/lib/generated/prisma";
import { prisma } from "@/lib/prisma";

const announcementPriorities = Object.values(AnnouncementPriority) as AnnouncementPriority[];
const memoTypes = Object.values(MemoType) as MemoType[];
const stickyColors = new Set(["#FEF3C7", "#DBEAFE", "#DCFCE7", "#FCE7F3", "#EDE9FE", "#FFE4E6"]);

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function selectedStudentMemoIds(formData: FormData) {
  return formData
    .getAll("studentMemoIds")
    .map(String)
    .map((value) => value.trim())
    .filter(Boolean);
}

function safeReturnTo(value: string) {
  return value.startsWith("/memos") ? value : "/memos";
}

function priorityValue(value: string) {
  return announcementPriorities.includes(value as AnnouncementPriority) ? (value as AnnouncementPriority) : AnnouncementPriority.NORMAL;
}

function stickyColor(value: string) {
  return stickyColors.has(value) ? value : "#FEF3C7";
}

function checked(formData: FormData, key: string) {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

function revalidateMemoSurfaces() {
  revalidatePath("/memos");
  revalidatePath("/", "layout");
}

function requireAnnouncementManager(role: string) {
  if (!canManageAnnouncements(role)) redirect("/memos?error=permission");
}

export async function createAnnouncementAction(formData: FormData) {
  const user = await requireUser();
  requireAnnouncementManager(user.role);

  const title = text(formData, "title");
  const content = text(formData, "content");
  if (!title || !content) redirect("/memos?error=announcement-empty");

  await prisma.announcementMemo.create({
    data: {
      academyId: user.academyId,
      authorId: user.id,
      title,
      content,
      priority: priorityValue(text(formData, "priority")),
      isPinned: checked(formData, "isPinned"),
    },
  });

  revalidateMemoSurfaces();
}

export async function updateAnnouncementAction(formData: FormData) {
  const user = await requireUser();
  requireAnnouncementManager(user.role);

  const id = text(formData, "announcementId");
  const title = text(formData, "title");
  const content = text(formData, "content");
  if (!id || !title || !content) redirect("/memos?error=announcement-empty");

  await prisma.announcementMemo.updateMany({
    where: { id, academyId: user.academyId },
    data: {
      title,
      content,
      priority: priorityValue(text(formData, "priority")),
      isPinned: checked(formData, "isPinned"),
    },
  });

  revalidateMemoSurfaces();
}

export async function deleteAnnouncementAction(formData: FormData) {
  const user = await requireUser();
  requireAnnouncementManager(user.role);

  const id = text(formData, "announcementId");
  if (!id) return;

  await prisma.announcementMemo.deleteMany({
    where: { id, academyId: user.academyId },
  });

  revalidateMemoSurfaces();
}

export async function markAnnouncementReadAction(formData: FormData) {
  const user = await requireUser();
  const announcementId = text(formData, "announcementId");
  if (!announcementId) return;

  const announcement = await prisma.announcementMemo.findFirst({
    where: { id: announcementId, academyId: user.academyId },
    select: { id: true, academyId: true },
  });
  if (!announcement) return;

  await prisma.announcementRead.upsert({
    where: {
      announcementId_userId: {
        announcementId: announcement.id,
        userId: user.id,
      },
    },
    update: { readAt: new Date() },
    create: {
      academyId: announcement.academyId,
      announcementId: announcement.id,
      userId: user.id,
    },
  });

  revalidateMemoSurfaces();
}

export async function createStickyMemoAction(formData: FormData) {
  const user = await requireUser();
  const content = text(formData, "content");
  if (!content) return;

  await prisma.personalStickyMemo.create({
    data: {
      academyId: user.academyId,
      userId: user.id,
      content,
      color: stickyColor(text(formData, "color")),
    },
  });

  revalidateMemoSurfaces();
}

export async function updateStickyMemoAction(formData: FormData) {
  const user = await requireUser();
  const id = text(formData, "stickyMemoId");
  const content = text(formData, "content");
  if (!id || !content) return;

  await prisma.personalStickyMemo.updateMany({
    where: {
      id,
      academyId: user.academyId,
      userId: user.id,
    },
    data: {
      content,
      color: stickyColor(text(formData, "color")),
    },
  });

  revalidateMemoSurfaces();
}

export async function deleteStickyMemoAction(formData: FormData) {
  const user = await requireUser();
  const id = text(formData, "stickyMemoId");
  if (!id) return;

  await prisma.personalStickyMemo.deleteMany({
    where: {
      id,
      academyId: user.academyId,
      userId: user.id,
    },
  });

  revalidateMemoSurfaces();
}

export async function bulkStudentMemoAction(formData: FormData) {
  const user = await requireUser();
  const action = text(formData, "bulkAction");
  const returnTo = safeReturnTo(text(formData, "returnTo"));
  const ids = selectedStudentMemoIds(formData);

  if (ids.length === 0) redirect(returnTo);

  if (action === "pin" || action === "unpin") {
    await prisma.studentMemo.updateMany({
      where: {
        id: { in: ids },
        student: { academyId: user.academyId },
      },
      data: { isImportant: action === "pin" },
    });
  }

  if (action === "type") {
    const nextType = text(formData, "memoType") as MemoType;
    if (memoTypes.includes(nextType)) {
      await prisma.studentMemo.updateMany({
        where: {
          id: { in: ids },
          student: { academyId: user.academyId },
        },
        data: { type: nextType },
      });
    }
  }

  revalidatePath("/memos");
  revalidatePath("/students");
  redirect(returnTo);
}
