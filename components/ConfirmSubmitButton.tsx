"use client";

import type { CSSProperties, MouseEvent, ReactNode } from "react";

type Props = {
  message: string;
  children: ReactNode;
  style?: CSSProperties;
  disabled?: boolean;
};

export default function ConfirmSubmitButton({ message, children, style, disabled }: Props) {
  function onClick(event: MouseEvent<HTMLButtonElement>) {
    if (!window.confirm(message)) event.preventDefault();
  }

  return (
    <button type="submit" onClick={onClick} style={style} disabled={disabled}>
      {children}
    </button>
  );
}
