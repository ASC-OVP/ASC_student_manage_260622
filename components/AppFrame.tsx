"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { useState } from "react";

export default function AppFrame({ children, stickyLauncher }: { children: React.ReactNode; stickyLauncher?: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const authPage = pathname === "/login" || pathname === "/setup" || pathname.startsWith("/login/") || pathname.startsWith("/setup/");

  if (authPage) return <>{children}</>;

  return (
    <>
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((current) => !current)} />
      <main className="asc-app-main" style={{ marginLeft: sidebarCollapsed ? "var(--asc-sidebar-collapsed)" : "var(--asc-sidebar-expanded)" }}>{children}</main>
      {stickyLauncher}
    </>
  );
}


