import Link from "next/link";
import type { CSSProperties } from "react";
import StudentClassGroupSelect from "@/features/students/components/StudentClassGroupSelect";
import StudentExcelUploadModal from "@/features/students/components/StudentExcelUploadModal";
import StudentLessonSpreadsheet, { type ClassTestExamOption, type LessonClassGroupOption } from "@/features/students/components/StudentLessonSpreadsheet";
import type { StudentSheetRow } from "@/features/students/components/StudentSheetMatrix";
import { requireUser } from "@/lib/auth";
import { getStudentSheetCustomSettings, getStudentSheetOptionSettings } from "@/lib/academySettings";
import { classGroupWhereForUser } from "@/lib/classGroups";
import { todayKoreaDate } from "@/lib/date";
import type { Prisma } from "@/lib/generated/prisma";
import { prisma } from "@/lib/prisma";
import { studentWhereForUser } from "@/lib/scopes";

type Props = {
  searchParams?: Promise<{
    date?: string;
    classGroupId?: string;
    testId?: string;
  }>;
};

export const dynamic = "force-dynamic";

const ALL_TESTS_OPTION_ID = "all-tests";

export default async function StudentsPage({ searchParams }: Props) {
  const user = await requireUser();
  const sp = (await searchParams) ?? {};
  const date = isDate(sp.date) ? String(sp.date) : todayKoreaDate();
  const requestedClassGroupId = cleanFilter(sp.classGroupId);
  const requestedTestId = cleanFilter(sp.testId);
  const explicitAllClasses = sp.classGroupId === "all";

  const [classGroups, optionSettings, customSettings, uploadStudents] = await Promise.all([
    prisma.classGroup.findMany({
      where: classGroupWhereForUser(user),
      orderBy: [{ status: "asc" }, { name: "asc" }],
      include: {
        teacher: { select: { id: true, name: true } },
        lessons: {
          orderBy: { position: "asc" },
          select: { id: true, position: true, title: true, lessonDate: true, startTime: true, endTime: true, memo: true },
        },
      },
    }),
    getStudentSheetOptionSettings(user.academyId),
    getStudentSheetCustomSettings(user.academyId),
    prisma.student.findMany({
      where: studentWhereForUser(user),
      orderBy: [{ name: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, phone: true, parentPhone: true },
    }),
  ]);

  const classGroupOptions: LessonClassGroupOption[] = classGroups.map((classGroup) => ({
    id: classGroup.id,
    name: classGroup.name,
    teacherName: classGroup.teacher?.name ?? "",
    startDate: classGroup.startDate,
    endDate: classGroup.endDate,
    daysOfWeek: classGroup.daysOfWeek,
    startTime: classGroup.startTime,
    endTime: classGroup.endTime,
    schedule: classGroup.schedule,
    lessons: classGroup.lessons,
  }));
  const fallbackClassGroupId =
    classGroupOptions.find((classGroup) => classGroup.startDate || classGroup.daysOfWeek || classGroup.schedule)?.id ??
    classGroupOptions[0]?.id ??
    null;
  const effectiveClassGroupId = requestedClassGroupId ?? (explicitAllClasses ? null : fallbackClassGroupId);

  const classTestOptions = effectiveClassGroupId
    ? await prisma.classTest.findMany({
        where: { academyId: user.academyId, classGroupId: effectiveClassGroupId, active: true },
        orderBy: [{ type: "asc" }, { createdAt: "desc" }],
        select: {
          id: true,
          classGroupId: true,
          name: true,
          type: true,
          subject: true,
          totalScore: true,
          questionCount: true,
          classLessonId: true,
          lessonPosition: true,
          templateType: true,
          active: true,
          exams: {
            orderBy: [{ lessonPosition: "asc" }, { examDate: "asc" }, { createdAt: "desc" }],
            select: { id: true, classLessonId: true, lessonPosition: true, title: true, examDate: true, totalScore: true, questionCount: true },
          },
        },
      })
    : [];

  const selectedClassGroupOption = classGroupOptions.find((classGroup) => classGroup.id === effectiveClassGroupId) ?? null;
  const lessonLabelById = new Map((selectedClassGroupOption?.lessons ?? []).map((lesson) => [lesson.id, lesson.position]));

  const testOptions: ClassTestExamOption[] = classTestOptions.map((classTest) => {
    const singleLessonPosition = classTest.lessonPosition ?? (classTest.classLessonId ? lessonLabelById.get(classTest.classLessonId) ?? null : null);
    const displayName = classTest.type === "SINGLE" && singleLessonPosition ? String(singleLessonPosition) + "\uCC28\uC2DC " + classTest.name : classTest.name;
    return {
      id: classTest.id,
      classGroupId: classTest.classGroupId,
      classTestId: classTest.id,
      classLessonId: classTest.classLessonId,
      lessonPosition: classTest.lessonPosition,
      type: classTest.type,
      name: classTest.name,
      displayName,
      subject: classTest.subject,
      totalScore: classTest.totalScore,
      questionCount: classTest.questionCount,
      templateType: classTest.templateType,
      active: classTest.active,
      exams: classTest.exams,
    };
  });
  const requestedAllTests = requestedTestId === ALL_TESTS_OPTION_ID;
  const selectedTestExamId = requestedAllTests && testOptions.length > 0
    ? ALL_TESTS_OPTION_ID
    : requestedTestId && testOptions.some((test) => test.id === requestedTestId)
      ? requestedTestId
      : testOptions.length === 1
        ? testOptions[0].id
        : testOptions.length > 1
          ? ALL_TESTS_OPTION_ID
          : null;
  const selectedTestOption = selectedTestExamId && selectedTestExamId !== ALL_TESTS_OPTION_ID ? testOptions.find((test) => test.id === selectedTestExamId) ?? null : null;

  const filters: Prisma.StudentWhereInput[] = [];
  if (effectiveClassGroupId) filters.push({ studentClasses: { some: { classGroupId: effectiveClassGroupId } } });

  const studentWhere: Prisma.StudentWhereInput = {
    AND: [studentWhereForUser(user), ...filters],
  };

  const students = await prisma.student.findMany({
    where: studentWhere,
    orderBy: [{ name: "asc" }, { createdAt: "asc" }],
    include: {
      attendanceRecords: { orderBy: { date: "desc" }, select: { date: true, status: true } },
      assignmentRecords: { orderBy: [{ date: "desc" }, { updatedAt: "desc" }], select: { date: true, status: true, score: true, title: true } },
      scoreRecords: { orderBy: [{ date: "desc" }, { updatedAt: "desc" }], select: { date: true, title: true, score: true, maxScore: true } },
      studentClasses: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
        include: { classGroup: { select: { id: true, name: true } } },
      },
    },
  });

  const selectedTestIds = selectedTestExamId === ALL_TESTS_OPTION_ID
    ? testOptions.map((test) => test.id)
    : selectedTestExamId
      ? [selectedTestExamId]
      : [];
  const selectedTestScores = selectedTestIds.length > 0
    ? await prisma.studentTestScore.findMany({
        where: { academyId: user.academyId, classTestId: { in: selectedTestIds }, studentId: { in: students.map((student) => student.id) } },
        select: { studentId: true, examId: true, score: true },
      })
    : [];
  const selectedTestScoreByStudentId = new Map<string, Record<string, string>>();
  const firstSelectedScoreByStudentId = new Map<string, number | null>();
  for (const score of selectedTestScores) {
    const current = selectedTestScoreByStudentId.get(score.studentId) ?? {};
    if (score.score !== null && score.score !== undefined) current[score.examId] = String(score.score);
    selectedTestScoreByStudentId.set(score.studentId, current);
    if (!firstSelectedScoreByStudentId.has(score.studentId)) firstSelectedScoreByStudentId.set(score.studentId, score.score);
  }
  const canUploadStudents = user.role === "ADMIN" || user.role === "MANAGER" || user.role === "TEACHER";

  const rows: StudentSheetRow[] = students.map((student, index) => {
    const selectedClass = effectiveClassGroupId ? student.studentClasses.find((membership) => membership.classGroupId === effectiveClassGroupId) : null;
    const primaryClass = selectedClass ?? student.studentClasses.find((membership) => membership.isPrimary) ?? student.studentClasses[0];
    const attendance = student.attendanceRecords.find((record) => record.date === date);
    const assignment = student.assignmentRecords.find((record) => record.date === date);
    const legacyScore = student.scoreRecords.find((record) => record.date === date);
    const selectedTestScoreMap = selectedTestScoreByStudentId.get(student.id) ?? {};
    const selectedTestScore = firstSelectedScoreByStudentId.get(student.id);
    const attendanceStatus = attendance?.status ?? "";
    const assignmentStatus = assignment?.status ?? "";

    return {
      id: student.id,
      no: index + 1,
      name: student.name,
      phone: student.phone ?? "",
      parentPhone: student.parentPhone ?? "",
      schoolName: student.schoolName ?? "",
      grade: student.grade ?? "",
      classGroupId: primaryClass?.classGroupId ?? "",
      classGroupName: primaryClass?.classGroup?.name ?? "",
      subject: student.subject ?? "",
      currentLevel: student.currentLevel ?? "",
      memo: student.memo ?? "",
      attendance: sheetOptionLabel(optionSettings.attendanceOptions, attendanceStatus),
      assignment: sheetOptionLabel(optionSettings.assignmentOptions, assignmentStatus),
      assignmentScore: assignment?.score ?? null,
      score: selectedTestScore ?? legacyScore?.score ?? null,
      maxScore: selectedTestOption?.totalScore ?? legacyScore?.maxScore ?? 100,
      attendanceByDate: Object.fromEntries(
        student.attendanceRecords.map((record) => [record.date, sheetOptionLabel(optionSettings.attendanceOptions, record.status)])
      ),
      assignmentByDate: Object.fromEntries(
        student.assignmentRecords.map((record) => [record.date, sheetOptionLabel(optionSettings.assignmentOptions, record.status)])
      ),
      scoreByDate: Object.fromEntries(
        student.scoreRecords
          .filter((record) => record.score !== null)
          .map((record) => [record.date, String(record.score ?? "")])
      ),
      testScoreByExamId: selectedTestScoreMap,
      customValues: customSettings.customValues[student.id] ?? {},
    };
  });

  return (
    <main style={page}>
      <section style={container}>
        <header style={header}>
          <div style={headingRow}>
            <p style={eyebrow}>학생 현황판</p>
            <h1 style={title}>스프레드시트 학생 관리</h1>
            <span style={desc}>반별 학생 정보와 날짜별 차시 기록</span>
          </div>
          <div style={headerActions}>
            <StudentClassGroupSelect selectedId={effectiveClassGroupId} classGroups={classGroupOptions} />
            {canUploadStudents && (
              <StudentExcelUploadModal
                classGroups={classGroupOptions}
                existingStudents={uploadStudents.map((student) => ({
                  id: student.id,
                  name: student.name,
                  phone: student.phone ?? "",
                  parentPhone: student.parentPhone ?? "",
                }))}
                defaultClassGroupId={effectiveClassGroupId}
              />
            )}
            <Link
              href={effectiveClassGroupId ? `/students/new?classGroupId=${encodeURIComponent(effectiveClassGroupId)}` : "/students/new"}
              style={addButton}
            >
              + 학생 추가
            </Link>
          </div>
        </header>

        <StudentLessonSpreadsheet
          rows={rows}
          customColumns={customSettings.customColumns}
          selectedClassGroupId={effectiveClassGroupId}
          classGroups={classGroupOptions}
          classTests={testOptions}
          selectedTestExamId={selectedTestExamId}
        />
      </section>
    </main>
  );
}

