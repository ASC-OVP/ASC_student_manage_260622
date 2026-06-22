-- AlterTable
ALTER TABLE "Task" ADD COLUMN "color" TEXT;

-- CreateTable
CREATE TABLE "TaskAssignee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "academyId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaskAssignee_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskAssignee_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskAssignee_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssistantWorkShift" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "academyId" TEXT NOT NULL,
    "assistantId" TEXT NOT NULL,
    "workDate" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "hourlyWage" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "memo" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AssistantWorkShift_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AssistantWorkShift_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AssistantWorkShift_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CalendarPrivateMemo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "academyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CalendarPrivateMemo_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CalendarPrivateMemo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Preserve every existing single-assignee task as the first assignment row.
INSERT INTO "TaskAssignee" ("id", "academyId", "taskId", "assigneeId", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
       substr(lower(hex(randomblob(2))), 2) || '-' ||
       substr('89ab', abs(random()) % 4 + 1, 1) ||
       substr(lower(hex(randomblob(2))), 2) || '-' ||
       lower(hex(randomblob(6))),
       "academyId",
       "id",
       "assigneeId",
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
FROM "Task";

-- CreateIndex
CREATE UNIQUE INDEX "TaskAssignee_taskId_assigneeId_key" ON "TaskAssignee"("taskId", "assigneeId");
CREATE INDEX "TaskAssignee_academyId_idx" ON "TaskAssignee"("academyId");
CREATE INDEX "TaskAssignee_taskId_idx" ON "TaskAssignee"("taskId");
CREATE INDEX "TaskAssignee_assigneeId_idx" ON "TaskAssignee"("assigneeId");
CREATE INDEX "AssistantWorkShift_academyId_workDate_idx" ON "AssistantWorkShift"("academyId", "workDate");
CREATE INDEX "AssistantWorkShift_assistantId_workDate_idx" ON "AssistantWorkShift"("assistantId", "workDate");
CREATE INDEX "AssistantWorkShift_status_idx" ON "AssistantWorkShift"("status");
CREATE UNIQUE INDEX "CalendarPrivateMemo_userId_date_key" ON "CalendarPrivateMemo"("userId", "date");
CREATE INDEX "CalendarPrivateMemo_academyId_date_idx" ON "CalendarPrivateMemo"("academyId", "date");
