"use client";

import type { CSSProperties, ChangeEvent, ClipboardEvent } from "react";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createStudentsFromExcelUpload } from "@/app/students/actions";
import { formatPhoneNumber, normalizePhoneNumber, phoneLastDigits } from "@/lib/phone";

type UploadField = "unused" | "name" | "phone" | "parentPhone" | "schoolName" | "grade" | "subject" | "currentLevel" | "memo" | "classGroupName";

type UploadColumn = { id: string; field: UploadField; width: number };

type ClassGroupOption = { id: string; name: string; teacherName?: string };
type ExistingStudent = { id: string; name: string; phone: string; parentPhone: string };
type RowValidation = { index: number; errors: string[]; warnings: string[] };

type Props = {
  classGroups: ClassGroupOption[];
  existingStudents: ExistingStudent[];
  defaultClassGroupId?: string | null;
};

type ParsedUploadRow = {
  name: string;
  phone: string;
  parentPhone: string;
  schoolName: string;
  grade: string;
  subject: string;
  currentLevel: string;
  memo: string;
  classGroupName: string;
};

const uploadFieldOptions: Array<{ field: UploadField; label: string; width: number }> = [
  { field: "unused", label: "사용 안 함", width: 110 },
  { field: "name", label: "학생명", width: 130 },
  { field: "phone", label: "학생 연락처", width: 145 },
  { field: "parentPhone", label: "보호자 연락처", width: 145 },
  { field: "schoolName", label: "학교", width: 130 },
  { field: "grade", label: "학년", width: 90 },
  { field: "subject", label: "과목", width: 100 },
  { field: "currentLevel", label: "레벨", width: 100 },
  { field: "memo", label: "기본 메모", width: 220 },
  { field: "classGroupName", label: "반", width: 150 },
];

const defaultUploadFields: UploadField[] = ["name", "phone", "parentPhone", "schoolName", "grade", "subject", "currentLevel", "memo"];
const rowCountDefault = 12;

