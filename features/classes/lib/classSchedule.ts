
export function compactClassSchedule(daysOfWeek: string | null, startTime: string | null, endTime: string | null) {
  return [daysOfWeek, [startTime, endTime].filter(Boolean).join("-")].filter(Boolean).join(" ");
}

export function lessonSortValue(lesson: { lessonDate: string | null; position: number }) {
  const padded = String(lesson.position).padStart(3, "0");
  return lesson.lessonDate ? lesson.lessonDate + "-" + padded : "9999-" + padded;
}
