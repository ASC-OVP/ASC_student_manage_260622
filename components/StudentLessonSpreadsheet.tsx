"use client";

import type { ClipboardEvent, CSSProperties, KeyboardEvent, MouseEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  deleteStudentsFromSheet,
  saveClassLessonConfig,
  updateStudentClassGroup,
  updateStudentLessonCells,
  updateStudentSheetCell,
  updateStudentSheetCustomCells,
  updateStudentSheetCustomColumns,
} from "@/app/students/actions";
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
  lessons?: StoredClassLesson[];
};

export type StoredClassLesson = {
  id: string;
  position: number;
  title: string;
  lessonDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  memo?: string | null;
};

type Props = {
  rows: StudentSheetRow[];
  customColumns: SheetCustomColumn[];
  selectedClassGroupId?: string | null;
  classGroups: LessonClassGroupOption[];
};

type LessonFieldId = "attendance" | "assignment" | "test";
type MetaColumnId = "rowNumber" | "name" | "phone" | "parentPhone" | "schoolName" | "grade" | "classGroup" | "subject" | "currentLevel" | "memo";
type EditableMetaColumnId = Exclude<MetaColumnId, "rowNumber">;

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
  startTime?: string;
  endTime?: string;
  memo?: string;
  source: "schedule" | "manual" | "fallback";
};

type InsertedLesson = {
  id: string;
  index: number;
  afterId: string | null;
  label: string;
  date: string;
  startTime: string;
  endTime: string;
  memo: string;
  createdAt: number;
};

type GridColumn =
  | { id: MetaColumnId; label: string; kind: "meta"; width: number }
  | { id: string; label: string; kind: "custom"; width: number; customColumnId: string }
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

type EditableGridColumn =
  | Extract<GridColumn, { kind: "lesson" }>
  | Extract<GridColumn, { kind: "custom" }>
  | (Extract<GridColumn, { kind: "meta" }> & { id: EditableMetaColumnId });

