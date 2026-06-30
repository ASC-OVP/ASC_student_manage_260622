-- Class-level test definitions and per-student test scores.
CREATE TABLE "ClassTest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "academyId" TEXT NOT NULL,
  "classGroupId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'SINGLE',
  "subject" TEXT,
  "totalScore" INTEGER,
  "questionCount" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ClassTest_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ClassTest_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES "ClassGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "Exam" ADD COLUMN "classTestId" TEXT REFERENCES "ClassTest" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Exam" ADD COLUMN "classLessonId" TEXT REFERENCES "ClassLesson" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Exam" ADD COLUMN "lessonPosition" INTEGER;
ALTER TABLE "Exam" ADD COLUMN "totalScore" INTEGER;

CREATE TABLE "StudentTestScore" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "academyId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "classGroupId" TEXT NOT NULL,
  "classTestId" TEXT NOT NULL,
  "examId" TEXT NOT NULL,
  "classLessonId" TEXT,
  "score" INTEGER,
  "totalScore" INTEGER,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "omrResultId" TEXT,
  "memo" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "StudentTestScore_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StudentTestScore_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StudentTestScore_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES "ClassGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StudentTestScore_classTestId_fkey" FOREIGN KEY ("classTestId") REFERENCES "ClassTest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StudentTestScore_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StudentTestScore_classLessonId_fkey" FOREIGN KEY ("classLessonId") REFERENCES "ClassLesson" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "StudentTestScore_omrResultId_fkey" FOREIGN KEY ("omrResultId") REFERENCES "ExamResult" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ClassTest_academyId_idx" ON "ClassTest"("academyId");
CREATE INDEX "ClassTest_classGroupId_idx" ON "ClassTest"("classGroupId");
CREATE INDEX "ClassTest_classGroupId_active_idx" ON "ClassTest"("classGroupId", "active");
CREATE INDEX "ClassTest_classGroupId_type_idx" ON "ClassTest"("classGroupId", "type");

CREATE INDEX "Exam_classTestId_idx" ON "Exam"("classTestId");
CREATE INDEX "Exam_classLessonId_idx" ON "Exam"("classLessonId");

CREATE UNIQUE INDEX "StudentTestScore_studentId_examId_key" ON "StudentTestScore"("studentId", "examId");
CREATE UNIQUE INDEX "StudentTestScore_omrResultId_key" ON "StudentTestScore"("omrResultId");
CREATE INDEX "StudentTestScore_academyId_idx" ON "StudentTestScore"("academyId");
CREATE INDEX "StudentTestScore_studentId_idx" ON "StudentTestScore"("studentId");
CREATE INDEX "StudentTestScore_classGroupId_idx" ON "StudentTestScore"("classGroupId");
CREATE INDEX "StudentTestScore_classTestId_idx" ON "StudentTestScore"("classTestId");
CREATE INDEX "StudentTestScore_examId_idx" ON "StudentTestScore"("examId");
CREATE INDEX "StudentTestScore_source_idx" ON "StudentTestScore"("source");
