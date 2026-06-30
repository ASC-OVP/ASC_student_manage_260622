"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { saveCalendarEventMemoAction, saveCalendarPrivateMemoAction } from "@/features/calendar/actions/calendarMemoActions";

type CalendarEventType = "class" | "task";
type ViewMode = "month" | "week" | "day";

type CalendarExtendedProps = {
  type: CalendarEventType;
  sourceId: string;
  teacherId?: string | null;
  teacherName?: string | null;
  assistantId?: string | null;
  assistantName?: string | null;
  assigneeId?: string | null;
  assigneeIds?: string[];
  assigneeName?: string | null;
  classGroupId?: string | null;
  className?: string | null;
  studentName?: string | null;
  subject?: string | null;
  grade?: string | null;
  room?: string | null;
  status?: string | null;
  priority?: string | null;
  description?: string | null;
  studentCount?: number | null;
  scheduleText?: string | null;
  operationPeriod?: string | null;
};

export type AcademyCalendarEvent = {
  id: string;
  title: string;
  start?: string;
  end?: string;
  allDay?: boolean;
  daysOfWeek?: number[];
  startTime?: string;
  endTime?: string;
  startRecur?: string;
  endRecur?: string;
  backgroundColor?: string;
  borderColor?: string;
  textColor?: string;
  extendedProps: CalendarExtendedProps;
};

type FilterOption = {
  id: string;
  label: string;
};

type Props = {
  events: AcademyCalendarEvent[];
  teachers: FilterOption[];
  assistants: FilterOption[];
  classGroups: FilterOption[];
  subjects: FilterOption[];
  statuses: FilterOption[];
  privateMemos?: Array<{ date: string; content: string }>;
  eventMemos?: CalendarEventMemoView[];
};

type CalendarEventMemoView = {
  eventKey: string;
  eventDate: string;
  content: string;
  updatedAt: string;
  writerName: string | null;
};

type MaterializedEvent = {
  id: string;
  title: string;
  dateKey: string;
  startText: string;
  endText: string;
  color: string;
  props: CalendarExtendedProps;
};

type SelectedEvent = {
  eventKey: string;
  dateKey: string;
  title: string;
  startText: string;
  endText: string;
  props: CalendarExtendedProps;
};

