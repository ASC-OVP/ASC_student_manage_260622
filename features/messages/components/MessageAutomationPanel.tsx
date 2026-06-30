import type { CSSProperties } from "react";

const rules = [
  "결석 처리 시 보호자 문자 초안 생성",
  "과제 미제출 시 보호자 문자 초안 생성",
  "시험 결과 등록 시 리포트 확인 문자 초안 생성",
  "클리닉/보강 배정 시 안내 문자 초안 생성",
  "수납/행정 안내 문자 초안 생성",
];

export default function MessageAutomationPanel() {
  return (
    <section style={wrap}>
      <div>
        <h2 style={title}>자동화 규칙</h2>
        <p style={desc}>1차 MVP에서는 실제 자동 발송 트리거를 연결하지 않습니다.</p>
      </div>

      <div style={panel}>
        <span style={badge}>준비 중</span>
        <h3 style={sectionTitle}>관리자 승인 후 발송 구조로 확장 예정</h3>
        <div style={flow}>
          <span>트리거 발생</span>
          <span>문자 초안 생성</span>
          <span>관리자 미리보기 확인</span>
          <span>발송 버튼 클릭</span>
          <span>로그 저장</span>
        </div>
        <div style={list}>
          {rules.map((rule) => (
            <div key={rule} style={ruleRow}>
              <b>{rule}</b>
              <span>TODO</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const wrap: CSSProperties = { display: "grid", gap: 10 };
const title: CSSProperties = { margin: 0, fontSize: 18, fontWeight: 950 };
const desc: CSSProperties = { margin: "4px 0 0", color: "var(--asc-text-muted)", fontSize: 13 };
const panel: CSSProperties = { border: "1px solid var(--asc-border)", borderRadius: 8, background: "#fff", padding: 10, display: "grid", gap: 9 };
const badge: CSSProperties = { width: "fit-content", border: "1px solid #93c5fd", borderRadius: 999, background: "var(--asc-info-soft)", color: "var(--asc-info)", padding: "5px 8px", fontWeight: 950 };
const sectionTitle: CSSProperties = { margin: 0, fontSize: 16, fontWeight: 950 };
const flow: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(5, minmax(104px, 1fr))", gap: 6 };
const list: CSSProperties = { display: "grid", gap: 6 };
const ruleRow: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, border: "1px solid #e5e7eb", borderRadius: 8, background: "#f8fafc", padding: 9, color: "var(--asc-text-subtle)" };
