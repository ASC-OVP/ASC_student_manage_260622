export const messageCategories = [
  { value: "ATTENDANCE", label: "출결" },
  { value: "ASSIGNMENT", label: "과제" },
  { value: "EXAM", label: "시험" },
  { value: "REPORT", label: "리포트" },
  { value: "CLINIC", label: "보강/클리닉" },
  { value: "ADMIN", label: "수납/행정" },
  { value: "ETC", label: "기타" },
] as const;

export const messageTargetTypes = [
  { value: "STUDENT", label: "학생" },
  { value: "GUARDIAN", label: "보호자" },
  { value: "BOTH", label: "학생 + 보호자" },
] as const;

export type MessageCategory = (typeof messageCategories)[number]["value"];
export type MessageTargetType = (typeof messageTargetTypes)[number]["value"];
export type MessageRecipientType = "STUDENT" | "GUARDIAN";
export type MessageJobStatus = "PENDING" | "SENDING" | "SUCCESS" | "PARTIAL_FAILED" | "FAILED" | "DRY_RUN";
export type MessageRecipientStatus = "PENDING" | "SENDING" | "SUCCESS" | "FAILED" | "DRY_RUN" | "SKIPPED";
export type SmsProviderName = "dry-run" | "solapi";

export type SmsProviderStatus = {
  provider: SmsProviderName;
  dryRun: boolean;
  senderNumber: string | null;
  hasSenderNumber: boolean;
  hasApiKey: boolean;
  hasApiSecret: boolean;
  canSendActual: boolean;
  marketingDisabled: true;
  reason: string | null;
};

export type SmsRecipientPayload = {
  localId: string;
  recipientType: MessageRecipientType;
  receiverName: string;
  phone: string;
  normalizedPhone: string;
  messageText: string;
  studentId?: string | null;
  studentName?: string;
};

export type SmsSendResult = {
  localId: string;
  status: Exclude<MessageRecipientStatus, "PENDING" | "SENDING" | "SKIPPED">;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  responsePayload?: unknown;
};

export type SmsProvider = {
  name: SmsProviderName;
  sendMessage(message: SmsRecipientPayload): Promise<SmsSendResult>;
  sendBulkMessages(messages: SmsRecipientPayload[]): Promise<SmsSendResult[]>;
  getProviderStatus(): SmsProviderStatus;
};

export type TemplateContext = {
  studentName?: string;
  className?: string;
  lessonDate?: string;
  attendanceStatus?: string;
  assignmentName?: string;
  examName?: string;
  reportName?: string;
  academyName?: string;
  academyPhone?: string;
};
