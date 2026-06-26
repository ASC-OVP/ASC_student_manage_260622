import { prisma } from "@/lib/prisma";
import { requireUser, roleLabel, canDeactivateAccount, canManageStaff } from "@/lib/auth";
import { createStaff, deleteStaff } from "./actions";
import { button, card, container, desc, excelTable, excelTd, excelTh, input, page, title } from "@/lib/ui";
import Link from "next/link";

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
        <h1 style={title}>직원/계정 관리</h1>
        <p style={desc}>실장, 강사, 조교 계정을 만들고 같은 소속 공간 안에서 학생·메모·업무를 공유합니다.</p>

        {manageable && (
          <section style={{ ...card, marginBottom: 12 }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 900 }}>계정 추가</h2>
            <form action={createStaff} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 150px 96px", gap: 8, alignItems: "end" }}>
              <label style={label}>이름<input name="name" required style={input} placeholder="예: 김조교" /></label>
              <label style={label}>아이디<input name="loginId" required style={input} placeholder="assistant01" /></label>
              <label style={label}>비밀번호<input name="password" type="password" required style={input} /></label>
              <label style={label}>직위<select name="role" style={input} defaultValue="ASSISTANT"><option value="MANAGER">실장</option><option value="TEACHER">강사</option><option value="ASSISTANT">조교</option><option value="ADMIN">관리자</option></select></label>
              <button style={button}>추가</button>
            </form>
          </section>
        )}

        <div style={{ overflow: "auto", borderRadius: 8 }}>
          <table style={excelTable}>
            <thead><tr><th style={excelTh}>이름</th><th style={excelTh}>아이디</th><th style={excelTh}>직위</th><th style={excelTh}>상태</th><th style={excelTh}>생성일</th><th style={excelTh}>관리</th></tr></thead>
            <tbody>
              {staff.map((member) => (
                <tr key={member.id}>
                  <td style={excelTd}><b>{member.name}</b></td>
                  <td style={excelTd}>{member.loginId}</td>
                  <td style={excelTd}>{roleLabel(member.role)}</td>
                  <td style={excelTd}>{member.isActive ? "활성" : "비활성"}</td>
                  <td style={excelTd}>{new Date(member.createdAt).toLocaleDateString("ko-KR")}</td>
                  <td style={excelTd}>
                    {member.role === "ASSISTANT" && member.isActive && (
                      <Link href={`/work?assistantId=${member.id}`} style={miniLink}>근무</Link>
                    )}
                    {canDeactivate && member.id !== user.id && member.isActive && !(member.role === "ADMIN" && activeAdminCount <= 1) ? (
                      <form action={deleteStaff}>
                        <input type="hidden" name="userId" value={member.id}/>
                        <button style={miniDanger}>비활성화</button>
                      </form>
                    ) : "-"}
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
const label = { display: "flex", flexDirection: "column" as const, gap: 4, fontWeight: 900 };
const miniLink = { display: "inline-block", marginRight: 6, padding: "6px 9px", borderRadius: "var(--asc-radius-lg)", background: "var(--asc-primary-soft)", color: "var(--asc-primary-hover)", fontWeight: 900, textDecoration: "none" };
const miniDanger = { padding: "6px 9px", border: "1px solid var(--asc-danger)", borderRadius: "var(--asc-radius-lg)", background: "var(--asc-danger)", color: "#fff", fontWeight: 900 };
