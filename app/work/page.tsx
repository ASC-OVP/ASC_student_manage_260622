import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { getAssistantWorkNotes, type AssistantWorkNote } from "@/lib/assistantWorkNotes";
import { prisma } from "@/lib/prisma";
import type { AssistantWorkShift, User } from "@/lib/generated/prisma";
import WorkConfirmSubmit from "./WorkConfirmSubmit";
import { deleteWorkShiftAction, saveAssistantWorkNoteAction, saveWorkShiftAction, updatePayrollSettlementAction } from "./actions";
import { getPayrollSettlements, isPayrollClosed, payrollSettlementKey, type PayrollSettlementRecord, type PayrollSettlements } from "./payrollSettlements";

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: Promise<{
    assistantId?: string;
    month?: string;
    date?: string;
    shiftId?: string;
    q?: string;
    status?: string;
    from?: string;
    to?: string;
    confirmed?: string;
  }>;
};

type AssistantOption = Pick<User, "id" | "name" | "loginId" | "role" | "isActive">;
type ShiftRow = AssistantWorkShift & {
  assistant: Pick<User, "id" | "name">;
  createdBy: Pick<User, "id" | "name" | "role"> | null;
};
type ShiftStatusFilter = "all" | "SCHEDULED" | "WORKED" | "ABSENT" | "CANCELLED";
type ConfirmedFilter = "all" | "confirmed" | "unconfirmed";

const shiftStatusOptions: Array<{ value: ShiftStatusFilter; label: string }> = [
  { value: "all", label: "전체 상태" },
  { value: "SCHEDULED", label: "예정/미확정" },
  { value: "WORKED", label: "근무 완료" },
  { value: "ABSENT", label: "결근" },
  { value: "CANCELLED", label: "취소" },
];

