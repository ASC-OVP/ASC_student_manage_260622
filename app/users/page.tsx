import { prisma } from "@/lib/prisma";
import { canDeactivateAccount, canManageStaff, requireUser, roleText } from "@/lib/auth";
import type { CSSProperties } from "react";
import { createUserAction, deleteUserAction } from "./actions";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

export const dynamic = "force-dynamic";

export default async function UsersPage({ searchParams }: Props) {
  const me = await requireUser();
  const params = await searchParams;
  const users = await prisma.user.findMany({
    where: { academyId: me.academyId },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });
  const canCreate = canManageStaff(me.role);
  const canDeactivate = canDeactivateAccount(me.role);
  const activeAdminCount = users.filter((user) => user.role === "ADMIN" && user.isActive).length;

  return (
    <main style={page}>
      <section style={container}>
        <h1 style={title}>직원/계정 관리</h1>
        <p style={desc}>실장, 강사, 조교 계정을 만들고 각자 로그인하게 합니다.</p>

        {params.error && <p style={error}>{errorMessage(params.error)}</p>}

        <div style={grid}>
          {canCreate && (
            <section style={card}>
              <h2 style={sectionTitle}>계정 추가</h2>
              <form action={createUserAction} style={form}>
                <input name="name" placeholder="이름" required style={input} />
                <input name="loginId" placeholder="아이디" required style={input} />
                <input name="password" type="password" placeholder="비밀번호" required style={input} />
                <select name="role" style={input} defaultValue="ASSISTANT">
                  <option value="MANAGER">실장</option>
                  <option value="TEACHER">강사</option>
                  <option value="ASSISTANT">조교</option>
                  <option value="ADMIN">관리자</option>
                </select>
                <button style={btn}>추가</button>
              </form>
            </section>
          )}

          <section style={{ ...card, ...(canCreate ? {} : wideCard) }}>
            <div style={listHead}>
              <h2 style={sectionTitle}>계정 목록</h2>
              <span style={permissionBadge}>
                비활성화 권한: {canDeactivate ? "관리자/강사" : "없음"}
              </span>
            </div>

            <div style={list}>
              {users.map((user) => {
                const isLastAdmin = user.role === "ADMIN" && activeAdminCount <= 1;
                const showDeactivate = canDeactivate && user.id !== me.id && user.isActive && !isLastAdmin;

                return (
                  <div key={user.id} style={{ ...row, ...(!user.isActive ? inactiveRow : {}) }}>
                    <b>{user.name}</b>
                    <span>{user.loginId}</span>
                    <span>{roleText(user.role)}</span>
                    <span style={user.isActive ? activeBadge : inactiveBadge}>
                      {user.isActive ? "활성" : "비활성"}
                    </span>
                    {showDeactivate ? (
                      <form action={deleteUserAction}>
                        <input type="hidden" name="userId" value={user.id} />
                        <button style={del}>비활성화</button>
                      </form>
                    ) : (
                      <span style={muted}>{user.id === me.id ? "본인" : "-"}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function errorMessage(error: string) {
  if (error === "permission") return "계정 비활성화는 관리자/강사만 가능합니다.";
  if (error === "empty") return "이름, 아이디, 비밀번호를 입력하세요.";
  if (error === "duplicate") return "이미 사용 중인 아이디입니다.";
  if (error === "self") return "본인 계정은 비활성화할 수 없습니다.";
  if (error === "last-admin") return "마지막 활성 관리자 계정은 비활성화할 수 없습니다.";
  if (error === "missing") return "대상 계정을 찾을 수 없습니다.";
  return "권한 또는 입력값을 확인하세요.";
}

const page: CSSProperties = { padding: 16, color: "#111827" };
const container: CSSProperties = { width: "100%", maxWidth: "none", margin: 0 };
const title: CSSProperties = { fontSize: 25, fontWeight: 950, margin: "0 0 8px" };
const desc: CSSProperties = { color: "#6b7280", margin: "0 0 18px" };
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "360px 1fr", gap: 18 };
const card: CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 14 };
const wideCard: CSSProperties = { gridColumn: "1 / -1" };
const sectionTitle: CSSProperties = { margin: "0 0 14px", fontSize: 20, fontWeight: 950 };
const form: CSSProperties = { display: "flex", flexDirection: "column", gap: 10 };
const input: CSSProperties = { padding: "12px", border: "1px solid #d1d5db", borderRadius: 8 };
const btn: CSSProperties = { background: "#111827", color: "#fff", border: 0, borderRadius: 8, padding: "12px", fontWeight: 950 };
const listHead: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 };
const permissionBadge: CSSProperties = { border: "1px solid #d1d5db", borderRadius: 999, padding: "7px 10px", color: "#4b5563", fontWeight: 900, fontSize: 12 };
const list: CSSProperties = { borderTop: "1px solid #f3f4f6" };
const row: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 82px 72px 96px", gap: 10, alignItems: "center", padding: "12px 0", borderBottom: "1px solid #f3f4f6" };
const inactiveRow: CSSProperties = { color: "#6b7280", background: "#fafafa" };
const activeBadge: CSSProperties = { color: "#166534", background: "#dcfce7", borderRadius: 999, padding: "5px 8px", textAlign: "center", fontWeight: 900 };
const inactiveBadge: CSSProperties = { color: "#6b7280", background: "#f3f4f6", borderRadius: 999, padding: "5px 8px", textAlign: "center", fontWeight: 900 };
const del: CSSProperties = { background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 10px", fontWeight: 900 };
const muted: CSSProperties = { color: "#9ca3af", textAlign: "center", fontWeight: 900 };
const error: CSSProperties = { background: "#fee2e2", color: "#991b1b", padding: 12, borderRadius: 8, fontWeight: 900 };
