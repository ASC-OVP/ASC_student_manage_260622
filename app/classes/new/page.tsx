import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { createClassGroupAction } from "@/app/classes/actions";
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

        <form action={createClassGroupAction} style={form}>
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

const page: CSSProperties = { minHeight: "100vh", padding: 16, color: "#111827", background: "#f8fafc" };
const card: CSSProperties = { width: "100%", maxWidth: "none", margin: 0, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, boxShadow: "0 12px 30px rgba(15,23,42,.07)" };
const topBar: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16 };
const backLink: CSSProperties = { color: "#2563eb", fontWeight: 950, textDecoration: "none" };
const badge: CSSProperties = { border: "1px solid #dbeafe", background: "#eff6ff", color: "#1d4ed8", borderRadius: 999, padding: "6px 10px", fontSize: 12, fontWeight: 950 };
const header: CSSProperties = { borderBottom: "1px solid #e5e7eb", paddingBottom: 16, marginBottom: 18 };
const eyebrow: CSSProperties = { margin: 0, color: "#2563eb", fontSize: 12, fontWeight: 950 };
const title: CSSProperties = { margin: "4px 0", fontSize: 25, fontWeight: 950 };
const desc: CSSProperties = { margin: 0, color: "#6b7280", fontWeight: 750, lineHeight: 1.5 };
const form: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 };
const label: CSSProperties = { display: "flex", flexDirection: "column", gap: 7, fontWeight: 950, fontSize: 13, color: "#374151" };
const input: CSSProperties = { minWidth: 0, height: 42, border: "1px solid #d1d5db", borderRadius: 9, background: "#fff", padding: "0 12px", fontSize: 14, fontWeight: 800, boxSizing: "border-box" };
const assistantBox: CSSProperties = { gridColumn: "1 / -1", border: "1px solid #d1d5db", borderRadius: 10, background: "#fbfcfe", padding: "12px 13px" };
const legend: CSSProperties = { padding: "0 6px", fontSize: 13, fontWeight: 950, color: "#374151" };
const assistantGrid: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8 };
const assistantChip: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid #e5e7eb", borderRadius: 999, background: "#fff", padding: "7px 10px", fontSize: 13, fontWeight: 900 };
const muted: CSSProperties = { color: "#6b7280", fontWeight: 800, fontSize: 13 };
const actions: CSSProperties = { gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 4 };
const cancelButton: CSSProperties = { border: "1px solid #d1d5db", borderRadius: 9, background: "#fff", color: "#111827", padding: "11px 16px", fontWeight: 950, textDecoration: "none" };
const primaryButton: CSSProperties = { border: 0, borderRadius: 9, background: "#111827", color: "#fff", padding: "11px 18px", fontWeight: 950, cursor: "pointer" };
