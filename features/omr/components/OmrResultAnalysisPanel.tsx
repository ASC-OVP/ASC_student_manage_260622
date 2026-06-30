import Link from "next/link";
import type { CSSProperties } from "react";
import { difficultyLabel } from "@/features/omr/lib/omrQuestionMeta";
import type { InsightMetric, OmrResultInsights } from "@/features/omr/lib/omrResultInsights";

const TEXT = {
  achievement: "\uC720\uD615\uBCC4 \uC131\uCDE8\uB3C4",
  difficulty: "\uB09C\uC774\uB3C4\uBCC4 \uC815\uB2F5\uB960",
  weakTop: "\uCDE8\uC57D \uC720\uD615 TOP 5",
  recommendations: "\uD559\uC0DD\uBCC4 \uBCF4\uCDA9 \uCD94\uCC9C \uBB38\uD56D\uAD70",
  missing: "\uBB38\uD56D \uAD6C\uC870 \uC815\uBCF4 \uC5C6\uC74C",
  guide: "\uBB38\uD56D\uBCC4 \uC720\uD615, \uB09C\uC774\uB3C4, \uD0DC\uADF8\uB97C \uC785\uB825\uD558\uBA74 \uCC44\uC810 \uACB0\uACFC\uC5D0 \uC720\uD615\uBCC4 \uB9AC\uD3EC\uD2B8\uAC00 \uCD94\uAC00\uB429\uB2C8\uB2E4.",
  open: "\uBB38\uD56D \uAD6C\uC870 \uC785\uB825",
  gradedMissing: "\uCC44\uC810\uB41C \uACB0\uACFC\uAC00 \uC788\uC73C\uBA74 \uC720\uD615\uBCC4 \uBD84\uC11D\uC774 \uD45C\uC2DC\uB429\uB2C8\uB2E4.",
  topWrong: "\uC0C1\uC704 \uC624\uB2F5 \uBB38\uD56D",
  correctRate: "\uC815\uB2F5\uB960",
  wrongRate: "\uC624\uB2F5\uB960",
  supplemental: "\uBCF4\uCDA9 \uAD8C\uC7A5",
  none: "\uC5C6\uC74C",
};

export default function OmrResultAnalysisPanel({ insights, examId }: { insights: OmrResultInsights; examId: string }) {
  if (insights.gradedCount === 0) {
    return <section style={card}><h2 style={sectionTitle}>{TEXT.achievement}</h2><p style={muted}>{TEXT.gradedMissing}</p></section>;
  }

  if (!insights.metaAvailable) {
    return (
      <section style={card}>
        <div style={sectionHead}>
          <div>
            <h2 style={sectionTitle}>{TEXT.missing}</h2>
            <p style={muted}>{TEXT.guide}</p>
          </div>
          <Link href={`/omr?examId=${examId}&mode=structure`} style={smallButton}>{TEXT.open}</Link>
        </div>
      </section>
    );
  }

  return (
    <section style={card}>
      <div style={sectionHead}>
        <h2 style={sectionTitle}>{TEXT.achievement}</h2>
        <span style={muted}>{insights.gradedCount}명 기준</span>
      </div>
      <div style={analysisGrid}>
        <MetricPanel title={TEXT.achievement} metrics={insights.primaryTypeMetrics} mode="correct" />
        <MetricPanel title={TEXT.difficulty} metrics={insights.difficultyMetrics} mode="correct" />
        <MetricPanel title={TEXT.weakTop} metrics={insights.weakTypeMetrics} mode="wrong" />
      </div>
      <div style={analysisGridWide}>
        <section style={analysisPanel}>
          <h3 style={smallTitle}>{TEXT.topWrong}</h3>
          <div style={wrongList}>
            {insights.topWrongQuestions.map((question) => (
              <span key={question.questionNo} style={wrongPill}>
                {question.questionNo}번 {formatPercent(question.rate)} · {question.primaryType ?? TEXT.missing} · {difficultyLabel(question.difficulty)}
              </span>
            ))}
            {insights.topWrongQuestions.length === 0 && <p style={muted}>오답 문항이 없습니다.</p>}
          </div>
        </section>
        <section style={analysisPanel}>
          <h3 style={smallTitle}>{TEXT.recommendations}</h3>
          <div style={recommendationList}>
            {insights.studentRecommendations.map((student) => (
              <div key={student.id} style={recommendationItem}>
                <b>{student.name}</b>
                <span>{student.weakTypes.join(", ") || TEXT.none}</span>
                <span>{TEXT.supplemental}: {student.questionNos.map((no) => `${no}번`).join(", ") || TEXT.none}</span>
              </div>
            ))}
            {insights.studentRecommendations.length === 0 && <p style={muted}>보충 추천 대상이 없습니다.</p>}
          </div>
        </section>
      </div>
    </section>
  );
}