export default function AcademyCalendar({ events, teachers, assistants, classGroups, subjects, statuses, privateMemos = [], eventMemos = [] }: Props) {
  const [kind, setKind] = useState("all");
  const [teacherId, setTeacherId] = useState("all");
  const [assistantId, setAssistantId] = useState("all");
  const [classGroupId, setClassGroupId] = useState("all");
  const [subject, setSubject] = useState("all");
  const [status, setStatus] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [cursorDate, setCursorDate] = useState(() => stripTime(new Date()));
  const [selected, setSelected] = useState<SelectedEvent | null>(null);
  const [clickedDate, setClickedDate] = useState<string | null>(null);
  const memoByDate = useMemo(() => new Map(privateMemos.map((memo) => [memo.date, memo.content])), [privateMemos]);
  const eventMemoByKey = useMemo(() => new Map(eventMemos.map((memo) => [memo.eventKey, memo])), [eventMemos]);

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const props = event.extendedProps;
      if (kind !== "all" && props.type !== kind) return false;
      if (teacherId !== "all" && props.teacherId !== teacherId) return false;
      if (assistantId !== "all" && props.assistantId !== assistantId && props.assigneeId !== assistantId && !props.assigneeIds?.includes(assistantId)) return false;
      if (classGroupId !== "all" && props.classGroupId !== classGroupId && props.sourceId !== classGroupId) return false;
      if (subject !== "all" && props.subject !== subject) return false;
      if (status !== "all" && props.status !== status) return false;
      return true;
    });
  }, [assistantId, classGroupId, events, kind, status, subject, teacherId]);

  const days = useMemo(() => daysForView(cursorDate, viewMode), [cursorDate, viewMode]);
  const dateKeys = useMemo(() => new Set(days.map((day) => isoDate(day))), [days]);
  const materializedEvents = useMemo(() => materializeEvents(filteredEvents, days), [days, filteredEvents]);
  const eventsByDate = useMemo(() => {
    const map = new Map<string, MaterializedEvent[]>();
    for (const event of materializedEvents) {
      if (!dateKeys.has(event.dateKey)) continue;
      const list = map.get(event.dateKey) ?? [];
      list.push(event);
      map.set(event.dateKey, list);
    }

    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.props.type !== b.props.type) return a.props.type === "class" ? -1 : 1;
        return a.startText.localeCompare(b.startText) || a.title.localeCompare(b.title, "ko-KR");
      });
    }

    return map;
  }, [dateKeys, materializedEvents]);

  function move(amount: number) {
    setCursorDate((current) => {
      if (viewMode === "month") return addMonths(current, amount);
      if (viewMode === "week") return addDays(current, amount * 7);
      return addDays(current, amount);
    });
  }

  function openEvent(event: MaterializedEvent) {
    setSelected({
      eventKey: event.id,
      dateKey: event.dateKey,
      title: event.title,
      startText: event.startText,
      endText: event.endText,
      props: event.props,
    });
    setClickedDate(null);
  }

  function openDate(dateKey: string) {
    setClickedDate(dateKey);
    setSelected(null);
  }

  return (
    <div style={shell}>
      <section style={toolbar}>
        <select value={kind} onChange={(event) => setKind(event.target.value)} style={select}>
          <option value="all">전체</option>
          <option value="class">반 수업만</option>
          <option value="task">업무만</option>
        </select>
        <select value={teacherId} onChange={(event) => setTeacherId(event.target.value)} style={select}>
          <option value="all">강사 전체</option>
          {teachers.map((teacher) => (
            <option key={teacher.id} value={teacher.id}>{teacher.label}</option>
          ))}
        </select>
        <select value={assistantId} onChange={(event) => setAssistantId(event.target.value)} style={select}>
          <option value="all">조교/담당자 전체</option>
          {assistants.map((assistant) => (
            <option key={assistant.id} value={assistant.id}>{assistant.label}</option>
          ))}
        </select>
        <select value={classGroupId} onChange={(event) => setClassGroupId(event.target.value)} style={select}>
          <option value="all">반 전체</option>
          {classGroups.map((classGroup) => (
            <option key={classGroup.id} value={classGroup.id}>{classGroup.label}</option>
          ))}
        </select>
        <select value={subject} onChange={(event) => setSubject(event.target.value)} style={select}>
          <option value="all">과목 전체</option>
          {subjects.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value)} style={select}>
          <option value="all">상태 전체</option>
          {statuses.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
      </section>

      <section style={contentGrid}>
        <div style={calendarCard}>
          <div style={calendarControls}>
            <div style={navGroup}>
              <button type="button" onClick={() => move(-1)} style={navButton}>‹</button>
              <button type="button" onClick={() => setCursorDate(stripTime(new Date()))} style={navButton}>오늘</button>
              <button type="button" onClick={() => move(1)} style={navButton}>›</button>
            </div>
            <h2 style={calendarTitle}>{viewTitle(cursorDate, viewMode)}</h2>
            <div style={viewTabs}>
              <ViewButton active={viewMode === "month"} onClick={() => setViewMode("month")}>월</ViewButton>
              <ViewButton active={viewMode === "week"} onClick={() => setViewMode("week")}>주</ViewButton>
              <ViewButton active={viewMode === "day"} onClick={() => setViewMode("day")}>일</ViewButton>
            </div>
          </div>

          <div style={legendRow}>
            <Legend color="#4f46e5">반 수업</Legend>
            <Legend color="#64748b">해야 할 일</Legend>
            <Legend color="#0b50d0">진행 중</Legend>
            <Legend color="#16a34a">완료</Legend>
            <Legend color="#dc2626">지연</Legend>
            <span style={eventCount}>{materializedEvents.length}개 일정</span>
          </div>

          <div style={calendarGrid(viewMode)}>
            {days.map((day) => {
              const dateKey = isoDate(day);
              const list = eventsByDate.get(dateKey) ?? [];
              const isCurrentMonth = day.getMonth() === cursorDate.getMonth();
              const isToday = dateKey === isoDate(new Date());

              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => openDate(dateKey)}
                  style={{
                    ...dayCell,
                    ...(viewMode === "day" ? dayCellLarge : {}),
                    ...(!isCurrentMonth && viewMode === "month" ? mutedDayCell : {}),
                    ...(isToday ? todayCell : {}),
                  }}
                >
                  <div style={dayHeader}>
                    <b>{dayLabel(day, viewMode)}</b>
                    <span style={dayHeaderRight}>
                      {memoByDate.has(dateKey) && <i style={memoDot} aria-label="개인 메모" />}
                      {weekdayLabel(day)}
                    </span>
                  </div>
                  <div style={eventList}>
                    {list.map((event) => (
                      <span
                        key={event.id}
                        role="button"
                        tabIndex={0}
                        style={{ ...eventPill, background: event.color }}
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation();
                          openEvent(event);
                        }}
                        onKeyDown={(keyEvent) => {
                          if (keyEvent.key === "Enter" || keyEvent.key === " ") {
                            keyEvent.preventDefault();
                            openEvent(event);
                          }
                        }}
                      >
                        <span style={eventPillMeta}>
                          <small>{event.startText}</small>
                          {eventMemoByKey.has(event.id) && <i style={eventMemoDot} aria-label="?? ??" />}
                        </span>
                        <b>{event.title}</b>
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <aside style={sidePanel}>
          {selected ? (
            <EventDetail
              key={`${selected.eventKey}:${eventMemoByKey.get(selected.eventKey)?.updatedAt ?? "empty"}`}
              selected={selected}
              memo={eventMemoByKey.get(selected.eventKey)}
            />
          ) : clickedDate ? (
            <DateQuickAdd date={clickedDate} memo={memoByDate.get(clickedDate) ?? ""} />
          ) : (
            <EmptyDetail />
          )}
        </aside>
      </section>
    </div>
  );
}

function ViewButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{ ...viewButton, ...(active ? viewButtonActive : {}) }}>
      {children}
    </button>
  );
}

