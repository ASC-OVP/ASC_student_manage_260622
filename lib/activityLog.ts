import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";

export type ActivityActor = {
  id: string;
  academyId: string;
  name: string;
  role: string;
};

export type ActivityLogRow = {
  id: string;
  academyId: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  metadata: string | null;
  createdAt: string | Date;
};

export async function ensureActivityLogTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ActivityLog" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "academyId" TEXT NOT NULL,
      "actorId" TEXT,
      "actorName" TEXT,
      "actorRole" TEXT,
      "action" TEXT NOT NULL,
      "entityType" TEXT NOT NULL,
      "entityId" TEXT,
      "summary" TEXT NOT NULL,
      "metadata" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ActivityLog_academyId_createdAt_idx" ON "ActivityLog"("academyId", "createdAt")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ActivityLog_entity_idx" ON "ActivityLog"("entityType", "entityId")`);
}

export async function recordActivity(params: {
  actor: ActivityActor;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  metadata?: unknown;
}) {
  try {
    await ensureActivityLogTable();
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO "ActivityLog" (
          "id", "academyId", "actorId", "actorName", "actorRole",
          "action", "entityType", "entityId", "summary", "metadata", "createdAt"
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `,
      randomUUID(),
      params.actor.academyId,
      params.actor.id,
      params.actor.name,
      params.actor.role,
      params.action,
      params.entityType,
      params.entityId ?? null,
      params.summary.slice(0, 500),
      params.metadata ? JSON.stringify(params.metadata).slice(0, 2000) : null
    );
  } catch {
    // Activity logging should never block the real operation.
  }
}

export async function getRecentActivity(academyId: string, limit = 30) {
  await ensureActivityLogTable();
  return prisma.$queryRawUnsafe<ActivityLogRow[]>(
    `
      SELECT "id", "academyId", "actorId", "actorName", "actorRole",
             "action", "entityType", "entityId", "summary", "metadata", "createdAt"
      FROM "ActivityLog"
      WHERE "academyId" = ?
      ORDER BY "createdAt" DESC
      LIMIT ?
    `,
    academyId,
    limit
  );
}

export async function getActivityCountSince(academyId: string, isoDateTime: string) {
  await ensureActivityLogTable();
  const rows = await prisma.$queryRawUnsafe<Array<{ count: number | bigint }>>(
    `SELECT COUNT(*) as count FROM "ActivityLog" WHERE "academyId" = ? AND "createdAt" >= ?`,
    academyId,
    isoDateTime
  );
  return Number(rows[0]?.count ?? 0);
}
