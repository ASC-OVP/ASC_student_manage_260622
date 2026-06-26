import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { createTaskComment, deleteTaskAction, submitTaskAction, updateTaskChecklistItemAction, updateTaskStatus } from "../actions";

type Props = { params: Promise<{ taskId: string }> };

export default async function SimpleTaskDetailPage({ params }: Props) {
  const user = await requireUser();
  const { taskId } = await params;
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      academyId: user.academyId,
      ...(user.role === "ASSISTANT"
        ? {
            OR: [
              { assigneeId: user.id },
              { assignees: { some: { assigneeId: user.id } } },
            ],
          }
        : {}),
      ...(user.role === "TEACHER"
        ? {
            OR: [
              { creatorId: user.id },
              { assigneeId: user.id },
              { assignees: { some: { assigneeId: user.id } } },
              { classGroup: { teacherId: user.id } },
              { student: { teacherId: user.id } },
            ],
          }
        : {}),
    },
    include: {
      assignee: true,
      assignees: { orderBy: { createdAt: "asc" }, include: { assignee: true } },
      creator: true,
      student: true,
      classGroup: { include: { teacher: true } },
      comments: { orderBy: { createdAt: "desc" }, include: { writer: true } },
      checklistItems: { orderBy: { order: "asc" }, include: { doneBy: true } },
      submissions: { orderBy: { createdAt: "desc" }, include: { submittedBy: true } },
      histories: { orderBy: { createdAt: "desc" }, include: { changedBy: true } },
    },
  });

  if (!task) notFound();

  const isAssistant = user.role === "ASSISTANT";
  const assigneeNames = task.assignees.length > 0 ? task.assignees.map((assignment) => assignment.assignee.name).join(", ") : task.assignee.name;
  const canWork = isAssistant ? task.assigneeId === user.id || task.assignees.some((assignment) => assignment.assigneeId === user.id) : true;
  const canDelete =
    !isAssistant &&
    (user.role === "ADMIN" ||
      user.role === "MANAGER" ||
      task.creatorId === user.id ||
      task.reviewerId === user.id ||
      task.classGroup?.teacherId === user.id);
  const effective = effectiveStatus(task);
  const checkedCount = task.checklistItems.filter((item) => item.isDone).length;

  return (
    <main style={page}>
      <section style={shell}>
        <header style={header}>
          <div>
            <Link href="/tasks" style={back}>업무 목록</Link>
            <h1 style={title}>{task.title}</h1>
            <div style={metaLine}>
              <span style={statusBadge(effective)}>{statusText(effective)}</span>
              <span style={priorityBadge(task.priority)}>{priorityText(task.priority)}</span>
              <span style={badge}>{typeText(task.type)}</span>
              <span>담당 {assigneeNames}</span>
              <span>생성 {task.creator.name}</span>
            </div>
          </div>
          {canDelete && (
            <form action={deleteTaskAction}>
              <input type="hidden" name="taskId" value={task.id} />
              <ConfirmSubmitButton message={`${task.title} 업무를 삭제할까요?`} style={dangerButton}>
                삭제
              </ConfirmSubmitButton>
            </form>
          )}
        </header>

        <div style={summaryGrid}>
          <Summary label="마감" value={formatDue(task.dueDate)} />
          <Summary label="관련 대상" value={task.classGroup?.name ?? task.student?.name ?? "공통"} />
          <Summary label="체크리스트" value={`${checkedCount}/${task.checklistItems.length}`} />
          <Summary label="처리 기록" value={`${task.submissions.length}개`} />
          <Summary label="완료 시각" value={task.completedAt ? formatDateTime(task.completedAt) : "-"} />
        </div>

        <div style={grid}>
          <Panel title="업무 기본 정보">
            <Info label="담당자" value={assigneeNames} />
            <Info label="생성자" value={task.creator.name} />
            <Info label="관련 반" value={task.classGroup ? `${task.classGroup.teacher?.name ? `${task.classGroup.teacher.name} / ` : ""}${task.classGroup.name}` : "-"} />
            <Info label="관련 학생" value={task.student?.name ?? "-"} />
            <Info label="생성 시각" value={formatDateTime(task.createdAt)} />
            <Info label="수행 시간" value={task.actualMinutes ? `${task.actualMinutes}분` : "-"} />
            <div style={descriptionBox}>{task.description || "업무 설명이 없습니다."}</div>
          </Panel>

          <Panel title="처리">
            {canWork ? (
              task.status === "DONE" ? (
                <>
                  <Empty>이미 완료된 업무입니다.</Empty>
                  <form action={updateTaskStatus} style={submitForm}>
                    <input type="hidden" name="taskId" value={task.id} />
                    <input type="hidden" name="status" value="TODO" />
                    <input type="hidden" name="memo" value="완료 취소" />
                    <button style={smallGhost}>완료 취소</button>
                  </form>
                </>
              ) : (
                <form action={submitTaskAction} style={submitForm}>
                  <input type="hidden" name="taskId" value={task.id} />
                  <input type="hidden" name="content" value="완료 처리" />
                  <button style={primaryButton}>완료</button>
                </form>
              )
            ) : (
              <Empty>담당자만 처리할 수 있습니다.</Empty>
            )}
          </Panel>

          <Panel title="체크리스트">
            <div style={list}>
              {task.checklistItems.map((item) => (
                <form key={item.id} action={updateTaskChecklistItemAction} style={checkRow}>
                  <input type="hidden" name="taskId" value={task.id} />
                  <input type="hidden" name="itemId" value={item.id} />
                  <label style={checkLabel}>
                    <input type="checkbox" name="isDone" defaultChecked={item.isDone} disabled={!canWork || task.status === "DONE"} />
                    <span>{item.title}</span>
                  </label>
                  <span style={smallMuted}>{item.doneBy ? `${item.doneBy.name} / ${item.doneAt ? formatDateTime(item.doneAt) : ""}` : ""}</span>
                  {canWork && task.status !== "DONE" && <button style={smallGhost}>저장</button>}
                </form>
              ))}
              {task.checklistItems.length === 0 && <Empty>체크리스트가 없습니다.</Empty>}
            </div>
          </Panel>

          <Panel title="진행 메모">
            <form action={createTaskComment} style={commentForm}>
              <input type="hidden" name="taskId" value={task.id} />
              <textarea name="content" required rows={3} placeholder="진행 중 특이사항을 남겨주세요." style={textarea} />
              <button style={primaryButton}>메모 저장</button>
            </form>
            <div style={list}>
              {task.comments.map((comment) => (
                <article key={comment.id} style={commentItem}>
                  <b>{comment.writer.name}</b>
                  <span>{comment.content}</span>
                  <small>{formatDateTime(comment.createdAt)}</small>
                </article>
              ))}
              {task.comments.length === 0 && <Empty>진행 메모가 없습니다.</Empty>}
            </div>
          </Panel>
        </div>

        <Panel title="완료/처리 기록">
          <div style={timeline}>
            {task.submissions.map((submission) => (
              <article key={submission.id} style={timelineItem}>
                <div style={timelineDot} />
                <div>
                  <b>{formatDateTime(submission.createdAt)} / {submission.submittedBy.name}</b>
                  <p>{submission.content}</p>
                  <div style={metaLine}>
                    <span style={badge}>{submission.evidenceType}</span>
                    {submission.actualMinutes && <span style={badge}>{submission.actualMinutes}분</span>}
                    {submission.fileUrl && <span style={badge}>{submission.fileUrl}</span>}
                  </div>
                </div>
              </article>
            ))}
            {task.submissions.length === 0 && <Empty>아직 처리 기록이 없습니다.</Empty>}
          </div>
        </Panel>

        <Panel title="상태 변경 이력">
          <div style={timeline}>
            {task.histories.map((history) => (
              <article key={history.id} style={timelineItem}>
                <div style={timelineDot} />
                <div>
                  <b>{formatDateTime(history.createdAt)} / {history.changedBy.name}</b>
                  <p>{history.fromStatus ? statusText(history.fromStatus) : "생성"} → {statusText(history.toStatus)}</p>
                  {history.memo && <p style={note}>{history.memo}</p>}
                  {history.hasEvidence && <span style={successBadge}>증거 있음</span>}
                </div>
              </article>
            ))}
          </div>
        </Panel>
      </section>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={panel}>
      <h2 style={panelTitle}>{title}</h2>
      {children}
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div style={infoRow}><b>{label}</b><span>{value}</span></div>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div style={summaryCard}><span>{label}</span><b>{value}</b></div>;
}

