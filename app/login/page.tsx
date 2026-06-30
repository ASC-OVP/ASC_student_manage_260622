import type { CSSProperties } from "react";
import { Button, ButtonLink, Input, Notice, PageHeader } from "@/components/ui";

type Props = { searchParams: Promise<{ error?: string; created?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;

  return (
    <main style={page}>
      <section style={card}>
        <PageHeader
          eyebrow="ASC"
          title="로그인"
          description="학원 코드, 아이디, 비밀번호를 입력해 ASC 운영 보드에 접속합니다."
        />

        {params.created === "1" && <Notice tone="success">학원이 등록되었습니다. 방금 만든 코드로 로그인하세요.</Notice>}
        {params.error === "invalid" && <Notice tone="danger">학원 코드, 아이디 또는 비밀번호가 올바르지 않습니다.</Notice>}
        {params.error === "empty" && <Notice tone="danger">모든 항목을 입력하세요.</Notice>}

        <form action="/api/login" method="post" style={form}>
          <Input name="academyCode" label="학원 코드" placeholder="예: sm-science" required />
          <Input name="loginId" label="아이디" placeholder="예: admin" required />
          <Input name="password" type="password" label="비밀번호" required />
          <Button type="submit" fullWidth>로그인</Button>
        </form>

        <ButtonLink href="/setup" variant="tertiary" fullWidth>
          새 학원 등록
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
  maxWidth: 440,
  display: "grid",
  gap: 14,
  background: "var(--asc-surface)",
  border: "1px solid var(--asc-border)",
  borderRadius: "var(--asc-radius-xl)",
  padding: 24,
  boxShadow: "var(--asc-shadow-panel)",
};
const form: CSSProperties = { display: "grid", gap: 12 };