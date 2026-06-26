"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { useState, type CSSProperties } from "react";

export default function AppFrame({ children, stickyLauncher }: { children: React.ReactNode; stickyLauncher?: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const authPage = pathname === "/login" || pathname === "/setup" || pathname.startsWith("/login/") || pathname.startsWith("/setup/");

  if (authPage) return <>{children}</>;

  return (
    <>
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((current) => !current)} />
      <main style={{ ...contentStyle, marginLeft: sidebarCollapsed ? 64 : 236 }}>{children}</main>
      {stickyLauncher}
    </>
  );
}

const contentStyle: CSSProperties = {
  minHeight: "100vh",
  minWidth: 0,
  overflowX: "clip",
  background: "var(--asc-bg-subtle)",
  transition: "margin-left 180ms ease",
};