function isDate(value?: string) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function cleanFilter(value?: string) {
  if (!value || value === "none" || value === "-" || value === "all") return null;
  return /^[A-Za-z0-9_-]{1,80}$/.test(value) ? value : null;
}

function sheetOptionLabel(options: Array<{ value: string; label: string }>, value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}

const page: CSSProperties = { height: "100vh", minHeight: 0, overflow: "hidden", background: "var(--asc-bg-subtle)", color: "var(--asc-text)" };
const container: CSSProperties = {
  width: "100%",
  height: "100%",
  maxWidth: "none",
  margin: 0,
  padding: 6,
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
  gap: 6,
  minHeight: 0,
};
const header: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  background: "var(--asc-surface)",
  border: "1px solid var(--asc-border)",
  borderRadius: 8,
  padding: "6px 10px",
};
const headingRow: CSSProperties = { display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", minWidth: 0 };
const eyebrow: CSSProperties = { margin: 0, color: "var(--asc-primary)", fontSize: 11, fontWeight: 900 };
const title: CSSProperties = { margin: 0, fontSize: 20, fontWeight: 950, lineHeight: 1.1 };
const desc: CSSProperties = { color: "var(--asc-text-muted)", fontSize: 12, fontWeight: 700 };
const addButton: CSSProperties = {
  height: 30,
  display: "inline-flex",
  alignItems: "center",
  background: "var(--asc-primary)",
  color: "#fff",
  border: "1px solid var(--asc-primary)",
  borderRadius: 7,
  padding: "0 11px",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 900,
  whiteSpace: "nowrap",
};
const headerActions: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  justifyContent: "flex-end",
};