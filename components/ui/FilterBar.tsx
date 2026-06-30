import type { FormHTMLAttributes, ReactNode } from "react";
import { classNames } from "@/components/ui/classNames";

export type FilterBarProps = FormHTMLAttributes<HTMLFormElement> & {
  actions?: ReactNode;
};

export function FilterBar({ className, children, actions, ...props }: FilterBarProps) {
  return (
    <form className={classNames("asc-filter-bar", className)} {...props}>
      <div className="asc-filter-bar__fields">{children}</div>
      {actions && <div className="asc-filter-bar__actions">{actions}</div>}
    </form>
  );
}
