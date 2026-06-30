
export type WorkFilterBarProps = { q?: string; status?: string; from?: string; to?: string };

export default function WorkFilterBar({ q = "", status = "all", from = "", to = "" }: WorkFilterBarProps) {
  return <input name="q" defaultValue={q} data-status={status} data-from={from} data-to={to} />;
}
