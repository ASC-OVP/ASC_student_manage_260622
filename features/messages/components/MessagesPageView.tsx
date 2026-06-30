import type { CSSProperties } from "react";
import { Badge, Notice, PageHeader, Tabs } from "@/components/ui";
import MessageAutomationPanel from "@/features/messages/components/MessageAutomationPanel";
import MessageComposer from "@/features/messages/components/MessageComposer";
import MessageLogTable, { type MessageLogRow } from "@/features/messages/components/MessageLogTable";
import MessageSettingsPanel from "@/features/messages/components/MessageSettingsPanel";
import MessageTemplateManager from "@/features/messages/components/MessageTemplateManager";
import { requireUser } from "@/lib/auth";
import { classGroupWhereForUser } from "@/lib/classGroups";
import type { Prisma } from "@/lib/generated/prisma";
import { prisma } from "@/lib/prisma";
import { studentWhereForUser } from "@/lib/scopes";
import { ensureDefaultMessageTemplates } from "@/lib/sms/ensureDefaultTemplates";
import { getSmsProviderStatusForAcademy } from "@/lib/sms/provider";

type Props = { searchParams?: Promise<{ tab?: string; category?: string; dateFrom?: string; dateTo?: string; status?: string; templateId?: string; query?: string; failedOnly?: string; jobId?: string; error?: string; settingsStatus?: string }> };
const tabs = [
  { id: "compose", label: "문자 작성" },
  { id: "templates", label: "템플릿" },
  { id: "logs", label: "발송 기록" },
  { id: "settings", label: "문자 발송 설정" },
  { id: "automation", label: "자동화 규칙" },
] as const;

export const dynamic = "force-dynamic";

export default async function MessagesPage({ searchParams }: Props) {
  const user = await requireUser();
  await ensureDefaultMessageTemplates(user.academyId, user.id);
  const params = (await searchParams) ?? {};
  const activeTab = tabValue(params.tab);
  const settings = await getSmsProviderStatusForAcademy(user.academyId);
  const canCompose = user.role === "ADMIN" || user.role === "MANAGER" || user.role === "TEACHER";
  const canSendActual = user.role === "ADMIN" || user.role === "MANAGER";

  const [classGroups, students, templates, logs, exams] = await Promise.all([
    prisma.classGroup.findMany({ where: classGroupWhereForUser(user), orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.student.findMany({
      where: studentWhereForUser(user),
      orderBy: [{ name: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, phone: true, parentPhone: true, schoolName: true, grade: true, currentLevel: true, studentClasses: { where: { status: "ACTIVE" }, orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }], select: { classGroup: { select: { id: true, name: true } } } } },
    }),
    prisma.messageTemplate.findMany({ where: { academyId: user.academyId }, orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }], select: { id: true, name: true, category: true, targetType: true, title: true, body: true, isMarketing: true, isActive: true, createdAt: true, updatedAt: true } }),
    prisma.messageRecipient.findMany({
      where: messageLogWhere(user.academyId, params),
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, recipientType: true, receiverName: true, phone: true, normalizedPhone: true, messageText: true, status: true, providerMessageId: true, errorMessage: true, retried: true, sentAt: true, createdAt: true, student: { select: { name: true } }, job: { select: { id: true, title: true, targetType: true, status: true, dryRun: true, createdAt: true, createdBy: { select: { name: true } }, template: { select: { id: true, name: true } } } } },
    }),
    prisma.exam.findMany({
      where: { academyId: user.academyId },
      orderBy: [{ examDate: "desc" }, { createdAt: "desc" }],
      take: 80,
      select: { id: true, title: true, examDate: true, subject: true, classGroupId: true, totalScore: true, results: { select: { studentId: true, totalScore: true, maxScore: true, correctCount: true, wrongCount: true, blankCount: true, reviewNeededCount: true } } },
    }),
  ]);

  const studentOptions = students.map((student) => ({ id: student.id, name: student.name, phone: student.phone ?? "", parentPhone: student.parentPhone ?? "", schoolName: student.schoolName ?? "", grade: student.grade ?? "", currentLevel: student.currentLevel ?? "", classGroupIds: student.studentClasses.map((membership) => membership.classGroup.id), classGroupNames: student.studentClasses.map((membership) => membership.classGroup.name) }));
  const examOptions = exams.map((exam) => ({ id: exam.id, title: exam.title, examDate: exam.examDate ?? "", subject: exam.subject ?? "", classGroupId: exam.classGroupId, totalScore: exam.totalScore, results: exam.results }));

  return (
    <main style={page}>
      <section style={container}>
        <PageHeader eyebrow="메시지" title="문자 발송" description="학생과 학부모에게 운영 문자와 광고성 문자를 검증 후 안전하게 발송합니다." actions={<Badge tone={settings.dryRun ? "blue" : settings.canSendActual ? "green" : "red"}>{settings.dryRun ? "테스트 모드" : settings.canSendActual ? "실제 발송 가능" : "발송 차단"}</Badge>} />
        {params.error && <Notice tone="danger" title="문자 발송 오류">{errorMessage(params.error)}</Notice>}
        <Tabs label="문자 발송 메뉴" items={tabs.map((tab) => ({ label: tab.label, href: `/messages?tab=${tab.id}`, active: activeTab === tab.id }))} />
        <section style={contentPanel}>
          {activeTab === "compose" && <MessageComposer academyName={user.academy.name} classGroups={classGroups} students={studentOptions} exams={examOptions} templates={templates} settings={settings} canCompose={canCompose} canSendActual={canSendActual} />}
          {activeTab === "templates" && <MessageTemplateManager templates={templates} selectedCategory={params.category} canManage={canCompose} academyName={user.academy.name} />}
          {activeTab === "logs" && <MessageLogTable logs={logs as MessageLogRow[]} templates={templates.map((template) => ({ id: template.id, name: template.name }))} filters={{ dateFrom: params.dateFrom, dateTo: params.dateTo, status: params.status, templateId: params.templateId, query: params.query, failedOnly: params.failedOnly === "on", jobId: params.jobId }} />}
          {activeTab === "settings" && <MessageSettingsPanel settings={settings} canManage={canSendActual} settingsStatus={params.settingsStatus} />}
          {activeTab === "automation" && <MessageAutomationPanel />}
        </section>
      </section>
    </main>
  );
}

