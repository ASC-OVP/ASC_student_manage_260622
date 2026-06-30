import Link from "next/link";
import type { CSSProperties } from "react";
import { createMessageTemplateAction, deleteMessageTemplateAction, updateMessageTemplateAction } from "@/features/messages/actions/messageActions";
import { renderMessageTemplate } from "@/lib/sms/renderTemplate";
import { messageCategories, messageTargetTypes } from "@/lib/sms/types";

export type MessageTemplateRow = {
  id: string;
  name: string;
  category: string;
  targetType: string;
  title?: string | null;
  body: string;
  isMarketing?: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type Props = {
  templates: MessageTemplateRow[];
  selectedCategory?: string;
  canManage: boolean;
  academyName: string;
};

const sampleContext = {
  studentName: "김하늘",
  className: "중2 수학 A반",
  lessonDate: "2026-06-26",
  attendanceStatus: "출석",
  assignmentName: "오답 노트",
  examName: "6월 정기 테스트",
  reportName: "주간 학습 리포트",
  academyName: "",
  academyPhone: "",
};

export default function MessageTemplateManager({ templates, selectedCategory = "all", canManage, academyName }: Props) {
  const visibleTemplates = selectedCategory === "all" ? templates : templates.filter((template) => template.category === selectedCategory);

  return (
    <section style={wrap}>
      <div style={head}>
        <div>
          <h2 style={title}>템플릿</h2>
          <p style={desc}>운영 문자와 광고성 문자 템플릿을 분리해서 관리합니다.</p>
        </div>
      </div>

      <div style={filterRow}>
        <Link href="/messages?tab=templates&category=all" style={filterLink(selectedCategory === "all")}>전체</Link>
        {messageCategories.map((category) => (
          <Link key={category.value} href={`/messages?tab=templates&category=${category.value}`} style={filterLink(selectedCategory === category.value)}>
            {category.label}
          </Link>
        ))}
      </div>

      {canManage && (
        <section style={panel}>
          <h3 style={sectionTitle}>템플릿 생성</h3>
          <form action={createMessageTemplateAction} style={formGrid}>
            <input name="name" placeholder="템플릿명" required style={input} />
            <input name="title" placeholder="발송 제목" style={input} />
            <select name="category" defaultValue="ATTENDANCE" style={input}>
              {messageCategories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
            </select>
            <select name="targetType" defaultValue="GUARDIAN" style={input}>
              {messageTargetTypes.map((targetType) => <option key={targetType.value} value={targetType.value}>{targetType.label}</option>)}
            </select>
            <label style={checkLabel}>
              <input type="checkbox" name="isActive" defaultChecked />
              사용
            </label>
            <label style={checkLabel}>
              <input type="checkbox" name="isMarketing" />
              광고
            </label>
            <textarea name="body" required rows={4} placeholder="[ASC학원]\n{{studentName}} 학생 보호자님, ..." style={textarea} />
            <button style={primaryButton}>생성</button>
          </form>
        </section>
      )}

      <section style={panel}>
        <h3 style={sectionTitle}>템플릿 목록</h3>
        <div style={list}>
          {visibleTemplates.map((template) => {
            const preview = renderMessageTemplate(template.body, { ...sampleContext, academyName });
            return (
              <details key={template.id} style={item} open={false}>
                <summary style={summary}>
                  <span style={summaryMain}>
                    <b>{template.name}</b>
                    <small>{categoryLabel(template.category)} / {targetLabel(template.targetType)} / {template.isMarketing ? "광고" : "운영"} / 수정 {formatDate(template.updatedAt)}</small>
                  </span>
                  <span style={template.isActive ? activeBadge : inactiveBadge}>{template.isActive ? "사용" : "중지"}</span>
                </summary>

                <div style={previewBox}>
                  <b>미리보기</b>
                  <p>{preview.text}</p>
                  <small>{preview.length}자 / {preview.messageKind} 예상</small>
                  {preview.unknownVariables.length > 0 && <small style={warningText}>알 수 없는 변수: {preview.unknownVariables.join(", ")}</small>}
                </div>

                {canManage && (
                  <form action={updateMessageTemplateAction} style={editGrid}>
                    <input type="hidden" name="templateId" value={template.id} />
                    <input name="name" defaultValue={template.name} required style={input} />
                    <input name="title" defaultValue={template.title ?? ""} placeholder="발송 제목" style={input} />
                    <select name="category" defaultValue={template.category} style={input}>
                      {messageCategories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
                    </select>
                    <select name="targetType" defaultValue={template.targetType} style={input}>
                      {messageTargetTypes.map((targetType) => <option key={targetType.value} value={targetType.value}>{targetType.label}</option>)}
                    </select>
                    <label style={checkLabel}>
                      <input type="checkbox" name="isActive" defaultChecked={template.isActive} />
                      사용
                    </label>
                    <label style={checkLabel}>
                      <input type="checkbox" name="isMarketing" defaultChecked={Boolean(template.isMarketing)} />
                      광고
                    </label>
                    <textarea name="body" defaultValue={template.body} required rows={4} style={textarea} />
                    <div style={rowActions}>
                      <button style={lightButton}>수정</button>
                      <button formAction={deleteMessageTemplateAction} style={dangerButton}>삭제</button>
                    </div>
                  </form>
                )}
              </details>
            );
          })}
          {visibleTemplates.length === 0 && <div style={empty}>조건에 맞는 템플릿이 없습니다.</div>}
        </div>
      </section>
    </section>
  );
}

function categoryLabel(value: string) {
  return messageCategories.find((category) => category.value === value)?.label ?? value;
}

function targetLabel(value: string) {
  return messageTargetTypes.find((targetType) => targetType.value === value)?.label ?? value;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function filterLink(active: boolean): CSSProperties {
  return {
    border: active ? "1px solid var(--asc-primary)" : "1px solid var(--asc-border)",
    borderRadius: 999,
    background: active ? "var(--asc-primary)" : "#fff",
    color: active ? "#fff" : "var(--asc-text)",
    padding: "6px 9px",
    textDecoration: "none",
    fontWeight: 900,
    fontSize: 13,
  };
}

const wrap: CSSProperties = { display: "grid", gap: 10 };
const head: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12 };
const title: CSSProperties = { margin: 0, fontSize: 18, fontWeight: 950 };
const desc: CSSProperties = { margin: "4px 0 0", color: "var(--asc-text-muted)", fontSize: 13 };
const filterRow: CSSProperties = { display: "flex", gap: 7, flexWrap: "wrap" };
const panel: CSSProperties = { border: "1px solid var(--asc-border)", borderRadius: 8, background: "#fff", padding: 10, display: "grid", gap: 9 };
const sectionTitle: CSSProperties = { margin: 0, fontSize: 16, fontWeight: 950 };
const formGrid: CSSProperties = { display: "grid", gridTemplateColumns: "1.1fr 1fr 140px 140px 88px", gap: 8, alignItems: "start" };
const editGrid: CSSProperties = { display: "grid", gridTemplateColumns: "1.1fr 1fr 140px 140px 88px", gap: 8, marginTop: 8 };
const input: CSSProperties = { height: 36, border: "1px solid var(--asc-border)", borderRadius: 8, padding: "0 10px", color: "var(--asc-text)" };
const textarea: CSSProperties = { gridColumn: "1 / -1", border: "1px solid var(--asc-border)", borderRadius: 8, padding: 10, color: "var(--asc-text)", resize: "vertical", lineHeight: 1.45 };
const checkLabel: CSSProperties = { height: 36, display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 900 };
const primaryButton: CSSProperties = { height: 36, border: "1px solid var(--asc-primary)", borderRadius: 8, background: "var(--asc-primary)", color: "#fff", fontWeight: 950 };
const list: CSSProperties = { display: "grid", gap: 8 };
const item: CSSProperties = { border: "1px solid var(--asc-border)", borderRadius: 8, background: "#fff", padding: 10 };
const summary: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, cursor: "pointer" };
const summaryMain: CSSProperties = { display: "grid", gap: 3 };
const activeBadge: CSSProperties = { borderRadius: 999, background: "var(--asc-success-soft)", color: "var(--asc-success)", padding: "5px 8px", fontSize: 12, fontWeight: 950 };
const inactiveBadge: CSSProperties = { ...activeBadge, background: "#f3f4f6", color: "var(--asc-text-muted)" };
const previewBox: CSSProperties = { marginTop: 8, border: "1px solid #e5e7eb", borderRadius: 8, background: "#f8fafc", padding: 8, display: "grid", gap: 4 };
const warningText: CSSProperties = { color: "var(--asc-warning-text)", fontWeight: 900 };
const rowActions: CSSProperties = { gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" };
const lightButton: CSSProperties = { height: 34, border: "1px solid var(--asc-border)", borderRadius: 8, background: "#fff", color: "var(--asc-text)", padding: "0 12px", fontWeight: 950 };
const dangerButton: CSSProperties = { ...lightButton, borderColor: "#fecaca", background: "var(--asc-danger-soft)", color: "var(--asc-danger)" };
const empty: CSSProperties = { border: "1px dashed var(--asc-border)", borderRadius: 8, padding: 12, textAlign: "center", color: "var(--asc-text-muted)", fontWeight: 900 };





