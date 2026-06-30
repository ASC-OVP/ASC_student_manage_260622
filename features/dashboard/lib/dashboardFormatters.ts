
export function clipDashboardText(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength - 1) + "..." : value;
}
