import Link from "next/link";
import type { CSSProperties } from "react";
import MessageAutomationPanel from "@/components/messages/MessageAutomationPanel";
import MessageComposer from "@/components/messages/MessageComposer";
import MessageLogTable, { type MessageLogRow } from "@/components/messages/MessageLogTable";
import MessageSettingsPanel from "@/components/messages/MessageSettingsPanel";
import MessageTemplateManager from "@/components/messages/MessageTemplateManager";
import { requireUser } from "@/lib/auth";
import { classGroupWhereForUser } from "@/lib/classGroups";
import type { Prisma } from "@/lib/generated/prisma";
import { prisma } from "@/lib/prisma";
import { studentWhereForUser } from "@/lib/scopes";
import { ensureDefaultMessageTemplates } from "@/lib/sms/ensureDefaultTemplates";
import { getSmsProviderStatus } from "@/lib/sms/provider";

type Props = {
  searchParams?: Promise<{
    tab?: string;
    category?: string;
    dateFrom?: string;
    dateTo?: string;
    status?: string;
    templateId?: string;
    query?: string;
    failedOnly?: string;
    jobId?: string;
    error?: string;
  }>;
};

const tabs = [
  { id: "compose", label: "문자 작성" },
  { id: "templates", label: "템플릿" },
  { id: "logs", label: "발송 기록" },
  { id: "settings", label: "설정" },
  { id: "automation", label: "자동화 규칙" },
] as const;

export const dynamic = "force-dynamic";

