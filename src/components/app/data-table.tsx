import type { ReactNode } from "react";

import { EmptyState } from "@/components/app/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { TablePagination } from "@/components/app/table-pagination";
import { slicePage, usePagination, type PaginationControl } from "@/lib/pagination";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
};

type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: T) => void;
  pagination?: PaginationControl | boolean;
  paginationKey?: unknown;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  isLoading = false,
  emptyTitle,
  emptyDescription,
  onRowClick,
  pagination = false,
  paginationKey,
}: DataTableProps<T>) {
  const local = usePagination(paginationKey ?? rows.map(rowKey));
  const result = pagination === true ? slicePage(rows, local) : null;
  const visibleRows = result?.rows ?? rows;
  const controls =
    pagination === true ? { ...local, total: rows.length, page: result!.page } : pagination || null;
  if (isLoading) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="جار تحميل البيانات"
        className="space-y-2 rounded-lg border border-border bg-card p-4"
      >
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div>
        <EmptyState
          {...(emptyTitle ? { title: emptyTitle } : {})}
          {...(emptyDescription ? { description: emptyDescription } : {})}
        />
        {controls ? <TablePagination {...controls} /> : null}
      </div>
    );
  }

  return (
    <div
      aria-busy={controls?.loading || undefined}
      className="overflow-hidden rounded-lg border border-border bg-card shadow-card"
    >
      {controls?.loading ? (
        <p role="status" className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
          جارٍ تحميل النتائج...
        </p>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow className="bg-secondary/60 hover:bg-secondary/60">
            {columns.map((column) => (
              <TableHead
                key={column.key}
                className={cn(
                  "h-11 text-start text-xs font-semibold text-muted-foreground",
                  column.align === "end" && "text-end",
                  column.align === "center" && "text-center",
                  column.className,
                )}
              >
                {column.header || <span className="sr-only">الإجراءات</span>}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleRows.map((row) => (
            <TableRow
              key={rowKey(row)}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (
                        event.target === event.currentTarget &&
                        (event.key === "Enter" || event.key === " ")
                      ) {
                        event.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                onRowClick &&
                  "cursor-pointer focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2",
              )}
            >
              {columns.map((column) => (
                <TableCell
                  key={column.key}
                  className={cn(
                    "text-start text-sm",
                    column.align === "end" && "text-end",
                    column.align === "center" && "text-center",
                    column.className,
                  )}
                >
                  {column.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {controls ? <TablePagination {...controls} /> : null}
    </div>
  );
}
