import type { HTMLAttributes } from "react";
import { classNames } from "@/components/ui/classNames";

export type BadgeTone = "gray" | "blue" | "green" | "yellow" | "red" | "navy";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

export function Badge({ tone = "gray", className, children, ...props }: BadgeProps) {
  return (
    <span className={classNames("asc-badge", `asc-badge--${tone}`, className)} {...props}>
      {children}
    </span>
  );
}
