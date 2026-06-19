import { canCreateTask, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ClassGroup, Student, Task, TaskChecklistItem, TaskComment, TaskSubmission, User } from "@/lib/generated/prisma";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { startTaskAction, submitTaskAction, updateTaskChecklistItemAction, updateTaskStatus } from "./actions";

type TaskRow = Task & {
  assignee: Pick<User, "id" | "name" | "role">;
  creator: Pick<User, "id" | "name" | "role">;
  student: Pick<Student, "id" | "name"> | null;
  classGroup: Pick<ClassGroup, "id" | "name" | "teacherId"> | null;
  checklistItems: TaskChecklistItem[];
  comments: Array<TaskComment & { writer: Pick<User, "name"> }>;
  submissions: Array<TaskSubmission & { submittedBy: Pick<User, "name"> }>;
};

const statusOrder: Record<string, number> = {
  OVERDUE: 0,
  IN_PROGRESS: 1,
  TODO: 2,
  HOLD: 3,
  DONE: 4,
  SUBMITTED: 5,
  REVIEW: 5,
  REJECTED: 5,
};

export default async function SimpleTasksPage() {
  const user = await requireUser();
  const isAssistant = user.role === "ASSISTANT";
  const canCreate = canCreateTask(user.role);

  const tasks = await prisma.task.findMany({
    where: taskWhereForRole(user),
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    include: {
      assignee: { select: { id: true, name: true, role: true } },
      creator: { select: { id: true, name: true, role: true } },
      student: { select: { id: true, name: true } },
      classGroup: { select: { id: true, name: true, teacherId: true } },
      checklistItems: { orderBy: { order: "asc" } },
      comments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { writer: { select: { name: true } } },
      },
      submissions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { submittedBy: { select: { name: true } } },
      },
    },
  });

  const sortedTasks = [...tasks].sort((a, b) => statusOrder[effectiveStatus(a)] - statusOrder[effectiveStatus(b)]);
  const doneTasks = sortedTasks.filter((task) => task.status === "DONE");
  const incompleteTasks = sortedTasks.filter((task) => task.status !== "DONE");
  const overdueTasks = sortedTasks.filter((task) => effectiveStatus(task) === "OVERDUE");
  const todayTasks = sortedTasks.filter((task) => isToday(task.dueDate) && task.status !== "DONE");
  const dueSoonTasks = sortedTasks.filter((task) => isDueSoon(task.dueDate) && task.status !== "DONE");
  const inProgressTasks = sortedTasks.filter((task) => task.status === "IN_PROGRESS");
  const holdTasks = sortedTasks.filter((task) => task.status === "HOLD");
  const completedToday = doneTasks.filter((task) => isToday(task.completedAt));
  const completionRate = sortedTasks.length ? Math.round((doneTasks.length / sortedTasks.length) * 100) : 0;
  const assigneeStats = buildAssigneeStats(sortedTasks);

  return (
    <main style={page}>
      <section style={container}>
        <header style={header}>
          <div>
            <p style={eyebrow}>업무 관리</p>
            <h1 style={title}>{isAssistant ? "내 업무 처리" : "업무 진행 현황"}</h1>
            <p style={desc}>
              {isAssistant
                ? "배정된 업무를 진행하고, 완료할 때 처리 메모와 증거를 남깁니다."
                : "승인/반려 없이 누가 언제 어떤 업무를 처리했는지 진행 기록을 확인합니다."}
            </p>
          </div>
          <div style={headerActions}>
            <span style={roleBadge}>{roleLabel(user.role)}</span>
            {canCreate && (
              <Link href="/tasks/new" style={primaryBtn}>
                업무 생성
              </Link>
            )}
          </div>
        </header>

        <div style={summaryGrid}>
          {isAssistant ? (
            <>
              <Summary label="오늘 할 일" value={`${todayTasks.length}개`} tone={todayTasks.length ? "warn" : "default"} />
              <Summary label="진행 중" value={`${inProgressTasks.length}개`} />
              <Summary label="기한 임박" value={`${dueSoonTasks.length}개`} tone={dueSoonTasks.length ? "warn" : "default"} />
              <Summary label="보류" value={`${holdTasks.length}개`} tone="hold" />
              <Summary label="완료" value={`${doneTasks.length}개`} />
            </>
          ) : (
            <>
              <Summary label="전체 업무" value={`${sortedTasks.length}개`} />
              <Summary label="완료 업무" value={`${doneTasks.length}개`} />
              <Summary label="미완료 업무" value={`${incompleteTasks.length}개`} tone={incompleteTasks.length ? "warn" : "default"} />
              <Summary label="지연 업무" value={`${overdueTasks.length}개`} tone={overdueTasks.length ? "danger" : "default"} />
              <Summary label="오늘 완료" value={`${completedToday.length}개`} />
              <Summary label="완료율" value={`${completionRate}%`} />
            </>
          )}
        </div>

        {!isAssistant && (
          <section style={dashboardGrid}>
            <Panel title="담당자별 완료율">
              <div style={miniList}>
                {assigneeStats.map((row) => (
                  <div key={row.id} style={assigneeRow}>
                    <b>{row.name}</b>
                    <span>전체 {row.total}</span>
                    <span>완료 {row.done}</span>
                    <span>미완료 {row.incomplete}</span>
                    <span style={row.overdue ? dangerBadge : successBadge}>{row.overdue ? `지연 ${row.overdue}` : `${row.rate}%`}</span>
                  </div>
                ))}
                {assigneeStats.length === 0 && <Empty>표시할 업무가 없습니다.</Empty>}
              </div>
            </Panel>

            <Panel title="오늘 완료된 업무">
              <div style={miniList}>
                {completedToday.slice(0, 6).map((task) => (
                  <MiniTask key={task.id} task={task} />
                ))}
                {completedToday.length === 0 && <Empty>오늘 완료된 업무가 없습니다.</Empty>}
              </div>
            </Panel>
          </section>
        )}

        <Panel title={isAssistant ? "내 업무 목록" : "전체 업무 목록"} right={<span style={softText}>{sortedTasks.length}개</span>}>
          <div style={taskList}>
            {sortedTasks.map((task) => (
              <TaskCard key={task.id} task={task} currentUserId={user.id} isAssistant={isAssistant} />
            ))}
            {sortedTasks.length === 0 && <Empty>업무가 없습니다.</Empty>}
          </div>
        </Panel>
      </section>
    </main>
  );
}

