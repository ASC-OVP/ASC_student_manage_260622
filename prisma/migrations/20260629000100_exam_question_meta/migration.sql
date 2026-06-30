-- CreateTable
CREATE TABLE "ExamQuestionMeta" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "examId" TEXT NOT NULL,
    "questionNo" INTEGER NOT NULL,
    "primaryType" TEXT,
    "secondaryType" TEXT,
    "answerFormat" TEXT,
    "difficulty" TEXT,
    "section" TEXT,
    "learningGoal" TEXT,
    "achievementStandard" TEXT,
    "tags" TEXT,
    "memo" TEXT,
    "omrMappingStatus" TEXT NOT NULL DEFAULT 'UNMAPPED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExamQuestionMeta_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ExamQuestionMeta_examId_questionNo_key" ON "ExamQuestionMeta"("examId", "questionNo");

-- CreateIndex
CREATE INDEX "ExamQuestionMeta_examId_idx" ON "ExamQuestionMeta"("examId");

-- CreateIndex
CREATE INDEX "ExamQuestionMeta_primaryType_idx" ON "ExamQuestionMeta"("primaryType");

-- CreateIndex
CREATE INDEX "ExamQuestionMeta_difficulty_idx" ON "ExamQuestionMeta"("difficulty");

-- CreateIndex
CREATE INDEX "ExamQuestionMeta_omrMappingStatus_idx" ON "ExamQuestionMeta"("omrMappingStatus");
