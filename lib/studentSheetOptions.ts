export type SheetOption = {
  value: string;
  label: string;
  enabled: boolean;
};

export const studentSheetOptionSettingKeys = {
  attendance: "studentSheet.attendanceOptions",
  assignment: "studentSheet.assignmentOptions",
} as const;

export const defaultAttendanceSheetOptions: SheetOption[] = [
  { value: "PRESENT", label: "현장", enabled: true },
  { value: "LATE", label: "지각", enabled: true },
  { value: "VIDEO", label: "영상", enabled: true },
  { value: "MAKEUP", label: "보강", enabled: true },
  { value: "MATERIAL", label: "자료", enabled: true },
  { value: "EARLY_LEAVE", label: "조퇴", enabled: true },
  { value: "SKIP", label: "출튀", enabled: true },
  { value: "ABSENT", label: "결석", enabled: true },
  { value: "EXCUSED", label: "부재", enabled: true },
  { value: "LEFT", label: "퇴원", enabled: true },
];

export const defaultAssignmentSheetOptions: SheetOption[] = [
  { value: "UNCHECKED", label: "미확인", enabled: true },
  { value: "DONE", label: "완료", enabled: true },
  { value: "PARTIAL", label: "부분", enabled: true },
  { value: "MISSING", label: "미완료", enabled: true },
];

export function normalizeSheetOptions(input: unknown, defaults: SheetOption[]) {
  const source = Array.isArray(input) ? input : [];
  if (source.length === 0) return defaults;

  const knownLabels = new Map(defaults.map((option) => [option.value, option.label]));
  const usedValues = new Set<string>();
  const normalized = source
    .map((item) => {
      if (!item || typeof item !== "object" || !("value" in item)) return null;

      const rawValue = String((item as { value: unknown }).value ?? "").trim();
      const value = normalizeOptionValue(rawValue);
      if (!value || usedValues.has(value)) return null;

      const rawLabel = "label" in item ? String((item as { label?: unknown }).label ?? "").trim() : "";
      const label = rawLabel || knownLabels.get(value) || value;
      const enabled = "enabled" in item ? Boolean((item as { enabled?: unknown }).enabled) : true;

      usedValues.add(value);
      return { value, label, enabled };
    })
    .filter((option): option is SheetOption => Boolean(option));

  if (normalized.length === 0) return defaults;

  if (!normalized.some((option) => option.enabled)) {
    return normalized.map((option, index) => ({ ...option, enabled: index === 0 }));
  }

  return normalized;
}

export function optionLabel(options: SheetOption[], value?: string) {
  return options.find((option) => option.value === value)?.label ?? value ?? "";
}

function normalizeOptionValue(value: string) {
  const normalized = value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 48);
  return normalized || "";
}
