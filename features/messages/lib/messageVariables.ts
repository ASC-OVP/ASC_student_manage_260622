
export const messageVariableNames = ["academyName", "studentName", "className", "today"] as const;

export function listMessageVariables() {
  return [...messageVariableNames];
}
