import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { deleteClassGroupAction, updateClassGroupAction } from "@/app/classes/actions";
import CloseDetailsButton from "@/components/CloseDetailsButton";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { buildClassStats } from "@/lib/classGroupStats";
import {
  canManageClassGroups,
  classGroupWhereForUser,
  classStatusLabel,
  classStatusTone,
  effectiveClassStatus,
  formatClassSchedule,
  formatOperatingPeriod,
} from "@/lib/classGroups";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ClassGroupStatus } from "@/lib/generated/prisma";

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: Promise<{ status?: string }>;
};

export default async function ClassesPage({ searchParams }: Props) {
  const user = await requireUser();
  const sp = (await searchParams) ?? {};
  const statusFilter = sp.status || "all";
  const canManage = canManageClassGroups(user.role);
  const since = daysAgo(90);

  const [staff, classGroups, classRoomRows] = await Promise.all([
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
        studentClasses: {
          where: { status: "ACTIVE" },
          include: {
            student: {
              select: {
                id: true,
                name: true,
                scoreRecords: {
                  where: { date: { gte: since } },
                  orderBy: [{ date: "desc" }, { createdAt: "desc" }],
                  take: 8,
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
    prisma.$queryRaw<Array<{ id: string; room: string | null }>>`SELECT "id", "room" FROM "ClassGroup" WHERE "academyId" = ${user.academyId}`,
  ]);

  const teachers = staff.filter((member) => member.role === "ADMIN" || member.role === "MANAGER" || member.role === "TEACHER");
  const assistants = staff.filter((member) => member.role === "ASSISTANT");
  const roomByClassId = new Map(classRoomRows.map((row) => [row.id, row.room]));
  const rows = classGroups.map((classGroup) => {
    const students = classGroup.studentClasses.map((membership) => membership.student);
    return {
      classGroup: { ...classGroup, room: roomByClassId.get(classGroup.id) ?? null },
      effectiveStatus: effectiveClassStatus(classGroup),
      stats: buildClassStats(students),
    };
  }).sort((a, b) => classStatusRank(a.effectiveStatus) - classStatusRank(b.effectiveStatus) || a.classGroup.name.localeCompare(b.classGroup.name, "ko"));
  const displayRows = statusFilter === "all" ? rows : rows.filter((row) => row.effectiveStatus === statusFilter);
  const totalStudents = rows.reduce((sum, row) => sum + row.stats.studentCount, 0);
  const activeCount = rows.filter((row) => row.effectiveStatus === "ACTIVE").length;
  const averageScore = average(rows.map((row) => row.stats.averageScore).filter((score): score is number => score !== null));
  const averageAttendance = average(rows.map((row) => row.stats.attendanceRate).filter((rate): rate is number => rate !== null));

  return (
    <main style={page}>
      <section style={container}>
        <header style={header}>
          <div>
            <p style={eyebrow}>반 관리</p>
            <h1 style={title}>수업그룹 운영 보드</h1>
            <p style={desc}>강사별 반, 학생 구성, 최근 성적과 출석/과제 흐름을 한 표에서 관리합니다.</p>
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

        <section style={panel}>
          <div style={panelHead}>
            <h2 style={sectionTitle}>반 목록</h2>
            <form style={statusFilterForm}>
              <select name="status" defaultValue={statusFilter} style={filterSelect} aria-label="반 상태 필터">
                <option value="all">전체 상태</option>
                <option value="ACTIVE">운영중</option>
                <option value="UPCOMING">운영 예정</option>
                <option value="PAUSED">휴강</option>
                <option value="ENDED">종료</option>
              </select>
              <button style={filterButton}>필터</button>
              <span style={muted}>{displayRows.length}개 반</span>
            </form>
          </div>
          <div style={tableWrap}>
            <table style={table}>
              <thead>
                <tr>
                  <Th>반 이름</Th>
                  <Th>담당 강사</Th>
                  <Th>담당 조교</Th>
                  <Th>과목</Th>
                  <Th>학년</Th>
                  <Th>운영 기간</Th>
                  <Th>요일/시간</Th>
                  <Th>강의실</Th>
                  <Th>학생 수</Th>
                  <Th>최근 평균</Th>
                  <Th>과제율</Th>
                  <Th>출석률</Th>
                  <Th>상태</Th>
                  <Th>관리</Th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map(({ classGroup, effectiveStatus, stats }) => (
                  <tr key={classGroup.id} style={effectiveStatus === "ENDED" ? endedRow : undefined}>
                    <Td>
                      <Link href={`/classes/${classGroup.id}`} style={nameLink}>{classGroup.name}</Link>
                    </Td>
                    <Td>{classGroup.teacher?.name ?? "-"}</Td>
                    <Td>{assistantNames(classGroup)}</Td>
                    <Td>{classGroup.subject ?? "-"}</Td>
                    <Td>{classGroup.grade ?? "-"}</Td>
                    <Td>{formatOperatingPeriod(classGroup)}</Td>
                    <Td>{formatClassSchedule(classGroup)}</Td>
                    <Td>{classGroup.room ?? "-"}</Td>
                    <Td>{stats.studentCount}명</Td>
                    <Td>{stats.averageScore === null ? "-" : `${stats.averageScore}점`}</Td>
                    <Td>{stats.assignmentCompletionRate === null ? "-" : `${stats.assignmentCompletionRate}%`}</Td>
                    <Td>{stats.attendanceRate === null ? "-" : `${stats.attendanceRate}%`}</Td>
                    <Td><StatusBadge status={effectiveStatus} /></Td>
                    <Td>
                      <div style={actions}>
                        <Link href={`/students?classGroupId=${classGroup.id}`} style={smallLink}>현황판</Link>
                        {canManage && (
                          <details style={editDetails}>
                            <summary style={smallButton}>수정</summary>
                            <div style={editPanel}>
                              <div style={editPanelHead}>
                                <b>반 정보 수정</b>
                                <CloseDetailsButton style={closeButton} />
                              </div>
                              <ClassForm
                                action={updateClassGroupAction}
                                classGroup={classGroup}
                                currentUserRole={user.role}
                                currentUserId={user.id}
                                teachers={teachers}
                                assistants={assistants}
                                submitLabel="저장"
                              />
                              <form action={deleteClassGroupAction} style={deleteForm}>
                                <input type="hidden" name="classGroupId" value={classGroup.id} />
                                <ConfirmSubmitButton message={`${classGroup.name} 반을 삭제할까요? 학생은 삭제되지 않고 반 소속만 해제됩니다.`} style={dangerButton}>
                                  반 삭제
                                </ConfirmSubmitButton>
                                <span style={muted}>학생은 삭제되지 않고 반 소속만 해제됩니다.</span>
                              </form>
                            </div>
                          </details>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
                {displayRows.length === 0 && (
                  <tr>
                    <td colSpan={14} style={empty}>등록된 반이 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
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
  classGroup?: {
    id: string;
    name: string;
    teacherId: string | null;
    assistantId: string | null;
    classAssistants?: Array<{ assistantId: string; assistant?: { id: string; name: string } }>;
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
  };
  currentUserRole: string;
  currentUserId: string;
  teachers: Array<{ id: string; name: string; role: string }>;
  assistants: Array<{ id: string; name: string; role: string }>;
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
        <textarea name="description" rows={3} defaultValue={classGroup?.description ?? ""} style={{ ...input, height: "auto", minHeight: 58, padding: "8px 9px", resize: "vertical" }} />
      </label>
      <div style={formActions}>
        <button style={primaryButton}>{submitLabel}</button>
      </div>
    </form>
  );
}

function AssistantPicker({
  assistants,
  selectedIds,
}: {
  assistants: Array<{ id: string; name: string; role: string }>;
  selectedIds: string[];
}) {
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

function StatusBadge({ status }: { status: string }) {
  return <span style={{ ...statusBadge, color: classStatusTone(status), borderColor: `${classStatusTone(status)}55` }}>{classStatusLabel(status)}</span>;
}

function Th({ children }: { children: ReactNode }) {
  return <th style={th}>{children}</th>;
}

function Td({ children }: { children: ReactNode }) {
  return <td style={td}>{children}</td>;
}

function assistantNames(classGroup: { assistant?: { name: string } | null; classAssistants?: Array<{ assistant: { name: string } }> }) {
  const names = classGroup.classAssistants?.map((link) => link.assistant.name).filter(Boolean) ?? [];
  return names.length > 0 ? names.join(", ") : classGroup.assistant?.name ?? "-";
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

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

const page: CSSProperties = { padding: 24, color: "#111827", background: "#f8fafc", minHeight: "100vh" };
const container: CSSProperties = { display: "flex", flexDirection: "column", gap: 14 };
const header: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-end", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 18 };
const eyebrow: CSSProperties = { margin: 0, color: "#2563eb", fontWeight: 900, fontSize: 12 };
const title: CSSProperties = { margin: "4px 0", fontSize: 28, fontWeight: 950 };
const desc: CSSProperties = { margin: 0, color: "#6b7280", fontWeight: 700 };
const headerActions: CSSProperties = { display: "flex", gap: 8, alignItems: "center" };
const primaryButton: CSSProperties = { border: 0, borderRadius: 8, background: "#111827", color: "#fff", padding: "10px 13px", fontWeight: 900, textDecoration: "none", cursor: "pointer" };
const ghostButton: CSSProperties = { border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", color: "#111827", padding: "9px 12px", fontWeight: 900, textDecoration: "none" };
const summaryGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(5, minmax(120px, 1fr))", gap: 10 };
const summaryCard: CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 6 };
const panel: CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 };
const panelHead: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 };
const sectionTitle: CSSProperties = { margin: 0, fontSize: 18, fontWeight: 950 };
const muted: CSSProperties = { color: "#6b7280", fontSize: 12, fontWeight: 700 };
const statusFilterForm: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" };
const filterSelect: CSSProperties = { height: 32, border: "1px solid #d1d5db", borderRadius: 7, background: "#fff", padding: "0 9px", fontSize: 12, fontWeight: 850 };
const filterButton: CSSProperties = { height: 32, border: "1px solid #d1d5db", borderRadius: 7, background: "#f9fafb", padding: "0 10px", fontSize: 12, fontWeight: 950, cursor: "pointer" };
const formGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(138px, 1fr))", gap: 8, alignItems: "end" };
const label: CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 950, color: "#374151" };
const input: CSSProperties = { height: 34, border: "1px solid #d1d5db", borderRadius: 7, padding: "0 9px", background: "#fff", minWidth: 0, fontSize: 12, fontWeight: 800 };
const assistantPicker: CSSProperties = { gridColumn: "1 / -1", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 9px", minWidth: 0, background: "#fbfcfe" };
const pickerLegend: CSSProperties = { padding: "0 5px", fontSize: 11, fontWeight: 950, color: "#374151" };
const assistantChoiceGrid: CSSProperties = { display: "flex", gap: 6, flexWrap: "wrap" };
const assistantChoice: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, border: "1px solid #e5e7eb", borderRadius: 999, background: "#fff", padding: "5px 8px", fontSize: 12, fontWeight: 900, whiteSpace: "nowrap" };
const formActions: CSSProperties = { gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", paddingTop: 2 };
const tableWrap: CSSProperties = { overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 8 };
const table: CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 1200, fontSize: 13 };
const th: CSSProperties = { position: "sticky", top: 0, background: "#f3f4f6", color: "#374151", borderBottom: "1px solid #d1d5db", padding: "9px 8px", textAlign: "left", whiteSpace: "nowrap" };
const td: CSSProperties = { borderBottom: "1px solid #edf0f3", padding: "8px", whiteSpace: "nowrap", verticalAlign: "top" };
const nameLink: CSSProperties = { color: "#1d4ed8", fontWeight: 950, textDecoration: "none" };
const actions: CSSProperties = { display: "flex", gap: 6, alignItems: "flex-start" };
const smallLink: CSSProperties = { border: "1px solid #d1d5db", borderRadius: 7, padding: "6px 8px", color: "#111827", textDecoration: "none", fontWeight: 900 };
const smallButton: CSSProperties = { ...smallLink, listStyle: "none", cursor: "pointer", display: "inline-block" };
const editDetails: CSSProperties = { position: "relative" };
const editPanel: CSSProperties = {
  position: "fixed",
  right: 24,
  top: 92,
  zIndex: 50,
  width: "min(760px, calc(100vw - 48px))",
  maxHeight: "calc(100vh - 120px)",
  overflowY: "auto",
  boxSizing: "border-box",
  background: "#fff",
  border: "1px solid #cbd5e1",
  borderRadius: 12,
  padding: 14,
  boxShadow: "0 20px 48px rgba(15,23,42,.22)",
};
const editPanelHead: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid #e5e7eb", fontSize: 15, fontWeight: 950 };
const closeButton: CSSProperties = { border: "1px solid #d1d5db", borderRadius: 7, background: "#fff", color: "#374151", padding: "7px 10px", fontWeight: 950, cursor: "pointer" };
const deleteForm: CSSProperties = { marginTop: 10, paddingTop: 10, borderTop: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };
const dangerButton: CSSProperties = { border: "1px solid #fecaca", borderRadius: 7, background: "#fff1f2", color: "#be123c", padding: "8px 10px", fontWeight: 950, cursor: "pointer" };
const statusBadge: CSSProperties = { display: "inline-flex", border: "1px solid", borderRadius: 999, padding: "4px 8px", fontWeight: 950, background: "#fff" };
const empty: CSSProperties = { padding: 28, textAlign: "center", color: "#6b7280", fontWeight: 800 };
const endedRow: CSSProperties = { opacity: 0.62, background: "#f9fafb" };
