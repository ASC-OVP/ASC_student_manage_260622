import { canCreateTask, requireUser } from "@/lib/auth";
import { sheetFillPalette } from "@/lib/colorPalettes";
import { prisma } from "@/lib/prisma";
import type { CSSProperties } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { createTaskAction } from "@/features/tasks/actions/taskActions";

type Props = { searchParams: Promise<{ error?: string; date?: string }> };

const taskTypes = [
  ["ATTENDANCE_CHECK", "출결 확인"],
  ["ASSIGNMENT_CHECK", "과제 검사"],
  ["SCORE_INPUT", "성적 입력"],
  ["WRONG_ANSWER", "오답 정리"],
  ["COUNSELING_PREP", "상담 준비"],
  ["PARENT_CONTACT", "보호자 연락"],
  ["MATERIAL_UPLOAD", "자료 업로드"],
  ["CLINIC_ASSIGN", "클리닉 준비"],
  ["OMR_GRADING", "OMR 업로드/채점"],
  ["STUDENT_CARE", "학생 관리"],
  ["OTHER", "기타"],
] as const;

export default async function SimpleNewTaskPage({ searchParams }: Props) {
  const user = await requireUser();
  const params = await searchParams;
  const canCreate = canCreateTask(user.role);
  const defaultDate = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") ? params.date : "";

  const [staff, students, classGroups] = await Promise.all([
    prisma.user.findMany({ where: { academyId: user.academyId, isActive: true }, orderBy: { name: "asc" } }),
    prisma.student.findMany({ where: { academyId: user.academyId }, orderBy: { name: "asc" } }),
    prisma.classGroup.findMany({
      where: {
        academyId: user.academyId,
        ...(user.role === "TEACHER" ? { teacherId: user.id } : {}),
      },
      include: { teacher: { select: { name: true } } },
      orderBy: [{ teacher: { name: "asc" } }, { name: "asc" }],
    }),
  ]);

  const assignees = staff.filter((member) => member.role === "ASSISTANT" || member.role === "TEACHER" || member.role === "MANAGER");

  if (!canCreate) {
    return (
      <main style={page}>
        <section style={card} className="asc-panel">
          <PageHeader
            eyebrow="업무 관리"
            title="업무 생성"
            description="권한이 있는 계정만 업무를 생성할 수 있습니다."
            actions={<ButtonLink href="/tasks" variant="secondary" size="sm">업무 목록</ButtonLink>}
          />
          <Notice tone="danger" title="권한 없음">업무를 생성할 권한이 없습니다.</Notice>
        </section>
      </main>
    );
  }

  return (
    <main style={page}>
      <section style={card} className="asc-panel">
        <PageHeader
          eyebrow="업무 관리"
          title="업무 생성"
          description="조교 여러 명에게 같은 업무를 배정하고, 기간과 체크리스트를 날짜 기준으로 남깁니다."
          actions={<ButtonLink href="/tasks" variant="secondary" size="sm">업무 목록</ButtonLink>}
        />
        {params.error === "permission" && <Notice tone="danger" title="권한 없음">업무를 생성할 권한이 없습니다.</Notice>}
        {params.error === "empty" && <Notice tone="warning" title="입력 필요">업무명과 담당자를 입력해 주세요.</Notice>}

        <form action={createTaskAction} className="asc-form-grid" style={form}>
          <Input label="업무명" name="title" required />
          <Select label="업무 유형" name="type" defaultValue="OTHER">
            {taskTypes.map(([value, labelText]) => <option key={value} value={value}>{labelText}</option>)}
          </Select>
          <fieldset style={assigneeField} className="asc-field asc-field--full">
            <legend style={legend}>담당 조교/직원</legend>
            <div style={assigneeGrid}>
              {assignees.map((member) => (
                <label key={member.id} style={checkChip}>
                  <input name="assigneeIds" type="checkbox" value={member.id} />
                  <span>{member.name}</span>
                  <small>{roleText(member.role)}</small>
                </label>
              ))}
            </div>
          </fieldset>
          <Select label="관련 반" name="classGroupId" defaultValue="">
            <option value="">없음</option>
            {classGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.teacher?.name ? `${group.teacher.name} / ${group.name}` : group.name}
              </option>
            ))}
          </Select>
          <Select label="관련 학생" name="studentId" defaultValue="">
            <option value="">없음</option>
            {students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
          </Select>
          <Select label="우선순위" name="priority" defaultValue="NORMAL">
            <option value="LOW">낮음</option>
            <option value="NORMAL">보통</option>
            <option value="HIGH">높음</option>
            <option value="URGENT">긴급</option>
          </Select>
          <fieldset style={colorField} className="asc-field asc-field--full">
            <legend style={legend}>업무 색상</legend>
            <div style={colorGrid}>
              {sheetFillPalette.map((color) => (
                <label key={color.value} style={colorChoice} title={color.label}>
                  <input name="color" type="radio" value={color.value} defaultChecked={color.value === "#3d85c6"} />
                  <span style={colorChoiceDot(color.value)} />
                  <span>{color.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Input label="시작일" type="date" name="startDate" defaultValue={defaultDate} />
          <Input label="마감일" type="date" name="dueDate" defaultValue={defaultDate} />
          <Textarea label="업무 설명" name="description" rows={5} placeholder="업무 배경, 처리 기준, 확인할 내용을 적어주세요." containerClassName="asc-field--full" />
          <Textarea label="체크리스트" name="checklist" rows={5} placeholder={"한 줄에 하나씩 입력\n예: 대상 학생 확인\n예: 미제출자 메모 작성\n예: 처리 결과 기록"} containerClassName="asc-field--full" />
          <div style={actions} className="asc-form-actions">
            <ButtonLink href="/tasks" variant="secondary">취소</ButtonLink>
            <Button type="submit">업무 저장</Button>
          </div>
        </form>
      </section>
    </main>
  );
}

function roleText(role: string) {
  if (role === "ADMIN") return "관리자";
  if (role === "MANAGER") return "실장";
  if (role === "TEACHER") return "강사";
  if (role === "ASSISTANT") return "조교";
  return role;
}

const page: CSSProperties = { padding: 12, color: "var(--asc-text)", background: "var(--asc-bg-subtle)", minHeight: "100vh" };
const card: CSSProperties = { width: "100%", maxWidth: "none", margin: 0 };
const form: CSSProperties = { marginTop: 14 };
const colorField: CSSProperties = { border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-md)", padding: 12, background: "var(--asc-bg-subtle)" };
const legend: CSSProperties = { padding: "0 6px", fontSize: 13, fontWeight: 800, color: "var(--asc-text)" };
const colorGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))", gap: 6, marginTop: 4 };
const colorChoice: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto 18px minmax(0, 1fr)",
  alignItems: "center",
  gap: 7,
  border: "1px solid var(--asc-border)",
  borderRadius: "var(--asc-radius-sm)",
  padding: "7px 8px",
  background: "var(--asc-surface)",
  fontSize: 12,
  fontWeight: 800,
};
const assigneeField: CSSProperties = { border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-md)", padding: 12, background: "var(--asc-bg-subtle)" };
const assigneeGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginTop: 8 };
const checkChip: CSSProperties = { display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: 8, border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-md)", padding: "9px 10px", background: "var(--asc-surface)", fontSize: 13 };
const actions: CSSProperties = { gridColumn: "1 / -1" };

function colorChoiceDot(color: string): CSSProperties {
  return {
    width: 18,
    height: 18,
    borderRadius: 999,
    border: "1px solid var(--asc-border-strong)",
    background: color,
  };
}