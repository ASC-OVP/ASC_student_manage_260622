
import { workStatusLabel, workStatusTone } from "@/features/work/lib/workStatus";

type Props = { status: string };

export default function WorkStatusBadge({ status }: Props) {
  return <span data-tone={workStatusTone(status)}>{workStatusLabel(status)}</span>;
}
