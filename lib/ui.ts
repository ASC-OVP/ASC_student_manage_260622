import type { CSSProperties } from "react";

export const page: CSSProperties = {
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

export const title: CSSProperties = {
  fontSize: 26,
  fontWeight: 900,
  margin: "0 0 8px",
};

export const desc: CSSProperties = {
  margin: "0 0 22px",
  color: "#6b7280",
};

export const card: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: 18,
  padding: 14,
  boxShadow: "0 8px 20px rgba(15,23,42,.06)",
};

export const input: CSSProperties = {
  width: "100%",
  padding: "11px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 10,
  background: "#ffffff",
  color: "#111827",
};

export const button: CSSProperties = {
  padding: "11px 14px",
  border: "none",
  borderRadius: 10,
  background: "#111827",
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
  background: "#ffffff",
  color: "#111827",
  border: "1px solid #d1d5db",
};

export const dangerButton: CSSProperties = {
  ...button,
  background: "#dc2626",
};

export const excelTable: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  background: "#ffffff",
  fontSize: 14,
};

export const excelTh: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 1,
  background: "#eef2ff",
  color: "#1f2937",
  border: "1px solid #cbd5e1",
  padding: "9px 10px",
  textAlign: "left",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

export const excelTd: CSSProperties = {
  border: "1px solid #dbe4ee",
  padding: "8px 10px",
  color: "#111827",
  verticalAlign: "middle",
};

export const tableWrap: CSSProperties = {
  overflow: "auto",
  border: "1px solid #cbd5e1",
  borderRadius: 14,
  background: "#ffffff",
};
