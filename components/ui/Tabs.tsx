import Link from "next/link";
import type { ReactNode } from "react";
import { classNames } from "@/components/ui/classNames";

export type TabItem = {
  label: ReactNode;
  href: string;
  active?: boolean;
  count?: ReactNode;
};

export function Tabs({ items, label = "화면 탭" }: { items: TabItem[]; label?: string }) {
  return (
    <nav className="asc-tabs" aria-label={label}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={classNames("asc-tabs__item", item.active && "asc-tabs__item--active")}
          aria-current={item.active ? "page" : undefined}
        >
          <span>{item.label}</span>
          {item.count !== undefined && <span className="asc-tabs__count">{item.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
