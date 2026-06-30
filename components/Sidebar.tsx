"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";

const menus = [
  { name: "\uB300\uC2DC\uBCF4\uB4DC", href: "/dashboard", icon: "dashboard" },
  { name: "\uD559\uC0DD \uD604\uD669\uD310", href: "/students", icon: "students" },
  { name: "\uBC18 \uAD00\uB9AC", href: "/classes", icon: "classes" },
  { name: "\uCE98\uB9B0\uB354", href: "/calendar", icon: "calendar" },
  { name: "\uBA54\uBAA8 \uAD00\uB9AC", href: "/memos", icon: "memos" },
  { name: "\uC5C5\uBB34 \uAD00\uB9AC", href: "/tasks", icon: "tasks" },
  { name: "\uBB38\uC790 \uBC1C\uC1A1", href: "/messages", icon: "messages" },
  { name: "\uADFC\uBB34/\uAE09\uC5EC", href: "/work", icon: "work" },
  { name: "OMR \uAC80\uC0AC", href: "/omr", icon: "omr" },
  { name: "\uC6B4\uC601 \uC548\uC815\uD654", href: "/operations", icon: "operations" },
  { name: "\uC9C1\uC6D0/\uACC4\uC815", href: "/users", icon: "users" },
] as const;

type MenuIconName = (typeof menus)[number]["icon"] | "logout";

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
              aria-label={menu.name}
              aria-current={active ? "page" : undefined}
              onMouseDown={(event) => event.currentTarget.blur()}
              onClick={(event) => event.currentTarget.blur()}
              style={{ ...menuStyle, ...(collapsed ? menuCollapsedStyle : {}), ...(active ? activeStyle : {}) }}
            >
              <span style={{ ...iconStyle, ...(active ? activeIconStyle : {}) }}>{renderMenuIcon(menu.icon)}</span>
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
          title={collapsed ? "로그아웃" : undefined}
          aria-label="로그아웃"
        >
          <span style={logoutIconStyle}>{renderMenuIcon("logout")}</span>
          {!collapsed && <span>로그아웃</span>}
        </Link>
      </div>
    </aside>
  );
}

function renderMenuIcon(icon: MenuIconName) {
  const icons: Record<MenuIconName, ReactNode> = {
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    students: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
        <circle cx="9.5" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    classes: (
      <>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z" />
        <path d="M8 6h8" />
      </>
    ),
    calendar: (
      <>
        <path d="M8 2v4" />
        <path d="M16 2v4" />
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M3 10h18" />
        <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
      </>
    ),
    memos: (
      <>
        <path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8z" />
        <path d="M16 3v5h5" />
        <path d="M7 13h10" />
        <path d="M7 17h7" />
      </>
    ),
    tasks: (
      <>
        <path d="M9 11l2 2 4-4" />
        <path d="M9 17l2 2 4-4" />
        <path d="M4 5h16" />
        <path d="M4 11h2" />
        <path d="M4 17h2" />
      </>
    ),
    messages: (
      <>
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
        <path d="M8 9h8" />
        <path d="M8 13h5" />
        <path d="M15 13l3-3" />
        <path d="M18 10v4h-4" />
      </>
    ),
    work: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    omr: (
      <>
        <path d="M9 11l2 2 4-4" />
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 17h8" />
        <path d="M8 7h3" />
      </>
    ),
    operations: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
      </>
    ),
    users: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
        <path d="M19 8h3" />
        <path d="M20.5 6.5v3" />
      </>
    ),
    logout: (
      <>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="M16 17l5-5-5-5" />
        <path d="M21 12H9" />
      </>
    ),
  };

  return (
    <svg viewBox="0 0 24 24" style={svgIconStyle} aria-hidden="true" focusable="false">
      {icons[icon]}
    </svg>
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
  width: "var(--asc-sidebar-expanded)",
  minHeight: "100vh",
  background: "var(--asc-sidebar-bg)",
  color: "var(--asc-sidebar-active-text)",
  padding: "14px 10px",
  position: "fixed",
  left: 0,
  top: 0,
  zIndex: 10,
  display: "flex",
  flexDirection: "column",
  transition: "width 180ms ease, padding 180ms ease",
  borderRight: "1px solid rgba(255,255,255,.08)",
};
const sidebarCollapsedStyle: CSSProperties = { width: "var(--asc-sidebar-collapsed)", padding: "10px 7px" };
const brandStyle: CSSProperties = { position: "relative", minHeight: 52, padding: "2px 32px 10px 6px", display: "flex", alignItems: "center" };
const brandCollapsedStyle: CSSProperties = { position: "relative", minHeight: 36, padding: "0 0 8px", display: "grid", placeItems: "center" };
const brandText: CSSProperties = { minWidth: 0 };
const logoStyle: CSSProperties = { fontSize: 27, fontWeight: 950, letterSpacing: 0, color: "var(--asc-sidebar-active-text)" };
const subStyle: CSSProperties = { color: "var(--asc-sidebar-muted)", fontSize: 12, marginTop: 3, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const toggleStyle: CSSProperties = {
  position: "absolute",
  right: 6,
  top: 7,
  width: 26,
  height: 26,
  border: "1px solid rgba(255,255,255,.22)",
  borderRadius: 8,
  background: "rgba(255,255,255,.08)",
  color: "var(--asc-sidebar-active-text)",
  fontWeight: 950,
  cursor: "pointer",
};
const navStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 5 };
const menuStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "9px 10px",
  borderRadius: 8,
  color: "var(--asc-sidebar-text)",
  textDecoration: "none",
  fontWeight: 850,
  border: 0,
  outline: "none",
  boxShadow: "none",
};
const menuCollapsedStyle: CSSProperties = { justifyContent: "center", gap: 0, padding: "8px 0" };
const activeStyle: CSSProperties = { background: "var(--asc-sidebar-active-bg)", color: "var(--asc-sidebar-active-text)" };
const iconStyle: CSSProperties = {
  width: 21,
  height: 21,
  borderRadius: 7,
  display: "inline-grid",
  placeItems: "center",
  background: "rgba(255,255,255,.08)",
  color: "var(--asc-sidebar-text)",
  flex: "0 0 auto",
};
const activeIconStyle: CSSProperties = { background: "var(--asc-primary)", color: "#fff" };
const svgIconStyle: CSSProperties = {
  width: 17,
  height: 17,
  display: "block",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};
const menuTextStyle: CSSProperties = { whiteSpace: "nowrap" };
const bottomStyle: CSSProperties = { marginTop: "auto", padding: "12px 6px" };
const bottomCollapsedStyle: CSSProperties = { marginTop: "auto", padding: "8px 0", display: "grid", placeItems: "center" };
const userStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 4, color: "var(--asc-sidebar-text)", fontSize: 13, padding: "0 6px 10px" };
const logoutStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 10, color: "#fecaca", textDecoration: "none", fontWeight: 900, padding: "9px 6px", outline: "none", boxShadow: "none", borderRadius: 8 };
const logoutIconStyle: CSSProperties = { ...iconStyle, background: "rgba(222,52,18,.12)", color: "#fecaca" };
const logoutCollapsedStyle: CSSProperties = { ...logoutStyle, width: 32, justifyContent: "center", padding: 7, borderRadius: 8, background: "rgba(255,255,255,.06)" };