function Legend({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span style={legend}>
      <i style={{ ...legendDot, background: color }} />
      {children}
    </span>
  );
}

function EventDetail({ selected, memo }: { selected: SelectedEvent; memo?: CalendarEventMemoView }) {
  const { props } = selected;
  const isClass = props.type === "class";

  return (
    <section style={detailCard}>
      <div style={detailHeader}>
        <span style={typeBadge(isClass ? "class" : "task")}>{isClass ? "반 수업" : "업무"}</span>
        {props.status && <span style={statusBadge(props.status)}>{statusText(props.status)}</span>}
      </div>
      <h2 style={detailTitle}>{selected.title}</h2>
      <div style={infoList}>
        <Info label="시간" value={props.scheduleText || [selected.startText, selected.endText].filter(Boolean).join(" - ")} />
        {isClass ? (
          <>
            <Info label="담당 강사" value={props.teacherName || "-"} />
            <Info label="담당 조교" value={props.assistantName || "-"} />
            <Info label="과목/학년" value={[props.subject, props.grade].filter(Boolean).join(" / ") || "-"} />
            <Info label="강의실" value={props.room || "-"} />
            <Info label="운영 기간" value={props.operationPeriod || "-"} />
            <Info label="학생 수" value={props.studentCount == null ? "-" : `${props.studentCount}명`} />
          </>
        ) : (
          <>
            <Info label="담당자" value={props.assigneeName || "-"} />
            <Info label="관련 반" value={props.className || "-"} />
            <Info label="관련 학생" value={props.studentName || "-"} />
            <Info label="우선순위" value={priorityText(props.priority)} />
          </>
        )}
      </div>
      {props.description && <p style={description}>{props.description}</p>}
      <form action={saveCalendarEventMemoAction} style={memoForm}>
        <input type="hidden" name="eventKey" value={selected.eventKey} />
        <input type="hidden" name="eventDate" value={selected.dateKey} />
        <input type="hidden" name="eventType" value={props.type} />
        <input type="hidden" name="title" value={selected.title} />
        <label style={memoLabel}>
          캘린더 메모
          <textarea
            key={memo?.updatedAt ?? selected.eventKey}
            name="content"
            rows={4}
            defaultValue={memo?.content ?? ""}
            style={memoTextarea}
          />
        </label>
        {memo?.writerName && <small style={memoMeta}>마지막 수정: {memo.writerName}</small>}
        <button style={primaryButton}>메모 저장</button>
      </form>
      <div style={detailActions}>
        {isClass ? (
          <>
            <Link href={`/classes/${props.sourceId}`} style={primaryLink}>반 상세 보기</Link>
            <Link href={`/students?classGroupId=${props.sourceId}`} style={secondaryLink}>이 반 학생 보기</Link>
          </>
        ) : (
          <Link href={`/tasks/${props.sourceId}`} style={primaryLink}>업무 상세 보기</Link>
        )}
      </div>
    </section>
  );
}

