import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="asc-empty-state">
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {actions && <div className="asc-empty-state__actions">{actions}</div>}
    </div>
  );
}
