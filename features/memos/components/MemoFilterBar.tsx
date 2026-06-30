
export type MemoFilterBarProps = { q?: string; type?: string; source?: string };

export default function MemoFilterBar({ q = "", type = "all", source = "all" }: MemoFilterBarProps) {
  return <input name="q" defaultValue={q} data-type={type} data-source={source} />;
}
