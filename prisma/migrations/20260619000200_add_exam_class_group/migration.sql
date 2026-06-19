-- AlterTable
ALTER TABLE "Exam" ADD COLUMN "classGroupId" TEXT;

-- CreateIndex
CREATE INDEX "Exam_academyId_classGroupId_idx" ON "Exam"("academyId", "classGroupId");
