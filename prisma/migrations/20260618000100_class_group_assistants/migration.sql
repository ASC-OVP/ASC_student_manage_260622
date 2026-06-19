-- Add many-to-many assistant assignments for class groups while preserving the
-- existing ClassGroup.assistantId representative assistant column.
CREATE TABLE "ClassGroupAssistant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "academyId" TEXT NOT NULL,
    "classGroupId" TEXT NOT NULL,
    "assistantId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassGroupAssistant_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClassGroupAssistant_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES "ClassGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClassGroupAssistant_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT OR IGNORE INTO "ClassGroupAssistant" ("id", "academyId", "classGroupId", "assistantId", "createdAt")
SELECT 'legacy-' || "id" || '-' || "assistantId", "academyId", "id", "assistantId", CURRENT_TIMESTAMP
FROM "ClassGroup"
WHERE "assistantId" IS NOT NULL;

CREATE UNIQUE INDEX "ClassGroupAssistant_classGroupId_assistantId_key" ON "ClassGroupAssistant"("classGroupId", "assistantId");
CREATE INDEX "ClassGroupAssistant_academyId_idx" ON "ClassGroupAssistant"("academyId");
CREATE INDEX "ClassGroupAssistant_classGroupId_idx" ON "ClassGroupAssistant"("classGroupId");
CREATE INDEX "ClassGroupAssistant_assistantId_idx" ON "ClassGroupAssistant"("assistantId");
