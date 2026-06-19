"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { useState, type CSSProperties } from "react";

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const authPage = pathname === "/login" || pathname === "/setup" || pathname.startsWith("/login/") || pathname.startsWith("/setup/");

  if (authPage) return <>{children}</>;

  return (
    <>
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((current) => !current)} />
      <main style={{ ...contentStyle, marginLeft: sidebarCollapsed ? 64 : 236 }}>{children}</main>
    </>
  );
}

const contentStyle: CSSProperties = {
  minHeight: "100vh",
  background: "#f3f4f6",
  transition: "margin-left 160ms ease",
};
