import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PAGE_SIZES, pageCount, type PageSize, type PaginationControl } from "@/lib/pagination";

export function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  loading,
}: PaginationControl) {
  const pages = pageCount(total, pageSize);
  const current = Math.min(page, pages);
  const numbers = [...new Set([1, current - 1, current, current + 1, pages])]
    .filter((value) => value >= 1 && value <= pages)
    .sort((a, b) => a - b);
  return (
    <nav
      aria-label="صفحات النتائج"
      dir="rtl"
      className="no-print flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-3 text-xs"
    >
      <p role="status" aria-live="polite" className="text-muted-foreground">
        عرض{" "}
        <span dir="ltr" className="tnum inline-block font-medium text-foreground">
          {total ? (current - 1) * pageSize + 1 : 0}–{Math.min(current * pageSize, total)}
        </span>{" "}
        من <span className="tnum font-medium text-foreground">{total}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-muted-foreground">
          لكل صفحة
          <select
            aria-label="عدد السجلات لكل صفحة"
            value={pageSize}
            disabled={loading}
            onChange={(event) => onPageSizeChange(Number(event.target.value) as PageSize)}
            className="h-8 rounded-md border border-input bg-background px-2 text-foreground"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="outline"
            className="size-8"
            aria-label="الصفحة السابقة"
            title="الصفحة السابقة"
            disabled={loading || current <= 1}
            onClick={() => onPageChange(current - 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
          {numbers.map((number, index) => (
            <span
              key={number}
              className={
                number !== 1 && number !== current && number !== pages
                  ? "hidden items-center gap-1 sm:flex"
                  : "flex items-center gap-1"
              }
            >
              {index > 0 && number > numbers[index - 1]! + 1 ? (
                <span aria-hidden="true">...</span>
              ) : null}
              <Button
                size="icon"
                variant={current === number ? "default" : "outline"}
                className="tnum size-8"
                aria-label={`الصفحة ${number}`}
                aria-current={current === number ? "page" : undefined}
                disabled={loading}
                onClick={() => onPageChange(number)}
              >
                {number}
              </Button>
            </span>
          ))}
          <Button
            size="icon"
            variant="outline"
            className="size-8"
            aria-label="الصفحة التالية"
            title="الصفحة التالية"
            disabled={loading || current >= pages}
            onClick={() => onPageChange(current + 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
        </div>
      </div>
    </nav>
  );
}
