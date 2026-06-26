import type { CSSProperties } from "react";

export const page: CSSProperties = {
  padding: 12,
  color: "var(--asc-text)",
  background: "var(--asc-bg-subtle)",
  minHeight: "100vh",
};

export const container: CSSProperties = {
  width: "100%",
  maxWidth: "none",
  margin: 0,
};

export const narrowContainer: CSSProperties = {
  width: "100%",
  maxWidth: "none",
  margin: 0,
};

export const title: CSSProperties = {
  fontSize: 24,
  fontWeight: 900,
  margin: "0 0 4px",
  color: "var(--asc-text)",
};

export const desc: CSSProperties = {
  margin: "0 0 12px",
  color: "var(--asc-text-muted)",
  fontSize: 13,
};

export const card: CSSProperties = {
  background: "var(--asc-surface)",
  border: "1px solid var(--asc-border)",
  borderRadius: "var(--asc-radius-lg)",
  padding: 12,
  boxShadow: "var(--asc-shadow-sm)",
};

export const input: CSSProperties = {
  width: "100%",
  minHeight: 36,
  padding: "8px 10px",
  border: "1px solid var(--asc-border-strong)",
  borderRadius: "var(--asc-radius-md)",
  background: "var(--asc-bg)",
  color: "var(--asc-text)",
};

export const button: CSSProperties = {
  minHeight: 36,
  padding: "8px 12px",
  border: "1px solid var(--asc-primary)",
  borderRadius: "var(--asc-radius-md)",
  background: "var(--asc-primary)",
  color: "#ffffff",
  fontWeight: 900,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

export const lightButton: CSSProperties = {
  ...button,
  background: "var(--asc-primary-soft)",
  color: "var(--asc-primary-deep)",
  border: "1px solid var(--asc-primary)",
};

export const dangerButton: CSSProperties = {
  ...button,
  background: "var(--asc-danger)",
  borderColor: "var(--asc-danger)",
};

export const excelTable: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  background: "var(--asc-bg)",
  fontSize: 14,
};

export const excelTh: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 1,
  background: "var(--asc-secondary-soft)",
  color: "var(--asc-text)",
  border: "1px solid var(--asc-border)",
  padding: "9px 10px",
  textAlign: "left",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

export const excelTd: CSSProperties = {
  border: "1px solid var(--asc-border)",
  padding: "8px 10px",
  color: "var(--asc-text)",
  verticalAlign: "middle",
};

export const tableWrap: CSSProperties = {
  overflow: "auto",
  border: "1px solid var(--asc-border)",
  borderRadius: "var(--asc-radius-lg)",
  background: "var(--asc-bg)",
};
