import type { CSSProperties } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { prisma } from "@/lib/prisma";
import { requireUser, roleLabel, canDeactivateAccount, canManageStaff } from "@/lib/auth";
import { createStaff, deleteStaff } from "./actions";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const user = await requireUser();
  const staff = await prisma.user.findMany({
    where: { academyId: user.academyId },
    orderBy: [{ role: "asc" }, { createdAt: "desc" }],
  });
  const manageable = canManageStaff(user.role);
  const canDeactivate = canDeactivateAccount(user.role);
  const activeAdminCount = staff.filter((member) => member.role === "ADMIN" && member.isActive).length;

  return (
    <main style={page}>
      <section style={container}>
        <PageHeader
          eyebrow="직원/계정"
          title="직원/계정 관리"
          description="실장, 강사, 조교 계정을 만들고 같은 소속 공간 안에서 학생·메모·업무를 공유합니다."
        />

        {manageable && (
          <section style={card} className="asc-panel asc-panel--subtle">
            <h2 style={sectionTitle}>계정 추가</h2>
            <form action={createStaff} className="asc-form-grid" style={form}>
              <Input label="이름" name="name" required placeholder="예: 김조교" />
              <Input label="아이디" name="loginId" required placeholder="assistant01" />
              <Input label="비밀번호" name="password" type="password" required />
              <Select label="직위" name="role" defaultValue="ASSISTANT">
                <option value="MANAGER">실장</option>
                <option value="TEACHER">강사</option>
                <option value="ASSISTANT">조교</option>
                <option value="ADMIN">관리자</option>
              </Select>
              <div style={addAction} className="asc-form-actions">
                <Button type="submit">추가</Button>
              </div>
            </form>
          </section>
        )}

        <div style={tableWrap} className="asc-panel">
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>이름</th>
                <th style={th}>아이디</th>
                <th style={th}>직위</th>
                <th style={th}>상태</th>
                <th style={th}>생성일</th>
                <th style={th}>관리</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => (
                <tr key={member.id}>
                  <td style={td}><b>{member.name}</b></td>
                  <td style={td}>{member.loginId}</td>
                  <td style={td}><Badge tone="navy">{roleLabel(member.role)}</Badge></td>
                  <td style={td}><Badge tone={member.isActive ? "green" : "gray"}>{member.isActive ? "활성" : "비활성"}</Badge></td>
                  <td style={td}>{new Date(member.createdAt).toLocaleDateString("ko-KR")}</td>
                  <td style={td}>
                    <div className="asc-action-group">
                      {member.role === "ASSISTANT" && member.isActive && (
                        <ButtonLink href={`/work?assistantId=${member.id}`} variant="secondary" size="sm">근무</ButtonLink>
                      )}
                      {canDeactivate && member.id !== user.id && member.isActive && !(member.role === "ADMIN" && activeAdminCount <= 1) ? (
                        <form action={deleteStaff}>
                          <input type="hidden" name="userId" value={member.id} />
                          <Button type="submit" variant="danger" size="sm">비활성화</Button>
                        </form>
                      ) : <span style={muted}>-</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

const page: CSSProperties = { minHeight: "100vh", padding: 12, background: "var(--asc-bg-subtle)", color: "var(--asc-text)" };
const container: CSSProperties = { display: "grid", gap: 12, width: "100%", maxWidth: "none", margin: 0 };
const card: CSSProperties = { margin: 0 };
const sectionTitle: CSSProperties = { margin: "0 0 10px", fontSize: 18, fontWeight: 850 };
const form: CSSProperties = { alignItems: "end" };
const addAction: CSSProperties = { gridColumn: "auto" };
const tableWrap: CSSProperties = { overflow: "auto", padding: 0 };
const table: CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 760 };
const th: CSSProperties = { textAlign: "left", padding: "10px 12px", borderBottom: "1px solid var(--asc-border)", background: "var(--asc-bg-subtle)", color: "var(--asc-text-subtle)", fontSize: 13, fontWeight: 850, whiteSpace: "nowrap" };
const td: CSSProperties = { padding: "10px 12px", borderBottom: "1px solid var(--asc-border)", verticalAlign: "middle", fontSize: 14 };
const muted: CSSProperties = { color: "var(--asc-text-muted)", fontWeight: 700 };