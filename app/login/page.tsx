import Link from "next/link";
import type { CSSProperties } from "react";

type Props = { searchParams: Promise<{ error?: string; created?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;

  return (
    <main style={page}>
      <section style={card}>
        <h1 style={title}>ASC 로그인</h1>
        <p style={desc}>강사팀 코드, 아이디, 비밀번호를 입력하세요.</p>
        {params.created === "1" && <p style={success}>강사팀이 등록되었습니다. 방금 만든 코드로 로그인하세요.</p>}
        {params.error === "invalid" && <p style={error}>강사팀 코드, 아이디 또는 비밀번호가 올바르지 않습니다.</p>}
        {params.error === "empty" && <p style={error}>모든 항목을 입력해주세요.</p>}

        <form action="/api/login" method="post" style={form}>
          <label style={label}>
            강사팀 코드
            <input name="academyCode" placeholder="예: sm-science" required style={input} />
          </label>
          <label style={label}>
            아이디
            <input name="loginId" placeholder="예: admin" required style={input} />
          </label>
          <label style={label}>
            비밀번호
            <input name="password" type="password" required style={input} />
          </label>
          <button style={button}>로그인</button>
        </form>

        <Link href="/setup" style={secondaryButton}>
          새 강사팀 등록
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
  background: "linear-gradient(135deg,#0f172a,#083891)",
  color: "#111827",
  padding: 24,
};
const card: CSSProperties = {
  width: "100%",
  maxWidth: 420,
  background: "#fff",
  borderRadius: 22,
  padding: 32,
  boxShadow: "0 18px 50px rgba(15,23,42,.24)",
};
const title: CSSProperties = { fontSize: 32, fontWeight: 950, margin: "0 0 8px" };
const desc: CSSProperties = { margin: "0 0 22px", color: "#6b7280" };
const form: CSSProperties = { display: "flex", flexDirection: "column", gap: 14 };
const label: CSSProperties = { display: "flex", flexDirection: "column", gap: 8, fontWeight: 900 };
const input: CSSProperties = { padding: "12px", border: "1px solid #d1d5db", borderRadius: 12 };
const button: CSSProperties = { padding: "13px", border: 0, borderRadius: 12, background: "#111827", color: "#fff", fontWeight: 950 };
const secondaryButton: CSSProperties = {
  display: "block",
  marginTop: 12,
  padding: "12px",
  border: "1px solid #d1d5db",
  borderRadius: 12,
  color: "#111827",
  textAlign: "center",
  textDecoration: "none",
  fontWeight: 950,
};
const error: CSSProperties = { background: "#fee2e2", color: "#991b1b", padding: 12, borderRadius: 12, fontWeight: 900 };
const success: CSSProperties = { background: "#ecfdf5", color: "#166534", padding: 12, borderRadius: 12, fontWeight: 900 };