import Link from "next/link";
import type { CSSProperties } from "react";

type Props = { searchParams: Promise<{ error?: string }> };

export default async function SetupPage({ searchParams }: Props) {
  const params = await searchParams;

  return (
    <main style={page}>
      <section style={card}>
        <h1 style={title}>강사팀 등록</h1>
        <p style={desc}>팀마다 별도 공간을 만들고, 로그인할 때 강사팀 코드를 입력해 들어갑니다.</p>
        {params.error === "empty" && <p style={error}>모든 항목을 입력해주세요.</p>}
        {params.error === "duplicate" && <p style={error}>이미 사용 중인 강사팀 코드입니다.</p>}
        {params.error === "server" && (
          <p style={error}>강사팀 등록 중 오류가 났습니다. Codespace DB 초기화 후 다시 시도해주세요.</p>
        )}

        <form action="/api/setup" method="post" style={form}>
          <label style={label}>
            강사팀 이름
            <input name="academyName" placeholder="예: 숙명여고 과학팀" required style={input} />
          </label>
          <label style={label}>
            강사팀 코드
            <input name="academyCode" placeholder="예: sm-science" required style={input} />
          </label>
          <label style={label}>
            관리자 이름
            <input name="name" placeholder="예: 곽승헌" required style={input} />
          </label>
          <label style={label}>
            아이디
            <input name="loginId" placeholder="예: admin" required style={input} />
          </label>
          <label style={label}>
            비밀번호
            <input name="password" type="password" placeholder="예: 1234" required style={input} />
          </label>
          <button style={button}>강사팀 등록</button>
        </form>

        <Link href="/login" style={link}>
          이미 등록한 강사팀으로 로그인
        </Link>
      </section>
    </main>
  );
}

const page: CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "linear-gradient(135deg,#083891,#312e81)",
  color: "#111827",
  padding: 24,
};
const card: CSSProperties = {
  width: "100%",
  maxWidth: 460,
  background: "#fff",
  borderRadius: 22,
  padding: 32,
  boxShadow: "0 18px 50px rgba(15,23,42,.24)",
};
const title: CSSProperties = { fontSize: 32, fontWeight: 950, margin: "0 0 8px" };
const desc: CSSProperties = { margin: "0 0 22px", color: "#6b7280", lineHeight: 1.6 };
const form: CSSProperties = { display: "flex", flexDirection: "column", gap: 14 };
const label: CSSProperties = { display: "flex", flexDirection: "column", gap: 8, fontWeight: 900 };
const input: CSSProperties = { padding: "12px", border: "1px solid #d1d5db", borderRadius: 12 };
const button: CSSProperties = { padding: "13px", border: 0, borderRadius: 12, background: "#111827", color: "#fff", fontWeight: 950 };
const error: CSSProperties = { background: "#fee2e2", color: "#991b1b", padding: 12, borderRadius: 12, fontWeight: 900 };
const link: CSSProperties = { display: "block", marginTop: 16, textAlign: "center", color: "var(--asc-primary-deep)", fontWeight: 950, textDecoration: "none" };
