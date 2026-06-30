
import { memoTypeLabel } from "@/features/memos/lib/memoTypes";

type Props = { type: string };

export default function MemoTypeBadge({ type }: Props) {
  return <span>{memoTypeLabel(type)}</span>;
}
