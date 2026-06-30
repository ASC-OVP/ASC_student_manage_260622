import { prisma } from "@/lib/prisma";
import { canDeactivateAccount, canManageStaff, requireUser, roleText } from "@/lib/auth";
import type { CSSProperties } from "react";
import { Badge, Button, Input, Notice, PageHeader, Select } from "@/components/ui";
import { createUserAction, deleteUserAction } from "@/features/users/actions/userActions";

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
        <PageHeader
          eyebrow="계정"
          title="직원/계정 관리"
          description="실장, 강사, 조교 계정을 만들고 각자 로그인하게 합니다."
        />

        {params.error && <Notice tone="danger" title="계정 처리 오류">{errorMessage(params.error)}</Notice>}

        <div style={grid}>
          {canCreate && (
            <section style={card}>
              <h2 style={sectionTitle}>계정 추가</h2>
              <form action={createUserAction} style={form}>
                <Input name="name" label={<>이름 <span className="asc-required">*</span></>} required placeholder="이름" />
                <Input name="loginId" label={<>아이디 <span className="asc-required">*</span></>} required placeholder="로그인 아이디" />
                <Input name="password" type="password" label={<>비밀번호 <span className="asc-required">*</span></>} required placeholder="초기 비밀번호" />
                <Select name="role" label="권한" defaultValue="ASSISTANT">
                  <option value="MANAGER">실장</option>
                  <option value="TEACHER">강사</option>
                  <option value="ASSISTANT">조교</option>
                  <option value="ADMIN">관리자</option>
                </Select>
                <div className="asc-form-actions">
                  <Button type="submit">계정 추가</Button>
                </div>
              </form>
            </section>
          )}

          <section style={{ ...card, ...(canCreate ? {} : wideCard) }}>
            <div style={listHead}>
              <h2 style={sectionTitle}>계정 목록</h2>
              <Badge tone={canDeactivate ? "blue" : "gray"}>비활성화 권한: {canDeactivate ? "관리자/강사" : "없음"}</Badge>
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
                    <Badge tone={user.isActive ? "green" : "gray"}>{user.isActive ? "활성" : "비활성"}</Badge>
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

const page: CSSProperties = { padding: 12, color: "var(--asc-text)", background: "var(--asc-bg-subtle)", minHeight: "100vh" };
const container: CSSProperties = { width: "100%", maxWidth: "none", margin: 0, display: "grid", gap: 12 };
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "320px 1fr", gap: 10 };
const card: CSSProperties = { background: "var(--asc-surface)", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 12 };
const wideCard: CSSProperties = { gridColumn: "1 / -1" };
const sectionTitle: CSSProperties = { margin: "0 0 8px", fontSize: 18, fontWeight: 950 };
const form: CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };
const listHead: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 };
const list: CSSProperties = { borderTop: "1px solid var(--asc-border)" };
const row: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 82px 72px 96px", gap: 8, alignItems: "center", padding: "9px 0", borderBottom: "1px solid #f3f4f6" };
const inactiveRow: CSSProperties = { color: "var(--asc-text-muted)", background: "var(--asc-bg-subtle)" };
const del: CSSProperties = { background: "var(--asc-danger-soft)", color: "var(--asc-danger)", border: "1px solid var(--asc-danger)", borderRadius: "var(--asc-radius-md)", padding: "6px 9px", fontWeight: 900 };
const muted: CSSProperties = { color: "var(--asc-text-muted)", textAlign: "center", fontWeight: 900 };
