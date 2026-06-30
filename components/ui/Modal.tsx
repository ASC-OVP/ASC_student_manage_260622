import type { ReactNode } from "react";
import { classNames } from "@/components/ui/classNames";

export function Modal({
  title,
  description,
  children,
  footer,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div className="asc-modal-layer">
      <section className={classNames("asc-modal", className)} role="dialog" aria-modal="true" aria-labelledby="asc-modal-title">
        <header className="asc-modal__header">
          <h2 id="asc-modal-title">{title}</h2>
          {description && <p>{description}</p>}
        </header>
        <div className="asc-modal__body">{children}</div>
        {footer && <footer className="asc-modal__footer">{footer}</footer>}
      </section>
    </div>
  );
}
