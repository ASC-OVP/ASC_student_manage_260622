import type { InputHTMLAttributes, ReactNode } from "react";
import { classNames } from "@/components/ui/classNames";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: ReactNode;
  helperText?: ReactNode;
  error?: ReactNode;
  containerClassName?: string;
};

export function Input({ label, helperText, error, className, containerClassName, id, name, ...props }: InputProps) {
  const controlId = id ?? name;
  const describedBy = [
    helperText && controlId ? `${controlId}-hint` : null,
    error && controlId ? `${controlId}-error` : null,
  ]
    .filter(Boolean)
    .join(" ") || undefined;

  return (
    <label className={classNames("asc-field", containerClassName)}>
      {label && <span className="asc-field__label">{label}</span>}
      <input
        id={controlId}
        name={name}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy}
        className={classNames("asc-input", className)}
        {...props}
      />
      {helperText && (
        <span id={controlId ? `${controlId}-hint` : undefined} className="asc-field__hint">
          {helperText}
        </span>
      )}
      {error && (
        <span id={controlId ? `${controlId}-error` : undefined} className="asc-field__error">
          {error}
        </span>
      )}
    </label>
  );
}
