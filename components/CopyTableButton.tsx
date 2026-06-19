"use client";

import { useState } from "react";
import type { CSSProperties } from "react";

export default function CopyTableButton({ targetId }: { targetId: string }) {
  const [copied, setCopied] = useState(false);

  async function copyTable() {
    const table = document.getElementById(targetId);
    if (!(table instanceof HTMLTableElement)) return;

    const rows = Array.from(table.rows).map((row) =>
      Array.from(row.cells)
        .map((cell) => cell.innerText.replace(/\s+/g, " ").trim())
        .join("\t")
    );

    await navigator.clipboard.writeText(rows.join("\n"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <button type="button" onClick={copyTable} style={buttonStyle}>
      {copied ? "복사됨" : "엑셀 복사"}
    </button>
  );
}

const buttonStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 8,
  background: "#ffffff",
  color: "#111827",
  padding: "8px 12px",
  fontWeight: 900,
};
