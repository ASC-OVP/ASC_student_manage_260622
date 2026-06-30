
import { StudentStatus } from "@/lib/generated/prisma";

export function studentStatusLabel(status: StudentStatus | string) {
  if (status === StudentStatus.ACTIVE || status === "ACTIVE") return "Active";
  if (status === StudentStatus.PAUSED || status === "PAUSED") return "Paused";
  if (status === StudentStatus.LEFT || status === "LEFT") return "Left";
  return String(status || "Unknown");
}

export function studentStatusTone(status: StudentStatus | string) {
  if (status === StudentStatus.ACTIVE || status === "ACTIVE") return "success";
  if (status === StudentStatus.PAUSED || status === "PAUSED") return "warning";
  if (status === StudentStatus.LEFT || status === "LEFT") return "muted";
  return "default";
}
