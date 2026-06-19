"use client";

import type { CSSProperties } from "react";

export default function BackButton({ label = "뒤로가기" }: { label?: string }) {
  return <button type="button" onClick={() => history.back()} style={style}>← {label}</button>;
}

const style: CSSProperties = {
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  borderRadius: 10,
  padding: "10px 14px",
  fontWeight: 900,
  cursor: "pointer",
};
