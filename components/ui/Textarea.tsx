import type { ReactNode, TextareaHTMLAttributes } from "react";
import { classNames } from "@/components/ui/classNames";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: ReactNode;
  helperText?: ReactNode;
  error?: ReactNode;
  containerClassName?: string;
};

export function Textarea({ label, helperText, error, className, containerClassName, id, name, ...props }: TextareaProps) {
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
      <textarea
        id={controlId}
        name={name}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy}
        className={classNames("asc-textarea", className)}
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
