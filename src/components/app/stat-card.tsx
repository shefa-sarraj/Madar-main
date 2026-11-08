import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value?: string | number | null | undefined;
  hint?: string | undefined;
  icon?: LucideIcon;
  accent?: boolean;
  className?: string;
};

/** Shows a real empty state when no value is available — never invented numbers. */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = false,
  className,
}: StatCardProps) {
  const hasValue = value !== null && value !== undefined && value !== "";

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-4 shadow-card transition-colors",
        accent && "border-gold/50",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon ? (
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg",
              accent ? "bg-gold/15 text-gold-foreground" : "bg-secondary text-primary",
            )}
          >
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      <p
        className={cn(
          "mt-3 break-words tnum",
          hasValue ? "text-2xl font-semibold text-foreground" : "text-sm text-muted-foreground",
        )}
      >
        {hasValue ? value : "لا توجد بيانات بعد"}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
