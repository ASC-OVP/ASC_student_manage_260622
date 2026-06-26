import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { createClassMemoAction, deleteClassMemoAction, deleteClassGroupAction, updateClassGroupAction } from "@/app/classes/actions";
import CloseDetailsButton from "@/components/CloseDetailsButton";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { buildClassStats, latestScore } from "@/lib/classGroupStats";
import {
  canManageClassGroups,
  classGroupWhereForUser,
  classStatusLabel,
  classStatusTone,
  computeClassOperationStats,
  effectiveClassStatus,
  formatClassSchedule,
  formatOperatingPeriod,
} from "@/lib/classGroups";
import { todayKoreaDate } from "@/lib/date";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ClassGroupStatus } from "@/lib/generated/prisma";
import { formatPhoneNumber } from "@/lib/phone";

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: Promise<{
    classGroupId?: string;
    q?: string;
    grade?: string;
    subject?: string;
    teacherId?: string;
    status?: string;
  }>;
};

type StaffMember = { id: string; name: string; role: string };
type ClassFilters = { q: string; grade: string; subject: string; teacherId: string; status: string };
type StudentInClass = {
  id: string;
  name: string;
  schoolName: string | null;
  grade: string | null;
  phone: string | null;
  parentPhone: string | null;
  memo: string | null;
  scoreRecords: Array<{ date: string; title: string; score: number | null; maxScore: number | null; createdAt: Date }>;
  attendanceRecords: Array<{ date: string; status: string }>;
  assignmentRecords: Array<{ date: string; status: string }>;
};
type ClassLessonLite = { id: string; position: number; title: string; lessonDate: string | null; startTime: string | null; endTime: string | null; memo: string | null };
type ClassMemoLite = { id: string; writerId: string; content: string; createdAt: Date; writer: { id: string; name: string } };
type ClassGroupView = {
  id: string;
  name: string;
  teacherId: string | null;
  assistantId: string | null;
  subject: string | null;
  grade: string | null;
  startDate: string | null;
  endDate: string | null;
  daysOfWeek: string | null;
  startTime: string | null;
  endTime: string | null;
  room: string | null;
  schedule: string | null;
  description: string | null;
  status: ClassGroupStatus;
  teacher: { id: string; name: string } | null;
  assistant: { id: string; name: string } | null;
  classAssistants: Array<{ assistantId: string; assistant: { id: string; name: string } }>;
  studentClasses: Array<{ student: StudentInClass }>;
  lessons: ClassLessonLite[];
  memos: ClassMemoLite[];
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
  const selectedId = sp.classGroupId ?? "";
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
          select: { id: true, position: true, title: true, lessonDate: true, startTime: true, endTime: true, memo: true },
        },
        memos: {
          orderBy: { createdAt: "desc" },
          take: 5,
          include: { writer: { select: { id: true, name: true } } },
        },
        studentClasses: {
          where: { status: "ACTIVE" },
          orderBy: { createdAt: "asc" },
          include: {
            student: {
              select: {
                id: true,
                name: true,
                schoolName: true,
                grade: true,
                phone: true,
                parentPhone: true,
                memo: true,
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
  const assistants = staff.filter((member) => member.role === "ASSISTANT");
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
  const selectedRow = selectedId ? displayRows.find((row) => row.classGroup.id === selectedId) ?? null : displayRows[0] ?? null;
  const totalStudents = rows.reduce((sum, row) => sum + row.stats.studentCount, 0);
  const activeCount = rows.filter((row) => row.effectiveStatus === "ACTIVE").length;
  const averageScore = average(rows.map((row) => row.stats.averageScore).filter((score): score is number => score !== null));
  const averageAttendance = average(rows.map((row) => row.stats.attendanceRate).filter((rate): rate is number => rate !== null));
  const gradeOptions = unique(rows.map((row) => row.classGroup.grade));
  const subjectOptions = unique(rows.map((row) => row.classGroup.subject));

  return (
    <main style={page}>
      <section style={container}>
        <header style={header}>
          <div>
            <p style={eyebrow}>반 관리</p>
            <h1 style={title}>수업 그룹 운영 보드</h1>
            <p style={desc}>반을 훑어보고, 선택한 반의 학생·일정·메모를 한 화면에서 확인합니다.</p>
          </div>
          <div style={headerActions}>
            <Link href="/students" style={ghostButton}>학생 현황판</Link>
            {canManage && <Link href="/classes/new" style={primaryButton}>+ 반 추가</Link>}
          </div>
        </header>

        <section style={summaryGrid}>
          <Summary label="전체 반" value={`${rows.length}개`} />
          <Summary label="운영중" value={`${activeCount}개`} />
          <Summary label="배정 학생" value={`${totalStudents}명`} />
          <Summary label="최근 평균" value={averageScore === null ? "-" : `${averageScore}점`} />
          <Summary label="출석률" value={averageAttendance === null ? "-" : `${averageAttendance}%`} />
        </section>

        <form style={filterBar}>
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
          {selectedId && <input type="hidden" name="classGroupId" value={selectedId} />}
          <button style={filterButton}>적용</button>
          <Link href="/classes" style={resetButton}>초기화</Link>
          <span style={filterCount}>{displayRows.length}개 반</span>
        </form>

        <section style={workspaceGrid}>
          <section style={listPanel}>
            <div style={panelHead}>
              <div>
                <h2 style={sectionTitle}>반 목록</h2>
                <p style={muted}>클릭하면 오른쪽에서 상세 운영 정보를 확인합니다.</p>
              </div>
            </div>
            <div style={classList}>
              {displayRows.map((row) => (
                <ClassListCard
                  key={row.classGroup.id}
                  row={row}
                  href={classesHref(filters, row.classGroup.id)}
                  selected={selectedRow?.classGroup.id === row.classGroup.id}
                />
              ))}
              {rows.length === 0 && <Empty title="아직 등록된 반이 없습니다" body="상단의 반 추가 버튼으로 첫 반을 만들어 주세요." />}
              {rows.length > 0 && displayRows.length === 0 && <Empty title="검색 결과가 없습니다" body="필터를 줄이거나 검색어를 바꿔 다시 확인해 주세요." />}
            </div>
          </section>

          <ClassDetailPanel
            row={selectedRow}
            currentUserRole={user.role}
            currentUserId={user.id}
            teachers={teachers}
            assistants={assistants}
            canManage={canManage}
            today={today}
          />
        </section>
      </section>
    </main>
  );
}

function ClassListCard({ row, href, selected }: { row: ClassRow; href: string; selected: boolean }) {
  const { classGroup, stats, effectiveStatus, lessonSignal } = row;

  return (
    <Link href={href} style={{ ...classCard, ...(selected ? selectedClassCard : {}), ...(effectiveStatus === "ENDED" ? endedCard : {}) }}>
      <div style={classCardTop}>
        <div>
          <h3 style={className}>{classGroup.name}</h3>
          <p style={classMeta}>{classGroup.subject || "과목 미지정"} / {classGroup.grade || "학년 미지정"}</p>
        </div>
        <StatusBadge status={effectiveStatus} />
      </div>
      <div style={classCardInfoGrid}>
        <Info label="담당 강사" value={classGroup.teacher?.name ?? "-"} compact />
        <Info label="담당 조교" value={assistantNames(classGroup)} compact />
        <Info label="학생 수" value={`${stats.studentCount}명`} compact />
        <Info label="요일/시간" value={formatClassSchedule(classGroup)} compact />
      </div>
      <div style={lessonSignalBox}>
        <span>{lessonSignal.label}</span>
        <b>{lessonSignal.value}</b>
      </div>
    </Link>
  );
}

function ClassDetailPanel({
  row,
  currentUserRole,
  currentUserId,
  teachers,
  assistants,
  canManage,
  today,
}: {
  row: ClassRow | null;
  currentUserRole: string;
  currentUserId: string;
  teachers: StaffMember[];
  assistants: StaffMember[];
  canManage: boolean;
  today: string;
}) {
  if (!row) {
    return (
      <section style={detailPanel}>
        <Empty title="선택된 반이 없습니다" body="왼쪽 반 목록에서 확인할 반을 선택해 주세요." />
      </section>
    );
  }

  const { classGroup, stats, effectiveStatus } = row;
  const students = classGroup.studentClasses.map((membership) => membership.student);
  const operationStats = computeClassOperationStats(classGroup, today);
  const upcomingLessons = classGroup.lessons
    .filter((lesson) => lesson.lessonDate && lesson.lessonDate >= today)
    .slice(0, 5);
  const recentLessons = [...classGroup.lessons]
    .filter((lesson) => !lesson.lessonDate || lesson.lessonDate <= today)
    .sort((a, b) => lessonSortValue(b).localeCompare(lessonSortValue(a)))
    .slice(0, 5);

  return (
    <section style={detailPanel}>
      <div style={detailHero}>
        <div>
          <p style={eyebrow}>선택된 반</p>
          <h2 style={detailTitle}>{classGroup.name}</h2>
          <p style={desc}>{classGroup.teacher?.name ?? "담당 강사 미지정"} / {formatClassSchedule(classGroup)} / {stats.studentCount}명</p>
        </div>
        <div style={detailActions}>
          <StatusBadge status={effectiveStatus} />
          <Link href={`/students?classGroupId=${classGroup.id}`} style={ghostButton}>이 반 학생 보기</Link>
          <Link href={`/students/new?classGroupId=${classGroup.id}`} style={primaryButton}>학생 추가</Link>
        </div>
      </div>

      <section style={detailStatsGrid}>
        <Summary label="학생 수" value={`${stats.studentCount}명`} />
        <Summary label="최근 평균" value={stats.averageScore === null ? "-" : `${stats.averageScore}점`} />
        <Summary label="출석률" value={stats.attendanceRate === null ? "-" : `${stats.attendanceRate}%`} />
        <Summary label="과제율" value={stats.assignmentCompletionRate === null ? "-" : `${stats.assignmentCompletionRate}%`} />
        <Summary label="현재 주차" value={formatWeekProgress(operationStats.currentWeek, operationStats.totalWeeks)} />
      </section>

      <section style={detailGrid}>
        <Panel title="기본 정보">
          <div style={infoGrid}>
            <Info label="과목" value={classGroup.subject ?? "-"} />
            <Info label="학년" value={classGroup.grade ?? "-"} />
            <Info label="담당 강사" value={classGroup.teacher?.name ?? "-"} />
            <Info label="담당 조교" value={assistantNames(classGroup)} />
            <Info label="운영 기간" value={formatOperatingPeriod(classGroup)} />
            <Info label="수업 일정" value={formatClassSchedule(classGroup)} />
            <Info label="강의실" value={classGroup.room ?? "-"} />
            <Info label="수업 진행" value={formatSessionProgress(operationStats.pastSessions, operationStats.totalSessions)} />
          </div>
          {classGroup.description ? <p style={noteBox}>{classGroup.description}</p> : <p style={emptyLine}>등록된 주의사항이나 설명이 없습니다.</p>}
          {canManage && (
            <details style={editDetails}>
              <summary style={smallButton}>반 정보 수정</summary>
              <div style={editPanel}>
                <div style={editPanelHead}>
                  <b>반 정보 수정</b>
                  <CloseDetailsButton style={closeButton} />
                </div>
                <ClassForm
                  action={updateClassGroupAction}
                  classGroup={classGroup}
                  currentUserRole={currentUserRole}
                  currentUserId={currentUserId}
                  teachers={teachers}
                  assistants={assistants}
                  submitLabel="저장"
                />
                <form action={deleteClassGroupAction} style={deleteForm}>
                  <input type="hidden" name="classGroupId" value={classGroup.id} />
                  <ConfirmSubmitButton message={`${classGroup.name} 반을 삭제할까요? 학생은 삭제되지 않고 반 소속만 해제됩니다.`} style={dangerButton}>
                    반 삭제
                  </ConfirmSubmitButton>
                  <span style={muted}>삭제 전 반드시 확인합니다. 학생 데이터는 유지됩니다.</span>
                </form>
              </div>
            </details>
          )}
        </Panel>

        <Panel title="수업 일정" right={<span style={muted}>{classGroup.lessons.length}개 차시</span>}>
          <LessonList lessons={upcomingLessons.length > 0 ? upcomingLessons : classGroup.lessons.slice(0, 5)} emptyText="등록된 차시 일정이 없습니다." />
        </Panel>

        <Panel title="최근 차시 기록">
          <LessonList lessons={recentLessons} emptyText="최근 차시 기록이 없습니다." />
        </Panel>

        <Panel title="메모 / 주의사항">
          <form action={createClassMemoAction} style={memoForm}>
            <input type="hidden" name="classGroupId" value={classGroup.id} />
            <textarea name="content" rows={3} placeholder="반 운영 메모를 입력하세요" style={{ ...input, height: "auto", minHeight: 74, resize: "vertical" }} />
            <button style={primaryButton}>메모 추가</button>
          </form>
          <div style={memoList}>
            {classGroup.memos.map((memo) => (
              <article key={memo.id} style={memoItem}>
                <div style={memoMeta}>
                  <b>{memo.writer.name}</b>
                  <span>{formatDateTime(memo.createdAt)}</span>
                </div>
                <p style={memoContent}>{memo.content}</p>
                {(memo.writerId === currentUserId || canManage) && (
                  <form action={deleteClassMemoAction}>
                    <input type="hidden" name="memoId" value={memo.id} />
                    <button style={textButton}>삭제</button>
                  </form>
                )}
              </article>
            ))}
            {classGroup.memos.length === 0 && <Empty title="반 메모가 없습니다" body="주의사항이나 운영 메모를 남겨두면 여기에서 함께 볼 수 있습니다." compact />}
          </div>
        </Panel>
      </section>

      <Panel title="소속 학생 목록" right={<span style={muted}>{students.length}명</span>}>
        <div style={studentList}>
          {students.map((student) => {
            const score = latestScore(student.scoreRecords);
            const attendance = latestByDate(student.attendanceRecords);
            const assignment = latestByDate(student.assignmentRecords);
            return (
              <Link key={student.id} href={`/students/${student.id}`} style={studentCard}>
                <div>
                  <b>{student.name}</b>
                  <p style={studentMeta}>{[student.schoolName, student.grade].filter(Boolean).join(" / ") || "학교·학년 미입력"}</p>
                </div>
                <span>{formatPhoneNumber(student.phone || student.parentPhone || "") || "-"}</span>
                <span>{attendance ? `${attendance.date} ${attendance.status}` : "출석 기록 없음"}</span>
                <span>{assignment ? assignment.status : "과제 기록 없음"}</span>
                <strong>{score?.score ?? "-"}점</strong>
              </Link>
            );
          })}
          {students.length === 0 && <Empty title="소속 학생이 없습니다" body="학생 추가 버튼으로 이 반에 학생을 배정해 주세요." compact />}
        </div>
      </Panel>
    </section>
  );
}

function LessonList({ lessons, emptyText }: { lessons: ClassLessonLite[]; emptyText: string }) {
  if (lessons.length === 0) return <Empty title={emptyText} compact />;
  return (
    <div style={lessonList}>
      {lessons.map((lesson) => (
        <div key={lesson.id} style={lessonItem}>
          <span>{lesson.position}차시</span>
          <b>{lesson.title}</b>
          <em>{formatLessonTime(lesson)}</em>
          {lesson.memo && <p>{lesson.memo}</p>}
        </div>
      ))}
    </div>
  );
}

function Panel({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section style={panel}>
      <div style={panelHead}>
        <h2 style={sectionTitle}>{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function ClassForm({
  action,
  classGroup,
  currentUserRole,
  currentUserId,
  teachers,
  assistants,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  classGroup?: ClassGroupView;
  currentUserRole: string;
  currentUserId: string;
  teachers: StaffMember[];
  assistants: StaffMember[];
  submitLabel: string;
}) {
  const selectedAssistantIds =
    classGroup?.classAssistants?.map((link) => link.assistantId) ?? (classGroup?.assistantId ? [classGroup.assistantId] : []);

  return (
    <form action={action} style={formGrid}>
      {classGroup && <input type="hidden" name="classGroupId" value={classGroup.id} />}
      <label style={label}>반 이름<input name="name" required defaultValue={classGroup?.name ?? ""} style={input} /></label>
      <label style={label}>담당 강사
        {currentUserRole === "TEACHER" ? (
          <>
            <input type="hidden" name="teacherId" value={currentUserId} />
            <input value={teachers.find((teacher) => teacher.id === currentUserId)?.name ?? "내 반"} readOnly style={input} />
          </>
        ) : (
          <select name="teacherId" defaultValue={classGroup?.teacherId ?? ""} style={input}>
            <option value="">미지정</option>
            {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
          </select>
        )}
      </label>
      <AssistantPicker assistants={assistants} selectedIds={selectedAssistantIds} />
      <label style={label}>과목<input name="subject" defaultValue={classGroup?.subject ?? ""} placeholder="수학" style={input} /></label>
      <label style={label}>학년<input name="grade" defaultValue={classGroup?.grade ?? ""} placeholder="고1" style={input} /></label>
      <label style={label}>운영 시작일<input name="startDate" type="date" defaultValue={classGroup?.startDate ?? ""} style={input} /></label>
      <label style={label}>운영 종료일<input name="endDate" type="date" defaultValue={classGroup?.endDate ?? ""} style={input} /></label>
      <label style={label}>수업 요일<input name="daysOfWeek" defaultValue={classGroup?.daysOfWeek ?? ""} placeholder="월수금" style={input} /></label>
      <label style={label}>시작 시간<input name="startTime" type="time" defaultValue={classGroup?.startTime ?? ""} style={input} /></label>
      <label style={label}>종료 시간<input name="endTime" type="time" defaultValue={classGroup?.endTime ?? ""} style={input} /></label>
      <label style={label}>강의실<input name="room" defaultValue={classGroup?.room ?? ""} placeholder="A룸" style={input} /></label>
      <label style={label}>상태
        <select name="status" defaultValue={classGroup?.status ?? "ACTIVE"} style={input}>
          <option value="UPCOMING">운영 예정</option>
          <option value="ACTIVE">운영중</option>
          <option value="PAUSED">휴강</option>
          <option value="ENDED">종료</option>
        </select>
      </label>
      <label style={{ ...label, gridColumn: "1 / -1" }}>설명/메모
        <textarea name="description" rows={3} defaultValue={classGroup?.description ?? ""} style={{ ...input, height: "auto", minHeight: 70, resize: "vertical" }} />
      </label>
      <div style={formActions}>
        <button style={primaryButton}>{submitLabel}</button>
      </div>
    </form>
  );
}

function AssistantPicker({ assistants, selectedIds }: { assistants: StaffMember[]; selectedIds: string[] }) {
  const selected = new Set(selectedIds);

  return (
    <fieldset style={assistantPicker}>
      <legend style={pickerLegend}>담당 조교</legend>
      <input type="hidden" name="assistantIds" value="" />
      {assistants.length === 0 ? (
        <span style={muted}>등록된 조교가 없습니다.</span>
      ) : (
        <div style={assistantChoiceGrid}>
          {assistants.map((assistant) => (
            <label key={assistant.id} style={assistantChoice}>
              <input type="checkbox" name="assistantIds" value={assistant.id} defaultChecked={selected.has(assistant.id)} />
              <span>{assistant.name}</span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
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

function Info({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div style={compact ? compactInfoItem : infoItem}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <span style={{ ...statusBadge, color: classStatusTone(status), borderColor: `${classStatusTone(status)}55` }}>{classStatusLabel(status)}</span>;
}

function Empty({ title, body, compact = false }: { title: string; body?: string; compact?: boolean }) {
  return (
    <div style={compact ? compactEmpty : empty}>
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

  return [
    classGroup.name,
    classGroup.subject,
    classGroup.grade,
    classGroup.teacher?.name,
    assistantNames(classGroup),
    formatClassSchedule(classGroup),
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q));
}

function classesHref(filters: ClassFilters, classGroupId?: string) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.grade !== "all") params.set("grade", filters.grade);
  if (filters.subject !== "all") params.set("subject", filters.subject);
  if (filters.teacherId !== "all") params.set("teacherId", filters.teacherId);
  if (filters.status !== "all") params.set("status", filters.status);
  if (classGroupId) params.set("classGroupId", classGroupId);
  const query = params.toString();
  return query ? `/classes?${query}` : "/classes";
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

function lessonSortValue(lesson: ClassLessonLite) {
  return lesson.lessonDate ?? String(lesson.position).padStart(4, "0");
}

function formatLessonTime(lesson: ClassLessonLite) {
  const time = [lesson.startTime, lesson.endTime].filter(Boolean).join("~");
  return [lesson.lessonDate, time].filter(Boolean).join(" / ") || "-";
}

function formatWeekProgress(currentWeek: number | null, totalWeeks: number | null) {
  if (currentWeek === null || totalWeeks === null) return "-";
  if (currentWeek <= 0) return `시작 전 / 총 ${totalWeeks}주`;
  return `${currentWeek}주차 / 총 ${totalWeeks}주`;
}

function formatSessionProgress(pastSessions: number | null, totalSessions: number | null) {
  if (pastSessions === null || totalSessions === null) return "-";
  return `총 ${totalSessions}회 중 ${pastSessions}회 진행`;
}

function latestByDate<T extends { date: string }>(records: T[]) {
  return [...records].sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(value);
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

const page: CSSProperties = { padding: 12, color: "var(--asc-text)", background: "var(--asc-bg-subtle)", minHeight: "100vh" };
const container: CSSProperties = { display: "flex", flexDirection: "column", gap: 10 };
const header: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-end", background: "var(--asc-surface)", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 12 };
const eyebrow: CSSProperties = { margin: 0, color: "var(--asc-primary)", fontWeight: 950, fontSize: 12 };
const title: CSSProperties = { margin: "3px 0", fontSize: 23, fontWeight: 950, color: "var(--asc-text)" };
const desc: CSSProperties = { margin: 0, color: "var(--asc-text-muted)", fontWeight: 700, fontSize: 13 };
const headerActions: CSSProperties = { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" };
const primaryButton: CSSProperties = { border: "1px solid var(--asc-primary)", borderRadius: "var(--asc-radius-lg)", background: "var(--asc-primary)", color: "#fff", padding: "9px 12px", fontWeight: 950, textDecoration: "none", cursor: "pointer", whiteSpace: "nowrap" };
const ghostButton: CSSProperties = { border: "1px solid var(--asc-border-strong)", borderRadius: "var(--asc-radius-lg)", background: "var(--asc-bg)", color: "var(--asc-text)", padding: "8px 11px", fontWeight: 900, textDecoration: "none", whiteSpace: "nowrap" };
const summaryGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(5, minmax(120px, 1fr))", gap: 8 };
const summaryCard: CSSProperties = { background: "var(--asc-bg)", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 10, display: "flex", flexDirection: "column", gap: 4, minWidth: 0 };
const filterBar: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(180px, 1fr) 120px 120px 140px 120px auto auto auto", gap: 6, alignItems: "center", background: "var(--asc-surface)", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 8 };
const filterInput: CSSProperties = { height: 34, border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-md)", padding: "0 9px", minWidth: 0, fontWeight: 750, color: "var(--asc-text)" };
const filterSelect: CSSProperties = { ...filterInput, background: "var(--asc-bg)" };
const filterButton: CSSProperties = { height: 34, border: "1px solid var(--asc-primary)", borderRadius: "var(--asc-radius-md)", background: "var(--asc-primary)", color: "#fff", padding: "0 11px", fontSize: 12, fontWeight: 950, cursor: "pointer" };
const resetButton: CSSProperties = { height: 34, border: "1px solid var(--asc-border-strong)", borderRadius: "var(--asc-radius-md)", background: "var(--asc-bg)", color: "var(--asc-text)", padding: "0 11px", display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none", fontSize: 12, fontWeight: 950 };
const filterCount: CSSProperties = { color: "var(--asc-text-muted)", fontSize: 12, fontWeight: 900, whiteSpace: "nowrap" };
const workspaceGrid: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-start" };
const listPanel: CSSProperties = { flex: "0 1 460px", minWidth: 340, background: "var(--asc-surface)", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 10 };
const detailPanel: CSSProperties = { flex: "1 1 680px", minWidth: 380, display: "flex", flexDirection: "column", gap: 10 };
const panel: CSSProperties = { background: "var(--asc-surface)", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 10, minWidth: 0 };
const panelHead: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 };
const sectionTitle: CSSProperties = { margin: 0, fontSize: 17, fontWeight: 950 };
const muted: CSSProperties = { color: "var(--asc-text-muted)", fontSize: 12, fontWeight: 800 };
const classList: CSSProperties = { display: "grid", gap: 7, maxHeight: "calc(100vh - 280px)", overflow: "auto", paddingRight: 2 };
const classCard: CSSProperties = { border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", background: "var(--asc-bg)", padding: 9, display: "grid", gap: 7, color: "var(--asc-text)", textDecoration: "none" };
const selectedClassCard: CSSProperties = { borderColor: "var(--asc-primary)", boxShadow: "inset 3px 0 0 var(--asc-primary)", background: "var(--asc-primary-soft)" };
const endedCard: CSSProperties = { opacity: 0.68, background: "var(--asc-bg-subtle)" };
const classCardTop: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" };
const className: CSSProperties = { margin: 0, fontSize: 16, fontWeight: 950 };
const classMeta: CSSProperties = { margin: "3px 0 0", color: "var(--asc-text-muted)", fontSize: 12, fontWeight: 800 };
const classCardInfoGrid: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 };
const compactInfoItem: CSSProperties = { display: "grid", gap: 2, border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-md)", padding: "6px 7px", minWidth: 0, fontSize: 12 };
const lessonSignalBox: CSSProperties = { display: "grid", gap: 2, border: "1px solid var(--asc-primary)", borderRadius: "var(--asc-radius-md)", background: "var(--asc-primary-soft)", padding: "7px 8px", color: "var(--asc-primary-hover)", fontSize: 12 };
const detailHero: CSSProperties = { background: "var(--asc-surface)", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 10, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" };
const detailTitle: CSSProperties = { margin: "3px 0", fontSize: 20, fontWeight: 950 };
const detailActions: CSSProperties = { display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 7, alignItems: "center" };
const detailStatsGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(5, minmax(110px, 1fr))", gap: 8 };
const detailGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(280px, 1fr))", gap: 10 };
const infoGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 7 };
const infoItem: CSSProperties = { display: "grid", gap: 3, border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 8, minWidth: 0 };
const noteBox: CSSProperties = { margin: "10px 0 0", background: "var(--asc-bg-subtle)", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 10, color: "var(--asc-text-subtle)", lineHeight: 1.5 };
const emptyLine: CSSProperties = { margin: "10px 0 0", color: "var(--asc-text-muted)", fontSize: 13, fontWeight: 750 };
const editDetails: CSSProperties = { marginTop: 10 };
const smallButton: CSSProperties = { display: "inline-flex", border: "1px solid var(--asc-border-strong)", borderRadius: "var(--asc-radius-md)", padding: "7px 9px", fontWeight: 900, cursor: "pointer", background: "var(--asc-bg)", color: "var(--asc-text)" };
const editPanel: CSSProperties = { marginTop: 8, border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 10, background: "var(--asc-bg-subtle)" };
const editPanelHead: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid var(--asc-border)", fontSize: 14, fontWeight: 950 };
const closeButton: CSSProperties = { border: "1px solid var(--asc-border-strong)", borderRadius: "var(--asc-radius-md)", background: "var(--asc-bg)", color: "var(--asc-text-subtle)", padding: "6px 9px", fontWeight: 950, cursor: "pointer" };
const formGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, alignItems: "end" };
const label: CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 900, minWidth: 0, color: "var(--asc-text-subtle)" };
const input: CSSProperties = { width: "100%", boxSizing: "border-box", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-md)", padding: "8px 9px", minWidth: 0, background: "var(--asc-bg)", color: "var(--asc-text)", fontWeight: 750 };
const assistantPicker: CSSProperties = { gridColumn: "1 / -1", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: "8px 9px", minWidth: 0, background: "var(--asc-bg)" };
const pickerLegend: CSSProperties = { padding: "0 5px", fontSize: 12, fontWeight: 950, color: "var(--asc-text-subtle)" };
const assistantChoiceGrid: CSSProperties = { display: "flex", gap: 6, flexWrap: "wrap" };
const assistantChoice: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, border: "1px solid var(--asc-border)", borderRadius: 999, background: "var(--asc-bg)", padding: "5px 8px", fontSize: 12, fontWeight: 900, whiteSpace: "nowrap" };
const formActions: CSSProperties = { gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" };
const deleteForm: CSSProperties = { marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--asc-border)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };
const dangerButton: CSSProperties = { border: "1px solid var(--asc-danger)", borderRadius: "var(--asc-radius-md)", background: "var(--asc-danger-soft)", color: "var(--asc-danger)", padding: "8px 10px", fontWeight: 950, cursor: "pointer" };
const lessonList: CSSProperties = { display: "grid", gap: 7 };
const lessonItem: CSSProperties = { display: "grid", gridTemplateColumns: "54px 1fr", gap: "2px 8px", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 8, fontSize: 12 };
const memoForm: CSSProperties = { display: "grid", gap: 7 };
const memoList: CSSProperties = { marginTop: 10, display: "grid", gap: 7 };
const memoItem: CSSProperties = { border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 9 };
const memoMeta: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 8, color: "var(--asc-text-muted)", fontSize: 12 };
const memoContent: CSSProperties = { margin: "7px 0", lineHeight: 1.45 };
const textButton: CSSProperties = { border: 0, background: "transparent", color: "var(--asc-danger)", fontWeight: 900, padding: 0, cursor: "pointer" };
const studentList: CSSProperties = { display: "grid", gap: 7 };
const studentCard: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(120px, 1.2fr) minmax(120px, .9fr) minmax(130px, 1fr) minmax(100px, .8fr) 58px", gap: 8, alignItems: "center", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 9, color: "var(--asc-text)", textDecoration: "none", fontSize: 12 };
const studentMeta: CSSProperties = { margin: "3px 0 0", color: "var(--asc-text-muted)", fontSize: 12 };
const statusBadge: CSSProperties = { display: "inline-flex", border: "1px solid", borderRadius: 999, padding: "4px 8px", fontWeight: 950, background: "#fff", whiteSpace: "nowrap" };
const empty: CSSProperties = { border: "1px dashed var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 14, display: "grid", gap: 4, textAlign: "center", color: "var(--asc-text-muted)", fontWeight: 800, background: "var(--asc-bg-subtle)" };
const compactEmpty: CSSProperties = { ...empty, padding: 10, fontSize: 12 };
