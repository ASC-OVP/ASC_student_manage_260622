"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import {
  bulkStudentAssistant,
  bulkStudentClassGroup,
  bulkAssignment,
  bulkAttendance,
  createStudentFromSheet,
  createStudentMemoFromSheet,
  deleteStudentFromSheet,
  deleteStudentsFromSheet,
  updateAssignment,
  updateAttendance,
  updateScore,
  updateStudentClassGroup,
  updateStudentSheetCustomCell,
  updateStudentSheetCustomColumns,
  updateStudentSheetCell,
  updateStudentSheetOptions,
} from "@/app/students/actions";
import type { SheetCustomColumn } from "@/lib/studentSheetCustomColumns";
import type { SheetOption } from "@/lib/studentSheetOptions";

export type StudentSheetRow = {
  id: string;
  no: number;
  name: string;
  phone: string;
  parentPhone: string;
  schoolName: string;
  grade: string;
  classGroupId: string;
  classGroupName: string;
  subject: string;
  currentLevel: string;
  memo: string;
  attendance: string;
  assignment: string;
  assignmentScore: number | null;
  score: number | null;
  maxScore: number;
  attendanceByDate?: Record<string, string>;
  assignmentByDate?: Record<string, string>;
  scoreByDate?: Record<string, string>;
  customValues: Record<string, string>;
};

type DraftRow = StudentSheetRow & {
  assignmentScoreText: string;
  scoreText: string;
};

type BuiltInColumnKey =
  | "select"
  | "no"
  | "name"
  | "phone"
  | "parentPhone"
  | "schoolName"
  | "grade"
  | "classGroup"
  | "subject"
  | "currentLevel"
  | "attendance"
  | "assignment"
  | "assignmentScore"
  | "score"
  | "memo"
  | "detail";
type CustomColumnKey = `custom:${string}`;
type ColumnKey = BuiltInColumnKey | CustomColumnKey;

type EditableColumn = Extract<
  BuiltInColumnKey,
  | "name"
  | "phone"
  | "parentPhone"
  | "schoolName"
  | "grade"
  | "classGroup"
  | "subject"
  | "currentLevel"
  | "attendance"
  | "assignment"
  | "assignmentScore"
  | "score"
  | "memo"
> | CustomColumnKey;

type StudentTextField = Extract<EditableColumn, "name" | "phone" | "parentPhone" | "schoolName" | "grade" | "subject" | "currentLevel" | "memo">;

export type ClassGroupOption = {
  id: string;
  name: string;
  teacherName: string;
};

export type StaffOption = {
  id: string;
  name: string;
  role: string;
};

type SortDirection = "asc" | "desc";

type SortState = {
  column: ColumnKey;
  direction: SortDirection;
} | null;

type SaveOptions = {
  quiet?: boolean;
  refresh?: boolean;
};

type SelectedCell = {
  rowIndex: number;
  column: EditableColumn;
};

type CellMoveDirection = "up" | "down" | "left" | "right";
type SheetEditorElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

type SheetConfig = {
  order: ColumnKey[];
  hidden: ColumnKey[];
};

type Props = {
  date: string;
  mode: string;
  rows: StudentSheetRow[];
  attendanceOptions: SheetOption[];
  assignmentOptions: SheetOption[];
  customColumns: SheetCustomColumn[];
  classGroupOptions: ClassGroupOption[];
  teachers: StaffOption[];
  assistants: StaffOption[];
  preservedQuery: string;
};

const storagePrefix = "asc.studentSheet.config.v7.";
const builtInColumns: BuiltInColumnKey[] = [
  "select",
  "no",
  "name",
  "phone",
  "parentPhone",
  "schoolName",
  "grade",
  "classGroup",
  "subject",
  "currentLevel",
  "attendance",
  "assignment",
  "assignmentScore",
  "score",
  "memo",
  "detail",
];
const requiredColumns = new Set<ColumnKey>(["select", "name"]);
const editableColumns = new Set<ColumnKey>([
  "name",
  "phone",
  "parentPhone",
  "schoolName",
  "grade",
  "classGroup",
  "subject",
  "currentLevel",
  "attendance",
  "assignment",
  "assignmentScore",
  "score",
  "memo",
]);
const columnLabels: Record<BuiltInColumnKey, string> = {
  select: "선택",
  no: "NO",
  name: "이름",
  phone: "학생 연락처",
  parentPhone: "보호자 연락처",
  schoolName: "학교",
  grade: "학년",
  classGroup: "반",
  subject: "과목",
  currentLevel: "레벨",
  attendance: "출석",
  assignment: "과제",
  assignmentScore: "과제 점수",
  score: "성적",
  memo: "최근 메모",
  detail: "수정",
};
const columnWidths: Record<BuiltInColumnKey, number> = {
  select: 58,
  no: 54,
  name: 132,
  phone: 132,
  parentPhone: 132,
  schoolName: 120,
  grade: 82,
  classGroup: 150,
  subject: 126,
  currentLevel: 110,
  attendance: 96,
  assignment: 98,
  assignmentScore: 104,
  score: 92,
  memo: 260,
  detail: 72,
};

function customColumnKey(columnId: string): CustomColumnKey {
  return `custom:${columnId}`;
}

function customColumnId(column: CustomColumnKey) {
  return column.replace(/^custom:/, "");
}

function isCustomColumn(column: ColumnKey): column is CustomColumnKey {
  return column.startsWith("custom:");
}

function columnLabel(column: ColumnKey, customColumns: SheetCustomColumn[]) {
  if (isCustomColumn(column)) {
    return customColumns.find((customColumn) => customColumn.id === customColumnId(column))?.label ?? "커스텀";
  }

  return columnLabels[column];
}

function columnWidth(column: ColumnKey) {
  return isCustomColumn(column) ? 136 : columnWidths[column];
}

function makeAllColumns(customColumns: SheetCustomColumn[]) {
  return [...builtInColumns, ...customColumns.map((column) => customColumnKey(column.id))];
}

function defaultConfig(mode: string, customColumns: SheetCustomColumn[]): SheetConfig {
  const customKeys = customColumns.filter((column) => column.enabled).map((column) => customColumnKey(column.id));
  const visibleByMode: Record<string, ColumnKey[]> = {
    attendance: ["select", "no", "name", "classGroup", "schoolName", "grade", "attendance", "memo", ...customKeys],
    assignment: ["select", "no", "name", "classGroup", "schoolName", "grade", "assignment", "assignmentScore", "memo", ...customKeys],
    score: ["select", "no", "name", "classGroup", "schoolName", "grade", "score", "memo", ...customKeys],
    all: [
      "select",
      "no",
      "name",
      "classGroup",
      "phone",
      "parentPhone",
      "schoolName",
      "grade",
      "subject",
      "currentLevel",
      "attendance",
      "assignment",
      "assignmentScore",
      "score",
      "memo",
      ...customKeys,
    ],
  };
  const visible = new Set(visibleByMode[mode] ?? visibleByMode.all);
  const allColumns = makeAllColumns(customColumns);

  return {
    order: allColumns,
    hidden: allColumns.filter((column) => !visible.has(column)),
  };
}

function normalizeConfig(config: SheetConfig | null, mode: string, customColumns: SheetCustomColumn[]): SheetConfig {
  const allColumns = makeAllColumns(customColumns);
  const fallback = defaultConfig(mode, customColumns);
  if (!config) return fallback;
  if (!Array.isArray(config.order) || !Array.isArray(config.hidden)) return fallback;

  const valid = new Set(allColumns);
  const seen = new Set<ColumnKey>();
  const order: ColumnKey[] = [];

  for (const column of config.order) {
    if (valid.has(column) && !seen.has(column)) {
      seen.add(column);
      order.push(column);
    }
  }

  for (const column of allColumns) {
    if (!seen.has(column)) {
      seen.add(column);
      order.push(column);
    }
  }

  const hidden = config.hidden.filter((column): column is ColumnKey => valid.has(column) && !requiredColumns.has(column));

  return { order, hidden };
}

function parseStoredConfig(value: string, mode: string, customColumns: SheetCustomColumn[]) {
  if (!value) return null;

  try {
    return normalizeConfig(JSON.parse(value) as SheetConfig, mode, customColumns);
  } catch {
    return null;
  }
}

function toDraftRows(rows: StudentSheetRow[]) {
  return rows.map((row) => ({
    ...row,
    assignmentScoreText: row.assignmentScore === null ? "" : String(row.assignmentScore),
    scoreText: row.score === null ? "" : String(row.score),
  }));
}

function enabledOptions(options: SheetOption[]) {
  const enabled = options.filter((option) => option.enabled);
  return enabled.length > 0 ? enabled : options;
}

