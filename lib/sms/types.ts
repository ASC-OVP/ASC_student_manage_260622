export const messageCategories = [
  { value: "ATTENDANCE", label: "출결" },
  { value: "ASSIGNMENT", label: "과제" },
  { value: "EXAM", label: "시험" },
  { value: "REPORT", label: "리포트" },
  { value: "CLINIC", label: "보강/클리닉" },
  { value: "ADMIN", label: "운영/행정" },
  { value: "MARKETING", label: "광고/홍보" },
  { value: "ETC", label: "기타" },
] as const;

export const messageTargetTypes = [
  { value: "STUDENT", label: "학생" },
  { value: "GUARDIAN", label: "학부모" },
  { value: "BOTH", label: "학생 + 학부모" },
] as const;

export type MessageCategory = (typeof messageCategories)[number]["value"];
export type MessageTargetType = (typeof messageTargetTypes)[number]["value"];
export type MessageRecipientType = "STUDENT" | "GUARDIAN";
export type MessageJobStatus = "PENDING" | "SENDING" | "SENT" | "SUCCESS" | "PARTIAL_FAILED" | "FAILED" | "CANCELED" | "DRY_RUN";
export type MessageRecipientStatus = "PENDING" | "SENDING" | "SENT" | "SUCCESS" | "FAILED" | "DRY_RUN" | "SKIPPED" | "BLOCKED";
export type SmsProviderName = "dry-run" | "solapi" | "ssodaa";

export type SmsProviderStatus = {
  provider: SmsProviderName;
  dryRun: boolean;
  senderNumber: string | null;
  hasSenderNumber: boolean;
  hasApiKey: boolean;
  hasApiSecret: boolean;
  canSendActual: boolean;
  marketingDisabled: boolean;
  reason: string | null;
  connectionStatus?: "CONNECTED" | "NEEDS_CHECK" | "FAILED" | null;
  connectionMessage?: string | null;
  checkedAt?: string | null;
  maskedApiKey?: string | null;
  maskedTokenKey?: string | null;
  unsubPhone?: string | null;
  senderName?: string | null;
  testReceiverPhone?: string | null;
  isMarketingDefault?: boolean;
  source?: "database" | "environment" | "none";
  remainingAmount?: number | null;
};

export type SmsRecipientPayload = {
  localId: string;
  recipientType: MessageRecipientType;
  receiverName: string;
  phone: string;
  normalizedPhone: string;
  messageText: string;
  templateData?: Record<string, string>;
  missingVariables?: string[];
  messageKind?: "SMS" | "LMS";
  byteLength?: number;
  subject?: string;
  isMarketing?: boolean;
  unsubPhone?: string | null;
  studentId?: string | null;
  studentName?: string;
};

export type SmsSendResult = {
  localId: string;
  status: Exclude<MessageRecipientStatus, "PENDING" | "SENDING" | "SKIPPED" | "BLOCKED">;
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

export type TemplateContext = Record<string, string | number | null | undefined> & {
  studentName?: string;
  parentName?: string;
  parentNameSubject?: string;
  parentNameTopic?: string;
  className?: string;
  lessonName?: string;
  lessonRound?: string;
  lessonDate?: string;
  attendanceStatus?: string;
  assignmentName?: string;
  examName?: string;
  examDate?: string;
  score?: string | number | null;
  maxScore?: string | number | null;
  averageScore?: string | number | null;
  rank?: string | number | null;
  level?: string;
  correctCount?: string | number | null;
  wrongCount?: string | number | null;
  blankCount?: string | number | null;
  weakType?: string;
  wrongQuestions?: string;
  remedialReason?: string;
  feedback?: string;
  reportLink?: string;
  reportName?: string;
  highestScore?: string | number | null;
  academyName?: string;
  academyPhone?: string;
};