function tabValue(value?: string) { return tabs.some((tab) => tab.id === value) ? (value as (typeof tabs)[number]["id"]) : "compose"; }
function messageLogWhere(academyId: string, params: Awaited<NonNullable<Props["searchParams"]>>): Prisma.MessageRecipientWhereInput {
  const and: Prisma.MessageRecipientWhereInput[] = [{ job: { academyId } }];
  if (params.status && params.status !== "ALL") and.push({ status: params.status });
  if (params.failedOnly === "on") and.push({ status: "FAILED" });
  if (params.templateId && params.templateId !== "all") and.push({ job: { templateId: params.templateId, academyId } });
  if (isDate(params.dateFrom)) and.push({ createdAt: { gte: new Date(`${params.dateFrom}T00:00:00`) } });
  if (isDate(params.dateTo)) and.push({ createdAt: { lte: new Date(`${params.dateTo}T23:59:59`) } });
  if (params.query) { const query = params.query.trim(); and.push({ OR: [{ phone: { contains: query } }, { normalizedPhone: { contains: query.replace(/\D/g, "") || query } }, { receiverName: { contains: query } }, { student: { name: { contains: query } } }] }); }
  return { AND: and };
}
function isDate(value?: string) { return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value)); }
function errorMessage(error: string) {
  if (error === "permission") return "문자 작성 권한이 없습니다.";
  if (error === "send-permission") return "실제 발송은 ADMIN 또는 MANAGER만 가능합니다.";
  if (error === "provider-disabled") return "쏘다 API 설정 또는 연결 상태 때문에 실제 발송이 차단되었습니다.";
  if (error === "empty") return "학생과 메시지 내용을 확인해주세요.";
  if (error === "no-students") return "선택한 학생을 찾을 수 없습니다.";
  if (error === "no-recipients") return "발송 가능한 전화번호가 없습니다.";
  if (error === "template-empty") return "템플릿명과 본문을 입력해주세요.";
  if (error === "unknown-variables") return "허용되지 않은 템플릿 변수가 있습니다.";
  if (error === "missing-variables") return "일부 대상자에게 값이 없는 변수가 있어 발송을 중단했습니다.";
  if (error === "exam-required") return "시험 관련 변수를 사용하려면 시험을 선택해야 합니다.";
  if (error === "marketing-unsub") return "광고 문자는 무료 수신거부 번호가 필요합니다.";
  if (error === "settings-permission") return "문자 발송 설정은 ADMIN 또는 MANAGER만 변경할 수 있습니다.";
  return "요청을 처리하지 못했습니다.";
}
const page: CSSProperties = { minHeight: "100vh", background: "var(--asc-bg-subtle)", color: "var(--asc-text)", padding: 12 };
const container: CSSProperties = { width: "100%", maxWidth: "none", margin: 0, display: "grid", gap: 10 };
const contentPanel: CSSProperties = { border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", background: "var(--asc-surface)", padding: 10 };
