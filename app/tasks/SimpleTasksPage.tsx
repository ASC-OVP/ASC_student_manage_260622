import { canCreateTask, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ClassGroup, RecurringTask, Student, Task, TaskChecklistItem, TaskComment, TaskSubmission, User } from "@/lib/generated/prisma";
import { daysOfWeekText, generateDueRecurringTasks, getNextRecurringDate, recurringTypeText, weekdayOptions } from "@/lib/recurringTasks";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import {
  createRecurringTaskAction,
  generateRecurringTasksAction,
  startTaskAction,
  submitTaskAction,
  toggleRecurringTaskAction,
  updateRecurringTaskAction,
  updateTaskChecklistItemAction,
  updateTaskStatus,
} from "./actions";

type TaskRow = Task & {
  assignee: Pick<User, "id" | "name" | "role">;
  creator: Pick<User, "id" | "name" | "role">;
  student: Pick<Student, "id" | "name"> | null;
  classGroup: Pick<ClassGroup, "id" | "name" | "teacherId"> | null;
  recurringTask: Pick<RecurringTask, "id" | "title"> | null;
  checklistItems: TaskChecklistItem[];
  comments: Array<TaskComment & { writer: Pick<User, "name"> }>;
  submissions: Array<TaskSubmission & { submittedBy: Pick<User, "name"> }>;
};

type RecurringTaskRow = RecurringTask & {
  assignee: Pick<User, "id" | "name" | "role">;
  creator: Pick<User, "id" | "name" | "role">;
  student: Pick<Student, "id" | "name"> | null;
  classGroup: Pick<ClassGroup, "id" | "name" | "teacherId"> | null;
  _count: { tasks: number };
};

