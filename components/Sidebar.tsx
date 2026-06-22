"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";

const menus = [
  { name: "\uB300\uC2DC\uBCF4\uB4DC", href: "/dashboard", icon: "D" },
  { name: "\uD559\uC0DD \uD604\uD669\uD310", href: "/students", icon: "S" },
  { name: "\uBC18 \uAD00\uB9AC", href: "/classes", icon: "C" },
  { name: "\uCE98\uB9B0\uB354", href: "/calendar", icon: "K" },
  { name: "\uBA54\uBAA8 \uAD00\uB9AC", href: "/memos", icon: "M" },
  { name: "\uC5C5\uBB34 \uAD00\uB9AC", href: "/tasks", icon: "T" },
  { name: "\uADFC\uBB34/\uAE09\uC5EC", href: "/work", icon: "W" },
  { name: "OMR \uAC80\uC0AC", href: "/omr", icon: "O" },
  { name: "\uC6B4\uC601 \uC548\uC815\uD654", href: "/operations", icon: "B" },
  { name: "\uC9C1\uC6D0/\uACC4\uC815", href: "/users", icon: "U" },
];

type SidebarProps = {
  academyName?: string;
  userName?: string;
  role?: string;
  collapsed?: boolean;
  onToggle?: () => void;
};

export default function Sidebar({ academyName, userName, role, collapsed = false, onToggle }: SidebarProps = {}) {
  const pathname = usePathname();

  return (
    <aside style={{ ...sidebarStyle, ...(collapsed ? sidebarCollapsedStyle : {}) }}>
      <div style={collapsed ? brandCollapsedStyle : brandStyle}>
        {!collapsed && (
          <div style={brandText}>
            <div style={logoStyle}>ASC</div>
            <div style={subStyle}>{academyName ?? "\uD559\uC6D0 \uC6B4\uC601 \uBCF4\uB4DC"}</div>
          </div>
        )}
        {onToggle && (
          <button
            type="button"
            className="sidebar-toggle"
            onClick={onToggle}
            style={toggleStyle}
            aria-label={collapsed ? "\uBA54\uB274 \uD3BC\uCE58\uAE30" : "\uBA54\uB274 \uC811\uAE30"}
          >
            {collapsed ? ">" : "<"}
          </button>
        )}
      </div>

      <nav style={navStyle}>
        {menus.map((menu) => {
          const active = pathname === menu.href || pathname.startsWith(`${menu.href}/`);
          return (
            <Link
              key={menu.href}
              href={menu.href}
              className="sidebar-link"
              title={collapsed ? menu.name : undefined}
              onMouseDown={(event) => event.currentTarget.blur()}
              onClick={(event) => event.currentTarget.blur()}
              style={{ ...menuStyle, ...(collapsed ? menuCollapsedStyle : {}), ...(active ? activeStyle : {}) }}
            >
              <span style={{ ...iconStyle, ...(active ? activeIconStyle : {}) }}>{menu.icon}</span>
              {!collapsed && <span style={menuTextStyle}>{menu.name}</span>}
            </Link>
          );
        })}
      </nav>

      <div style={collapsed ? bottomCollapsedStyle : bottomStyle}>
        {userName && !collapsed && (
          <div style={userStyle}>
            <b>{userName}</b>
            {role && <span>{formatRole(role)}</span>}
          </div>
        )}
        <Link
          href="/logout"
          className="sidebar-link"
          onMouseDown={(event) => event.currentTarget.blur()}
          onClick={(event) => event.currentTarget.blur()}
          style={collapsed ? logoutCollapsedStyle : logoutStyle}
          title={collapsed ? "\uB85C\uADF8\uC544\uC6C3" : undefined}
        >
          {collapsed ? "X" : "\uB85C\uADF8\uC544\uC6C3"}
        </Link>
      </div>
    </aside>
  );
}

function formatRole(role: string) {
  if (role === "ADMIN") return "\uAD00\uB9AC\uC790";
  if (role === "MANAGER") return "\uC2E4\uC7A5";
  if (role === "TEACHER") return "\uAC15\uC0AC";
  if (role === "ASSISTANT") return "\uC870\uAD50";
  return role;
}

const sidebarStyle: CSSProperties = {
  width: 236,
  minHeight: "100vh",
  background: "#111827",
  color: "#fff",
  padding: "16px 12px",
  position: "fixed",
  left: 0,
  top: 0,
  zIndex: 10,
  display: "flex",
  flexDirection: "column",
  transition: "width 160ms ease, padding 160ms ease",
  borderRight: "1px solid rgba(255,255,255,.08)",
};
const sidebarCollapsedStyle: CSSProperties = { width: 64, padding: "12px 8px" };
const brandStyle: CSSProperties = { position: "relative", minHeight: 58, padding: "4px 34px 14px 6px", display: "flex", alignItems: "center" };
const brandCollapsedStyle: CSSProperties = { position: "relative", minHeight: 42, padding: "0 0 10px", display: "grid", placeItems: "center" };
const brandText: CSSProperties = { minWidth: 0 };
const logoStyle: CSSProperties = { fontSize: 28, fontWeight: 950, letterSpacing: 0 };
const subStyle: CSSProperties = { color: "#9ca3af", fontSize: 12, marginTop: 3, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const toggleStyle: CSSProperties = {
  position: "absolute",
  right: 6,
  top: 7,
  width: 26,
  height: 26,
  border: "1px solid rgba(255,255,255,.2)",
  borderRadius: 7,
  background: "rgba(255,255,255,.08)",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
};
const navStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 5 };
const menuStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 12px",
  borderRadius: 8,
  color: "#d1d5db",
  textDecoration: "none",
  fontWeight: 850,
  border: "none",
  outline: "none",
  boxShadow: "none",
};
const menuCollapsedStyle: CSSProperties = { justifyContent: "center", gap: 0, padding: "9px 0" };
const activeStyle: CSSProperties = { background: "#1d4ed8", color: "#fff" };
const iconStyle: CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 7,
  display: "inline-grid",
  placeItems: "center",
  background: "rgba(255,255,255,.08)",
  color: "#cbd5e1",
  fontSize: 12,
  fontWeight: 950,
  flex: "0 0 auto",
};
const activeIconStyle: CSSProperties = { background: "rgba(255,255,255,.18)", color: "#fff" };
const menuTextStyle: CSSProperties = { whiteSpace: "nowrap" };
const bottomStyle: CSSProperties = { marginTop: "auto", padding: "12px 6px" };
const bottomCollapsedStyle: CSSProperties = { marginTop: "auto", padding: "8px 0", display: "grid", placeItems: "center" };
const userStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 4, color: "#d1d5db", fontSize: 13, padding: "0 6px 10px" };
const logoutStyle: CSSProperties = { display: "block", color: "#fecaca", textDecoration: "none", fontWeight: 900, padding: "9px 6px", outline: "none", boxShadow: "none" };
const logoutCollapsedStyle: CSSProperties = { ...logoutStyle, width: 32, textAlign: "center", padding: 7, borderRadius: 8, background: "rgba(255,255,255,.06)" };
