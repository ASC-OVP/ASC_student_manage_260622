"use client";

import type { CSSProperties, ReactNode } from "react";

type Props = {
  children: ReactNode;
  message: string;
  style?: CSSProperties;
  disabled?: boolean;
  name?: string;
  value?: string;
};

export default function WorkConfirmSubmit({ children, message, style, disabled, name, value }: Props) {
  return (
    <button
      type="submit"
      style={style}
      disabled={disabled}
      name={name}
      value={value}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
