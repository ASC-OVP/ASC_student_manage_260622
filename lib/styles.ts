import type { CSSProperties } from "react";

export const page: CSSProperties = {
  minHeight: "100vh",
  padding: 16,
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
  gap: 16,
  marginBottom: 22,
};

export const title: CSSProperties = {
  fontSize: 26,
  fontWeight: 900,
  margin: "0 0 8px",
};

export const desc: CSSProperties = {
  margin: 0,
  color: "#6b7280",
};

export const card: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: 18,
  padding: 14,
  boxShadow: "0 8px 20px rgba(15,23,42,.06)",
};

export const button: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "11px 16px",
  border: "none",
  borderRadius: 10,
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
  padding: "12px",
  border: "1px solid #d1d5db",
  borderRadius: 10,
  background: "#ffffff",
  color: "#111827",
};

export const label: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  fontWeight: 800,
};

export const form: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

export const backLink: CSSProperties = {
  display: "inline-block",
  marginBottom: 16,
  color: "#2563eb",
  fontWeight: 800,
  textDecoration: "none",
};

export const excelWrap: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #d1d5db",
  borderRadius: 14,
  overflow: "auto",
  boxShadow: "0 8px 20px rgba(15,23,42,.06)",
};

export const table: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 14,
};

export const th: CSSProperties = {
  padding: "12px 14px",
  background: "#f3f4f6",
  border: "1px solid #d1d5db",
  textAlign: "left",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

export const td: CSSProperties = {
  padding: "11px 14px",
  border: "1px solid #e5e7eb",
  verticalAlign: "top",
};
