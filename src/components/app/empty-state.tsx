import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
};

export function EmptyState({
  icon: Icon,
  title = "لا توجد بيانات بعد",
  description,
  action,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/60 text-center",
        compact ? "gap-2 px-4 py-6" : "gap-3 px-6 py-12",
        className,
      )}
    >
      {Icon ? (
        <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-primary">
          <Icon aria-hidden="true" className="size-5" />
        </span>
      ) : null}
      <p className="max-w-full break-words text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
      ) : null}
      {action}
    </div>
  );
}
