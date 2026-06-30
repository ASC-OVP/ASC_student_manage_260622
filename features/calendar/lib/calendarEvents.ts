export type CalendarSourceType = "class" | "task";

export function calendarEventKey(type: CalendarSourceType, id: string) {
  return type + ":" + id;
}
