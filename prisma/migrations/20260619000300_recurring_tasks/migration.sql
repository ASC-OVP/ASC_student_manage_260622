-- CreateTable
CREATE TABLE "RecurringTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "academyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'OTHER',
    "assigneeId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "studentId" TEXT,
    "classGroupId" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "recurrenceType" TEXT NOT NULL DEFAULT 'WEEKLY',
    "daysOfWeek" TEXT,
    "dayOfMonth" INTEGER,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT,
    "dueTime" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RecurringTask_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecurringTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecurringTask_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecurringTask_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RecurringTask_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES "ClassGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "recurringTaskId" TEXT;
ALTER TABLE "Task" ADD COLUMN "scheduledDate" TEXT;

-- CreateIndex
CREATE INDEX "RecurringTask_academyId_idx" ON "RecurringTask"("academyId");
CREATE INDEX "RecurringTask_assigneeId_idx" ON "RecurringTask"("assigneeId");
CREATE INDEX "RecurringTask_creatorId_idx" ON "RecurringTask"("creatorId");
CREATE INDEX "RecurringTask_studentId_idx" ON "RecurringTask"("studentId");
CREATE INDEX "RecurringTask_classGroupId_idx" ON "RecurringTask"("classGroupId");
CREATE INDEX "RecurringTask_isActive_idx" ON "RecurringTask"("isActive");
CREATE INDEX "Task_recurringTaskId_idx" ON "Task"("recurringTaskId");
CREATE INDEX "Task_scheduledDate_idx" ON "Task"("scheduledDate");
CREATE UNIQUE INDEX "Task_recurringTaskId_scheduledDate_key" ON "Task"("recurringTaskId", "scheduledDate");
