import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import {
  gradeOmrAction,
  saveOmrCorrectionsAction,
  updateOmrUploadMatchAction,
  updateOmrUploadSetupAction,
} from "@/app/omr/actions";
import { ExamResultStatus, OmrAnswerStatus, OmrTemplateType } from "@/lib/generated/prisma";
import { getOmrTemplate, omrTemplateList, type OmrTemplateQuestion } from "@/lib/omrTemplates";
import OmrReviewPreview from "@/components/OmrReviewPreview";

export type OmrReviewStudentOption = {
  id: string;
  name: string;
  schoolName: string | null;
  grade: string | null;
  phone?: string | null;
  parentPhone?: string | null;
};

export type OmrReviewAnswerKey = { questionNo: number; answer: string; score: number };
export type OmrReviewRecognizedAnswer = {
  questionNo: number;
  recognizedAnswer: string | null;
  correctedAnswer: string | null;
  finalAnswer: string | null;
  status: OmrAnswerStatus;
  confidence: number | null;
};
export type OmrReviewResultItem = {
  questionNo: number;
  status: ExamResultStatus;
  studentAnswer: string | null;
  correctAnswer: string | null;
  score: number;
};
export type OmrReviewResultSummary = {
  totalScore: number;
  maxScore: number;
  correctCount: number;
  wrongCount: number;
  blankCount: number;
  reviewNeededCount: number;
};
export type OmrReviewResult = OmrReviewResultSummary & { items: OmrReviewResultItem[] };

export type OmrReviewUploadSummary = {
  id: string;
  studentId: string | null;
  examId: string | null;
  templateType: OmrTemplateType;
  phoneLast8: string | null;
  phoneRecognizeStatus: string;
  matchStatus: string;
  recognizeStatus: string;
  gradingStatus: string;
  fileName: string;
  fileType: string | null;
  fileSize: number;
  filePath: string | null;
  previewImagePath: string | null;
  createdAt: Date;
  student: OmrReviewStudentOption | null;
  recognizedAnswers: Array<{ status: OmrAnswerStatus }>;
  results: OmrReviewResultSummary[];
};

export type OmrReviewUpload = Omit<OmrReviewUploadSummary, "student" | "recognizedAnswers" | "results"> & {
  student: OmrReviewStudentOption | null;
  exam:
    | {
        id: string;
        title: string;
        templateType: OmrTemplateType;
        questionCount: number;
        answerKeys: OmrReviewAnswerKey[];
      }
    | null;
  recognizedAnswers: OmrReviewRecognizedAnswer[];
  results: OmrReviewResult[];
};

type Props = {
  upload: OmrReviewUpload;
  reviewUploads: OmrReviewUploadSummary[];
  students: OmrReviewStudentOption[];
  exams: Array<{ id: string; title: string }>;
};

const answerStatusOptions = [
  [OmrAnswerStatus.MANUAL, "수동 입력"],
  [OmrAnswerStatus.RECOGNIZED, "자동 인식"],
  [OmrAnswerStatus.BLANK, "미응답"],
  [OmrAnswerStatus.MULTIPLE, "중복 마킹"],
  [OmrAnswerStatus.REVIEW_NEEDED, "검수 필요"],
] as const;

