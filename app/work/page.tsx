import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { getAssistantWorkNotes, type AssistantWorkNote } from "@/lib/assistantWorkNotes";
import { prisma } from "@/lib/prisma";
import type { AssistantWorkShift, User } from "@/lib/generated/prisma";
import { deleteWorkShiftAction, saveAssistantWorkNoteAction, saveWorkShiftAction } from "./actions";

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: Promise<{ assistantId?: string; month?: string; date?: string; shiftId?: string }>;
};

type ShiftRow = AssistantWorkShift & { assistant: Pick<User, "id" | "name"> };

export default async function WorkPage({ searchParams }: Props = {}) {
  const user = await requireUser();
  const params = (await searchParams) ?? {};
  const managerView = user.role !== "ASSISTANT";
  const month = monthValue(params.month) || toYm(new Date());
  const { start, end } = monthRange(month);
  const selectedDate = selectedDateValue(params.date, month);

  const assistants = await prisma.user.findMany({
    where: { academyId: user.academyId, role: "ASSISTANT", isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, loginId: true, role: true, isActive: true },
  });

  const selectedAssistantId = managerView
    ? assistants.some((assistant) => assistant.id === params.assistantId)
      ? params.assistantId!
      : assistants[0]?.id ?? ""
    : user.id;

  const [selectedAssistant, shifts] = await Promise.all([
    selectedAssistantId
      ? prisma.user.findFirst({
          where: { id: selectedAssistantId, academyId: user.academyId },
          select: { id: true, name: true, loginId: true, role: true, isActive: true },
        })
      : null,
    selectedAssistantId
      ? prisma.assistantWorkShift.findMany({
          where: {
            academyId: user.academyId,
            assistantId: selectedAssistantId,
            workDate: { gte: start, lte: end },
          },
          orderBy: [{ workDate: "asc" }, { startTime: "asc" }],
          include: { assistant: { select: { id: true, name: true } } },
        })
      : [],
  ]);
  const assistantNotes = managerView ? await getAssistantWorkNotes(user.academyId) : {};
  const selectedAssistantNote = selectedAssistantId ? assistantNotes[selectedAssistantId] : undefined;

  const summary = summarizeShifts(shifts);
  const selectedDateShifts = shifts.filter((shift) => shift.workDate === selectedDate);
  const selectedSummary = summarizeShifts(selectedDateShifts);
  const selectedShift = selectedDateShifts.find((shift) => shift.id === params.shiftId) ?? null;

  return (
    <main style={page}>
      <section style={container}>
        <header style={header}>
          <div>
            <p style={eyebrow}>근무시간 / 월급</p>
            <h1 style={title}>{managerView ? "조교 근무 관리" : "내 근무표"}</h1>
            <p style={desc}>
              {managerView
                ? "조교별 월급 캘린더에서 날짜를 눌러 근무를 바로 수정합니다."
                : "캘린더에서 날짜를 눌러 내 근무시간, 결근, 메모를 직접 수정합니다."}
            </p>
          </div>
          <form style={monthForm}>
            {managerView && selectedAssistantId && <input type="hidden" name="assistantId" value={selectedAssistantId} />}
            <input name="month" type="month" defaultValue={month} style={input} />
            <button style={smallGhost}>월 이동</button>
          </form>
        </header>

        <section style={layout(managerView)}>
          {managerView && (
            <aside style={assistantPanel}>
              <h2 style={panelTitle}>조교 목록</h2>
              <div style={assistantList}>
                {assistants.map((assistant) => (
                  <Link
                    key={assistant.id}
                    href={workHref({ assistantId: assistant.id, month, date: selectedDate, managerView: true })}
                    style={assistant.id === selectedAssistantId ? activeAssistantLink : assistantLink}
                  >
                    <b>{assistant.name}</b>
                    <span>{assistant.loginId}</span>
                  </Link>
                ))}
                {assistants.length === 0 && <Empty>등록된 조교가 없습니다.</Empty>}
              </div>
            </aside>
          )}

          <div style={mainColumn}>
            <section style={salaryCalendarPanel}>
              <div style={salaryTop}>
                <div>
                  <span style={badge}>{selectedAssistant?.isActive ? "활성" : "비활성"}</span>
                  <h2 style={monthTitle}>{monthTitleText(month)}</h2>
                  <p style={desc}>{selectedAssistant?.name ?? user.name} · {selectedAssistant?.loginId ?? user.loginId}</p>
                </div>
                <div style={payTotalBox}>
                  <span>예상 월급</span>
                  <b>{formatWon(summary.pay)}원</b>
                </div>
              </div>

              <div style={summaryGrid}>
                <Summary label="총 근무시간" value={formatHours(summary.minutes)} />
                <Summary label="근무일" value={`${summary.workDays}일`} />
                <Summary label="결근/취소" value={`${summary.absentDays}일`} tone={summary.absentDays ? "warn" : "default"} />
                <Summary label="선택일 급여" value={`${formatWon(selectedSummary.pay)}원`} tone="money" />
              </div>

              {selectedAssistantId ? (
                <section style={workBoard}>
                  <div style={calendarPane}>
                    <SalaryMonthCalendar
                      month={month}
                      shifts={shifts}
                      selectedDate={selectedDate}
                      assistantId={selectedAssistantId}
                      managerView={managerView}
                    />
                  </div>
                  <aside style={sideWorkPane}>
                    {managerView && selectedAssistantId && (
                      <AssistantWorkNoteForm assistantId={selectedAssistantId} note={selectedAssistantNote} />
                    )}

                    <div style={panelHead}>
                      <div>
                        <h2 style={panelTitle}>{longDateText(selectedDate)}</h2>
                        <p style={softText}>
                          {selectedDateShifts.length > 0
                            ? `${formatHours(selectedSummary.minutes)} · ${formatWon(selectedSummary.pay)}원`
                            : "날짜를 눌러 근무를 저장합니다."}
                        </p>
                      </div>
                      <Link href={workHref({ assistantId: selectedAssistantId, month: toYm(new Date()), date: toYmd(new Date()), managerView })} style={smallLink}>
                        오늘
                      </Link>
                    </div>

                    {selectedShift ? (
                      <section style={detailPane}>
                        <div style={detailTitleRow}>
                          <span style={statusBadge(selectedShift.status)}>{shiftChipText(selectedShift)}</span>
                          <Link href={workHref({ assistantId: selectedAssistantId, month, date: selectedDate, managerView })} style={smallLink}>
                            새 근무
                          </Link>
                        </div>
                        <ShiftForm key={selectedShift.id} shift={selectedShift} assistantId={selectedAssistantId} managerView={managerView} />
                        <form action={deleteWorkShiftAction}>
                          <input type="hidden" name="shiftId" value={selectedShift.id} />
                          <button style={dangerButton}>삭제</button>
                        </form>
                      </section>
                    ) : (
                      <ShiftForm key={`${selectedAssistantId}:${selectedDate}:new`} assistantId={selectedAssistantId} defaultDate={selectedDate} managerView={managerView} />
                    )}

                    <div style={dayShiftList}>
                      <h3 style={smallSectionTitle}>선택일 근무 내역</h3>
                      {selectedDateShifts.map((shift) => (
                        <div key={shift.id} style={dayShiftItem}>
                          <div style={dayShiftSummary}>
                            <span style={statusBadge(shift.status)}>{shiftChipText(shift)}</span>
                            <b>{shift.startTime} ~ {shift.endTime}</b>
                            <span>{formatWon(shiftPay(shift))}원</span>
                          </div>
                          <Link
                            href={workHref({ assistantId: selectedAssistantId, month, date: shift.workDate, shiftId: shift.id, managerView })}
                            style={detailButton}
                          >
                            상세
                          </Link>
                        </div>
                      ))}
                      {selectedDateShifts.length === 0 && <Empty>선택한 날짜에 등록된 근무가 없습니다.</Empty>}
                    </div>
                  </aside>
                </section>
              ) : (
                <Empty>근무를 등록할 조교를 먼저 추가해 주세요.</Empty>
              )}
            </section>
          </div>
        </section>
      </section>
    </main>
  );
}

