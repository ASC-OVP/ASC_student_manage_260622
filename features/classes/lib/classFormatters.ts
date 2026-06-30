
export function formatClassLessonTime(lesson: { lessonDate: string | null; startTime: string | null; endTime: string | null }) {
  const time = [lesson.startTime, lesson.endTime].filter(Boolean).join("-");
  return [lesson.lessonDate, time].filter(Boolean).join(" ") || "-";
}

export function assistantNames(classGroup: { assistant?: { name: string } | null; classAssistants?: Array<{ assistant: { name: string } }> }) {
  return [classGroup.assistant?.name, ...(classGroup.classAssistants?.map((item) => item.assistant.name) ?? [])].filter(Boolean).join(", ");
}