function taskWhereForRole(user: { id: string; academyId: string; role: string }) {
  if (user.role === "ASSISTANT") {
    return { academyId: user.academyId, assigneeId: user.id };
  }

  if (user.role === "TEACHER") {
    return {
      academyId: user.academyId,
      OR: [
        { creatorId: user.id },
        { assigneeId: user.id },
        { classGroup: { teacherId: user.id } },
        { student: { teacherId: user.id } },
      ],
    };
  }

  return { academyId: user.academyId };
}

function TaskCard({ task, currentUserId, isAssistant }: { task: TaskRow; currentUserId: string; isAssistant: boolean }) {
  const effective = effectiveStatus(task);
  const canWork = isAssistant ? task.assigneeId === currentUserId : true;
  const lastRecord = task.submissions[0]?.content || task.comments[0]?.content || task.evidenceSummary;
  const checkedCount = task.checklistItems.filter((item) => item.isDone).length;

  return (
    <article style={taskCard}>
      <div style={taskMain}>
        <div>
          <div style={taskTopLine}>
            <span style={statusBadge(effective)}>{statusText(effective)}</span>
            <span style={priorityBadge(task.priority)}>{priorityText(task.priority)}</span>
            <span style={badge}>{typeText(task.type)}</span>
          </div>
          <Link href={`/tasks/${task.id}`} style={taskTitle}>
            {task.title}
          </Link>
          <p style={taskDesc}>{task.description || "업무 설명 없음"}</p>
          <div style={metaLine}>
            <span>담당 {task.assignee.name}</span>
            <span>{task.classGroup?.name ?? task.student?.name ?? "공통 업무"}</span>
            <span>기한 {formatDue(task.dueDate)}</span>
            {task.completedAt && <span>완료 {formatDateTime(task.completedAt)}</span>}
          </div>
        </div>
        <div style={taskSide}>
          <span style={task.status === "DONE" ? successBadge : badge}>체크 {checkedCount}/{task.checklistItems.length}</span>
          {task.actualMinutes && <span style={badge}>{task.actualMinutes}분</span>}
          <Link href={`/tasks/${task.id}`} style={smallLink}>상세</Link>
        </div>
      </div>

      <div style={cardBodyGrid}>
        <div style={subPanel}>
          <b>체크리스트</b>
          {task.checklistItems.length === 0 ? (
            <span style={muted}>체크리스트 없음</span>
          ) : (
            task.checklistItems.map((item) => (
              <form key={item.id} action={updateTaskChecklistItemAction} style={checkRow}>
                <input type="hidden" name="taskId" value={task.id} />
                <input type="hidden" name="itemId" value={item.id} />
                <label style={checkLabel}>
                  <input type="checkbox" name="isDone" defaultChecked={item.isDone} disabled={!canWork || task.status === "DONE"} />
                  <span>{item.title}</span>
                </label>
                {canWork && task.status !== "DONE" && <button style={tinyButton}>저장</button>}
              </form>
            ))
          )}
        </div>

        <div style={subPanel}>
          <b>최근 처리 기록</b>
          {lastRecord ? <p style={subText}>{lastRecord}</p> : <span style={muted}>아직 기록 없음</span>}
        </div>

        <TaskActions task={task} canWork={canWork} />
      </div>
    </article>
  );
}