function Empty({ children }: { children: ReactNode }) {
  return <div style={empty}>{children}</div>;
}

function effectiveStatus(task: { status: string; dueDate: Date | null }) {
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
  return new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit" }).format(date);
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

const page: CSSProperties = { padding: 14, color: "var(--asc-text)", background: "var(--asc-bg-subtle)", minHeight: "100vh" };
const shell: CSSProperties = { width: "100%", maxWidth: "none", margin: 0, display: "grid", gap: 12 };
const header: CSSProperties = { background: "var(--asc-surface)", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 18, display: "flex", justifyContent: "space-between", gap: 16 };
const back: CSSProperties = { color: "var(--asc-primary-hover)", textDecoration: "none", fontWeight: 900 };
const title: CSSProperties = { margin: "8px 0 6px", fontSize: 25, fontWeight: 950, color: "var(--asc-text)" };
const metaLine: CSSProperties = { display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", color: "var(--asc-text-muted)", fontSize: 12, fontWeight: 900 };
const summaryGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 };
const summaryCard: CSSProperties = { background: "var(--asc-bg)", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 12, display: "grid", gap: 4 };
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
const panel: CSSProperties = { background: "var(--asc-surface)", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 16, display: "grid", gap: 10, alignContent: "start" };
const panelTitle: CSSProperties = { margin: 0, fontSize: 18, fontWeight: 950 };
const infoRow: CSSProperties = { display: "grid", gridTemplateColumns: "110px 1fr", gap: 10, borderBottom: "1px solid var(--asc-border)", padding: "8px 0", fontSize: 13 };
const descriptionBox: CSSProperties = { whiteSpace: "pre-wrap", lineHeight: 1.6, color: "var(--asc-text-subtle)", background: "var(--asc-bg-subtle)", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 10 };
const list: CSSProperties = { display: "grid", gap: 8 };
const checkRow: CSSProperties = { display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center", borderBottom: "1px solid var(--asc-border)", padding: "6px 0" };
const checkLabel: CSSProperties = { display: "flex", alignItems: "center", gap: 6 };
const smallMuted: CSSProperties = { color: "var(--asc-text-muted)", fontSize: 12 };
const submitForm: CSSProperties = { display: "grid", gap: 8 };
const textarea: CSSProperties = { width: "100%", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 9, background: "var(--asc-bg)", color: "var(--asc-text)", resize: "vertical" };
const primaryButton: CSSProperties = { height: 34, border: "1px solid var(--asc-primary)", borderRadius: "var(--asc-radius-lg)", background: "var(--asc-primary)", color: "#fff", padding: "0 12px", fontWeight: 950 };
const smallGhost: CSSProperties = { ...primaryButton, background: "var(--asc-bg)", color: "var(--asc-text)", border: "1px solid var(--asc-border-strong)" };
const dangerButton: CSSProperties = { ...primaryButton, background: "var(--asc-danger-soft)", color: "var(--asc-danger)", border: "1px solid var(--asc-danger)" };
const commentForm: CSSProperties = { display: "grid", gap: 8 };
const commentItem: CSSProperties = { display: "grid", gap: 4, border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 10, background: "var(--asc-bg-subtle)" };
const timeline: CSSProperties = { display: "grid", gap: 10 };
const timelineItem: CSSProperties = { display: "grid", gridTemplateColumns: "16px 1fr", gap: 10, borderBottom: "1px solid var(--asc-border)", paddingBottom: 10 };
const timelineDot: CSSProperties = { width: 10, height: 10, borderRadius: 999, background: "var(--asc-primary)", marginTop: 6 };
const note: CSSProperties = { color: "var(--asc-text-subtle)", margin: "4px 0" };
const badge: CSSProperties = { display: "inline-flex", alignItems: "center", height: 24, borderRadius: 999, background: "var(--asc-bg-subtle)", color: "var(--asc-text-subtle)", padding: "0 8px", fontSize: 12, fontWeight: 950, whiteSpace: "nowrap" };
const infoBadge: CSSProperties = { ...badge, background: "var(--asc-info-soft)", color: "var(--asc-info)" };
const warnBadge: CSSProperties = { ...badge, background: "var(--asc-warning-soft)", color: "var(--asc-warning-text)" };
const holdBadge: CSSProperties = { ...badge, background: "#ede9fe", color: "#6d28d9" };
const dangerBadge: CSSProperties = { ...badge, background: "var(--asc-danger-soft)", color: "var(--asc-danger)" };
const successBadge: CSSProperties = { ...badge, background: "var(--asc-success-soft)", color: "var(--asc-success)" };
const empty: CSSProperties = { border: "1px dashed var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 16, textAlign: "center", color: "var(--asc-text-muted)", fontWeight: 900 };
