"use client";

import Link from "next/link";
import type { ClipboardEvent, CSSProperties, KeyboardEvent, MouseEvent } from "react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { updateStudentLessonCells, updateStudentSheetCell, updateStudentSheetCustomCells } from "@/app/students/actions";
import type { SheetCustomColumn } from "@/lib/studentSheetCustomColumns";
import type { StudentSheetRow } from "@/components/StudentSheetMatrix";

export type LessonClassGroupOption = {
  id: string;
  name: string;
  teacherName?: string;
  startDate?: string | null;
  endDate?: string | null;
  daysOfWeek?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  schedule?: string | null;
};

type Props = {
  rows: StudentSheetRow[];
  customColumns: SheetCustomColumn[];
  preservedQuery: string;
  selectedClassGroupId?: string | null;
  classGroups: LessonClassGroupOption[];
};

type LessonFieldId = "attendance" | "assignment" | "test";

type LessonField = {
  id: LessonFieldId;
  label: string;
  width: number;
};

type Lesson = {
  id: string;
  index: number;
  defaultLabel: string;
  date?: string;
  dateLabel: string;
  scheduleLabel: string;
  source: "schedule" | "manual" | "fallback";
};

type GridColumn =
  | { id: "name"; label: string; kind: "meta"; width: number }
  | { id: "classGroup"; label: string; kind: "meta"; width: number }
  | {
      id: string;
      label: string;
      kind: "lesson";
      width: number;
      lessonId: string;
      lessonIndex: number;
      field: LessonFieldId;
      groupLabel: string;
      date?: string;
      dateLabel: string;
      scheduleLabel: string;
    };

type GridPoint = {
  rowIndex: number;
  colIndex: number;
};

type SelectionRange = {
  anchor: GridPoint;
  cursor: GridPoint;
};

type CellStyle = {
  fill?: string;
  fontFamily?: string;
  fontSize?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  border?: boolean;
  align?: "left" | "center" | "right";
};

type SortDirection = "asc" | "desc";

const lessonFields: LessonField[] = [
  { id: "attendance", label: "출결", width: 92 },
  { id: "assignment", label: "과제", width: 104 },
  { id: "test", label: "테스트", width: 108 },
];

const fallbackLessonCount = 12;
const maxGeneratedLessons = 80;
const modeTabs = ["all", "lesson", "attendance", "assignment", "score"] as const;

