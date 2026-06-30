
export function userRoleLabel(role: string) {
  const labels: Record<string, string> = { ADMIN: "Admin", MANAGER: "Manager", TEACHER: "Teacher", ASSISTANT: "Assistant" };
  return labels[role] ?? role;
}
