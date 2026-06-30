
export function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return value ? String(value).trim() : "";
}

export function optionalText(formData: FormData, key: string) {
  const value = text(formData, key);
  return value.length > 0 ? value : undefined;
}

export function cleanId(value?: string | null) {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed !== "none" && trimmed !== "-" ? trimmed : undefined;
}

export function safeReturnTo(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  return trimmed;
}

export function enumValue<T extends string>(value: string | undefined, values: readonly T[], fallback: T) {
  return value && values.includes(value as T) ? (value as T) : fallback;
}

export function scoreValue(value?: string) {
  if (!value) return 1;
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 ? Math.round(score) : 1;
}

export function intValue(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

export function normalizeAnswer(value?: string) {
  if (!value) return null;
  const compact = value.replace(/\s+/g, "").toUpperCase();
  return compact.length > 0 ? compact.slice(0, 20) : null;
}

export function withoutRecognitionNotes(value: string | null | undefined) {
  return value?.replace(/\n?Recognition (error|log): [\s\S]+$/i, "") || undefined;
}

export function omrHref(examId: string, params?: Record<string, string | number | null | undefined>) {
  const searchParams = new URLSearchParams({ examId });
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== null && value !== undefined && value !== "") {
      searchParams.set(key, String(value));
    }
  }
  return "/omr?" + searchParams.toString();
}