export default function StudentLessonSpreadsheet({
  rows,
  customColumns,
  preservedQuery,
  selectedClassGroupId,
  classGroups,
}: Props) {
  const effectiveClassGroupId = useMemo(() => {
    if (selectedClassGroupId) return selectedClassGroupId;
    const rowClassIds = [...new Set(rows.map((row) => row.classGroupId).filter(Boolean))];
    return rowClassIds.length === 1 ? rowClassIds[0] : null;
  }, [rows, selectedClassGroupId]);
  const selectedClassGroup = useMemo(
    () => classGroups.find((classGroup) => classGroup.id === effectiveClassGroupId) ?? null,
    [classGroups, effectiveClassGroupId]
  );
  const scope = useMemo(() => safeScope(effectiveClassGroupId || "all"), [effectiveClassGroupId]);
  const [extraLessonCount, setExtraLessonCount] = useState(0);
  const [lessonLabels, setLessonLabels] = useState<Record<string, string>>({});
  const [visibleLessonIds, setVisibleLessonIds] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [dirtyValues, setDirtyValues] = useState<Record<string, string>>({});
  const [cellStyles, setCellStyles] = useState<Record<string, CellStyle>>({});
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [editingCellKey, setEditingCellKey] = useState<string | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [bulkValue, setBulkValue] = useState("");
  const [rangeSearch, setRangeSearch] = useState("");
  const [rangeFilterOnly, setRangeFilterOnly] = useState(false);
  const [columnSearchId, setColumnSearchId] = useState<string>("name");
  const [columnSearch, setColumnSearch] = useState("");
  const [sortColumnId, setSortColumnId] = useState<string>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [formatDraft, setFormatDraft] = useState<CellStyle>({
    fill: "#ffffff",
    fontFamily: "Arial",
    fontSize: "13",
    align: "center",
  });
  const [statusText, setStatusText] = useState("");
  const [isPending, startTransition] = useTransition();
  const sheetWrapRef = useRef<HTMLDivElement | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const nameInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const lessons = useMemo(() => {
    return buildLessonsForClass(selectedClassGroup, extraLessonCount, customColumns);
  }, [customColumns, extraLessonCount, selectedClassGroup]);

  const activeVisibleLessonIds = useMemo(() => {
    const allowed = new Set(lessons.map((lesson) => lesson.id));
    const visible = visibleLessonIds.filter((lessonId) => allowed.has(lessonId));
    return visible.length > 0 ? visible : lessons.slice(0, Math.min(5, lessons.length)).map((lesson) => lesson.id);
  }, [lessons, visibleLessonIds]);

  const visibleLessons = useMemo(() => {
    const visible = lessons.filter((lesson) => activeVisibleLessonIds.includes(lesson.id));
    return visible.length > 0 ? visible : lessons.slice(0, Math.min(5, lessons.length));
  }, [activeVisibleLessonIds, lessons]);

  const gridColumns = useMemo<GridColumn[]>(() => {
    const lessonColumns = visibleLessons.flatMap((lesson) => {
      const groupLabel = lessonLabels[lesson.id] || lesson.defaultLabel;
      return lessonFields.map((field) => ({
        id: lessonColumnId(scope, lesson.index, field.id),
        label: field.label,
        kind: "lesson" as const,
        width: field.width,
        lessonId: lesson.id,
        lessonIndex: lesson.index,
        field: field.id,
        groupLabel,
        date: lesson.date,
        dateLabel: lesson.dateLabel,
        scheduleLabel: lesson.scheduleLabel,
      }));
    });

    return [
      { id: "name", label: "학생명", kind: "meta", width: 126 },
      { id: "classGroup", label: "반", kind: "meta", width: 136 },
      ...lessonColumns,
    ];
  }, [lessonLabels, scope, visibleLessons]);

  const lessonColumnMap = useMemo(() => {
    const map = new Map<string, Extract<GridColumn, { kind: "lesson" }>>();
    for (const column of gridColumns) {
      if (column.kind === "lesson") map.set(column.id, column);
    }
    return map;
  }, [gridColumns]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setExtraLessonCount(readStoredNumber(extraLessonCountKey(scope)) ?? 0);
      setLessonLabels(readStoredRecord<string>(lessonLabelsKey(scope)));
      setVisibleLessonIds(readStoredArray(visibleLessonsKey(scope)));
      setCellStyles(readStoredRecord<CellStyle>(cellStylesKey(scope)));
      setDirtyValues({});
      setStatusText("");
    }, 0);
    return () => window.clearTimeout(handle);
  }, [scope]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(extraLessonCountKey(scope), String(extraLessonCount));
  }, [extraLessonCount, scope]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(lessonLabelsKey(scope), JSON.stringify(lessonLabels));
  }, [lessonLabels, scope]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(visibleLessonsKey(scope), JSON.stringify(visibleLessonIds));
  }, [scope, visibleLessonIds]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(cellStylesKey(scope), JSON.stringify(cellStyles));
  }, [cellStyles, scope]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setValues((current) => {
        const next = { ...current };
        for (const row of rows) {
          for (const column of gridColumns) {
            if (column.kind !== "lesson") continue;
            const key = lessonCellKey(row.id, column.id);
            if (key in next) continue;
            next[key] = initialLessonCellValue(row, column);
          }
        }
        return next;
      });
    }, 0);
    return () => window.clearTimeout(handle);
  }, [gridColumns, rows]);

  useEffect(() => {
    const stopDragging = () => setIsDragging(false);
    window.addEventListener("mouseup", stopDragging);
    return () => window.removeEventListener("mouseup", stopDragging);
  }, []);
  const orderedRows = useMemo(
    () => sortRows(rows, sortColumnId, sortDirection, (row, columnId) => cellValue(row, columnId, values)),
    [rows, sortColumnId, sortDirection, values]
  );

  const selectionScope = useMemo(
    () => buildSelectionScope(selection, orderedRows, gridColumns),
    [gridColumns, orderedRows, selection]
  );

  const displayRows = useMemo(
    () =>
      orderedRows.filter((row) => {
        if (columnSearch.trim()) {
          const targetValue = readColumnValue(row, columnSearchId, values);
          if (!containsText(targetValue, columnSearch)) return false;
        }

        if (rangeFilterOnly && rangeSearch.trim()) {
          if (!selectionScope.rowIds.has(row.id)) return false;
          return [...selectionScope.columnIds].some((columnId) => containsText(cellValue(row, columnId, values), rangeSearch));
        }

        return true;
      }),
    [columnSearch, columnSearchId, orderedRows, rangeFilterOnly, rangeSearch, selectionScope, values]
  );

  const rangeMatchKeys = useMemo(() => {
    if (!rangeSearch.trim()) return new Set<string>();
    const matches = selectedLessonCells(selection, displayRows, gridColumns)
      .filter((cell) => containsText(cellValue(cell.row, cell.columnId, values), rangeSearch))
      .map((cell) => lessonCellKey(cell.row.id, cell.columnId));
    return new Set(matches);
  }, [displayRows, gridColumns, rangeSearch, selection, values]);

  const dirtyCount = Object.keys(dirtyValues).length;
  const selectionLabel = selection ? formatSelectionLabel(selection, displayRows, gridColumns) : "선택 없음";
  const hasClassSchedule = Boolean(selectedClassGroup && parseDaysOfWeek(selectedClassGroup).length > 0);
  const selectedColumnLabel = gridColumns.find((column) => column.id === columnSearchId) ? columnLabel(gridColumns.find((column) => column.id === columnSearchId)!) : "학생명";

  function getCell(row: StudentSheetRow, columnId: string) {
    return cellValue(row, columnId, values);
  }

  function setCell(row: StudentSheetRow, columnId: string, value: string) {
    const selectedCells = selectedLessonCells(selection, displayRows, gridColumns);
    const targetKey = lessonCellKey(row.id, columnId);
    const shouldFillRange = selectedCells.length > 1 && selectedCells.some((cell) => lessonCellKey(cell.row.id, cell.columnId) === targetKey);
    const nextValues: Record<string, string> = {};

    if (shouldFillRange) {
      for (const cell of selectedCells) {
        nextValues[lessonCellKey(cell.row.id, cell.columnId)] = value.slice(0, 500);
      }
    } else {
      nextValues[targetKey] = value.slice(0, 500);
    }

    setValues((current) => ({ ...current, ...nextValues }));
    setDirtyValues((current) => ({ ...current, ...nextValues }));
    setStatusText("저장 대기");
  }

  function displayName(row: StudentSheetRow) {
    return nameDrafts[row.id] ?? row.name;
  }

  function beginEditName(row: StudentSheetRow) {
    setNameDrafts((current) => ({ ...current, [row.id]: displayName(row) }));
    setEditingNameId(row.id);
    window.setTimeout(() => {
      nameInputRefs.current[row.id]?.focus();
      nameInputRefs.current[row.id]?.select();
    }, 0);
  }

  function saveName(row: StudentSheetRow) {
    const value = (nameDrafts[row.id] ?? row.name).trim();
    setEditingNameId(null);
    if (!value || value === row.name) return;
    const formData = new FormData();
    formData.set("studentId", row.id);
    formData.set("field", "name");
    formData.set("value", value);
    setStatusText("학생명 저장 중");
    startTransition(() => {
      void updateStudentSheetCell(formData)
        .then(() => setStatusText("학생명 저장됨"))
        .catch((error) => setStatusText(error instanceof Error ? error.message : "학생명 저장 실패"));
    });
  }

  function updateLessonLabel(lessonId: string, value: string) {
    setLessonLabels((current) => ({ ...current, [lessonId]: value.slice(0, 40) }));
  }

  function applyValueToSelection(value: string) {
    const cells = selectedLessonCells(selection, displayRows, gridColumns);
    if (cells.length === 0) return;

    const nextValues: Record<string, string> = {};
    for (const cell of cells) {
      nextValues[lessonCellKey(cell.row.id, cell.columnId)] = value.slice(0, 500);
    }

    setValues((current) => ({ ...current, ...nextValues }));
    setDirtyValues((current) => ({ ...current, ...nextValues }));
    setStatusText("저장 대기");
  }

  function fillSelectionFromAnchor() {
    if (!selection) return;
    const anchorColumn = gridColumns[Math.max(2, selection.anchor.colIndex)];
    const anchorRow = displayRows[selection.anchor.rowIndex];
    if (!anchorRow || anchorColumn?.kind !== "lesson") return;
    applyValueToSelection(cellValue(anchorRow, anchorColumn.id, values));
  }

  function clearSelectionStyles() {
    const keys = selectedLessonCells(selection, displayRows, gridColumns).map((cell) => lessonCellKey(cell.row.id, cell.columnId));
    if (keys.length === 0) return;

    setCellStyles((current) => {
      const next = { ...current };
      for (const key of keys) delete next[key];
      return next;
    });
  }

  function applyStyleToSelection(patch: CellStyle) {
    const keys = selectedLessonCells(selection, displayRows, gridColumns).map((cell) => lessonCellKey(cell.row.id, cell.columnId));
    if (keys.length === 0) return;

    setCellStyles((current) => {
      const next = { ...current };
      for (const key of keys) {
        next[key] = { ...(next[key] ?? {}), ...patch };
      }
      return next;
    });
  }

  function updateFormat(patch: CellStyle) {
    setFormatDraft((current) => ({ ...current, ...patch }));
    applyStyleToSelection(patch);
  }

  function toggleLesson(lessonId: string) {
    setVisibleLessonIds((current) => {
      if (current.includes(lessonId)) return current.filter((id) => id !== lessonId);
      return [...current, lessonId];
    });
  }

  function showLessonRange(start: number, end: number) {
    setVisibleLessonIds(lessons.filter((lesson) => lesson.index >= start && lesson.index <= end).map((lesson) => lesson.id));
  }

  function toggleSort(columnId: string) {
    setSortColumnId(columnId);
    setSortDirection((current) => (sortColumnId === columnId && current === "asc" ? "desc" : "asc"));
  }

  function addLesson() {
    const nextExtra = extraLessonCount + 1;
    const nextIndex = lessons.length + 1;
    const nextId = lessonId(nextIndex);
    setExtraLessonCount(nextExtra);
    setVisibleLessonIds((current) => [...new Set([...current, nextId])]);
  }

  function selectCell(rowIndex: number, colIndex: number, extend = false) {
    setEditingCellKey(null);
    setEditingNameId(null);
    setSelection((current) => {
      const point = { rowIndex, colIndex };
      if (extend && current) return { anchor: current.anchor, cursor: point };
      return { anchor: point, cursor: point };
    });
  }

  function selectRow(rowIndex: number) {
    if (!displayRows[rowIndex] || gridColumns.length === 0) return;
    setEditingCellKey(null);
    setEditingNameId(null);
    setSelection({ anchor: { rowIndex, colIndex: 0 }, cursor: { rowIndex, colIndex: gridColumns.length - 1 } });
  }

  function selectColumn(colIndex: number) {
    const column = gridColumns[colIndex];
    if (!column || displayRows.length === 0) return;
    setEditingCellKey(null);
    setEditingNameId(null);
    setColumnSearchId(column.id);
    setSelection({ anchor: { rowIndex: 0, colIndex }, cursor: { rowIndex: displayRows.length - 1, colIndex } });
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }

  function beginEditCell(rowIndex: number, colIndex: number) {
    const column = gridColumns[colIndex];
    const row = displayRows[rowIndex];
    if (!row || column?.kind !== "lesson") return;
    const key = focusKey(rowIndex, colIndex);
    setSelection({ anchor: { rowIndex, colIndex }, cursor: { rowIndex, colIndex } });
    setEditingCellKey(key);
    window.setTimeout(() => {
      inputRefs.current[key]?.focus();
      inputRefs.current[key]?.select();
    }, 0);
  }

  function beginDrag(event: MouseEvent<HTMLTableCellElement>, rowIndex: number, colIndex: number) {
    if (event.button !== 0) return;
    sheetWrapRef.current?.focus();
    setIsDragging(true);
    selectCell(rowIndex, colIndex, event.shiftKey);
  }

  function enterDrag(rowIndex: number, colIndex: number) {
    if (!isDragging) return;
    setSelection((current) => (current ? { ...current, cursor: { rowIndex, colIndex } } : current));
  }

  function onCellKeyDown(event: KeyboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) {
    if ((event.key === "Backspace" || event.key === "Delete") && selectedLessonCells(selection, displayRows, gridColumns).length > 1) {
      event.preventDefault();
      applyValueToSelection("");
      return;
    }

    if (!["Enter", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();

    const nextCol =
      event.key === "Tab" && !event.shiftKey
        ? colIndex + 1
        : event.key === "Tab"
          ? colIndex - 1
          : event.key === "ArrowRight"
            ? colIndex + 1
            : event.key === "ArrowLeft"
              ? colIndex - 1
              : colIndex;
    const nextRow =
      event.key === "Enter" && !event.shiftKey
        ? rowIndex + 1
        : event.key === "Enter"
          ? rowIndex - 1
          : event.key === "ArrowDown"
            ? rowIndex + 1
            : event.key === "ArrowUp"
              ? rowIndex - 1
              : rowIndex;
    focusCell(nextRow, nextCol);
  }

  function focusCell(rowIndex: number, colIndex: number) {
    if (rowIndex < 0 || rowIndex >= displayRows.length) return;
    if (colIndex < 2 || colIndex >= gridColumns.length) return;

    const key = focusKey(rowIndex, colIndex);
    setSelection({ anchor: { rowIndex, colIndex }, cursor: { rowIndex, colIndex } });
    setEditingCellKey(key);
    window.setTimeout(() => {
      inputRefs.current[key]?.focus();
      inputRefs.current[key]?.select();
    }, 0);
  }

  function handleSheetKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target instanceof HTMLInputElement) return;
    const selectedCells = selectedLessonCells(selection, displayRows, gridColumns);
    if (selectedCells.length === 0) return;

    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      applyValueToSelection("");
      return;
    }

    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      applyValueToSelection(event.key);
    }
  }


  function handleCopy(event: ClipboardEvent<HTMLDivElement>) {
    if (event.target instanceof HTMLInputElement && event.target.selectionStart !== event.target.selectionEnd) return;
    const matrix = selectedMatrix(selection, displayRows, gridColumns, values);
    if (matrix.length === 0) return;

    event.clipboardData.setData("text/plain", matrix.map((row) => row.join("\t")).join("\n"));
    event.preventDefault();
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const text = event.clipboardData.getData("text/plain");
    if (!text.trim() || !selection) return;

    const normalized = normalizeRange(selection);
    const startRow = normalized.startRow;
    let startCol = normalized.startCol;
    if (startCol < 2) startCol = 2;

    const rowsToPaste = text.replace(/\r/g, "").split("\n").filter((line, index, lines) => line.length > 0 || index < lines.length - 1);
    const nextValues: Record<string, string> = {};

    rowsToPaste.forEach((line, rowOffset) => {
      const row = displayRows[startRow + rowOffset];
      if (!row) return;

      line.split("\t").forEach((value, colOffset) => {
        const column = gridColumns[startCol + colOffset];
        if (!column || column.kind !== "lesson") return;
        nextValues[lessonCellKey(row.id, column.id)] = value.slice(0, 500);
      });
    });

    if (Object.keys(nextValues).length === 0) return;

    setValues((current) => ({ ...current, ...nextValues }));
    setDirtyValues((current) => ({ ...current, ...nextValues }));
    setStatusText("저장 대기");
    event.preventDefault();
  }

  function saveChanges() {
    const recordCells: Array<{ studentId: string; date: string; field: LessonFieldId; value: string }> = [];
    const customCells: Array<{ studentId: string; columnId: string; value: string }> = [];

    for (const [key, value] of Object.entries(dirtyValues)) {
      const separator = key.indexOf(":" );
      const studentId = key.slice(0, separator);
      const columnId = key.slice(separator + 1);
      const column = lessonColumnMap.get(columnId);

      if (column?.date) {
        recordCells.push({ studentId, date: column.date, field: column.field, value });
      } else {
        customCells.push({ studentId, columnId, value });
      }
    }

    if (recordCells.length === 0 && customCells.length === 0) return;
    const recordFormData = new FormData();
    recordFormData.set("cells", JSON.stringify(recordCells));
    const customFormData = new FormData();
    customFormData.set("cells", JSON.stringify(customCells));
    setStatusText("저장 중");

    startTransition(() => {
      void (async () => {
        if (recordCells.length > 0) await updateStudentLessonCells(recordFormData);
        if (customCells.length > 0) await updateStudentSheetCustomCells(customFormData);
      })()
        .then(() => {
          setDirtyValues({});
          setStatusText("저장됨");
        })
        .catch((error) => {
          setStatusText(error instanceof Error ? error.message : "저장 실패");
        });
    });
  }
  return (
    <div style={shell}>
<div style={menuBar}>
        <details style={menuItem}>
          <summary>파일</summary>
          <div style={menuPanel}>
            <button type="button" onClick={saveChanges} disabled={isPending || dirtyCount === 0} style={menuPanelButton}>변경 저장</button>
            <button type="button" onClick={addLesson} style={menuPanelButton}>차시 추가</button>
          </div>
        </details>
        <details style={menuItem}>
          <summary>수정</summary>
          <div style={menuPanel}>
            <button type="button" onClick={() => applyValueToSelection(bulkValue)} style={menuPanelButton}>선택 범위 채우기</button>
            <button type="button" onClick={fillSelectionFromAnchor} style={menuPanelButton}>첫 셀 값으로 채우기</button>
            <button type="button" onClick={() => applyValueToSelection("")} style={menuPanelButton}>선택 범위 지우기</button>
          </div>
        </details>
        <details style={menuItem}>
          <summary>보기</summary>
          <div style={menuPanel}>
            <button type="button" onClick={() => setVisibleLessonIds(lessons.map((lesson) => lesson.id))} style={menuPanelButton}>전체 차시 보기</button>
            <button type="button" onClick={() => showLessonRange(1, 5)} style={menuPanelButton}>1-5차시</button>
            <button type="button" onClick={() => showLessonRange(6, 10)} style={menuPanelButton}>6-10차시</button>
            <button type="button" onClick={() => showLessonRange(11, 15)} style={menuPanelButton}>11-15차시</button>
          </div>
        </details>
        <details style={menuItem}>
          <summary>서식</summary>
          <div style={menuPanel}>
            <button type="button" onClick={() => applyStyleToSelection(formatDraft)} style={menuPanelButton}>현재 서식 적용</button>
            <button type="button" onClick={clearSelectionStyles} style={menuPanelButton}>선택 서식 초기화</button>
          </div>
        </details>
        <span style={selectionBadge}>{selectionLabel}</span>
      </div>

      <div style={toolbar}>
        <div style={sheetMeta}>
          <b>{selectedClassGroup ? selectedClassGroup.name : "전체 학생"}</b>
          <span>{displayRows.length}/{rows.length}명</span>
          <span>{visibleLessons.length}개 차시 표시</span>
          <span>{dirtyCount > 0 ? `${dirtyCount}칸 변경` : "변경 없음"}</span>
        </div>

        <div style={sheetModeTabs}>
          {modeTabs.map((tabMode) => (
            <Link
              key={tabMode}
              href={`/students?tab=${tabMode}${preservedQuery ? `&${preservedQuery}` : ""}`}
              style={{ ...sheetModeTab, ...(tabMode === "lesson" ? sheetModeTabActive : {}) }}
            >
              {modeLabel(tabMode)}
            </Link>
          ))}
        </div>

        <button type="button" onClick={addLesson} style={toolbarButton}>+ 차시</button>
        <button type="button" onClick={saveChanges} disabled={isPending || dirtyCount === 0} style={primaryButton}>저장</button>
        {statusText && <span style={{ ...saveStatus, ...(isPending ? pendingStatus : {}) }}>{statusText}</span>}
      </div>

      <div style={classNotice}>
        {selectedClassGroup ? (
          <>
            <b>반 일정 기준 차시</b>
            <span>{selectedClassGroup.startDate || "시작일 없음"} ~ {selectedClassGroup.endDate || "종료일 없음"}</span>
            <span>{selectedClassGroup.daysOfWeek || selectedClassGroup.schedule || "요일 미정"}</span>
            {!hasClassSchedule && <span style={warningText}>운영 시작일과 수업 요일을 입력하면 날짜별 차시가 자동 생성됩니다.</span>}
          </>
        ) : (
          <>
            <b>전체 학생 보기</b>
            <span>반을 선택하면 해당 반의 운영기간과 요일에 맞춰 차시가 자동으로 나옵니다.</span>
          </>
        )}
      </div>

      <div style={toolbar}>
        <input value={bulkValue} onChange={(event) => setBulkValue(event.target.value)} placeholder="일괄 입력" style={toolbarInput} />
        <button type="button" onClick={() => applyValueToSelection(bulkValue)} style={toolbarButton}>입력</button>
        <button type="button" onClick={() => applyValueToSelection("")} style={toolbarButton}>지우기</button>

        <input
          type="color"
          value={formatDraft.fill ?? "#ffffff"}
          onChange={(event) => updateFormat({ fill: event.target.value })}
          style={colorInput}
          aria-label="채우기 색상"
        />
        <select
          value={formatDraft.fontFamily ?? "Arial"}
          onChange={(event) => updateFormat({ fontFamily: event.target.value })}
          style={compactSelect}
          aria-label="글꼴"
        >
          <option value="Arial">Arial</option>
          <option value="Inter">Inter</option>
          <option value="'Noto Sans KR'">Noto Sans KR</option>
          <option value="serif">Serif</option>
          <option value="monospace">Mono</option>
        </select>
        <input
          type="number"
          min={10}
          max={24}
          value={formatDraft.fontSize ?? "13"}
          onChange={(event) => updateFormat({ fontSize: event.target.value })}
          style={sizeInput}
          aria-label="글자 크기"
        />
        <button type="button" onClick={() => updateFormat({ bold: !formatDraft.bold })} style={formatButton(formatDraft.bold)}>B</button>
        <button type="button" onClick={() => updateFormat({ italic: !formatDraft.italic })} style={formatButton(formatDraft.italic)}>I</button>
        <button type="button" onClick={() => updateFormat({ underline: !formatDraft.underline })} style={formatButton(formatDraft.underline)}>U</button>
        <button type="button" onClick={() => updateFormat({ border: !formatDraft.border })} style={formatButton(formatDraft.border)}>선</button>
        <select
          value={formatDraft.align ?? "center"}
          onChange={(event) => updateFormat({ align: event.target.value as CellStyle["align"] })}
          style={compactSelect}
          aria-label="정렬"
        >
          <option value="left">왼쪽</option>
          <option value="center">가운데</option>
          <option value="right">오른쪽</option>
        </select>
      </div>

      <div style={toolbar}>
        <span style={selectedColumnPill}>검색 열: {selectedColumnLabel}</span>
        <input
          ref={searchInputRef}
          value={columnSearch}
          onChange={(event) => setColumnSearch(event.target.value)}
          placeholder="선택한 열에서 검색"
          style={toolbarInput}
          autoComplete="off"
        />

        <input value={rangeSearch} onChange={(event) => setRangeSearch(event.target.value)} placeholder="선택 범위 검색" style={toolbarInput} autoComplete="off" />
        <label style={toggleLabel}>
          <input type="checkbox" checked={rangeFilterOnly} onChange={(event) => setRangeFilterOnly(event.target.checked)} />
          범위 필터
        </label>
      </div>

      <div style={contentGrid}>
        <div ref={sheetWrapRef} style={sheetWrap} onCopy={handleCopy} onPaste={handlePaste} onKeyDown={handleSheetKeyDown} tabIndex={0}>
          <table style={{ ...sheetTable, minWidth: totalTableWidth(gridColumns, visibleLessons.length) }}>
            <thead>
              <tr>
                {gridColumns.slice(0, 2).map((column, headerColIndex) => (
                  <th
                    key={column.id}
                    rowSpan={2}
                    onClick={() => selectColumn(headerColIndex)}
                    style={{ ...sheetTh, ...stickyTop, minWidth: column.width, width: column.width, cursor: "pointer" }}
                    title={`${column.label} 열 선택`}
                  >
                    {column.label}
                  </th>
                ))}
                {visibleLessons.map((lesson) => {
                  const label = lessonLabels[lesson.id] || lesson.defaultLabel;
                  return (
                    <th key={lesson.id} colSpan={lessonFields.length} style={{ ...lessonGroupTh, ...stickyTop }}>
                      <input
                        value={label}
                        onChange={(event) => updateLessonLabel(lesson.id, event.target.value)}
                        style={lessonNameInput}
                        aria-label={`${lesson.defaultLabel} 이름`}
                      />
                      <div style={lessonDateLine}>{lesson.dateLabel || "날짜 미정"}{lesson.scheduleLabel ? ` / ${lesson.scheduleLabel}` : ""}</div>
                    </th>
                  );
                })}
              </tr>
              <tr>
                {visibleLessons.flatMap((lesson) =>
                  lessonFields.map((field) => {
                    const subColumnId = lessonColumnId(scope, lesson.index, field.id);
                    const subColIndex = gridColumns.findIndex((column) => column.id === subColumnId);
                    const isSearchColumn = columnSearchId === subColumnId;
                    const isSortColumn = sortColumnId === subColumnId;
                    return (
                      <th key={`${lesson.id}-${field.id}`} style={{ ...sheetSubTh, top: 50, minWidth: field.width, width: field.width }}>
                        <div style={subHeaderInner}>
                          <button
                            type="button"
                            onClick={() => selectColumn(subColIndex)}
                            style={{ ...subHeaderButton, ...(isSearchColumn ? subHeaderButtonActive : {}) }}
                            title={`${lessonLabels[lesson.id] || lesson.defaultLabel} ${field.label} 열 검색`}
                          >
                            {field.label}
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleSort(subColumnId)}
                            style={{ ...subSortButton, ...(isSortColumn ? subSortButtonActive : {}) }}
                            title="정렬"
                          >
                            {isSortColumn ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                          </button>
                        </div>
                      </th>
                    );
                  })
                )}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, rowIndex) => (
                <tr key={row.id}>
                  {gridColumns.map((column, colIndex) => {
                    const selected = isSelected(selection, rowIndex, colIndex);

                    if (column.kind === "meta") {
                      const value = column.id === "name" ? displayName(row) : row.classGroupName || "-";
                      const isNameCell = column.id === "name";
                      const isEditingName = isNameCell && editingNameId === row.id;
                      return (
                        <td
                          key={column.id}
                          onMouseDown={(event) => {
                            if (isEditingName) return;
                            if (isNameCell) {
                              event.preventDefault();
                              sheetWrapRef.current?.focus();
                              selectRow(rowIndex);
                            } else {
                              beginDrag(event, rowIndex, colIndex);
                            }
                          }}
                          onDoubleClick={() => {
                            if (isNameCell) beginEditName(row);
                          }}
                          onMouseEnter={() => enterDrag(rowIndex, colIndex)}
                          style={{ ...metaTd, ...(isNameCell ? clickableMetaTd : {}), ...(selected ? selectedCell : {}) }}
                          title={isNameCell ? "한 번 클릭: 행 선택 / 더블클릭: 학생명 수정" : undefined}
                        >
                          {isEditingName ? (
                            <input
                              ref={(node) => {
                                nameInputRefs.current[row.id] = node;
                              }}
                              value={nameDrafts[row.id] ?? row.name}
                              onChange={(event) => setNameDrafts((current) => ({ ...current, [row.id]: event.target.value }))}
                              onBlur={() => saveName(row)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") saveName(row);
                                if (event.key === "Escape") setEditingNameId(null);
                              }}
                              style={nameEditInput}
                              autoComplete="off"
                              disabled={isPending}
                              aria-label={`${row.name} 학생명`}
                            />
                          ) : (
                            value
                          )}
                        </td>
                      );
                    }

                    const key = lessonCellKey(row.id, column.id);
                    const value = getCell(row, column.id);
                    const localStyle = cellStyles[key] ?? {};
                    const isDirty = key in dirtyValues;
                    const isRangeMatch = rangeMatchKeys.has(key);
                    const editKey = focusKey(rowIndex, colIndex);
                    const isEditing = editingCellKey === editKey;

                    return (
                      <td
                        key={column.id}
                        onMouseDown={(event) => beginDrag(event, rowIndex, colIndex)}
                        onDoubleClick={() => beginEditCell(rowIndex, colIndex)}
                        onMouseEnter={() => enterDrag(rowIndex, colIndex)}
                        style={{
                          ...lessonTd,
                          ...styleToCss(localStyle),
                          ...(selected ? selectedCell : {}),
                          ...(isRangeMatch ? matchedCell : {}),
                          ...(isDirty ? dirtyCell : {}),
                        }}
                        title="한 번 클릭/드래그: 선택 / 더블클릭: 수정"
                      >
                        {isEditing ? (
                          <input
                            ref={(node) => {
                              inputRefs.current[editKey] = node;
                            }}
                            value={value}
                            onChange={(event) => setCell(row, column.id, event.target.value)}
                            autoComplete="off"
                            onBlur={() => setEditingCellKey(null)}
                            onKeyDown={(event) => onCellKeyDown(event, rowIndex, colIndex)}
                            style={{ ...cellInput, textAlign: localStyle.align ?? "center" }}
                            disabled={isPending}
                            aria-label={`${row.name} ${column.groupLabel} ${column.label}`}
                          />
                        ) : (
                          <div style={{ ...cellDisplay, textAlign: localStyle.align ?? "center" }}>{value}</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}

              {displayRows.length === 0 && (
                <tr>
                  <td colSpan={gridColumns.length} style={emptyTd}>표시할 학생이 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <aside style={lessonPanel}>
          <div style={panelHead}>
            <b>차시 선택</b>
            <button type="button" onClick={() => setVisibleLessonIds(lessons.map((lesson) => lesson.id))} style={panelButton}>전체</button>
          </div>
          <div style={rangeButtons}>
            <button type="button" onClick={() => showLessonRange(1, 5)} style={panelButton}>1-5</button>
            <button type="button" onClick={() => showLessonRange(6, 10)} style={panelButton}>6-10</button>
            <button type="button" onClick={() => showLessonRange(11, 15)} style={panelButton}>11-15</button>
          </div>
          <div style={lessonList}>
            {lessons.map((lesson) => (
              <label key={lesson.id} style={lessonToggle}>
                <input type="checkbox" checked={activeVisibleLessonIds.includes(lesson.id)} onChange={() => toggleLesson(lesson.id)} />
                <span>{lessonLabels[lesson.id] || lesson.defaultLabel}</span>
                <small>{lesson.dateLabel || "날짜 미정"}</small>
              </label>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
function buildLessonsForClass(classGroup: LessonClassGroupOption | null, extraCount: number, customColumns: SheetCustomColumn[]) {
  const scheduled = classGroup ? scheduledLessons(classGroup) : [];
  const baseCount = scheduled.length > 0 ? scheduled.length : fallbackLessonCount;
  const baseLessons = scheduled.length > 0 ? scheduled : fallbackLessons(baseCount, classGroup ? "manual" : "fallback");
  const totalCount = Math.min(maxGeneratedLessons, baseLessons.length + extraCount);
  const lessons = [...baseLessons];

  for (let index = lessons.length + 1; index <= totalCount; index += 1) {
    lessons.push({
      id: lessonId(index),
      index,
      defaultLabel: customColumns.find((column) => column.id === legacyLessonId(index))?.label || `${index}차시`,
      dateLabel: "날짜 미정",
      scheduleLabel: "",
      source: "manual",
    });
  }

  return lessons;
}

function scheduledLessons(classGroup: LessonClassGroupOption): Lesson[] {
  const days = parseDaysOfWeek(classGroup);
  const start = parseLocalDate(classGroup.startDate) ?? firstUpcomingClassDate(days);
  const end = parseLocalDate(classGroup.endDate) ?? addDays(start, 90);
  if (!start || !end || days.length === 0) return [];

  const daySet = new Set(days);
  const lessons: Lesson[] = [];
  const scheduleLabel = classGroup.startTime || classGroup.endTime ? `${classGroup.startTime || "--:--"}-${classGroup.endTime || "--:--"}` : "";

  for (let cursor = start; cursor <= end && lessons.length < maxGeneratedLessons; cursor = addDays(cursor, 1)) {
    if (!daySet.has(cursor.getDay())) continue;
    const index = lessons.length + 1;
    lessons.push({
      id: lessonId(index),
      index,
      defaultLabel: `${index}차시`,
      date: formatDateInput(cursor),
      dateLabel: formatShortDate(cursor),
      scheduleLabel,
      source: "schedule",
    });
  }

  return lessons;
}

function fallbackLessons(count: number, source: Lesson["source"]): Lesson[] {
  return Array.from({ length: count }, (_, index) => {
    const lessonIndex = index + 1;
    return {
      id: lessonId(lessonIndex),
      index: lessonIndex,
      defaultLabel: `${lessonIndex}차시`,
      dateLabel: "날짜 미정",
      scheduleLabel: "",
      source,
    };
  });
}

function parseDaysOfWeek(classGroup: LessonClassGroupOption) {
  const source = `${classGroup.daysOfWeek ?? ""} ${classGroup.schedule ?? ""}`;
  const days = new Set<number>();
  const koreanDayMap: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };

  for (const char of source) {
    if (char in koreanDayMap) days.add(koreanDayMap[char]);
  }

  const tokenMap: Record<string, number> = {
    sun: 0,
    sunday: 0,
    mon: 1,
    monday: 1,
    tue: 2,
    tues: 2,
    tuesday: 2,
    wed: 3,
    wednesday: 3,
    thu: 4,
    thur: 4,
    thurs: 4,
    thursday: 4,
    fri: 5,
    friday: 5,
    sat: 6,
    saturday: 6,
  };

  for (const token of source.toLowerCase().split(/[^a-z0-9가-힣]+/).filter(Boolean)) {
    if (token in tokenMap) days.add(tokenMap[token]);
    const numeric = Number(token);
    if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 6) days.add(numeric);
  }

  return [...days].sort((a, b) => a - b);
}

function parseLocalDate(value?: string | null) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) {
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date: Date | null, days: number) {
  const base = date ? new Date(date) : new Date();
  base.setDate(base.getDate() + days);
  return base;
}

function firstUpcomingClassDate(days: number[]) {
  if (days.length === 0) return null;
  const today = new Date();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  for (let offset = 0; offset < 14; offset += 1) {
    const candidate = addDays(base, offset);
    if (days.includes(candidate.getDay())) return candidate;
  }
  return base;
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShortDate(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function lessonId(index: number) {
  return `lesson_${index}`;
}

function legacyLessonId(index: number) {
  return `lesson_${index}`;
}

function lessonColumnId(scope: string, index: number, field: LessonFieldId) {
  return `ls_${scope}_${index}_${field}`;
}

function safeScope(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 36) || "all";
}

function extraLessonCountKey(scope: string) {
  return `asc.studentLessons.extraCount.v4.${scope}`;
}

function lessonLabelsKey(scope: string) {
  return `asc.studentLessons.labels.v4.${scope}`;
}

function visibleLessonsKey(scope: string) {
  return `asc.studentLessons.visible.v4.${scope}`;
}

function cellStylesKey(scope: string) {
  return `asc.studentLessons.styles.v4.${scope}`;
}

function lessonCellKey(studentId: string, columnId: string) {
  return `${studentId}:${columnId}`;
}

function focusKey(rowIndex: number, colIndex: number) {
  return `${rowIndex}:${colIndex}`;
}

function cellValue(row: StudentSheetRow, columnId: string, values: Record<string, string>) {
  return values[lessonCellKey(row.id, columnId)] ?? row.customValues[columnId] ?? "";
}

function legacyLessonValue(row: StudentSheetRow, column: GridColumn) {
  if (column.kind !== "lesson" || column.field !== "attendance") return "";
  return row.customValues[legacyLessonId(column.lessonIndex)] ?? "";
}

function initialLessonCellValue(row: StudentSheetRow, column: GridColumn) {
  if (column.kind !== "lesson") return "";
  if (column.date) {
    if (column.field === "attendance") return row.attendanceByDate?.[column.date] ?? row.customValues[column.id] ?? legacyLessonValue(row, column) ?? "";
    if (column.field === "assignment") return row.assignmentByDate?.[column.date] ?? row.customValues[column.id] ?? "";
    if (column.field === "test") return row.scoreByDate?.[column.date] ?? row.customValues[column.id] ?? "";
  }
  return row.customValues[column.id] ?? legacyLessonValue(row, column) ?? "";
}

function readColumnValue(row: StudentSheetRow, columnId: string, values: Record<string, string>) {
  if (columnId === "name") return row.name;
  if (columnId === "classGroup") return row.classGroupName;
  return cellValue(row, columnId, values);
}

function containsText(value: string, query: string) {
  return value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}

function sortRows(
  rows: StudentSheetRow[],
  columnId: string,
  direction: SortDirection,
  readLessonValue: (row: StudentSheetRow, columnId: string) => string
) {
  const sorted = [...rows].sort((a, b) => {
    const aValue = columnId === "name" ? a.name : columnId === "classGroup" ? a.classGroupName : readLessonValue(a, columnId);
    const bValue = columnId === "name" ? b.name : columnId === "classGroup" ? b.classGroupName : readLessonValue(b, columnId);
    return aValue.localeCompare(bValue, "ko", { numeric: true, sensitivity: "base" });
  });

  return direction === "asc" ? sorted : sorted.reverse();
}

function normalizeRange(selection: SelectionRange) {
  return {
    startRow: Math.min(selection.anchor.rowIndex, selection.cursor.rowIndex),
    endRow: Math.max(selection.anchor.rowIndex, selection.cursor.rowIndex),
    startCol: Math.min(selection.anchor.colIndex, selection.cursor.colIndex),
    endCol: Math.max(selection.anchor.colIndex, selection.cursor.colIndex),
  };
}

function isSelected(selection: SelectionRange | null, rowIndex: number, colIndex: number) {
  if (!selection) return false;
  const range = normalizeRange(selection);
  return rowIndex >= range.startRow && rowIndex <= range.endRow && colIndex >= range.startCol && colIndex <= range.endCol;
}

function selectedLessonCells(selection: SelectionRange | null, rows: StudentSheetRow[], columns: GridColumn[]) {
  if (!selection) return [];
  const range = normalizeRange(selection);
  const cells: Array<{ row: StudentSheetRow; columnId: string }> = [];

  for (let rowIndex = range.startRow; rowIndex <= range.endRow; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!row) continue;

    for (let colIndex = Math.max(2, range.startCol); colIndex <= range.endCol; colIndex += 1) {
      const column = columns[colIndex];
      if (column?.kind !== "lesson") continue;
      cells.push({ row, columnId: column.id });
    }
  }

  return cells;
}

function selectedMatrix(selection: SelectionRange | null, rows: StudentSheetRow[], columns: GridColumn[], values: Record<string, string>) {
  if (!selection) return [];
  const range = normalizeRange(selection);
  const matrix: string[][] = [];

  for (let rowIndex = range.startRow; rowIndex <= range.endRow; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!row) continue;

    const line: string[] = [];
    for (let colIndex = range.startCol; colIndex <= range.endCol; colIndex += 1) {
      const column = columns[colIndex];
      if (!column) continue;
      if (column.id === "name") line.push(row.name);
      else if (column.id === "classGroup") line.push(row.classGroupName);
      else line.push(cellValue(row, column.id, values));
    }
    matrix.push(line);
  }

  return matrix;
}

function buildSelectionScope(selection: SelectionRange | null, rows: StudentSheetRow[], columns: GridColumn[]) {
  const rowIds = new Set<string>();
  const columnIds = new Set<string>();
  if (!selection) return { rowIds, columnIds };

  const range = normalizeRange(selection);
  for (let rowIndex = range.startRow; rowIndex <= range.endRow; rowIndex += 1) {
    const row = rows[rowIndex];
    if (row) rowIds.add(row.id);
  }
  for (let colIndex = Math.max(2, range.startCol); colIndex <= range.endCol; colIndex += 1) {
    const column = columns[colIndex];
    if (column?.kind === "lesson") columnIds.add(column.id);
  }
  return { rowIds, columnIds };
}

function formatSelectionLabel(selection: SelectionRange, rows: StudentSheetRow[], columns: GridColumn[]) {
  const range = normalizeRange(selection);
  const rowCount = Math.max(0, range.endRow - range.startRow + 1);
  const colCount = Math.max(0, range.endCol - range.startCol + 1);
  const startColumn = columns[range.startCol] ? columnLabel(columns[range.startCol]) : "?";
  const endColumn = columns[range.endCol] ? columnLabel(columns[range.endCol]) : "?";
  const startRow = rows[range.startRow]?.name ?? `${range.startRow + 1}행`;
  const endRow = rows[range.endRow]?.name ?? `${range.endRow + 1}행`;
  return `${startRow} ${startColumn} - ${endRow} ${endColumn} / ${rowCount}x${colCount}`;
}

function columnLabel(column: GridColumn) {
  if (column.kind !== "lesson") return column.label;
  return `${column.groupLabel} ${column.label}`;
}

function totalTableWidth(columns: GridColumn[], visibleLessonCount: number) {
  const metaWidth = columns.slice(0, 2).reduce((sum, column) => sum + column.width, 0);
  const fieldWidth = lessonFields.reduce((sum, field) => sum + field.width, 0);
  return metaWidth + visibleLessonCount * fieldWidth;
}

function modeLabel(mode: (typeof modeTabs)[number]) {
  const labels = {
    all: "전체",
    lesson: "차시",
    attendance: "출석",
    assignment: "과제",
    score: "성적",
  } satisfies Record<(typeof modeTabs)[number], string>;
  return labels[mode];
}

function readStoredNumber(key: string) {
  if (typeof window === "undefined") return null;
  const value = Number(window.localStorage.getItem(key));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function readStoredArray(key: string) {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function readStoredRecord<T>(key: string) {
  if (typeof window === "undefined") return {} as Record<string, T>;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, T>) : {};
  } catch {
    return {} as Record<string, T>;
  }
}

function styleToCss(style: CellStyle): CSSProperties {
  return {
    background: style.fill,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize ? `${style.fontSize}px` : undefined,
    fontWeight: style.bold ? 700 : undefined,
    fontStyle: style.italic ? "italic" : undefined,
    textDecoration: style.underline ? "underline" : undefined,
    outline: style.border ? "1px solid #111827" : undefined,
  };
}
const shell: CSSProperties = {
  border: "1px solid #d7dce5",
  borderRadius: 10,
  background: "#ffffff",
  overflow: "hidden",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
};

const menuBar: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 10px",
  borderBottom: "1px solid #e5e7eb",
  background: "#f8fafc",
  fontSize: 13,
};

const menuItem: CSSProperties = {
  position: "relative",
};

const menuPanel: CSSProperties = {
  position: "absolute",
  top: 24,
  left: 0,
  zIndex: 30,
  display: "grid",
  gap: 4,
  minWidth: 180,
  padding: 8,
  border: "1px solid #d7dce5",
  borderRadius: 8,
  background: "#ffffff",
  boxShadow: "0 14px 36px rgba(15, 23, 42, 0.16)",
};

const menuPanelButton: CSSProperties = {
  height: 30,
  padding: "0 10px",
  border: "1px solid #d7dce5",
  borderRadius: 7,
  background: "#ffffff",
  color: "#111827",
  fontWeight: 700,
  textAlign: "left",
  cursor: "pointer",
};

const selectionBadge: CSSProperties = {
  marginLeft: "auto",
  padding: "3px 8px",
  border: "1px solid #d7dce5",
  borderRadius: 999,
  background: "#ffffff",
  color: "#475569",
  fontSize: 12,
};

const toolbar: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  padding: "8px 10px",
  borderBottom: "1px solid #e5e7eb",
  background: "#ffffff",
};

const sheetMeta: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  marginRight: "auto",
  color: "#475569",
  fontSize: 13,
};

const sheetModeTabs: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 3,
  padding: 3,
  border: "1px solid #d7dce5",
  borderRadius: 8,
  background: "#f8fafc",
};

const sheetModeTab: CSSProperties = {
  padding: "5px 9px",
  borderRadius: 6,
  color: "#475569",
  textDecoration: "none",
  fontSize: 12,
  fontWeight: 700,
};

const sheetModeTabActive: CSSProperties = {
  background: "#111827",
  color: "#ffffff",
};

const classNotice: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  padding: "7px 10px",
  borderBottom: "1px solid #e5e7eb",
  background: "#f8fafc",
  color: "#475569",
  fontSize: 12,
};

const warningText: CSSProperties = {
  color: "#b45309",
  fontWeight: 700,
};

const toolbarButton: CSSProperties = {
  height: 30,
  padding: "0 10px",
  border: "1px solid #d1d5db",
  borderRadius: 7,
  background: "#ffffff",
  color: "#111827",
  fontWeight: 700,
  cursor: "pointer",
};

const primaryButton: CSSProperties = {
  ...toolbarButton,
  borderColor: "#111827",
  background: "#111827",
  color: "#ffffff",
};

const saveStatus: CSSProperties = {
  padding: "4px 8px",
  borderRadius: 999,
  background: "#eef2ff",
  color: "#3730a3",
  fontSize: 12,
  fontWeight: 800,
};

const pendingStatus: CSSProperties = {
  background: "#fff7ed",
  color: "#c2410c",
};

const toolbarInput: CSSProperties = {
  height: 30,
  minWidth: 120,
  padding: "0 8px",
  border: "1px solid #d1d5db",
  borderRadius: 7,
  background: "#ffffff",
  fontSize: 13,
};

const compactSelect: CSSProperties = {
  height: 30,
  padding: "0 8px",
  border: "1px solid #d1d5db",
  borderRadius: 7,
  background: "#ffffff",
  fontSize: 13,
};

const searchSelect: CSSProperties = {
  ...compactSelect,
  minWidth: 150,
};

const colorInput: CSSProperties = {
  width: 34,
  height: 30,
  padding: 2,
  border: "1px solid #d1d5db",
  borderRadius: 7,
  background: "#ffffff",
};

const sizeInput: CSSProperties = {
  ...toolbarInput,
  minWidth: 54,
  width: 62,
};

function formatButton(active?: boolean): CSSProperties {
  return {
    ...toolbarButton,
    minWidth: 32,
    padding: "0 8px",
    background: active ? "#dbeafe" : "#ffffff",
    borderColor: active ? "#60a5fa" : "#d1d5db",
    color: active ? "#1d4ed8" : "#111827",
  };
}

const toggleLabel: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  color: "#475569",
  fontSize: 12,
  fontWeight: 700,
};