function createCustomOption(options: SheetOption[]) {
  let index = options.length + 1;
  let value = `CUSTOM_${Date.now().toString(36).toUpperCase()}_${index}`;

  while (options.some((option) => option.value === value)) {
    index += 1;
    value = `CUSTOM_${Date.now().toString(36).toUpperCase()}_${index}`;
  }

  return { value, label: "새 선택지", enabled: true };
}

function defaultSortDirection(column: ColumnKey): SortDirection {
  return column === "score" || column === "assignmentScore" ? "desc" : "asc";
}

function sortAndFilterRows(rows: DraftRow[], sortState: SortState, search: string) {
  const keyword = search.trim().toLocaleLowerCase("ko-KR");
  const filtered = keyword
    ? rows.filter((row) => rowSearchText(row).toLocaleLowerCase("ko-KR").includes(keyword))
    : rows;

  if (!sortState) return filtered;

  return [...filtered].sort((a, b) => {
    const result = compareCellValue(cellSortValue(a, sortState.column), cellSortValue(b, sortState.column));
    return sortState.direction === "asc" ? result : -result;
  });
}

function rowSearchText(row: DraftRow) {
  return [
    row.name,
    row.phone,
    row.parentPhone,
    row.schoolName,
    row.grade,
    row.classGroupName,
    row.subject,
    row.currentLevel,
    row.memo,
    row.attendance,
    row.assignment,
    row.assignmentScoreText,
    row.scoreText,
    ...Object.values(row.customValues),
  ].join(" ");
}

function cellSortValue(row: DraftRow, column: ColumnKey) {
  if (isCustomColumn(column)) return row.customValues[customColumnId(column)] ?? "";

  if (column === "assignmentScore") return row.assignmentScoreText ? Number(row.assignmentScoreText) : -1;
  if (column === "score") return row.scoreText ? Number(row.scoreText) : -1;
  if (column === "no") return row.no;
  if (column === "classGroup") return row.classGroupName;
  if (column === "select" || column === "detail") return "";

  return row[column] ?? "";
}

function compareCellValue(a: string | number, b: string | number) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "ko-KR", { numeric: true });
}

