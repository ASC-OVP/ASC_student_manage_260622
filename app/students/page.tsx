import Link from "next/link";
import type { CSSProperties } from "react";
import StudentLessonSpreadsheet, { type LessonClassGroupOption } from "@/components/StudentLessonSpreadsheet";
import StudentSheetMatrix, { type ClassGroupOption, type StaffOption, type StudentSheetRow } from "@/components/StudentSheetMatrix";
import { requireUser } from "@/lib/auth";
import { getStudentSheetCustomSettings, getStudentSheetOptionSettings } from "@/lib/academySettings";
import { classGroupWhereForUser } from "@/lib/classGroups";
import { todayKoreaDate } from "@/lib/date";
import type { Prisma } from "@/lib/generated/prisma";
import { prisma } from "@/lib/prisma";
import { studentWhereForUser } from "@/lib/scopes";

type Props = {
  searchParams?: Promise<{
    tab?: string;
    date?: string;
    q?: string;
    classGroupId?: string;
    teacherId?: string;
    assistantId?: string;
    school?: string;
  }>;
};

const validTabs = new Set(["all", "lesson", "attendance", "assignment", "score"]);

export const dynamic = "force-dynamic";

export default async function StudentsPage({ searchParams }: Props) {
  const user = await requireUser();
  const sp = (await searchParams) ?? {};
  const date = isDate(sp.date) ? String(sp.date) : todayKoreaDate();
  const mode = validTabs.has(sp.tab ?? "") ? String(sp.tab) : "lesson";
  const classGroupId = cleanFilter(sp.classGroupId);
  const teacherId = cleanFilter(sp.teacherId);
  const assistantId = cleanFilter(sp.assistantId);
  const school = sp.school?.trim() ?? "";
  const q = sp.q?.trim() ?? "";

  const preservedQuery = buildPreservedQuery({
    date,
    q,
    classGroupId,
    teacherId,
    assistantId,
    school,
  });

  const filters: Prisma.StudentWhereInput[] = [];
  if (teacherId) filters.push({ teacherId });
  if (assistantId) filters.push({ assistantId });
  if (school) filters.push({ schoolName: { contains: school } });
  if (classGroupId) filters.push({ studentClasses: { some: { classGroupId } } });
  if (q) {
    filters.push({
      OR: [
        { name: { contains: q } },
        { phone: { contains: q } },
        { parentPhone: { contains: q } },
        { schoolName: { contains: q } },
      ],
    });
  }

  const studentWhere: Prisma.StudentWhereInput = {
    AND: [studentWhereForUser(user), ...filters],
  };

  const [students, classGroups, teachers, assistants, optionSettings, customSettings] = await Promise.all([
    prisma.student.findMany({
      where: studentWhere,
      orderBy: [{ name: "asc" }, { createdAt: "asc" }],
      include: {
        attendanceRecords: { orderBy: { date: "desc" }, select: { date: true, status: true } },
        assignmentRecords: { orderBy: [{ date: "desc" }, { updatedAt: "desc" }], select: { date: true, status: true, score: true, title: true } },
        scoreRecords: { orderBy: [{ date: "desc" }, { updatedAt: "desc" }], select: { date: true, title: true, score: true, maxScore: true } },
        memos: { orderBy: [{ isImportant: "desc" }, { createdAt: "desc" }], take: 1 },
        studentClasses: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
          include: { classGroup: { select: { id: true, name: true } } },
        },
      },
    }),
    prisma.classGroup.findMany({
      where: classGroupWhereForUser(user),
      orderBy: [{ status: "asc" }, { name: "asc" }],
      include: { teacher: { select: { id: true, name: true } } },
    }),
    prisma.user.findMany({
      where: { academyId: user.academyId, role: { in: ["ADMIN", "MANAGER", "TEACHER"] }, isActive: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: { id: true, name: true, role: true },
    }),
    prisma.user.findMany({
      where: { academyId: user.academyId, role: "ASSISTANT", isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    }),
    getStudentSheetOptionSettings(user.academyId),
    getStudentSheetCustomSettings(user.academyId),
  ]);

  const classGroupOptions: Array<ClassGroupOption & LessonClassGroupOption> = classGroups.map((classGroup) => ({
    id: classGroup.id,
    name: classGroup.name,
    teacherName: classGroup.teacher?.name ?? "",
    startDate: classGroup.startDate,
    endDate: classGroup.endDate,
    daysOfWeek: classGroup.daysOfWeek,
    startTime: classGroup.startTime,
    endTime: classGroup.endTime,
    schedule: classGroup.schedule,
  }));
  const teacherOptions: StaffOption[] = teachers.map((teacher) => ({ id: teacher.id, name: teacher.name, role: teacher.role }));
  const assistantOptions: StaffOption[] = assistants.map((assistant) => ({ id: assistant.id, name: assistant.name, role: assistant.role }));
  const rows: StudentSheetRow[] = students.map((student, index) => {
    const primaryClass = student.studentClasses.find((membership) => membership.isPrimary) ?? student.studentClasses[0];
    const attendance = student.attendanceRecords.find((record) => record.date === date);
    const assignment = student.assignmentRecords.find((record) => record.date === date);
    const score = student.scoreRecords.find((record) => record.date === date);
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
      memo: student.memos[0]?.content ?? student.memo ?? "",
      attendance: sheetOptionLabel(optionSettings.attendanceOptions, attendanceStatus),
      assignment: sheetOptionLabel(optionSettings.assignmentOptions, assignmentStatus),
      assignmentScore: assignment?.score ?? null,
      score: score?.score ?? null,
      maxScore: score?.maxScore ?? 100,
      attendanceByDate: Object.fromEntries(
        student.attendanceRecords.map((record) => [record.date, sheetOptionLabel(optionSettings.attendanceOptions, record.status)])
      ),
      assignmentByDate: Object.fromEntries(
        student.assignmentRecords.map((record) => [record.date, sheetOptionLabel(optionSettings.assignmentOptions, record.status)])
      ),
      scoreByDate: Object.fromEntries(
        student.scoreRecords
          .filter((record) => record.score !== null)
          .map((record) => [record.date, String(record.score)])
      ),
      customValues: customSettings.customValues[student.id] ?? {},
    };
  });

  const rowClassGroupIds = Array.from(new Set(rows.map((row) => row.classGroupId).filter(Boolean)));
  const fallbackLessonClassGroupId =
    rowClassGroupIds.length === 1
      ? rowClassGroupIds[0]
      : classGroupOptions.find((classGroup) => classGroup.startDate || classGroup.daysOfWeek || classGroup.schedule)?.id ??
        classGroupOptions[0]?.id ??
        null;
  const lessonClassGroupId = mode === "lesson" ? classGroupId ?? fallbackLessonClassGroupId : classGroupId;
  const lessonRows = mode === "lesson" && lessonClassGroupId ? rows.filter((row) => row.classGroupId === lessonClassGroupId) : rows;
  const filterClassGroupValue = classGroupId ?? (mode === "lesson" ? lessonClassGroupId ?? "" : "");
  const lessonPreservedQuery = buildPreservedQuery({
    date,
    q,
    classGroupId: lessonClassGroupId,
    teacherId,
    assistantId,
    school,
  });

  return (
    <main style={page}>
      <section style={container}>
        <header style={header}>
          <div>
            <p style={eyebrow}>학생 현황판</p>
            <h1 style={title}>스프레드시트 학생 관리</h1>
            <p style={desc}>학생 정보, 출석, 과제, 성적을 한 화면에서 바로 수정합니다.</p>
          </div>
          <Link href="/students/new" style={addButton}>+ 학생 추가</Link>
        </header>

        <form style={filterBar}>
          <input type="hidden" name="tab" value={mode} />
          <input name="date" type="date" defaultValue={date} style={input} />
          <input name="q" defaultValue={q} placeholder="이름, 학교, 연락처 검색" style={input} />
          <input name="school" defaultValue={school} placeholder="학교" style={input} />
          <select name="classGroupId" defaultValue={filterClassGroupValue} style={input}>
            <option value="">전체 반</option>
            {classGroupOptions.map((classGroup) => (
              <option key={classGroup.id} value={classGroup.id}>
                {classGroup.teacherName ? `${classGroup.teacherName} / ${classGroup.name}` : classGroup.name}
              </option>
            ))}
          </select>
          <select name="teacherId" defaultValue={teacherId ?? ""} style={input}>
            <option value="">담당 강사 전체</option>
            {teacherOptions.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
            ))}
          </select>
          <select name="assistantId" defaultValue={assistantId ?? ""} style={input}>
            <option value="">담당 조교 전체</option>
            {assistantOptions.map((assistant) => (
              <option key={assistant.id} value={assistant.id}>{assistant.name}</option>
            ))}
          </select>
          <button style={filterButton}>적용</button>
          <Link href="/students" style={resetButton}>초기화</Link>
        </form>

        {mode === "lesson" ? (
          <StudentLessonSpreadsheet
            rows={lessonRows}
            customColumns={customSettings.customColumns}
            preservedQuery={lessonPreservedQuery}
            selectedClassGroupId={lessonClassGroupId}
            classGroups={classGroupOptions}
          />
        ) : (
          <StudentSheetMatrix
            date={date}
            mode={mode}
            rows={rows}
            attendanceOptions={optionSettings.attendanceOptions}
            assignmentOptions={optionSettings.assignmentOptions}
            customColumns={customSettings.customColumns}
            classGroupOptions={classGroupOptions}
            teachers={teacherOptions}
            assistants={assistantOptions}
            preservedQuery={preservedQuery}
          />
        )}
      </section>
    </main>
  );
}

