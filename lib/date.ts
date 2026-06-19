export function todayKoreaDate() {
  const now = new Date();
  const korea = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return korea.toISOString().slice(0, 10);
}
