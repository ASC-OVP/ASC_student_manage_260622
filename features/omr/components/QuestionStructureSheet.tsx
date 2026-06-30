import Link from "next/link";
import type { CSSProperties } from "react";
import { applyQuestionTemplateAction, bulkUpdateQuestionMetaAction, saveQuestionMetaAction } from "@/features/omr/actions/questionMetaActions";
import { getOmrTemplate, type OmrTemplateQuestion } from "@/features/omr/lib/omrTemplates";
import {
  answerFormatFromKind,
  defaultQuestionMeta,
  OMR_ANSWER_FORMATS,
  OMR_DIFFICULTIES,
  OMR_MAPPING_STATUSES,
  OMR_PRIMARY_TYPES,
  OMR_SECONDARY_TYPES,
  splitTags,
} from "@/features/omr/lib/omrQuestionMeta";

export type OmrQuestionMetaFilters = { primaryType: string; difficulty: string; tag: string; mappingStatus: string; questionNo: number | null };

type AnswerKeyLite = { questionNo: number; answer: string; score: number };
type QuestionMetaLite = {
  questionNo: number;
  primaryType: string | null;
  secondaryType: string | null;
  answerFormat: string | null;
  difficulty: string | null;
  section: string | null;
  learningGoal: string | null;
  achievementStandard: string | null;
  tags: string | null;
  memo: string | null;
  omrMappingStatus: string;
};
type ExamForQuestionStructure = {
  id: string;
  title: string;
  questionCount: number;
  questionMetas: QuestionMetaLite[];
};
type QuestionMetaRowData = {
  question: OmrTemplateQuestion;
  meta: QuestionMetaLite | undefined;
  defaults: ReturnType<typeof defaultQuestionMeta>;
  answerKey: AnswerKeyLite | undefined;
};

const TEXT = {
  structure: "\uBB38\uD56D \uAD6C\uC870 \uC124\uC815",
  info: "\uBB38\uD56D \uAD6C\uC870 \uC815\uBCF4",
  filter: "\uD544\uD130 \uC801\uC6A9",
  reset: "\uCD08\uAE30\uD654",
  template: "\uD15C\uD50C\uB9BF \uAE30\uBCF8\uAC12 \uC801\uC6A9",
  bulk: "\uC120\uD0DD \uBB38\uD56D \uC77C\uAD04 \uC801\uC6A9",
  save: "\uC804\uCCB4 \uBB38\uD56D \uC800\uC7A5",
  readonly: "\uAD8C\uD55C\uC0C1 \uBB38\uD56D \uAD6C\uC870\uB294 \uC870\uD68C\uB9CC \uAC00\uB2A5\uD569\uB2C8\uB2E4.",
  noRows: "\uC870\uAC74\uC5D0 \uB9DE\uB294 \uBB38\uD56D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  no: "\uBC88\uD638",
  section: "\uC601\uC5ED/\uC139\uC158",
  primary: "\uB300\uD45C \uC720\uD615",
  secondary: "\uC138\uBD80 \uC720\uD615",
  format: "\uD615\uC2DD",
  difficulty: "\uB09C\uC774\uB3C4",
  score: "\uBC30\uC810",
  goal: "\uD559\uC2B5\uBAA9\uD45C",
  standard: "\uC131\uCDE8\uAE30\uC900",
  tags: "\uD0DC\uADF8",
  mapping: "OMR \uB9E4\uD551 \uC0C1\uD0DC",
  memo: "\uBA54\uBAA8",
  detail: "\uC0C1\uC138",
  edit: "\uC0C1\uC138 \uD3B8\uC9D1",
  selected: "\uC120\uD0DD \uBB38\uD56D",
  all: "\uC804\uCCB4",
  answer: "\uC815\uB2F5",
};

