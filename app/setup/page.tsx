import type { CSSProperties } from "react";
import { Button, ButtonLink, Input, Notice, PageHeader } from "@/components/ui";

type Props = { searchParams: Promise<{ error?: string }> };

export default async function SetupPage({ searchParams }: Props) {
  const params = await searchParams;

  return (
    <main style={page}>
      <section style={card}>
        <PageHeader
          eyebrow="초기 설정"
          title="학원 등록"
          description="학원별 운영 공간을 만들고 로그인에 사용할 관리자 계정을 등록합니다."
        />

        {params.error === "empty" && <Notice tone="danger">모든 항목을 입력하세요.</Notice>}
        {params.error === "duplicate" && <Notice tone="danger">이미 사용 중인 학원 코드입니다.</Notice>}
        {params.error === "server" && <Notice tone="danger">학원 등록 중 오류가 발생했습니다. DB 초기화 후 다시 시도하세요.</Notice>}

        <form action="/api/setup" method="post" style={form}>
          <Input name="academyName" label="학원 이름" placeholder="예: 서명고 과학학원" required />
          <Input name="academyCode" label="학원 코드" placeholder="예: sm-science" required helperText="로그인할 때 함께 입력하는 고유 코드입니다." />
          <Input name="name" label="관리자 이름" placeholder="예: 곽승호" required />
          <Input name="loginId" label="아이디" placeholder="예: admin" required />
          <Input name="password" type="password" label="비밀번호" placeholder="예: 1234" required />
          <Button type="submit" fullWidth>학원 등록</Button>
        </form>

        <ButtonLink href="/login" variant="tertiary" fullWidth>
          이미 등록한 학원으로 로그인
        </ButtonLink>
      </section>
    </main>
  );
}

const page: CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  background: "var(--asc-bg-subtle)",
  color: "var(--asc-text)",
  padding: 24,
};
const card: CSSProperties = {
  width: "100%",
  maxWidth: 500,
  display: "grid",
  gap: 14,
  background: "var(--asc-surface)",
  border: "1px solid var(--asc-border)",
  borderRadius: "var(--asc-radius-xl)",
  padding: 24,
  boxShadow: "var(--asc-shadow-panel)",
};
const form: CSSProperties = { display: "grid", gap: 12 };