export const memoTypes = ["GENERAL", "STUDY", "ATTENDANCE", "ATTITUDE", "COUNSELING", "HOMEWORK", "CLINIC", "ETC"] as const;

export type MemoTypeValue = (typeof memoTypes)[number] | string;

const MEMO_TYPE_LABELS: Record<string, string> = {
  GENERAL: "일반",
  STUDY: "학습",
  ATTENDANCE: "출결",
  ATTITUDE: "태도",
  COUNSELING: "상담",
  HOMEWORK: "과제",
  CLINIC: "클리닉",
  QUESTION: "질문",
  SCHOOL_SCORE: "학교 성적",
  ETC: "기타",
};

export function memoTypeLabel(type: MemoTypeValue) {
  return MEMO_TYPE_LABELS[String(type)] ?? String(type || "기타");
}