export default function OmrUploadReview({ upload, reviewUploads, students, exams }: Props) {
  const template = getOmrTemplate(upload.templateType);
  const questions = template.questions.slice(0, upload.exam?.questionCount ?? template.questionCount);
  const keyByNo = new Map((upload.exam?.answerKeys ?? []).map((key) => [key.questionNo, key]));
  const recognizedByNo = new Map(upload.recognizedAnswers.map((answer) => [answer.questionNo, answer]));
  const latestResult = upload.results[0] ?? null;
  const resultItemByNo = new Map(latestResult?.items.map((item) => [item.questionNo, item]) ?? []);
  const returnTo = reviewUploadHref(upload.id);
  const lowConfidenceQuestions = questions
    .map((question) => ({ question, recognized: recognizedByNo.get(question.no) }))
    .filter(({ recognized }) =>
      (recognized?.confidence ?? 1) <= 0.5 ||
      recognized?.status === OmrAnswerStatus.REVIEW_NEEDED ||
      recognized?.status === OmrAnswerStatus.MULTIPLE
    );
  const currentIndex = reviewUploads.findIndex((item) => item.id === upload.id);
  const previousUpload = currentIndex > 0 ? reviewUploads[currentIndex - 1] : null;
  const nextUpload = currentIndex >= 0 && currentIndex < reviewUploads.length - 1 ? reviewUploads[currentIndex + 1] : null;

  return (
    <div style={studentReviewGrid}>
      <aside style={reviewStudentPane}>
        <div style={sectionHead}>
          <h3 style={smallTitle}>학생 리스트</h3>
          <span style={muted}>{reviewUploads.length}명</span>
        </div>
        <div style={studentNavButtons}>
          {previousUpload ? (
            <Link href={reviewUploadHref(previousUpload.id)} style={secondaryButton}>이전</Link>
          ) : (
            <span style={disabledNav}>이전</span>
          )}
          {nextUpload ? (
            <Link href={reviewUploadHref(nextUpload.id)} style={secondaryButton}>다음</Link>
          ) : (
            <span style={disabledNav}>다음</span>
          )}
        </div>
        <div style={reviewStudentList}>
          {reviewUploads.map((item) => (
            <ReviewStudentItem key={item.id} upload={item} selected={item.id === upload.id} />
          ))}
        </div>
      </aside>

      <section style={reviewPreviewPane}>
        <div style={sectionHead}>
          <div>
            <h2 style={sectionTitle}>{upload.student?.name ?? "매칭 필요"}</h2>
            <p style={muted}>{formatPhoneLast8(upload.phoneLast8)} / {upload.fileName}</p>
          </div>
          <StatusBadge tone={recognizeTone(upload.recognizeStatus)}>{recognizeStatusText(upload.recognizeStatus)}</StatusBadge>
        </div>
        <OmrReviewPreview
          filePath={upload.previewImagePath ?? upload.filePath}
          fileType={upload.previewImagePath ? "image/png" : upload.fileType}
          fileName={upload.fileName}
        />
      </section>

      <section style={reviewAnswerPane}>
        <section style={compactPanel}>
          <div style={sectionHead}>
            <h3 style={smallTitle}>확인 필요한 문항</h3>
            {latestResult && (
              <StatusBadge tone={latestResult.reviewNeededCount > 0 ? "yellow" : "green"}>
                {latestResult.totalScore}/{latestResult.maxScore || upload.exam?.questionCount || template.questionCount}
              </StatusBadge>
            )}
          </div>
          {lowConfidenceQuestions.length > 0 ? (
            <div style={lowQuestionList}>
              {lowConfidenceQuestions.map(({ question, recognized }) => (
                <a key={question.no} href={`#omr-question-${question.no}`} style={lowQuestionItem}>
                  <b>{question.no}번</b>
                  <span>자동 {recognized?.recognizedAnswer || "-"}</span>
                  <span>{formatConfidence(recognized?.confidence)}</span>
                  <StatusBadge tone="yellow">{answerStatusText(recognized?.status)}</StatusBadge>
                </a>
              ))}
            </div>
          ) : (
            <div style={emptyBox}>확인 필요한 문항 없음</div>
          )}
        </section>

        <section style={compactPanel}>
          <h3 style={smallTitle}>학생 매칭 / 검사 설정</h3>
          <p style={muted}>
            인식 전화번호: <b>{formatPhoneLast8(upload.phoneLast8)}</b> / {phoneRecognizeStatusText(upload.phoneRecognizeStatus)} / {matchStatusText(upload.matchStatus)}
          </p>
          <div style={reviewInlineForms}>
            <form action={updateOmrUploadMatchAction} style={reviewInlineForm}>
              <input type="hidden" name="uploadId" value={upload.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <input name="phoneLast8" defaultValue={upload.phoneLast8 ?? ""} placeholder="전화번호 뒤 8자리" style={miniInput} />
              <select name="studentId" defaultValue={upload.student?.id ?? ""} style={miniInput}>
                <option value="">학생 선택</option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>{studentLabel(student)}</option>
                ))}
              </select>
              <button style={secondaryButton}>매칭 저장</button>
            </form>
            <form action={updateOmrUploadSetupAction} style={reviewInlineForm}>
              <input type="hidden" name="uploadId" value={upload.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <select name="examId" defaultValue={upload.examId ?? ""} style={miniInput}>
                {exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.title}</option>)}
              </select>
              <select name="templateType" defaultValue={upload.templateType} style={miniInput}>
                {omrTemplateList.map((templateOption) => (
                  <option key={templateOption.type} value={templateOption.type}>{templateOption.label}</option>
                ))}
              </select>
              <button style={secondaryButton}>설정 저장</button>
            </form>
          </div>
        </section>

        <form action={gradeOmrAction} style={answerReviewForm}>
          <input type="hidden" name="uploadId" value={upload.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <div style={sectionHead}>
            <div>
              <h3 style={smallTitle}>답안 / 정답 비교표</h3>
              <p style={muted}>수정 답을 바꾸고 저장하면 최종 답과 채점 결과가 갱신됩니다.</p>
            </div>
          </div>
          <div style={reviewTableWrap}>
            <table style={table}>
              <thead>
                <tr>
                  <Th>번호</Th>
                  <Th>학생 답</Th>
                  <Th>자동</Th>
                  <Th>수정 답</Th>
                  <Th>최종 답</Th>
                  <Th>정답</Th>
                  <Th>O/X</Th>
                  <Th>신뢰도</Th>
                  <Th>상태</Th>
                </tr>
              </thead>
              <tbody>
                {questions.map((question) => (
                  <QuestionRow
                    key={question.no}
                    question={question}
                    recognized={recognizedByNo.get(question.no)}
                    answerKey={keyByNo.get(question.no)}
                    resultItem={resultItemByNo.get(question.no)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div style={reviewFooter}>
            <button formAction={saveOmrCorrectionsAction} style={secondaryButton} disabled={!upload.exam}>수정 저장</button>
            <button style={primaryButton} disabled={!upload.student}>채점</button>
            <button style={primaryButton} disabled={!upload.student || !latestResult}>학생 성적에 등록</button>
            <Link href={closeUploadHrefFor(upload)} style={lightButton}>목록으로</Link>
          </div>
          {!upload.student && <p style={dangerText}>성적을 등록하려면 학생 매칭이 필요합니다.</p>}
        </form>
      </section>
    </div>
  );
}

function ReviewStudentItem({ upload, selected }: { upload: OmrReviewUploadSummary; selected: boolean }) {
  const result = upload.results[0];
  const needsReview =
    upload.recognizeStatus === "REVIEW_NEEDED" ||
    upload.recognizeStatus === "FAILED" ||
    upload.recognizedAnswers.some((answer) => answer.status === OmrAnswerStatus.REVIEW_NEEDED || answer.status === OmrAnswerStatus.MULTIPLE);
  const statusTone = needsReview ? "yellow" : recognizeTone(upload.recognizeStatus);
  const statusLabel = needsReview ? "검수" : shortRecognizeStatusText(upload.recognizeStatus);

  return (
    <Link
      href={reviewUploadHref(upload.id)}
      style={{ ...reviewStudentItem, ...(selected ? reviewStudentSelected : {}), ...(needsReview ? reviewStudentNeedsReview : {}) }}
    >
      <div style={reviewStudentHeader}>
        <div style={reviewStudentName}>{upload.student?.name ?? "학생 매칭 필요"}</div>
        <span style={{ ...studentStatusBadge, ...toneStyles[statusTone] }}>{statusLabel}</span>
      </div>
      <div style={reviewStudentMeta}>{formatPhoneLast8(upload.phoneLast8)} · {result ? `${result.totalScore}점` : "미채점"}</div>
    </Link>
  );
}

function QuestionRow({
  question,
  recognized,
  answerKey,
  resultItem,
}: {
  question: OmrTemplateQuestion;
  recognized?: OmrReviewRecognizedAnswer;
  answerKey?: { answer: string; score: number };
  resultItem?: OmrReviewResultItem;
}) {
  const studentAnswer = resultItem?.studentAnswer ?? recognized?.finalAnswer ?? recognized?.correctedAnswer ?? recognized?.recognizedAnswer ?? "";
  const finalAnswer = recognized?.finalAnswer ?? recognized?.correctedAnswer ?? recognized?.recognizedAnswer ?? "";
  const correctAnswer = resultItem?.correctAnswer ?? answerKey?.answer ?? "";
  const status = recognized?.status ?? (studentAnswer ? OmrAnswerStatus.MANUAL : OmrAnswerStatus.BLANK);
  const ox = resultItem
    ? resultItem.status === ExamResultStatus.CORRECT
      ? "O"
      : resultItem.status === ExamResultStatus.WRONG
        ? "X"
        : resultStatusText(resultItem.status)
    : studentAnswer && correctAnswer
      ? studentAnswer === correctAnswer
        ? "O"
        : "X"
      : "-";
  const rowStyle = resultItem ? resultRowStyle(resultItem.status) : status === OmrAnswerStatus.REVIEW_NEEDED || status === OmrAnswerStatus.MULTIPLE ? reviewRow : undefined;

  return (
    <tr id={`omr-question-${question.no}`} style={rowStyle}>
      <Td>{question.no}</Td>
      <Td>{studentAnswer || "-"}</Td>
      <Td>{recognized?.recognizedAnswer || "-"}</Td>
      <Td><AnswerInput name={`student-${question.no}`} question={question} defaultValue={studentAnswer} /></Td>
      <Td>{finalAnswer || studentAnswer || "-"}</Td>
      <Td><AnswerInput name={`correct-${question.no}`} question={question} defaultValue={correctAnswer} /></Td>
      <Td><span style={ox === "O" ? correctPill : ox === "X" ? wrongPill : badge}>{ox}</span></Td>
      <Td>{formatConfidence(recognized?.confidence)}</Td>
      <Td>
        <select name={`status-${question.no}`} defaultValue={status} style={miniInput}>
          {answerStatusOptions.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <input name={`score-${question.no}`} type="hidden" value={answerKey?.score ?? 1} />
      </Td>
    </tr>
  );
}

function AnswerInput({ name, question, defaultValue }: { name: string; question: OmrTemplateQuestion; defaultValue: string }) {
  if (question.kind === "SHORT") return <input name={name} defaultValue={defaultValue} placeholder="숫자" style={miniInput} />;
  return (
    <select name={name} defaultValue={defaultValue} style={miniInput}>
      <option value="">-</option>
      {[1, 2, 3, 4, 5].map((value) => <option key={value} value={String(value)}>{value}</option>)}
    </select>
  );
}

function StatusBadge({ children, tone = "gray" }: { children: ReactNode; tone?: Tone }) {
  return <span style={{ ...badge, ...toneStyles[tone] }}>{children}</span>;
}

function Th({ children }: { children: ReactNode }) {
  return <th style={th}>{children}</th>;
}

function Td({ children }: { children: ReactNode }) {
  return <td style={td}>{children}</td>;
}

function reviewUploadHref(uploadId: string) {
  return `/omr/uploads/${uploadId}`;
}

function closeUploadHrefFor(upload: Pick<OmrReviewUpload, "examId">) {
  return upload.examId ? `/omr?examId=${upload.examId}&mode=results` : "/omr";
}

function answerStatusText(status?: OmrAnswerStatus | null) {
  return answerStatusOptions.find(([value]) => value === status)?.[1] ?? "확인 필요";
}

function matchStatusText(status: string | null | undefined) {
  const labels: Record<string, string> = {
    MATCHED: "매칭 완료",
    MULTIPLE_MATCHES: "중복 매칭",
    NOT_FOUND: "학생 없음",
    NEEDS_PHONE: "전화번호 확인 필요",
    MANUAL: "수동 매칭 완료",
    MANUAL_MATCHED: "수동 매칭 완료",
  };
  return labels[status ?? ""] ?? "확인 필요";
}

function phoneRecognizeStatusText(status: string | null | undefined) {
  const labels: Record<string, string> = {
    WAITING: "전화번호 인식 대기",
    OK: "전화번호 자동 인식",
    LOW_CONFIDENCE: "전화번호 검수 필요",
    FAILED: "전화번호 인식 실패",
    MANUAL: "수동 입력",
  };
  return labels[status ?? ""] ?? "전화번호 확인 필요";
}

function recognizeStatusText(status: string) {
  const labels: Record<string, string> = {
    WAITING: "대기",
    RECOGNIZING: "인식 중",
    RECOGNIZED: "인식 완료",
    REVIEW_NEEDED: "검수 필요",
    FAILED: "실패",
  };
  return labels[status] ?? status;
}

function shortRecognizeStatusText(status: string) {
  const labels: Record<string, string> = {
    WAITING: "대기",
    RECOGNIZING: "중",
    RECOGNIZED: "완료",
    REVIEW_NEEDED: "검수",
    FAILED: "실패",
  };
  return labels[status] ?? status;
}

function recognizeTone(status: string): Tone {
  if (status === "RECOGNIZED") return "green";
  if (status === "RECOGNIZING") return "blue";
  if (status === "REVIEW_NEEDED" || status === "WAITING") return "yellow";
  if (status === "FAILED") return "red";
  return "gray";
}

function resultStatusText(status: ExamResultStatus) {
  if (status === ExamResultStatus.CORRECT) return "정답";
  if (status === ExamResultStatus.WRONG) return "오답";
  if (status === ExamResultStatus.BLANK) return "미응답";
  if (status === ExamResultStatus.MULTIPLE) return "중복 마킹";
  return "검수 필요";
}

function resultRowStyle(status: ExamResultStatus): CSSProperties | undefined {
  if (status === ExamResultStatus.CORRECT) return { background: "#f0fdf4" };
  if (status === ExamResultStatus.WRONG) return { background: "#fef2f2" };
  if (status === ExamResultStatus.REVIEW_NEEDED || status === ExamResultStatus.MULTIPLE) return { background: "#fffbeb" };
  return undefined;
}

function formatPhoneLast8(value: string | null | undefined) {
  if (!value) return "-";
  const digits = value.replace(/\D/g, "").slice(-8);
  if (digits.length !== 8) return value;
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

function formatConfidence(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return `${Math.round(value * 100)}%`;
}

function studentLabel(student: OmrReviewStudentOption) {
  return [student.name, student.schoolName, student.grade].filter(Boolean).join(" / ");
}

type Tone = "gray" | "blue" | "green" | "yellow" | "red";

const card: CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 };
const sectionHead: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 };
const sectionTitle: CSSProperties = { margin: 0, fontSize: 18, fontWeight: 950 };
const smallTitle: CSSProperties = { margin: "0 0 10px", fontSize: 15, fontWeight: 950 };
const muted: CSSProperties = { margin: 0, color: "#6b7280", fontSize: 13 };
const tableWrap: CSSProperties = { overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 8 };
const table: CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th: CSSProperties = { textAlign: "left", padding: "9px 10px", background: "#f3f4f6", borderBottom: "1px solid #d1d5db", whiteSpace: "nowrap" };
const td: CSSProperties = { padding: "9px 10px", borderBottom: "1px solid #f3f4f6", verticalAlign: "top", whiteSpace: "nowrap" };
const smallButton: CSSProperties = { border: "1px solid #d1d5db", borderRadius: 7, background: "#111827", color: "#fff", padding: "8px 10px", fontWeight: 900, cursor: "pointer", textDecoration: "none" };
const lightButton: CSSProperties = { ...smallButton, background: "#fff", color: "#111827", textAlign: "center" };
const primaryButton: CSSProperties = { border: 0, borderRadius: 8, background: "#111827", color: "#fff", padding: "10px 12px", fontWeight: 950, cursor: "pointer" };
const secondaryButton: CSSProperties = { border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", color: "#111827", padding: "9px 11px", fontWeight: 900, cursor: "pointer", textDecoration: "none", textAlign: "center" };
const badge: CSSProperties = { display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "3px 8px", background: "#f3f4f6", color: "#374151", fontWeight: 900, fontSize: 12 };
const toneStyles: Record<Tone, CSSProperties> = {
  gray: { background: "#f3f4f6", color: "#374151" },
  blue: { background: "#e8f0fe", color: "#083891" },
  green: { background: "#dcfce7", color: "#047857" },
  yellow: { background: "#fef3c7", color: "#92400e" },
  red: { background: "#fee2e2", color: "#b91c1c" },
};
const studentReviewGrid: CSSProperties = { display: "grid", gridTemplateColumns: "220px minmax(320px, .9fr) minmax(360px, 1.1fr)", gap: 10, alignItems: "stretch", minHeight: "calc(100vh - 150px)" };
const reviewStudentPane: CSSProperties = { ...card, display: "grid", gridTemplateRows: "auto auto 1fr", minHeight: 0, padding: 10 };
const reviewPreviewPane: CSSProperties = { ...card, minWidth: 0, minHeight: 0 };
const reviewAnswerPane: CSSProperties = { display: "grid", gridTemplateRows: "auto auto 1fr", gap: 10, minWidth: 0, minHeight: 0 };
const studentNavButtons: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 };
const disabledNav: CSSProperties = { ...secondaryButton, opacity: .45, cursor: "default" };
const reviewStudentList: CSSProperties = { display: "grid", gap: 4, overflow: "auto", paddingRight: 2, alignContent: "start" };
const reviewStudentItem: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 7, padding: "6px 7px", textDecoration: "none", color: "#111827", background: "#fff", display: "grid", gap: 2 };
const reviewStudentSelected: CSSProperties = { borderColor: "#0b50d0", boxShadow: "inset 3px 0 0 #0b50d0", background: "#e8f0fe" };
const reviewStudentNeedsReview: CSSProperties = { background: "#fffbeb" };
const reviewStudentHeader: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 6, alignItems: "center" };
const reviewStudentName: CSSProperties = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, fontWeight: 950 };
const reviewStudentMeta: CSSProperties = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11, color: "#6b7280", fontWeight: 800 };
const studentStatusBadge: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 32, height: 19, borderRadius: 999, padding: "0 6px", fontSize: 10, fontWeight: 950 };
const compactPanel: CSSProperties = { ...card, padding: 10 };
const lowQuestionList: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 96, overflow: "auto" };
const lowQuestionItem: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid #fde68a", borderRadius: 999, background: "#fffbeb", color: "#92400e", padding: "5px 8px", textDecoration: "none", fontSize: 12, fontWeight: 900 };
const reviewInlineForms: CSSProperties = { display: "grid", gap: 6, marginTop: 8 };
const reviewInlineForm: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(100px, 1fr) minmax(130px, 1.15fr) auto", gap: 6, alignItems: "center" };
const answerReviewForm: CSSProperties = { ...card, display: "grid", gap: 8, minHeight: 0 };
const reviewTableWrap: CSSProperties = { ...tableWrap, maxHeight: "calc(100vh - 410px)", minHeight: 220 };
const reviewFooter: CSSProperties = { display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, alignItems: "center" };
const miniInput: CSSProperties = { border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 7px", minWidth: 0, fontSize: 12 };
const dangerText: CSSProperties = { color: "#b91c1c", fontWeight: 800 };
const correctPill: CSSProperties = { ...badge, background: "#dcfce7", color: "#047857" };
const wrongPill: CSSProperties = { ...badge, background: "#fee2e2", color: "#b91c1c" };
const emptyBox: CSSProperties = { border: "1px dashed #d1d5db", borderRadius: 8, padding: 16, textAlign: "center", color: "#6b7280" };
const reviewRow: CSSProperties = { background: "#fffbeb" };
