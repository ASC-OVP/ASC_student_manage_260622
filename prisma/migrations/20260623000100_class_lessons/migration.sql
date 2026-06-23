CREATE TABLE "ClassLesson" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "academyId" TEXT NOT NULL,
    "classGroupId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "lessonDate" TEXT,
    "startTime" TEXT,
    "endTime" TEXT,
    "memo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassLesson_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClassLesson_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES "ClassGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ClassLesson_classGroupId_position_key" ON "ClassLesson"("classGroupId", "position");
CREATE INDEX "ClassLesson_academyId_idx" ON "ClassLesson"("academyId");
CREATE INDEX "ClassLesson_classGroupId_idx" ON "ClassLesson"("classGroupId");
CREATE INDEX "ClassLesson_academyId_lessonDate_idx" ON "ClassLesson"("academyId", "lessonDate");
