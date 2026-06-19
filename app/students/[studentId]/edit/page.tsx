import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { backLink, button, card, form, input, label, narrowContainer, page, secondaryButton, title, desc } from "@/lib/styles";
import Link from "next/link";
import { notFound } from "next/navigation";
import { updateStudent } from "../../actions";

type PageProps = { params: Promise<{ studentId: string }> };

export default async function EditStudentPage({ params }: PageProps) {
  const user = await requireUser();
  const { studentId } = await params;
  const [student, staff, classGroups] = await Promise.all([
    prisma.student.findFirst({
      where: { id: studentId, academyId: user.academyId },
      include: { studentClasses: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] } },
    }),
    prisma.user.findMany({ where: { academyId: user.academyId, isActive: true }, orderBy: { name: "asc" } }),
    prisma.classGroup.findMany({
      where: {
        academyId: user.academyId,
        ...(user.role === "TEACHER" ? { teacherId: user.id } : {}),
      },
      include: { teacher: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!student) notFound();

  const teachers = staff.filter((member) => member.role === "TEACHER" || member.role === "MANAGER" || member.role === "ADMIN");
  const assistants = staff.filter((member) => member.role === "ASSISTANT");
  const classGroupId = student.studentClasses[0]?.classGroupId ?? "";

  return (
    <main style={page}>
        <section style={narrowContainer}>
          <Link href={`/students/${student.id}`} style={backLink}>← 학생 상세로</Link>
          <div style={card}>
            <h1 style={title}>학생 수정</h1>
            <p style={desc}>{student.name} 정보를 수정합니다.</p>
            <form action={updateStudent} style={{ ...form, marginTop: 22 }}>
              <input type="hidden" name="studentId" value={student.id} />
              <label style={label}>이름<input name="name" required defaultValue={student.name} style={input} /></label>
              <label style={label}>소속 반
                <select name="classGroupId" defaultValue={classGroupId} style={input}>
                  <option value="">미지정</option>
                  {classGroups.map((classGroup) => (
                    <option key={classGroup.id} value={classGroup.id}>
                      {classGroup.teacher?.name ? `${classGroup.teacher.name} / ${classGroup.name}` : classGroup.name}
                    </option>
                  ))}
                </select>
              </label>
              <label style={label}>연락처<input name="phone" defaultValue={student.phone ?? ""} style={input} /></label>
              <label style={label}>보호자 연락처<input name="parentPhone" defaultValue={student.parentPhone ?? ""} style={input} /></label>
              <label style={label}>학교<input name="schoolName" defaultValue={student.schoolName ?? ""} style={input} /></label>
              <label style={label}>학년<input name="grade" defaultValue={student.grade ?? ""} style={input} /></label>
              <label style={label}>과목<input name="subject" defaultValue={student.subject ?? ""} style={input} /></label>
              <label style={label}>레벨<input name="currentLevel" defaultValue={student.currentLevel ?? ""} style={input} /></label>
              <label style={label}>상태
                <select name="status" defaultValue={student.status} style={input}>
                  <option value="ACTIVE">재원</option>
                  <option value="WATCH">주의</option>
                  <option value="PAUSED">휴원</option>
                  <option value="LEFT">퇴원</option>
                </select>
              </label>
              <label style={label}>담당 강사
                <select name="teacherId" defaultValue={student.teacherId ?? ""} style={input}>
                  <option value="">미지정</option>
                  {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
                </select>
              </label>
              <label style={label}>담당 조교
                <select name="assistantId" defaultValue={student.assistantId ?? ""} style={input}>
                  <option value="">미지정</option>
                  {assistants.map((assistant) => <option key={assistant.id} value={assistant.id}>{assistant.name}</option>)}
                </select>
              </label>
              <label style={label}>기본 메모<textarea name="memo" rows={5} defaultValue={student.memo ?? ""} style={{ ...input, resize: "vertical" }} /></label>
              <div style={{ display: "flex", gap: 12 }}>
                <button style={button}>수정 저장</button>
                <Link href={`/students/${student.id}`} style={secondaryButton}>취소</Link>
              </div>
            </form>
          </div>
        </section>
    </main>
  );
}