function DateQuickAdd({ date, memo }: { date: string; memo: string }) {
  return (
    <section style={detailCard}>
      <span style={typeBadge("date")}>{date}</span>
      <h2 style={detailTitle}>이 날짜에 추가</h2>
      <form action={saveCalendarPrivateMemoAction} style={memoForm}>
        <input type="hidden" name="date" value={date} />
        <label style={memoLabel}>
          개인 메모
          <textarea name="content" rows={5} defaultValue={memo} style={memoTextarea} />
        </label>
        <button style={primaryButton}>메모 저장</button>
      </form>
      <div style={detailActions}>
        <Link href={`/tasks/new?date=${date}`} style={primaryLink}>업무 추가</Link>
        <Link href="/classes/new" style={secondaryLink}>반 수업 추가</Link>
      </div>
    </section>
  );
}

function EmptyDetail() {
  return (
    <section style={detailCard}>
      <span style={typeBadge("date")}>상세</span>
      <h2 style={detailTitle}>일정을 선택해 주세요</h2>
      <p style={description}>반 수업을 누르면 반 상세로, 업무를 누르면 업무 상세로 바로 이동할 수 있습니다.</p>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={infoRow}>
      <b>{label}</b>
      <span>{value}</span>
    </div>
  );
}

function materializeEvents(events: AcademyCalendarEvent[], days: Date[]) {
  if (days.length === 0) return [];

  const start = stripTime(days[0]);
  const end = stripTime(days[days.length - 1]);
  const result: MaterializedEvent[] = [];

  for (const event of events) {
    const props = event.extendedProps;
    const color = event.backgroundColor || (props.type === "class" ? "#4f46e5" : statusColor(props.status));

    if (props.type === "class" && event.daysOfWeek?.length) {
      const startRecur = event.startRecur ? parseDate(event.startRecur) : start;
      const endRecur = event.endRecur ? parseDate(event.endRecur) : end;

      for (const day of days) {
        if (day < startRecur || day > endRecur) continue;
        if (!event.daysOfWeek.includes(day.getDay())) continue;

        result.push({
          id: `${event.id}-${isoDate(day)}`,
          title: event.title,
          dateKey: isoDate(day),
          startText: event.startTime || "",
          endText: event.endTime || "",
          color,
          props,
        });
      }
      continue;
    }

    const eventStart = event.start ? parseDate(event.start) : start;
    const exclusiveEnd = event.end ? parseDate(event.end) : eventStart;
    const eventEnd = event.end ? addDays(exclusiveEnd, -1) : eventStart;
    const rangeStart = eventStart < start ? start : eventStart;
    const rangeEnd = eventEnd > end ? end : eventEnd;

    for (let day = stripTime(rangeStart); day <= rangeEnd; day = addDays(day, 1)) {
      result.push({
        id: `${event.id}-${isoDate(day)}`,
        title: event.title,
        dateKey: isoDate(day),
        startText: props.type === "task" ? "기간" : event.startTime || "",
        endText: props.type === "task" ? "" : event.endTime || "",
        color,
        props,
      });
    }
  }

  return result;
}