type Props = {
  searchParams?: Promise<{ tab?: string; newRecurring?: string; error?: string }>;
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

export default async function SimpleTasksPage({ searchParams }: Props = {}) {
  const user = await requireUser();
  const params = (await searchParams) ?? {};
  const isAssistant = user.role === "ASSISTANT";
  const canCreate = canCreateTask(user.role);
  const activeTab = normalizeTab(params.tab, isAssistant);

  await generateDueRecurringTasks(user);

  const [tasks, recurringTasks, staff, students, classGroups] = await Promise.all([
    prisma.task.findMany({
      where: taskWhereForRole(user),
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      include: {
        assignee: { select: { id: true, name: true, role: true } },
        creator: { select: { id: true, name: true, role: true } },
        student: { select: { id: true, name: true } },
        classGroup: { select: { id: true, name: true, teacherId: true } },
        recurringTask: { select: { id: true, title: true } },
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
    }),
    prisma.recurringTask.findMany({
      where: recurringTaskWhereForRole(user),
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      include: {
        assignee: { select: { id: true, name: true, role: true } },
        creator: { select: { id: true, name: true, role: true } },
        student: { select: { id: true, name: true } },
        classGroup: { select: { id: true, name: true, teacherId: true } },
        _count: { select: { tasks: true } },
      },
    }),
    prisma.user.findMany({ where: { academyId: user.academyId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, role: true } }),
    prisma.student.findMany({ where: { academyId: user.academyId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.classGroup.findMany({
      where: {
        academyId: user.academyId,
        ...(user.role === "TEACHER" ? { teacherId: user.id } : {}),
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, teacherId: true },
    }),
  ]);

  const sortedTasks = [...tasks].sort((a, b) => statusOrder[effectiveStatus(a)] - statusOrder[effectiveStatus(b)]);
  const visibleTasks = filterTasksByTab(sortedTasks, activeTab, user.id);
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
                일반 업무 추가
              </Link>
            )}
            {canCreate && (
              <Link href="/tasks?tab=recurring&newRecurring=1" style={secondaryBtn}>
                정기 업무 추가
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

        <TaskTabs activeTab={activeTab} isAssistant={isAssistant} />

        {activeTab === "recurring" ? (
          <>
            {canCreate && params.newRecurring === "1" && (
              <Panel title="정기 업무 추가" right={<Link href="/tasks?tab=recurring" style={smallLink}>닫기</Link>}>
                {params.error === "empty" && <p style={errorText}>업무명, 담당자, 시작일을 입력해주세요.</p>}
                <RecurringTaskForm staff={staff} students={students} classGroups={classGroups} />
              </Panel>
            )}
            <Panel
              title="정기 업무 템플릿"
              right={
                <div style={inlineActions}>
                  <form action={generateRecurringTasksAction}>
                    <button style={smallGhost}>정기 업무 생성하기</button>
                  </form>
                  {canCreate && <Link href="/tasks?tab=recurring&newRecurring=1" style={smallLink}>+ 추가</Link>}
                </div>
              }
            >
              <RecurringTaskTable rows={recurringTasks} staff={staff} students={students} classGroups={classGroups} canEdit={canCreate} />
            </Panel>
          </>
        ) : (
          <Panel title={taskPanelTitle(activeTab, isAssistant)} right={<span style={softText}>{visibleTasks.length}개</span>}>
            <div style={taskList}>
              {visibleTasks.map((task) => (
                <TaskCard key={task.id} task={task} currentUserId={user.id} isAssistant={isAssistant} />
              ))}
              {visibleTasks.length === 0 && <Empty>업무가 없습니다.</Empty>}
            </div>
          </Panel>
        )}
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

function recurringTaskWhereForRole(user: { id: string; academyId: string; role: string }) {
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

function normalizeTab(value: string | undefined, isAssistant: boolean) {
  const tabs = ["all", "general", "recurring", "mine", "done"] as const;
  if (value && tabs.includes(value as (typeof tabs)[number])) return value;
  return isAssistant ? "mine" : "all";
}

function filterTasksByTab(tasks: TaskRow[], tab: string, userId: string) {
  if (tab === "general") return tasks.filter((task) => !task.recurringTaskId);
  if (tab === "mine") return tasks.filter((task) => task.assigneeId === userId && task.status !== "DONE");
  if (tab === "done") return tasks.filter((task) => task.status === "DONE");
  return tasks;
}

function taskPanelTitle(tab: string, isAssistant: boolean) {
  if (tab === "general") return "일반 업무 목록";
  if (tab === "mine") return isAssistant ? "내 업무 목록" : "내 업무";
  if (tab === "done") return "완료 업무";
  return "전체 업무 목록";
}

function TaskTabs({ activeTab, isAssistant }: { activeTab: string; isAssistant: boolean }) {
  const tabs = [
    { key: "all", label: "전체 업무" },
    { key: "general", label: "일반 업무" },
    { key: "recurring", label: "정기 업무" },
    { key: "mine", label: "내 업무" },
    { key: "done", label: "완료 업무" },
  ];
  return (
    <nav style={tabsWrap}>
      {tabs.map((tab) => (
        <Link key={tab.key} href={`/tasks?tab=${tab.key}`} style={activeTab === tab.key ? activeTabStyle : tabStyle}>
          {isAssistant && tab.key === "all" ? "배정 업무" : tab.label}
        </Link>
      ))}
    </nav>
  );
}

function RecurringTaskForm({
  staff,
  students,
  classGroups,
  row,
}: {
  staff: Array<Pick<User, "id" | "name" | "role">>;
  students: Array<Pick<Student, "id" | "name">>;
  classGroups: Array<Pick<ClassGroup, "id" | "name">>;
  row?: RecurringTaskRow;
}) {
  const assignees = staff.filter((member) => member.role === "ASSISTANT" || member.role === "TEACHER" || member.role === "MANAGER");
  const selectedDays = new Set((row?.daysOfWeek ?? "").split(",").filter(Boolean));
  return (
    <form action={row ? updateRecurringTaskAction : createRecurringTaskAction} style={recurringForm}>
      {row && <input type="hidden" name="recurringTaskId" value={row.id} />}
      <label style={label}>업무명<input name="title" required defaultValue={row?.title ?? ""} style={input} /></label>
      <label style={label}>업무 유형
        <select name="type" defaultValue={row?.type ?? "OTHER"} style={input}>
          <TaskTypeOptions />
        </select>
      </label>
      <label style={label}>담당자
        <select name="assigneeId" required defaultValue={row?.assigneeId ?? ""} style={input}>
          <option value="">담당자 선택</option>
          {assignees.map((member) => <option key={member.id} value={member.id}>{member.name} / {roleLabel(member.role)}</option>)}
        </select>
      </label>
      <label style={label}>관련 반
        <select name="classGroupId" defaultValue={row?.classGroupId ?? ""} style={input}>
          <option value="">없음</option>
          {classGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
      </label>
      <label style={label}>관련 학생
        <select name="studentId" defaultValue={row?.studentId ?? ""} style={input}>
          <option value="">없음</option>
          {students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
        </select>
      </label>
      <label style={label}>우선순위
        <select name="priority" defaultValue={row?.priority ?? "NORMAL"} style={input}>
          <option value="LOW">낮음</option>
          <option value="NORMAL">보통</option>
          <option value="HIGH">높음</option>
          <option value="URGENT">긴급</option>
        </select>
      </label>
      <label style={label}>반복 주기
        <select name="recurrenceType" defaultValue={row?.recurrenceType ?? "WEEKLY"} style={input}>
          <option value="DAILY">매일</option>
          <option value="WEEKLY">매주</option>
          <option value="MONTHLY">매월</option>
        </select>
      </label>
      <fieldset style={dayFieldset}>
        <legend>반복 요일</legend>
        <div style={dayChecks}>
          {weekdayOptions.map((day) => (
            <label key={day.value} style={dayCheck}>
              <input type="checkbox" name="daysOfWeek" value={day.value} defaultChecked={selectedDays.has(day.value)} />
              {day.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label style={label}>월 반복일<input name="dayOfMonth" type="number" min={1} max={31} defaultValue={row?.dayOfMonth ?? ""} style={input} /></label>
      <label style={label}>시작일<input name="startDate" type="date" required defaultValue={row?.startDate ?? ""} style={input} /></label>
      <label style={label}>종료일<input name="endDate" type="date" defaultValue={row?.endDate ?? ""} style={input} /></label>
      <label style={label}>마감 시간<input name="dueTime" type="time" defaultValue={row?.dueTime ?? "23:59"} style={input} /></label>
      <label style={checkLabel}><input name="isActive" type="checkbox" defaultChecked={row?.isActive ?? true} /> 활성화</label>
      <label style={{ ...label, gridColumn: "1 / -1" }}>설명
        <textarea name="description" rows={3} defaultValue={row?.description ?? ""} style={textarea} />
      </label>
      <button style={smallPrimary}>{row ? "정기 업무 수정" : "정기 업무 저장"}</button>
    </form>
  );
}

function TaskTypeOptions() {
  return (
    <>
      <option value="ATTENDANCE_CHECK">출결 확인</option>
      <option value="ASSIGNMENT_CHECK">과제 검사</option>
      <option value="SCORE_INPUT">성적 입력</option>
      <option value="WRONG_ANSWER">오답 정리</option>
      <option value="COUNSELING_PREP">상담 준비</option>
      <option value="PARENT_CONTACT">보호자 연락</option>
      <option value="MATERIAL_UPLOAD">자료 업로드</option>
      <option value="CLINIC_ASSIGN">클리닉 준비</option>
      <option value="OMR_GRADING">OMR 채점</option>
      <option value="STUDENT_CARE">학생 관리</option>
      <option value="OTHER">기타</option>
    </>
  );
}

function RecurringTaskTable({
  rows,
  staff,
  students,
  classGroups,
  canEdit,
}: {
  rows: RecurringTaskRow[];
  staff: Array<Pick<User, "id" | "name" | "role">>;
  students: Array<Pick<Student, "id" | "name">>;
  classGroups: Array<Pick<ClassGroup, "id" | "name">>;
  canEdit: boolean;
}) {
  if (rows.length === 0) return <Empty>정기 업무가 없습니다.</Empty>;
  return (
    <div style={tableWrap}>
      <table style={table}>
        <thead>
          <tr>
            <Th>업무명</Th>
            <Th>반복</Th>
            <Th>담당자</Th>
            <Th>관련 반/학생</Th>
            <Th>기간</Th>
            <Th>다음 생성일</Th>
            <Th>생성된 업무</Th>
            <Th>상태</Th>
            {canEdit && <Th>관리</Th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <Td>
                <b>{row.title}</b>
                <div style={subText}>{typeText(row.type)} / {priorityText(row.priority)}</div>
              </Td>
              <Td>{recurringTypeText(row.recurrenceType)}{row.recurrenceType === "WEEKLY" ? ` / ${daysOfWeekText(row.daysOfWeek)}` : ""}{row.recurrenceType === "MONTHLY" ? ` / ${row.dayOfMonth ?? "-"}일` : ""}</Td>
              <Td>{row.assignee.name}</Td>
              <Td>{row.classGroup?.name ?? row.student?.name ?? "공통"}</Td>
              <Td>{row.startDate} ~ {row.endDate ?? "계속"}</Td>
              <Td>{row.isActive ? getNextRecurringDate(row) ?? "-" : "-"}</Td>
              <Td>{row._count.tasks}개</Td>
              <Td><span style={row.isActive ? successBadge : badge}>{row.isActive ? "활성" : "비활성"}</span></Td>
              {canEdit && (
                <Td>
                  <div style={inlineActions}>
                    <form action={toggleRecurringTaskAction}>
                      <input type="hidden" name="recurringTaskId" value={row.id} />
                      <input type="hidden" name="isActive" value={row.isActive ? "false" : "true"} />
                      <button style={smallGhost}>{row.isActive ? "비활성화" : "활성화"}</button>
                    </form>
                    <details>
                      <summary style={summaryButton}>수정</summary>
                      <div style={editBox}>
                        <RecurringTaskForm row={row} staff={staff} students={students} classGroups={classGroups} />
                      </div>
                    </details>
                  </div>
                </Td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return <th style={th}>{children}</th>;
}

function Td({ children }: { children: ReactNode }) {
  return <td style={td}>{children}</td>;
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
            {task.recurringTaskId && <span style={infoBadge}>정기</span>}
          </div>
          <Link href={`/tasks/${task.id}`} style={taskTitle}>
            {task.title}
          </Link>
          <p style={taskDesc}>{task.description || "업무 설명 없음"}</p>
          <div style={metaLine}>
            <span>담당 {task.assignee.name}</span>
            <span>{task.classGroup?.name ?? task.student?.name ?? "공통 업무"}</span>
            <span>기한 {formatDue(task.dueDate)}</span>
            {task.scheduledDate && <span>예정일 {task.scheduledDate}</span>}
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
const secondaryBtn: CSSProperties = { ...primaryBtn, background: "#fff", color: "#111827", border: "1px solid #d1d5db" };
const tabsWrap: CSSProperties = { display: "flex", gap: 6, flexWrap: "wrap", background: "#fff", border: "1px solid #d1d5db", borderRadius: 8, padding: 8 };
const tabStyle: CSSProperties = { borderRadius: 7, padding: "8px 11px", color: "#374151", textDecoration: "none", fontWeight: 950, background: "#fff" };
const activeTabStyle: CSSProperties = { ...tabStyle, color: "#fff", background: "#111827" };
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
const label: CSSProperties = { display: "flex", flexDirection: "column", gap: 6, fontWeight: 900, fontSize: 13 };
const inlineActions: CSSProperties = { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" };
const errorText: CSSProperties = { background: "#fee2e2", color: "#991b1b", padding: 10, borderRadius: 8, fontWeight: 900 };
const recurringForm: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 };
const dayFieldset: CSSProperties = { border: "1px solid #d1d5db", borderRadius: 8, padding: 8, minWidth: 0 };
const dayChecks: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap" };
const dayCheck: CSSProperties = { display: "inline-flex", gap: 4, alignItems: "center", fontSize: 13, fontWeight: 900 };
const tableWrap: CSSProperties = { overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 8 };
const table: CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th: CSSProperties = { textAlign: "left", padding: "9px 10px", background: "#f3f4f6", borderBottom: "1px solid #d1d5db", whiteSpace: "nowrap" };
const td: CSSProperties = { padding: "9px 10px", borderBottom: "1px solid #f3f4f6", verticalAlign: "top", whiteSpace: "nowrap" };
const editBox: CSSProperties = { marginTop: 8, minWidth: 680, maxWidth: "80vw", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 10 };
const summaryButton: CSSProperties = { cursor: "pointer", color: "#2563eb", fontWeight: 950 };
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
