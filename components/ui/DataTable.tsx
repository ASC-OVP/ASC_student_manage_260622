import type { TableHTMLAttributes } from "react";
import { classNames } from "@/components/ui/classNames";

export type DataTableProps = TableHTMLAttributes<HTMLTableElement> & {
  dense?: boolean;
};

export function DataTable({ dense, className, ...props }: DataTableProps) {
  return (
    <div className="asc-table-wrap">
      <table className={classNames("asc-table", dense && "asc-table--dense", className)} {...props} />
    </div>
  );
}
