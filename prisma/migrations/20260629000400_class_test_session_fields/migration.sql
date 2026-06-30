-- Add class-test session metadata without rebuilding existing data.
ALTER TABLE "ClassTest" ADD COLUMN "classLessonId" TEXT REFERENCES "ClassLesson" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClassTest" ADD COLUMN "lessonPosition" INTEGER;
ALTER TABLE "ClassTest" ADD COLUMN "templateType" TEXT NOT NULL DEFAULT 'OTHER';

CREATE INDEX "ClassTest_classLessonId_idx" ON "ClassTest"("classLessonId");
