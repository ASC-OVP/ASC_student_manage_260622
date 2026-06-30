import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { canManageClassGroups } from "@/lib/classGroups";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Props = { searchParams?: Promise<{ error?: string }> };

export default async function NewClassPage({ searchParams }: Props = {}) {
  const user = await requireUser();
  if (!canManageClassGroups(user.role)) redirect("/classes");
  const params = (await searchParams) ?? {};

  const staff = await prisma.user.findMany({
    where: { academyId: user.academyId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true },
  });
  const teachers = staff.filter((member) => member.role === "ADMIN" || member.role === "MANAGER" || member.role === "TEACHER");
  const assistants = staff.filter((member) => member.role === "ASSISTANT");

  return (
    <main style={page}>
      <section style={card} className="asc-panel">
        <PageHeader
          eyebrow="반 관리"
          title="반 추가"
          description="수업 기본 정보만 먼저 등록하고, 학생 배정과 통계는 반 상세 화면에서 이어서 관리합니다."
          actions={<ButtonLink href="/classes" variant="secondary" size="sm">반 목록</ButtonLink>}
        />

        {params.error === "duplicate" && (
          <Notice tone="danger" title="반 이름 중복">이미 같은 이름의 반이 있습니다. 다른 이름으로 등록해 주세요.</Notice>
        )}
        {params.error === "empty" && <Notice tone="warning" title="입력 필요">반 이름을 입력해 주세요.</Notice>}

        <form action="/api/classes/create" method="post" className="asc-form-grid" style={form}>
          <Input label="반 이름" name="name" required placeholder="예: 고1 수학 내신반" autoFocus />

          {user.role === "TEACHER" ? (
            <>
              <input type="hidden" name="teacherId" value={user.id} />
              <Input label="담당 강사" value={teachers.find((teacher) => teacher.id === user.id)?.name ?? "내 반"} readOnly />
            </>
          ) : (
            <Select label="담당 강사" name="teacherId" defaultValue="">
              <option value="">미지정</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.name}
                </option>
              ))}
            </Select>
          )}

          <fieldset style={assistantBox} className="asc-field asc-field--full">
            <legend style={legend}>담당 조교</legend>
            <input type="hidden" name="assistantIds" value="" />
            {assistants.length === 0 ? (
              <span className="asc-field__hint">등록된 조교가 없습니다.</span>
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

          <Input label="과목" name="subject" placeholder="수학" />
          <Input label="학년" name="grade" placeholder="고1" />
          <Input label="운영 시작일" name="startDate" type="date" />
          <Input label="운영 종료일" name="endDate" type="date" />
          <Input label="수업 요일" name="daysOfWeek" placeholder="월수금" />
          <Input label="시작 시간" name="startTime" type="time" />
          <Input label="종료 시간" name="endTime" type="time" />
          <Input label="강의실" name="room" placeholder="A룸" />
          <Select label="상태" name="status" defaultValue="ACTIVE">
            <option value="UPCOMING">운영 예정</option>
            <option value="ACTIVE">운영중</option>
            <option value="PAUSED">휴강</option>
            <option value="ENDED">종료</option>
          </Select>
          <Textarea
            label="설명/메모"
            name="description"
            rows={5}
            placeholder="반 운영 메모, 교재, 특이사항 등을 적어둘 수 있습니다."
            containerClassName="asc-field--full"
          />

          <div style={actions} className="asc-form-actions">
            <ButtonLink href="/classes" variant="secondary">취소</ButtonLink>
            <Button type="submit">반 추가</Button>
          </div>
        </form>
      </section>
    </main>
  );
}

const page: CSSProperties = { minHeight: "100vh", padding: 12, color: "var(--asc-text)", background: "var(--asc-bg-subtle)" };
const card: CSSProperties = { width: "100%", maxWidth: "none", margin: 0 };
const form: CSSProperties = { marginTop: 14 };
const assistantBox: CSSProperties = { border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-md)", background: "var(--asc-bg-subtle)", padding: "10px 12px" };
const legend: CSSProperties = { padding: "0 6px", fontSize: 13, fontWeight: 800, color: "var(--asc-text)" };
const assistantGrid: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 6 };
const assistantChip: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-pill)", background: "var(--asc-surface)", padding: "6px 10px", fontSize: 13, fontWeight: 800 };
const actions: CSSProperties = { gridColumn: "1 / -1" };