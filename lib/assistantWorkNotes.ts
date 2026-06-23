import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";

export const assistantWorkNotesSettingKey = "assistantWorkNotes.v1";

export type AssistantWorkNote = {
  content: string;
  updatedAt: string;
  updatedById: string;
  updatedByName: string;
};

export type AssistantWorkNotes = Record<string, AssistantWorkNote>;

export async function getAssistantWorkNotes(academyId: string) {
  const setting = await prisma.academySetting.findUnique({
    where: { academyId_key: { academyId, key: assistantWorkNotesSettingKey } },
    select: { value: true },
  });

  return normalizeAssistantWorkNotes(parseJson(setting?.value));
}

export async function saveAssistantWorkNote({
  academyId,
  assistantId,
  content,
  actor,
}: {
  academyId: string;
  assistantId: string;
  content: string;
  actor: { id: string; name: string };
}) {
  const notes = await getAssistantWorkNotes(academyId);
  const trimmed = content.trim().slice(0, 1000);

  if (trimmed) {
    notes[assistantId] = {
      content: trimmed,
      updatedAt: new Date().toISOString(),
      updatedById: actor.id,
      updatedByName: actor.name,
    };
  } else {
    delete notes[assistantId];
  }

  await prisma.academySetting.upsert({
    where: { academyId_key: { academyId, key: assistantWorkNotesSettingKey } },
    update: { value: JSON.stringify(notes) },
    create: {
      id: randomUUID(),
      academyId,
      key: assistantWorkNotesSettingKey,
      value: JSON.stringify(notes),
    },
  });
}

function normalizeAssistantWorkNotes(value: unknown): AssistantWorkNotes {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const notes: AssistantWorkNotes = {};
  for (const [assistantId, rawNote] of Object.entries(value)) {
    if (!rawNote || typeof rawNote !== "object" || Array.isArray(rawNote)) continue;
    const note = rawNote as Partial<AssistantWorkNote>;
    const content = typeof note.content === "string" ? note.content.trim().slice(0, 1000) : "";
    if (!assistantId || !content) continue;

    notes[assistantId] = {
      content,
      updatedAt: typeof note.updatedAt === "string" ? note.updatedAt : "",
      updatedById: typeof note.updatedById === "string" ? note.updatedById : "",
      updatedByName: typeof note.updatedByName === "string" ? note.updatedByName : "",
    };
  }

  return notes;
}

function parseJson(value?: string) {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
