import type { CSSProperties } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { createStudent } from "@/features/students/actions/studentActions";
import PhoneInput from "@/components/PhoneInput";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const grades = ["중1", "중2", "중3", "고1", "고2", "고3", "N수"];

type Props = {
  searchParams?: Promise<{
    classGroupId?: string;
  }>;
};

export default async function NewStudentPage({ searchParams }: Props) {
  const user = await requireUser();
  const sp = (await searchParams) ?? {};
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
  const defaultClassGroupId = classGroups.some((classGroup) => classGroup.id === sp.classGroupId) ? sp.classGroupId ?? "" : "";

  return (
    <main style={page}>
      <section style={card} className="asc-panel">
        <PageHeader
          eyebrow="학생 관리"
          title="학생 추가"
          description="기본 정보와 담당자를 먼저 등록한 뒤 상세 화면에서 상담, 성적, 메모를 이어서 관리합니다."
          actions={<ButtonLink href="/students" variant="secondary" size="sm">학생 현황판</ButtonLink>}
        />

        <form action={createStudent} className="asc-form-grid" style={form}>
          <Input label="이름" name="name" required />
          <Select label="소속 반" name="classGroupId" defaultValue={defaultClassGroupId}>
            <option value="">미지정</option>
            {classGroups.map((classGroup) => (
              <option key={classGroup.id} value={classGroup.id}>
                {classGroup.teacher?.name ? `${classGroup.teacher.name} / ${classGroup.name}` : classGroup.name}
              </option>
            ))}
          </Select>
          <label className="asc-field">
            <span className="asc-field__label">학생 전화</span>
            <PhoneInput name="phone" className="asc-input" />
          </label>
          <label className="asc-field">
            <span className="asc-field__label">보호자 전화</span>
            <PhoneInput name="parentPhone" className="asc-input" />
          </label>
          <Input label="학교" name="schoolName" placeholder="예: 대치고" />
          <Select label="학년" name="grade" defaultValue="고1">
            {grades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
          </Select>
          <Input label="과목" name="subject" placeholder="수학" />
          <Input label="레벨" name="currentLevel" placeholder="A반" />
          <Select label="상태" name="status" defaultValue="ACTIVE">
            <option value="ACTIVE">재원</option>
            <option value="WATCH">주의</option>
            <option value="PAUSED">휴원</option>
            <option value="LEFT">퇴원</option>
          </Select>
          <Select label="담당 강사" name="teacherId" defaultValue={user.role === "TEACHER" ? user.id : ""}>
            <option value="">반 담당 강사 자동 적용</option>
            {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
          </Select>
          <Textarea label="기본 메모" name="memo" rows={5} containerClassName="asc-field--full" />
          <div style={buttons} className="asc-form-actions">
            <ButtonLink href="/students" variant="secondary">취소</ButtonLink>
            <Button type="submit">학생 저장</Button>
          </div>
        </form>
      </section>
    </main>
  );
}

const page: CSSProperties = { padding: 12, color: "var(--asc-text)", background: "var(--asc-bg-subtle)", minHeight: "100vh" };
const card: CSSProperties = { width: "100%", maxWidth: "none", margin: 0 };
const form: CSSProperties = { marginTop: 14 };
const buttons: CSSProperties = { gridColumn: "1 / -1" };