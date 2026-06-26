import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { canManageClassGroups } from "@/lib/classGroups";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NewClassPage() {
  const user = await requireUser();
  if (!canManageClassGroups(user.role)) redirect("/classes");

  const staff = await prisma.user.findMany({
    where: { academyId: user.academyId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true },
  });
  const teachers = staff.filter((member) => member.role === "ADMIN" || member.role === "MANAGER" || member.role === "TEACHER");
  const assistants = staff.filter((member) => member.role === "ASSISTANT");

  return (
    <main style={page}>
      <section style={card}>
        <div style={topBar}>
          <Link href="/classes" style={backLink}>← 반 목록</Link>
          <span style={badge}>새 반 등록</span>
        </div>
        <header style={header}>
          <div>
            <p style={eyebrow}>반 관리</p>
            <h1 style={title}>반 추가</h1>
            <p style={desc}>수업 기본 정보만 먼저 등록하고, 학생 배정과 통계는 반 상세 화면에서 이어서 관리합니다.</p>
          </div>
        </header>

        <form action="/api/classes/create" method="post" style={form}>
          <label style={label}>
            반 이름
            <input name="name" required placeholder="예: 고1 수학 내신반" style={input} autoFocus />
          </label>

          <label style={label}>
            담당 강사
            {user.role === "TEACHER" ? (
              <>
                <input type="hidden" name="teacherId" value={user.id} />
                <input value={teachers.find((teacher) => teacher.id === user.id)?.name ?? "내 반"} readOnly style={input} />
              </>
            ) : (
              <select name="teacherId" defaultValue="" style={input}>
                <option value="">미지정</option>
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.name}
                  </option>
                ))}
              </select>
            )}
          </label>

          <fieldset style={assistantBox}>
            <legend style={legend}>담당 조교</legend>
            <input type="hidden" name="assistantIds" value="" />
            {assistants.length === 0 ? (
              <span style={muted}>등록된 조교가 없습니다.</span>
            ) : (
              <div style={assistantGrid}>
                {assistants.map((assistant) => (
                  <label key={assistant.id} style={assistantChip}>
                    <input type="checkbox" name="assistantIds" value={assistant.id} />
                    <span>{assistant.name}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <label style={label}>
            과목
            <input name="subject" placeholder="수학" style={input} />
          </label>

          <label style={label}>
            학년
            <input name="grade" placeholder="고1" style={input} />
          </label>

          <label style={label}>
            운영 시작일
            <input name="startDate" type="date" style={input} />
          </label>

          <label style={label}>
            운영 종료일
            <input name="endDate" type="date" style={input} />
          </label>

          <label style={label}>
            수업 요일
            <input name="daysOfWeek" placeholder="월수금" style={input} />
          </label>

          <label style={label}>
            시작 시간
            <input name="startTime" type="time" style={input} />
          </label>

          <label style={label}>
            종료 시간
            <input name="endTime" type="time" style={input} />
          </label>

          <label style={label}>
            강의실
            <input name="room" placeholder="A룸" style={input} />
          </label>

          <label style={label}>
            상태
            <select name="status" defaultValue="ACTIVE" style={input}>
              <option value="UPCOMING">운영 예정</option>
              <option value="ACTIVE">운영중</option>
              <option value="PAUSED">휴강</option>
              <option value="ENDED">종료</option>
            </select>
          </label>

          <label style={{ ...label, gridColumn: "1 / -1" }}>
            설명/메모
            <textarea name="description" rows={5} placeholder="반 운영 메모, 교재, 특이사항 등을 적어둘 수 있습니다." style={{ ...input, height: "auto", resize: "vertical", paddingTop: 12 }} />
          </label>

          <div style={actions}>
            <Link href="/classes" style={cancelButton}>취소</Link>
            <button style={primaryButton}>반 추가</button>
          </div>
        </form>
      </section>
    </main>
  );
}

const page: CSSProperties = { minHeight: "100vh", padding: 12, color: "#111827", background: "#f8fafc" };
const card: CSSProperties = { width: "100%", maxWidth: "none", margin: 0, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 };
const topBar: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10 };
const backLink: CSSProperties = { color: "var(--asc-primary-deep)", fontWeight: 950, textDecoration: "none" };
const badge: CSSProperties = { border: "1px solid var(--asc-primary)", background: "var(--asc-primary-soft)", color: "var(--asc-primary-deep)", borderRadius: 999, padding: "6px 10px", fontSize: 12, fontWeight: 950 };
const header: CSSProperties = { borderBottom: "1px solid #e5e7eb", paddingBottom: 10, marginBottom: 12 };
const eyebrow: CSSProperties = { margin: 0, color: "var(--asc-primary-deep)", fontSize: 12, fontWeight: 950 };
const title: CSSProperties = { margin: "3px 0", fontSize: 23, fontWeight: 950 };
const desc: CSSProperties = { margin: 0, color: "#6b7280", fontWeight: 750, lineHeight: 1.45, fontSize: 13 };
const form: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 };
const label: CSSProperties = { display: "flex", flexDirection: "column", gap: 5, fontWeight: 950, fontSize: 13, color: "#374151" };
const input: CSSProperties = { minWidth: 0, height: 38, border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", padding: "0 10px", fontSize: 14, fontWeight: 800, boxSizing: "border-box" };
const assistantBox: CSSProperties = { gridColumn: "1 / -1", border: "1px solid #d1d5db", borderRadius: 8, background: "#fbfcfe", padding: "9px 10px" };
const legend: CSSProperties = { padding: "0 6px", fontSize: 13, fontWeight: 950, color: "#374151" };
const assistantGrid: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 6 };
const assistantChip: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid #e5e7eb", borderRadius: 999, background: "#fff", padding: "5px 8px", fontSize: 13, fontWeight: 900 };
const muted: CSSProperties = { color: "#6b7280", fontWeight: 800, fontSize: 13 };
const actions: CSSProperties = { gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 2 };
const cancelButton: CSSProperties = { border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", color: "#111827", padding: "9px 13px", fontWeight: 950, textDecoration: "none" };
const primaryButton: CSSProperties = { border: 0, borderRadius: 8, background: "#111827", color: "#fff", padding: "9px 14px", fontWeight: 950, cursor: "pointer" };