type ContextMenuState = {
  x: number;
  y: number;
  rowIndex?: number;
  colIndex?: number;
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

type DirtyMetaValue = {
  studentId: string;
  field: EditableMetaColumnId;
  value: string;
};

type SheetHistorySnapshot = {
  values: Record<string, string>;
  dirtyValues: Record<string, string>;
  dirtyMetaValues: Record<string, DirtyMetaValue>;
  cellStyles: Record<string, CellStyle>;
  lessonLabels: Record<string, string>;
  lessonDateOverrides: Record<string, string>;
  lessonTimeOverrides: Record<string, LessonTimeOverride>;
  lessonMemoOverrides: Record<string, string>;
  insertedLessons: InsertedLesson[];
  deletedLessonIds: string[];
  visibleLessonIds: string[];
  extraLessonCount: number;
  lessonConfigDirty: boolean;
  localCustomColumns: SheetCustomColumn[];
  nameDrafts: Record<string, string>;
  metaDrafts: Record<string, string>;
  classGroupDraftIds: Record<string, string>;
  customColumnDrafts: Record<string, string>;
  formatDraft: CellStyle;
};

type LessonTimeOverride = {
  startTime: string;
  endTime: string;
};

type ColorPaletteItem = {
  label: string;
  value: string;
};

type SortDirection = "asc" | "desc";
type DragMode = "cell" | "row" | null;

function createLocalId(prefix: string) {
  const randomId =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${new Date().getTime()}_${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${randomId}`;
}

function currentClientTime() {
  return new Date().getTime();
}

const lessonFields: LessonField[] = [
  { id: "attendance", label: "출결", width: 92 },
  { id: "assignment", label: "과제", width: 104 },
  { id: "test", label: "테스트", width: 108 },
];

const metaColumns: Array<Extract<GridColumn, { kind: "meta" }>> = [
  { id: "rowNumber", label: "번호", kind: "meta", width: 64 },
  { id: "name", label: "학생명", kind: "meta", width: 136 },
  { id: "phone", label: "학생 연락처", kind: "meta", width: 154 },
  { id: "parentPhone", label: "보호자 연락처", kind: "meta", width: 166 },
  { id: "schoolName", label: "학교", kind: "meta", width: 126 },
  { id: "grade", label: "학년", kind: "meta", width: 78 },
  { id: "classGroup", label: "반", kind: "meta", width: 150 },
  { id: "subject", label: "과목", kind: "meta", width: 84 },
  { id: "currentLevel", label: "레벨", kind: "meta", width: 84 },
  { id: "memo", label: "최근 메모", kind: "meta", width: 230 },
];

const fallbackLessonCount = 12;
const maxGeneratedLessons = 80;
const historyLimit = 80;
const fillPalette: ColorPaletteItem[] = [
  { label: "검정", value: "#000000" },
  { label: "진회색", value: "#404040" },
  { label: "회색", value: "#737373" },
  { label: "연회색", value: "#a3a3a3" },
  { label: "밝은 회색", value: "#d4d4d4" },
  { label: "흰색", value: "#ffffff" },
  { label: "빨강", value: "#ff0000" },
  { label: "주황", value: "#ff9900" },
  { label: "노랑", value: "#ffff00" },
  { label: "초록", value: "#00ff00" },
  { label: "청록", value: "#00ffff" },
  { label: "파랑", value: "#0000ff" },
  { label: "남색", value: "#4f46e5" },
  { label: "보라", value: "#9900ff" },
  { label: "분홍", value: "#ff00ff" },
  { label: "연빨강", value: "#f4cccc" },
  { label: "연주황", value: "#fce5cd" },
  { label: "연노랑", value: "#fff2cc" },
  { label: "연초록", value: "#d9ead3" },
  { label: "연청록", value: "#d0e0e3" },
  { label: "연파랑", value: "#cfe2f3" },
  { label: "연남색", value: "#d9d2e9" },
  { label: "연보라", value: "#ead1dc" },
  { label: "중간 빨강", value: "#e06666" },
  { label: "중간 주황", value: "#f6b26b" },
  { label: "중간 노랑", value: "#ffd966" },
  { label: "중간 초록", value: "#93c47d" },
  { label: "중간 청록", value: "#76a5af" },
  { label: "중간 파랑", value: "#6fa8dc" },
  { label: "중간 남색", value: "#8e7cc3" },
  { label: "중간 보라", value: "#c27ba0" },
  { label: "진빨강", value: "#cc0000" },
  { label: "진주황", value: "#e69138" },
  { label: "진노랑", value: "#f1c232" },
  { label: "진초록", value: "#6aa84f" },
  { label: "진청록", value: "#45818e" },
  { label: "진파랑", value: "#3d85c6" },
  { label: "진남색", value: "#674ea7" },
  { label: "진보라", value: "#a64d79" },
  { label: "어두운 빨강", value: "#990000" },
  { label: "어두운 주황", value: "#b45f06" },
  { label: "어두운 노랑", value: "#bf9000" },
  { label: "어두운 초록", value: "#38761d" },
  { label: "어두운 청록", value: "#134f5c" },
  { label: "어두운 파랑", value: "#0b5394" },
  { label: "어두운 남색", value: "#351c75" },
  { label: "어두운 보라", value: "#741b47" },
];
export default function StudentLessonSpreadsheet({
  rows,
  customColumns,
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
  const [lessonDateOverrides, setLessonDateOverrides] = useState<Record<string, string>>({});
  const [lessonTimeOverrides, setLessonTimeOverrides] = useState<Record<string, LessonTimeOverride>>({});
  const [lessonMemoOverrides, setLessonMemoOverrides] = useState<Record<string, string>>({});
  const [insertedLessons, setInsertedLessons] = useState<InsertedLesson[]>([]);
  const [deletedLessonIds, setDeletedLessonIds] = useState<string[]>([]);
  const [lessonConfigDirty, setLessonConfigDirty] = useState(false);
  const [localCustomColumns, setLocalCustomColumns] = useState<SheetCustomColumn[]>(customColumns);
  const [visibleLessonIds, setVisibleLessonIds] = useState<string[]>([]);
  const [lessonPanelOpen, setLessonPanelOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [rangeStartLessonId, setRangeStartLessonId] = useState("");
  const [rangeEndLessonId, setRangeEndLessonId] = useState("");
  const [lessonOnlyView, setLessonOnlyView] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [dirtyValues, setDirtyValues] = useState<Record<string, string>>({});
  const [dirtyMetaValues, setDirtyMetaValues] = useState<Record<string, DirtyMetaValue>>({});
  const [cellStyles, setCellStyles] = useState<Record<string, CellStyle>>({});
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [editingCellKey, setEditingCellKey] = useState<string | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingMetaKey, setEditingMetaKey] = useState<string | null>(null);
  const [editingCustomColumnId, setEditingCustomColumnId] = useState<string | null>(null);
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [metaDrafts, setMetaDrafts] = useState<Record<string, string>>({});
  const [classGroupDraftIds, setClassGroupDraftIds] = useState<Record<string, string>>({});
  const [customColumnDrafts, setCustomColumnDrafts] = useState<Record<string, string>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [fillPaletteOpen, setFillPaletteOpen] = useState(false);
  const [columnSearchId, setColumnSearchId] = useState<string>("name");
  const [columnSearch, setColumnSearch] = useState("");
  const [searchFocusTick, setSearchFocusTick] = useState(0);
  const [sortColumnId, setSortColumnId] = useState<string>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [formatDraft, setFormatDraft] = useState<CellStyle>({
    fill: "#ffffff",
    fontFamily: "Arial",
    fontSize: "13",
    align: "center",
  });
  const [undoStack, setUndoStack] = useState<SheetHistorySnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<SheetHistorySnapshot[]>([]);
  const [statusText, setStatusText] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const sheetWrapRef = useRef<HTMLDivElement | null>(null);
  const colorMenuRef = useRef<HTMLDivElement | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const nameInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const metaInputRefs = useRef<Record<string, HTMLInputElement | HTMLSelectElement | null>>({});
  const activeRangeEditRef = useRef<{
    targetKey: string;
    lessonCells: Array<{ studentId: string; columnId: string }>;
    metaCells: Array<{ row: StudentSheetRow; columnId: Exclude<EditableMetaColumnId, "classGroup"> }>;
    historyCaptured: boolean;
  } | null>(null);
  const suppressBlurSaveRef = useRef(false);
  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

  const baseLessons = useMemo(() => {
    return buildLessonsForClass(selectedClassGroup, extraLessonCount, customColumns);
  }, [customColumns, extraLessonCount, selectedClassGroup]);

  const lessons = useMemo(() => {
    const deleted = new Set(deletedLessonIds);
    return applyLessonOverrides(
      mergeInsertedLessons(baseLessons, insertedLessons).filter((lesson) => !deleted.has(lesson.id)),
      lessonDateOverrides,
      lessonTimeOverrides,
      lessonMemoOverrides
    );
  }, [baseLessons, deletedLessonIds, insertedLessons, lessonDateOverrides, lessonMemoOverrides, lessonTimeOverrides]);

  const activeVisibleLessonIds = useMemo(() => {
    const allowed = new Set(lessons.map((lesson) => lesson.id));
    const visible = visibleLessonIds.filter((lessonId) => allowed.has(lessonId));
    return visible.length > 0 ? visible : lessons.map((lesson) => lesson.id);
  }, [lessons, visibleLessonIds]);

  const visibleLessons = useMemo(() => {
    const visible = lessons.filter((lesson) => activeVisibleLessonIds.includes(lesson.id));
    return visible.length > 0 ? visible : lessons.slice(0, Math.min(5, lessons.length));
  }, [activeVisibleLessonIds, lessons]);

  const rangeStartId = useMemo(
    () => (lessons.some((lesson) => lesson.id === rangeStartLessonId) ? rangeStartLessonId : lessons[0]?.id ?? ""),
    [lessons, rangeStartLessonId]
  );
  const rangeEndId = useMemo(
    () => (lessons.some((lesson) => lesson.id === rangeEndLessonId) ? rangeEndLessonId : lessons[lessons.length - 1]?.id ?? ""),
    [lessons, rangeEndLessonId]
  );
  const isAllLessonsVisible = activeVisibleLessonIds.length === lessons.length && lessons.every((lesson) => activeVisibleLessonIds.includes(lesson.id));

  const gridColumns = useMemo<GridColumn[]>(() => {
    const visibleMetaColumns = lessonOnlyView ? metaColumns.filter((column) => column.id === "rowNumber" || column.id === "name") : metaColumns;
    const customGridColumns = lessonOnlyView
      ? []
      : localCustomColumns
          .filter((column) => column.enabled)
          .map((column) => ({
            id: column.id,
            label: column.label,
            kind: "custom" as const,
            width: 128,
            customColumnId: column.id,
          }));
    const lessonColumns = visibleLessons.flatMap((lesson) => {
      const groupLabel = lessonDisplayLabel(lesson, lessonLabels);
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
      ...visibleMetaColumns,
      ...customGridColumns,
      ...lessonColumns,
    ];
  }, [lessonLabels, lessonOnlyView, localCustomColumns, scope, visibleLessons]);

  const effectiveColumnSearchId = useMemo(() => {
    return gridColumns.some((column) => column.id === columnSearchId) ? columnSearchId : "name";
  }, [columnSearchId, gridColumns]);

  const lessonColumnMap = useMemo(() => {
    const map = new Map<string, Extract<GridColumn, { kind: "lesson" }>>();
    for (const column of gridColumns) {
      if (column.kind === "lesson") map.set(column.id, column);
    }
    return map;
  }, [gridColumns]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalCustomColumns(customColumns);
  }, [customColumns]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setExtraLessonCount(readStoredNumber(extraLessonCountKey(scope)) ?? 0);
      setLessonLabels({});
      setLessonDateOverrides({});
      setLessonTimeOverrides({});
      setLessonMemoOverrides({});
      setInsertedLessons([]);
      setDeletedLessonIds([]);
      setLessonConfigDirty(false);
      setVisibleLessonIds(readStoredArray(visibleLessonsKey(scope)));
      setLessonPanelOpen(readStoredBoolean(lessonPanelOpenKey(scope)) ?? false);
      setLessonOnlyView(readStoredBoolean(lessonOnlyViewKey(scope)) ?? false);
      setCellStyles(readStoredRecord<CellStyle>(cellStylesKey(scope)));
      setDirtyValues({});
      setDirtyMetaValues({});
      setCustomColumnDrafts({});
      setEditingCustomColumnId(null);
      setUndoStack([]);
      setRedoStack([]);
      activeRangeEditRef.current = null;
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
    window.localStorage.setItem(visibleLessonsKey(scope), JSON.stringify(visibleLessonIds));
  }, [scope, visibleLessonIds]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(lessonPanelOpenKey(scope), lessonPanelOpen ? "1" : "0");
  }, [lessonPanelOpen, scope]);

  useEffect(() => {
    if (!isFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setIsFullscreen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullscreen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(lessonOnlyViewKey(scope), lessonOnlyView ? "1" : "0");
  }, [lessonOnlyView, scope]);

  useEffect(() => {
    if (!fillPaletteOpen) return;

    const handlePointerDown = (event: globalThis.MouseEvent) => {
      if (!colorMenuRef.current?.contains(event.target as Node)) {
        setFillPaletteOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [fillPaletteOpen]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(cellStylesKey(scope), JSON.stringify(cellStyles));
  }, [cellStyles, scope]);

  useEffect(() => {
    if (searchFocusTick === 0) return;
    searchInputRef.current?.focus();
  }, [searchFocusTick]);

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
    const stopDragging = () => {
      setIsDragging(false);
      setDragMode(null);
    };
    window.addEventListener("mouseup", stopDragging);
    return () => window.removeEventListener("mouseup", stopDragging);
  }, []);

  const readDisplayedCellValue = useCallback(
    (row: StudentSheetRow, columnId: string) => {
      if (isMetaColumnId(columnId)) {
        if (columnId === "rowNumber") return metaCellValue(row, columnId);
        const key = lessonCellKey(row.id, columnId);
        if (key in metaDrafts) return metaDrafts[key];
        if (columnId === "name") return nameDrafts[row.id] ?? row.name;
        return metaCellValue(row, columnId);
      }
      return cellValue(row, columnId, values);
    },
    [metaDrafts, nameDrafts, values]
  );

  const orderedRows = useMemo(
    () => sortRows(rows, sortColumnId, sortDirection, (row, columnId) => readDisplayedCellValue(row, columnId)),
    [readDisplayedCellValue, rows, sortColumnId, sortDirection]
  );

  const selectionScope = useMemo(
    () => buildSelectionScope(selection, orderedRows, gridColumns),
    [gridColumns, orderedRows, selection]
  );
  const hasSelectionSearchScope = Boolean(
    selection &&
      selectionScope.rowIds.size > 0 &&
      selectionScope.columnIds.size > 0 &&
      (selectionScope.rowIds.size > 1 || selectionScope.columnIds.size > 1)
  );
  const isGlobalSearchScope = !selection;

  const displayRows = useMemo(
    () =>
      orderedRows.filter((row) => {
        const searchQuery = columnSearch.trim();
        if (searchQuery && hasSelectionSearchScope) {
          if (!selectionScope.rowIds.has(row.id)) return false;
          return [...selectionScope.columnIds].some((columnId) => containsText(readDisplayedCellValue(row, columnId), searchQuery));
        }

        if (searchQuery) {
          if (isGlobalSearchScope) {
            return gridColumns.some((column) => containsText(readDisplayedCellValue(row, column.id), searchQuery));
          }

          const targetValue = readDisplayedCellValue(row, effectiveColumnSearchId);
          if (!containsText(targetValue, searchQuery)) return false;
        }

        return true;
      }),
    [columnSearch, effectiveColumnSearchId, gridColumns, hasSelectionSearchScope, isGlobalSearchScope, orderedRows, readDisplayedCellValue, selectionScope]
  );

  const rangeMatchKeys = useMemo(() => {
    const searchQuery = columnSearch.trim();
    if (!searchQuery || !hasSelectionSearchScope) return new Set<string>();
    const matches = selectedSheetCells(selection, displayRows, gridColumns)
      .filter((cell) => containsText(readDisplayedCellValue(cell.row, cell.columnId), searchQuery))
      .map((cell) => lessonCellKey(cell.row.id, cell.columnId));
    return new Set(matches);
  }, [columnSearch, displayRows, gridColumns, hasSelectionSearchScope, readDisplayedCellValue, selection]);

  const dirtyCount = Object.keys(dirtyValues).length + Object.keys(dirtyMetaValues).length;
  const hasPendingChanges = dirtyCount > 0 || lessonConfigDirty;
  const selectionLabel = selection ? formatSelectionLabel(selection, displayRows, gridColumns) : "선택 없음";
  const hasClassSchedule = Boolean(selectedClassGroup && parseDaysOfWeek(selectedClassGroup).length > 0);
  const selectedColumn = gridColumns.find((column) => column.id === effectiveColumnSearchId);
  const selectedColumnLabel = selectedColumn ? columnLabel(selectedColumn) : "학생명";
  const searchTargetLabel = hasSelectionSearchScope ? "선택 범위" : isGlobalSearchScope ? "전체" : selectedColumnLabel;

  function createHistorySnapshot(): SheetHistorySnapshot {
    const snapshotNameDrafts: Record<string, string> = { ...nameDrafts };
    const snapshotMetaDrafts: Record<string, string> = { ...metaDrafts };
    const snapshotClassGroupDraftIds: Record<string, string> = { ...classGroupDraftIds };

    for (const row of displayRows) {
      snapshotNameDrafts[row.id] = displayName(row);
      snapshotClassGroupDraftIds[row.id] = classGroupDraftIds[row.id] ?? row.classGroupId ?? "";

      for (const column of gridColumns) {
        if (column.kind !== "meta" || column.id === "rowNumber") continue;
        snapshotMetaDrafts[lessonCellKey(row.id, column.id)] = editableMetaValue(row, column.id as EditableMetaColumnId);
      }
    }

    return {
      values: { ...values },
      dirtyValues: { ...dirtyValues },
      dirtyMetaValues: { ...dirtyMetaValues },
      cellStyles: Object.fromEntries(Object.entries(cellStyles).map(([key, style]) => [key, { ...style }])),
      lessonLabels: { ...lessonLabels },
      lessonDateOverrides: { ...lessonDateOverrides },
      lessonTimeOverrides: Object.fromEntries(Object.entries(lessonTimeOverrides).map(([key, value]) => [key, { ...value }])),
      lessonMemoOverrides: { ...lessonMemoOverrides },
      insertedLessons: insertedLessons.map((lesson) => ({ ...lesson })),
      deletedLessonIds: [...deletedLessonIds],
      visibleLessonIds: [...visibleLessonIds],
      extraLessonCount,
      lessonConfigDirty,
      localCustomColumns: localCustomColumns.map((column) => ({ ...column })),
      nameDrafts: snapshotNameDrafts,
      metaDrafts: snapshotMetaDrafts,
      classGroupDraftIds: snapshotClassGroupDraftIds,
      customColumnDrafts: { ...customColumnDrafts },
      formatDraft: { ...formatDraft },
    };
  }

  function restoreHistorySnapshot(snapshot: SheetHistorySnapshot) {
    suppressBlurSaveRef.current = true;
    activeRangeEditRef.current = null;
    setValues(snapshot.values);
    setDirtyValues(snapshot.dirtyValues);
    setDirtyMetaValues(snapshot.dirtyMetaValues);
    setCellStyles(snapshot.cellStyles);
    setLessonLabels(snapshot.lessonLabels);
    setLessonDateOverrides(snapshot.lessonDateOverrides);
    setLessonTimeOverrides(snapshot.lessonTimeOverrides);
    setLessonMemoOverrides(snapshot.lessonMemoOverrides);
    setInsertedLessons(snapshot.insertedLessons);
    setDeletedLessonIds(snapshot.deletedLessonIds);
    setVisibleLessonIds(snapshot.visibleLessonIds);
    setExtraLessonCount(snapshot.extraLessonCount);
    setLessonConfigDirty(snapshot.lessonConfigDirty);
    setLocalCustomColumns(snapshot.localCustomColumns);
    setNameDrafts(snapshot.nameDrafts);
    setMetaDrafts(snapshot.metaDrafts);
    setClassGroupDraftIds(snapshot.classGroupDraftIds);
    setCustomColumnDrafts(snapshot.customColumnDrafts);
    setFormatDraft(snapshot.formatDraft);
    setEditingCellKey(null);
    setEditingNameId(null);
    setEditingMetaKey(null);
    setEditingCustomColumnId(null);
    window.setTimeout(() => {
      suppressBlurSaveRef.current = false;
    }, 0);
  }

  function pushHistory() {
    const snapshot = createHistorySnapshot();
    setUndoStack((current) => [...current.slice(-(historyLimit - 1)), snapshot]);
    setRedoStack([]);
  }

  function undoSheetChange() {
    if (!canUndo) return;
    const currentSnapshot = createHistorySnapshot();
    const previousSnapshot = undoStack[undoStack.length - 1];
    setUndoStack((current) => current.slice(0, -1));
    setRedoStack((current) => [...current.slice(-(historyLimit - 1)), currentSnapshot]);
    restoreHistorySnapshot(previousSnapshot);
    setStatusText("되돌림");
  }

  function redoSheetChange() {
    if (!canRedo) return;
    const currentSnapshot = createHistorySnapshot();
    const nextSnapshot = redoStack[redoStack.length - 1];
    setRedoStack((current) => current.slice(0, -1));
    setUndoStack((current) => [...current.slice(-(historyLimit - 1)), currentSnapshot]);
    restoreHistorySnapshot(nextSnapshot);
    setStatusText("다시 적용됨");
  }

  function persistCustomColumns(columns: SheetCustomColumn[], message = "열 설정 저장됨") {
    const formData = new FormData();
    formData.set("columns", JSON.stringify(columns));
    setStatusText("열 설정 저장 중");
    startTransition(() => {
      void updateStudentSheetCustomColumns(formData)
        .then(() => {
          setStatusText(message);
          router.refresh();
        })
        .catch((error) => setStatusText(error instanceof Error ? error.message : "열 설정 저장 실패"));
    });
  }

  function addCustomColumn() {
    const id = createLocalId("custom");
    const nextColumn: SheetCustomColumn = { id, label: "새 열", enabled: true };
    const nextColumns = [...localCustomColumns, nextColumn];
    pushHistory();
    setLocalCustomColumns(nextColumns);
    setCustomColumnDrafts((current) => ({ ...current, [id]: nextColumn.label }));
    setEditingCustomColumnId(id);
    persistCustomColumns(nextColumns, "열 추가됨");
  }

  function beginEditCustomColumn(column: Extract<GridColumn, { kind: "custom" }>) {
    setEditingCustomColumnId(column.customColumnId);
    setCustomColumnDrafts((current) => ({ ...current, [column.customColumnId]: column.label }));
  }

  function saveCustomColumnName(columnId: string) {
    const current = localCustomColumns.find((column) => column.id === columnId);
    if (!current) {
      setEditingCustomColumnId(null);
      return;
    }
    const label = (customColumnDrafts[columnId] ?? current.label).trim() || current.label;
    setEditingCustomColumnId(null);
    if (label === current.label) return;
    const nextColumns = localCustomColumns.map((column) => (column.id === columnId ? { ...column, label: label.slice(0, 30) } : column));
    pushHistory();
    setLocalCustomColumns(nextColumns);
    persistCustomColumns(nextColumns, "열 이름 변경됨");
  }

  function contextTargetCustomColumn() {
    const menuColumn = typeof contextMenu?.colIndex === "number" ? gridColumns[contextMenu.colIndex] : null;
    if (menuColumn?.kind === "custom") return menuColumn;

    if (!selection) return null;
    const range = normalizeRange(selection);
    if (range.startCol !== range.endCol) return null;
    const selectedColumn = gridColumns[range.startCol];
    return selectedColumn?.kind === "custom" ? selectedColumn : null;
  }

  function deleteCustomColumn(column: Extract<GridColumn, { kind: "custom" }> | null) {
    if (!column) return;
    const current = localCustomColumns.find((item) => item.id === column.customColumnId);
    if (!current) return;
    if (!window.confirm(`${current.label} 열을 삭제할까요? 기본 학생 정보 열은 삭제되지 않습니다.`)) return;

    const nextColumns = localCustomColumns.filter((item) => item.id !== column.customColumnId);
    pushHistory();
    setLocalCustomColumns(nextColumns);
    setEditingCustomColumnId(null);
    setSelection(null);
    setCustomColumnDrafts((currentDrafts) => {
      const next = { ...currentDrafts };
      delete next[column.customColumnId];
      return next;
    });
    setDirtyValues((currentDirty) => {
      const next = { ...currentDirty };
      for (const key of Object.keys(next)) {
        const columnId = key.slice(key.indexOf(":") + 1);
        if (columnId === column.customColumnId) delete next[key];
      }
      return next;
    });
    setCellStyles((currentStyles) => {
      const next = { ...currentStyles };
      for (const key of Object.keys(next)) {
        const columnId = key.slice(key.indexOf(":") + 1);
        if (columnId === column.customColumnId) delete next[key];
      }
      return next;
    });
    persistCustomColumns(nextColumns, "열 삭제됨");
  }

  function selectedRowsForAction() {
    if (!selection) return [];
    const range = normalizeRange(selection);
    const selected = displayRows.slice(range.startRow, range.endRow + 1);
    const seen = new Set<string>();
    return selected.filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
  }

  function deleteSelectedStudents() {
    const selectedRows = selectedRowsForAction();
    if (selectedRows.length === 0) return;
    const label = selectedRows.length === 1 ? selectedRows[0].name : `${selectedRows.length}명`;
    if (!window.confirm(`${label} 학생을 삭제할까요? 이 작업은 저장 버튼 없이 바로 반영됩니다.`)) return;

    const formData = new FormData();
    for (const row of selectedRows) formData.append("studentIds", row.id);
    setStatusText("학생 삭제 중");
    startTransition(() => {
      void deleteStudentsFromSheet(formData)
        .then(() => {
          setSelection(null);
          setStatusText("학생 삭제됨");
          router.refresh();
        })
        .catch((error) => setStatusText(error instanceof Error ? error.message : "학생 삭제 실패"));
    });
  }

  function getCell(row: StudentSheetRow, columnId: string) {
    return cellValue(row, columnId, values);
  }

  function setCell(row: StudentSheetRow, columnId: string, value: string) {
    const activeRangeEdit = activeRangeEditRef.current;
    const activeLessonCells =
      activeRangeEdit?.targetKey === lessonCellKey(row.id, columnId) && activeRangeEdit.lessonCells.length > 0
        ? activeRangeEdit.lessonCells
        : null;
    const selectedCells = selectedLessonCells(selection, displayRows, gridColumns);
    const targetKey = lessonCellKey(row.id, columnId);
    const shouldFillRange = selectedCells.length > 1 && selectedCells.some((cell) => lessonCellKey(cell.row.id, cell.columnId) === targetKey);
    const nextValues: Record<string, string> = {};

    if (activeLessonCells) {
      for (const cell of activeLessonCells) {
        nextValues[lessonCellKey(cell.studentId, cell.columnId)] = value.slice(0, 500);
      }
    } else if (shouldFillRange) {
      for (const cell of selectedCells) {
        nextValues[lessonCellKey(cell.row.id, cell.columnId)] = value.slice(0, 500);
      }
    } else {
      nextValues[targetKey] = value.slice(0, 500);
    }

    if (activeLessonCells && activeRangeEdit) {
      if (!activeRangeEdit.historyCaptured) {
        pushHistory();
        activeRangeEdit.historyCaptured = true;
      }
    } else {
      pushHistory();
    }
    setValues((current) => ({ ...current, ...nextValues }));
    setDirtyValues((current) => ({ ...current, ...nextValues }));
    setStatusText("저장 대기");
  }

  function setMetaCell(row: StudentSheetRow, columnId: Exclude<EditableMetaColumnId, "classGroup">, value: string) {
    const activeRangeEdit = activeRangeEditRef.current;
    const activeMetaCells =
      activeRangeEdit?.targetKey === lessonCellKey(row.id, columnId) && activeRangeEdit.metaCells.length > 0
        ? activeRangeEdit.metaCells
        : null;
    const selectedCells = selectedEditableCells(selection, displayRows, gridColumns);
    const targetKey = lessonCellKey(row.id, columnId);
    const shouldFillRange = selectedCells.length > 1 && selectedCells.some((cell) => lessonCellKey(cell.row.id, cell.columnId) === targetKey);
    const nextMetaDrafts: Record<string, string> = {};
    const nextDirtyMetaValues: Record<string, DirtyMetaValue> = {};
    const nextClassGroupDraftIds: Record<string, string> = {};

    if (activeMetaCells) {
      for (const cell of activeMetaCells) {
        queueMetaCellUpdate(cell.row, cell.columnId, value, nextMetaDrafts, nextDirtyMetaValues, nextClassGroupDraftIds);
      }
    } else if (shouldFillRange) {
      for (const cell of selectedCells) {
        if (cell.column.kind !== "meta" || cell.column.id === "classGroup") continue;
        queueMetaCellUpdate(cell.row, cell.column.id, value, nextMetaDrafts, nextDirtyMetaValues, nextClassGroupDraftIds);
      }
    } else {
      queueMetaCellUpdate(row, columnId, value, nextMetaDrafts, nextDirtyMetaValues, nextClassGroupDraftIds);
    }

    if (Object.keys(nextMetaDrafts).length === 0) return;
    if (activeMetaCells && activeRangeEdit) {
      if (!activeRangeEdit.historyCaptured) {
        pushHistory();
        activeRangeEdit.historyCaptured = true;
      }
    } else {
      pushHistory();
    }
    setMetaDrafts((current) => ({ ...current, ...nextMetaDrafts }));
    setDirtyMetaValues((current) => ({ ...current, ...nextDirtyMetaValues }));
    setClassGroupDraftIds((current) => ({ ...current, ...nextClassGroupDraftIds }));
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

  function finishNameEdit(row: StudentSheetRow) {
    const value = (nameDrafts[row.id] ?? row.name).trim();
    setEditingNameId(null);
    if (value) setStatusText("저장 대기");
  }

  function editableMetaValue(row: StudentSheetRow, columnId: EditableMetaColumnId) {
    const key = lessonCellKey(row.id, columnId);
    if (key in metaDrafts) return metaDrafts[key];
    if (columnId === "name") return displayName(row);
    return metaCellValue(row, columnId);
  }

  function beginEditMeta(row: StudentSheetRow, columnId: MetaColumnId) {
    if (columnId === "rowNumber") return;
    if (columnId === "name") {
      beginEditName(row);
      return;
    }

    const key = lessonCellKey(row.id, columnId);
    setEditingCellKey(null);
    setEditingNameId(null);
    setEditingMetaKey(key);
    setMetaDrafts((current) => ({ ...current, [key]: metaCellValue(row, columnId) }));
    if (columnId === "classGroup") {
      setClassGroupDraftIds((current) => ({ ...current, [row.id]: row.classGroupId ?? "" }));
    }
    window.setTimeout(() => {
      metaInputRefs.current[key]?.focus();
      if (metaInputRefs.current[key] instanceof HTMLInputElement) {
        metaInputRefs.current[key]?.select();
      }
    }, 0);
  }

  function cancelMetaEdit(row: StudentSheetRow, columnId: EditableMetaColumnId) {
    const key = lessonCellKey(row.id, columnId);
    setEditingMetaKey(null);
    setMetaDrafts((current) => ({ ...current, [key]: metaCellValue(row, columnId) }));
    if (columnId === "classGroup") {
      setClassGroupDraftIds((current) => ({ ...current, [row.id]: row.classGroupId ?? "" }));
    }
  }

  function finishMetaTextEdit(row: StudentSheetRow, columnId: Exclude<EditableMetaColumnId, "classGroup">) {
    const key = lessonCellKey(row.id, columnId);
    const value = (metaDrafts[key] ?? metaCellValue(row, columnId)).trim();
    setEditingMetaKey(null);
    setMetaDrafts((current) => ({ ...current, [key]: value }));
    setStatusText("저장 대기");
  }

  function setMetaClassGroup(row: StudentSheetRow, classGroupId: string) {
    const key = lessonCellKey(row.id, "classGroup");
    const classGroup = classGroups.find((option) => option.id === classGroupId);
    const classGroupName = classGroup ? classGroup.name : "-";
    pushHistory();
    setEditingMetaKey(null);
    setMetaDrafts((current) => ({ ...current, [key]: classGroupName }));
    setClassGroupDraftIds((current) => ({ ...current, [row.id]: classGroupId }));
    setDirtyMetaValues((current) => ({ ...current, [key]: { studentId: row.id, field: "classGroup", value: classGroupId } }));
    setStatusText("저장 대기");
  }
  function resolveClassGroupInput(value: string) {
    const normalized = value.trim();
    if (!normalized || normalized === "-" || normalized === "미지정") {
      return { id: "", label: "-" };
    }

    const match = classGroups.find((option) => {
      const fullLabel = option.teacherName ? `${option.teacherName} / ${option.name}` : option.name;
      return option.id === normalized || option.name === normalized || fullLabel === normalized;
    });

    return match ? { id: match.id, label: match.name } : null;
  }

  function buildMetaUpdate(row: StudentSheetRow, columnId: EditableMetaColumnId, rawValue: string) {
    const value = rawValue.slice(0, 500);
    if (columnId === "name" && !value.trim()) return null;

    if (columnId === "classGroup") {
      const resolved = resolveClassGroupInput(value);
      if (!resolved) return null;
      return { displayValue: resolved.label, saveValue: resolved.id };
    }

    return { displayValue: value, saveValue: value };
  }

  function queueMetaCellUpdate(
    row: StudentSheetRow,
    columnId: EditableMetaColumnId,
    rawValue: string,
    draftPatch: Record<string, string>,
    dirtyPatch: Record<string, DirtyMetaValue>,
    classGroupPatch: Record<string, string>
  ) {
    const update = buildMetaUpdate(row, columnId, rawValue);
    if (!update) return false;

    const key = lessonCellKey(row.id, columnId);
    draftPatch[key] = update.displayValue;
    dirtyPatch[key] = { studentId: row.id, field: columnId, value: update.saveValue };
    if (columnId === "name") {
      setNameDrafts((current) => ({ ...current, [row.id]: update.displayValue }));
    }
    if (columnId === "classGroup") {
      classGroupPatch[row.id] = update.saveValue;
    }
    return true;
  }

  function updateLessonLabel(lessonId: string, value: string) {
    pushHistory();
    setLessonLabels((current) => ({ ...current, [lessonId]: value.slice(0, 40) }));
    setLessonConfigDirty(true);
  }

  function updateLessonDate(lessonId: string, value: string) {
    const lesson = lessons.find((item) => item.id === lessonId);
    if (!lesson) return;
    pushHistory();
    setLessonDateOverrides((current) => ({ ...current, [lessonId]: value }));
    setLessonConfigDirty(true);

    const lessonColumns = lessonFields.map((field) => lessonColumnId(scope, lesson.index, field.id));
    setDirtyValues((current) => {
      const next = { ...current };
      for (const row of rows) {
        for (const columnId of lessonColumns) {
          next[lessonCellKey(row.id, columnId)] = cellValue(row, columnId, values);
        }
      }
      return next;
    });
    setStatusText("차시 날짜 변경됨 - 저장 필요");
  }

  function updateLessonTime(lessonId: string, field: keyof LessonTimeOverride, value: string) {
    const lesson = lessons.find((item) => item.id === lessonId);
    if (!lesson) return;
    pushHistory();
    setLessonTimeOverrides((current) => {
      const previous = current[lessonId] ?? {
        startTime: lesson.startTime ?? "",
        endTime: lesson.endTime ?? "",
      };
      return {
        ...current,
        [lessonId]: {
          ...previous,
          [field]: value,
        },
      };
    });
    setLessonConfigDirty(true);
    setStatusText("차시 시간 변경됨 - 저장 필요");
  }

  function updateLessonMemo(lessonId: string, value: string) {
    const lesson = lessons.find((item) => item.id === lessonId);
    if (!lesson) return;
    pushHistory();
    setLessonMemoOverrides((current) => ({ ...current, [lessonId]: value.slice(0, 500) }));
    setLessonConfigDirty(true);
    setStatusText("차시 메모 변경됨 - 저장 필요");
  }

  function applyValueToSelection(value: string) {
    const cells = selectedEditableCells(selection, displayRows, gridColumns);
    if (cells.length === 0) return;

    const nextValues: Record<string, string> = {};
    const nextMetaDrafts: Record<string, string> = {};
    const nextDirtyMetaValues: Record<string, DirtyMetaValue> = {};
    const nextClassGroupDraftIds: Record<string, string> = {};

    for (const cell of cells) {
      if (cell.column.kind === "lesson" || cell.column.kind === "custom") {
        nextValues[lessonCellKey(cell.row.id, cell.columnId)] = value.slice(0, 500);
      } else {
        queueMetaCellUpdate(cell.row, cell.column.id, value, nextMetaDrafts, nextDirtyMetaValues, nextClassGroupDraftIds);
      }
    }

    if (Object.keys(nextValues).length > 0) {
      pushHistory();
      setValues((current) => ({ ...current, ...nextValues }));
      setDirtyValues((current) => ({ ...current, ...nextValues }));
    } else if (Object.keys(nextMetaDrafts).length > 0) {
      pushHistory();
    }
    if (Object.keys(nextMetaDrafts).length > 0) {
      setMetaDrafts((current) => ({ ...current, ...nextMetaDrafts }));
      setDirtyMetaValues((current) => ({ ...current, ...nextDirtyMetaValues }));
      setClassGroupDraftIds((current) => ({ ...current, ...nextClassGroupDraftIds }));
    }
    setStatusText("저장 대기");
  }

  function fillSelectionFromAnchor() {
    if (!selection) return;
    const anchorRow = displayRows[selection.anchor.rowIndex];
    const anchorColumn = gridColumns[selection.anchor.colIndex];
    const fallbackCell = selectedEditableCells(selection, displayRows, gridColumns)[0];
    const sourceRow = anchorRow && anchorColumn && isEditableGridColumn(anchorColumn) ? anchorRow : fallbackCell?.row;
    const sourceColumn = anchorRow && anchorColumn && isEditableGridColumn(anchorColumn) ? anchorColumn : fallbackCell?.column;
    if (!sourceRow || !sourceColumn) return;
    applyValueToSelection(readDisplayedCellValue(sourceRow, sourceColumn.id));
  }

  function clearSelectionStyles() {
    const keys = selectedSheetCells(selection, displayRows, gridColumns).map((cell) => lessonCellKey(cell.row.id, cell.columnId));
    if (keys.length === 0) return;

    pushHistory();
    setCellStyles((current) => {
      const next = { ...current };
      for (const key of keys) delete next[key];
      return next;
    });
  }

  function applyStyleToSelection(patch: CellStyle) {
    const keys = selectedSheetCells(selection, displayRows, gridColumns).map((cell) => lessonCellKey(cell.row.id, cell.columnId));
    if (keys.length === 0) return;

    pushHistory();
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

  function showLessonRange(start: number, end: number) {
    setVisibleLessonIds(lessons.slice(start - 1, end).map((lesson) => lesson.id));
  }

  function showLessonRangeByIds(startId: string, endId: string) {
    const startIndex = lessons.findIndex((lesson) => lesson.id === startId);
    const endIndex = lessons.findIndex((lesson) => lesson.id === endId);
    if (startIndex === -1 || endIndex === -1) return;
    const from = Math.min(startIndex, endIndex);
    const to = Math.max(startIndex, endIndex);
    setVisibleLessonIds(lessons.slice(from, to + 1).map((lesson) => lesson.id));
  }

  function toggleLesson(lessonId: string) {
    setVisibleLessonIds((current) => {
      const selected = current.length > 0 ? current : lessons.map((lesson) => lesson.id);
      const next = selected.includes(lessonId)
        ? selected.filter((id) => id !== lessonId)
        : [...selected, lessonId];
      return next.length > 0 ? next : selected;
    });
  }

  function toggleSort(columnId: string) {
    setSortColumnId(columnId);
    setSortDirection((current) => (sortColumnId === columnId && current === "asc" ? "desc" : "asc"));
  }

  function addLesson() {
    const nextExtra = extraLessonCount + 1;
    const nextIndex = baseLessons.length + 1;
    const nextId = lessonId(nextIndex);
    pushHistory();
    setExtraLessonCount(nextExtra);
    setVisibleLessonIds((current) => [...new Set([...current, nextId])]);
  }

  function insertLessonAfter(afterLessonId: string) {
    const afterLesson = lessons.find((lesson) => lesson.id === afterLessonId);
    const afterOrder = afterLesson ? lessons.findIndex((lesson) => lesson.id === afterLesson.id) : lessons.length - 1;
    const nextIndex = Math.max(0, ...baseLessons.map((lesson) => lesson.index), ...insertedLessons.map((lesson) => lesson.index)) + 1;
    const id = `${createLocalId("manual")}_${nextIndex}`;
    const nextDate = afterLesson?.date ? formatDateInput(addDays(parseLocalDate(afterLesson.date), 1)) : "";
    const inserted: InsertedLesson = {
      id,
      index: nextIndex,
      afterId: afterLessonId,
      label: `${Math.max(1, afterOrder + 2)}차시`,
      date: nextDate,
      startTime: afterLesson?.startTime ?? selectedClassGroup?.startTime ?? "",
      endTime: afterLesson?.endTime ?? selectedClassGroup?.endTime ?? "",
      memo: "",
      createdAt: currentClientTime(),
    };
    pushHistory();
    setInsertedLessons((current) => [...current, inserted]);
    setLessonLabels((current) => ({ ...current, [id]: inserted.label }));
    if (nextDate) setLessonDateOverrides((current) => ({ ...current, [id]: nextDate }));
    setLessonTimeOverrides((current) => ({ ...current, [id]: { startTime: inserted.startTime, endTime: inserted.endTime } }));
    setVisibleLessonIds((current) => (current.length > 0 ? [...new Set([...current, id])] : current));
    setLessonConfigDirty(true);
    setStatusText("차시가 추가됨 - 저장 필요");
  }

  function deleteLesson(lessonId: string) {
    const lesson = lessons.find((item) => item.id === lessonId);
    if (!lesson || lessons.length <= 1) return;
    const label = lessonDisplayLabel(lesson, lessonLabels) || lesson.defaultLabel;
    if (!window.confirm(`${label} 차시를 삭제할까요? 저장 버튼을 눌러야 최종 반영됩니다.`)) return;

    const deletedColumns = new Set(lessonFields.map((field) => lessonColumnId(scope, lesson.index, field.id)));
    pushHistory();
    setDeletedLessonIds((current) => (current.includes(lessonId) ? current : [...current, lessonId]));
    setInsertedLessons((current) => current.filter((item) => item.id !== lessonId));
    setVisibleLessonIds((current) => current.filter((id) => id !== lessonId));
    setLessonLabels((current) => {
      const next = { ...current };
      delete next[lessonId];
      return next;
    });
    setLessonDateOverrides((current) => {
      const next = { ...current };
      delete next[lessonId];
      return next;
    });
    setLessonTimeOverrides((current) => {
      const next = { ...current };
      delete next[lessonId];
      return next;
    });
    setLessonMemoOverrides((current) => {
      const next = { ...current };
      delete next[lessonId];
      return next;
    });
    setDirtyValues((current) => {
      const next = { ...current };
      for (const key of Object.keys(next)) {
        const columnId = key.slice(key.indexOf(":") + 1);
        if (deletedColumns.has(columnId)) delete next[key];
      }
      return next;
    });
    setSelection(null);
    setEditingCellKey(null);
    setLessonConfigDirty(true);
    setStatusText("차시가 삭제됨 - 저장 필요");
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

  function beginRowDrag(event: MouseEvent<HTMLTableCellElement>, rowIndex: number) {
    if (event.button !== 0) return;
    event.preventDefault();
    sheetWrapRef.current?.focus();
    setIsDragging(true);
    setDragMode("row");
    setEditingCellKey(null);
    setEditingNameId(null);
    setEditingMetaKey(null);
    setSelection({ anchor: { rowIndex, colIndex: 0 }, cursor: { rowIndex, colIndex: gridColumns.length - 1 } });
  }

  function selectColumn(colIndex: number) {
    const column = gridColumns[colIndex];
    if (!column || displayRows.length === 0) return;
    setEditingCellKey(null);
    setEditingNameId(null);
    setEditingMetaKey(null);
    setColumnSearchId(column.id);
    setSelection({ anchor: { rowIndex: 0, colIndex }, cursor: { rowIndex: displayRows.length - 1, colIndex } });
    setSearchFocusTick((current) => current + 1);
  }

  function beginEditCell(rowIndex: number, colIndex: number, options?: { preserveSelection?: boolean; initialValue?: string }) {
    const column = gridColumns[colIndex];
    const row = displayRows[rowIndex];
    if (!row || (column?.kind !== "lesson" && column?.kind !== "custom")) return;
    const key = lessonCellKey(row.id, column.id);
    if (!options?.preserveSelection) {
      activeRangeEditRef.current = null;
      setSelection({ anchor: { rowIndex, colIndex }, cursor: { rowIndex, colIndex } });
    }
    setEditingMetaKey(null);
    if (options?.initialValue !== undefined) setCell(row, column.id, options.initialValue);
    setEditingCellKey(key);
    window.setTimeout(() => {
      const input = inputRefs.current[key];
      input?.focus();
      if (options?.initialValue !== undefined) {
        const length = input?.value.length ?? 0;
        input?.setSelectionRange(length, length);
      } else {
        input?.select();
      }
    }, 0);
  }

  function beginEditGridCell(rowIndex: number, colIndex: number, options?: { preserveSelection?: boolean; initialValue?: string }) {
    const column = gridColumns[colIndex];
    const row = displayRows[rowIndex];
    if (!row || !column || !isEditableGridColumn(column)) return;

    if (column.kind === "lesson" || column.kind === "custom") {
      beginEditCell(rowIndex, colIndex, options);
      return;
    }
    if (!options?.preserveSelection) setSelection({ anchor: { rowIndex, colIndex }, cursor: { rowIndex, colIndex } });
    if (column.id === "name") {
      setEditingCellKey(null);
      setEditingMetaKey(null);
      if (options?.initialValue !== undefined) {
        setMetaCell(row, "name", options.initialValue);
      } else {
        setNameDrafts((current) => ({ ...current, [row.id]: displayName(row) }));
      }
      setEditingNameId(row.id);
      window.setTimeout(() => {
        const input = nameInputRefs.current[row.id];
        input?.focus();
        if (options?.initialValue !== undefined) {
          const length = input?.value.length ?? 0;
          input?.setSelectionRange(length, length);
        } else {
          input?.select();
        }
      }, 0);
      return;
    }
    if (options?.initialValue !== undefined) {
      const key = lessonCellKey(row.id, column.id);
      setEditingCellKey(null);
      setEditingNameId(null);
      if (column.id !== "classGroup") {
        setMetaCell(row, column.id, options.initialValue);
      }
      setEditingMetaKey(key);
      window.setTimeout(() => {
        const input = metaInputRefs.current[key];
        input?.focus();
        if (input instanceof HTMLInputElement) {
          const length = input.value.length;
          input.setSelectionRange(length, length);
        }
      }, 0);
    } else {
      beginEditMeta(row, column.id);
    }
  }

  function beginDrag(event: MouseEvent<HTMLTableCellElement>, rowIndex: number, colIndex: number) {
    if (event.button !== 0) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement || event.target instanceof HTMLSelectElement) return;
    event.preventDefault();
    sheetWrapRef.current?.focus();
    setIsDragging(true);
    setDragMode("cell");
    setEditingMetaKey(null);
    selectCell(rowIndex, colIndex, event.shiftKey);
  }

  function openContextMenu(event: MouseEvent<HTMLElement>, rowIndex?: number, colIndex?: number) {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement || event.target instanceof HTMLSelectElement) return;
    event.preventDefault();
    sheetWrapRef.current?.focus();
    if (typeof rowIndex === "number" && typeof colIndex === "number" && !isSelected(selection, rowIndex, colIndex)) {
      setSelection({ anchor: { rowIndex, colIndex }, cursor: { rowIndex, colIndex } });
    }
    setContextMenu({ x: event.clientX, y: event.clientY, rowIndex, colIndex });
  }

  function enterDrag(rowIndex: number, colIndex: number) {
    if (!isDragging) return;
    if (dragMode === "row") {
      setSelection((current) => (current ? { anchor: current.anchor, cursor: { rowIndex, colIndex: gridColumns.length - 1 } } : current));
      return;
    }
    setSelection((current) => (current ? { ...current, cursor: { rowIndex, colIndex } } : current));
  }

  function onCellKeyDown(event: KeyboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) {
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
    if (colIndex < 0 || colIndex >= gridColumns.length) return;
    const column = gridColumns[colIndex];
    if (!column || !isEditableGridColumn(column)) return;

    activeRangeEditRef.current = null;
    setSelection({ anchor: { rowIndex, colIndex }, cursor: { rowIndex, colIndex } });
    beginEditGridCell(rowIndex, colIndex);
  }

  function captureRangeEdit(targetCell: { row: StudentSheetRow; columnId: string }, cells: ReturnType<typeof selectedEditableCells>) {
    activeRangeEditRef.current = {
      targetKey: lessonCellKey(targetCell.row.id, targetCell.columnId),
      lessonCells: cells
        .filter((cell) => cell.column.kind === "lesson" || cell.column.kind === "custom")
        .map((cell) => ({ studentId: cell.row.id, columnId: cell.columnId })),
      metaCells: cells.flatMap((cell) => {
        if (cell.column.kind !== "meta" || cell.column.id === "classGroup") return [];
        return [{ row: cell.row, columnId: cell.column.id }];
      }),
      historyCaptured: false,
    };
  }

  function initialValueFromPrintableKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing || event.key === "Process") return undefined;
    if (/^[a-zA-Z]$/.test(event.key)) return undefined;
    return event.key;
  }

  function handleSheetKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const key = event.key.toLowerCase();
    const shortcutPressed = event.ctrlKey || event.metaKey;
    if (shortcutPressed && key === "z") {
      event.preventDefault();
      if (event.shiftKey) {
        redoSheetChange();
      } else {
        undoSheetChange();
      }
      return;
    }
    if (shortcutPressed && key === "y") {
      event.preventDefault();
      redoSheetChange();
      return;
    }
    if (shortcutPressed && key === "c" && !(event.target instanceof HTMLInputElement)) {
      event.preventDefault();
      void copySelectionToClipboard();
      return;
    }
    if (shortcutPressed && key === "x" && !(event.target instanceof HTMLInputElement)) {
      event.preventDefault();
      void cutSelectionToClipboard();
      return;
    }
    if (event.target instanceof HTMLInputElement) return;
    const selectedCells = selectedEditableCells(selection, displayRows, gridColumns);
    if (selectedCells.length === 0) return;

    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      activeRangeEditRef.current = null;
      applyValueToSelection("");
      return;
    }

    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const firstCell = selectedCells[0];
      const initialValue = initialValueFromPrintableKey(event);
      if (selectedCells.length > 1) {
        captureRangeEdit(firstCell, selectedCells);
      } else {
        activeRangeEditRef.current = null;
      }
      beginEditGridCell(firstCell.rowIndex, firstCell.colIndex, {
        preserveSelection: selectedCells.length > 1,
        ...(initialValue !== undefined ? { initialValue } : {}),
      });
    }
  }


  function selectedTextMatrix() {
    const matrix = selectedMatrix(selection, displayRows, gridColumns, readDisplayedCellValue);
    return matrix.length > 0 ? matrix.map((row) => row.join("\t")).join("\n") : "";
  }

  async function copySelectionToClipboard() {
    const text = selectedTextMatrix();
    if (!text) return false;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(text);
      setStatusText("복사됨");
      return true;
    } catch {
      setStatusText("브라우저에서 복사를 허용해주세요. Ctrl+C는 사용할 수 있습니다.");
      return false;
    }
  }

  async function cutSelectionToClipboard() {
    const copied = await copySelectionToClipboard();
    if (!copied) return;
    activeRangeEditRef.current = null;
    applyValueToSelection("");
    setStatusText("잘라냄");
  }

  function handleCopy(event: ClipboardEvent<HTMLDivElement>) {
    if (event.target instanceof HTMLInputElement && event.target.selectionStart !== event.target.selectionEnd) return;
    const text = selectedTextMatrix();
    if (!text) return;

    event.clipboardData.setData("text/plain", text);
    event.preventDefault();
  }

  function pasteTextAtSelection(text: string) {
    if (!text.trim() || !selection) return;

    const normalized = normalizeRange(selection);
    const startRow = normalized.startRow;
    const startCol = normalized.startCol;

    const rowsToPaste = text.replace(/\r/g, "").split("\n").filter((line, index, lines) => line.length > 0 || index < lines.length - 1);
    const nextValues: Record<string, string> = {};
    const nextMetaDrafts: Record<string, string> = {};
    const nextDirtyMetaValues: Record<string, DirtyMetaValue> = {};
    const nextClassGroupDraftIds: Record<string, string> = {};

    rowsToPaste.forEach((line, rowOffset) => {
      const row = displayRows[startRow + rowOffset];
      if (!row) return;

      line.split("\t").forEach((value, colOffset) => {
        const column = gridColumns[startCol + colOffset];
        if (!column || !isEditableGridColumn(column)) return;
        if (column.kind === "lesson" || column.kind === "custom") {
          nextValues[lessonCellKey(row.id, column.id)] = value.slice(0, 500);
        } else {
          queueMetaCellUpdate(row, column.id, value, nextMetaDrafts, nextDirtyMetaValues, nextClassGroupDraftIds);
        }
      });
    });

    if (Object.keys(nextValues).length === 0 && Object.keys(nextMetaDrafts).length === 0) return;

    pushHistory();
    if (Object.keys(nextValues).length > 0) {
      setValues((current) => ({ ...current, ...nextValues }));
      setDirtyValues((current) => ({ ...current, ...nextValues }));
    }
    if (Object.keys(nextMetaDrafts).length > 0) {
      setMetaDrafts((current) => ({ ...current, ...nextMetaDrafts }));
      setDirtyMetaValues((current) => ({ ...current, ...nextDirtyMetaValues }));
      setClassGroupDraftIds((current) => ({ ...current, ...nextClassGroupDraftIds }));
    }
    setStatusText("저장 대기");
    return true;
  }

  async function pasteSelectionFromClipboard() {
    try {
      if (!navigator.clipboard?.readText) throw new Error("Clipboard API unavailable");
      const text = await navigator.clipboard.readText();
      if (pasteTextAtSelection(text)) setStatusText("붙여넣음");
    } catch {
      setStatusText("브라우저에서 붙여넣기를 허용해주세요.");
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const text = event.clipboardData.getData("text/plain");
    if (!text.trim() || !selection) return;
    pasteTextAtSelection(text);
    event.preventDefault();
  }

  function saveChanges() {
    const recordCells: Array<{ studentId: string; date: string; field: LessonFieldId; value: string }> = [];
    const customCells: Array<{ studentId: string; columnId: string; value: string }> = [];
    const metaCells = Object.values(dirtyMetaValues);
    const shouldSaveLessonConfig = lessonConfigDirty && Boolean(effectiveClassGroupId);

    for (const [key, value] of Object.entries(dirtyValues)) {
      const separator = key.indexOf(":" );
      const studentId = key.slice(0, separator);
      const columnId = key.slice(separator + 1);
      const column = lessonColumnMap.get(columnId);

      if (column?.date) {
        recordCells.push({ studentId, date: column.date, field: column.field, value });
      } else if (columnId.startsWith(`ls_${scope}_`)) {
        continue;
      } else {
        customCells.push({ studentId, columnId, value });
      }
    }

    if (recordCells.length === 0 && customCells.length === 0 && metaCells.length === 0 && !shouldSaveLessonConfig) return;
    const recordFormData = new FormData();
    recordFormData.set("cells", JSON.stringify(recordCells));
    const customFormData = new FormData();
    customFormData.set("cells", JSON.stringify(customCells));
    const lessonFormData = new FormData();
    if (shouldSaveLessonConfig && effectiveClassGroupId) {
      lessonFormData.set("classGroupId", effectiveClassGroupId);
      lessonFormData.set(
        "lessons",
        JSON.stringify(
          lessons.map((lesson) => ({
            title: lessonDisplayLabel(lesson, lessonLabels) || lesson.defaultLabel,
            date: lesson.date ?? "",
            startTime: lesson.startTime ?? "",
            endTime: lesson.endTime ?? "",
            memo: lesson.memo ?? "",
          }))
        )
      );
    }
    setStatusText("저장 중");

    startTransition(() => {
      void (async () => {
        if (shouldSaveLessonConfig) await saveClassLessonConfig(lessonFormData);
        if (recordCells.length > 0) await updateStudentLessonCells(recordFormData);
        if (customCells.length > 0) await updateStudentSheetCustomCells(customFormData);
        for (const cell of metaCells) {
          const formData = new FormData();
          formData.set("studentId", cell.studentId);
          if (cell.field === "classGroup") {
            formData.set("classGroupId", cell.value);
            await updateStudentClassGroup(formData);
          } else {
            formData.set("field", cell.field);
            formData.set("value", cell.value);
            await updateStudentSheetCell(formData);
          }
        }
      })()
        .then(() => {
          setDirtyValues({});
          setDirtyMetaValues({});
          setLessonConfigDirty(false);
          setStatusText("저장됨");
          if (shouldSaveLessonConfig) {
            setExtraLessonCount(0);
            setLessonLabels({});
            setLessonDateOverrides({});
            setLessonTimeOverrides({});
            setLessonMemoOverrides({});
            setInsertedLessons([]);
            setDeletedLessonIds([]);
            setVisibleLessonIds([]);
            setRangeStartLessonId("");
            setRangeEndLessonId("");
          }
          if (shouldSaveLessonConfig || metaCells.length > 0) router.refresh();
        })
        .catch((error) => {
          setStatusText(error instanceof Error ? error.message : "저장 실패");
        });
    });
  }
  const scheduleSummary = selectedClassGroup
    ? `${selectedClassGroup.startDate || "시작일 없음"} ~ ${selectedClassGroup.endDate || "종료일 없음"} · ${
        selectedClassGroup.daysOfWeek || selectedClassGroup.schedule || "요일 미정"
      }`
    : "반 선택 시 운영기간과 요일 기준으로 차시 자동 생성";
  const scheduleSummaryStyle = selectedClassGroup && !hasClassSchedule ? warningText : undefined;
  const sheetHeight = isFullscreen ? "calc(100vh - 138px)" : "100%";
  const deletableContextColumn = contextMenu ? contextTargetCustomColumn() : null;

  return (
    <div style={{ ...shell, ...(isFullscreen ? fullscreenShell : {}) }}>
      <div style={menuBar}>
        <div style={undoRedoGroup}>
          <button
            type="button"
            onClick={undoSheetChange}
            disabled={!canUndo}
            style={{ ...undoRedoButton, ...(!canUndo ? disabledUndoRedoButton : {}) }}
            title="되돌리기 (Ctrl+Z)"
            aria-label="되돌리기"
          >
            ↶
          </button>
          <button
            type="button"
            onClick={redoSheetChange}
            disabled={!canRedo}
            style={{ ...undoRedoButton, ...(!canRedo ? disabledUndoRedoButton : {}) }}
            title="다시하기 (Ctrl+Y)"
            aria-label="다시하기"
          >
            ↷
          </button>
        </div>
        <details style={menuItem}>
          <summary>파일</summary>
          <div style={menuPanel}>
            <button type="button" onClick={saveChanges} disabled={isPending || !hasPendingChanges} style={menuPanelButton}>변경 저장</button>
            <button type="button" onClick={addLesson} style={menuPanelButton}>차시 추가</button>
          </div>
        </details>
        <details style={menuItem}>
          <summary>수정</summary>
          <div style={menuPanel}>
            <button type="button" onClick={fillSelectionFromAnchor} style={menuPanelButton}>첫 셀 값으로 채우기</button>
            <button type="button" onClick={() => applyValueToSelection("")} style={menuPanelButton}>선택 범위 지우기</button>
          </div>
        </details>
        <details style={menuItem}>
          <summary>보기</summary>
          <div style={menuPanel}>
            <button type="button" onClick={() => setVisibleLessonIds(lessons.map((lesson) => lesson.id))} style={menuPanelButton}>전체 차시 보기</button>
            <button type="button" onClick={() => setLessonOnlyView(false)} style={menuPanelButton}>학생 정보 + 차시</button>
            <button type="button" onClick={() => setLessonOnlyView(true)} style={menuPanelButton}>이름 + 차시만</button>
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
          <span>{hasPendingChanges ? [dirtyCount > 0 ? `${dirtyCount}칸 변경` : "", lessonConfigDirty ? "차시 설정 변경" : ""].filter(Boolean).join(" / ") : "변경 없음"}</span>
          <span style={scheduleSummaryStyle}>{scheduleSummary}</span>
        </div>

        <button
          type="button"
          onClick={() => setIsFullscreen((current) => !current)}
          style={{ ...toolbarButton, ...(isFullscreen ? activeToolbarButton : {}) }}
          title={isFullscreen ? "ESC로도 닫을 수 있습니다" : "스프레드시트를 화면 전체로 보기"}
        >
          {isFullscreen ? "전체화면 종료" : "전체화면"}
        </button>
        <button
          type="button"
          onClick={() => setLessonOnlyView((current) => !current)}
          style={{ ...toolbarButton, ...(lessonOnlyView ? activeToolbarButton : {}) }}
        >
          {lessonOnlyView ? "전체 정보 보기" : "차시만 보기"}
        </button>
        <button type="button" onClick={saveChanges} disabled={isPending || !hasPendingChanges} style={primaryButton}>저장</button>
        {statusText && <span style={{ ...saveStatus, ...(isPending ? pendingStatus : {}) }}>{statusText}</span>}
      </div>

      <div style={toolbar}>
        <ColorPaletteDropdown
          label="채우기"
          title="채우기 색상"
          open={fillPaletteOpen}
          setOpen={setFillPaletteOpen}
          currentColor={formatDraft.fill ?? "#ffffff"}
          palette={fillPalette}
          onSelect={(value) => updateFormat({ fill: value })}
          menuRef={colorMenuRef}
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
        <span style={selectedColumnPill}>검색 대상: {searchTargetLabel}</span>
        <input
          ref={searchInputRef}
          value={columnSearch}
          onChange={(event) => setColumnSearch(event.target.value)}
          placeholder={hasSelectionSearchScope ? "선택 범위에서 검색" : isGlobalSearchScope ? "전체에서 검색" : "선택한 열에서 검색"}
          style={toolbarInput}
          autoComplete="off"
        />
        {columnSearch && (
          <button type="button" onClick={() => setColumnSearch("")} style={toolbarButton}>검색 지우기</button>
        )}
        <span style={toolbarSpacer} />
        <button
          type="button"
          onClick={() => setLessonPanelOpen((current) => !current)}
          style={{ ...toolbarButton, ...(lessonPanelOpen ? activeToolbarButton : {}) }}
        >
          {lessonPanelOpen ? "차시 닫기" : "차시 선택"}
        </button>
      </div>
      <div style={{ ...contentGrid, gridTemplateColumns: lessonPanelOpen ? "minmax(0, 1fr) 232px" : "minmax(0, 1fr)", height: sheetHeight }}>
        <div style={sheetPane}>
          <div
            ref={sheetWrapRef}
            style={sheetWrap}
            onCopy={handleCopy}
            onPaste={handlePaste}
            onKeyDown={handleSheetKeyDown}
            onContextMenu={(event) => openContextMenu(event)}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setSelection(null);
                setEditingCellKey(null);
                setEditingNameId(null);
                setEditingMetaKey(null);
              }
            }}
            tabIndex={0}
          >
            <table
              style={{ ...sheetTable, width: totalTableWidth(gridColumns), minWidth: totalTableWidth(gridColumns) }}
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  setSelection(null);
                  setEditingCellKey(null);
                  setEditingNameId(null);
                  setEditingMetaKey(null);
                }
              }}
            >
            <thead>
              <tr>
                {/* eslint-disable-next-line react-hooks/refs */}
                {gridColumns.map((column, headerColIndex) =>
                  column.kind === "meta" || column.kind === "custom" ? (() => {
                    const isSearchColumn = effectiveColumnSearchId === column.id && isFullColumnSelected(selection, headerColIndex, displayRows.length);
                    const isSortColumn = sortColumnId === column.id;
                    const isEditingCustomColumn = column.kind === "custom" && editingCustomColumnId === column.customColumnId;
                    return (
                      <th
                        key={column.id}
                        rowSpan={2}
                        onClick={() => selectColumn(headerColIndex)}
                        onDoubleClick={() => {
                          if (column.kind === "custom") beginEditCustomColumn(column);
                        }}
                        onContextMenu={(event) => openContextMenu(event, undefined, headerColIndex)}
                        style={{ ...sheetTh, ...stickyTop, minWidth: column.width, width: column.width, cursor: "pointer" }}
                        title={`${column.label} 열 선택`}
                      >
                        <div style={metaHeaderInner}>
                          {isEditingCustomColumn && column.kind === "custom" && (
                            <input
                              value={customColumnDrafts[column.customColumnId] ?? column.label}
                              onChange={(event) => setCustomColumnDrafts((current) => ({ ...current, [column.customColumnId]: event.target.value }))}
                              onBlur={() => saveCustomColumnName(column.customColumnId)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") saveCustomColumnName(column.customColumnId);
                                if (event.key === "Escape") setEditingCustomColumnId(null);
                              }}
                              onClick={(event) => event.stopPropagation()}
                              onMouseDown={(event) => event.stopPropagation()}
                              style={customHeaderInput}
                              autoFocus
                              autoComplete="off"
                              aria-label="커스텀 열 이름"
                            />
                          )}
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              selectColumn(headerColIndex);
                            }}
                            style={{ ...metaHeaderButton, ...(isSearchColumn ? subHeaderButtonActive : {}), ...(isEditingCustomColumn ? hiddenHeaderButton : {}) }}
                            title={`${column.label} 열 검색`}
                          >
                            {column.label}
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleSort(column.id);
                            }}
                            style={{ ...subSortButton, ...(isSortColumn ? subSortButtonActive : {}) }}
                            title={`${column.label} 정렬`}
                          >
                            {isSortColumn ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                          </button>
                        </div>
                      </th>
                    );
                  })() : null
                )}
                {visibleLessons.map((lesson) => {
                  const label = lessonDisplayLabel(lesson, lessonLabels);
                  return (
                    <th key={lesson.id} colSpan={lessonFields.length} style={{ ...lessonGroupTh, ...stickyTop }}>
                      <div style={lessonHeaderTop}>
                        <input
                          value={label}
                          onChange={(event) => updateLessonLabel(lesson.id, event.target.value)}
                          style={lessonNameInput}
                          aria-label={`${lesson.defaultLabel} 이름`}
                        />
                        <button type="button" onClick={() => insertLessonAfter(lesson.id)} style={insertLessonButton} title="이 차시 뒤에 차시 추가">
                          +
                        </button>
                        <button type="button" onClick={() => deleteLesson(lesson.id)} style={deleteLessonButton} title="이 차시 삭제" disabled={lessons.length <= 1}>
                          ×
                        </button>
                      </div>
                      <div style={lessonDateLine}>
                        <input
                          type="text"
                          value={lesson.date ?? ""}
                          onChange={(event) => updateLessonDate(lesson.id, event.target.value)}
                          style={lessonDateInput}
                          placeholder="YYYY-MM-DD"
                          aria-label={`${label || lesson.defaultLabel} 날짜`}
                          onMouseDown={(event) => event.stopPropagation()}
                          autoComplete="off"
                        />
                        <input
                          type="text"
                          value={lesson.startTime ?? ""}
                          onChange={(event) => updateLessonTime(lesson.id, "startTime", event.target.value)}
                          style={lessonTimeInput}
                          placeholder="시작"
                          aria-label={`${label || lesson.defaultLabel} 시작 시간`}
                          onMouseDown={(event) => event.stopPropagation()}
                          autoComplete="off"
                        />
                        <span style={lessonTimeSeparator}>~</span>
                        <input
                          type="text"
                          value={lesson.endTime ?? ""}
                          onChange={(event) => updateLessonTime(lesson.id, "endTime", event.target.value)}
                          style={lessonTimeInput}
                          placeholder="종료"
                          aria-label={`${label || lesson.defaultLabel} 종료 시간`}
                          onMouseDown={(event) => event.stopPropagation()}
                          autoComplete="off"
                        />
                      </div>
                      <div style={lessonMemoRow}>
                        <span style={lessonMemoLabel}>진도</span>
                        <input
                          value={lesson.memo ?? ""}
                          onChange={(event) => updateLessonMemo(lesson.id, event.target.value)}
                          style={lessonMemoInput}
                          placeholder="진도/메모 입력"
                          aria-label={`${label || lesson.defaultLabel} 차시 메모`}
                          onMouseDown={(event) => event.stopPropagation()}
                          autoComplete="off"
                        />
                      </div>
                    </th>
                  );
                })}
              </tr>
              <tr>
                {visibleLessons.flatMap((lesson) =>
                  lessonFields.map((field) => {
                    const subColumnId = lessonColumnId(scope, lesson.index, field.id);
                    const subColIndex = gridColumns.findIndex((column) => column.id === subColumnId);
                    const isSearchColumn = effectiveColumnSearchId === subColumnId && isFullColumnSelected(selection, subColIndex, displayRows.length);
                    const isSortColumn = sortColumnId === subColumnId;
                    return (
                      <th key={`${lesson.id}-${field.id}`} style={{ ...sheetSubTh, top: lessonHeaderStickyTop, minWidth: field.width, width: field.width }}>
                        <div style={subHeaderInner}>
                          <button
                            type="button"
                            onClick={() => selectColumn(subColIndex)}
                            style={{ ...subHeaderButton, ...(isSearchColumn ? subHeaderButtonActive : {}) }}
                            title={`${lessonDisplayLabel(lesson, lessonLabels) || lesson.defaultLabel} ${field.label} 열 검색`}
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
                      const isRowNumberCell = column.id === "rowNumber";
                      const isNameCell = column.id === "name";
                      const key = lessonCellKey(row.id, column.id);
                      const isClassGroupCell = column.id === "classGroup";
                      const canEditMeta = !isRowNumberCell;
                      const value = isRowNumberCell ? String(rowIndex + 1) : editableMetaValue(row, column.id as EditableMetaColumnId);
                      const isEditingName = isNameCell && editingNameId === row.id;
                      const isEditingMeta = !isNameCell && canEditMeta && editingMetaKey === key;
                      const localStyle = cellStyles[key] ?? {};
                      return (
                        <td
                          key={column.id}
                          onMouseDown={(event) => {
                            if (isEditingName || isEditingMeta) return;
                            if (isRowNumberCell) {
                              beginRowDrag(event, rowIndex);
                            } else {
                              beginDrag(event, rowIndex, colIndex);
                            }
                          }}
                          onDoubleClick={() => {
                            beginEditMeta(row, column.id);
                          }}
                          onContextMenu={(event) => openContextMenu(event, rowIndex, colIndex)}
                          onMouseEnter={() => enterDrag(rowIndex, colIndex)}
                          style={{ ...metaTd, ...styleToCss(localStyle), ...(isRowNumberCell ? rowHeaderTd : {}), ...(canEditMeta ? clickableMetaTd : {}), ...(selected ? selectedCell : {}), ...(rangeMatchKeys.has(key) ? matchedCell : {}) }}
                          title={isRowNumberCell ? "클릭/드래그: 학생 행 전체 선택" : "드래그: 선택 / 더블클릭: 수정"}
                        >
                          {isEditingName ? (
                            <input
                              ref={(node) => {
                                nameInputRefs.current[row.id] = node;
                              }}
                              value={nameDrafts[row.id] ?? row.name}
                              onChange={(event) => setMetaCell(row, "name", event.target.value)}
                              onBlur={() => {
                                activeRangeEditRef.current = null;
                                if (suppressBlurSaveRef.current) {
                                  setEditingNameId(null);
                                  return;
                                }
                                finishNameEdit(row);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  activeRangeEditRef.current = null;
                                  finishNameEdit(row);
                                }
                                if (event.key === "Escape") setEditingNameId(null);
                              }}
                              style={nameEditInput}
                              autoComplete="off"
                              disabled={isPending}
                              aria-label={`${row.name} 학생명`}
                            />
                          ) : isEditingMeta && isClassGroupCell ? (
                            <select
                              ref={(node) => {
                                metaInputRefs.current[key] = node;
                              }}
                              value={classGroupDraftIds[row.id] ?? row.classGroupId ?? ""}
                              onChange={(event) => setMetaClassGroup(row, event.target.value)}
                              onBlur={() => setEditingMetaKey(null)}
                              onKeyDown={(event) => {
                                if (event.key === "Escape") cancelMetaEdit(row, "classGroup");
                              }}
                              onClick={(event) => event.stopPropagation()}
                              onMouseDown={(event) => event.stopPropagation()}
                              style={metaSelectInput}
                              disabled={isPending}
                              aria-label={`${row.name} 반`}
                            >
                              <option value="">미지정</option>
                              {classGroups.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.teacherName ? `${option.teacherName} / ${option.name}` : option.name}
                                </option>
                              ))}
                            </select>
                          ) : isEditingMeta ? (
                            <input
                              ref={(node) => {
                                metaInputRefs.current[key] = node;
                              }}
                              value={metaDrafts[key] ?? value}
                              onChange={(event) => setMetaCell(row, column.id as Exclude<EditableMetaColumnId, "classGroup">, event.target.value)}
                              onBlur={() => {
                                activeRangeEditRef.current = null;
                                if (suppressBlurSaveRef.current) {
                                  setEditingMetaKey(null);
                                  return;
                                }
                                finishMetaTextEdit(row, column.id as Exclude<EditableMetaColumnId, "classGroup">);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  activeRangeEditRef.current = null;
                                  finishMetaTextEdit(row, column.id as Exclude<EditableMetaColumnId, "classGroup">);
                                }
                                if (event.key === "Escape") cancelMetaEdit(row, column.id as EditableMetaColumnId);
                              }}
                              onClick={(event) => event.stopPropagation()}
                              onMouseDown={(event) => event.stopPropagation()}
                              style={nameEditInput}
                              autoComplete="off"
                              disabled={isPending}
                              aria-label={`${row.name} ${column.label}`}
                            />
                          ) : (
                            value
                          )}
                        </td>
                      );
                    }

                    const key = lessonCellKey(row.id, column.id);
                    const value = getCell(row, column.id);
                    const cellLabel = column.kind === "lesson" ? `${column.groupLabel} ${column.label}` : column.label;
                    const localStyle = cellStyles[key] ?? {};
                    const isDirty = key in dirtyValues;
                    const isRangeMatch = rangeMatchKeys.has(key);
                    const editKey = lessonCellKey(row.id, column.id);
                    const isEditing = editingCellKey === editKey;

                    return (
                      <td
                        key={column.id}
                        onMouseDown={(event) => beginDrag(event, rowIndex, colIndex)}
                        onDoubleClick={() => beginEditCell(rowIndex, colIndex)}
                        onContextMenu={(event) => openContextMenu(event, rowIndex, colIndex)}
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
                            onBlur={() => {
                              activeRangeEditRef.current = null;
                              setEditingCellKey(null);
                            }}
                            onKeyDown={(event) => onCellKeyDown(event, rowIndex, colIndex)}
                            style={{ ...cellInput, textAlign: localStyle.align ?? "center" }}
                            disabled={isPending}
                            aria-label={`${row.name} ${cellLabel}`}
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
          <div style={sheetBottomBar}>
            <nav style={sheetTabs} aria-label="반 시트 탭">
              <Link href="/students?classGroupId=all" style={{ ...sheetTab, ...(!effectiveClassGroupId ? sheetTabActive : {}) }}>
                전체 학생
              </Link>
              {classGroups.map((classGroup) => (
                <Link
                  key={classGroup.id}
                  href={`/students?classGroupId=${encodeURIComponent(classGroup.id)}`}
                  style={{ ...sheetTab, ...(effectiveClassGroupId === classGroup.id ? sheetTabActive : {}) }}
                  title={classGroup.teacherName ? `${classGroup.teacherName} / ${classGroup.name}` : classGroup.name}
                >
                  {classGroup.name}
                </Link>
              ))}
            </nav>
            <span style={sheetBottomStatus}>{visibleLessons.length}개 차시</span>
          </div>
        </div>
        {lessonPanelOpen && (
          <aside style={{ ...lessonPanel, height: sheetHeight, maxHeight: sheetHeight }}>
            <div style={panelHead}>
                <b>차시 선택</b>
                <button type="button" onClick={() => setLessonPanelOpen(false)} style={panelButton}>닫기</button>
            </div>

            <div style={rangeButtons}>
              <button
                type="button"
                onClick={() => setVisibleLessonIds(lessons.map((lesson) => lesson.id))}
                style={{ ...panelButton, ...(isAllLessonsVisible ? panelButtonActive : {}) }}
              >
                  전체
              </button>
              <button type="button" onClick={() => showLessonRange(1, 5)} style={panelButton}>1-5</button>
              <button type="button" onClick={() => showLessonRange(6, 10)} style={panelButton}>6-10</button>
              <button type="button" onClick={() => showLessonRange(11, 15)} style={panelButton}>11-15</button>
            </div>

            <div style={panelSection}>
                <span style={panelSectionTitle}>범위 지정</span>
              <div style={panelRangeRow}>
                <select
                  value={rangeStartId}
                  onChange={(event) => setRangeStartLessonId(event.target.value)}
                  style={panelSelect}
                    aria-label="시작 차시"
                >
                  {lessons.map((lesson, index) => (
                    <option key={lesson.id} value={lesson.id}>
                      {index + 1}. {lessonDisplayLabel(lesson, lessonLabels) || lesson.defaultLabel}
                    </option>
                  ))}
                </select>
                <span>-</span>
                <select
                  value={rangeEndId}
                  onChange={(event) => setRangeEndLessonId(event.target.value)}
                  style={panelSelect}
                    aria-label="끝 차시"
                >
                  {lessons.map((lesson, index) => (
                    <option key={lesson.id} value={lesson.id}>
                      {index + 1}. {lessonDisplayLabel(lesson, lessonLabels) || lesson.defaultLabel}
                    </option>
                  ))}
                </select>
              </div>
                <button type="button" onClick={() => showLessonRangeByIds(rangeStartId, rangeEndId)} style={panelApplyButton}>범위 보기</button>
            </div>

            <div style={lessonList}>
              {lessons.map((lesson) => {
                const checked = activeVisibleLessonIds.includes(lesson.id);
                const label = lessonDisplayLabel(lesson, lessonLabels) || lesson.defaultLabel;
                return (
                  <label key={lesson.id} style={{ ...lessonToggle, ...(checked ? lessonToggleChecked : {}) }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleLesson(lesson.id)} />
                    <span style={lessonToggleText}>{label}</span>
                      <small style={lessonToggleDate}>{lesson.dateLabel || "날짜 미정"}</small>
                  </label>
                );
              })}
            </div>
          </aside>
        )}
        {contextMenu && (
          <div
            style={{ ...contextMenuPanel, left: contextMenu.x, top: contextMenu.y }}
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
            role="menu"
            aria-label="셀 작업 메뉴"
          >
            <button
              type="button"
              style={{ ...contextMenuItem, ...(!selection ? disabledContextMenuItem : {}) }}
              onClick={() => {
                setContextMenu(null);
                void cutSelectionToClipboard();
              }}
              disabled={!selection}
            >
              <span>잘라내기</span>
              <span style={contextMenuShortcut}>Ctrl+X</span>
            </button>
            <button
              type="button"
              style={{ ...contextMenuItem, ...(!selection ? disabledContextMenuItem : {}) }}
              onClick={() => {
                setContextMenu(null);
                void copySelectionToClipboard();
              }}
              disabled={!selection}
            >
              <span>복사</span>
              <span style={contextMenuShortcut}>Ctrl+C</span>
            </button>
            <button
              type="button"
              style={{ ...contextMenuItem, ...(!selection ? disabledContextMenuItem : {}) }}
              onClick={() => {
                setContextMenu(null);
                void pasteSelectionFromClipboard();
              }}
              disabled={!selection}
            >
              <span>붙여넣기</span>
              <span style={contextMenuShortcut}>Ctrl+V</span>
            </button>
            <div style={contextMenuSeparator} />
            <button
              type="button"
              style={contextMenuItem}
              onClick={() => {
                setContextMenu(null);
                addCustomColumn();
              }}
            >
              <span>열 추가</span>
              <span style={contextMenuShortcut}>더블클릭으로 이름 변경</span>
            </button>
            <button
              type="button"
              style={{ ...contextMenuItem, ...contextMenuDangerItem, ...(!deletableContextColumn ? disabledContextMenuItem : {}) }}
              onClick={() => {
                setContextMenu(null);
                deleteCustomColumn(deletableContextColumn);
              }}
              disabled={!deletableContextColumn}
            >
              <span>열 삭제</span>
              <span style={contextMenuShortcut}>{deletableContextColumn ? "추가한 열만" : "기본 열 삭제 불가"}</span>
            </button>
            <div style={contextMenuSeparator} />
            <button
              type="button"
              style={{ ...contextMenuItem, ...contextMenuDangerItem, ...(selectedRowsForAction().length === 0 ? disabledContextMenuItem : {}) }}
              onClick={() => {
                setContextMenu(null);
                deleteSelectedStudents();
              }}
              disabled={selectedRowsForAction().length === 0}
            >
              <span>행 삭제</span>
              <span style={contextMenuShortcut}>학생 삭제</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
function buildLessonsForClass(classGroup: LessonClassGroupOption | null, extraCount: number, customColumns: SheetCustomColumn[]) {
  const stored = storedLessons(classGroup);
  if (stored.length > 0) return stored;

  const scheduled = classGroup ? scheduledLessons(classGroup) : [];
  const baseCount = scheduled.length > 0 ? scheduled.length : fallbackLessonCount;
  const baseLessons = scheduled.length > 0 ? scheduled : fallbackLessons(baseCount, classGroup ? "manual" : "fallback");
  const totalCount = Math.min(maxGeneratedLessons, baseLessons.length + extraCount);
  const lessons = [...baseLessons];
  const fallbackStartTime = classGroup?.startTime ?? "";
  const fallbackEndTime = classGroup?.endTime ?? "";
  const fallbackScheduleLabel = fallbackStartTime || fallbackEndTime ? `${fallbackStartTime || "--:--"}-${fallbackEndTime || "--:--"}` : "";

  for (let index = lessons.length + 1; index <= totalCount; index += 1) {
    lessons.push({
      id: lessonId(index),
      index,
      defaultLabel: customColumns.find((column) => column.id === legacyLessonId(index))?.label || `${index}차시`,
      dateLabel: "날짜 미정",
      scheduleLabel: fallbackScheduleLabel,
      startTime: fallbackStartTime || undefined,
      endTime: fallbackEndTime || undefined,
      source: "manual",
    });
  }

  return lessons;
}

function storedLessons(classGroup: LessonClassGroupOption | null): Lesson[] {
  const stored = classGroup?.lessons ?? [];
  const fallbackStartTime = classGroup?.startTime ?? undefined;
  const fallbackEndTime = classGroup?.endTime ?? undefined;
  return [...stored]
    .sort((a, b) => a.position - b.position)
    .map((lesson, index) => {
      const startTime = lesson.startTime ?? fallbackStartTime;
      const endTime = lesson.endTime ?? fallbackEndTime;
      return {
        id: lesson.id,
        index: index + 1,
        defaultLabel: lesson.title,
        date: lesson.lessonDate ?? undefined,
        dateLabel: lesson.lessonDate ? formatShortDateFromInput(lesson.lessonDate) : "날짜 미정",
        scheduleLabel: startTime || endTime ? `${startTime || "--:--"}-${endTime || "--:--"}` : "",
        startTime,
        endTime,
        memo: lesson.memo ?? undefined,
        source: "schedule" as const,
      };
    });
}

function mergeInsertedLessons(baseLessons: Lesson[], insertedLessons: InsertedLesson[]) {
  if (insertedLessons.length === 0) return baseLessons;
  const byAfter = new Map<string | null, InsertedLesson[]>();
  for (const lesson of insertedLessons) {
    const key = lesson.afterId || null;
    byAfter.set(key, [...(byAfter.get(key) ?? []), lesson]);
  }
  for (const [key, group] of byAfter) {
    byAfter.set(key, [...group].sort((a, b) => a.createdAt - b.createdAt));
  }

  const result: Lesson[] = [];
  const visited = new Set<string>();
  const appendInserted = (afterId: string | null) => {
    for (const inserted of byAfter.get(afterId) ?? []) {
      if (visited.has(inserted.id)) continue;
      visited.add(inserted.id);
      result.push({
        id: inserted.id,
        index: inserted.index,
        defaultLabel: inserted.label,
        date: inserted.date || undefined,
        dateLabel: inserted.date ? formatShortDateFromInput(inserted.date) : "날짜 미정",
        scheduleLabel: inserted.startTime || inserted.endTime ? `${inserted.startTime || "--:--"}-${inserted.endTime || "--:--"}` : "",
        startTime: inserted.startTime || undefined,
        endTime: inserted.endTime || undefined,
        memo: inserted.memo || undefined,
        source: "manual",
      });
      appendInserted(inserted.id);
    }
  };

  appendInserted(null);
  for (const lesson of baseLessons) {
    result.push(lesson);
    appendInserted(lesson.id);
  }
  for (const inserted of insertedLessons) {
    if (!visited.has(inserted.id)) appendInserted(inserted.afterId);
  }
  return result;
}

function applyLessonOverrides(
  lessons: Lesson[],
  dateOverrides: Record<string, string>,
  timeOverrides: Record<string, LessonTimeOverride>,
  memoOverrides: Record<string, string>
) {
  return lessons.map((lesson) => {
    const hasDate = Object.prototype.hasOwnProperty.call(dateOverrides, lesson.id);
    const hasTime = Object.prototype.hasOwnProperty.call(timeOverrides, lesson.id);
    const hasMemo = Object.prototype.hasOwnProperty.call(memoOverrides, lesson.id);
    if (!hasDate && !hasTime && !hasMemo) return lesson;

    const date = hasDate ? dateOverrides[lesson.id] : lesson.date ?? "";
    const time = hasTime ? timeOverrides[lesson.id] : { startTime: lesson.startTime ?? "", endTime: lesson.endTime ?? "" };
    const memo = hasMemo ? memoOverrides[lesson.id] : lesson.memo ?? "";

    return {
      ...lesson,
      date: date || undefined,
      dateLabel: date ? formatShortDateFromInput(date) : "날짜 미정",
      startTime: time.startTime || undefined,
      endTime: time.endTime || undefined,
      scheduleLabel: time.startTime || time.endTime ? `${time.startTime || "--:--"}-${time.endTime || "--:--"}` : "",
      memo,
    };
  });
}

function lessonDisplayLabel(lesson: Lesson, labels: Record<string, string>) {
  return Object.prototype.hasOwnProperty.call(labels, lesson.id) ? labels[lesson.id] : lesson.defaultLabel;
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
      startTime: classGroup.startTime ?? undefined,
      endTime: classGroup.endTime ?? undefined,
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
  const koreanDayMap: Record<string, number> = { "일": 0, "월": 1, "화": 2, "수": 3, "목": 4, "금": 5, "토": 6 };

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

  for (const token of source.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
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

function formatShortDateFromInput(value: string) {
  const date = parseLocalDate(value);
  return date ? formatShortDate(date) : value;
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

function visibleLessonsKey(scope: string) {
  return `asc.studentLessons.visible.v4.${scope}`;
}

function lessonPanelOpenKey(scope: string) {
  return `asc.studentLessons.panelOpen.v1.${scope}`;
}

function lessonOnlyViewKey(scope: string) {
  return `asc.studentLessons.lessonOnly.v1.${scope}`;
}

function cellStylesKey(scope: string) {
  return `asc.studentLessons.styles.v4.${scope}`;
}

function lessonCellKey(studentId: string, columnId: string) {
  return `${studentId}:${columnId}`;
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

function isMetaColumnId(value: string): value is MetaColumnId {
  return metaColumns.some((column) => column.id === value);
}

function metaCellValue(row: StudentSheetRow, columnId: MetaColumnId) {
  if (columnId === "rowNumber") return String(row.no);
  if (columnId === "name") return row.name;
  if (columnId === "phone") return row.phone || "";
  if (columnId === "parentPhone") return row.parentPhone || "";
  if (columnId === "schoolName") return row.schoolName || "";
  if (columnId === "grade") return row.grade || "";
  if (columnId === "classGroup") return row.classGroupName || "-";
  if (columnId === "subject") return row.subject || "";
  if (columnId === "currentLevel") return row.currentLevel || "";
  return row.memo || "";
}

function containsText(value: string, query: string) {
  return value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}

function sortRows(
  rows: StudentSheetRow[],
  columnId: string,
  direction: SortDirection,
  readValue: (row: StudentSheetRow, columnId: string) => string
) {
  const sorted = [...rows].sort((a, b) => {
    const aValue = readValue(a, columnId);
    const bValue = readValue(b, columnId);
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

function isFullColumnSelected(selection: SelectionRange | null, colIndex: number, rowCount: number) {
  if (!selection || rowCount <= 0 || colIndex < 0) return false;
  const range = normalizeRange(selection);
  return range.startCol === colIndex && range.endCol === colIndex && range.startRow === 0 && range.endRow === rowCount - 1;
}

function selectedLessonCells(selection: SelectionRange | null, rows: StudentSheetRow[], columns: GridColumn[]) {
  if (!selection) return [];
  const range = normalizeRange(selection);
  const cells: Array<{ row: StudentSheetRow; columnId: string }> = [];

  for (let rowIndex = range.startRow; rowIndex <= range.endRow; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!row) continue;

    for (let colIndex = range.startCol; colIndex <= range.endCol; colIndex += 1) {
      const column = columns[colIndex];
      if (column?.kind !== "lesson" && column?.kind !== "custom") continue;
      cells.push({ row, columnId: column.id });
    }
  }

  return cells;
}

function isEditableGridColumn(column: GridColumn): column is EditableGridColumn {
  return column.kind === "lesson" || column.kind === "custom" || (column.kind === "meta" && column.id !== "rowNumber");
}

function selectedEditableCells(selection: SelectionRange | null, rows: StudentSheetRow[], columns: GridColumn[]) {
  if (!selection) return [];
  const range = normalizeRange(selection);
  const cells: Array<{ row: StudentSheetRow; rowIndex: number; colIndex: number; columnId: string; column: EditableGridColumn }> = [];

  for (let rowIndex = range.startRow; rowIndex <= range.endRow; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!row) continue;

    for (let colIndex = range.startCol; colIndex <= range.endCol; colIndex += 1) {
      const column = columns[colIndex];
      if (!column || !isEditableGridColumn(column)) continue;
      cells.push({ row, rowIndex, colIndex, columnId: column.id, column });
    }
  }

  return cells;
}

function selectedSheetCells(selection: SelectionRange | null, rows: StudentSheetRow[], columns: GridColumn[]) {
  if (!selection) return [];
  const range = normalizeRange(selection);
  const cells: Array<{ row: StudentSheetRow; columnId: string }> = [];

  for (let rowIndex = range.startRow; rowIndex <= range.endRow; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!row) continue;

    for (let colIndex = range.startCol; colIndex <= range.endCol; colIndex += 1) {
      const column = columns[colIndex];
      if (!column) continue;
      cells.push({ row, columnId: column.id });
    }
  }

  return cells;
}

function selectedMatrix(
  selection: SelectionRange | null,
  rows: StudentSheetRow[],
  columns: GridColumn[],
  readValue: (row: StudentSheetRow, columnId: string) => string
) {
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
      line.push(readValue(row, column.id));
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
  for (let colIndex = range.startCol; colIndex <= range.endCol; colIndex += 1) {
    const column = columns[colIndex];
    if (column) columnIds.add(column.id);
  }
  return { rowIds, columnIds };
}

function formatSelectionLabel(selection: SelectionRange, rows: StudentSheetRow[], columns: GridColumn[]) {
  const range = normalizeRange(selection);
  const rowCount = Math.max(0, range.endRow - range.startRow + 1);
  const colCount = Math.max(0, range.endCol - range.startCol + 1);
  const startColumn = columns[range.startCol] ? columnLabel(columns[range.startCol]) : "?";
  const endColumn = columns[range.endCol] ? columnLabel(columns[range.endCol]) : "?";
  const startRow = rows[range.startRow]?.name ?? `row ${range.startRow + 1}`;
  const endRow = rows[range.endRow]?.name ?? `row ${range.endRow + 1}`;
  return `${startRow} ${startColumn} - ${endRow} ${endColumn} / ${rowCount}x${colCount}`;
}

function columnLabel(column: GridColumn) {
  if (column.kind !== "lesson") return column.label;
  return `${column.groupLabel} ${column.label}`;
}

function totalTableWidth(columns: GridColumn[]) {
  return columns.reduce((sum, column) => sum + column.width, 0);
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

function readStoredBoolean(key: string) {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(key);
  if (value === "1") return true;
  if (value === "0") return false;
  return null;
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

function ColorPaletteDropdown({
  label,
  title,
  open,
  setOpen,
  currentColor,
  palette,
  onSelect,
  menuRef,
}: {
  label: string;
  title: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  currentColor: string;
  palette: ColorPaletteItem[];
  onSelect: (value: string) => void;
  menuRef?: { current: HTMLDivElement | null };
}) {
  return (
    <div ref={menuRef} style={colorMenu}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={colorTrigger}
        aria-haspopup="menu"
        aria-expanded={open}
        title={title}
      >
        <span style={rainbowIcon} />
        <span style={currentColorDot(currentColor)} />
        <span>{label}</span>
      </button>
      {open && (
        <div style={swatchPanel} role="menu" aria-label={title}>
          <div style={swatchPanelTitle}>{title}</div>
          <div style={swatchGrid}>
            {palette.map((color) => {
              const active = currentColor.toLowerCase() === color.value.toLowerCase();
              return (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => {
                    onSelect(color.value);
                    setOpen(false);
                  }}
                  style={swatchButton(color.value, active)}
                  title={color.label}
                  aria-label={`${title} ${color.label}`}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
const shell: CSSProperties = {
  height: "100%",
  minHeight: 0,
  display: "grid",
  gridTemplateRows: "auto auto auto minmax(0, 1fr)",
  border: "1px solid #d7dce5",
  borderRadius: 8,
  background: "#ffffff",
  overflow: "hidden",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
};

const fullscreenShell: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  height: "100vh",
  borderRadius: 0,
  border: 0,
  boxShadow: "none",
};

const menuBar: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
  padding: "4px 8px",
  borderBottom: "1px solid #e5e7eb",
  background: "#f8fafc",
  fontSize: 12,
};

const undoRedoGroup: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 3,
  marginRight: 4,
};

const undoRedoButton: CSSProperties = {
  width: 28,
  height: 28,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid #d1d5db",
  borderRadius: 7,
  background: "#ffffff",
  color: "#111827",
  fontSize: 18,
  fontWeight: 800,
  lineHeight: 1,
  cursor: "pointer",
};

const disabledUndoRedoButton: CSSProperties = {
  opacity: 0.35,
  cursor: "not-allowed",
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

const contextMenuPanel: CSSProperties = {
  position: "fixed",
  zIndex: 1500,
  width: 250,
  padding: "6px 0",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  background: "#ffffff",
  boxShadow: "0 16px 42px rgba(15, 23, 42, 0.2)",
};

const contextMenuItem: CSSProperties = {
  width: "100%",
  height: 34,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 10,
  padding: "0 12px",
  border: 0,
  background: "transparent",
  color: "#111827",
  fontSize: 13,
  fontWeight: 800,
  textAlign: "left",
  cursor: "pointer",
};

const contextMenuDangerItem: CSSProperties = {
  color: "#b91c1c",
};

const disabledContextMenuItem: CSSProperties = {
  opacity: 0.38,
  cursor: "not-allowed",
};

const contextMenuShortcut: CSSProperties = {
  color: "#94a3b8",
  fontSize: 11,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const contextMenuSeparator: CSSProperties = {
  height: 1,
  margin: "5px 0",
  background: "#e5e7eb",
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
  gap: 6,
  flexWrap: "wrap",
  padding: "5px 8px",
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

const warningText: CSSProperties = {
  color: "#b45309",
  fontWeight: 700,
};

const toolbarButton: CSSProperties = {
  height: 28,
  padding: "0 9px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  background: "#ffffff",
  color: "#111827",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const toolbarSpacer: CSSProperties = {
  flex: 1,
};

const activeToolbarButton: CSSProperties = {
  border: "1px solid #2563eb",
  background: "#dbeafe",
  color: "#1d4ed8",
};

const primaryButton: CSSProperties = {
  ...toolbarButton,
  border: "1px solid #111827",
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
  height: 28,
  minWidth: 120,
  padding: "0 8px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  background: "#ffffff",
  fontSize: 12,
};

const compactSelect: CSSProperties = {
  height: 28,
  padding: "0 8px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  background: "#ffffff",
  fontSize: 12,
};

const colorMenu: CSSProperties = {
  position: "relative",
  display: "inline-flex",
};

const colorTrigger: CSSProperties = {
  height: 28,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "0 9px",
  border: "1px solid #d1d5db",
  borderRadius: 7,
  background: "#ffffff",
  color: "#111827",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
};

const rainbowIcon: CSSProperties = {
  width: 18,
  height: 12,
  borderRadius: 4,
  border: "1px solid #cbd5e1",
  background: "linear-gradient(90deg, #fecaca, #fed7aa, #fef08a, #bbf7d0, #bfdbfe, #c7d2fe, #e9d5ff)",
};

function currentColorDot(color: string): CSSProperties {
  return {
    width: 14,
    height: 14,
    borderRadius: 999,
    border: "1px solid #94a3b8",
    background: color,
  };
}

const swatchPanel: CSSProperties = {
  position: "absolute",
  top: 34,
  left: 0,
  zIndex: 50,
  width: 266,
  padding: 10,
  border: "1px solid #d1d5db",
  borderRadius: 10,
  background: "#ffffff",
  boxShadow: "0 18px 44px rgba(15, 23, 42, 0.18)",
};

const swatchPanelTitle: CSSProperties = {
  marginBottom: 8,
  color: "#475569",
  fontSize: 12,
  fontWeight: 900,
};

const swatchGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(8, 24px)",
  gap: 5,
};

function swatchButton(color: string, active: boolean): CSSProperties {
  return {
    width: 24,
    height: 24,
    border: active ? "2px solid #111827" : "1px solid #cbd5e1",
    borderRadius: 999,
    background: color,
    boxShadow: active ? "0 0 0 2px #bfdbfe" : "none",
    cursor: "pointer",
  };
}

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
    border: active ? "1px solid #60a5fa" : "1px solid #d1d5db",
    color: active ? "#1d4ed8" : "#111827",
  };
}

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
  alignItems: "stretch",
  gap: 0,
  minHeight: 0,
};

const sheetPane: CSSProperties = {
  display: "grid",
  gridTemplateRows: "minmax(0, 1fr) auto",
  minWidth: 0,
  minHeight: 0,
  height: "100%",
  background: "#ffffff",
};

const lessonPanel: CSSProperties = {
  position: "sticky",
  top: 0,
  alignSelf: "stretch",
  display: "grid",
  gridTemplateRows: "auto auto auto minmax(0, 1fr)",
  borderLeft: "1px solid #d7dce5",
  background: "#f8fafc",
  padding: 10,
  overflow: "hidden",
  maxHeight: "100%",
};

const panelHead: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  marginBottom: 8,
  color: "#111827",
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

const panelButtonActive: CSSProperties = {
  border: "1px solid #2563eb",
  background: "#dbeafe",
  color: "#1d4ed8",
};

const rangeButtons: CSSProperties = {
  display: "flex",
  gap: 5,
  flexWrap: "wrap",
  marginBottom: 10,
};

const panelSection: CSSProperties = {
  display: "grid",
  gap: 6,
  padding: "8px 0 10px",
  borderTop: "1px solid #e5e7eb",
  borderBottom: "1px solid #e5e7eb",
  marginBottom: 10,
};

const panelSectionTitle: CSSProperties = {
  color: "#64748b",
  fontSize: 12,
  fontWeight: 900,
};

const panelRangeRow: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  alignItems: "center",
  gap: 5,
};

const panelSelect: CSSProperties = {
  minWidth: 0,
  height: 28,
  padding: "0 6px",
  border: "1px solid #cbd5e1",
  borderRadius: 7,
  background: "#ffffff",
  color: "#111827",
  fontSize: 12,
  fontWeight: 700,
};

const panelApplyButton: CSSProperties = {
  ...panelButton,
  width: "100%",
  border: "1px solid #111827",
  background: "#111827",
  color: "#ffffff",
};

const lessonList: CSSProperties = {
  display: "grid",
  alignContent: "start",
  gap: 6,
  minHeight: 0,
  overflowY: "auto",
  paddingRight: 2,
};

const lessonToggle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "18px minmax(0, 1fr)",
  alignItems: "center",
  gap: "2px 6px",
  padding: "6px 7px",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  background: "#ffffff",
  color: "#334155",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
};

const lessonToggleChecked: CSSProperties = {
  border: "1px solid #93c5fd",
  background: "#eff6ff",
};

const lessonToggleText: CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const lessonToggleDate: CSSProperties = {
  gridColumn: "2",
  color: "#64748b",
  fontSize: 11,
  fontWeight: 800,
};

const sheetWrap: CSSProperties = {
  overflow: "auto",
  minHeight: 0,
  background: "#ffffff",
  userSelect: "none",
};

const sheetBottomBar: CSSProperties = {
  position: "sticky",
  bottom: 0,
  zIndex: 12,
  minHeight: 34,
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "3px 6px",
  borderTop: "1px solid #d7dce5",
  background: "#f8fafc",
  boxShadow: "0 -1px 2px rgba(15, 23, 42, 0.04)",
};

const sheetTabs: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  minWidth: 0,
  overflowX: "auto",
  flex: "1 1 auto",
  paddingBottom: 1,
};

const sheetTab: CSSProperties = {
  height: 26,
  display: "inline-flex",
  alignItems: "center",
  maxWidth: 180,
  padding: "0 12px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  background: "#ffffff",
  color: "#475569",
  fontSize: 12,
  fontWeight: 900,
  textDecoration: "none",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  flex: "0 0 auto",
};

const sheetTabActive: CSSProperties = {
  border: "1px solid #2563eb",
  background: "#2563eb",
  color: "#ffffff",
};

const sheetBottomStatus: CSSProperties = {
  flex: "0 0 auto",
  color: "#64748b",
  fontSize: 12,
  fontWeight: 800,
};

const sheetTable: CSSProperties = {
  borderCollapse: "separate",
  borderSpacing: 0,
  tableLayout: "fixed",
  fontSize: 12,
  userSelect: "none",
};

const stickyTop: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 5,
};

const lessonHeaderStickyTop = 98;

const sheetTh: CSSProperties = {
  height: 54,
  padding: "6px 6px",
  borderRight: "1px solid #cbd5e1",
  borderBottom: "1px solid #cbd5e1",
  background: "#eef2f7",
  color: "#111827",
  fontWeight: 800,
  textAlign: "center",
};

const metaHeaderInner: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 22px",
  alignItems: "center",
  justifyContent: "center",
  gap: 3,
  minWidth: 0,
};

const metaHeaderButton: CSSProperties = {
  minWidth: 0,
  maxWidth: "100%",
  padding: "2px 4px",
  border: "1px solid transparent",
  borderRadius: 5,
  background: "transparent",
  color: "#111827",
  fontSize: 12,
  fontWeight: 900,
  overflow: "visible",
  textOverflow: "clip",
  whiteSpace: "nowrap",
  cursor: "pointer",
};

const customHeaderInput: CSSProperties = {
  ...metaHeaderButton,
  width: "100%",
  border: "1px solid #93c5fd",
  background: "#ffffff",
  textAlign: "center",
  userSelect: "text",
};

const hiddenHeaderButton: CSSProperties = {
  visibility: "hidden",
};

const lessonGroupTh: CSSProperties = {
  height: lessonHeaderStickyTop,
  padding: 0,
  borderRight: "2px solid #111827",
  borderBottom: "1px solid #cbd5e1",
  background: "#e7eefc",
  color: "#111827",
  textAlign: "center",
  verticalAlign: "top",
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
  border: "1px solid #93c5fd",
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
  border: "1px solid #2563eb",
  background: "#2563eb",
  color: "#ffffff",
};

const lessonHeaderTop: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 24px 24px",
  alignItems: "center",
  gap: 4,
  minHeight: 30,
  padding: "4px 5px 2px",
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
  userSelect: "text",
};

const insertLessonButton: CSSProperties = {
  width: 22,
  height: 22,
  border: "1px solid #93c5fd",
  borderRadius: 6,
  background: "#eff6ff",
  color: "#1d4ed8",
  fontSize: 14,
  fontWeight: 950,
  lineHeight: "18px",
  cursor: "pointer",
};

const deleteLessonButton: CSSProperties = {
  width: 22,
  height: 22,
  border: "1px solid #fecaca",
  borderRadius: 6,
  background: "#fff1f2",
  color: "#be123c",
  fontSize: 16,
  fontWeight: 950,
  lineHeight: "18px",
  cursor: "pointer",
};

const lessonDateLine: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 3,
  minHeight: 22,
  padding: "0 5px 2px",
  color: "#334155",
  fontSize: 12,
  fontWeight: 800,
  borderTop: "1px solid rgba(148, 163, 184, 0.45)",
};

const lessonDateInput: CSSProperties = {
  width: 96,
  height: 20,
  border: 0,
  outline: 0,
  borderRadius: 0,
  background: "transparent",
  color: "#334155",
  fontSize: 11,
  fontWeight: 800,
  textAlign: "center",
  userSelect: "text",
};

const lessonTimeInput: CSSProperties = {
  width: 42,
  height: 20,
  border: 0,
  outline: 0,
  borderRadius: 0,
  background: "transparent",
  color: "#334155",
  fontSize: 11,
  fontWeight: 800,
  textAlign: "center",
  userSelect: "text",
};

const lessonTimeSeparator: CSSProperties = {
  color: "#64748b",
  fontSize: 11,
  fontWeight: 900,
};

const lessonMemoRow: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "34px minmax(0, 1fr)",
  minHeight: 23,
  borderTop: "1px solid rgba(148, 163, 184, 0.55)",
  background: "rgba(248, 250, 252, 0.48)",
};

const lessonMemoLabel: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRight: "1px solid rgba(148, 163, 184, 0.55)",
  color: "#334155",
  fontSize: 11,
  fontWeight: 900,
};

const lessonMemoInput: CSSProperties = {
  width: "100%",
  minWidth: 0,
  height: 22,
  border: 0,
  outline: 0,
  borderRadius: 0,
  padding: "0 6px",
  background: "transparent",
  color: "#334155",
  fontSize: 11,
  fontWeight: 700,
  textAlign: "left",
  userSelect: "text",
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

const rowHeaderTd: CSSProperties = {
  background: "#eef2f7",
  color: "#475569",
  textAlign: "center",
  cursor: "grab",
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
  fontWeight: 400,
  userSelect: "text",
};

const nameEditInput: CSSProperties = {
  ...cellInput,
  height: 22,
  minWidth: 0,
  padding: 0,
  lineHeight: "22px",
  fontWeight: 400,
  background: "transparent",
};

const metaSelectInput: CSSProperties = {
  ...nameEditInput,
  height: 24,
  padding: "0 3px",
  lineHeight: "24px",
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
