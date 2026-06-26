"use client";

import { useMemo, useRef, useState, type CSSProperties } from "react";
import { sendMessageJobAction } from "@/app/messages/actions";
import MessagePreviewList from "@/components/messages/MessagePreviewList";
import { buildMessageRecipients, type MessageStudent } from "@/lib/sms/recipients";
import { messageCategories, messageTargetTypes, type MessageTargetType, type SmsProviderStatus } from "@/lib/sms/types";

export type MessageClassGroupOption = {
  id: string;
  name: string;
};

export type MessageStudentOption = {
  id: string;
  name: string;
  phone: string;
  parentPhone: string;
  classGroupIds: string[];
  classGroupNames: string[];
};

export type MessageTemplateOption = {
  id: string;
  name: string;
  category: string;
  targetType: string;
  body: string;
  isActive: boolean;
};

type Props = {
  academyName: string;
  classGroups: MessageClassGroupOption[];
  students: MessageStudentOption[];
  templates: MessageTemplateOption[];
  settings: SmsProviderStatus;
  canCompose: boolean;
  canSendActual: boolean;
};

const fallbackBody = "[ASC학원]\n{{studentName}} 학생 보호자님, {{className}} 운영 알림입니다.";

export default function MessageComposer({
  academyName,
  classGroups,
  students,
  templates,
  settings,
  canCompose,
  canSendActual,
}: Props) {
  const firstTemplate = templates.find((template) => template.isActive) ?? templates[0] ?? null;
  const [classGroupId, setClassGroupId] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState(firstTemplate?.id ?? "");
  const [targetType, setTargetType] = useState<MessageTargetType>((firstTemplate?.targetType as MessageTargetType) || "GUARDIAN");
  const [title, setTitle] = useState(firstTemplate?.name ?? "운영 알림 문자");
  const [body, setBody] = useState(firstTemplate?.body ?? fallbackBody);
  const [lessonDate, setLessonDate] = useState("");
  const [attendanceStatus, setAttendanceStatus] = useState("");
  const [assignmentName, setAssignmentName] = useState("");
  const [examName, setExamName] = useState("");
  const [reportName, setReportName] = useState("");
  const [manualClassName, setManualClassName] = useState("");
  const [sendMode, setSendMode] = useState<"dry-run" | "actual">("dry-run");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  const selectedClassGroup = classGroups.find((classGroup) => classGroup.id === classGroupId) ?? null;
  const effectiveClassName = selectedClassGroup?.name ?? manualClassName;

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return students.filter((student) => {
      const matchesClass = classGroupId === "all" || student.classGroupIds.includes(classGroupId);
      const searchable = `${student.name} ${student.phone} ${student.parentPhone} ${student.classGroupNames.join(" ")}`.toLowerCase();
      return matchesClass && (!query || searchable.includes(query));
    });
  }, [classGroupId, search, students]);

  const selectedStudents = useMemo(() => {
    const selected = new Set(selectedStudentIds);
    return students.filter((student) => selected.has(student.id));
  }, [selectedStudentIds, students]);

  const previewStudents = useMemo<MessageStudent[]>(
    () =>
      selectedStudents.map((student) => ({
        id: student.id,
        name: student.name,
        phone: student.phone,
        parentPhone: student.parentPhone,
        className: effectiveClassName || student.classGroupNames.join(", "),
      })),
    [effectiveClassName, selectedStudents],
  );

  const preview = useMemo(
    () =>
      buildMessageRecipients({
        students: previewStudents,
        targetType,
        body,
        context: {
          className: effectiveClassName,
          lessonDate,
          attendanceStatus,
          assignmentName,
          examName,
          reportName,
          academyName,
        },
      }),
    [academyName, assignmentName, attendanceStatus, body, effectiveClassName, examName, lessonDate, previewStudents, reportName, targetType],
  );

  const allFilteredSelected = filteredStudents.length > 0 && filteredStudents.every((student) => selectedStudentIds.includes(student.id));
  const canRequestActual = canSendActual && settings.canSendActual && !settings.dryRun;
  const studentCount = preview.recipients.filter((recipient) => recipient.recipientType === "STUDENT").length;
  const guardianCount = preview.recipients.filter((recipient) => recipient.recipientType === "GUARDIAN").length;

  const selectTemplate = (id: string) => {
    setTemplateId(id);
    const template = templates.find((item) => item.id === id);
    if (!template) return;
    setTitle(template.name);
    setTargetType((template.targetType as MessageTargetType) || "GUARDIAN");
    setBody(template.body);
  };

  const toggleStudent = (studentId: string) => {
    setSelectedStudentIds((current) =>
      current.includes(studentId) ? current.filter((id) => id !== studentId) : [...current, studentId],
    );
  };

  const toggleFilteredStudents = () => {
    const filteredIds = filteredStudents.map((student) => student.id);
    setSelectedStudentIds((current) => {
      const currentSet = new Set(current);
      if (allFilteredSelected) {
        return current.filter((id) => !filteredIds.includes(id));
      }
      for (const id of filteredIds) currentSet.add(id);
      return [...currentSet];
    });
  };

  const openConfirm = (mode: "dry-run" | "actual") => {
    setSendMode(mode);
    setConfirmOpen(true);
  };

  if (!canCompose) {
    return (
      <section style={panel}>
        <h2 style={panelTitle}>문자 작성</h2>
        <div style={permissionBox}>현재 계정은 문자 작성 권한이 없습니다. 발송 기록과 설정 상태만 확인할 수 있습니다.</div>
      </section>
    );
  }

  return (
    <section style={panel}>
      <div style={panelHead}>
        <div>
          <h2 style={panelTitle}>문자 작성</h2>
          <p style={panelDesc}>운영 알림 전용 발송입니다. 광고성 문자는 비활성화되어 있습니다.</p>
        </div>
        <span style={settings.dryRun ? dryRunBadge : actualBadge}>
          {settings.dryRun ? "dry-run 테스트 모드" : settings.canSendActual ? "실제 발송 가능" : "실제 발송 차단"}
        </span>
      </div>

      <form ref={formRef} action={sendMessageJobAction} style={layout}>
        <input type="hidden" name="studentIds" value={JSON.stringify(selectedStudentIds)} />
        <input type="hidden" name="sendMode" value={sendMode} />
        <input type="hidden" name="className" value={effectiveClassName} />

        <div style={leftColumn}>
          <section style={section}>
            <div style={sectionHead}>
              <h3 style={sectionTitle}>대상 선택</h3>
              <button type="button" style={smallButton} onClick={toggleFilteredStudents}>
                {allFilteredSelected ? "선택 해제" : "필터 대상 선택"}
              </button>
            </div>
            <div style={fieldGrid}>
              <label style={field}>
                <span>반 선택</span>
                <select value={classGroupId} onChange={(event) => setClassGroupId(event.target.value)} style={input}>
                  <option value="all">전체 반</option>
                  {classGroups.map((classGroup) => (
                    <option key={classGroup.id} value={classGroup.id}>{classGroup.name}</option>
                  ))}
                </select>
              </label>
              <label style={field}>
                <span>학생 검색</span>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="이름, 전화번호, 반" style={input} />
              </label>
            </div>

            {!selectedClassGroup && (
              <label style={field}>
                <span>className 변수</span>
                <input value={manualClassName} onChange={(event) => setManualClassName(event.target.value)} placeholder="예: 중2 수학 A반" style={input} />
              </label>
            )}

            <div style={studentList}>
              {filteredStudents.slice(0, 240).map((student) => {
                const selected = selectedStudentIds.includes(student.id);
                return (
                  <label key={student.id} style={{ ...studentRow, ...(selected ? selectedStudentRow : {}) }}>
                    <input type="checkbox" checked={selected} onChange={() => toggleStudent(student.id)} />
                    <span style={studentMain}>
                      <b>{student.name}</b>
                      <small>{student.classGroupNames.join(", ") || "반 미지정"}</small>
                    </span>
                    <span style={phoneMeta}>{student.phone || "학생 번호 없음"}</span>
                    <span style={phoneMeta}>{student.parentPhone || "보호자 번호 없음"}</span>
                  </label>
                );
              })}
              {filteredStudents.length === 0 && <div style={emptyBox}>조건에 맞는 학생이 없습니다.</div>}
            </div>
          </section>
        </div>

        <div style={rightColumn}>
          <section style={section}>
            <h3 style={sectionTitle}>메시지</h3>
            <div style={fieldGrid}>
              <label style={field}>
                <span>템플릿</span>
                <select name="templateId" value={templateId} onChange={(event) => selectTemplate(event.target.value)} style={input}>
                  <option value="">직접 작성</option>
                  {templates.filter((template) => template.isActive).map((template) => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </select>
              </label>
              <label style={field}>
                <span>발송 제목</span>
                <input name="title" value={title} onChange={(event) => setTitle(event.target.value)} style={input} />
              </label>
            </div>

            <div style={targetRow}>
              {messageTargetTypes.map((target) => (
                <label key={target.value} style={{ ...targetOption, ...(targetType === target.value ? targetOptionActive : {}) }}>
                  <input
                    type="radio"
                    name="targetType"
                    value={target.value}
                    checked={targetType === target.value}
                    onChange={() => setTargetType(target.value)}
                  />
                  {target.label}
                </label>
              ))}
            </div>

            <textarea name="body" value={body} onChange={(event) => setBody(event.target.value)} rows={7} style={textarea} />

            <div style={contextGrid}>
              <input name="lessonDate" value={lessonDate} onChange={(event) => setLessonDate(event.target.value)} placeholder="lessonDate" style={input} />
              <input name="attendanceStatus" value={attendanceStatus} onChange={(event) => setAttendanceStatus(event.target.value)} placeholder="attendanceStatus" style={input} />
              <input name="assignmentName" value={assignmentName} onChange={(event) => setAssignmentName(event.target.value)} placeholder="assignmentName" style={input} />
              <input name="examName" value={examName} onChange={(event) => setExamName(event.target.value)} placeholder="examName" style={input} />
              <input name="reportName" value={reportName} onChange={(event) => setReportName(event.target.value)} placeholder="reportName" style={input} />
            </div>

            <div style={actionRow}>
              <button type="button" style={testButton} disabled={preview.recipients.length === 0} onClick={() => openConfirm("dry-run")}>
                테스트 실행
              </button>
              <button type="button" style={sendButton} disabled={preview.recipients.length === 0 || !canRequestActual} onClick={() => openConfirm("actual")}>
                문자 발송
              </button>
              {!canRequestActual && <span style={disabledReason}>{settings.reason ?? "실제 발송 권한 또는 설정을 확인해야 합니다."}</span>}
            </div>
          </section>

          <MessagePreviewList preview={preview} />
        </div>
      </form>

      {confirmOpen && (
        <div style={modalBackdrop} role="presentation">
          <div style={modal} role="dialog" aria-modal="true" aria-label="문자 발송 확인">
            <h3 style={modalTitle}>{sendMode === "actual" ? "문자 발송 확인" : "테스트 실행 확인"}</h3>
            <div style={modalStats}>
              <Summary label="발송 대상" value={`${preview.recipients.length}명`} />
              <Summary label="학생" value={`${studentCount}명`} />
              <Summary label="보호자" value={`${guardianCount}명`} />
              <Summary label="제외" value={`${preview.skipped.length}건`} />
              <Summary label="중복 제거" value={`${preview.duplicateCount}건`} />
              <Summary label="dry-run" value={sendMode === "actual" ? "아니오" : "예"} />
            </div>
            <p style={modalCopy}>
              {sendMode === "actual"
                ? `${preview.recipients.length}명에게 문자를 발송합니다.`
                : "현재 dry-run 모드로 실제 문자는 발송되지 않고 로그만 저장됩니다."}
            </p>
            {preview.skipped.length > 0 && <p style={modalWarning}>전화번호가 없거나 중복/수신 제한된 {preview.skipped.length}건은 제외됩니다.</p>}
            <div style={modalPreview}>{preview.recipients[0]?.messageText ?? body}</div>
            <div style={modalActions}>
              <button type="button" style={cancelButton} onClick={() => setConfirmOpen(false)}>취소</button>
              <button
                type="button"
                style={sendMode === "actual" ? confirmSendButton : confirmTestButton}
                onClick={() => {
                  setConfirmOpen(false);
                  window.setTimeout(() => formRef.current?.requestSubmit(), 0);
                }}
              >
                {sendMode === "actual" ? "문자 발송" : "테스트 실행"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div style={modalStat}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

export function categoryLabel(value: string) {
  return messageCategories.find((category) => category.value === value)?.label ?? value;
}

const panel: CSSProperties = { display: "grid", gap: 10 };
const panelHead: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 };
const panelTitle: CSSProperties = { margin: 0, fontSize: 18, fontWeight: 950 };
const panelDesc: CSSProperties = { margin: "4px 0 0", color: "var(--asc-text-muted)", fontSize: 13 };
const dryRunBadge: CSSProperties = { border: "1px solid #93c5fd", borderRadius: 999, background: "var(--asc-info-soft)", color: "var(--asc-info)", padding: "7px 10px", fontWeight: 950, whiteSpace: "nowrap" };
const actualBadge: CSSProperties = { ...dryRunBadge, borderColor: "#86efac", background: "var(--asc-success-soft)", color: "var(--asc-success)" };
const layout: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(360px, 0.9fr) minmax(520px, 1.25fr)", gap: 10, alignItems: "start" };
const leftColumn: CSSProperties = { minWidth: 0 };
const rightColumn: CSSProperties = { minWidth: 0, display: "grid", gap: 10 };
const section: CSSProperties = { border: "1px solid var(--asc-border)", borderRadius: 8, background: "var(--asc-surface)", padding: 10, display: "grid", gap: 9 };
const sectionHead: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 };
const sectionTitle: CSSProperties = { margin: 0, fontSize: 16, fontWeight: 950 };
const fieldGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 };
const field: CSSProperties = { display: "grid", gap: 5, color: "var(--asc-text-subtle)", fontSize: 12, fontWeight: 900 };
const input: CSSProperties = { width: "100%", height: 36, border: "1px solid var(--asc-border)", borderRadius: 8, padding: "0 10px", color: "var(--asc-text)", background: "#fff" };
const textarea: CSSProperties = { ...input, height: "auto", minHeight: 118, resize: "vertical", padding: 9, lineHeight: 1.45 };
const smallButton: CSSProperties = { height: 30, border: "1px solid var(--asc-border)", borderRadius: 8, background: "#fff", color: "var(--asc-text)", padding: "0 10px", fontWeight: 900 };
const studentList: CSSProperties = { display: "grid", gap: 5, maxHeight: 430, overflowY: "auto", paddingRight: 2 };
const studentRow: CSSProperties = { display: "grid", gridTemplateColumns: "22px minmax(120px, 1fr) minmax(116px, .7fr) minmax(128px, .8fr)", alignItems: "center", gap: 7, border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", padding: "7px 8px", cursor: "pointer" };
const selectedStudentRow: CSSProperties = { borderColor: "#93c5fd", background: "var(--asc-primary-soft)" };
const studentMain: CSSProperties = { display: "grid", minWidth: 0 };
const phoneMeta: CSSProperties = { color: "var(--asc-text-muted)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const emptyBox: CSSProperties = { border: "1px dashed var(--asc-border)", borderRadius: 8, padding: 12, color: "var(--asc-text-muted)", textAlign: "center", fontWeight: 900 };
const targetRow: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap" };
const targetOption: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--asc-border)", borderRadius: 999, background: "#fff", padding: "7px 10px", fontWeight: 900, cursor: "pointer" };
const targetOptionActive: CSSProperties = { borderColor: "#93c5fd", background: "var(--asc-primary-soft)", color: "var(--asc-primary)" };
const contextGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 6 };
const actionRow: CSSProperties = { display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" };
const testButton: CSSProperties = { height: 38, border: "1px solid var(--asc-primary)", borderRadius: 8, background: "var(--asc-primary)", color: "#fff", padding: "0 14px", fontWeight: 950 };
const sendButton: CSSProperties = { ...testButton, borderColor: "#0f766e", background: "#0f766e" };
const disabledReason: CSSProperties = { color: "var(--asc-text-muted)", fontSize: 12, fontWeight: 800 };
const permissionBox: CSSProperties = { border: "1px solid var(--asc-border)", borderRadius: 8, background: "var(--asc-bg-subtle)", padding: 12, color: "var(--asc-text-muted)", fontWeight: 900 };
const modalBackdrop: CSSProperties = { position: "fixed", inset: 0, zIndex: 120, background: "rgba(15,23,42,.46)", display: "grid", placeItems: "center", padding: 18 };
const modal: CSSProperties = { width: "min(620px, calc(100vw - 36px))", border: "1px solid var(--asc-border)", borderRadius: 8, background: "#fff", boxShadow: "var(--asc-shadow-modal)", padding: 14, display: "grid", gap: 9 };
const modalTitle: CSSProperties = { margin: 0, fontSize: 18, fontWeight: 950 };
const modalStats: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 };
const modalStat: CSSProperties = { border: "1px solid var(--asc-border)", borderRadius: 8, background: "var(--asc-bg-subtle)", padding: 9, display: "grid", gap: 3, fontSize: 12, color: "var(--asc-text-muted)", fontWeight: 850 };
const modalCopy: CSSProperties = { margin: 0, color: "var(--asc-text)", fontWeight: 900 };
const modalWarning: CSSProperties = { margin: 0, border: "1px solid #ffd166", borderRadius: 8, background: "var(--asc-warning-soft)", color: "var(--asc-warning-text)", padding: 10, fontWeight: 900 };
const modalPreview: CSSProperties = { maxHeight: 140, overflowY: "auto", border: "1px solid var(--asc-border)", borderRadius: 8, background: "#f8fafc", padding: 10, whiteSpace: "pre-wrap", color: "var(--asc-text-subtle)" };
const modalActions: CSSProperties = { display: "flex", justifyContent: "flex-end", gap: 8 };
const cancelButton: CSSProperties = { height: 36, border: "1px solid var(--asc-border)", borderRadius: 8, background: "#fff", color: "var(--asc-text)", padding: "0 13px", fontWeight: 950 };
const confirmTestButton: CSSProperties = { ...cancelButton, borderColor: "var(--asc-primary)", background: "var(--asc-primary)", color: "#fff" };
const confirmSendButton: CSSProperties = { ...cancelButton, borderColor: "#0f766e", background: "#0f766e", color: "#fff" };
