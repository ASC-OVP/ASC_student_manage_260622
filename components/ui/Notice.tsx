import type { ReactNode } from "react";
import { classNames } from "@/components/ui/classNames";

export type NoticeTone = "info" | "success" | "warning" | "danger";

export function Notice({
  tone = "info",
  title,
  children,
}: {
  tone?: NoticeTone;
  title?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={classNames("asc-notice", `asc-notice--${tone}`)} role={tone === "danger" ? "alert" : "status"}>
      {title && <strong className="asc-notice__title">{title}</strong>}
      <div className="asc-notice__body">{children}</div>
    </div>
  );
}
