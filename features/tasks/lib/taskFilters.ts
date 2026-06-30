
export function normalizeTaskTab(value?: string) {
  return value || "open";
}

export function isTaskAssignedTo(task: { assigneeId?: string | null; assignees?: Array<{ assigneeId: string }> }, userId: string) {
  return task.assigneeId === userId || Boolean(task.assignees?.some((assignee) => assignee.assigneeId === userId));
}
