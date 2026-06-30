export const CLASS_STATUS_OPTIONS = ["ACTIVE", "PAUSED", "CLOSED"] as const;

export const CLASS_STATUS_LABELS: Record<(typeof CLASS_STATUS_OPTIONS)[number], string> = {
  ACTIVE: "운영중",
  PAUSED: "일시중지",
  CLOSED: "종료",
};