function AssistantWorkNoteForm({ assistantId, note }: { assistantId: string; note?: AssistantWorkNote }) {
  return (
    <section style={assistantMemoBox}>
      <div>
        <h3 style={smallSectionTitle}>조교 운영 메모</h3>
        <p style={softText}>휴무, 일정 제한, 특이사항처럼 근무표와 별도로 기억할 내용을 남깁니다.</p>
      </div>
      <form action={saveAssistantWorkNoteAction} style={assistantMemoForm}>
        <input type="hidden" name="assistantId" value={assistantId} />
        <textarea
          name="content"
          rows={4}
          defaultValue={note?.content ?? ""}
          placeholder="예: 개인 사정으로 3주간 쉼, 시험 기간 전까지 평일 근무 불가"
          style={memoTextarea}
        />
        <div style={memoActionRow}>
          <span style={memoMeta}>
            {note?.updatedAt
              ? `마지막 수정: ${note.updatedByName || "관리자"} / ${new Date(note.updatedAt).toLocaleDateString("ko-KR")}`
              : "저장된 메모 없음"}
          </span>
          <button style={smallPrimaryButton}>메모 저장</button>
        </div>
      </form>
    </section>
  );
}

function SalaryMonthCalendar({
  month,
  shifts,
  selectedDate,
  assistantId,
  managerView,
}: {
  month: string;
  shifts: ShiftRow[];
  selectedDate: string;
  assistantId: string;
  managerView: boolean;
}) {
  const days = calendarDays(month);
  const shiftsByDate = groupShiftsByDate(shifts);
  const currentMonth = month;
  const today = toYmd(new Date());

  return (
    <div style={calendarWrap}>
      <div style={weekdayRow}>
        {["일", "월", "화", "수", "목", "금", "토"].map((day, index) => (
          <span key={day} style={index === 0 ? sundayText : index === 6 ? saturdayText : undefined}>{day}</span>
        ))}
      </div>
      <div style={calendarGrid}>
        {days.map((day) => {
          const date = toYmd(day);
          const dayShifts = shiftsByDate.get(date) ?? [];
          const daySummary = summarizeShifts(dayShifts);
          const inMonth = date.startsWith(currentMonth);
          const selected = date === selectedDate;
          const dayOfWeek = day.getDay();
          const visibleShifts = dayShifts.slice(0, 2);

          return (
            <Link
              key={date}
              href={workHref({ assistantId, month: toYm(day), date, managerView })}
              style={{
                ...calendarDay,
                ...(date === today ? calendarDayToday : {}),
                ...(!inMonth ? calendarDayMuted : {}),
                ...(selected ? calendarDaySelected : {}),
              }}
            >
              <div style={dayNumberLine}>
                <b style={dayOfWeek === 0 ? sundayText : dayOfWeek === 6 ? saturdayText : undefined}>{day.getDate()}</b>
                {daySummary.minutes > 0 && <span>{formatHoursShort(daySummary.minutes)}</span>}
              </div>
              <div style={shiftChipStack}>
                {visibleShifts.map((shift) => (
                  <span key={shift.id} style={shiftChipStyle(shift.status)}>{shiftChipText(shift)}</span>
                ))}
                {dayShifts.length > visibleShifts.length && <span style={moreChip}>+{dayShifts.length - visibleShifts.length}</span>}
              </div>
              <span style={dayPayText}>{daySummary.pay > 0 ? formatWon(daySummary.pay) : ""}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function ShiftForm({ assistantId, defaultDate, managerView, shift }: { assistantId: string; defaultDate?: string; managerView: boolean; shift?: ShiftRow }) {
  return (
    <form action={saveWorkShiftAction} style={shiftForm}>
      {shift && <input type="hidden" name="shiftId" value={shift.id} />}
      <input type="hidden" name="assistantId" value={assistantId} />
      <label style={label}>근무일<input name="workDate" type="date" required defaultValue={shift?.workDate ?? defaultDate ?? ""} style={input} /></label>
      <label style={label}>시작<input name="startTime" type="time" required defaultValue={shift?.startTime ?? "14:00"} style={input} /></label>
      <label style={label}>종료<input name="endTime" type="time" required defaultValue={shift?.endTime ?? "18:00"} style={input} /></label>
      <label style={label}>휴게(분)<input name="breakMinutes" type="number" min={0} defaultValue={shift?.breakMinutes ?? 0} style={input} /></label>
      <label style={label}>시급<input name="hourlyWage" type="number" min={0} defaultValue={shift?.hourlyWage ?? 0} style={input} /></label>
      <label style={label}>상태
        <select name="status" defaultValue={shift?.status ?? "SCHEDULED"} style={input}>
          <option value="SCHEDULED">예정</option>
          <option value="WORKED">근무 완료</option>
          <option value="ABSENT">못 나옴</option>
          <option value="CANCELLED">취소</option>
        </select>
      </label>
      <label style={{ ...label, gridColumn: managerView ? "1 / -1" : "1 / -1" }}>메모
        <input name="memo" defaultValue={shift?.memo ?? ""} style={input} />
      </label>
      <button style={primaryButton}>{shift ? "근무 수정" : "근무 저장"}</button>
    </form>
  );
}

function Summary({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warn" | "money" }) {
  return (
    <div style={{ ...summaryCard, ...(tone === "warn" ? warnCard : {}), ...(tone === "money" ? moneyCard : {}) }}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div style={empty}>{children}</div>;
}

function monthValue(value?: string) {
  return value && /^\d{4}-\d{2}$/.test(value) ? value : "";
}

function dateValue(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function selectedDateValue(value: string | undefined, month: string) {
  const { start, end } = monthRange(month);
  const selected = dateValue(value);
  if (selected && selected >= start && selected <= end) return selected;
  const today = toYmd(new Date());
  if (today >= start && today <= end) return today;
  return start;
}

function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const startDate = new Date(year, monthNumber - 1, 1);
  const endDate = new Date(year, monthNumber, 0);
  return { start: toYmd(startDate), end: toYmd(endDate) };
}

function calendarDays(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(year, monthNumber - 1, 1);
  const start = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toYm(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function toYmd(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function workHref({ assistantId, month, date, shiftId, managerView }: { assistantId: string; month: string; date: string; shiftId?: string; managerView: boolean }) {
  const params = new URLSearchParams({ month, date });
  if (managerView) params.set("assistantId", assistantId);
  if (shiftId) params.set("shiftId", shiftId);
  return `/work?${params.toString()}`;
}

function groupShiftsByDate(shifts: ShiftRow[]) {
  const map = new Map<string, ShiftRow[]>();
  for (const shift of shifts) {
    const list = map.get(shift.workDate) ?? [];
    list.push(shift);
    map.set(shift.workDate, list);
  }
  return map;
}

function summarizeShifts(shifts: ShiftRow[]) {
  return shifts.reduce(
    (summary, shift) => {
      if (shift.status === "ABSENT" || shift.status === "CANCELLED") {
        summary.absentDays += 1;
        return summary;
      }
      summary.workDays += 1;
      summary.minutes += shiftMinutes(shift);
      summary.pay += shiftPay(shift);
      return summary;
    },
    { minutes: 0, pay: 0, workDays: 0, absentDays: 0 }
  );
}

function shiftMinutes(shift: Pick<AssistantWorkShift, "startTime" | "endTime" | "breakMinutes" | "status">) {
  if (shift.status === "ABSENT" || shift.status === "CANCELLED") return 0;
  const start = minutesFromTime(shift.startTime);
  const end = minutesFromTime(shift.endTime);
  const raw = Math.max(0, end - start);
  return Math.max(0, raw - shift.breakMinutes);
}

function shiftPay(shift: Pick<AssistantWorkShift, "startTime" | "endTime" | "breakMinutes" | "hourlyWage" | "status">) {
  return Math.round((shiftMinutes(shift) / 60) * shift.hourlyWage);
}

function minutesFromTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0);
}

function formatHours(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`;
}

function formatHoursShort(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `${hours}h ${rest}m`;
  if (hours) return `${hours}h`;
  return `${rest}m`;
}

function shiftChipText(shift: Pick<AssistantWorkShift, "startTime" | "endTime" | "breakMinutes" | "status">) {
  if (shift.status === "ABSENT") return "못 나옴";
  if (shift.status === "CANCELLED") return "취소";
  return formatHours(shiftMinutes(shift));
}

function monthTitleText(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${year}년 ${monthNumber}월`;
}

function longDateText(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date(year, month - 1, day));
}

function formatWon(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function statusBadge(status: string): CSSProperties {
  if (status === "WORKED") return successBadge;
  if (status === "ABSENT") return dangerBadge;
  if (status === "CANCELLED") return mutedBadge;
  return infoBadge;
}

function shiftChipStyle(status: string): CSSProperties {
  if (status === "ABSENT") return absentChip;
  if (status === "CANCELLED") return cancelledChip;
  return shiftChip;
}

const page: CSSProperties = { padding: 14, color: "#111827", background: "#f3f4f6", minHeight: "100vh" };
const container: CSSProperties = { width: "100%", maxWidth: "none", margin: 0, display: "grid", gap: 12 };
const header: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, background: "#fff", border: "1px solid #d1d5db", borderRadius: 8, padding: 16 };
const eyebrow: CSSProperties = { margin: "0 0 4px", color: "#2563eb", fontWeight: 950, fontSize: 12 };
const title: CSSProperties = { margin: 0, fontSize: 25, fontWeight: 950 };
const desc: CSSProperties = { margin: "6px 0 0", color: "#6b7280", fontSize: 14 };
const monthForm: CSSProperties = { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" };
const layout = (managerView: boolean): CSSProperties => ({ display: "grid", gridTemplateColumns: managerView ? "260px minmax(0, 1fr)" : "1fr", gap: 12, alignItems: "start" });
const assistantPanel: CSSProperties = { background: "#fff", border: "1px solid #d1d5db", borderRadius: 8, padding: 12, position: "sticky", top: 12 };
const assistantList: CSSProperties = { display: "grid", gap: 7 };
const assistantLink: CSSProperties = { display: "grid", gap: 3, border: "1px solid #e5e7eb", borderRadius: 7, padding: 10, color: "#111827", textDecoration: "none", background: "#fff" };
const activeAssistantLink: CSSProperties = { ...assistantLink, border: "1px solid #2563eb", background: "#eff6ff" };
const mainColumn: CSSProperties = { display: "grid", gap: 12, minWidth: 0 };
const salaryCalendarPanel: CSSProperties = { background: "#fff", border: "1px solid #d1d5db", borderRadius: 8, padding: 14, display: "grid", gap: 12 };
const salaryTop: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "end", flexWrap: "wrap" };
const monthTitle: CSSProperties = { margin: "6px 0 0", fontSize: 25, fontWeight: 950 };
const payTotalBox: CSSProperties = { display: "grid", justifyItems: "end", gap: 4 };
const summaryGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 };
const summaryCard: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 8, padding: 11, display: "grid", gap: 5, background: "#fff" };
const moneyCard: CSSProperties = { border: "1px solid #bbf7d0", background: "#f0fdf4" };
const warnCard: CSSProperties = { border: "1px solid #fed7aa", background: "#fff7ed" };
const calendarWrap: CSSProperties = { display: "grid", gap: 0, border: "1px solid #d1d5db", borderRadius: 8, overflow: "hidden" };
const weekdayRow: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(7, minmax(74px, 1fr))", background: "#f8fafc", borderBottom: "1px solid #d1d5db", textAlign: "center", fontWeight: 950, color: "#6b7280", fontSize: 12 };
const calendarGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(7, minmax(74px, 1fr))" };
const calendarDay: CSSProperties = { minHeight: 88, borderRight: "1px solid #e5e7eb", borderBottom: "1px solid #e5e7eb", padding: 6, display: "grid", gridTemplateRows: "auto 1fr auto", gap: 4, color: "#111827", textDecoration: "none", background: "#fff" };
const calendarDayMuted: CSSProperties = { background: "#f8fafc", color: "#9ca3af" };
const calendarDaySelected: CSSProperties = { background: "#eef2ff", boxShadow: "inset 0 0 0 2px #2563eb" };
const calendarDayToday: CSSProperties = { boxShadow: "inset 0 0 0 2px #111827" };
const dayNumberLine: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 15 };
const shiftChipStack: CSSProperties = { display: "grid", gap: 3, alignContent: "start", minWidth: 0 };
const shiftChip: CSSProperties = { display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", borderRadius: 5, padding: "3px 5px", background: "#4f7de8", color: "#fff", fontSize: 11, fontWeight: 900 };
const absentChip: CSSProperties = { ...shiftChip, background: "#ef4444" };
const cancelledChip: CSSProperties = { ...shiftChip, background: "#94a3b8" };
const moreChip: CSSProperties = { color: "#6b7280", fontSize: 13, fontWeight: 950, textAlign: "center" };
const dayPayText: CSSProperties = { color: "#6b7280", textAlign: "right", fontSize: 12, fontWeight: 950 };
const sundayText: CSSProperties = { color: "#ef4444" };
const saturdayText: CSSProperties = { color: "#38bdf8" };
const workBoard: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(280px, 1fr)", gap: 12, alignItems: "start" };
const calendarPane: CSSProperties = { minWidth: 0 };
const sideWorkPane: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, background: "#fbfcfe", display: "grid", gap: 12, alignContent: "start" };
const panelHead: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 10 };
const panelTitle: CSSProperties = { margin: 0, fontSize: 18, fontWeight: 950 };
const softText: CSSProperties = { color: "#64748b", fontSize: 12, fontWeight: 900, margin: "4px 0 0" };
const smallLink: CSSProperties = { color: "#2563eb", fontWeight: 950, textDecoration: "none", fontSize: 12 };
const assistantMemoBox: CSSProperties = { border: "1px solid #bfdbfe", borderRadius: 8, padding: 10, background: "#eff6ff", display: "grid", gap: 10 };
const assistantMemoForm: CSSProperties = { display: "grid", gap: 8 };
const memoTextarea: CSSProperties = { width: "100%", resize: "vertical", minHeight: 92, border: "1px solid #93c5fd", borderRadius: 8, padding: 9, background: "#fff", color: "#111827", lineHeight: 1.5 };
const memoActionRow: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" };
const memoMeta: CSSProperties = { color: "#64748b", fontSize: 12, fontWeight: 800 };
const smallPrimaryButton: CSSProperties = { height: 32, border: "1px solid #1d4ed8", borderRadius: 7, background: "#1d4ed8", color: "#fff", padding: "0 10px", fontSize: 12, fontWeight: 950 };
const dayShiftList: CSSProperties = { display: "grid", gap: 8, marginTop: 12 };
const dayShiftItem: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, background: "#fff", display: "grid", gap: 7 };
const dayShiftSummary: CSSProperties = { display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 8, alignItems: "center" };
const smallSectionTitle: CSSProperties = { margin: 0, fontSize: 14, fontWeight: 950 };
const detailPane: CSSProperties = { display: "grid", gap: 10, border: "1px solid #dbeafe", background: "#eff6ff", borderRadius: 8, padding: 10 };
const detailTitleRow: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 };
const detailButton: CSSProperties = { height: 30, display: "inline-grid", placeItems: "center", border: "1px solid #d1d5db", borderRadius: 7, background: "#fff", color: "#111827", textDecoration: "none", fontSize: 12, fontWeight: 950 };
const shiftForm: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, alignItems: "end" };
const label: CSSProperties = { display: "grid", gap: 6, fontSize: 13, fontWeight: 900 };
const input: CSSProperties = { width: "100%", height: 36, border: "1px solid #d1d5db", borderRadius: 8, padding: "0 9px", background: "#fff", color: "#111827" };
const primaryButton: CSSProperties = { height: 36, border: "1px solid #111827", borderRadius: 8, background: "#111827", color: "#fff", padding: "0 12px", fontWeight: 950 };
const smallGhost: CSSProperties = { ...primaryButton, background: "#fff", color: "#111827", border: "1px solid #d1d5db" };
const dangerButton: CSSProperties = { ...primaryButton, background: "#dc2626", border: "1px solid #dc2626" };
const badge: CSSProperties = { display: "inline-flex", alignItems: "center", height: 24, borderRadius: 999, background: "#f1f5f9", color: "#475569", padding: "0 8px", fontSize: 12, fontWeight: 950 };
const infoBadge: CSSProperties = { ...badge, background: "#dbeafe", color: "#1d4ed8" };
const successBadge: CSSProperties = { ...badge, background: "#dcfce7", color: "#166534" };
const dangerBadge: CSSProperties = { ...badge, background: "#fee2e2", color: "#991b1b" };
const mutedBadge: CSSProperties = { ...badge, background: "#f3f4f6", color: "#6b7280" };
const empty: CSSProperties = { border: "1px dashed #d1d5db", borderRadius: 8, padding: 18, textAlign: "center", color: "#6b7280", fontWeight: 900 };