function TaskActions({ task, canWork }: { task: TaskRow; canWork: boolean }) {
  if (!canWork) {
    return (
      <div style={subPanel}>
        <b>처리</b>
        <span style={muted}>담당자만 처리할 수 있습니다.</span>
      </div>
    );
  }

  if (task.status === "DONE") {
    return (
      <div style={subPanel}>
        <b>완료됨</b>
        <span style={muted}>{task.completedAt ? formatDateTime(task.completedAt) : "완료 시각 없음"}</span>
      </div>
    );
  }

  return (
    <div style={subPanel}>
      <b>처리</b>
      <div style={actionRow}>
        {task.status !== "IN_PROGRESS" && (
          <form action={startTaskAction}>
            <input type="hidden" name="taskId" value={task.id} />
            <input type="hidden" name="from" value="/tasks" />
            <button style={smallPrimary}>진행 시작</button>
          </form>
        )}
        <form action={updateTaskStatus}>
          <input type="hidden" name="taskId" value={task.id} />
          <input type="hidden" name="status" value="HOLD" />
          <button style={smallGhost}>보류</button>
        </form>
      </div>
      <details style={submitBox}>
        <summary>완료 기록 남기기</summary>
        <form action={submitTaskAction} style={submitForm}>
          <input type="hidden" name="taskId" value={task.id} />
          <input type="hidden" name="from" value="/tasks" />
          <textarea name="content" required rows={3} placeholder="처리 내용, 남긴 기록, 미처리 사항을 적어주세요." style={textarea} />
          <input name="fileUrl" placeholder="첨부 파일/문서 링크 또는 위치" style={input} />
          <input name="actualMinutes" type="number" placeholder="실제 수행 시간(분)" style={input} />
          <button style={smallPrimary}>완료 처리</button>
        </form>
      </details>
    </div>
  );
}

function MiniTask({ task }: { task: TaskRow }) {
  return (
    <div style={miniTask}>
      <div>
        <Link href={`/tasks/${task.id}`} style={miniTitle}>{task.title}</Link>
        <p>{task.assignee.name} / {task.submissions[0]?.content ?? task.evidenceSummary ?? "처리 메모 없음"}</p>
      </div>
      <span style={successBadge}>완료</span>
    </div>
  );
}