function MetricPanel({ title, metrics, mode }: { title: string; metrics: InsightMetric[]; mode: "correct" | "wrong" }) {
  return (
    <section style={analysisPanel}>
      <h3 style={smallTitle}>{title}</h3>
      <div style={metricRows}>
        {metrics.map((metric) => {
          const value = mode === "wrong" ? metric.wrong / metric.total : metric.rate;
          return (
            <div key={metric.label} style={metricRow}>
              <div style={metricHeader}>
                <b>{metric.label}</b>
                <span>{mode === "wrong" ? TEXT.wrongRate : TEXT.correctRate} {formatPercent(value)}</span>
              </div>
              <div style={meterTrack}><span style={{ ...meterFill, width: `${Math.round(value * 100)}%` }} /></div>
              <p style={subText}>{metric.correct}정답 / {metric.wrong}오답 / {metric.total}응시</p>
            </div>
          );
        })}
        {metrics.length === 0 && <p style={muted}>{TEXT.missing}</p>}
      </div>
    </section>
  );
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

const card: CSSProperties = { background: "var(--asc-surface)", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 10 };
const sectionHead: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 8 };
const sectionTitle: CSSProperties = { margin: 0, fontSize: 16, fontWeight: 950 };
const muted: CSSProperties = { margin: 0, color: "var(--asc-text-muted)", fontSize: 13 };
const smallButton: CSSProperties = { border: "1px solid var(--asc-primary)", borderRadius: "var(--asc-radius-md)", background: "var(--asc-primary)", color: "#fff", padding: "8px 10px", fontWeight: 900, cursor: "pointer", textDecoration: "none" };
const analysisGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(180px, 1fr))", gap: 8, marginTop: 8 };
const analysisGridWide: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 };
const analysisPanel: CSSProperties = { border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", background: "var(--asc-bg)", padding: 10, minWidth: 0 };
const smallTitle: CSSProperties = { margin: "0 0 10px", fontSize: 15, fontWeight: 950 };
const metricRows: CSSProperties = { display: "grid", gap: 8 };
const metricRow: CSSProperties = { display: "grid", gap: 4 };
const metricHeader: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", fontSize: 12 };
const meterTrack: CSSProperties = { height: 7, borderRadius: 999, background: "#e5e7eb", overflow: "hidden" };
const meterFill: CSSProperties = { display: "block", height: "100%", borderRadius: 999, background: "var(--asc-primary)" };
const subText: CSSProperties = { color: "var(--asc-text-muted)", fontSize: 12, marginTop: 3 };
const wrongList: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 5 };
const wrongPill: CSSProperties = { border: "1px solid var(--asc-danger)", borderRadius: 999, background: "var(--asc-danger-soft)", color: "var(--asc-danger)", padding: "4px 7px", fontSize: 12, fontWeight: 900 };
const recommendationList: CSSProperties = { display: "grid", gap: 6 };
const recommendationItem: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, display: "grid", gap: 3, fontSize: 12 };