export default async function MessagesPage({ searchParams }: Props) {
  const user = await requireUser();
  await ensureDefaultMessageTemplates(user.academyId, user.id);
  const params = (await searchParams) ?? {};
  const activeTab = tabValue(params.tab);
  const settings = getSmsProviderStatus();
  const canCompose = user.role === "ADMIN" || user.role === "MANAGER" || user.role === "TEACHER";
  const canSendActual = user.role === "ADMIN" || user.role === "MANAGER";

  const [classGroups, students, templates, logs] = await Promise.all([
    prisma.classGroup.findMany({
      where: classGroupWhereForUser(user),
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.student.findMany({
      where: studentWhereForUser(user),
      orderBy: [{ name: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        phone: true,
        parentPhone: true,
        studentClasses: {
          where: { status: "ACTIVE" },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
          select: { classGroup: { select: { id: true, name: true } } },
        },
      },
    }),
    prisma.messageTemplate.findMany({
      where: { academyId: user.academyId },
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        name: true,
        category: true,
        targetType: true,
        body: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.messageRecipient.findMany({
      where: messageLogWhere(user.academyId, params),
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        recipientType: true,
        receiverName: true,
        phone: true,
        normalizedPhone: true,
        messageText: true,
        status: true,
        providerMessageId: true,
        errorMessage: true,
        retried: true,
        sentAt: true,
        createdAt: true,
        student: { select: { name: true } },
        job: {
          select: {
            id: true,
            title: true,
            targetType: true,
            status: true,
            dryRun: true,
            createdAt: true,
            createdBy: { select: { name: true } },
            template: { select: { id: true, name: true } },
          },
        },
      },
    }),
  ]);

  const studentOptions = students.map((student) => ({
    id: student.id,
    name: student.name,
    phone: student.phone ?? "",
    parentPhone: student.parentPhone ?? "",
    classGroupIds: student.studentClasses.map((membership) => membership.classGroup.id),
    classGroupNames: student.studentClasses.map((membership) => membership.classGroup.name),
  }));

  return (
    <main style={page}>
      <section style={container}>
        <header style={header}>
          <div>
            <h1 style={title}>문자 발송</h1>
            <p style={desc}>학생과 보호자에게 출결, 과제, 시험, 리포트 등 운영 알림 문자를 발송합니다.</p>
          </div>
          <span style={settings.dryRun ? dryRunBadge : statusBadge}>{settings.dryRun ? "dry-run" : settings.canSendActual ? "실제 발송 가능" : "발송 차단"}</span>
        </header>

        {params.error && <div style={errorBox}>{errorMessage(params.error)}</div>}

        <nav style={tabBar}>
          {tabs.map((tab) => (
            <Link key={tab.id} href={`/messages?tab=${tab.id}`} style={tabLink(activeTab === tab.id)}>
              {tab.label}
            </Link>
          ))}
        </nav>

        <section style={contentPanel}>
          {activeTab === "compose" && (
            <MessageComposer
              academyName={user.academy.name}
              classGroups={classGroups}
              students={studentOptions}
              templates={templates}
              settings={settings}
              canCompose={canCompose}
              canSendActual={canSendActual}
            />
          )}

          {activeTab === "templates" && (
            <MessageTemplateManager
              templates={templates}
              selectedCategory={params.category}
              canManage={canCompose}
              academyName={user.academy.name}
            />
          )}

          {activeTab === "logs" && (
            <MessageLogTable
              logs={logs as MessageLogRow[]}
              templates={templates.map((template) => ({ id: template.id, name: template.name }))}
              filters={{
                dateFrom: params.dateFrom,
                dateTo: params.dateTo,
                status: params.status,
                templateId: params.templateId,
                query: params.query,
                failedOnly: params.failedOnly === "on",
                jobId: params.jobId,
              }}
            />
          )}

          {activeTab === "settings" && <MessageSettingsPanel settings={settings} />}
          {activeTab === "automation" && <MessageAutomationPanel />}
        </section>
      </section>
    </main>
  );
}

function tabValue(value?: string) {
  return tabs.some((tab) => tab.id === value) ? (value as (typeof tabs)[number]["id"]) : "compose";
}

function messageLogWhere(academyId: string, params: Awaited<NonNullable<Props["searchParams"]>>): Prisma.MessageRecipientWhereInput {
  const and: Prisma.MessageRecipientWhereInput[] = [{ job: { academyId } }];

  if (params.status && params.status !== "ALL") and.push({ status: params.status });
  if (params.failedOnly === "on") and.push({ status: "FAILED" });
  if (params.templateId && params.templateId !== "all") and.push({ job: { templateId: params.templateId, academyId } });
  if (isDate(params.dateFrom)) and.push({ createdAt: { gte: new Date(`${params.dateFrom}T00:00:00`) } });
  if (isDate(params.dateTo)) and.push({ createdAt: { lte: new Date(`${params.dateTo}T23:59:59`) } });
  if (params.query) {
    const query = params.query.trim();
    and.push({
      OR: [
        { phone: { contains: query } },
        { normalizedPhone: { contains: query.replace(/\D/g, "") || query } },
        { receiverName: { contains: query } },
        { student: { name: { contains: query } } },
      ],
    });
  }

  return { AND: and };
}

function isDate(value?: string) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function errorMessage(error: string) {
  if (error === "permission") return "문자 작성 권한이 없습니다.";
  if (error === "send-permission") return "실제 발송은 관리자 또는 매니저만 가능합니다.";
  if (error === "provider-disabled") return "SMS provider 설정 또는 dry-run 상태 때문에 실제 발송이 차단되었습니다.";
  if (error === "empty") return "학생과 메시지 내용을 확인해주세요.";
  if (error === "no-students") return "선택한 학생을 찾을 수 없습니다.";
  if (error === "no-recipients") return "발송 가능한 전화번호가 없습니다.";
  if (error === "template-empty") return "템플릿명과 본문을 입력해주세요.";
  return "요청을 처리하지 못했습니다.";
}

function tabLink(active: boolean): CSSProperties {
  return {
    height: 34,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: active ? "1px solid var(--asc-primary)" : "1px solid var(--asc-border)",
    borderRadius: 8,
    background: active ? "var(--asc-primary)" : "#fff",
    color: active ? "#fff" : "var(--asc-text)",
    padding: "0 11px",
    textDecoration: "none",
    fontWeight: 950,
  };
}

const page: CSSProperties = { minHeight: "100vh", background: "var(--asc-bg-subtle)", color: "var(--asc-text)", padding: 12 };
const container: CSSProperties = { width: "100%", maxWidth: "none", margin: 0, display: "grid", gap: 10 };
const header: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 };
const title: CSSProperties = { margin: "0 0 4px", fontSize: 24, fontWeight: 950 };
const desc: CSSProperties = { margin: 0, color: "var(--asc-text-muted)", fontSize: 13 };
const dryRunBadge: CSSProperties = { border: "1px solid #93c5fd", borderRadius: 999, background: "var(--asc-info-soft)", color: "var(--asc-info)", padding: "6px 9px", fontWeight: 950, whiteSpace: "nowrap" };
const statusBadge: CSSProperties = { ...dryRunBadge, borderColor: "#86efac", background: "var(--asc-success-soft)", color: "var(--asc-success)" };
const tabBar: CSSProperties = { display: "flex", gap: 6, flexWrap: "wrap" };
const contentPanel: CSSProperties = { border: "1px solid var(--asc-border)", borderRadius: 8, background: "#fff", padding: 10 };
const errorBox: CSSProperties = { border: "1px solid #fecaca", borderRadius: 8, background: "var(--asc-danger-soft)", color: "var(--asc-danger)", padding: 10, fontWeight: 950 };
