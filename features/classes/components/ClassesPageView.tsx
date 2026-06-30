import type { CSSProperties } from "react";
import { ButtonLink, PageHeader } from "@/components/ui";
import ClassOpenCard from "@/features/classes/components/ClassOpenCard";
import { buildClassStats } from "@/lib/classGroupStats";
import {
  canManageClassGroups,
  classGroupWhereForUser,
  classStatusLabel,
  classStatusTone,
  effectiveClassStatus,
  formatClassSchedule,
} from "@/lib/classGroups";
import { todayKoreaDate } from "@/lib/date";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ClassGroupStatus } from "@/lib/generated/prisma";

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: Promise<{
    q?: string;
    grade?: string;
    subject?: string;
    teacherId?: string;
    status?: string;
  }>;
};

type ClassFilters = { q: string; grade: string; subject: string; teacherId: string; status: string };
type StudentInClass = {
  id: string;
  name: string;
  scoreRecords: Array<{ date: string; title: string; score: number | null; maxScore: number | null; createdAt: Date }>;
  attendanceRecords: Array<{ date: string; status: string }>;
  assignmentRecords: Array<{ date: string; status: string }>;
};
type ClassLessonLite = { id: string; position: number; title: string; lessonDate: string | null; startTime: string | null; endTime: string | null };
type ClassGroupView = {
  id: string;
  name: string;
  teacherId: string | null;
  subject: string | null;
  grade: string | null;
  startDate: string | null;
  endDate: string | null;
  daysOfWeek: string | null;
  startTime: string | null;
  endTime: string | null;
  schedule: string | null;
  status: ClassGroupStatus;
  teacher: { id: string; name: string } | null;
  assistant: { id: string; name: string } | null;
  classAssistants: Array<{ assistantId: string; assistant: { id: string; name: string } }>;
  studentClasses: Array<{ student: StudentInClass }>;
  lessons: ClassLessonLite[];
};
type ClassRow = {
  classGroup: ClassGroupView;
  effectiveStatus: string;
  stats: ReturnType<typeof buildClassStats>;
  lessonSignal: { label: string; value: string };
};

