import type { ReactNode } from "react";

export function SectionHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="asc-section-header">
      <div className="asc-section-header__body">
        <h2 className="asc-section-header__title">{title}</h2>
        {description && <p className="asc-section-header__desc">{description}</p>}
      </div>
      {actions && <div className="asc-section-header__actions">{actions}</div>}
    </div>
  );
}
