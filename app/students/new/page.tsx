import type { CSSProperties } from "react";
import Link from "next/link";
import { createStudent } from "../actions";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const grades = ["중1", "중2", "중3", "고1", "고2", "고3", "N수"];

export default async function NewStudentPage() {
  const user = await requireUser();
  const [staff, classGroups] = await Promise.all([
    prisma.user.findMany({
      where: { academyId: user.academyId, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.classGroup.findMany({
      where: {
        academyId: user.academyId,
        ...(user.role === "TEACHER" ? { teacherId: user.id } : {}),
      },
      include: { teacher: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
  ]);
  const teachers = staff.filter((member) => member.role === "TEACHER" || member.role === "MANAGER" || member.role === "ADMIN");

  return (
    <main style={page}>
      <section style={card}>
        <Link href="/students" style={back}>← 학생 현황판</Link>
        <h1 style={title}>학생 추가</h1>
        <form action={createStudent} style={form}>
          <label style={label}>이름<input name="name" required style={input} /></label>
          <label style={label}>소속 반
            <select name="classGroupId" defaultValue="" style={input}>
              <option value="">미지정</option>
              {classGroups.map((classGroup) => (
                <option key={classGroup.id} value={classGroup.id}>
                  {classGroup.teacher?.name ? `${classGroup.teacher.name} / ${classGroup.name}` : classGroup.name}
                </option>
              ))}
            </select>
          </label>
          <label style={label}>학생 전화<input name="phone" style={input} /></label>
          <label style={label}>보호자 전화<input name="parentPhone" style={input} /></label>
          <label style={label}>학교<input name="schoolName" placeholder="예: 대치고" style={input} /></label>
          <label style={label}>학년
            <select name="grade" defaultValue="고1" style={input}>
              {grades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
            </select>
          </label>
          <label style={label}>과목<input name="subject" placeholder="수학" style={input} /></label>
          <label style={label}>레벨<input name="currentLevel" placeholder="A반" style={input} /></label>
          <label style={label}>상태
            <select name="status" style={input}>
              <option value="ACTIVE">재원</option>
              <option value="WATCH">주의</option>
              <option value="PAUSED">휴원</option>
              <option value="LEFT">퇴원</option>
            </select>
          </label>
          <label style={label}>담당 강사
            <select name="teacherId" defaultValue={user.role === "TEACHER" ? user.id : ""} style={input}>
              <option value="">반 담당 강사 자동 적용</option>
              {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
            </select>
          </label>
          <label style={{ ...label, gridColumn: "1 / -1" }}>기본 메모<textarea name="memo" rows={5} style={{ ...input, resize: "vertical" }} /></label>
          <div style={buttons}>
            <button style={btn}>학생 저장</button>
            <Link href="/students" style={cancel}>취소</Link>
          </div>
        </form>
      </section>
    </main>
  );
}

const page: CSSProperties = { padding: 16, color: "#111827" };
const card: CSSProperties = { width: "100%", maxWidth: "none", margin: 0, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, boxShadow: "0 8px 24px rgba(15,23,42,.06)" };
const back: CSSProperties = { color: "#2563eb", fontWeight: 900, textDecoration: "none" };
const title: CSSProperties = { fontSize: 25, fontWeight: 950 };
const form: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 };
const label: CSSProperties = { display: "flex", flexDirection: "column", gap: 8, fontWeight: 900 };
const input: CSSProperties = { padding: "12px", border: "1px solid #d1d5db", borderRadius: 10, background: "#fff" };
const buttons: CSSProperties = { gridColumn: "1 / -1", display: "flex", gap: 10 };
const btn: CSSProperties = { padding: "12px 18px", border: 0, borderRadius: 10, background: "#111827", color: "#fff", fontWeight: 950 };
const cancel: CSSProperties = { padding: "12px 18px", border: "1px solid #d1d5db", borderRadius: 10, textDecoration: "none", fontWeight: 950 };
