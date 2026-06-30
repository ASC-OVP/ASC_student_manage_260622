
export type ClassFilterBarProps = { q?: string; grade?: string; subject?: string; teacherId?: string; status?: string };

export default function ClassFilterBar(props: ClassFilterBarProps) {
  return <input name="q" defaultValue={props.q ?? ""} data-status={props.status ?? ""} />;
}
