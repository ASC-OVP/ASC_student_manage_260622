
export function taskAssigneeNames(task: { assignee?: { name: string } | null; assignees?: Array<{ assignee: { name: string } }> }) {
  const names = task.assignees?.length ? task.assignees.map((item) => item.assignee.name) : task.assignee ? [task.assignee.name] : [];
  return names.join(", ") || "-";
}

export function formatTaskDate(value: Date | string | null | undefined) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 10);
}
