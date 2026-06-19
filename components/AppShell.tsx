import Sidebar from "@/components/Sidebar";
import { requireUser } from "@/lib/auth";

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <>
      <Sidebar academyName={user.academy.name} userName={user.name} role={user.role} />
      <main style={{ marginLeft: 244, minHeight: "100vh", background: "#f3f4f6" }}>{children}</main>
    </>
  );
}
