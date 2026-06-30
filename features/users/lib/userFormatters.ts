
export function userLoginLabel(user: { name: string; loginId: string }) {
  return user.name + " (" + user.loginId + ")";
}
