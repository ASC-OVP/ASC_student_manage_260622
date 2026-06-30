
export function taskStatusLabel(status: string) {
  const labels: Record<string, string> = { TODO: "Todo", IN_PROGRESS: "In progress", SUBMITTED: "Submitted", REVIEW: "Review", DONE: "Done", HOLD: "Hold" };
  return labels[status] ?? status;
}

export function taskStatusTone(status: string) {
  if (status === "DONE") return "success";
  if (status === "IN_PROGRESS") return "info";
  if (status === "SUBMITTED" || status === "REVIEW") return "warning";
  if (status === "HOLD") return "muted";
  return "default";
}
