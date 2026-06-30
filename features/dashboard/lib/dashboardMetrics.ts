
export function percentMetric(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}
