
export function operationStatusTone(status: string) {
  if (status === "DANGER") return "danger";
  if (status === "WARN") return "warn";
  return "default";
}