function daysForView(cursor: Date, viewMode: ViewMode) {
  if (viewMode === "day") return [stripTime(cursor)];
  if (viewMode === "week") {
    const start = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }

  const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = startOfWeek(firstOfMonth);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function viewTitle(date: Date, viewMode: ViewMode) {
  if (viewMode === "month") {
    return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long" }).format(date);
  }

  if (viewMode === "week") {
    const start = startOfWeek(date);
    const end = addDays(start, 6);
    return `${formatDate(start)} - ${formatDate(end)}`;
  }

  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(date);
}

function dayLabel(date: Date, viewMode: ViewMode) {
  if (viewMode === "day") return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" }).format(date);
  return String(date.getDate());
}

function weekdayLabel(date: Date) {
  return ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
}

function statusColor(status?: string | null) {
  if (status === "DONE") return "#16a34a";
  if (status === "IN_PROGRESS") return "#0b50d0";
  if (status === "HOLD") return "#d97706";
  if (status === "OVERDUE") return "#dc2626";
  return "#64748b";
}

function statusText(status?: string | null) {
  if (status === "TODO") return "해야 할 일";
  if (status === "IN_PROGRESS") return "진행 중";
  if (status === "DONE") return "완료";
  if (status === "HOLD") return "보류";
  if (status === "OVERDUE") return "지연";
  if (status === "PAUSED") return "휴강";
  if (status === "ENDED") return "종료";
  if (status === "UPCOMING") return "운영 예정";
  if (status === "ACTIVE") return "운영중";
  return status || "-";
}

function priorityText(priority?: string | null) {
  if (priority === "URGENT") return "긴급";
  if (priority === "HIGH") return "높음";
  if (priority === "LOW") return "낮음";
  return "보통";
}

function typeBadge(type: "class" | "task" | "date"): CSSProperties {
  if (type === "class") return { ...badge, background: "#eef2ff", color: "#3730a3" };
  if (type === "task") return { ...badge, background: "#ecfeff", color: "#0e7490" };
  return badge;
}

function statusBadge(status: string): CSSProperties {
  if (status === "DONE") return { ...badge, background: "#dcfce7", color: "#166534" };
  if (status === "IN_PROGRESS") return { ...badge, background: "#e8f0fe", color: "#083891" };
  if (status === "UPCOMING") return { ...badge, background: "#e8f0fe", color: "#083891" };
  if (status === "HOLD" || status === "PAUSED") return { ...badge, background: "#fef3c7", color: "#92400e" };
  if (status === "OVERDUE") return { ...badge, background: "#fee2e2", color: "#991b1b" };
  return badge;
}

function startOfWeek(date: Date) {
  const start = stripTime(date);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

function stripTime(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function parseDate(value: string) {
  const [datePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit" }).format(date);
}

const shell: CSSProperties = { display: "grid", gap: 10 };
const toolbar: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
  border: "1px solid #dfe3ea",
  borderRadius: 8,
  background: "#fff",
  padding: 10,
};
const select: CSSProperties = {
  height: 34,
  minWidth: 118,
  border: "1px solid #d1d5db",
  borderRadius: 7,
  background: "#fff",
  color: "#111827",
  padding: "0 8px",
  fontSize: 12,
  fontWeight: 850,
};
const contentGrid: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", gap: 10, alignItems: "start" };
const calendarCard: CSSProperties = { minWidth: 0, minHeight: 560, border: "1px solid #dfe3ea", borderRadius: 8, background: "#fff", padding: 10, overflow: "auto" };
const calendarControls: CSSProperties = { display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", alignItems: "center", gap: 8, marginBottom: 8 };
const navGroup: CSSProperties = { display: "inline-flex", gap: 4 };
const navButton: CSSProperties = { height: 30, border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", padding: "0 10px", fontSize: 12, fontWeight: 950, cursor: "pointer" };
const calendarTitle: CSSProperties = { margin: 0, textAlign: "center", fontSize: 17, fontWeight: 950 };
const viewTabs: CSSProperties = { display: "inline-flex", gap: 3, border: "1px solid #d1d5db", borderRadius: 7, padding: 2, background: "#f8fafc" };
const viewButton: CSSProperties = { border: 0, borderRadius: 5, background: "transparent", padding: "6px 10px", fontSize: 12, fontWeight: 950, cursor: "pointer", color: "#475569" };
const viewButtonActive: CSSProperties = { background: "#111827", color: "#fff" };
const legendRow: CSSProperties = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8, fontSize: 12, color: "#475569", fontWeight: 850 };
const legend: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5 };
const legendDot: CSSProperties = { width: 9, height: 9, borderRadius: 999, display: "inline-block" };
const eventCount: CSSProperties = { marginLeft: "auto", color: "#111827", fontWeight: 950 };
const calendarGrid = (viewMode: ViewMode): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: viewMode === "day" ? "1fr" : "repeat(7, minmax(132px, 1fr))",
  gap: 0,
  borderTop: "1px solid #d1d5db",
  borderLeft: "1px solid #d1d5db",
  minWidth: viewMode === "day" ? 0 : 920,
});
const dayCell: CSSProperties = {
  border: 0,
  borderRight: "1px solid #d1d5db",
  borderBottom: "1px solid #d1d5db",
  background: "#fff",
  minHeight: 92,
  padding: 6,
  textAlign: "left",
  display: "grid",
  alignContent: "start",
  gap: 6,
  cursor: "pointer",
};
const dayCellLarge: CSSProperties = { minHeight: 440 };
const mutedDayCell: CSSProperties = { background: "#f8fafc", color: "#94a3b8" };
const todayCell: CSSProperties = { boxShadow: "inset 0 0 0 2px #0b50d0" };
const dayHeader: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 };
const dayHeaderRight: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4 };
const memoDot: CSSProperties = { width: 7, height: 7, borderRadius: 999, background: "#f59e0b", display: "inline-block" };
const eventList: CSSProperties = { display: "grid", gap: 5, alignContent: "start" };
const eventPill: CSSProperties = {
  border: 0,
  borderRadius: 6,
  color: "#fff",
  padding: "5px 6px",
  display: "grid",
  gap: 1,
  fontSize: 11,
  lineHeight: 1.25,
  boxShadow: "0 1px 2px rgba(15,23,42,.16)",
  cursor: "pointer",
};
const eventPillMeta: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 };
const eventMemoDot: CSSProperties = { width: 6, height: 6, borderRadius: 999, background: "#facc15", boxShadow: "0 0 0 1px rgba(15,23,42,.2)" };
const sidePanel: CSSProperties = { position: "sticky", top: 10 };
const detailCard: CSSProperties = { border: "1px solid #dfe3ea", borderRadius: 8, background: "#fff", padding: 10, display: "grid", gap: 9 };
const detailHeader: CSSProperties = { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" };
const detailTitle: CSSProperties = { margin: 0, fontSize: 18, fontWeight: 950, lineHeight: 1.25 };
const infoList: CSSProperties = { display: "grid", gap: 6 };
const infoRow: CSSProperties = { display: "grid", gridTemplateColumns: "72px minmax(0, 1fr)", gap: 6, fontSize: 13, alignItems: "start" };
const description: CSSProperties = { margin: 0, color: "#4b5563", fontSize: 13, lineHeight: 1.45, borderTop: "1px solid #eef2f7", paddingTop: 8 };
const detailActions: CSSProperties = { display: "flex", gap: 6, flexWrap: "wrap" };
const primaryLink: CSSProperties = { border: "1px solid #111827", background: "#111827", color: "#fff", borderRadius: 7, padding: "8px 10px", textDecoration: "none", fontSize: 12, fontWeight: 950 };
const secondaryLink: CSSProperties = { ...primaryLink, borderColor: "#d1d5db", background: "#fff", color: "#111827" };
const primaryButton: CSSProperties = { border: "1px solid #111827", background: "#111827", color: "#fff", borderRadius: 7, padding: "8px 10px", fontSize: 12, fontWeight: 950 };
const memoForm: CSSProperties = { display: "grid", gap: 6 };
const memoLabel: CSSProperties = { display: "grid", gap: 5, fontSize: 13, fontWeight: 950 };
const memoTextarea: CSSProperties = { width: "100%", border: "1px solid #d1d5db", borderRadius: 7, padding: 8, resize: "vertical", font: "inherit", color: "#111827" };
const memoMeta: CSSProperties = { color: "#6b7280", fontSize: 11, fontWeight: 850 };
const badge: CSSProperties = { display: "inline-flex", alignItems: "center", borderRadius: 999, background: "#f1f5f9", color: "#475569", padding: "4px 8px", fontSize: 12, fontWeight: 950 };
