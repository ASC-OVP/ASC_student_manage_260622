import type { ReactNode } from "react";
import { classNames } from "@/components/ui/classNames";

export function Drawer({
  title,
  description,
  children,
  footer,
  position = "right",
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  position?: "right" | "bottom";
  className?: string;
}) {
  return (
    <div className="asc-drawer-layer">
      <section
        className={classNames("asc-drawer", `asc-drawer--${position}`, className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby="asc-drawer-title"
      >
        <header className="asc-drawer__header">
          <h2 id="asc-drawer-title">{title}</h2>
          {description && <p>{description}</p>}
        </header>
        <div className="asc-drawer__body">{children}</div>
        {footer && <footer className="asc-drawer__footer">{footer}</footer>}
      </section>
    </div>
  );
}