export default function QuestionStructureSheet({
  exam,
  template,
  keyByNo,
  filters,
  canManageExam,
}: {
  exam: ExamForQuestionStructure;
  template: ReturnType<typeof getOmrTemplate>;
  keyByNo: Map<number, AnswerKeyLite>;
  filters: OmrQuestionMetaFilters;
  canManageExam: boolean;
}) {
  const questions = template.questions.slice(0, exam.questionCount);
  const metaByNo = new Map(exam.questionMetas.map((meta) => [meta.questionNo, meta]));
  const rows: QuestionMetaRowData[] = questions.map((question) => ({
    question,
    meta: metaByNo.get(question.no),
    defaults: defaultQuestionMeta(question),
    answerKey: keyByNo.get(question.no),
  }));
  const primaryOptions = uniqueTextOptions(OMR_PRIMARY_TYPES, exam.questionMetas.map((meta) => meta.primaryType));
  const secondaryOptions = uniqueTextOptions(OMR_SECONDARY_TYPES, exam.questionMetas.map((meta) => meta.secondaryType));
  const tagOptions = uniqueTextOptions(exam.questionMetas.flatMap((meta) => splitTags(meta.tags)));
  const filteredRows = rows.filter((row) => matchesQuestionMetaFilters(row, filters));
  const selectedRow = filters.questionNo ? rows.find((row) => row.question.no === filters.questionNo) : undefined;
  const saveFormId = `omr-question-meta-save-${exam.id}`;
  const bulkFormId = `omr-question-meta-bulk-${exam.id}`;
  const returnTo = questionStructureHref(exam.id, filters);

  return (
    <section style={sheetSection}>
      <QuestionMetaDatalists primaryOptions={primaryOptions} secondaryOptions={secondaryOptions} tagOptions={tagOptions} />
      <div style={sectionHead}>
        <div>
          <h3 style={sheetTitle}>{exam.title}</h3>
          <p style={muted}>{template.label} / {exam.questionCount} / {TEXT.info} {exam.questionMetas.length}</p>
        </div>
        <form action={applyQuestionTemplateAction} style={inlineForm}>
          <input type="hidden" name="examId" value={exam.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <button style={secondaryButton} disabled={!canManageExam}>{TEXT.template}</button>
        </form>
      </div>

      <form style={filterBar}>
        <input type="hidden" name="examId" value={exam.id} />
        <input type="hidden" name="mode" value="structure" />
        <select name="metaType" defaultValue={filters.primaryType} style={input}>
          <option value="">{TEXT.primary} {TEXT.all}</option>
          {primaryOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <select name="metaDifficulty" defaultValue={filters.difficulty} style={input}>
          <option value="">{TEXT.difficulty} {TEXT.all}</option>
          {OMR_DIFFICULTIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <input name="metaTag" defaultValue={filters.tag} placeholder={TEXT.tags} list="omr-tag-options" style={input} />
        <select name="metaMappingStatus" defaultValue={filters.mappingStatus} style={input}>
          <option value="">{TEXT.mapping} {TEXT.all}</option>
          {OMR_MAPPING_STATUSES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <button style={smallButton}>{TEXT.filter}</button>
        <Link href={questionStructureHref(exam.id)} style={lightButton}>{TEXT.reset}</Link>
      </form>

      <form id={bulkFormId} action={bulkUpdateQuestionMetaAction} style={bulkBar}>
        <input type="hidden" name="examId" value={exam.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <input name="bulkPrimaryType" placeholder={TEXT.primary} list="omr-primary-type-options" style={miniInput} disabled={!canManageExam} />
        <input name="bulkSecondaryType" placeholder={TEXT.secondary} list="omr-secondary-type-options" style={miniInput} disabled={!canManageExam} />
        <select name="bulkAnswerFormat" defaultValue="" style={miniInput} disabled={!canManageExam}>
          <option value="">{TEXT.format}</option>
          {OMR_ANSWER_FORMATS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <input name="bulkDifficulty" placeholder={TEXT.difficulty} list="omr-difficulty-options" style={miniInput} disabled={!canManageExam} />
        <input name="bulkTags" placeholder={TEXT.tags} list="omr-tag-options" style={miniInput} disabled={!canManageExam} />
        <select name="bulkOmrMappingStatus" defaultValue="" style={miniInput} disabled={!canManageExam}>
          <option value="">{TEXT.mapping}</option>
          {OMR_MAPPING_STATUSES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <button style={secondaryButton} disabled={!canManageExam}>{TEXT.bulk}</button>
      </form>
      {!canManageExam && <p style={warningText}>{TEXT.readonly}</p>}

      <form id={saveFormId} action={saveQuestionMetaAction}>
        <input type="hidden" name="examId" value={exam.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
      </form>

      <div style={layout}>
        <div style={mainPane}>
          <div style={tableWrap}>
            <table style={table}>
              <thead>
                <tr>
                  <Th><span aria-label="select" /></Th>
                  <Th>{TEXT.no}</Th>
                  <Th>{TEXT.section}</Th>
                  <Th>{TEXT.primary}</Th>
                  <Th>{TEXT.secondary}</Th>
                  <Th>{TEXT.format}</Th>
                  <Th>{TEXT.difficulty}</Th>
                  <Th>{TEXT.score}</Th>
                  <Th>{TEXT.goal}</Th>
                  <Th>{TEXT.standard}</Th>
                  <Th>{TEXT.tags}</Th>
                  <Th>{TEXT.mapping}</Th>
                  <Th>{TEXT.memo}</Th>
                  <Th>{TEXT.detail}</Th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <QuestionMetaTableRow
                    key={row.question.no}
                    row={row}
                    saveFormId={saveFormId}
                    bulkFormId={bulkFormId}
                    examId={exam.id}
                    filters={filters}
                    canManageExam={canManageExam}
                  />
                ))}
                {filteredRows.length === 0 && (
                  <tr><td colSpan={14} style={emptyCell}>{TEXT.noRows}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={footer}>
            <button type="submit" form={saveFormId} style={primaryButton} disabled={!canManageExam}>{TEXT.save}</button>
          </div>
        </div>

        <aside style={sidePane}>
          {selectedRow ? (
            <QuestionMetaDetail row={selectedRow} examId={exam.id} returnTo={returnTo} canManageExam={canManageExam} />
          ) : (
            <div style={emptyBox}>{TEXT.detail} 버튼을 누르면 문항별 메모와 기준을 크게 편집할 수 있습니다.</div>
          )}
        </aside>
      </div>
    </section>
  );
}

function QuestionMetaTableRow({
  row,
  saveFormId,
  bulkFormId,
  examId,
  filters,
  canManageExam,
}: {
  row: QuestionMetaRowData;
  saveFormId: string;
  bulkFormId: string;
  examId: string;
  filters: OmrQuestionMetaFilters;
  canManageExam: boolean;
}) {
  const questionNo = row.question.no;
  const answerFormat = rowValue(row, "answerFormat") || answerFormatFromKind(row.question.kind);

  return (
    <tr>
      <Td><input type="checkbox" name="selectedQuestionNo" value={questionNo} form={bulkFormId} disabled={!canManageExam} /></Td>
      <Td><b>{questionNo}</b><input type="hidden" name="questionNo" value={questionNo} form={saveFormId} /></Td>
      <Td><input name={`section-${questionNo}`} defaultValue={rowValue(row, "section")} form={saveFormId} style={cellInput} disabled={!canManageExam} /></Td>
      <Td><input name={`primaryType-${questionNo}`} defaultValue={rowValue(row, "primaryType")} form={saveFormId} list="omr-primary-type-options" style={cellInput} disabled={!canManageExam} /></Td>
      <Td><input name={`secondaryType-${questionNo}`} defaultValue={rowValue(row, "secondaryType")} form={saveFormId} list="omr-secondary-type-options" style={cellInput} disabled={!canManageExam} /></Td>
      <Td><select name={`answerFormat-${questionNo}`} defaultValue={answerFormat} form={saveFormId} style={cellSelect} disabled={!canManageExam}>{OMR_ANSWER_FORMATS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Td>
      <Td><input name={`difficulty-${questionNo}`} defaultValue={rowValue(row, "difficulty")} form={saveFormId} list="omr-difficulty-options" style={cellInput} disabled={!canManageExam} /></Td>
      <Td>{row.answerKey?.score ?? "-"}</Td>
      <Td><input name={`learningGoal-${questionNo}`} defaultValue={rowValue(row, "learningGoal")} form={saveFormId} style={longInput} disabled={!canManageExam} /></Td>
      <Td><input name={`achievementStandard-${questionNo}`} defaultValue={rowValue(row, "achievementStandard")} form={saveFormId} style={longInput} disabled={!canManageExam} /></Td>
      <Td><input name={`tags-${questionNo}`} defaultValue={rowValue(row, "tags")} form={saveFormId} list="omr-tag-options" style={cellInput} disabled={!canManageExam} /></Td>
      <Td><select name={`omrMappingStatus-${questionNo}`} defaultValue={rowValue(row, "omrMappingStatus") || "UNMAPPED"} form={saveFormId} style={cellSelect} disabled={!canManageExam}>{OMR_MAPPING_STATUSES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Td>
      <Td><input name={`memo-${questionNo}`} defaultValue={rowValue(row, "memo")} form={saveFormId} style={longInput} disabled={!canManageExam} /></Td>
      <Td><Link href={questionStructureHref(examId, filters, questionNo)} style={linkButton}>{TEXT.detail}</Link></Td>
    </tr>
  );
}

function QuestionMetaDetail({ row, examId, returnTo, canManageExam }: { row: QuestionMetaRowData; examId: string; returnTo: string; canManageExam: boolean }) {
  const questionNo = row.question.no;
  return (
    <form action={saveQuestionMetaAction} style={detailForm}>
      <input type="hidden" name="examId" value={examId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="questionNo" value={questionNo} />
      <div>
        <p style={eyebrow}>{TEXT.selected}</p>
        <h3 style={title}>{questionNo}</h3>
        <p style={muted}>{TEXT.answer} {row.answerKey?.answer ?? "-"} / {TEXT.score} {row.answerKey?.score ?? "-"}</p>
      </div>
      <label style={field}>{TEXT.section}<input name={`section-${questionNo}`} defaultValue={rowValue(row, "section")} style={input} disabled={!canManageExam} /></label>
      <div style={twoCols}>
        <label style={field}>{TEXT.primary}<input name={`primaryType-${questionNo}`} defaultValue={rowValue(row, "primaryType")} list="omr-primary-type-options" style={input} disabled={!canManageExam} /></label>
        <label style={field}>{TEXT.secondary}<input name={`secondaryType-${questionNo}`} defaultValue={rowValue(row, "secondaryType")} list="omr-secondary-type-options" style={input} disabled={!canManageExam} /></label>
      </div>
      <div style={twoCols}>
        <label style={field}>{TEXT.format}<select name={`answerFormat-${questionNo}`} defaultValue={rowValue(row, "answerFormat") || answerFormatFromKind(row.question.kind)} style={input} disabled={!canManageExam}>{OMR_ANSWER_FORMATS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label style={field}>{TEXT.difficulty}<input name={`difficulty-${questionNo}`} defaultValue={rowValue(row, "difficulty")} list="omr-difficulty-options" style={input} disabled={!canManageExam} /></label>
      </div>
      <label style={field}>{TEXT.goal}<textarea name={`learningGoal-${questionNo}`} defaultValue={rowValue(row, "learningGoal")} style={textarea} disabled={!canManageExam} /></label>
      <label style={field}>{TEXT.standard}<textarea name={`achievementStandard-${questionNo}`} defaultValue={rowValue(row, "achievementStandard")} style={textarea} disabled={!canManageExam} /></label>
      <label style={field}>{TEXT.tags}<input name={`tags-${questionNo}`} defaultValue={rowValue(row, "tags")} list="omr-tag-options" style={input} disabled={!canManageExam} /></label>
      <label style={field}>{TEXT.mapping}<select name={`omrMappingStatus-${questionNo}`} defaultValue={rowValue(row, "omrMappingStatus") || "UNMAPPED"} style={input} disabled={!canManageExam}>{OMR_MAPPING_STATUSES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label style={field}>{TEXT.memo}<textarea name={`memo-${questionNo}`} defaultValue={rowValue(row, "memo")} style={textarea} disabled={!canManageExam} /></label>
      <button style={primaryButton} disabled={!canManageExam}>{TEXT.edit}</button>
    </form>
  );
}

function QuestionMetaDatalists({ primaryOptions, secondaryOptions, tagOptions }: { primaryOptions: string[]; secondaryOptions: string[]; tagOptions: string[] }) {
  return (
    <>
      <datalist id="omr-primary-type-options">{primaryOptions.map((option) => <option key={option} value={option} />)}</datalist>
      <datalist id="omr-secondary-type-options">{secondaryOptions.map((option) => <option key={option} value={option} />)}</datalist>
      <datalist id="omr-difficulty-options">{OMR_DIFFICULTIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</datalist>
      <datalist id="omr-tag-options">{tagOptions.map((option) => <option key={option} value={option} />)}</datalist>
    </>
  );
}

function rowValue(row: QuestionMetaRowData, key: keyof QuestionMetaLite) {
  const meta = row.meta as Record<string, string | null | undefined> | undefined;
  const defaults = row.defaults as Record<string, string | null | undefined>;
  return meta?.[key] ?? defaults[key] ?? "";
}

function matchesQuestionMetaFilters(row: QuestionMetaRowData, filters: OmrQuestionMetaFilters) {
  if (filters.primaryType && rowValue(row, "primaryType") !== filters.primaryType) return false;
  if (filters.difficulty && rowValue(row, "difficulty") !== filters.difficulty) return false;
  if (filters.mappingStatus && rowValue(row, "omrMappingStatus") !== filters.mappingStatus) return false;
  if (filters.tag && !splitTags(rowValue(row, "tags")).some((tag) => tag.toLowerCase().includes(filters.tag.toLowerCase()))) return false;
  return true;
}

function questionStructureHref(examId: string, filters?: Partial<OmrQuestionMetaFilters>, questionNo?: number) {
  const params = new URLSearchParams({ examId, mode: "structure" });
  if (filters?.primaryType) params.set("metaType", filters.primaryType);
  if (filters?.difficulty) params.set("metaDifficulty", filters.difficulty);
  if (filters?.tag) params.set("metaTag", filters.tag);
  if (filters?.mappingStatus) params.set("metaMappingStatus", filters.mappingStatus);
  if (questionNo) params.set("questionNo", String(questionNo));
  return `/omr?${params.toString()}`;
}

function uniqueTextOptions(...groups: Array<readonly (string | null | undefined)[]>) {
  return Array.from(new Set(groups.flat().map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={th}>{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={td}>{children}</td>;
}

const sheetSection: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, marginBottom: 10 };
const sectionHead: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 8 };
const sheetTitle: CSSProperties = { margin: "0 0 10px", fontSize: 16, fontWeight: 950 };
const title: CSSProperties = { margin: "2px 0 5px", fontSize: 18, fontWeight: 950 };
const eyebrow: CSSProperties = { margin: 0, color: "var(--asc-primary)", fontSize: 12, fontWeight: 950 };
const muted: CSSProperties = { margin: 0, color: "var(--asc-text-muted)", fontSize: 13 };
const warningText: CSSProperties = { margin: 0, color: "var(--asc-warning-text)", fontSize: 13, fontWeight: 800 };
const inlineForm: CSSProperties = { display: "inline-flex", gap: 6, alignItems: "center" };
const filterBar: CSSProperties = { display: "grid", gridTemplateColumns: "150px 130px minmax(150px, 1fr) 170px auto auto", gap: 6, marginBottom: 8 };
const bulkBar: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(6, minmax(110px, 1fr)) auto", gap: 6, marginBottom: 8, alignItems: "center" };
const layout: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 10, alignItems: "start" };
const mainPane: CSSProperties = { minWidth: 0, display: "grid", gap: 8 };
const sidePane: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, position: "sticky", top: 12, display: "grid", gap: 8, background: "#fff" };
const tableWrap: CSSProperties = { overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 8, maxHeight: "min(620px, calc(100vh - 310px))" };
const table: CSSProperties = { width: "100%", minWidth: 1420, borderCollapse: "collapse", fontSize: 13 };
const th: CSSProperties = { textAlign: "left", padding: "9px 10px", background: "var(--asc-bg-subtle)", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" };
const td: CSSProperties = { padding: "8px 9px", borderBottom: "1px solid #e5e7eb", verticalAlign: "top", whiteSpace: "nowrap" };
const input: CSSProperties = { width: "100%", boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 7, padding: "9px 10px", minWidth: 0 };
const miniInput: CSSProperties = { border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 7px", minWidth: 0, fontSize: 12 };
const cellInput: CSSProperties = { ...miniInput, width: 118, boxSizing: "border-box" };
const longInput: CSSProperties = { ...miniInput, width: 180, boxSizing: "border-box" };
const cellSelect: CSSProperties = { ...miniInput, width: 118, boxSizing: "border-box" };
const textarea: CSSProperties = { ...input, minHeight: 76, resize: "vertical" };
const twoCols: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 };
const field: CSSProperties = { display: "grid", gap: 4, fontSize: 12, fontWeight: 900, color: "#374151" };
const detailForm: CSSProperties = { display: "grid", gap: 8 };
const footer: CSSProperties = { display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "center" };
const emptyCell: CSSProperties = { padding: 20, textAlign: "center", color: "var(--asc-text-muted)" };
const emptyBox: CSSProperties = { border: "1px dashed #d1d5db", borderRadius: 8, padding: 16, textAlign: "center", color: "#6b7280" };
const smallButton: CSSProperties = { border: "1px solid var(--asc-primary)", borderRadius: "var(--asc-radius-md)", background: "var(--asc-primary)", color: "#fff", padding: "8px 10px", fontWeight: 900, cursor: "pointer", textDecoration: "none" };
const lightButton: CSSProperties = { ...smallButton, borderColor: "var(--asc-border-strong)", background: "var(--asc-bg)", color: "var(--asc-text)", textAlign: "center" };
const primaryButton: CSSProperties = { border: "1px solid var(--asc-primary)", borderRadius: "var(--asc-radius-lg)", background: "var(--asc-primary)", color: "#fff", padding: "10px 12px", fontWeight: 950, cursor: "pointer" };
const secondaryButton: CSSProperties = { border: "1px solid var(--asc-border-strong)", borderRadius: "var(--asc-radius-lg)", background: "var(--asc-bg)", color: "var(--asc-text)", padding: "9px 11px", fontWeight: 900, cursor: "pointer" };
const linkButton: CSSProperties = { color: "var(--asc-primary-hover)", fontWeight: 950, textDecoration: "none" };
