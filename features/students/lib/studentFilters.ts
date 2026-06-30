
export function cleanStudentFilter(value?: string) {
  return value && value !== "all" ? value : "";
}

export function isStudentDateFilter(value?: string) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export function includesStudentSearch(row: { name?: string | null; phone?: string | null; parentPhone?: string | null; schoolName?: string | null }, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [row.name, row.phone, row.parentPhone, row.schoolName].some((value) => (value ?? "").toLowerCase().includes(normalized));
}