export default async function ClassesPage({ searchParams }: Props) {
  const user = await requireUser();
  const sp = (await searchParams) ?? {};
  const filters: ClassFilters = {
    q: sp.q?.trim() ?? "",
    grade: sp.grade || "all",
    subject: sp.subject || "all",
    teacherId: sp.teacherId || "all",
    status: sp.status || "all",
  };
  const canManage = canManageClassGroups(user.role);
  const since = daysAgo(120);
  const today = todayKoreaDate();

  const [staff, classGroups] = await Promise.all([
    prisma.user.findMany({
      where: { academyId: user.academyId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    }),
    prisma.classGroup.findMany({
      where: classGroupWhereForUser(user),
      include: {
        teacher: { select: { id: true, name: true } },
        assistant: { select: { id: true, name: true } },
        classAssistants: {
          orderBy: { createdAt: "asc" },
          include: { assistant: { select: { id: true, name: true } } },
        },
        lessons: {
          orderBy: [{ position: "asc" }],
          select: { id: true, position: true, title: true, lessonDate: true, startTime: true, endTime: true },
        },
        studentClasses: {
          where: { status: "ACTIVE" },
          orderBy: { createdAt: "asc" },
          include: {
            student: {
              select: {
                id: true,
                name: true,
                scoreRecords: {
                  where: { date: { gte: since } },
                  orderBy: [{ date: "desc" }, { createdAt: "desc" }],
                  take: 10,
                },
                attendanceRecords: {
                  where: { date: { gte: since } },
                  orderBy: { date: "desc" },
                },
                assignmentRecords: {
                  where: { date: { gte: since } },
                  orderBy: { date: "desc" },
                },
              },
            },
          },
        },
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    }),
  ]);

  const teachers = staff.filter((member) => member.role === "ADMIN" || member.role === "MANAGER" || member.role === "TEACHER");
  const rows: ClassRow[] = classGroups
    .map((classGroup) => {
      const students = classGroup.studentClasses.map((membership) => membership.student);
      return {
        classGroup,
        effectiveStatus: effectiveClassStatus(classGroup),
        stats: buildClassStats(students),
        lessonSignal: lessonSignal(classGroup.lessons, today),
      };
    })
    .sort((a, b) => classStatusRank(a.effectiveStatus) - classStatusRank(b.effectiveStatus) || a.classGroup.name.localeCompare(b.classGroup.name, "ko"));

  const displayRows = rows.filter((row) => matchesFilters(row, filters));
  const totalStudents = rows.reduce((sum, row) => sum + row.stats.studentCount, 0);
  const activeCount = rows.filter((row) => row.effectiveStatus === "ACTIVE").length;
  const averageScore = average(rows.map((row) => row.stats.averageScore).filter((score): score is number => score !== null));
  const averageAttendance = average(rows.map((row) => row.stats.attendanceRate).filter((rate): rate is number => rate !== null));
  const gradeOptions = unique(rows.map((row) => row.classGroup.grade));
  const subjectOptions = unique(rows.map((row) => row.classGroup.subject));

  return (
    <main style={page}>
      <section style={container}>
        <div style={header}>
          <PageHeader
            eyebrow="반 관리"
            title="수업 그룹 운영 보드"
            description="반을 검색하고, 더블클릭해서 각 반의 상세 운영 화면으로 들어갑니다."
            actions={
              <div className="asc-action-group">
                <ButtonLink href="/students" variant="tertiary" size="sm">학생 현황판</ButtonLink>
                {canManage && <ButtonLink href="/classes/new" size="sm">반 추가</ButtonLink>}
              </div>
            }
          />
        </div>

        <section style={summaryGrid}>
          <Summary label="전체 반" value={`${rows.length}개`} />
          <Summary label="운영중" value={`${activeCount}개`} />
          <Summary label="배정 학생" value={`${totalStudents}명`} />
          <Summary label="최근 평균" value={averageScore === null ? "-" : `${averageScore}점`} />
          <Summary label="출석률" value={averageAttendance === null ? "-" : `${averageAttendance}%`} />
        </section>

        <form className="asc-filter-bar" style={filterBar}>
          <input name="q" defaultValue={filters.q} placeholder="반 이름, 과목, 강사 검색" style={filterInput} />
          <select name="grade" defaultValue={filters.grade} style={filterSelect} aria-label="학년 필터">
            <option value="all">전체 학년</option>
            {gradeOptions.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
          </select>
          <select name="subject" defaultValue={filters.subject} style={filterSelect} aria-label="과목 필터">
            <option value="all">전체 과목</option>
            {subjectOptions.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
          </select>
          <select name="teacherId" defaultValue={filters.teacherId} style={filterSelect} aria-label="담당 강사 필터">
            <option value="all">전체 강사</option>
            {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
          </select>
          <select name="status" defaultValue={filters.status} style={filterSelect} aria-label="상태 필터">
            <option value="all">전체 상태</option>
            <option value="ACTIVE">운영중</option>
            <option value="UPCOMING">운영 예정</option>
            <option value="PAUSED">휴강</option>
            <option value="ENDED">종료</option>
          </select>
          <button style={filterButton}>적용</button>
          <a href="/classes" style={resetButton}>초기화</a>
          <span style={filterCount}>{displayRows.length}개 반</span>
        </form>

        <section style={listPanel}>
          <div style={panelHead}>
            <div>
              <h2 style={sectionTitle}>반 목록</h2>
              <p style={muted}>카드를 한 번 누르면 포커스되고, 더블클릭하면 상세 화면으로 이동합니다.</p>
            </div>
          </div>
          <div style={classGrid}>
            {displayRows.map((row) => {
              const { classGroup, stats, effectiveStatus, lessonSignal } = row;
              return (
                <ClassOpenCard
                  key={classGroup.id}
                  href={`/classes/${classGroup.id}`}
                  name={classGroup.name}
                  meta={`${classGroup.subject || "과목 미지정"} / ${classGroup.grade || "학년 미지정"}`}
                  statusLabel={classStatusLabel(effectiveStatus)}
                  statusTone={classStatusTone(effectiveStatus)}
                  teacherName={classGroup.teacher?.name ?? "-"}
                  assistantName={assistantNames(classGroup)}
                  studentCount={stats.studentCount}
                  schedule={formatClassSchedule(classGroup)}
                  latestLabel={lessonSignal.label}
                  latestValue={lessonSignal.value}
                  averageScore={stats.averageScore === null ? "-" : `${stats.averageScore}점`}
                  attendanceRate={stats.attendanceRate === null ? "-" : `${stats.attendanceRate}%`}
                />
              );
            })}
            {rows.length === 0 && <Empty title="아직 등록된 반이 없습니다" body="상단의 반 추가 버튼으로 첫 반을 만들어 주세요." />}
            {rows.length > 0 && displayRows.length === 0 && <Empty title="검색 결과가 없습니다" body="필터를 줄이거나 검색어를 바꿔 다시 확인해 주세요." />}
          </div>
        </section>
      </section>
    </main>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div style={summaryCard}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <div style={empty}>
      <b>{title}</b>
      {body && <span>{body}</span>}
    </div>
  );
}

function assistantNames(classGroup: { assistant?: { name: string } | null; classAssistants?: Array<{ assistant: { name: string } }> }) {
  const names = classGroup.classAssistants?.map((link) => link.assistant.name).filter(Boolean) ?? [];
  return names.length > 0 ? names.join(", ") : classGroup.assistant?.name ?? "-";
}

function matchesFilters(row: ClassRow, filters: ClassFilters) {
  const classGroup = row.classGroup;
  const q = filters.q.toLowerCase();
  if (filters.status !== "all" && row.effectiveStatus !== filters.status) return false;
  if (filters.grade !== "all" && classGroup.grade !== filters.grade) return false;
  if (filters.subject !== "all" && classGroup.subject !== filters.subject) return false;
  if (filters.teacherId !== "all" && classGroup.teacherId !== filters.teacherId) return false;
  if (!q) return true;

  return [classGroup.name, classGroup.subject, classGroup.grade, classGroup.teacher?.name, assistantNames(classGroup), formatClassSchedule(classGroup)]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q));
}

function unique(values: Array<string | null>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "ko"));
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function classStatusRank(status: string) {
  if (status === "ACTIVE") return 0;
  if (status === "UPCOMING") return 1;
  if (status === "PAUSED") return 2;
  if (status === "ENDED") return 3;
  return 4;
}

function lessonSignal(lessons: ClassLessonLite[], today: string) {
  const dated = lessons.filter((lesson) => lesson.lessonDate).sort((a, b) => String(a.lessonDate).localeCompare(String(b.lessonDate)));
  const next = dated.find((lesson) => String(lesson.lessonDate) >= today);
  if (next) return { label: "다음 수업", value: `${next.lessonDate} · ${next.title}` };
  const recent = [...dated].reverse()[0] ?? [...lessons].sort((a, b) => b.position - a.position)[0];
  if (recent) return { label: "최근 차시", value: `${recent.lessonDate ?? `${recent.position}차시`} · ${recent.title}` };
  return { label: "차시", value: "등록된 차시 없음" };
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

const page: CSSProperties = { padding: 12, color: "var(--asc-text)", background: "var(--asc-bg-subtle)", minHeight: "100vh" };
const container: CSSProperties = { display: "flex", flexDirection: "column", gap: 10 };
const header: CSSProperties = { background: "var(--asc-surface)", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 12 };
const summaryGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(5, minmax(120px, 1fr))", gap: 8 };
const summaryCard: CSSProperties = { background: "var(--asc-bg)", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 10, display: "flex", flexDirection: "column", gap: 4, minWidth: 0 };
const filterBar: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(220px, 1fr) 120px 120px 150px 120px auto auto auto", gap: 6, alignItems: "center", background: "var(--asc-surface)", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 8 };
const filterInput: CSSProperties = { height: 34, border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-md)", padding: "0 9px", minWidth: 0, fontWeight: 750, color: "var(--asc-text)" };
const filterSelect: CSSProperties = { ...filterInput, background: "var(--asc-bg)" };
const filterButton: CSSProperties = { height: 34, border: "1px solid var(--asc-primary)", borderRadius: "var(--asc-radius-md)", background: "var(--asc-primary)", color: "#fff", padding: "0 11px", fontSize: 12, fontWeight: 950, cursor: "pointer" };
const resetButton: CSSProperties = { height: 34, border: "1px solid var(--asc-border-strong)", borderRadius: "var(--asc-radius-md)", background: "var(--asc-bg)", color: "var(--asc-text)", padding: "0 11px", display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none", fontSize: 12, fontWeight: 950 };
const filterCount: CSSProperties = { color: "var(--asc-text-muted)", fontSize: 12, fontWeight: 900, whiteSpace: "nowrap" };
const listPanel: CSSProperties = { background: "var(--asc-surface)", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 10 };
const panelHead: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10 };
const sectionTitle: CSSProperties = { margin: 0, fontSize: 18, fontWeight: 950 };
const muted: CSSProperties = { margin: "4px 0 0", color: "var(--asc-text-muted)", fontSize: 12, fontWeight: 800 };
const classGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 9 };
const empty: CSSProperties = { border: "1px dashed var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 18, display: "grid", gap: 4, textAlign: "center", color: "var(--asc-text-muted)", fontWeight: 800, background: "var(--asc-bg-subtle)" };