export default async function WorkPage({ searchParams }: Props = {}) {
  const user = await requireUser();
  const params = (await searchParams) ?? {};
  const managerView = user.role !== "ASSISTANT";
  const month = monthValue(params.month) || toYm(new Date());
  const { start, end } = monthRange(month);
  const selectedDate = selectedDateValue(params.date, month);
  const query = (params.q ?? "").trim();
  const statusFilter = shiftStatusValue(params.status);
  const confirmedFilter = confirmedValue(params.confirmed);
  const fromDate = boundedDate(params.from, start, end);
  const toDate = boundedDate(params.to, start, end);

  const assistants = await prisma.user.findMany({
    where: { academyId: user.academyId, role: "ASSISTANT", isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, loginId: true, role: true, isActive: true },
  });

  const selectedAssistantId = resolveSelectedAssistantId({
    managerView,
    requestedAssistantId: params.assistantId,
    assistants,
    userId: user.id,
  });
  const selectedAssistant =
    selectedAssistantId !== "all"
      ? assistants.find((assistant) => assistant.id === selectedAssistantId) ??
        (user.id === selectedAssistantId
          ? { id: user.id, name: user.name, loginId: user.loginId, role: user.role, isActive: user.isActive }
          : null)
      : null;

  const [monthShifts, settlements, assistantNotes] = await Promise.all([
    prisma.assistantWorkShift.findMany({
      where: {
        academyId: user.academyId,
        workDate: { gte: start, lte: end },
        ...(managerView ? {} : { assistantId: user.id }),
      },
      orderBy: [{ workDate: "asc" }, { startTime: "asc" }],
      include: {
        assistant: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, role: true } },
      },
    }),
    getPayrollSettlements(user.academyId),
    managerView ? getAssistantWorkNotes(user.academyId) : Promise.resolve({} as Record<string, AssistantWorkNote>),
  ]);

  const scopedShifts = selectedAssistantId === "all" ? monthShifts : monthShifts.filter((shift) => shift.assistantId === selectedAssistantId);
  const tableShifts = filterShifts(scopedShifts, {
    query,
    status: statusFilter,
    from: fromDate,
    to: toDate,
    confirmed: confirmedFilter,
    settlements,
    month,
  });
  const summary = summarizeShifts(scopedShifts);
  const selectedDateShifts = scopedShifts.filter((shift) => shift.workDate === selectedDate);
  const selectedSummary = summarizeShifts(selectedDateShifts);
  const selectedShift = selectedAssistantId !== "all" ? selectedDateShifts.find((shift) => shift.id === params.shiftId) ?? null : null;
  const selectedSettlement = selectedAssistantId !== "all" ? settlements[payrollSettlementKey(selectedAssistantId, month)] : undefined;
  const selectedClosed = isPayrollClosed(selectedSettlement);
  const selectedAssistantNote = selectedAssistantId !== "all" ? assistantNotes[selectedAssistantId] : undefined;
  const payrollStatus = payrollScopeStatus(selectedAssistantId, scopedShifts, settlements, month);
  const payLabel = selectedSettlement ? "확정 급여" : "예상 급여";
  const monthNav = monthNavigation(month);

  return (
    <main style={page}>
      <section style={container}>
        <header style={header}>
          <div>
            <p style={eyebrow}>근무/급여</p>
            <h1 style={title}>월별 근무 정산</h1>
            <p style={desc}>
              {managerView
                ? "선택한 월의 근무 기록, 급여 상태, 마감 여부를 한 화면에서 확인합니다."
                : "내 근무 기록과 이번 달 예상 급여, 정산 상태를 확인합니다."}
            </p>
          </div>
          <div style={monthTools}>
            <Link href={workHref({ assistantId: selectedAssistantId, month: monthNav.previous, date: monthNav.previousDate, managerView })} style={smallGhostLink}>
              이전 달
            </Link>
            <form style={monthForm}>
              {managerView && <input type="hidden" name="assistantId" value={selectedAssistantId} />}
              <input name="month" type="month" defaultValue={month} style={input} />
              <button style={smallGhost}>월 이동</button>
            </form>
            <Link href={workHref({ assistantId: selectedAssistantId, month: toYm(new Date()), date: toYmd(new Date()), managerView })} style={smallGhostLink}>
              이번 달
            </Link>
          </div>
        </header>

        <section style={layout(managerView)}>
          {managerView && (
            <aside style={assistantPanel}>
              <h2 style={panelTitle}>직원/조교</h2>
              <div style={assistantList}>
                <AssistantLink
                  href={workHref({ assistantId: "all", month, date: selectedDate, managerView })}
                  active={selectedAssistantId === "all"}
                  name="전체 직원"
                  meta={payrollScopeStatus("all", monthShifts, settlements, month)}
                />
                {assistants.map((assistant) => {
                  const assistantShifts = monthShifts.filter((shift) => shift.assistantId === assistant.id);
                  return (
                    <AssistantLink
                      key={assistant.id}
                      href={workHref({ assistantId: assistant.id, month, date: selectedDate, managerView })}
                      active={assistant.id === selectedAssistantId}
                      name={assistant.name}
                      loginId={assistant.loginId}
                      meta={`${formatWon(summarizeShifts(assistantShifts).pay)}원 · ${payrollStatusText(settlements[payrollSettlementKey(assistant.id, month)])}`}
                    />
                  );
                })}
                {assistants.length === 0 && <Empty>등록된 조교가 없습니다.</Empty>}
              </div>
            </aside>
          )}

          <div style={mainColumn}>
            <section style={settlementPanel}>
              <div style={salaryTop}>
                <div>
                  <span style={payrollBadgeStyle(selectedSettlement)}>{payrollStatus}</span>
                  <h2 style={monthTitle}>{monthTitleText(month)}</h2>
                  <p style={desc}>
                    {selectedAssistant
                      ? `${selectedAssistant.name} · ${selectedAssistant.loginId}`
                      : managerView
                        ? "전체 직원 월별 정산"
                        : `${user.name} · ${user.loginId}`}
                  </p>
                </div>
                <div style={payTotalBox}>
                  <span>{payLabel}</span>
                  <b>{formatWon(selectedSettlement?.totalPay ?? summary.pay)}원</b>
                  <small>{selectedSettlement ? `${formatDateTime(selectedSettlement.updatedAt)} 기준` : "근무 기록 기준 자동 계산"}</small>
                </div>
              </div>

              <div style={summaryGrid}>
                <Summary label="총 근무 시간" value={formatHours(summary.minutes)} />
                <Summary label={payLabel} value={`${formatWon(selectedSettlement?.totalPay ?? summary.pay)}원`} tone="money" />
                <Summary label="미확정 근무 기록" value={`${summary.scheduledCount}건`} tone={summary.scheduledCount ? "warn" : "default"} />
                <Summary label="지급 완료 여부" value={payrollStatus} tone={selectedSettlement?.status === "PAID" ? "success" : selectedSettlement ? "default" : "warn"} />
                <Summary label="지각/결근/취소" value={`${summary.absentDays}건`} tone={summary.absentDays ? "warn" : "default"} />
                <Summary label="수정/요청" value={`${summary.revisionCount + summary.requestCount}건`} tone={summary.revisionCount + summary.requestCount ? "warn" : "default"} />
              </div>

              <PayrollSettlementBox
                managerView={managerView}
                assistantId={selectedAssistantId}
                assistantName={selectedAssistant?.name}
                month={month}
                summary={summary}
                settlement={selectedSettlement}
              />
            </section>

            <section style={tablePanel}>
              <div style={sectionHead}>
                <div>
                  <h2 style={panelTitle}>근무 기록</h2>
                  <p style={softText}>선택 월 {scopedShifts.length}건 중 {tableShifts.length}건 표시</p>
                </div>
              </div>

              <form style={filterBar}>
                {managerView && (
                  <select name="assistantId" defaultValue={selectedAssistantId} style={input}>
                    <option value="all">전체 직원</option>
                    {assistants.map((assistant) => (
                      <option key={assistant.id} value={assistant.id}>{assistant.name}</option>
                    ))}
                  </select>
                )}
                <input type="hidden" name="month" value={month} />
                <input type="hidden" name="date" value={selectedDate} />
                <input name="q" defaultValue={query} placeholder="직원명 검색" style={{ ...input, minWidth: 180 }} />
                <select name="status" defaultValue={statusFilter} style={input}>
                  {shiftStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <input name="from" type="date" defaultValue={fromDate} min={start} max={end} style={input} />
                <input name="to" type="date" defaultValue={toDate} min={start} max={end} style={input} />
                <select name="confirmed" defaultValue={confirmedFilter} style={input}>
                  <option value="all">관리자 확인 전체</option>
                  <option value="confirmed">확인됨</option>
                  <option value="unconfirmed">미확인</option>
                </select>
                <button style={smallPrimaryButton}>필터 적용</button>
                <Link href={workHref({ assistantId: selectedAssistantId, month, date: selectedDate, managerView })} style={smallGhostLink}>초기화</Link>
              </form>

              <div style={tableWrap}>
                <table style={workTable}>
                  <thead>
                    <tr>
                      <th style={th}>날짜</th>
                      <th style={th}>직원명</th>
                      <th style={th}>출근 시간</th>
                      <th style={th}>퇴근 시간</th>
                      <th style={th}>총 근무 시간</th>
                      <th style={th}>상태</th>
                      <th style={th}>메모</th>
                      <th style={th}>수정 여부</th>
                      <th style={th}>관리자 확인</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableShifts.map((shift) => {
                      const settlement = settlements[payrollSettlementKey(shift.assistantId, shift.workDate.slice(0, 7))];
                      const detailHref = workHref({ assistantId: shift.assistantId, month, date: shift.workDate, shiftId: shift.id, managerView });
                      return (
                        <tr key={shift.id}>
                          <td style={td}><Link href={detailHref} style={tableLink}>{dateText(shift.workDate)}</Link></td>
                          <td style={td}>{shift.assistant.name}</td>
                          <td style={td}>{shift.startTime}</td>
                          <td style={td}>{shift.endTime}</td>
                          <td style={td}>{formatHours(shiftMinutes(shift))}</td>
                          <td style={td}><span style={statusBadge(shift.status)}>{shiftStatusText(shift.status)}</span></td>
                          <td style={{ ...td, ...memoCell }}>{shift.memo || "-"}</td>
                          <td style={td}>{isEditedShift(shift) ? <span style={warnPill}>수정됨</span> : <span style={mutedText}>없음</span>}</td>
                          <td style={td}><span style={payrollBadgeStyle(settlement)}>{payrollStatusText(settlement)}</span></td>
                        </tr>
                      );
                    })}
                    {tableShifts.length === 0 && (
                      <tr>
                        <td colSpan={9} style={emptyTd}>조건에 맞는 근무 기록이 없습니다.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {selectedAssistantId !== "all" && selectedAssistant ? (
              <section style={workBoard}>
                <div style={calendarPane}>
                  <section style={calendarPanel}>
                    <div style={sectionHead}>
                      <h2 style={panelTitle}>월간 캘린더</h2>
                      <Link href={workHref({ assistantId: selectedAssistantId, month: toYm(new Date()), date: toYmd(new Date()), managerView })} style={smallLink}>
                        오늘
                      </Link>
                    </div>
                    <SalaryMonthCalendar month={month} shifts={scopedShifts} selectedDate={selectedDate} assistantId={selectedAssistantId} managerView={managerView} />
                  </section>
                </div>
                <aside style={sideWorkPane}>
                  {managerView && <AssistantWorkNoteForm assistantId={selectedAssistantId} note={selectedAssistantNote} />}

                  <div style={panelHead}>
                    <div>
                      <h2 style={panelTitle}>{longDateText(selectedDate)}</h2>
                      <p style={softText}>
                        {selectedDateShifts.length > 0
                          ? `${formatHours(selectedSummary.minutes)} · ${formatWon(selectedSummary.pay)}원`
                          : "날짜를 눌러 근무를 저장합니다."}
                      </p>
                    </div>
                    <span style={payrollBadgeStyle(selectedSettlement)}>{selectedClosed ? "마감 월" : "수정 가능"}</span>
                  </div>

                  {selectedShift ? (
                    <section style={detailPane}>
                      <div style={detailTitleRow}>
                        <span style={statusBadge(selectedShift.status)}>{shiftStatusText(selectedShift.status)}</span>
                        <Link href={workHref({ assistantId: selectedAssistantId, month, date: selectedDate, managerView })} style={smallLink}>
                          새 근무
                        </Link>
                      </div>
                      <ShiftForm
                        key={selectedShift.id}
                        shift={selectedShift}
                        assistantId={selectedAssistantId}
                        isClosed={selectedClosed}
                      />
                      <form action={deleteWorkShiftAction} style={closedEditBox}>
                        <input type="hidden" name="shiftId" value={selectedShift.id} />
                        {selectedClosed && (
                          <label style={label}>마감 후 삭제 사유
                            <input name="editReason" required placeholder="삭제 사유를 입력해야 합니다." style={input} />
                          </label>
                        )}
                        <WorkConfirmSubmit message={`${selectedAssistant.name}의 ${selectedShift.workDate} 근무 기록을 삭제할까요?`} style={dangerButton}>
                          근무 기록 삭제
                        </WorkConfirmSubmit>
                      </form>
                    </section>
                  ) : (
                    <ShiftForm
                      key={`${selectedAssistantId}:${selectedDate}:new`}
                      assistantId={selectedAssistantId}
                      defaultDate={selectedDate}
                      isClosed={selectedClosed}
                    />
                  )}

                  <div style={dayShiftList}>
                    <h3 style={smallSectionTitle}>선택일 근무 내역</h3>
                    {selectedDateShifts.map((shift) => (
                      <div key={shift.id} style={dayShiftItem}>
                        <div style={dayShiftSummary}>
                          <span style={statusBadge(shift.status)}>{shiftStatusText(shift.status)}</span>
                          <b>{shift.startTime} ~ {shift.endTime}</b>
                          <span>{formatWon(shiftPay(shift))}원</span>
                        </div>
                        <Link href={workHref({ assistantId: selectedAssistantId, month, date: shift.workDate, shiftId: shift.id, managerView })} style={detailButton}>
                          상세
                        </Link>
                      </div>
                    ))}
                    {selectedDateShifts.length === 0 && <Empty>선택한 날짜에 등록된 근무가 없습니다.</Empty>}
                  </div>
                </aside>
              </section>
            ) : (
              <section style={calendarPanel}>
                <Empty>직원을 선택하면 월간 캘린더와 근무 등록 폼을 사용할 수 있습니다.</Empty>
              </section>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function AssistantLink({ href, active, name, loginId, meta }: { href: string; active: boolean; name: string; loginId?: string; meta: string }) {
  return (
    <Link href={href} style={active ? activeAssistantLink : assistantLink}>
      <b>{name}</b>
      <span>{[loginId, meta].filter(Boolean).join(" · ")}</span>
    </Link>
  );
}

function PayrollSettlementBox({
  managerView,
  assistantId,
  assistantName,
  month,
  summary,
  settlement,
}: {
  managerView: boolean;
  assistantId: string;
  assistantName?: string;
  month: string;
  summary: ReturnType<typeof summarizeShifts>;
  settlement?: PayrollSettlementRecord;
}) {
  if (assistantId === "all") {
    return <p style={settlementNotice}>전체 보기에서는 직원별 정산 상태를 확인합니다. 급여 확정은 왼쪽에서 직원을 선택한 뒤 진행합니다.</p>;
  }

  if (!managerView) {
    return <p style={settlementNotice}>정산 상태: {payrollStatusText(settlement)}. 급여 확정과 지급 처리는 관리자 화면에서 진행됩니다.</p>;
  }

  return (
    <form action={updatePayrollSettlementAction} style={settlementActionBox}>
      <input type="hidden" name="assistantId" value={assistantId} />
      <input type="hidden" name="month" value={month} />
      <div>
        <h3 style={smallSectionTitle}>{assistantName ?? "직원"} 월 정산 처리</h3>
        <p style={softText}>
          현재 계산값: {formatHours(summary.minutes)} · {formatWon(summary.pay)}원 · {summary.totalCount}건
          {settlement ? ` / 마지막 처리: ${settlement.updatedByName} · ${formatDateTime(settlement.updatedAt)}` : ""}
        </p>
      </div>
      <input name="settlementNote" defaultValue={settlement?.note ?? ""} placeholder="정산 메모 또는 마감 해제 사유" style={input} />
      <div style={settlementButtons}>
        <WorkConfirmSubmit
          name="settlementStatus"
          value="FINALIZED"
          message={`${assistantName ?? "직원"}의 ${monthTitleText(month)} 급여를 확정할까요?`}
          style={primaryButton}
        >
          급여 확정
        </WorkConfirmSubmit>
        <WorkConfirmSubmit
          name="settlementStatus"
          value="PAID"
          message={`${assistantName ?? "직원"}의 ${monthTitleText(month)} 급여를 지급 완료로 표시할까요?`}
          style={successButton}
        >
          지급 완료
        </WorkConfirmSubmit>
        {settlement && (
          <WorkConfirmSubmit
            name="settlementStatus"
            value="OPEN"
            message={`${assistantName ?? "직원"}의 ${monthTitleText(month)} 마감을 해제할까요?`}
            style={dangerButton}
          >
            마감 해제
          </WorkConfirmSubmit>
        )}
      </div>
    </form>
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
          const inMonth = date.startsWith(month);
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
                  <span key={shift.id} style={shiftChipStyle(shift.status)}>{shiftStatusText(shift.status)}</span>
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

function ShiftForm({ assistantId, defaultDate, shift, isClosed }: { assistantId: string; defaultDate?: string; shift?: ShiftRow; isClosed: boolean }) {
  return (
    <form action={saveWorkShiftAction} style={shiftForm}>
      {shift && <input type="hidden" name="shiftId" value={shift.id} />}
      <input type="hidden" name="assistantId" value={assistantId} />
      <label style={label}>근무일<input name="workDate" type="date" required defaultValue={shift?.workDate ?? defaultDate ?? ""} style={input} /></label>
      <label style={label}>출근 시간<input name="startTime" type="time" required defaultValue={shift?.startTime ?? "14:00"} style={input} /></label>
      <label style={label}>퇴근 시간<input name="endTime" type="time" required defaultValue={shift?.endTime ?? "18:00"} style={input} /></label>
      <label style={label}>휴게(분)<input name="breakMinutes" type="number" min={0} defaultValue={shift?.breakMinutes ?? 0} style={input} /></label>
      <label style={label}>시급<input name="hourlyWage" type="number" min={0} defaultValue={shift?.hourlyWage ?? 0} style={input} /></label>
      <label style={label}>상태
        <select name="status" defaultValue={shift?.status ?? "SCHEDULED"} style={input}>
          <option value="SCHEDULED">예정/미확정</option>
          <option value="WORKED">근무 완료</option>
          <option value="ABSENT">결근</option>
          <option value="CANCELLED">취소</option>
        </select>
      </label>
      <label style={{ ...label, gridColumn: "1 / -1" }}>메모
        <input name="memo" defaultValue={shift?.memo ?? ""} style={input} />
      </label>
      {isClosed && (
        <label style={{ ...label, gridColumn: "1 / -1" }}>확정 월 수정 사유
          <input name="editReason" required placeholder="이미 확정된 월입니다. 수정 사유를 입력해주세요." style={input} />
        </label>
      )}
      {isClosed ? (
        <WorkConfirmSubmit message="이미 확정된 월입니다. 사유를 남기고 수정할까요?" style={primaryButton}>
          {shift ? "사유 남기고 수정" : "사유 남기고 저장"}
        </WorkConfirmSubmit>
      ) : (
        <button style={primaryButton}>{shift ? "근무 수정" : "근무 저장"}</button>
      )}
    </form>
  );
}

function Summary({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warn" | "money" | "success" }) {
  return (
    <div style={{ ...summaryCard, ...(tone === "warn" ? warnCard : {}), ...(tone === "money" ? moneyCard : {}), ...(tone === "success" ? successCard : {}) }}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div style={empty}>{children}</div>;
}

function resolveSelectedAssistantId({
  managerView,
  requestedAssistantId,
  assistants,
  userId,
}: {
  managerView: boolean;
  requestedAssistantId?: string;
  assistants: AssistantOption[];
  userId: string;
}) {
  if (!managerView) return userId;
  if (!requestedAssistantId || requestedAssistantId === "all") return "all";
  return assistants.some((assistant) => assistant.id === requestedAssistantId) ? requestedAssistantId : "all";
}

function filterShifts(
  shifts: ShiftRow[],
  filters: {
    query: string;
    status: ShiftStatusFilter;
    from: string;
    to: string;
    confirmed: ConfirmedFilter;
    settlements: PayrollSettlements;
    month: string;
  }
) {
  const query = filters.query.toLowerCase();
  return shifts.filter((shift) => {
    if (query && !shift.assistant.name.toLowerCase().includes(query)) return false;
    if (filters.status !== "all" && shift.status !== filters.status) return false;
    if (filters.from && shift.workDate < filters.from) return false;
    if (filters.to && shift.workDate > filters.to) return false;
    const confirmed = isPayrollClosed(filters.settlements[payrollSettlementKey(shift.assistantId, filters.month)]);
    if (filters.confirmed === "confirmed" && !confirmed) return false;
    if (filters.confirmed === "unconfirmed" && confirmed) return false;
    return true;
  });
}

function monthValue(value?: string) {
  return value && /^\d{4}-\d{2}$/.test(value) ? value : "";
}

function dateValue(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function boundedDate(value: string | undefined, start: string, end: string) {
  const date = dateValue(value);
  return date && date >= start && date <= end ? date : "";
}

function shiftStatusValue(value?: string): ShiftStatusFilter {
  return shiftStatusOptions.some((option) => option.value === value) ? (value as ShiftStatusFilter) : "all";
}

function confirmedValue(value?: string): ConfirmedFilter {
  return value === "confirmed" || value === "unconfirmed" ? value : "all";
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

function monthNavigation(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const current = new Date(year, monthNumber - 1, 1);
  const previous = new Date(current);
  previous.setMonth(previous.getMonth() - 1);
  return {
    previous: toYm(previous),
    previousDate: monthRange(toYm(previous)).start,
  };
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

function workHref({
  assistantId,
  month,
  date,
  shiftId,
  managerView,
}: {
  assistantId: string;
  month: string;
  date: string;
  shiftId?: string;
  managerView: boolean;
}) {
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
      summary.totalCount += 1;
      if (shift.status === "SCHEDULED") summary.scheduledCount += 1;
      if (shift.status === "ABSENT" || shift.status === "CANCELLED") {
        summary.absentDays += 1;
      } else {
        summary.workDays += 1;
        summary.minutes += shiftMinutes(shift);
        summary.pay += shiftPay(shift);
      }
      if (isEditedShift(shift)) summary.revisionCount += 1;
      if (shift.memo && /수정|요청|확인|조정/.test(shift.memo)) summary.requestCount += 1;
      return summary;
    },
    { minutes: 0, pay: 0, workDays: 0, absentDays: 0, scheduledCount: 0, revisionCount: 0, requestCount: 0, totalCount: 0 }
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

function isEditedShift(shift: Pick<AssistantWorkShift, "createdAt" | "updatedAt">) {
  return new Date(shift.updatedAt).getTime() - new Date(shift.createdAt).getTime() > 60_000;
}

function payrollScopeStatus(assistantId: string, shifts: ShiftRow[], settlements: PayrollSettlements, month: string) {
  if (assistantId !== "all") return payrollStatusText(settlements[payrollSettlementKey(assistantId, month)]);
  const assistantIds = [...new Set(shifts.map((shift) => shift.assistantId))];
  if (assistantIds.length === 0) return "정산 대상 없음";
  const paid = assistantIds.filter((id) => settlements[payrollSettlementKey(id, month)]?.status === "PAID").length;
  const closed = assistantIds.filter((id) => isPayrollClosed(settlements[payrollSettlementKey(id, month)])).length;
  if (paid === assistantIds.length) return "전체 지급 완료";
  if (closed === assistantIds.length) return "전체 확정됨";
  return `확정 ${closed}/${assistantIds.length}명 · 지급 ${paid}/${assistantIds.length}명`;
}

function payrollStatusText(settlement?: PayrollSettlementRecord) {
  if (settlement?.status === "PAID") return "지급 완료";
  if (settlement?.status === "FINALIZED") return "확정됨";
  return "미확정";
}

function shiftStatusText(status: string) {
  if (status === "WORKED") return "근무 완료";
  if (status === "ABSENT") return "결근";
  if (status === "CANCELLED") return "취소";
  return "예정";
}

function monthTitleText(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${year}년 ${monthNumber}월`;
}

function longDateText(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date(year, month - 1, day));
}

function dateText(date: string) {
  const [, month, day] = date.split("-");
  return `${Number(month)}월 ${Number(day)}일`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatWon(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
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

function statusBadge(status: string): CSSProperties {
  if (status === "WORKED") return successBadge;
  if (status === "ABSENT") return dangerBadge;
  if (status === "CANCELLED") return mutedBadge;
  return infoBadge;
}

function payrollBadgeStyle(settlement?: PayrollSettlementRecord): CSSProperties {
  if (settlement?.status === "PAID") return successBadge;
  if (settlement?.status === "FINALIZED") return closeBadge;
  return warnBadge;
}

function shiftChipStyle(status: string): CSSProperties {
  if (status === "ABSENT") return absentChip;
  if (status === "CANCELLED") return cancelledChip;
  return shiftChip;
}

const page: CSSProperties = { padding: 12, color: "var(--asc-text)", background: "var(--asc-bg-subtle)", minHeight: "100vh" };
const container: CSSProperties = { width: "100%", maxWidth: "none", margin: 0, display: "grid", gap: 10 };
const header: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 10, background: "var(--asc-surface)", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 12, flexWrap: "wrap" };
const eyebrow: CSSProperties = { margin: "0 0 4px", color: "var(--asc-primary)", fontWeight: 950, fontSize: 12 };
const title: CSSProperties = { margin: 0, fontSize: 23, fontWeight: 950, color: "var(--asc-text)" };
const desc: CSSProperties = { margin: "4px 0 0", color: "var(--asc-text-muted)", fontSize: 13 };
const monthTools: CSSProperties = { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" };
const monthForm: CSSProperties = { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" };
const layout = (managerView: boolean): CSSProperties => ({ display: "grid", gridTemplateColumns: managerView ? "244px minmax(0, 1fr)" : "1fr", gap: 10, alignItems: "start" });
const assistantPanel: CSSProperties = { background: "var(--asc-surface)", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 10, position: "sticky", top: 10 };
const assistantList: CSSProperties = { display: "grid", gap: 6 };
const assistantLink: CSSProperties = { display: "grid", gap: 3, border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-md)", padding: 8, color: "var(--asc-text)", textDecoration: "none", background: "var(--asc-bg)" };
const activeAssistantLink: CSSProperties = { ...assistantLink, border: "1px solid var(--asc-primary)", background: "var(--asc-primary-soft)" };
const mainColumn: CSSProperties = { display: "grid", gap: 10, minWidth: 0 };
const settlementPanel: CSSProperties = { background: "var(--asc-surface)", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 10, display: "grid", gap: 9 };
const tablePanel: CSSProperties = { background: "var(--asc-surface)", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 10, display: "grid", gap: 9 };
const calendarPanel: CSSProperties = { background: "var(--asc-surface)", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 10, display: "grid", gap: 9 };
const salaryTop: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "end", flexWrap: "wrap" };
const monthTitle: CSSProperties = { margin: "4px 0 0", fontSize: 22, fontWeight: 950 };
const payTotalBox: CSSProperties = { display: "grid", justifyItems: "end", gap: 3 };
const summaryGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 7 };
const summaryCard: CSSProperties = { border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 9, display: "grid", gap: 4, background: "var(--asc-bg)" };
const moneyCard: CSSProperties = { border: "1px solid var(--asc-success)", background: "var(--asc-success-soft)" };
const warnCard: CSSProperties = { border: "1px solid var(--asc-warning)", background: "var(--asc-warning-soft)" };
const successCard: CSSProperties = { border: "1px solid var(--asc-success)", background: "var(--asc-success-soft)" };
const settlementNotice: CSSProperties = { margin: 0, border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 10, background: "var(--asc-bg-subtle)", color: "var(--asc-text-subtle)", fontSize: 13, fontWeight: 800 };
const settlementActionBox: CSSProperties = { border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 9, background: "var(--asc-bg-subtle)", display: "grid", gap: 7 };
const settlementButtons: CSSProperties = { display: "flex", gap: 6, flexWrap: "wrap" };
const sectionHead: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 7, flexWrap: "wrap" };
const filterBar: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, auto))", gap: 6, alignItems: "center" };
const tableWrap: CSSProperties = { overflow: "auto", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)" };
const workTable: CSSProperties = { width: "100%", minWidth: 980, borderCollapse: "collapse", fontSize: 13 };
const th: CSSProperties = { position: "sticky", top: 0, padding: "8px 9px", borderBottom: "1px solid var(--asc-border)", background: "var(--asc-bg-subtle)", textAlign: "left", color: "var(--asc-text-subtle)", fontSize: 12, fontWeight: 950, whiteSpace: "nowrap" };
const td: CSSProperties = { padding: "8px 9px", borderBottom: "1px solid var(--asc-border)", verticalAlign: "middle", whiteSpace: "nowrap" };
const emptyTd: CSSProperties = { ...td, textAlign: "center", color: "var(--asc-text-muted)", padding: 16 };
const tableLink: CSSProperties = { color: "var(--asc-primary-hover)", fontWeight: 900, textDecoration: "none" };
const memoCell: CSSProperties = { maxWidth: 260, whiteSpace: "normal", lineHeight: 1.45 };
const mutedText: CSSProperties = { color: "var(--asc-text-muted)", fontWeight: 800 };
const warnPill: CSSProperties = { display: "inline-flex", borderRadius: 999, padding: "3px 7px", background: "var(--asc-warning-soft)", color: "var(--asc-warning-text)", fontSize: 12, fontWeight: 900 };
const calendarWrap: CSSProperties = { display: "grid", gap: 0, border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", overflow: "hidden" };
const weekdayRow: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(7, minmax(74px, 1fr))", background: "var(--asc-bg-subtle)", borderBottom: "1px solid var(--asc-border)", textAlign: "center", fontWeight: 950, color: "var(--asc-text-muted)", fontSize: 12 };
const calendarGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(7, minmax(74px, 1fr))" };
const calendarDay: CSSProperties = { minHeight: 76, borderRight: "1px solid var(--asc-border)", borderBottom: "1px solid var(--asc-border)", padding: 5, display: "grid", gridTemplateRows: "auto 1fr auto", gap: 3, color: "var(--asc-text)", textDecoration: "none", background: "var(--asc-bg)" };
const calendarDayMuted: CSSProperties = { background: "var(--asc-bg-subtle)", color: "var(--asc-text-muted)" };
const calendarDaySelected: CSSProperties = { background: "var(--asc-primary-soft)", boxShadow: "inset 0 0 0 2px var(--asc-primary)" };
const calendarDayToday: CSSProperties = { boxShadow: "inset 0 0 0 2px var(--asc-border-strong)" };
const dayNumberLine: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 15 };
const shiftChipStack: CSSProperties = { display: "grid", gap: 3, alignContent: "start", minWidth: 0 };
const shiftChip: CSSProperties = { display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", borderRadius: 5, padding: "3px 5px", background: "#4f7de8", color: "#fff", fontSize: 11, fontWeight: 900 };
const absentChip: CSSProperties = { ...shiftChip, background: "#ef4444" };
const cancelledChip: CSSProperties = { ...shiftChip, background: "#94a3b8" };
const moreChip: CSSProperties = { color: "#6b7280", fontSize: 13, fontWeight: 950, textAlign: "center" };
const dayPayText: CSSProperties = { color: "#6b7280", textAlign: "right", fontSize: 12, fontWeight: 950 };
const sundayText: CSSProperties = { color: "#ef4444" };
const saturdayText: CSSProperties = { color: "#38bdf8" };
const workBoard: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(320px, 1fr)", gap: 10, alignItems: "start" };
const calendarPane: CSSProperties = { minWidth: 0 };
const sideWorkPane: CSSProperties = { border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 10, background: "var(--asc-bg-subtle)", display: "grid", gap: 9, alignContent: "start" };
const panelHead: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 7, marginBottom: 7 };
const panelTitle: CSSProperties = { margin: 0, fontSize: 16, fontWeight: 950 };
const softText: CSSProperties = { color: "var(--asc-text-muted)", fontSize: 12, fontWeight: 900, margin: "3px 0 0" };
const smallLink: CSSProperties = { color: "var(--asc-primary-hover)", fontWeight: 950, textDecoration: "none", fontSize: 12 };
const assistantMemoBox: CSSProperties = { border: "1px solid var(--asc-primary)", borderRadius: "var(--asc-radius-lg)", padding: 9, background: "var(--asc-primary-soft)", display: "grid", gap: 8 };
const assistantMemoForm: CSSProperties = { display: "grid", gap: 6 };
const memoTextarea: CSSProperties = { width: "100%", resize: "vertical", minHeight: 72, border: "1px solid var(--asc-border-strong)", borderRadius: "var(--asc-radius-lg)", padding: 8, background: "var(--asc-bg)", color: "var(--asc-text)", lineHeight: 1.45 };
const memoActionRow: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, flexWrap: "wrap" };
const memoMeta: CSSProperties = { color: "var(--asc-text-muted)", fontSize: 12, fontWeight: 800 };
const dayShiftList: CSSProperties = { display: "grid", gap: 6, marginTop: 8 };
const dayShiftItem: CSSProperties = { border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 7, background: "var(--asc-bg)", display: "grid", gap: 6 };
const dayShiftSummary: CSSProperties = { display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 6, alignItems: "center" };
const smallSectionTitle: CSSProperties = { margin: 0, fontSize: 14, fontWeight: 950 };
const detailPane: CSSProperties = { display: "grid", gap: 8, border: "1px solid var(--asc-primary)", background: "var(--asc-primary-soft)", borderRadius: "var(--asc-radius-lg)", padding: 9 };
const detailTitleRow: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 };
const detailButton: CSSProperties = { height: 30, display: "inline-grid", placeItems: "center", border: "1px solid var(--asc-border-strong)", borderRadius: "var(--asc-radius-md)", background: "var(--asc-bg)", color: "var(--asc-text)", textDecoration: "none", fontSize: 12, fontWeight: 950 };
const shiftForm: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, alignItems: "end" };
const closedEditBox: CSSProperties = { display: "grid", gap: 6 };
const label: CSSProperties = { display: "grid", gap: 5, fontSize: 13, fontWeight: 900 };
const input: CSSProperties = { width: "100%", height: 36, border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: "0 9px", background: "var(--asc-bg)", color: "var(--asc-text)", boxSizing: "border-box" };
const primaryButton: CSSProperties = { height: 36, border: "1px solid var(--asc-primary)", borderRadius: "var(--asc-radius-lg)", background: "var(--asc-primary)", color: "#fff", padding: "0 12px", fontWeight: 950 };
const smallPrimaryButton: CSSProperties = { height: 36, border: "1px solid var(--asc-primary)", borderRadius: "var(--asc-radius-md)", background: "var(--asc-primary)", color: "#fff", padding: "0 10px", fontSize: 12, fontWeight: 950 };
const smallGhost: CSSProperties = { ...primaryButton, background: "var(--asc-bg)", color: "var(--asc-text)", border: "1px solid var(--asc-border-strong)" };
const smallGhostLink: CSSProperties = { height: 36, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--asc-border-strong)", borderRadius: "var(--asc-radius-lg)", background: "var(--asc-bg)", color: "var(--asc-text)", padding: "0 10px", textDecoration: "none", fontSize: 12, fontWeight: 950, whiteSpace: "nowrap" };
const dangerButton: CSSProperties = { ...primaryButton, background: "var(--asc-danger)", border: "1px solid var(--asc-danger)" };
const successButton: CSSProperties = { ...primaryButton, background: "var(--asc-success)", border: "1px solid var(--asc-success)" };
const badge: CSSProperties = { display: "inline-flex", alignItems: "center", height: 24, borderRadius: 999, background: "var(--asc-bg-subtle)", color: "var(--asc-text-subtle)", padding: "0 8px", fontSize: 12, fontWeight: 950, whiteSpace: "nowrap" };
const infoBadge: CSSProperties = { ...badge, background: "var(--asc-info-soft)", color: "var(--asc-info)" };
const successBadge: CSSProperties = { ...badge, background: "var(--asc-success-soft)", color: "var(--asc-success)" };
const dangerBadge: CSSProperties = { ...badge, background: "var(--asc-danger-soft)", color: "var(--asc-danger)" };
const warnBadge: CSSProperties = { ...badge, background: "var(--asc-warning-soft)", color: "var(--asc-warning-text)" };
const closeBadge: CSSProperties = { ...badge, background: "var(--asc-primary-soft)", color: "var(--asc-primary-hover)" };
const mutedBadge: CSSProperties = { ...badge, background: "var(--asc-bg-subtle)", color: "var(--asc-text-muted)" };
const empty: CSSProperties = { border: "1px dashed var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 12, textAlign: "center", color: "var(--asc-text-muted)", fontWeight: 900 };
