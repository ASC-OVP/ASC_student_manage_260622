
export type TaskFilterBarProps = { q?: string; status?: string; assigneeId?: string; tab?: string };

export default function TaskFilterBar({ q = "", status = "", assigneeId = "", tab = "" }: TaskFilterBarProps) {
  return <input name="q" defaultValue={q} data-status={status} data-assignee-id={assigneeId} data-tab={tab} />;
}
