
export function memoMatchesQuery(row: { content?: string | null; studentName?: string | null; className?: string | null }, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [row.content, row.studentName, row.className].some((value) => (value ?? "").toLowerCase().includes(normalized));
}
