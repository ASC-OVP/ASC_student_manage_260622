import { canCreateTask, requireUser } from "@/lib/auth";
import { sheetFillPalette } from "@/lib/colorPalettes";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import type { CSSProperties } from "react";
import { createTaskAction } from "../actions";

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
        <section style={card}>
          <Link href="/tasks" style={back}>업무 목록</Link>
          <h1 style={title}>업무 생성</h1>
          <p style={error}>업무를 생성할 권한이 없습니다.</p>
        </section>
      </main>
    );
  }

  return (
    <main style={page}>
      <section style={card}>
        <Link href="/tasks" style={back}>업무 목록</Link>
        <h1 style={title}>업무 생성</h1>
        <p style={desc}>조교 여러 명에게 같은 업무를 배정하고, 기간과 체크리스트를 날짜 기준으로 남깁니다. 완료는 담당자가 직접 처리 기록으로 남깁니다.</p>
        {params.error === "permission" && <p style={error}>업무를 생성할 권한이 없습니다.</p>}
        {params.error === "empty" && <p style={error}>업무명과 담당자를 입력해 주세요.</p>}

        <form action={createTaskAction} style={form}>
          <label style={label}>업무명<input name="title" required style={input} /></label>
          <label style={label}>업무 유형
            <select name="type" defaultValue="OTHER" style={input}>
              {taskTypes.map(([value, labelText]) => <option key={value} value={value}>{labelText}</option>)}
            </select>
          </label>
          <fieldset style={assigneeField}>
            <legend>담당 조교/직원</legend>
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
          <label style={label}>관련 반
            <select name="classGroupId" style={input}>
              <option value="">없음</option>
              {classGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.teacher?.name ? `${group.teacher.name} / ${group.name}` : group.name}
                </option>
              ))}
            </select>
          </label>
          <label style={label}>관련 학생
            <select name="studentId" style={input}>
              <option value="">없음</option>
              {students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
            </select>
          </label>
          <label style={label}>우선순위
            <select name="priority" defaultValue="NORMAL" style={input}>
              <option value="LOW">낮음</option>
              <option value="NORMAL">보통</option>
              <option value="HIGH">높음</option>
              <option value="URGENT">긴급</option>
            </select>
          </label>
          <fieldset style={colorField}>
            <legend style={colorLegend}>업무 색상</legend>
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
          <label style={label}>시작일<input type="date" name="startDate" defaultValue={defaultDate} style={input} /></label>
          <label style={label}>마감일<input type="date" name="dueDate" defaultValue={defaultDate} style={input} /></label>
          <label style={{ ...label, gridColumn: "1 / -1" }}>업무 설명
            <textarea name="description" rows={5} placeholder="업무 배경, 처리 기준, 확인할 내용을 적어주세요." style={{ ...input, resize: "vertical" }} />
          </label>
          <label style={{ ...label, gridColumn: "1 / -1" }}>체크리스트
            <textarea name="checklist" rows={5} placeholder={"한 줄에 하나씩 입력\n예: 대상 학생 확인\n예: 미제출자 메모 작성\n예: 처리 결과 기록"} style={{ ...input, resize: "vertical" }} />
          </label>
          <button style={btn}>업무 저장</button>
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

const page: CSSProperties = { padding: 16, color: "var(--asc-text)", background: "var(--asc-bg-subtle)", minHeight: "100vh" };
const card: CSSProperties = { width: "100%", maxWidth: "none", margin: 0, background: "var(--asc-surface)", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-xl)", padding: 16 };
const back: CSSProperties = { color: "var(--asc-primary-hover)", fontWeight: 900, textDecoration: "none" };
const title: CSSProperties = { fontSize: 25, fontWeight: 950, margin: "10px 0 6px", color: "var(--asc-text)" };
const desc: CSSProperties = { margin: "0 0 18px", color: "var(--asc-text-muted)" };
const form: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 };
const label: CSSProperties = { display: "flex", flexDirection: "column", gap: 8, fontWeight: 900, color: "var(--asc-text-subtle)" };
const input: CSSProperties = { padding: "12px", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", background: "var(--asc-bg)", color: "var(--asc-text)" };
const colorField: CSSProperties = { border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 10, fontWeight: 900 };
const colorLegend: CSSProperties = { padding: "0 4px" };
const colorGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))", gap: 6, marginTop: 4 };
const colorChoice: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto 18px minmax(0, 1fr)",
  alignItems: "center",
  gap: 7,
  border: "1px solid #e5e7eb",
  borderRadius: 7,
  padding: "7px 8px",
  background: "#f9fafb",
  fontSize: 12,
  fontWeight: 850,
};
const assigneeField: CSSProperties = { gridColumn: "1 / -1", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 12, fontWeight: 900 };
const assigneeGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginTop: 8 };
const checkChip: CSSProperties = { display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: 8, border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: "9px 10px", background: "var(--asc-bg-subtle)", fontSize: 13 };
const btn: CSSProperties = { gridColumn: "1 / -1", background: "var(--asc-primary)", color: "#fff", border: "1px solid var(--asc-primary)", borderRadius: "var(--asc-radius-lg)", padding: "12px", fontWeight: 950 };
const error: CSSProperties = { background: "var(--asc-danger-soft)", color: "var(--asc-danger)", padding: 12, borderRadius: "var(--asc-radius-lg)", fontWeight: 900 };

function colorChoiceDot(color: string): CSSProperties {
  return {
    width: 18,
    height: 18,
    borderRadius: 999,
    border: "1px solid #94a3b8",
    background: color,
  };
}