export default function StudentSheetMatrix({
  date,
  mode,
  rows,
  attendanceOptions,
  assignmentOptions,
  customColumns,
  classGroupOptions,
  teachers,
  assistants,
  preservedQuery,
}: Props) {
  const router = useRouter();
  const storageKey = `${storagePrefix}${mode}`;
  const [customColumnDrafts, setCustomColumnDrafts] = useState<SheetCustomColumn[]>(() => customColumns);
  const storedConfigText = useSyncExternalStore(
    (notify) => {
      if (typeof window === "undefined") return () => undefined;

      const onStorage = (event: StorageEvent) => {
        if (event.key === storageKey) notify();
      };

      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    },
    () => (typeof window === "undefined" ? "" : window.localStorage.getItem(storageKey) ?? ""),
    () => ""
  );
  const storedConfig = useMemo(
    () => parseStoredConfig(storedConfigText, mode, customColumnDrafts),
    [customColumnDrafts, mode, storedConfigText]
  );
  const [manualConfig, setManualConfig] = useState<SheetConfig | null>(null);
  const sheetConfig = manualConfig ?? storedConfig ?? defaultConfig(mode, customColumnDrafts);
  const hiddenColumns = useMemo(() => new Set(sheetConfig.hidden), [sheetConfig.hidden]);
  const enabledCustomColumnIds = useMemo(
    () => new Set(customColumnDrafts.filter((column) => column.enabled).map((column) => column.id)),
    [customColumnDrafts]
  );
  const visibleColumns = useMemo(
    () =>
      sheetConfig.order.filter((column) => {
        if (hiddenColumns.has(column)) return false;
        return !isCustomColumn(column) || enabledCustomColumnIds.has(customColumnId(column));
      }),
    [enabledCustomColumnIds, hiddenColumns, sheetConfig.order]
  );
  const editableVisibleColumns = useMemo(
    () => visibleColumns.filter((column): column is EditableColumn => isCustomColumn(column) || editableColumns.has(column)),
    [visibleColumns]
  );
  const tableMinWidth = visibleColumns.reduce((sum, column) => sum + columnWidth(column), 0);

  const [draftRows, setDraftRows] = useState<DraftRow[]>(() => toDraftRows(rows));
  const [selectedRows, setSelectedRows] = useState<Set<string>>(() => new Set());
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [openColumnMenu, setOpenColumnMenu] = useState<ColumnKey | null>(null);
  const [draggingColumn, setDraggingColumn] = useState<ColumnKey | null>(null);
  const [sortState, setSortState] = useState<SortState>(null);
  const [sheetSearch, setSheetSearch] = useState("");
  const [newCustomColumnLabel, setNewCustomColumnLabel] = useState("");
  const [attendanceDraftOptions, setAttendanceDraftOptions] = useState<SheetOption[]>(() => attendanceOptions);
  const [assignmentDraftOptions, setAssignmentDraftOptions] = useState<SheetOption[]>(() => assignmentOptions);
  const visibleAttendanceOptions = useMemo(() => enabledOptions(attendanceDraftOptions), [attendanceDraftOptions]);
  const visibleAssignmentOptions = useMemo(() => enabledOptions(assignmentDraftOptions), [assignmentDraftOptions]);
  const [bulkAttendanceStatus, setBulkAttendanceStatus] = useState(() => enabledOptions(attendanceOptions)[0]?.label ?? "출석");
  const [bulkAssignmentStatus, setBulkAssignmentStatus] = useState(() => enabledOptions(assignmentOptions)[0]?.label ?? "제출");
  const [bulkClassGroupId, setBulkClassGroupId] = useState("");
  const [bulkAssistantId, setBulkAssistantId] = useState("");
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [rowMenuOpen, setRowMenuOpen] = useState<string | null>(null);
  const [rowMenuPosition, setRowMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DraftRow | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [quickMemoTarget, setQuickMemoTarget] = useState<DraftRow | null>(null);
  const [statusText, setStatusText] = useState("");
  const [isPending, startTransition] = useTransition();
  const cellRefs = useRef<Record<string, HTMLTableCellElement | null>>({});

  const sortedRows = useMemo(
    () => sortAndFilterRows(draftRows, sortState, sheetSearch),
    [draftRows, sheetSearch, sortState]
  );
  const selectedIds = useMemo(() => [...selectedRows], [selectedRows]);
  const allSelected = sortedRows.length > 0 && sortedRows.every((row) => selectedRows.has(row.id));
  const hiddenVisibleColumns = useMemo(
    () => sheetConfig.order.filter((column) => hiddenColumns.has(column) && !requiredColumns.has(column)),
    [hiddenColumns, sheetConfig.order]
  );

  function storeConfig(config: SheetConfig, columns = customColumnDrafts) {
    const next = normalizeConfig(config, mode, columns);
    setManualConfig(next);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    }
  }

  function runSave(action: () => Promise<void>, doneText: string, options: SaveOptions = {}) {
    if (!options.quiet) setStatusText("저장 중");

    startTransition(() => {
      void action()
        .then(() => {
          if (!options.quiet) setStatusText(doneText);
          if (options.refresh) router.refresh();
        })
        .catch((error) => {
          setStatusText(error instanceof Error ? error.message : "저장 실패");
          if (options.refresh) router.refresh();
        });
    });
  }

  function updateDraftRow(rowId: string, patch: Partial<DraftRow>) {
    setDraftRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, ...patch } : row))
    );
  }

  function toggleColumn(column: ColumnKey) {
    if (requiredColumns.has(column)) return;

    const hidden = new Set(sheetConfig.hidden);
    if (hidden.has(column)) hidden.delete(column);
    else hidden.add(column);

    storeConfig({ ...sheetConfig, hidden: [...hidden] });
  }

  function moveColumn(column: ColumnKey, direction: -1 | 1) {
    const index = sheetConfig.order.indexOf(column);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= sheetConfig.order.length) return;

    const nextOrder = [...sheetConfig.order];
    const [removed] = nextOrder.splice(index, 1);
    nextOrder.splice(nextIndex, 0, removed);
    storeConfig({ ...sheetConfig, order: nextOrder });
  }

  function moveColumnTo(source: ColumnKey, target: ColumnKey) {
    if (source === target) return;
    if (!sheetConfig.order.includes(source) || !sheetConfig.order.includes(target)) return;

    const nextOrder = sheetConfig.order.filter((column) => column !== source);
    const targetIndex = nextOrder.indexOf(target);
    nextOrder.splice(targetIndex, 0, source);
    storeConfig({ ...sheetConfig, order: nextOrder });
  }

  function resetColumns() {
    storeConfig(defaultConfig(mode, customColumnDrafts));
  }

  function toggleSort(column: ColumnKey, direction?: SortDirection) {
    if (column === "select" || column === "detail") return;

    setSortState((current) => {
      if (direction) return { column, direction };
      if (current?.column !== column) return { column, direction: defaultSortDirection(column) };
      return { column, direction: current.direction === "asc" ? "desc" : "asc" };
    });
    setOpenColumnMenu(null);
  }

  function saveCustomColumns(nextColumns: SheetCustomColumn[], doneText: string) {
    setCustomColumnDrafts(nextColumns);

    const nextConfig = normalizeConfig(
      { ...sheetConfig, order: [...sheetConfig.order, ...nextColumns.map((column) => customColumnKey(column.id))] },
      mode,
      nextColumns
    );
    storeConfig(nextConfig, nextColumns);

    const formData = new FormData();
    formData.set("columns", JSON.stringify(nextColumns));

    runSave(() => updateStudentSheetCustomColumns(formData), doneText);
  }

  function addCustomColumn() {
    const label = newCustomColumnLabel.trim();
    if (!label) return;

    const baseId = label
      .replace(/\s+/g, "_")
      .replace(/[^A-Za-z0-9_-]/g, "")
      .slice(0, 28)
      || "custom";
    let index = customColumnDrafts.length + 1;
    let id = `${baseId}_${Date.now().toString(36)}_${index}`;

    while (customColumnDrafts.some((column) => column.id === id)) {
      index += 1;
      id = `${baseId}_${Date.now().toString(36)}_${index}`;
    }

    saveCustomColumns([...customColumnDrafts, { id, label: label.slice(0, 30), enabled: true }], "열 추가됨");
    setNewCustomColumnLabel("");
  }

  function updateCustomColumn(index: number, patch: Partial<SheetCustomColumn>) {
    const nextColumns = customColumnDrafts.map((column, columnIndex) =>
      columnIndex === index ? { ...column, ...patch, label: (patch.label ?? column.label).slice(0, 30) } : column
    );
    saveCustomColumns(nextColumns, "열 설정 저장됨");
  }

  function saveCustomCell(row: DraftRow, columnId: string, value: string) {
    updateDraftRow(row.id, { customValues: { ...row.customValues, [columnId]: value } });

    const formData = new FormData();
    formData.set("studentId", row.id);
    formData.set("columnId", columnId);
    formData.set("value", value);

    runSave(() => updateStudentSheetCustomCell(formData), "커스텀 칸 저장됨", { quiet: true });
  }

  function updateOptionDraft(target: "attendance" | "assignment", index: number, patch: Partial<SheetOption>) {
    const setter = target === "attendance" ? setAttendanceDraftOptions : setAssignmentDraftOptions;
    setter((current) => current.map((option, optionIndex) => (optionIndex === index ? { ...option, ...patch } : option)));
  }

  function addOptionDraft(target: "attendance" | "assignment") {
    const setter = target === "attendance" ? setAttendanceDraftOptions : setAssignmentDraftOptions;
    setter((current) => [...current, createCustomOption(current)]);
  }

  function removeOptionDraft(target: "attendance" | "assignment", index: number) {
    const setter = target === "attendance" ? setAttendanceDraftOptions : setAssignmentDraftOptions;
    setter((current) => (current.length <= 1 ? current : current.filter((_, optionIndex) => optionIndex !== index)));
  }

  function saveOptionSettings(target: "attendance" | "assignment") {
    const options = target === "attendance" ? attendanceDraftOptions : assignmentDraftOptions;
    const formData = new FormData();
    formData.set("target", target);
    formData.set("options", JSON.stringify(options));

    runSave(() => updateStudentSheetOptions(formData), "선택지 저장됨");
  }

  function saveStudentCell(row: DraftRow, field: StudentTextField, value: string) {
    updateDraftRow(row.id, { [field]: value } as Partial<DraftRow>);

    const formData = new FormData();
    formData.set("studentId", row.id);
    formData.set("field", field);
    formData.set("value", value);

    runSave(() => updateStudentSheetCell(formData), "학생 정보 저장됨", { quiet: true });
  }

  function saveClassGroup(row: DraftRow, classGroupId: string) {
    const classGroup = classGroupOptions.find((option) => option.id === classGroupId);
    updateDraftRow(row.id, {
      classGroupId,
      classGroupName: classGroup ? classGroup.name : "",
    });

    const formData = new FormData();
    formData.set("studentId", row.id);
    formData.set("classGroupId", classGroupId);

    runSave(() => updateStudentClassGroup(formData), "반 저장됨", { quiet: true });
  }

  function saveAttendance(row: DraftRow, status: string) {
    updateDraftRow(row.id, { attendance: status });

    const formData = new FormData();
    formData.set("studentId", row.id);
    formData.set("date", date);
    formData.set("status", status);

    runSave(() => updateAttendance(formData), "출석 저장됨", { quiet: true });
  }

  function saveAssignment(row: DraftRow, status: string) {
    updateDraftRow(row.id, { assignment: status });

    const formData = new FormData();
    formData.set("studentId", row.id);
    formData.set("date", date);
    formData.set("title", "과제");
    formData.set("status", status);

    runSave(() => updateAssignment(formData), "과제 저장됨", { quiet: true });
  }

  function saveAssignmentScore(row: DraftRow, value: string) {
    updateDraftRow(row.id, { assignmentScoreText: value });

    const formData = new FormData();
    formData.set("studentId", row.id);
    formData.set("date", date);
    formData.set("title", "과제");
    formData.set("status", row.assignment);
    formData.set("score", value);

    runSave(() => updateAssignment(formData), "과제 점수 저장됨", { quiet: true });
  }

  function saveScore(row: DraftRow, value: string) {
    updateDraftRow(row.id, { scoreText: value });

    const formData = new FormData();
    formData.set("studentId", row.id);
    formData.set("date", date);
    formData.set("title", "테스트");
    formData.set("score", value);
    formData.set("maxScore", String(row.maxScore || 100));

    runSave(() => updateScore(formData), "성적 저장됨", { quiet: true });
  }

  function applyBulkAttendance() {
    if (selectedIds.length === 0) return;

    setDraftRows((current) =>
      current.map((row) =>
        selectedRows.has(row.id) ? { ...row, attendance: bulkAttendanceStatus } : row
      )
    );

    const formData = new FormData();
    formData.set("date", date);
    formData.set("status", bulkAttendanceStatus);
    selectedIds.forEach((id) => formData.append("studentIds", id));

    runSave(() => bulkAttendance(formData), "출석 일괄 변경됨");
  }

  function applyBulkAssignment() {
    if (selectedIds.length === 0) return;

    setDraftRows((current) =>
      current.map((row) =>
        selectedRows.has(row.id) ? { ...row, assignment: bulkAssignmentStatus } : row
      )
    );

    const formData = new FormData();
    formData.set("date", date);
    formData.set("status", bulkAssignmentStatus);
    selectedIds.forEach((id) => formData.append("studentIds", id));

    runSave(() => bulkAssignment(formData), "과제 일괄 변경됨");
  }

  function applyBulkClassGroup() {
    if (selectedIds.length === 0) return;

    const classGroup = classGroupOptions.find((option) => option.id === bulkClassGroupId);
    setDraftRows((current) =>
      current.map((row) =>
        selectedRows.has(row.id)
          ? { ...row, classGroupId: bulkClassGroupId, classGroupName: classGroup?.name ?? "" }
          : row
      )
    );

    const formData = new FormData();
    formData.set("classGroupId", bulkClassGroupId);
    selectedIds.forEach((id) => formData.append("studentIds", id));

    runSave(() => bulkStudentClassGroup(formData), "반 이동 저장됨", { refresh: true });
  }

  function applyBulkAssistant() {
    if (selectedIds.length === 0) return;

    const formData = new FormData();
    formData.set("assistantId", bulkAssistantId);
    selectedIds.forEach((id) => formData.append("studentIds", id));

    runSave(() => bulkStudentAssistant(formData), "담당 조교 저장됨", { refresh: true });
  }

  function submitAddStudent(formData: FormData) {
    runSave(() => createStudentFromSheet(formData), "학생 추가됨", { refresh: true });
    setAddPanelOpen(false);
  }

  function submitQuickMemo(formData: FormData) {
    const content = String(formData.get("content") ?? "").trim();
    if (!quickMemoTarget || !content) return;

    formData.set("studentId", quickMemoTarget.id);
    runSave(() => createStudentMemoFromSheet(formData), "메모 추가됨", { refresh: true });
    updateDraftRow(quickMemoTarget.id, { memo: content });
    setQuickMemoTarget(null);
  }

  function confirmDeleteStudent() {
    if (!deleteTarget) return;

    const targetId = deleteTarget.id;
    const formData = new FormData();
    formData.set("studentId", targetId);

    setDraftRows((current) => current.filter((row) => row.id !== targetId));
    setSelectedRows((current) => {
      const next = new Set(current);
      next.delete(targetId);
      return next;
    });
    setDeleteTarget(null);
    setRowMenuOpen(null);
    runSave(() => deleteStudentFromSheet(formData), "학생 삭제됨", { refresh: true });
  }

  function confirmBulkDelete() {
    if (selectedIds.length === 0) return;

    const ids = selectedIds;
    const formData = new FormData();
    ids.forEach((id) => formData.append("studentIds", id));

    setDraftRows((current) => current.filter((row) => !selectedRows.has(row.id)));
    setSelectedRows(new Set());
    setBulkDeleteOpen(false);
    runSave(() => deleteStudentsFromSheet(formData), "선택 학생 삭제됨", { refresh: true });
  }

  function toggleRow(rowId: string) {
    setSelectedRows((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }

  function toggleAllRows() {
    setSelectedRows(allSelected ? new Set() : new Set(sortedRows.map((row) => row.id)));
  }

  function cellKey(rowIndex: number, column: EditableColumn) {
    return `${rowIndex}:${column}`;
  }

  function focusCell(rowIndex: number, column: EditableColumn, focusEditor = true) {
    const key = cellKey(rowIndex, column);
    const cell = cellRefs.current[key];
    if (focusEditor) {
      const editor = cell?.querySelector<SheetEditorElement>("input:not([type='hidden']), select, textarea");
      if (editor) {
        editor.focus();
        if (editor instanceof HTMLInputElement && editor.type !== "date" && editor.type !== "time") {
          editor.select();
        }
      } else {
        cell?.focus();
      }
    } else {
      cell?.focus();
    }
    setSelectedCell({ rowIndex, column });
  }

  function moveCell(event: KeyboardEvent<Element>, rowIndex: number, column: EditableColumn, direction: CellMoveDirection) {
    const columnIndex = editableVisibleColumns.indexOf(column);
    let nextRow = rowIndex;
    let nextColumnIndex = columnIndex;

    if (direction === "down") nextRow += 1;
    else if (direction === "up") nextRow -= 1;
    else if (direction === "right") nextColumnIndex += 1;
    else if (direction === "left") nextColumnIndex -= 1;

    if (nextRow < 0 || nextRow >= sortedRows.length) return;
    if (nextColumnIndex < 0 || nextColumnIndex >= editableVisibleColumns.length) return;

    event.preventDefault();
    focusCell(nextRow, editableVisibleColumns[nextColumnIndex]);
  }

  function onCellKeyDown(event: KeyboardEvent<HTMLTableCellElement>, rowIndex: number, column: EditableColumn) {
    if (event.target !== event.currentTarget) return;

    if (event.key === "ArrowDown") moveCell(event, rowIndex, column, "down");
    else if (event.key === "ArrowUp") moveCell(event, rowIndex, column, "up");
    else if (event.key === "ArrowRight") moveCell(event, rowIndex, column, "right");
    else if (event.key === "ArrowLeft") moveCell(event, rowIndex, column, "left");
    else if (event.key === "Enter") moveCell(event, rowIndex, column, event.shiftKey ? "up" : "down");
    else if (event.key === "Tab") moveCell(event, rowIndex, column, event.shiftKey ? "left" : "right");
  }

  function onEditorKeyDown(event: KeyboardEvent<SheetEditorElement>, rowIndex: number, column: EditableColumn) {
    const target = event.currentTarget;

    if (event.key === "Enter") {
      target.blur();
      moveCell(event, rowIndex, column, event.shiftKey ? "up" : "down");
      return;
    }

    if (event.key === "Tab") {
      target.blur();
      moveCell(event, rowIndex, column, event.shiftKey ? "left" : "right");
      return;
    }

    if (event.key === "ArrowUp" && !(target instanceof HTMLSelectElement)) {
      target.blur();
      moveCell(event, rowIndex, column, "up");
      return;
    }

    if (event.key === "ArrowDown" && !(target instanceof HTMLSelectElement)) {
      target.blur();
      moveCell(event, rowIndex, column, "down");
      return;
    }

    if (event.key === "ArrowLeft" && isCursorAtStart(target)) {
      target.blur();
      moveCell(event, rowIndex, column, "left");
      return;
    }

    if (event.key === "ArrowRight" && isCursorAtEnd(target)) {
      target.blur();
      moveCell(event, rowIndex, column, "right");
    }
  }

  return (
    <div style={isFullscreen ? fullscreenShell : matrixShell}>

      <div style={bulkBar}>
        <div style={sheetMeta}>
          <b>{date}</b>
          <span>{modeLabel(mode)}</span>
          <span>{sortedRows.length}/{draftRows.length}명</span>
        </div>

        <div style={sheetModeTabs}>
          {(["all", "lesson", "attendance", "assignment", "score"] as const).map((tabMode) => (
            <Link
              key={tabMode}
              href={`/students?tab=${tabMode}${preservedQuery ? `&${preservedQuery}` : ""}`}
              style={{ ...sheetModeTab, ...(mode === tabMode ? sheetModeTabActive : {}) }}
            >
              {modeLabel(tabMode)}
            </Link>
          ))}
        </div>

        <span style={keyboardHint}>↑↓←→ 이동 · Enter 아래 · Tab 오른쪽</span>

        <input
          value={sheetSearch}
          onChange={(event) => setSheetSearch(event.target.value)}
          placeholder="시트 검색"
          style={sheetSearchInput}
          aria-label="시트 검색"
        />

        <button type="button" onClick={() => setAddPanelOpen(true)} style={primaryToolbarButton}>
          + 학생 추가
        </button>

        <label style={checkAllLabel}>
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAllRows}
            disabled={draftRows.length === 0 || isPending}
          />
          <span>{selectedRows.size}명 선택</span>
        </label>

        <button type="button" onClick={() => setSettingsOpen((open) => !open)} style={settingsButton}>
          {settingsOpen ? "도구 닫기" : "시트 도구"}
        </button>
        <button type="button" onClick={() => setIsFullscreen((current) => !current)} style={fullscreenButton}>
          {isFullscreen ? "원래 화면" : "전체화면"}
        </button>
        {statusText && <span style={{ ...saveStatus, ...(isPending ? pendingStatus : {}) }}>{statusText}</span>}
      </div>

      {settingsOpen && (
        <div style={settingsPanel}>
          <div style={toolPanelHead}>
            <div>
              <b>시트 도구</b>
              <span>열 제목을 드래그하면 순서가 바뀌고, ⋯ 메뉴에서 정렬/숨김을 조절합니다.</span>
            </div>
            <button type="button" onClick={resetColumns} style={smallGhostButton}>
              기본 보기
            </button>
          </div>

          <section style={settingsSection}>
            <div style={toolRow}>
              <b>숨긴 열</b>
              <div style={hiddenChipWrap}>
                {hiddenVisibleColumns.map((column) => (
                  <button key={column} type="button" onClick={() => toggleColumn(column)} style={hiddenChip}>
                    {columnLabel(column, customColumnDrafts)} 보이기
                  </button>
                ))}
                {hiddenVisibleColumns.length === 0 && <span style={emptyInline}>숨긴 열 없음</span>}
              </div>
            </div>

            <div style={toolRow}>
              <b>새 열</b>
              <div style={optionActions}>
                <input
                  value={newCustomColumnLabel}
                  onChange={(event) => setNewCustomColumnLabel(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addCustomColumn();
                    }
                  }}
                  placeholder="상담 여부, 수업 반..."
                  style={customColumnInput}
                />
                <button type="button" onClick={addCustomColumn} disabled={isPending} style={smallSaveButton}>
                  열 추가
                </button>
              </div>
            </div>
          </section>

          <details style={toolDetails}>
            <summary style={toolSummary}>커스텀 열 관리</summary>
            <div style={customColumnList}>
              {customColumnDrafts.map((column, index) => (
                <div key={column.id} style={customColumnItem}>
                  <label style={columnToggle}>
                    <input
                      type="checkbox"
                      checked={column.enabled}
                      onChange={(event) => updateCustomColumn(index, { enabled: event.target.checked })}
                      disabled={isPending}
                    />
                    사용
                  </label>
                  <input
                    defaultValue={column.label}
                    onBlur={(event) => updateCustomColumn(index, { label: event.currentTarget.value })}
                    disabled={isPending}
                    style={optionLabelInput}
                    aria-label={`${column.label} 열 이름`}
                  />
                  <button
                    type="button"
                    onClick={() => saveCustomColumns(customColumnDrafts.filter((_, columnIndex) => columnIndex !== index), "열 삭제됨")}
                    disabled={isPending}
                    style={deleteOptionButton}
                  >
                    삭제
                  </button>
                </div>
              ))}
              {customColumnDrafts.length === 0 && <span style={emptyInline}>추가한 열이 없습니다.</span>}
            </div>
          </details>

          <details style={toolDetails}>
            <summary style={toolSummary}>출석 선택지</summary>
            <OptionSettings
              title="출석 선택지"
              options={attendanceDraftOptions}
              disabled={isPending}
              onChange={(index, patch) => updateOptionDraft("attendance", index, patch)}
              onAdd={() => addOptionDraft("attendance")}
              onRemove={(index) => removeOptionDraft("attendance", index)}
              onSave={() => saveOptionSettings("attendance")}
            />
          </details>

          <details style={toolDetails}>
            <summary style={toolSummary}>과제 선택지</summary>
            <OptionSettings
              title="과제 선택지"
              options={assignmentDraftOptions}
              disabled={isPending}
              onChange={(index, patch) => updateOptionDraft("assignment", index, patch)}
              onAdd={() => addOptionDraft("assignment")}
              onRemove={(index) => removeOptionDraft("assignment", index)}
              onSave={() => saveOptionSettings("assignment")}
            />
          </details>
        </div>
      )}

      {selectedIds.length > 0 && (
        <div style={selectionActionBar}>
          <b>{selectedIds.length}명 선택</b>
          <div style={bulkGroup}>
            <input
              value={bulkAttendanceStatus}
              onChange={(event) => setBulkAttendanceStatus(event.target.value)}
              list="bulk-attendance-options"
              autoComplete="off"
              style={bulkSelect}
              disabled={isPending}
              aria-label="선택 학생 출석 변경"
            />
            <datalist id="bulk-attendance-options">
              {visibleAttendanceOptions.map((option) => (
                <option key={option.value} value={option.label} />
              ))}
            </datalist>
            <button type="button" onClick={applyBulkAttendance} disabled={isPending} style={bulkButton}>
              출석 변경
            </button>
          </div>
          <div style={bulkGroup}>
            <input
              value={bulkAssignmentStatus}
              onChange={(event) => setBulkAssignmentStatus(event.target.value)}
              list="bulk-assignment-options"
              autoComplete="off"
              style={bulkSelect}
              disabled={isPending}
              aria-label="선택 학생 과제 변경"
            />
            <datalist id="bulk-assignment-options">
              {visibleAssignmentOptions.map((option) => (
                <option key={option.value} value={option.label} />
              ))}
            </datalist>
            <button type="button" onClick={applyBulkAssignment} disabled={isPending} style={bulkButton}>
              과제 변경
            </button>
          </div>
          <div style={bulkGroup}>
            <select
              value={bulkClassGroupId}
              onChange={(event) => setBulkClassGroupId(event.target.value)}
              style={bulkWideSelect}
              disabled={isPending}
              aria-label="선택 학생 반 이동"
            >
              <option value="">반 미지정</option>
              {classGroupOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.teacherName ? `${option.teacherName} / ${option.name}` : option.name}
                </option>
              ))}
            </select>
            <button type="button" onClick={applyBulkClassGroup} disabled={isPending} style={bulkButton}>
              반 이동
            </button>
          </div>
          <div style={bulkGroup}>
            <select
              value={bulkAssistantId}
              onChange={(event) => setBulkAssistantId(event.target.value)}
              style={bulkSelect}
              disabled={isPending}
              aria-label="선택 학생 담당 조교 변경"
            >
              <option value="">조교 없음</option>
              {assistants.map((assistant) => (
                <option key={assistant.id} value={assistant.id}>
                  {assistant.name}
                </option>
              ))}
            </select>
            <button type="button" onClick={applyBulkAssistant} disabled={isPending} style={bulkButton}>
              조교 변경
            </button>
          </div>
          <button type="button" onClick={() => setBulkDeleteOpen(true)} disabled={isPending} style={dangerToolbarButton}>
            삭제
          </button>
          <button type="button" onClick={() => setSelectedRows(new Set())} style={smallGhostButton}>
            선택 해제
          </button>
        </div>
      )}

      {addPanelOpen && (
        <div style={sidePanelLayer}>
          <button type="button" aria-label="닫기" style={sidePanelBackdrop} onClick={() => setAddPanelOpen(false)} />
          <aside style={sidePanel}>
            <div style={sidePanelHeader}>
              <div>
                <b>학생 추가</b>
                <span>스프레드시트에는 추가 후 바로 반영됩니다.</span>
              </div>
              <button type="button" onClick={() => setAddPanelOpen(false)} style={iconButton}>
                X
              </button>
            </div>
            <form action={submitAddStudent} style={studentFormGrid}>
              <label style={fieldLabel}>이름<input name="name" required style={panelInput} /></label>
              <label style={fieldLabel}>학생 연락처<input name="phone" style={panelInput} /></label>
              <label style={fieldLabel}>보호자 연락처<input name="parentPhone" style={panelInput} /></label>
              <label style={fieldLabel}>학교<input name="schoolName" style={panelInput} /></label>
              <label style={fieldLabel}>학년<input name="grade" style={panelInput} /></label>
              <label style={fieldLabel}>과목<input name="subject" style={panelInput} /></label>
              <label style={fieldLabel}>레벨<input name="currentLevel" style={panelInput} /></label>
              <label style={fieldLabel}>
                반
                <select name="classGroupId" style={panelInput}>
                  <option value="">반 미지정</option>
                  {classGroupOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.teacherName ? `${option.teacherName} / ${option.name}` : option.name}
                    </option>
                  ))}
                </select>
              </label>
              <label style={fieldLabel}>
                담당 강사
                <select name="teacherId" style={panelInput}>
                  <option value="">강사 미지정</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.name}
                    </option>
                  ))}
                </select>
              </label>
              <label style={fieldLabel}>
                담당 조교
                <select name="assistantId" style={panelInput}>
                  <option value="">조교 미지정</option>
                  {assistants.map((assistant) => (
                    <option key={assistant.id} value={assistant.id}>
                      {assistant.name}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ ...fieldLabel, gridColumn: "1 / -1" }}>
                메모
                <textarea name="memo" rows={4} style={panelTextarea} />
              </label>
              <div style={panelActions}>
                <button type="button" onClick={() => setAddPanelOpen(false)} style={smallGhostButton}>
                  취소
                </button>
                <button style={smallSaveButton} disabled={isPending}>
                  추가
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}

      {deleteTarget && (
        <div style={dialogLayer}>
          <div style={confirmDialog}>
            <b>학생 삭제</b>
            <p style={dialogText}>{deleteTarget.name} 학생을 정말 삭제할까요? 삭제하면 학생 기록도 함께 정리됩니다.</p>
            <div style={panelActions}>
              <button type="button" onClick={() => setDeleteTarget(null)} style={smallGhostButton}>
                취소
              </button>
              <button type="button" onClick={confirmDeleteStudent} style={dangerToolbarButton} disabled={isPending}>
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkDeleteOpen && (
        <div style={dialogLayer}>
          <div style={confirmDialog}>
            <b>선택 학생 삭제</b>
            <p style={dialogText}>선택한 {selectedIds.length}명의 학생을 삭제할까요? 이 작업은 되돌리기 어렵습니다.</p>
            <div style={panelActions}>
              <button type="button" onClick={() => setBulkDeleteOpen(false)} style={smallGhostButton}>
                취소
              </button>
              <button type="button" onClick={confirmBulkDelete} style={dangerToolbarButton} disabled={isPending}>
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {quickMemoTarget && (
        <div style={dialogLayer}>
          <form action={submitQuickMemo} style={confirmDialog}>
            <b>{quickMemoTarget.name} 메모 추가</b>
            <select name="type" defaultValue="GENERAL" style={panelInput}>
              <option value="GENERAL">일반 메모</option>
              <option value="COUNSELING">상담 메모</option>
              <option value="LEARNING">학습 메모</option>
              <option value="ATTITUDE">태도 메모</option>
              <option value="ATTENDANCE">출결 메모</option>
              <option value="ASSIGNMENT">과제 메모</option>
              <option value="CLINIC">클리닉 메모</option>
            </select>
            <textarea name="content" rows={5} required style={panelTextarea} />
            <label style={checkAllLabel}>
              <input type="checkbox" name="isImportant" />
              중요 메모
            </label>
            <div style={panelActions}>
              <button type="button" onClick={() => setQuickMemoTarget(null)} style={smallGhostButton}>
                취소
              </button>
              <button style={smallSaveButton} disabled={isPending}>
                저장
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={isFullscreen ? fullscreenSheetWrap : sheetWrap}>
        <table style={{ ...sheetTable, minWidth: tableMinWidth }}>
          <thead>
            <tr>
              {visibleColumns.map((column) => (
                <HeaderCell key={column} column={column} />
              ))}
            </tr>
          </thead>

          <tbody>
            {sortedRows.map((row, rowIndex) => (
              <tr key={row.id} style={selectedRows.has(row.id) ? selectedRow : undefined}>
                {visibleColumns.map((column) => renderCell(row, rowIndex, column))}
              </tr>
            ))}

            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={visibleColumns.length} style={emptyTd}>
                  학생이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  function HeaderCell({ column }: { column: ColumnKey }) {
    const label = columnLabel(column, customColumnDrafts);
    const sorted = sortState?.column === column;
    const sortable = column !== "select" && column !== "detail";
    const index = sheetConfig.order.indexOf(column);
    const visibleIndex = visibleColumns.indexOf(column);

    return (
      <th
        key={column}
        draggable={column !== "select"}
        onDragStart={(event) => {
          setDraggingColumn(column);
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", column);
        }}
        onDragOver={(event) => {
          if (draggingColumn && draggingColumn !== column) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          const source = (draggingColumn ?? event.dataTransfer.getData("text/plain")) as ColumnKey;
          moveColumnTo(source, column);
          setDraggingColumn(null);
        }}
        onDragEnd={() => setDraggingColumn(null)}
        style={{ ...sheetTh, ...(draggingColumn === column ? draggingTh : {}), minWidth: columnWidth(column) }}
        title={`${label} 열 드래그로 이동`}
      >
        <div style={headerInner}>
          <button
            type="button"
            onClick={() => toggleSort(column)}
            disabled={!sortable}
            style={{ ...headerSortButton, ...(sortable ? {} : headerSortDisabled) }}
            title={sortable ? `${label} 정렬` : label}
          >
            <span>{label}</span>
            {sorted && <span style={sortMark}>{sortState.direction === "asc" ? "▲" : "▼"}</span>}
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setOpenColumnMenu((current) => (current === column ? null : column));
            }}
            style={columnMenuToggle}
            aria-label={`${label} 열 메뉴`}
          >
            ⋯
          </button>
        </div>

        {openColumnMenu === column && (
          <div style={{ ...columnMenu, ...(visibleIndex <= 0 ? columnMenuLeft : {}) }}>
            {sortable && (
              <>
                <button type="button" onClick={() => toggleSort(column, "asc")} style={columnMenuItem}>
                  오름차순 정렬
                </button>
                <button type="button" onClick={() => toggleSort(column, "desc")} style={columnMenuItem}>
                  내림차순 정렬
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                toggleColumn(column);
                setOpenColumnMenu(null);
              }}
              disabled={requiredColumns.has(column)}
              style={columnMenuItem}
            >
              열 숨기기
            </button>
            <button type="button" onClick={() => moveColumn(column, -1)} disabled={index <= 0} style={columnMenuItem}>
              왼쪽 이동
            </button>
            <button
              type="button"
              onClick={() => moveColumn(column, 1)}
              disabled={index < 0 || index >= sheetConfig.order.length - 1}
              style={columnMenuItem}
            >
              오른쪽 이동
            </button>
          </div>
        )}
      </th>
    );
  }

  function renderCell(row: DraftRow, rowIndex: number, column: ColumnKey) {
    const rowFill = selectedRows.has(row.id) ? selectedFill : {};

    if (column === "select") {
      return (
        <td
          key={column}
          style={{ ...sheetTd, ...rowFill, minWidth: columnWidth(column), cursor: "pointer" }}
          onClick={(event) => {
            if ((event.target as HTMLElement).tagName !== "INPUT") toggleRow(row.id);
          }}
        >
          <input
            type="checkbox"
            checked={selectedRows.has(row.id)}
            onChange={() => toggleRow(row.id)}
            disabled={isPending}
            aria-label={`${row.name} 선택`}
          />
        </td>
      );
    }

    if (column === "no") return <td key={column} style={{ ...sheetTd, ...rowFill, minWidth: columnWidth(column) }}>{rowIndex + 1}</td>;
    if (column === "detail") {
      const isOpen = rowMenuOpen === row.id;

      return (
        <td key={column} style={{ ...sheetTd, ...rowFill, ...rowActionTd, minWidth: columnWidth(column) }}>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              const rect = event.currentTarget.getBoundingClientRect();
              const menuWidth = 176;
              const menuHeight = 258;
              setRowMenuPosition({
                top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - menuHeight - 8)),
                left: Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)),
              });
              setRowMenuOpen((current) => {
                const next = current === row.id ? null : row.id;
                if (!next) setRowMenuPosition(null);
                return next;
              });
            }}
            style={rowMenuButton}
            aria-label={`${row.name} 행 메뉴`}
          >
            ...
          </button>
          {isOpen && (
            <div style={{ ...rowMenu, ...(rowMenuPosition ?? {}) }}>
              <Link href={`/students/${row.id}`} style={rowMenuLink}>
                상세 보기
              </Link>
              <Link href={`/students/${row.id}/edit`} style={rowMenuLink}>
                학생 정보 수정
              </Link>
              <button
                type="button"
                onClick={() => {
                  setQuickMemoTarget(row);
                  setRowMenuOpen(null);
                  setRowMenuPosition(null);
                }}
                style={rowMenuItem}
              >
                메모 추가
              </button>
              <Link href={`/students/${row.id}?tab=counseling`} style={rowMenuLink}>
                상담 기록 추가
              </Link>
              <div style={rowMenuSection}>
                <span>반 이동</span>
                <select
                  value={row.classGroupId}
                  onChange={(event) => {
                    saveClassGroup(row, event.target.value);
                    setRowMenuOpen(null);
                    setRowMenuPosition(null);
                  }}
                  style={rowMenuSelect}
                  disabled={isPending}
                >
                  <option value="">반 미지정</option>
                  {classGroupOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.teacherName ? `${option.teacherName} / ${option.name}` : option.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(row);
                  setRowMenuOpen(null);
                  setRowMenuPosition(null);
                }}
                style={rowMenuDanger}
              >
                학생 삭제
              </button>
            </div>
          )}
        </td>
      );
    }
    if (column === "classGroup") {
      return renderEditableTd(rowIndex, column, undefined, (
          <select
            value={row.classGroupId}
            onChange={(event) => saveClassGroup(row, event.target.value)}
            onKeyDown={(event) => onEditorKeyDown(event, rowIndex, column)}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            style={cellSelect}
            disabled={isPending}
            aria-label={`${row.name} 반`}
          >
            <option value="">미지정</option>
            {classGroupOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.teacherName ? `${option.teacherName} / ${option.name}` : option.name}
              </option>
            ))}
          </select>
        )
      );
    }

    if (isCustomColumn(column)) {
      const id = customColumnId(column);
      const value = row.customValues[id] ?? "";

      return renderEditableTd(rowIndex, column, undefined, (
          <input
            value={value}
            onChange={(event) => updateDraftRow(row.id, { customValues: { ...row.customValues, [id]: event.target.value } })}
            onBlur={(event) => saveCustomCell(row, id, event.currentTarget.value)}
            onKeyDown={(event) => onEditorKeyDown(event, rowIndex, column)}
            style={cellInput}
            disabled={isPending}
            aria-label={`${row.name} ${columnLabel(column, customColumnDrafts)}`}
          />
        )
      );
    }

    if (column === "attendance") {
      return renderEditableTd(rowIndex, column, row.attendance, (
          <input
            value={row.attendance}
            onChange={(event) => updateDraftRow(row.id, { attendance: event.target.value })}
            autoComplete="off"
            onBlur={(event) => saveAttendance(row, event.currentTarget.value)}
            onKeyDown={(event) => onEditorKeyDown(event, rowIndex, column)}
            style={cellInput}
            disabled={isPending}
            aria-label={`${row.name} 출석`}
          />
        )
      );
    }

    if (column === "assignment") {
      return renderEditableTd(rowIndex, column, row.assignment, (
          <input
            value={row.assignment}
            onChange={(event) => updateDraftRow(row.id, { assignment: event.target.value })}
            autoComplete="off"
            onBlur={(event) => saveAssignment(row, event.currentTarget.value)}
            onKeyDown={(event) => onEditorKeyDown(event, rowIndex, column)}
            style={cellInput}
            disabled={isPending}
            aria-label={`${row.name} 과제`}
          />
        )
      );
    }

    if (column === "assignmentScore") {
      return renderEditableTd(rowIndex, column, undefined, (
          <input
            value={row.assignmentScoreText}
            onChange={(event) => updateDraftRow(row.id, { assignmentScoreText: event.target.value })}
            onBlur={(event) => saveAssignmentScore(row, event.currentTarget.value)}
            onKeyDown={(event) => onEditorKeyDown(event, rowIndex, column)}
            style={cellInput}
            inputMode="numeric"
            disabled={isPending}
            aria-label={`${row.name} 과제 점수`}
          />
        )
      );
    }

    if (column === "score") {
      return renderEditableTd(rowIndex, column, undefined, (
          <input
            value={row.scoreText}
            onChange={(event) => updateDraftRow(row.id, { scoreText: event.target.value })}
            onBlur={(event) => saveScore(row, event.currentTarget.value)}
            onKeyDown={(event) => onEditorKeyDown(event, rowIndex, column)}
            style={cellInput}
            inputMode="numeric"
            disabled={isPending}
            aria-label={`${row.name} 성적`}
          />
        )
      );
    }

    const field = column as StudentTextField;
    const value = row[field] ?? "";

    return renderEditableTd(rowIndex, field, undefined, (
        <input
          value={value}
          onChange={(event) => updateDraftRow(row.id, { [field]: event.target.value } as Partial<DraftRow>)}
          onBlur={(event) => saveStudentCell(row, field, event.currentTarget.value)}
          onKeyDown={(event) => onEditorKeyDown(event, rowIndex, field)}
          style={field === "memo" ? memoInput : cellInput}
          disabled={isPending}
          aria-label={`${row.name} ${columnLabel(column, customColumnDrafts)}`}
        />
      )
    );
  }

  function renderEditableTd(rowIndex: number, column: EditableColumn, status: string | undefined, children: ReactNode) {
    const isSelected = selectedCell?.rowIndex === rowIndex && selectedCell.column === column;
    const isRowSelected = selectedRows.has(sortedRows[rowIndex]?.id ?? "");

    return (
      <td
        key={column}
        ref={(node) => {
          cellRefs.current[cellKey(rowIndex, column)] = node;
        }}
        tabIndex={0}
        onFocus={() => {
          setSelectedCell({ rowIndex, column });
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setSelectedCell({ rowIndex, column });
        }}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedCell({ rowIndex, column });
        }}
        onKeyDown={(event) => onCellKeyDown(event, rowIndex, column)}
        aria-selected={isSelected}
        style={{
          ...editCellStyle(isSelected, status, isRowSelected),
          minWidth: columnWidth(column),
        }}
      >
        {children}
      </td>
    );
  }
}

