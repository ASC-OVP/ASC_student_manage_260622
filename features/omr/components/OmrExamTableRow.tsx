"use client";

import type { MouseEvent, ReactNode } from "react";

type Props = {
  href: string;
  selected?: boolean;
  children: ReactNode;
};

export default function OmrExamTableRow({ href, selected = false, children }: Props) {
  function handleClick(event: MouseEvent<HTMLTableRowElement>) {
    const target = event.target as HTMLElement | null;
    if (target?.closest("a,button,input,select,textarea,label,form")) return;
    window.location.href = href;
  }

  return (
    <tr
      onClick={handleClick}
      style={{
        background: selected ? "var(--asc-primary-soft)" : undefined,
        cursor: "pointer",
      }}
    >
      {children}
    </tr>
  );
}
