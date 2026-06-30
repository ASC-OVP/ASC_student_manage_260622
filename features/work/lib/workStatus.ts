
export function workStatusLabel(status: string) {
  const labels: Record<string, string> = { SCHEDULED: "Scheduled", WORKED: "Worked", ABSENT: "Absent", CANCELLED: "Cancelled" };
  return labels[status] ?? status;
}

export function workStatusTone(status: string) {
  if (status === "WORKED") return "success";
  if (status === "ABSENT") return "danger";
  if (status === "CANCELLED") return "muted";
  return "default";
}
