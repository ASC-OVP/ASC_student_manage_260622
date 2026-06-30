import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { classNames } from "@/components/ui/classNames";

type ButtonVariant = "primary" | "secondary" | "tertiary" | "danger" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

type SharedButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & SharedButtonProps;

export function Button({
  variant = "primary",
  size = "md",
  fullWidth,
  leadingIcon,
  trailingIcon,
  className,
  type,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={buttonClassName({ variant, size, fullWidth, className })}
      {...props}
    >
      {leadingIcon && <span className="asc-button__icon">{leadingIcon}</span>}
      <span className="asc-button__label">{children}</span>
      {trailingIcon && <span className="asc-button__icon">{trailingIcon}</span>}
    </button>
  );
}

export type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> &
  SharedButtonProps & {
    href: string;
  };

export function ButtonLink({
  variant = "primary",
  size = "md",
  fullWidth,
  leadingIcon,
  trailingIcon,
  className,
  children,
  href,
  ...props
}: ButtonLinkProps) {
  return (
    <Link href={href} className={buttonClassName({ variant, size, fullWidth, className })} {...props}>
      {leadingIcon && <span className="asc-button__icon">{leadingIcon}</span>}
      <span className="asc-button__label">{children}</span>
      {trailingIcon && <span className="asc-button__icon">{trailingIcon}</span>}
    </Link>
  );
}

function buttonClassName({
  variant,
  size,
  fullWidth,
  className,
}: {
  variant: ButtonVariant;
  size: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}) {
  return classNames(
    "asc-button",
    `asc-button--${variant}`,
    `asc-button--${size}`,
    fullWidth && "asc-button--full",
    className
  );
}
