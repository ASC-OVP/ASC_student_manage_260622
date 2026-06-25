export type SheetCustomColumn = {
  id: string;
  label: string;
  enabled: boolean;
  afterColumnId?: string | null;
};

export type SheetCustomCellValues = Record<string, Record<string, string>>;

export const studentSheetCustomSettingKeys = {
  columns: "studentSheet.customColumns.v1",
  values: "studentSheet.customValues.v1",
} as const;

export function normalizeCustomColumns(value: unknown): SheetCustomColumn[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const columns: SheetCustomColumn[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;

    const raw = item as Partial<SheetCustomColumn>;
    const id = normalizeCustomColumnId(raw.id);
    const label = String(raw.label ?? "").trim().slice(0, 30);

    if (!id || !label || seen.has(id)) continue;

    seen.add(id);
    columns.push({
      id,
      label,
      enabled: raw.enabled !== false,
      afterColumnId: normalizeColumnAnchor(raw.afterColumnId),
    });
  }

  return columns.slice(0, 24);
}

export function normalizeCustomCellValues(value: unknown): SheetCustomCellValues {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const rows: SheetCustomCellValues = {};
  for (const [studentId, cells] of Object.entries(value as Record<string, unknown>)) {
    if (!isSafeKey(studentId) || !cells || typeof cells !== "object" || Array.isArray(cells)) continue;

    const rowCells: Record<string, string> = {};
    for (const [columnId, cellValue] of Object.entries(cells as Record<string, unknown>)) {
      const cleanColumnId = normalizeCustomColumnId(columnId);
      if (!cleanColumnId) continue;

      rowCells[cleanColumnId] = String(cellValue ?? "").slice(0, 500);
    }

    rows[studentId] = rowCells;
  }

  return rows;
}

export function normalizeCustomColumnId(value: unknown) {
  const id = String(value ?? "").trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : "";
}

function normalizeColumnAnchor(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const id = String(value).trim();
  return /^[A-Za-z0-9_-]{1,80}$/.test(id) ? id : null;
}

function isSafeKey(value: string) {
  return /^[A-Za-z0-9_-]{1,80}$/.test(value);
}