function Summary({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warn" | "hold" | "danger" }) {
  return (
    <div style={{ ...summaryCard, ...(tone === "warn" ? summaryWarn : {}), ...(tone === "hold" ? summaryHold : {}), ...(tone === "danger" ? summaryDanger : {}) }}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function Panel({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section style={panel}>
      <div style={panelHead}>
        <h2 style={panelTitle}>{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div style={empty}>{children}</div>;
}

function effectiveStatus(task: Pick<Task, "status" | "dueDate">) {
  if (task.status !== "DONE" && task.dueDate && task.dueDate.getTime() < Date.now()) return "OVERDUE";
  return task.status;
}

function statusText(status: string) {
  const labels: Record<string, string> = {
    TODO: "해야 함",
    IN_PROGRESS: "진행 중",
    DONE: "완료",
    HOLD: "보류",
    OVERDUE: "지연",
    SUBMITTED: "기록 확인",
    REVIEW: "기록 확인",
    REJECTED: "재처리 필요",
  };
  return labels[status] ?? status;
}

function typeText(type: string) {
  const labels: Record<string, string> = {
    STUDENT_CARE: "학생 관리",
    ATTENDANCE_CHECK: "출결 확인",
    ASSIGNMENT_CHECK: "과제 검사",
    SCORE_INPUT: "성적 입력",
    WRONG_ANSWER: "오답 정리",
    COUNSELING_PREP: "상담 준비",
    PARENT_CONTACT: "보호자 연락",
    MATERIAL_UPLOAD: "자료 업로드",
    CLINIC_ASSIGN: "클리닉 준비",
    OMR_GRADING: "OMR 채점",
    OTHER: "기타",
  };
  return labels[type] ?? type;
}

function priorityText(priority: string) {
  if (priority === "URGENT") return "긴급";
  if (priority === "HIGH") return "높음";
  if (priority === "LOW") return "낮음";
  return "보통";
}

function roleLabel(role: string) {
  if (role === "ADMIN") return "관리자";
  if (role === "MANAGER") return "실장";
  if (role === "TEACHER") return "강사";
  if (role === "ASSISTANT") return "조교";
  return role;
}

function priorityBadge(priority: string): CSSProperties {
  if (priority === "URGENT") return dangerBadge;
  if (priority === "HIGH") return warnBadge;
  if (priority === "LOW") return badge;
  return infoBadge;
}

function statusBadge(status: string): CSSProperties {
  if (status === "DONE") return successBadge;
  if (status === "HOLD") return holdBadge;
  if (status === "OVERDUE" || status === "REJECTED") return dangerBadge;
  if (status === "IN_PROGRESS") return infoBadge;
  return badge;
}

function formatDue(date: Date | null) {
  if (!date) return "미설정";
  return new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function isToday(date: Date | null) {
  if (!date) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function isDueSoon(date: Date | null) {
  if (!date) return false;
  const diff = date.getTime() - Date.now();
  return diff > 0 && diff <= 1000 * 60 * 60 * 24;
}

function buildAssigneeStats(tasks: TaskRow[]) {
  const rows = new Map<string, { id: string; name: string; total: number; done: number; incomplete: number; overdue: number; rate: number }>();
  for (const task of tasks) {
    const current = rows.get(task.assignee.id) ?? { id: task.assignee.id, name: task.assignee.name, total: 0, done: 0, incomplete: 0, overdue: 0, rate: 0 };
    current.total += 1;
    if (task.status === "DONE") current.done += 1;
    else current.incomplete += 1;
    if (effectiveStatus(task) === "OVERDUE") current.overdue += 1;
    current.rate = current.total ? Math.round((current.done / current.total) * 100) : 0;
    rows.set(task.assignee.id, current);
  }
  return [...rows.values()].sort((a, b) => b.total - a.total);
}

const page: CSSProperties = { padding: 20, color: "#111827", background: "#f3f4f6", minHeight: "100vh" };
const container: CSSProperties = { maxWidth: 1560, margin: "0 auto", display: "grid", gap: 12 };
const header: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 };
const eyebrow: CSSProperties = { margin: "0 0 4px", color: "#2563eb", fontWeight: 950, fontSize: 12 };
const title: CSSProperties = { fontSize: 30, fontWeight: 950, margin: "0 0 6px" };
const desc: CSSProperties = { color: "#6b7280", margin: 0 };
const headerActions: CSSProperties = { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" };
const roleBadge: CSSProperties = { border: "1px solid #d1d5db", borderRadius: 999, padding: "8px 12px", background: "#fff", fontWeight: 950 };
const primaryBtn: CSSProperties = { background: "#111827", color: "#fff", padding: "10px 14px", borderRadius: 8, textDecoration: "none", fontWeight: 950 };
const summaryGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 };
const summaryCard: CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 6 };
const summaryWarn: CSSProperties = { background: "#fff7ed", borderColor: "#fed7aa" };
const summaryHold: CSSProperties = { background: "#fffbeb", borderColor: "#fde68a" };
const summaryDanger: CSSProperties = { background: "#fef2f2", borderColor: "#fecaca" };
const dashboardGrid: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
const panel: CSSProperties = { background: "#fff", border: "1px solid #d1d5db", borderRadius: 8, padding: 12 };
const panelHead: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10 };
const panelTitle: CSSProperties = { margin: 0, fontSize: 18, fontWeight: 950 };
const softText: CSSProperties = { color: "#6b7280", fontSize: 12, fontWeight: 900 };
const miniList: CSSProperties = { display: "grid", gap: 8 };
const miniTask: CSSProperties = { display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", border: "1px solid #e5e7eb", borderRadius: 8, padding: 10 };
const miniTitle: CSSProperties = { color: "#111827", textDecoration: "none", fontWeight: 950 };
const assigneeRow: CSSProperties = { display: "grid", gridTemplateColumns: "1fr repeat(4, auto)", gap: 8, alignItems: "center", borderBottom: "1px solid #f1f5f9", padding: "8px 0", fontSize: 13 };
const taskList: CSSProperties = { display: "grid", gap: 10 };
const taskCard: CSSProperties = { border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", padding: 12, display: "grid", gap: 10 };
const taskMain: CSSProperties = { display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "start" };
const taskTopLine: CSSProperties = { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 };
const taskTitle: CSSProperties = { color: "#111827", textDecoration: "none", fontSize: 17, fontWeight: 950 };
const taskDesc: CSSProperties = { margin: "6px 0", color: "#475569", maxWidth: 760, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const metaLine: CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap", color: "#6b7280", fontSize: 12, fontWeight: 900 };
const taskSide: CSSProperties = { display: "grid", gap: 6, justifyItems: "end" };
const smallLink: CSSProperties = { color: "#2563eb", textDecoration: "none", fontWeight: 950, fontSize: 12 };
const cardBodyGrid: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr minmax(260px, .9fr)", gap: 10 };
const subPanel: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, display: "grid", alignContent: "start", gap: 8, background: "#fbfcfe" };
const checkRow: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 13 };
const checkLabel: CSSProperties = { display: "flex", alignItems: "center", gap: 6 };
const tinyButton: CSSProperties = { height: 24, border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", fontSize: 11, fontWeight: 900 };
const subText: CSSProperties = { margin: 0, color: "#475569", lineHeight: 1.5 };
const actionRow: CSSProperties = { display: "flex", gap: 6, flexWrap: "wrap" };
const submitBox: CSSProperties = { fontSize: 13, fontWeight: 900 };
const submitForm: CSSProperties = { display: "grid", gap: 6, marginTop: 8 };
const textarea: CSSProperties = { width: "100%", border: "1px solid #d1d5db", borderRadius: 8, padding: 8, resize: "vertical", background: "#fff" };
const input: CSSProperties = { width: "100%", height: 32, border: "1px solid #d1d5db", borderRadius: 8, padding: "0 8px", background: "#fff" };
const smallPrimary: CSSProperties = { height: 32, border: "1px solid #111827", borderRadius: 8, background: "#111827", color: "#fff", padding: "0 10px", fontWeight: 950 };
const smallGhost: CSSProperties = { ...smallPrimary, background: "#fff", color: "#111827", borderColor: "#d1d5db" };
const badge: CSSProperties = { display: "inline-flex", alignItems: "center", height: 24, borderRadius: 999, background: "#f1f5f9", color: "#475569", padding: "0 8px", fontSize: 12, fontWeight: 950, whiteSpace: "nowrap" };
const infoBadge: CSSProperties = { ...badge, background: "#dbeafe", color: "#1d4ed8" };
const warnBadge: CSSProperties = { ...badge, background: "#fef3c7", color: "#92400e" };
const holdBadge: CSSProperties = { ...badge, background: "#ede9fe", color: "#6d28d9" };
const dangerBadge: CSSProperties = { ...badge, background: "#fee2e2", color: "#991b1b" };
const successBadge: CSSProperties = { ...badge, background: "#dcfce7", color: "#166534" };
const muted: CSSProperties = { color: "#9ca3af", fontSize: 13, fontWeight: 850 };
const empty: CSSProperties = { border: "1px dashed #d1d5db", borderRadius: 8, padding: 18, textAlign: "center", color: "#6b7280", fontWeight: 900 };
