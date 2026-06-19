"use client";

import type { CSSProperties } from "react";

type Props = {
  label?: string;
  style?: CSSProperties;
  title?: string;
};

export default function CloseDetailsButton({ label = "닫기", style, title }: Props) {
  return (
    <button
      type="button"
      style={style}
      title={title ?? label}
      onClick={(event) => {
        const details = event.currentTarget.closest("details") as HTMLDetailsElement | null;
        if (details) details.open = false;
      }}
    >
      {label}
    </button>
  );
}