function isDate(value?: string) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function cleanFilter(value?: string) {
  if (!value || value === "none" || value === "-") return null;
  return value;
}

function buildPreservedQuery(params: Record<string, string | null | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  return query.toString();
}

function sheetOptionLabel(options: Array<{ value: string; label: string }>, value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}

const page: CSSProperties = { minHeight: "100vh", background: "#f3f4f6", color: "#111827" };
const container: CSSProperties = { maxWidth: 1760, margin: "0 auto", padding: 14, display: "grid", gap: 10 };
const header: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: "12px 14px",
};
const eyebrow: CSSProperties = { margin: 0, color: "#2563eb", fontSize: 12, fontWeight: 900 };
const title: CSSProperties = { margin: "2px 0", fontSize: 24, fontWeight: 950 };
const desc: CSSProperties = { margin: 0, color: "#6b7280", fontSize: 13 };
const addButton: CSSProperties = { background: "#111827", color: "#fff", borderRadius: 8, padding: "9px 12px", textDecoration: "none", fontWeight: 900, whiteSpace: "nowrap" };
const filterBar: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "140px minmax(180px, 1fr) 120px 180px 160px 160px auto auto",
  gap: 8,
  alignItems: "center",
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 10,
};
const input: CSSProperties = { minWidth: 0, border: "1px solid #d1d5db", borderRadius: 7, padding: "8px 9px", fontSize: 13, background: "#fff" };
const filterButton: CSSProperties = { border: 0, borderRadius: 7, background: "#111827", color: "#fff", padding: "8px 11px", fontWeight: 900, cursor: "pointer" };
const resetButton: CSSProperties = { ...filterButton, background: "#fff", color: "#111827", border: "1px solid #d1d5db", textAlign: "center", textDecoration: "none" };
