CREATE TABLE "CalendarEventMemo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "academyId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventDate" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "writerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CalendarEventMemo_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CalendarEventMemo_writerId_fkey" FOREIGN KEY ("writerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CalendarEventMemo_academyId_eventKey_key" ON "CalendarEventMemo"("academyId", "eventKey");
CREATE INDEX "CalendarEventMemo_academyId_eventDate_idx" ON "CalendarEventMemo"("academyId", "eventDate");
CREATE INDEX "CalendarEventMemo_writerId_idx" ON "CalendarEventMemo"("writerId");