function OptionSettings({
  title,
  options,
  disabled,
  onChange,
  onAdd,
  onRemove,
  onSave,
}: {
  title: string;
  options: SheetOption[];
  disabled: boolean;
  onChange: (index: number, patch: Partial<SheetOption>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onSave: () => void;
}) {
  return (
    <section style={settingsSection}>
      <div style={settingsTitleRow}>
        <b>{title}</b>
        <div style={optionActions}>
          <button type="button" onClick={onAdd} disabled={disabled} style={smallGhostButton}>
            추가
          </button>
          <button type="button" onClick={onSave} disabled={disabled} style={smallSaveButton}>
            저장
          </button>
        </div>
      </div>

      <div style={optionGrid}>
        {options.map((option, index) => (
          <div key={option.value} style={optionRow}>
            <input
              type="checkbox"
              checked={option.enabled}
              onChange={(event) => onChange(index, { enabled: event.target.checked })}
              disabled={disabled}
              aria-label={`${title} ${option.label} 사용`}
            />
            <input
              value={option.label}
              onChange={(event) => onChange(index, { label: event.target.value })}
              disabled={disabled}
              style={optionLabelInput}
              aria-label={`${title} ${option.value} 표시 이름`}
            />
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                onRemove(index);
              }}
              disabled={disabled || options.length <= 1}
              style={deleteOptionButton}
            >
              삭제
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function isCursorAtStart(target: SheetEditorElement) {
  if (target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLTextAreaElement) return target.selectionStart === 0 && target.selectionEnd === 0;
  if (target.type === "number" || target.type === "date" || target.type === "time") return true;
  return target.selectionStart === 0 && target.selectionEnd === 0;
}

function isCursorAtEnd(target: SheetEditorElement) {
  if (target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLTextAreaElement) return target.selectionStart === target.value.length && target.selectionEnd === target.value.length;
  if (target.type === "number" || target.type === "date" || target.type === "time") return true;
  return target.selectionStart === target.value.length && target.selectionEnd === target.value.length;
}

function modeLabel(mode: string) {
  if (mode === "lesson") return "차시표";
  if (mode === "attendance") return "출석";
  if (mode === "assignment") return "과제";
  if (mode === "score") return "성적";
  return "전체";
}

function editCellStyle(isSelected: boolean, status?: string, isRowSelected = false): CSSProperties {
  const positiveStatuses = new Set(["DONE", "PRESENT", "완료", "제출", "출석", "현장"]);
  const neutralStatuses = new Set(["UNCHECKED", "미확인"]);
  const statusFill =
    status && positiveStatuses.has(status)
      ? { background: "#f0fdf4" }
      : status && neutralStatuses.has(status)
        ? { background: "#fff" }
        : status
          ? { background: "#fff7cc" }
          : {};

  return {
    ...sheetTd,
    ...statusFill,
    ...(isRowSelected && !status ? selectedFill : {}),
    padding: 0,
    outline: isSelected ? "2px solid #2563eb" : "none",
    outlineOffset: -2,
  };
}

const matrixShell: CSSProperties = { display: "grid", gap: 6, minHeight: 0 };
const fullscreenShell: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 60,
  background: "#fff",
  padding: 8,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  minHeight: 0,
};
const bulkBar: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  padding: 6,
};
const sheetMeta: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 30,
  padding: "0 8px",
  border: "1px solid #d1d5db",
  borderRadius: 5,
  background: "#fff",
  color: "#374151",
  fontSize: 12,
  fontWeight: 850,
};
const sheetModeTabs: CSSProperties = { display: "inline-flex", gap: 2, border: "1px solid #d1d5db", borderRadius: 4, padding: 2, background: "#fff" };
const sheetModeTab: CSSProperties = { padding: "5px 7px", borderRadius: 3, color: "#4b5563", textDecoration: "none", fontSize: 12, fontWeight: 950, lineHeight: 1 };
const sheetModeTabActive: CSSProperties = { background: "#111827", color: "#fff" };
const keyboardHint: CSSProperties = { color: "#6b7280", fontSize: 11, fontWeight: 850, whiteSpace: "nowrap" };
const sheetSearchInput: CSSProperties = {
  width: 116,
  height: 30,
  border: "1px solid #d1d5db",
  borderRadius: 4,
  padding: "0 7px",
  fontSize: 12,
  fontWeight: 850,
  background: "#fff",
};
const bulkGroup: CSSProperties = { display: "flex", alignItems: "center", gap: 4 };
const checkAllLabel: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 900, fontSize: 12 };
const bulkSelect: CSSProperties = { height: 30, border: "1px solid #d1d5db", borderRadius: 4, padding: "0 6px", background: "#fff", fontSize: 12 };
const bulkWideSelect: CSSProperties = { ...bulkSelect, width: 150 };
const bulkButton: CSSProperties = { height: 30, border: "1px solid #111827", borderRadius: 4, background: "#111827", color: "#fff", padding: "0 9px", fontWeight: 900, fontSize: 12 };
const settingsButton: CSSProperties = { height: 30, border: "1px solid #d1d5db", borderRadius: 4, background: "#fff", color: "#111827", padding: "0 9px", fontWeight: 900, fontSize: 12 };
const primaryToolbarButton: CSSProperties = { ...settingsButton, borderColor: "#111827", background: "#111827", color: "#fff" };
const dangerToolbarButton: CSSProperties = { height: 30, border: "1px solid #fecaca", borderRadius: 4, background: "#fff", color: "#991b1b", padding: "0 9px", fontWeight: 900, fontSize: 12 };
const fullscreenButton: CSSProperties = { ...settingsButton, marginLeft: "auto", borderColor: "#111827" };
const saveStatus: CSSProperties = { minWidth: 64, color: "#4b5563", fontWeight: 900, fontSize: 12 };
const pendingStatus: CSSProperties = { color: "#2563eb" };
const selectionActionBar: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
  border: "1px solid #bfdbfe",
  borderRadius: 6,
  background: "#eff6ff",
  padding: 6,
  fontSize: 12,
};
const settingsPanel: CSSProperties = {
  display: "grid",
  gap: 8,
  position: "fixed",
  top: 10,
  right: 10,
  zIndex: 80,
  width: "min(440px, calc(100vw - 20px))",
  maxHeight: "calc(100vh - 20px)",
  background: "#fff",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  padding: 8,
  overflow: "auto",
  boxShadow: "0 18px 40px rgba(15, 23, 42, .2)",
};
const sidePanelLayer: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 90,
  pointerEvents: "auto",
};
const sidePanelBackdrop: CSSProperties = {
  position: "absolute",
  inset: 0,
  border: 0,
  background: "rgba(15, 23, 42, .16)",
};
const sidePanel: CSSProperties = {
  position: "absolute",
  top: 0,
  right: 0,
  width: "min(460px, 100vw)",
  height: "100%",
  background: "#fff",
  borderLeft: "1px solid #d1d5db",
  boxShadow: "-18px 0 36px rgba(15, 23, 42, .18)",
  padding: 14,
  display: "grid",
  gridTemplateRows: "auto 1fr",
  gap: 12,
  overflow: "auto",
};
const sidePanelHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 10,
  borderBottom: "1px solid #e5e7eb",
  paddingBottom: 10,
};
const iconButton: CSSProperties = {
  width: 30,
  height: 30,
  border: "1px solid #d1d5db",
  borderRadius: 6,
  background: "#fff",
  fontWeight: 950,
  cursor: "pointer",
};
const studentFormGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  alignContent: "start",
};
const fieldLabel: CSSProperties = {
  display: "grid",
  gap: 5,
  color: "#374151",
  fontSize: 12,
  fontWeight: 900,
};
const panelInput: CSSProperties = {
  minWidth: 0,
  height: 34,
  border: "1px solid #d1d5db",
  borderRadius: 6,
  padding: "0 9px",
  background: "#fff",
  color: "#111827",
  fontSize: 13,
  fontWeight: 850,
};
const panelTextarea: CSSProperties = {
  ...panelInput,
  minHeight: 92,
  height: "auto",
  padding: 9,
  resize: "vertical",
};
const panelActions: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 8,
  gridColumn: "1 / -1",
};
const dialogLayer: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 100,
  display: "grid",
  placeItems: "center",
  background: "rgba(15, 23, 42, .22)",
  padding: 16,
};
const confirmDialog: CSSProperties = {
  width: "min(420px, 100%)",
  display: "grid",
  gap: 12,
  background: "#fff",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: 16,
  boxShadow: "0 20px 48px rgba(15, 23, 42, .25)",
};
const dialogText: CSSProperties = { margin: 0, color: "#4b5563", fontSize: 13, lineHeight: 1.5 };
const toolPanelHead: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "2px 0 6px",
  borderBottom: "1px solid #e5e7eb",
};
const toolRow: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "70px 1fr",
  alignItems: "center",
  gap: 8,
};
const hiddenChipWrap: CSSProperties = { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" };
const hiddenChip: CSSProperties = {
  height: 28,
  border: "1px solid #d1d5db",
  borderRadius: 999,
  background: "#f8fafc",
  color: "#374151",
  padding: "0 10px",
  fontWeight: 900,
  fontSize: 12,
  cursor: "pointer",
};
const toolDetails: CSSProperties = { borderTop: "1px solid #eef2f7", paddingTop: 6 };
const toolSummary: CSSProperties = { cursor: "pointer", fontWeight: 950, color: "#374151", fontSize: 12 };
const settingsSection: CSSProperties = { display: "grid", gap: 8 };
const settingsTitleRow: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 };
const columnToggle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 900 };
const smallGhostButton: CSSProperties = { height: 32, border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", color: "#111827", padding: "0 10px", fontWeight: 900 };
const smallSaveButton: CSSProperties = { ...smallGhostButton, borderColor: "#111827", background: "#111827", color: "#fff" };
const optionActions: CSSProperties = { display: "flex", gap: 6 };
const optionGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 8 };
const optionRow: CSSProperties = { display: "grid", gridTemplateColumns: "18px 1fr 54px", alignItems: "center", gap: 8, border: "1px solid #e5e7eb", borderRadius: 6, padding: 8 };
const optionLabelInput: CSSProperties = { minWidth: 0, border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 8px", fontWeight: 900 };
const deleteOptionButton: CSSProperties = { height: 32, border: "1px solid #fecaca", borderRadius: 6, background: "#fff", color: "#991b1b", fontWeight: 900 };
const customColumnInput: CSSProperties = { ...optionLabelInput, width: 170, height: 32, padding: "0 8px" };
const customColumnList: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))", gap: 8 };
const customColumnItem: CSSProperties = { display: "grid", gridTemplateColumns: "58px 1fr 54px", alignItems: "center", gap: 8, border: "1px solid #e5e7eb", borderRadius: 6, padding: 8 };
const emptyInline: CSSProperties = { color: "#6b7280", fontSize: 12, fontWeight: 850 };
const sheetWrap: CSSProperties = { overflow: "auto", border: "1px solid #9ca3af", borderRadius: 4, maxHeight: "calc(100vh - 170px)", minHeight: 500 };
const fullscreenSheetWrap: CSSProperties = { ...sheetWrap, flex: 1, maxHeight: "none", minHeight: 0, height: "100%" };
const sheetTable: CSSProperties = { width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12 };
const sheetTh: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 2,
  background: "#f3f4f6",
  borderRight: "1px solid #c7ccd1",
  borderBottom: "1px solid #9ca3af",
  padding: "5px 6px",
  textAlign: "center",
  fontWeight: 950,
  whiteSpace: "nowrap",
  overflow: "visible",
};
const draggingTh: CSSProperties = { background: "#e0ecff", outline: "2px solid #7aa2ff", outlineOffset: -2 };
const headerInner: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 22px", alignItems: "center", gap: 2 };
const headerSortButton: CSSProperties = {
  minWidth: 0,
  border: 0,
  background: "transparent",
  fontWeight: 950,
  fontSize: 12,
  color: "#111827",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
  padding: 0,
};
const headerSortDisabled: CSSProperties = { cursor: "default", color: "#374151" };
const sortMark: CSSProperties = { color: "#2563eb", fontSize: 10 };
const columnMenuToggle: CSSProperties = {
  width: 20,
  height: 22,
  border: "1px solid #d1d5db",
  borderRadius: 4,
  background: "#fff",
  fontWeight: 950,
  lineHeight: 1,
  cursor: "pointer",
};
const columnMenu: CSSProperties = {
  position: "absolute",
  right: 4,
  top: 28,
  zIndex: 20,
  display: "grid",
  gap: 2,
  minWidth: 118,
  padding: 4,
  border: "1px solid #9ca3af",
  borderRadius: 4,
  background: "#fff",
  boxShadow: "0 8px 18px rgba(15,23,42,.16)",
};
const columnMenuLeft: CSSProperties = { left: 4, right: "auto" };
const columnMenuItem: CSSProperties = {
  border: 0,
  background: "#fff",
  color: "#111827",
  padding: "6px 8px",
  textAlign: "left",
  fontSize: 12,
  fontWeight: 850,
  cursor: "pointer",
};
const sheetTd: CSSProperties = {
  borderRight: "1px solid #d1d5db",
  borderBottom: "1px solid #d1d5db",
  background: "#fff",
  height: 30,
  padding: "4px 6px",
  textAlign: "center",
  whiteSpace: "nowrap",
};
const selectedRow: CSSProperties = { background: "#eff6ff" };
const selectedFill: CSSProperties = { background: "#eff6ff" };
const rowActionTd: CSSProperties = { position: "relative", overflow: "visible" };
const rowMenuButton: CSSProperties = {
  width: 28,
  height: 24,
  border: "1px solid #d1d5db",
  borderRadius: 4,
  background: "#fff",
  color: "#111827",
  fontWeight: 950,
  lineHeight: 1,
  cursor: "pointer",
};
const rowMenu: CSSProperties = {
  position: "fixed",
  zIndex: 120,
  minWidth: 170,
  display: "grid",
  gap: 2,
  padding: 5,
  border: "1px solid #9ca3af",
  borderRadius: 6,
  background: "#fff",
  boxShadow: "0 12px 26px rgba(15,23,42,.18)",
  textAlign: "left",
};
const rowMenuItem: CSSProperties = {
  border: 0,
  background: "#fff",
  color: "#111827",
  padding: "7px 8px",
  borderRadius: 4,
  textAlign: "left",
  fontSize: 12,
  fontWeight: 850,
  cursor: "pointer",
};
const rowMenuLink: CSSProperties = { ...rowMenuItem, textDecoration: "none", display: "block" };
const rowMenuDanger: CSSProperties = { ...rowMenuItem, color: "#991b1b", background: "#fff5f5" };
const rowMenuSection: CSSProperties = {
  display: "grid",
  gap: 4,
  borderTop: "1px solid #e5e7eb",
  borderBottom: "1px solid #e5e7eb",
  padding: "6px 2px",
  color: "#4b5563",
  fontSize: 11,
  fontWeight: 900,
};
const rowMenuSelect: CSSProperties = {
  width: "100%",
  height: 28,
  border: "1px solid #d1d5db",
  borderRadius: 4,
  background: "#fff",
  fontSize: 12,
};
const cellSelect: CSSProperties = {
  width: "100%",
  height: 30,
  border: 0,
  background: "transparent",
  textAlign: "center",
  fontWeight: 900,
  padding: "0 6px",
  fontSize: 12,
};
const cellInput: CSSProperties = {
  width: "100%",
  height: 30,
  border: 0,
  background: "transparent",
  textAlign: "center",
  fontWeight: 900,
  padding: "0 6px",
  fontSize: 12,
};
const memoInput: CSSProperties = { ...cellInput, textAlign: "left" };
const emptyTd: CSSProperties = { padding: 30, textAlign: "center", color: "#6b7280" };
