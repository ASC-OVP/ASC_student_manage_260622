import type { HTMLAttributes } from "react";
import { classNames } from "@/components/ui/classNames";

export type CardProps = HTMLAttributes<HTMLElement> & {
  as?: "section" | "article" | "div";
  density?: "normal" | "compact";
};

export function Card({ as: Component = "section", density = "normal", className, ...props }: CardProps) {
  return <Component className={classNames("asc-card", density === "compact" && "asc-card--compact", className)} {...props} />;
}