const selectedColumnPill: CSSProperties = {
  height: 30,
  display: "inline-flex",
  alignItems: "center",
  padding: "0 9px",
  border: "1px solid #bfdbfe",
  borderRadius: 7,
  background: "#eff6ff",
  color: "#1d4ed8",
  fontSize: 12,
  fontWeight: 900,
};
const contentGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 190px",
  minHeight: 520,
};

const sheetWrap: CSSProperties = {
  overflow: "auto",
  maxHeight: "calc(100vh - 320px)",
  minHeight: 520,
  background: "#ffffff",
};

const sheetTable: CSSProperties = {
  borderCollapse: "separate",
  borderSpacing: 0,
  width: "100%",
  tableLayout: "fixed",
  fontSize: 12,
};

const stickyTop: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 5,
};

const sheetTh: CSSProperties = {
  height: 54,
  padding: "6px 8px",
  borderRight: "1px solid #cbd5e1",
  borderBottom: "1px solid #cbd5e1",
  background: "#eef2f7",
  color: "#111827",
  fontWeight: 800,
  textAlign: "center",
};

const lessonGroupTh: CSSProperties = {
  height: 50,
  padding: "4px 6px",
  borderRight: "2px solid #111827",
  borderBottom: "1px solid #cbd5e1",
  background: "#e7eefc",
  color: "#111827",
  textAlign: "center",
};

