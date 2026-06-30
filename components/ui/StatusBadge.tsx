import { Badge, type BadgeTone } from "@/components/ui/Badge";

const STATUS_TONE: Record<string, BadgeTone> = {
  ACTIVE: "green",
  DONE: "green",
  COMPLETED: "green",
  REGISTERED: "green",
  GRADED: "green",
  GRADED_REVIEW_NEEDED: "yellow",
  RECOGNIZED: "green",
  MATCHED: "green",
  MANUAL: "blue",
  MANUAL_MATCHED: "blue",
  IN_PROGRESS: "blue",
  REVIEW: "yellow",
  REVIEW_NEEDED: "yellow",
  NEEDS_MATCH: "yellow",
  NEEDS_PHONE: "yellow",
  MULTIPLE_MATCHES: "yellow",
  SUBMITTED: "blue",
  TODO: "gray",
  WAITING: "gray",
  UPLOADED: "blue",
  PAUSED: "yellow",
  HOLD: "yellow",
  WATCH: "yellow",
  LEFT: "red",
  FAILED: "red",
  REJECTED: "red",
  OVERDUE: "red",
  NOT_FOUND: "red",
};

export function StatusBadge({
  status,
  label,
  tone,
}: {
  status: string | null | undefined;
  label?: string;
  tone?: BadgeTone;
}) {
  const normalized = String(status ?? "WAITING").toUpperCase();
  return <Badge tone={tone ?? STATUS_TONE[normalized] ?? "gray"}>{label ?? normalized}</Badge>;
}
