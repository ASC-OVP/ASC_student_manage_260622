
export function userStatusLabel(isActive: boolean) {
  return isActive ? "Active" : "Inactive";
}

export function userStatusTone(isActive: boolean) {
  return isActive ? "success" : "muted";
}
