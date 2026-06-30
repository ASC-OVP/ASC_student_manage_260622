
export function studentDisplayName(student: { name: string; schoolName?: string | null; grade?: string | null }) {
  return [student.name, student.schoolName, student.grade].filter(Boolean).join(" / ");
}

export function studentSheetOptionLabel(options: Array<{ value: string; label: string }>, value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}
