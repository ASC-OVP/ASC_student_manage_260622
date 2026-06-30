
export function taskPriorityLabel(priority: string) {
  const labels: Record<string, string> = { LOW: "Low", NORMAL: "Normal", HIGH: "High", URGENT: "Urgent" };
  return labels[priority] ?? priority;
}

export function taskPriorityTone(priority: string) {
  if (priority === "URGENT") return "danger";
  if (priority === "HIGH") return "warning";
  if (priority === "LOW") return "muted";
  return "default";
}
