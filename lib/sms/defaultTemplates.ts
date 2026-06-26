import type { MessageCategory, MessageTargetType } from "@/lib/sms/types";

export type DefaultMessageTemplate = {
  name: string;
  category: MessageCategory;
  targetType: MessageTargetType;
  body: string;
};

export const defaultOperationalMessageTemplates: DefaultMessageTemplate[] = [
  {
    name: "출결 처리 안내",
    category: "ATTENDANCE",
    targetType: "GUARDIAN",
    body: "[ASC학원]\n{{studentName}} 학생 보호자님, 오늘 {{className}} 수업 출결이 {{attendanceStatus}} 처리되었습니다.",
  },
  {
    name: "과제 미제출 안내",
    category: "ASSIGNMENT",
    targetType: "GUARDIAN",
    body: '[ASC학원]\n{{studentName}} 학생 보호자님, {{className}} 과제 "{{assignmentName}}"가 아직 제출되지 않았습니다. 확인 부탁드립니다.',
  },
  {
    name: "학습 리포트 등록 안내",
    category: "REPORT",
    targetType: "GUARDIAN",
    body: "[ASC학원]\n{{studentName}} 학생의 학습 리포트가 등록되었습니다. ASC 학부모 페이지에서 확인해주세요.",
  },
];
