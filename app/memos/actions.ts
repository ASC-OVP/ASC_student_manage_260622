"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { MemoType } from "@/lib/generated/prisma";
import { prisma } from "@/lib/prisma";

const memoTypes = Object.values(MemoType) as MemoType[];
const ANNOUNCEMENT_KEY = "memos.announcements";
const stickyKey = (userId: string) => `memos.sticky.${userId}`;
const stickyColors = new Set(["#fef3c7", "#dbeafe", "#dcfce7", "#fce7f3", "#ede9fe", "#fee2e2"]);
const announcementPriorities = new Set(["NORMAL", "IMPORTANT", "URGENT"]);

type AnnouncementMemo = {
  id: string;
  title: string;
  content: string;
  priority: string;
  isPinned: boolean;
  authorId: string;
  authorName: string;
  readBy: string[];
  createdAt: string;
  updatedAt: string;
};

type PersonalStickyMemo = {
  id: string;
  content: string;
  color: string;
  createdAt: string;
  updatedAt: string;
};

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

function canManageAnnouncements(role: string) {
  return role === "ADMIN" || role === "MANAGER" || role === "TEACHER";
}

function nowIso() {
  return new Date().toISOString();
}

async function readSetting<T>(academyId: string, key: string, fallback: T): Promise<T> {
  const setting = await prisma.academySetting.findUnique({
    where: { academyId_key: { academyId, key } },
    select: { value: true },
  });

  if (!setting?.value) return fallback;

  try {
    return JSON.parse(setting.value) as T;
  } catch {
    return fallback;
  }
}

async function writeSetting<T>(academyId: string, key: string, value: T) {
  await prisma.academySetting.upsert({
    where: { academyId_key: { academyId, key } },
    create: { academyId, key, value: JSON.stringify(value) },
    update: { value: JSON.stringify(value) },
  });
}

export async function createAnnouncementAction(formData: FormData) {
  const user = await requireUser();
  if (!canManageAnnouncements(user.role)) redirect("/memos");

  const title = text(formData, "title");
  const content = text(formData, "content");
  if (!title || !content) redirect("/memos");

  const priorityRaw = text(formData, "priority");
  const priority = announcementPriorities.has(priorityRaw) ? priorityRaw : "NORMAL";
  const isPinned = formData.get("isPinned") === "on";
  const announcements = await readSetting<AnnouncementMemo[]>(user.academyId, ANNOUNCEMENT_KEY, []);
  const timestamp = nowIso();

  announcements.unshift({
    id: crypto.randomUUID(),
    title,
    content,
    priority,
    isPinned,
    authorId: user.id,
    authorName: user.name,
    readBy: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await writeSetting(user.academyId, ANNOUNCEMENT_KEY, announcements.slice(0, 80));
  revalidatePath("/memos");
  redirect("/memos");
}

export async function markAnnouncementReadAction(formData: FormData) {
  const user = await requireUser();
  const announcementId = text(formData, "announcementId");
  const announcements = await readSetting<AnnouncementMemo[]>(user.academyId, ANNOUNCEMENT_KEY, []);
  const next = announcements.map((announcement) => {
    if (announcement.id !== announcementId || announcement.readBy.includes(user.id)) return announcement;
    return { ...announcement, readBy: [...announcement.readBy, user.id], updatedAt: nowIso() };
  });

  await writeSetting(user.academyId, ANNOUNCEMENT_KEY, next);
  revalidatePath("/memos");
  redirect("/memos");
}

export async function toggleAnnouncementPinAction(formData: FormData) {
  const user = await requireUser();
  if (!canManageAnnouncements(user.role)) redirect("/memos");

  const announcementId = text(formData, "announcementId");
  const announcements = await readSetting<AnnouncementMemo[]>(user.academyId, ANNOUNCEMENT_KEY, []);
  const next = announcements.map((announcement) =>
    announcement.id === announcementId
      ? { ...announcement, isPinned: !announcement.isPinned, updatedAt: nowIso() }
      : announcement
  );

  await writeSetting(user.academyId, ANNOUNCEMENT_KEY, next);
  revalidatePath("/memos");
  redirect("/memos");
}

export async function deleteAnnouncementAction(formData: FormData) {
  const user = await requireUser();
  if (!canManageAnnouncements(user.role)) redirect("/memos");

  const announcementId = text(formData, "announcementId");
  const announcements = await readSetting<AnnouncementMemo[]>(user.academyId, ANNOUNCEMENT_KEY, []);
  await writeSetting(
    user.academyId,
    ANNOUNCEMENT_KEY,
    announcements.filter((announcement) => announcement.id !== announcementId)
  );
  revalidatePath("/memos");
  redirect("/memos");
}

export async function createStickyMemoAction(formData: FormData) {
  const user = await requireUser();
  const content = text(formData, "content");
  if (!content) redirect("/memos");

  const colorRaw = text(formData, "color");
  const color = stickyColors.has(colorRaw) ? colorRaw : "#fef3c7";
  const stickies = await readSetting<PersonalStickyMemo[]>(user.academyId, stickyKey(user.id), []);
  const timestamp = nowIso();

  stickies.unshift({
    id: crypto.randomUUID(),
    content,
    color,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await writeSetting(user.academyId, stickyKey(user.id), stickies.slice(0, 60));
  revalidatePath("/memos");
  redirect("/memos");
}

export async function updateStickyMemoAction(formData: FormData) {
  const user = await requireUser();
  const stickyId = text(formData, "stickyId");
  const content = text(formData, "content");
  const colorRaw = text(formData, "color");
  const color = stickyColors.has(colorRaw) ? colorRaw : "#fef3c7";
  const stickies = await readSetting<PersonalStickyMemo[]>(user.academyId, stickyKey(user.id), []);

  const next = stickies
    .map((sticky) =>
      sticky.id === stickyId
        ? { ...sticky, content, color, updatedAt: nowIso() }
        : sticky
    )
    .filter((sticky) => sticky.content.trim().length > 0);

  await writeSetting(user.academyId, stickyKey(user.id), next);
  revalidatePath("/memos");
  redirect("/memos");
}

export async function deleteStickyMemoAction(formData: FormData) {
  const user = await requireUser();
  const stickyId = text(formData, "stickyId");
  const stickies = await readSetting<PersonalStickyMemo[]>(user.academyId, stickyKey(user.id), []);
  await writeSetting(
    user.academyId,
    stickyKey(user.id),
    stickies.filter((sticky) => sticky.id !== stickyId)
  );
  revalidatePath("/memos");
  redirect("/memos");
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