const sheetSubTh: CSSProperties = {
  position: "sticky",
  zIndex: 4,
  height: 30,
  padding: "3px 4px",
  borderRight: "1px solid #cbd5e1",
  borderBottom: "1px solid #cbd5e1",
  background: "#f8fafc",
  color: "#334155",
  fontWeight: 800,
  textAlign: "center",
};

const subHeaderInner: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 3,
};

const subHeaderButton: CSSProperties = {
  minWidth: 0,
  padding: "2px 4px",
  border: "1px solid transparent",
  borderRadius: 5,
  background: "transparent",
  color: "#334155",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
};

const subHeaderButtonActive: CSSProperties = {
  borderColor: "#93c5fd",
  background: "#dbeafe",
  color: "#1d4ed8",
};

const subSortButton: CSSProperties = {
  width: 22,
  height: 22,
  border: "1px solid #cbd5e1",
  borderRadius: 5,
  background: "#ffffff",
  color: "#64748b",
  fontSize: 10,
  fontWeight: 900,
  cursor: "pointer",
};

const subSortButtonActive: CSSProperties = {
  borderColor: "#2563eb",
  background: "#2563eb",
  color: "#ffffff",
};

const lessonNameInput: CSSProperties = {
  width: "100%",
  border: 0,
  outline: 0,
  background: "transparent",
  color: "#111827",
  fontSize: 14,
  fontWeight: 900,
  textAlign: "center",
};

