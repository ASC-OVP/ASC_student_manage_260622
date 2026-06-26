import type { CSSProperties } from "react";

export const page: CSSProperties = {
  minHeight: "100vh",
  padding: 12,
  color: "#111827",
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

export const header: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
};

export const title: CSSProperties = {
  fontSize: 24,
  fontWeight: 900,
  margin: "0 0 4px",
};

export const desc: CSSProperties = {
  margin: 0,
  color: "#6b7280",
  fontSize: 13,
};

export const card: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 12,
  boxShadow: "none",
};

export const button: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 36,
  padding: "8px 12px",
  border: "none",
  borderRadius: 8,
  background: "#111827",
  color: "#ffffff",
  fontWeight: 900,
  textDecoration: "none",
  cursor: "pointer",
};

export const secondaryButton: CSSProperties = {
  ...button,
  background: "#ffffff",
  color: "#111827",
  border: "1px solid #d1d5db",
};

export const dangerButton: CSSProperties = {
  ...button,
  background: "#dc2626",
};

export const input: CSSProperties = {
  width: "100%",
  minHeight: 36,
  padding: "8px 10px",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  background: "#ffffff",
  color: "#111827",
};

export const label: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
  fontWeight: 800,
};

export const form: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

export const backLink: CSSProperties = {
  display: "inline-block",
  marginBottom: 10,
  color: "var(--asc-primary-deep)",
  fontWeight: 800,
  textDecoration: "none",
};

export const excelWrap: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  overflow: "auto",
  boxShadow: "none",
};

export const table: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 14,
};

export const th: CSSProperties = {
  padding: "8px 10px",
  background: "#f3f4f6",
  border: "1px solid #d1d5db",
  textAlign: "left",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

export const td: CSSProperties = {
  padding: "8px 10px",
  border: "1px solid #e5e7eb",
  verticalAlign: "top",
};
