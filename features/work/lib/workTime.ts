
export function minutesFromTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  return hour * 60 + minute;
}

export function shiftMinutes(shift: { startTime: string; endTime: string; breakMinutes: number; status: string }) {
  if (shift.status !== "WORKED") return 0;
  return Math.max(0, minutesFromTime(shift.endTime) - minutesFromTime(shift.startTime) - shift.breakMinutes);
}
