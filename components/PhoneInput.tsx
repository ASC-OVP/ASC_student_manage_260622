"use client";

import type { CSSProperties, InputHTMLAttributes } from "react";
import { formatPhoneInput } from "@/lib/phone";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "defaultValue"> & {
  defaultValue?: string | null;
  style?: CSSProperties;
};

export default function PhoneInput({ defaultValue, onBlur, onPaste, ...props }: Props) {
  return (
    <input
      {...props}
      type="tel"
      defaultValue={formatPhoneInput(defaultValue)}
      inputMode="tel"
      onBlur={(event) => {
        event.currentTarget.value = formatPhoneInput(event.currentTarget.value);
        onBlur?.(event);
      }}
      onPaste={(event) => {
        window.setTimeout(() => {
          event.currentTarget.value = formatPhoneInput(event.currentTarget.value);
        }, 0);
        onPaste?.(event);
      }}
    />
  );
}
