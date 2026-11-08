import { Search, X } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type FilterBarProps = {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  onReset?: () => void;
  children?: ReactNode;
};

export function FilterBar({
  searchValue = "",
  onSearchChange,
  searchPlaceholder = "بحث...",
  onReset,
  children,
}: FilterBarProps) {
  return (
    <div className="flex min-w-0 flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:flex-wrap sm:items-center">
      {onSearchChange ? (
        <div className="relative min-w-0 flex-1 sm:min-w-48">
          <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="pe-9"
          />
        </div>
      ) : null}
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
      {onReset ? (
        <Button variant="ghost" size="sm" onClick={onReset} className="gap-1 text-muted-foreground">
          <X className="size-4" />
          مسح
        </Button>
      ) : null}
    </div>
  );
}
