
export function messageStatusLabel(status: string) {
  const labels: Record<string, string> = { READY: "Ready", SENT: "Sent", FAILED: "Failed", SKIPPED: "Skipped", DRY_RUN: "Dry run" };
  return labels[status] ?? status;
}

export function messageStatusTone(status: string) {
  if (status === "SENT") return "success";
  if (status === "FAILED") return "danger";
  if (status === "SKIPPED") return "muted";
  return "default";
}
