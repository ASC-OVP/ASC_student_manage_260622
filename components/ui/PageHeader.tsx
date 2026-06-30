import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="asc-page-header">
      <div className="asc-page-header__body">
        {eyebrow && <p className="asc-page-header__eyebrow">{eyebrow}</p>}
        <h1 className="asc-page-header__title">{title}</h1>
        {description && <p className="asc-page-header__desc">{description}</p>}
        {meta && <div className="asc-page-header__meta">{meta}</div>}
      </div>
      {actions && <div className="asc-page-header__actions">{actions}</div>}
    </header>
  );
}