export default function StudentExcelUploadModal({ classGroups, existingStudents, defaultClassGroupId }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [targetClassGroupId, setTargetClassGroupId] = useState(defaultClassGroupId ?? "");
  const [columns, setColumns] = useState<UploadColumn[]>(() => createDefaultColumns());
  const [rows, setRows] = useState<string[][]>(() => blankRows(rowCountDefault, defaultUploadFields.length));
  const [selectedRows, setSelectedRows] = useState<Set<number>>(() => new Set());
  const [message, setMessage] = useState("엑셀에서 복사한 학생 명단을 첫 칸에 붙여넣거나 CSV 파일을 업로드하세요.");
  const [result, setResult] = useState("");
  const [isPending, startTransition] = useTransition();

  const targetClassGroup = useMemo(() => classGroups.find((classGroup) => classGroup.id === targetClassGroupId) ?? null, [classGroups, targetClassGroupId]);
  const activeIndexes = useMemo(() => activeRowIndexes(rows), [rows]);
  const duplicateFields = useMemo(() => duplicatedMappedFields(columns), [columns]);
  const hasNameMapping = columns.some((column) => column.field === "name");
  const parsedRows = useMemo(() => rows.map((row) => parseUploadRow(row, columns)), [columns, rows]);
  const validation = useMemo(
    () => validateRows(parsedRows, activeIndexes, existingStudents, targetClassGroup?.name ?? "", duplicateFields),
    [activeIndexes, duplicateFields, existingStudents, parsedRows, targetClassGroup?.name]
  );
  const summary = useMemo(() => {
    const errorRows = validation.filter((item) => item.errors.length > 0);
    const warningRows = validation.filter((item) => item.errors.length === 0 && item.warnings.length > 0);
    return {
      total: activeIndexes.length,
      valid: validation.filter((item) => item.errors.length === 0).length,
      warnings: warningRows.length,
      errors: errorRows.length,
    };
  }, [activeIndexes.length, validation]);
  const globalErrors = [!targetClassGroupId ? "추가할 반을 선택해야 합니다." : "", !hasNameMapping ? "학생명으로 매핑된 열이 필요합니다." : ""].filter(Boolean);
  const canSubmit = !isPending && summary.valid > 0 && globalErrors.length === 0;

  function openModal() {
    setTargetClassGroupId(defaultClassGroupId ?? "");
    setOpen(true);
  }

  function resetRows() {
    const nextColumns = createDefaultColumns();
    setColumns(nextColumns);
    setRows(blankRows(rowCountDefault, nextColumns.length));
    setSelectedRows(new Set());
    setMessage("초기화했습니다. 엑셀 데이터를 붙여넣거나 CSV 파일을 업로드하세요.");
    setResult("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function updateCell(rowIndex: number, colIndex: number, value: string) {
    setRows((current) => {
      const next = ensureRowCount(current, rowIndex + 1, columns.length);
      next[rowIndex] = ensureColumnCount(next[rowIndex], columns.length);
      next[rowIndex][colIndex] = normalizeUploadCell(columns[colIndex]?.field, value);
      return next;
    });
    setResult("");
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) {
    const text = event.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !text.includes("\n")) return;
    event.preventDefault();
    const rawMatrix = parsePastedTable(text);
    const matrix = rowIndex === 0 && looksLikeHeader(rawMatrix[0]) ? rawMatrix.slice(1) : rawMatrix;
    if (matrix.length === 0) return;
    const requiredColumnCount = Math.max(columns.length, colIndex + Math.max(...matrix.map((row) => row.length)));
    const nextColumns = ensureUploadColumnCount(columns, requiredColumnCount);
    setColumns(nextColumns);
    setRows((current) => pasteMatrix(current, matrix, rowIndex, colIndex, nextColumns));
    setMessage(`${matrix.length}개 행을 붙여넣었습니다. 열 매핑과 검증 결과를 확인한 뒤 등록하세요.`);
    setResult("");
  }

  function updateColumnField(columnIndex: number, field: UploadField) {
    const hadDuplicate = field !== "unused" && columns.some((column, index) => index !== columnIndex && column.field === field);
    setColumns((current) =>
      current.map((column, index) => {
        if (index === columnIndex) return { ...column, field, width: fieldWidth(field) };
        if (field !== "unused" && column.field === field) return { ...column, field: "unused", width: fieldWidth("unused") };
        return column;
      })
    );
    if (field === "phone" || field === "parentPhone") {
      setRows((current) =>
        current.map((row) => {
          const next = ensureColumnCount(row, columns.length);
          next[columnIndex] = normalizeUploadCell(field, next[columnIndex] ?? "");
          return next;
        })
      );
    }
    if (hadDuplicate) {
      setMessage(`${fieldLabel(field)}은 한 열에만 매핑됩니다. 기존에 선택된 열은 '사용 안 함'으로 바꿨습니다.`);
    }
  }

  function addRow() {
    setRows((current) => [...current, blankRow(columns.length)]);
    setMessage("빈 행을 추가했습니다.");
  }

  function deleteRow(rowIndex: number) {
    setRows((current) => ensureMinimumRows(current.filter((_, index) => index !== rowIndex), columns.length));
    setSelectedRows((current) => {
      const next = new Set<number>();
      current.forEach((index) => {
        if (index < rowIndex) next.add(index);
        if (index > rowIndex) next.add(index - 1);
      });
      return next;
    });
  }

  function deleteSelectedRows() {
    if (selectedRows.size === 0) return;
    setRows((current) => ensureMinimumRows(current.filter((_, index) => !selectedRows.has(index)), columns.length));
    setSelectedRows(new Set());
    setMessage(`선택한 ${selectedRows.size}개 행을 삭제했습니다.`);
  }

  function toggleRow(rowIndex: number) {
    setSelectedRows((current) => {
      const next = new Set(current);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  }

  function toggleAllActiveRows() {
    setSelectedRows((current) => {
      if (activeIndexes.length > 0 && activeIndexes.every((index) => current.has(index))) return new Set();
      return new Set(activeIndexes);
    });
  }

  function downloadSample() {
    const headers = ["학생명", "학생 연락처", "보호자 연락처", "학교", "학년", "과목", "레벨", "기본 메모"];
    const sampleRows = [
      ["홍길동", "010-1234-5678", "010-9999-8888", "대치고", "고1", "수학", "A", "상담 필요"],
      ["김민서", "010-1111-2222", "", "숙명여고", "고2", "영어", "B", ""],
    ];
    const csv = [headers, ...sampleRows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "asc_students_upload_sample.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
      setMessage("현재는 CSV 업로드와 엑셀 복사/붙여넣기를 지원합니다. 엑셀 파일은 CSV로 저장하거나 표를 복사해서 붙여넣어 주세요.");
      return;
    }
    const text = await file.text();
    const matrix = parseCsv(text);
    const withoutHeader = looksLikeHeader(matrix[0]) ? matrix.slice(1) : matrix;
    const columnCount = Math.max(defaultUploadFields.length, ...withoutHeader.map((row) => row.length), 1);
    const nextColumns = ensureUploadColumnCount(createDefaultColumns(), columnCount);
    setColumns(nextColumns);
    setRows(rowsFromMatrix(withoutHeader, nextColumns));
    setSelectedRows(new Set());
    setMessage(`${file.name} 파일을 불러왔습니다. 열 매핑과 검증 결과를 확인하세요.`);
    setResult("");
  }

  function submitStudents() {
    if (!targetClassGroupId) {
      setMessage("추가할 반을 먼저 선택해주세요.");
      return;
    }
    if (!hasNameMapping) {
      setMessage("학생명으로 매핑된 열이 필요합니다.");
      return;
    }

    const validItems = validation.filter((item) => item.errors.length === 0);
    if (validItems.length === 0) {
      setMessage("등록 가능한 학생 행이 없습니다. 학생명과 열 매핑을 확인해주세요.");
      return;
    }
    if (summary.warnings > 0 && !window.confirm(`확인 필요 행 ${summary.warnings}개가 있습니다. 등록 가능한 ${validItems.length}명만 계속 등록할까요?`)) return;
    if (summary.errors > 0 && !window.confirm(`오류가 있는 ${summary.errors}개 행은 제외하고 ${validItems.length}명만 등록할까요?`)) return;

    const payload = validItems.map((item) => {
      const row = parsedRows[item.index];
      return {
        name: row.name,
        phone: row.phone,
        parentPhone: row.parentPhone,
        schoolName: row.schoolName,
        grade: row.grade,
        classGroupId: targetClassGroupId,
        subject: row.subject,
        currentLevel: row.currentLevel,
        memo: row.memo,
      };
    });

    const formData = new FormData();
    formData.set("rows", JSON.stringify(payload));
    setResult("");
    setMessage("학생 등록 중입니다.");
    startTransition(() => {
      void createStudentsFromExcelUpload(formData)
        .then((response) => {
          const skipped = Math.max(0, summary.total - response.createdCount);
          setRows(blankRows(rowCountDefault, columns.length));
          setSelectedRows(new Set());
          setResult(`성공 ${response.createdCount}명 · 실패 0명 · 건너뜀 ${skipped}명`);
          setMessage("등록이 완료되었습니다. 학생 현황판을 갱신했습니다.");
          router.refresh();
        })
        .catch((error) => {
          setMessage(error instanceof Error ? error.message : "학생 등록에 실패했습니다.");
        });
    });
  }

  return (
    <>
      <button type="button" onClick={openModal} style={uploadButton}>엑셀 업로드</button>

      {open && (
        <div style={overlay} role="dialog" aria-modal="true" aria-label="학생 엑셀 업로드">
          <div style={modal}>
            <header style={modalHeader}>
              <div>
                <h2 style={modalTitle}>학생 엑셀 업로드</h2>
                <p style={modalDesc}>기존 엑셀 명단을 붙여넣거나 CSV로 불러온 뒤, 열 매핑과 대상 반을 확인하고 등록합니다.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} style={iconButton} aria-label="닫기">×</button>
            </header>

            <div style={toolbar}>
              <label style={classSelectLabel}>
                추가할 반
                <select value={targetClassGroupId} onChange={(event) => setTargetClassGroupId(event.target.value)} style={classSelect}>
                  <option value="">반 선택</option>
                  {classGroups.map((classGroup) => (
                    <option key={classGroup.id} value={classGroup.id}>{classGroup.teacherName ? `${classGroup.teacherName} / ${classGroup.name}` : classGroup.name}</option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={downloadSample} style={secondaryButton}>샘플 다운로드</button>
              <button type="button" onClick={() => fileInputRef.current?.click()} style={secondaryButton}>CSV 파일 업로드</button>
              <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls,text/csv" onChange={handleFile} style={{ display: "none" }} />
              <button type="button" onClick={addRow} style={secondaryButton}>행 추가</button>
              <button type="button" onClick={deleteSelectedRows} disabled={selectedRows.size === 0} style={{ ...secondaryButton, ...(selectedRows.size === 0 ? disabledButton : {}) }}>선택 행 삭제</button>
              <button type="button" onClick={resetRows} style={secondaryButton}>초기화</button>
            </div>

            <div style={summaryBar}>
              <strong>등록 가능 {summary.valid}명</strong>
              <span>확인 필요 {summary.warnings}명</span>
              <span>오류 {summary.errors}명</span>
              {globalErrors.map((item) => <strong key={item} style={errorText}>{item}</strong>)}
              <span style={hintText}>{message} 없는 열은 매핑하지 않으면 빈칸으로 등록됩니다.</span>
              {result && <strong style={successText}>{result}</strong>}
            </div>

            <div style={sheetWrap}>
              <table style={sheetTable}>
                <thead>
                  <tr>
                    <th style={rowHeader}>
                      <input type="checkbox" checked={activeIndexes.length > 0 && activeIndexes.every((index) => selectedRows.has(index))} onChange={toggleAllActiveRows} aria-label="활성 행 전체 선택" />
                    </th>
                    {columns.map((column, colIndex) => {
                      const duplicated = column.field !== "unused" && duplicateFields.includes(column.field);
                      return (
                        <th key={column.id} style={{ ...th, minWidth: column.width }}>
                          <div style={columnNumber}>{colIndex + 1}열</div>
                          <select value={column.field} onChange={(event) => updateColumnField(colIndex, event.target.value as UploadField)} style={{ ...mappingSelect, ...(duplicated ? duplicateSelect : {}) }} aria-label={`${colIndex + 1}열 매핑`}>
                            {uploadFieldOptions.map((option) => <option key={option.field} value={option.field}>{option.label}</option>)}
                          </select>
                        </th>
                      );
                    })}
                    <th style={actionHeader}>행</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => {
                    const rowValidation = validation.find((item) => item.index === rowIndex);
                    const hasError = Boolean(rowValidation?.errors.length);
                    const hasWarning = Boolean(rowValidation?.warnings.length);
                    const messages = [...(rowValidation?.errors ?? []), ...(rowValidation?.warnings ?? [])];
                    return (
                      <tr key={rowIndex} style={hasError ? errorRow : hasWarning ? warningRow : undefined}>
                        <td style={rowHeader} title={messages.join("\n")}>
                          <input type="checkbox" checked={selectedRows.has(rowIndex)} onChange={() => toggleRow(rowIndex)} aria-label={`${rowIndex + 1}행 선택`} />
                          <span style={rowNumber}>{rowIndex + 1}</span>
                          {hasError && <span style={errorBadge}>오류</span>}
                          {!hasError && hasWarning && <span style={warningBadge}>확인</span>}
                        </td>
                        {columns.map((column, colIndex) => (
                          <td key={column.id} style={td}>
                            <input value={getCell(row, colIndex)} onChange={(event) => updateCell(rowIndex, colIndex, event.target.value)} onPaste={(event) => handlePaste(event, rowIndex, colIndex)} placeholder={rowIndex === 0 ? fieldLabel(column.field) : ""} style={cellInput} aria-label={`${rowIndex + 1}행 ${colIndex + 1}열`} />
                          </td>
                        ))}
                        <td style={actionTd}><button type="button" onClick={() => deleteRow(rowIndex)} style={dangerSmallButton}>삭제</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <footer style={modalFooter}>
              <button type="button" onClick={() => setOpen(false)} style={ghostButton}>취소</button>
              <button type="button" onClick={submitStudents} disabled={!canSubmit} style={{ ...primaryButton, ...(!canSubmit ? disabledButton : {}) }}>학생 등록</button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

function createDefaultColumns() {
  return defaultUploadFields.map((field, index) => ({ id: `col-${index}`, field, width: fieldWidth(field) }));
}

function ensureUploadColumnCount(columns: UploadColumn[], count: number) {
  const next = columns.map((column) => ({ ...column }));
  while (next.length < count) next.push({ id: `col-${next.length}`, field: "unused", width: fieldWidth("unused") });
  return next;
}

function fieldLabel(field: UploadField) {
  return uploadFieldOptions.find((option) => option.field === field)?.label ?? "사용 안 함";
}

function fieldWidth(field: UploadField) {
  return uploadFieldOptions.find((option) => option.field === field)?.width ?? 120;
}

function blankRow(columnCount: number) {
  return Array.from({ length: columnCount }, () => "");
}

function blankRows(rowCount: number, columnCount: number) {
  return Array.from({ length: rowCount }, () => blankRow(columnCount));
}

function getCell(row: string[], index: number) {
  return String(row[index] ?? "");
}

function ensureColumnCount(row: string[], count: number) {
  const next = [...row];
  while (next.length < count) next.push("");
  return next;
}

function ensureRowCount(rows: string[][], count: number, columnCount: number) {
  const next = rows.map((row) => ensureColumnCount(row, columnCount));
  while (next.length < count) next.push(blankRow(columnCount));
  return next;
}

function ensureMinimumRows(rows: string[][], columnCount: number) {
  return rows.length > 0 ? rows.map((row) => ensureColumnCount(row, columnCount)) : blankRows(rowCountDefault, columnCount);
}

function activeRowIndexes(rows: string[][]) {
  return rows.map((row, index) => ({ row, index })).filter(({ row }) => row.some((value) => value.trim())).map(({ index }) => index);
}

function duplicatedMappedFields(columns: UploadColumn[]) {
  const count = new Map<UploadField, number>();
  for (const column of columns) {
    if (column.field === "unused") continue;
    count.set(column.field, (count.get(column.field) ?? 0) + 1);
  }
  return Array.from(count.entries()).filter(([, amount]) => amount > 1).map(([field]) => field);
}

function parseUploadRow(row: string[], columns: UploadColumn[]): ParsedUploadRow {
  const parsed: ParsedUploadRow = { name: "", phone: "", parentPhone: "", schoolName: "", grade: "", subject: "", currentLevel: "", memo: "", classGroupName: "" };
  columns.forEach((column, index) => {
    if (column.field === "unused") return;
    const field = column.field as keyof ParsedUploadRow;
    const value = normalizeUploadCell(column.field, getCell(row, index));
    if (!parsed[field]) parsed[field] = value;
  });
  return parsed;
}

function validateRows(parsedRows: ParsedUploadRow[], activeIndexes: number[], existingStudents: ExistingStudent[], targetClassName: string, duplicateFields: UploadField[]): RowValidation[] {
  const nameCounts = new Map<string, number>();
  for (const index of activeIndexes) {
    const name = parsedRows[index]?.name.trim();
    if (name) nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }

  return activeIndexes.map((index) => {
    const row = parsedRows[index];
    const errors: string[] = [];
    const warnings: string[] = [];
    const name = row.name.trim();
    if (!name) errors.push("학생명 필수");
    if (name && (nameCounts.get(name) ?? 0) > 1) warnings.push("업로드 데이터 안에서 이름 중복");
    for (const field of duplicateFields) warnings.push(`${fieldLabel(field)} 중복 매핑`);

    const phoneDigits = digits(row.phone);
    const parentDigits = digits(row.parentPhone);
    const phoneLast8 = phoneLastDigits(row.phone);
    const parentLast8 = phoneLastDigits(row.parentPhone);
    if (row.phone.trim() && phoneDigits.length < 8) warnings.push("학생 연락처 확인");
    if (row.parentPhone.trim() && parentDigits.length < 8) warnings.push("보호자 연락처 확인");

    const existingDuplicate = existingStudents.find((student) => {
      if (name && student.name === name) return true;
      const studentPhone = digits(student.phone);
      const existingParentPhone = digits(student.parentPhone);
      return Boolean(
        (phoneLast8 && (studentPhone.endsWith(phoneLast8) || existingParentPhone.endsWith(phoneLast8))) ||
          (parentLast8 && (studentPhone.endsWith(parentLast8) || existingParentPhone.endsWith(parentLast8)))
      );
    });
    if (existingDuplicate) warnings.push(`기존 학생 중복 가능: ${existingDuplicate.name}`);
    if (row.classGroupName.trim() && targetClassName && normalizeText(row.classGroupName) !== normalizeText(targetClassName)) warnings.push("엑셀 반 정보와 선택 반이 다름");
    return { index, errors, warnings };
  });
}

function pasteMatrix(rows: string[][], matrix: string[][], startRow: number, startCol: number, columns: UploadColumn[]) {
  const columnCount = columns.length;
  const next = ensureRowCount(rows, startRow + matrix.length + 4, columnCount);
  matrix.forEach((matrixRow, rowOffset) => {
    const targetIndex = startRow + rowOffset;
    const target = ensureColumnCount(next[targetIndex], columnCount);
    matrixRow.forEach((value, colOffset) => {
      const targetCol = startCol + colOffset;
      if (targetCol < columnCount) target[targetCol] = normalizeUploadCell(columns[targetCol]?.field, value);
    });
    next[targetIndex] = target;
  });
  return next;
}

function rowsFromMatrix(matrix: string[][], columns: UploadColumn[]) {
  const columnCount = columns.length;
  const rows = matrix.map((matrixRow) => {
    const row = blankRow(columnCount);
    matrixRow.forEach((value, index) => {
      if (index < columnCount) row[index] = normalizeUploadCell(columns[index]?.field, String(value ?? ""));
    });
    return row;
  });
  return rows.length > 0 ? [...rows, ...blankRows(4, columnCount)] : blankRows(rowCountDefault, columnCount);
}

function parsePastedTable(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((line, index, lines) => line.length > 0 || index < lines.length - 1).map((line) => line.split("\t"));
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const content = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  row.push(cell);
  rows.push(row);
  return rows.filter((items) => items.some((item) => item.trim()));
}

function looksLikeHeader(row?: string[]) {
  if (!row) return false;
  const joined = normalizeText(row.join(" "));
  return uploadFieldOptions.some((column) => column.field !== "unused" && joined.includes(normalizeText(column.label)));
}

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function digits(value: string) {
  return normalizePhoneNumber(value);
}

function normalizeUploadCell(field: UploadField | undefined, value: string) {
  const trimmed = String(value ?? "").trim().slice(0, 1000);
  return field === "phone" || field === "parentPhone" ? formatPhoneNumber(trimmed) : trimmed;
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

const uploadButton: CSSProperties = { height: 30, display: "inline-flex", alignItems: "center", border: "1px solid var(--asc-primary)", background: "var(--asc-primary-soft)", color: "var(--asc-primary-hover)", borderRadius: "var(--asc-radius-md)", padding: "0 11px", fontSize: 13, fontWeight: 900, whiteSpace: "nowrap", cursor: "pointer" };
const overlay: CSSProperties = { position: "fixed", inset: 0, zIndex: 80, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 };
const modal: CSSProperties = { width: "min(1360px, 96vw)", maxHeight: "92vh", background: "var(--asc-surface)", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-xl)", boxShadow: "var(--asc-shadow-modal)", display: "grid", gridTemplateRows: "auto auto auto minmax(320px, 1fr) auto", overflow: "hidden" };
const modalHeader: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16, padding: "16px 18px 10px", borderBottom: "1px solid var(--asc-border)" };
const modalTitle: CSSProperties = { margin: 0, fontSize: 22, fontWeight: 950, color: "var(--asc-text)" };
const modalDesc: CSSProperties = { margin: "6px 0 0", color: "var(--asc-text-muted)", fontSize: 13, fontWeight: 700 };
const iconButton: CSSProperties = { width: 32, height: 32, border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", background: "var(--asc-bg)", fontSize: 22, cursor: "pointer", color: "var(--asc-text)" };
const toolbar: CSSProperties = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "10px 18px", borderBottom: "1px solid var(--asc-border)" };
const classSelectLabel: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, color: "var(--asc-text)", fontSize: 13, fontWeight: 900 };
const classSelect: CSSProperties = { height: 32, minWidth: 230, border: "1px solid var(--asc-border-strong)", borderRadius: "var(--asc-radius-lg)", background: "var(--asc-bg)", padding: "0 10px", color: "var(--asc-text)", fontSize: 13, fontWeight: 800 };
const secondaryButton: CSSProperties = { height: 32, border: "1px solid var(--asc-border-strong)", borderRadius: "var(--asc-radius-lg)", background: "var(--asc-bg)", color: "var(--asc-text)", padding: "0 12px", fontWeight: 900, cursor: "pointer" };
const hintText: CSSProperties = { color: "var(--asc-text-muted)", fontSize: 12, fontWeight: 700 };
const summaryBar: CSSProperties = { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "8px 18px", borderBottom: "1px solid var(--asc-border)", fontSize: 13 };
const successText: CSSProperties = { color: "var(--asc-success)" };
const sheetWrap: CSSProperties = { overflow: "auto", background: "var(--asc-bg-subtle)" };
const sheetTable: CSSProperties = { borderCollapse: "collapse", minWidth: 1100, width: "100%", fontSize: 12, background: "var(--asc-bg)" };
const rowHeader: CSSProperties = { position: "sticky", left: 0, zIndex: 2, width: 74, minWidth: 74, border: "1px solid var(--asc-border)", background: "var(--asc-bg-subtle)", color: "var(--asc-text-subtle)", textAlign: "center", fontWeight: 900 };
const th: CSSProperties = { height: 58, border: "1px solid var(--asc-border)", background: "var(--asc-primary-soft)", color: "var(--asc-text)", fontWeight: 950, textAlign: "center", padding: 4 };
const columnNumber: CSSProperties = { color: "var(--asc-text-muted)", fontSize: 11, fontWeight: 900 };
const mappingSelect: CSSProperties = { width: "100%", height: 26, border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-md)", background: "var(--asc-bg)", color: "var(--asc-text)", fontSize: 12, fontWeight: 800 };
const duplicateSelect: CSSProperties = { borderColor: "var(--asc-warning)", background: "var(--asc-warning-soft)" };
const actionHeader: CSSProperties = { ...th, minWidth: 62, background: "var(--asc-bg-subtle)" };
const td: CSSProperties = { border: "1px solid var(--asc-border)", padding: 0, height: 32, background: "inherit" };
const actionTd: CSSProperties = { border: "1px solid var(--asc-border)", padding: 4, textAlign: "center", background: "inherit" };
const cellInput: CSSProperties = { width: "100%", height: 31, border: 0, outline: 0, padding: "0 7px", boxSizing: "border-box", background: "transparent", fontSize: 12 };
const rowNumber: CSSProperties = { display: "inline-block", minWidth: 18, marginLeft: 4 };
const errorRow: CSSProperties = { background: "var(--asc-danger-soft)" };
const warningRow: CSSProperties = { background: "var(--asc-warning-soft)" };
const errorText: CSSProperties = { color: "var(--asc-danger)", fontWeight: 900, lineHeight: 1.6 };
const errorBadge: CSSProperties = { marginLeft: 4, color: "var(--asc-danger)", fontSize: 10, fontWeight: 950 };
const warningBadge: CSSProperties = { marginLeft: 4, color: "var(--asc-warning-text)", fontSize: 10, fontWeight: 950 };
const dangerSmallButton: CSSProperties = { height: 24, border: "1px solid var(--asc-danger)", borderRadius: "var(--asc-radius-md)", background: "var(--asc-danger-soft)", color: "var(--asc-danger)", padding: "0 8px", fontSize: 11, fontWeight: 900, cursor: "pointer" };
const modalFooter: CSSProperties = { display: "flex", justifyContent: "flex-end", gap: 8, padding: 14, borderTop: "1px solid var(--asc-border)", background: "var(--asc-bg)" };
const ghostButton: CSSProperties = { height: 34, border: 0, background: "transparent", color: "var(--asc-text)", padding: "0 12px", fontWeight: 900, cursor: "pointer" };
const primaryButton: CSSProperties = { height: 34, border: "1px solid var(--asc-primary)", borderRadius: "var(--asc-radius-lg)", background: "var(--asc-primary)", color: "#fff", padding: "0 14px", fontWeight: 950, cursor: "pointer" };
const disabledButton: CSSProperties = { opacity: 0.45, cursor: "not-allowed" };
