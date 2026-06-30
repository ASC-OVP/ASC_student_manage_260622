
export type StudentFilterBarProps = { q?: string; status?: string; classGroupId?: string };

export default function StudentFilterBar({ q = "", status = "", classGroupId = "" }: StudentFilterBarProps) {
  return <input name="q" defaultValue={q} data-status={status} data-class-group-id={classGroupId} />;
}