const lessonDateLine: CSSProperties = {
  marginTop: 2,
  color: "#334155",
  fontSize: 12,
  fontWeight: 800,
};

const metaTd: CSSProperties = {
  height: 30,
  padding: "3px 8px",
  borderRight: "1px solid #e2e8f0",
  borderBottom: "1px solid #e2e8f0",
  background: "#f8fafc",
  color: "#111827",
  fontWeight: 800,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const clickableMetaTd: CSSProperties = {
  cursor: "pointer",
};
const lessonTd: CSSProperties = {
  height: 30,
  padding: 0,
  borderRight: "1px solid #e2e8f0",
  borderBottom: "1px solid #e2e8f0",
  background: "#ffffff",
};

const cellInput: CSSProperties = {
  width: "100%",
  height: 29,
  boxSizing: "border-box",
  border: 0,
  outline: 0,
  padding: "0 6px",
  background: "transparent",
  color: "#111827",
  fontSize: "inherit",
  fontFamily: "inherit",
  fontWeight: "inherit",
};

const nameEditInput: CSSProperties = {
  ...cellInput,
  fontWeight: 900,
  background: "#ffffff",
};

const cellDisplay: CSSProperties = {
  width: "100%",
  height: 29,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 6px",
  boxSizing: "border-box",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};
const selectedCell: CSSProperties = {
  boxShadow: "inset 0 0 0 2px #2563eb",
  background: "#eff6ff",
};

const matchedCell: CSSProperties = {
  background: "#fef3c7",
};

const dirtyCell: CSSProperties = {
  boxShadow: "inset 0 -2px 0 #f59e0b",
};

const emptyTd: CSSProperties = {
  padding: 28,
  textAlign: "center",
  color: "#64748b",
};

const lessonPanel: CSSProperties = {
  borderLeft: "1px solid #e5e7eb",
  background: "#f8fafc",
  padding: 10,
  overflow: "auto",
  maxHeight: "calc(100vh - 320px)",
};

const panelHead: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  marginBottom: 8,
};

const panelButton: CSSProperties = {
  height: 26,
  padding: "0 8px",
  border: "1px solid #cbd5e1",
  borderRadius: 7,
  background: "#ffffff",
  color: "#111827",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
};

const rangeButtons: CSSProperties = {
  display: "flex",
  gap: 5,
  flexWrap: "wrap",
  marginBottom: 10,
};

const lessonList: CSSProperties = {
  display: "grid",
  gap: 6,
};

const lessonToggle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "18px 1fr auto",
  alignItems: "center",
  gap: 6,
  padding: "6px 7px",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  background: "#ffffff",
  color: "#334155",
  fontSize: 12,
  fontWeight: 800,
};
