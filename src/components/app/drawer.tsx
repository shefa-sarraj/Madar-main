import type { ReactNode } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type AppDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string | undefined;
  side?: "right" | "left";
  footer?: ReactNode;
  children: ReactNode;
};

/** Side panel used for record details and side forms. */
export function AppDrawer({
  open,
  onOpenChange,
  title,
  description,
  side = "right",
  footer,
  children,
}: AppDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        {...(!description ? { "aria-describedby": undefined } : {})}
        side={side}
        dir="rtl"
        className="w-full text-start sm:max-w-md"
      >
        <SheetHeader className="text-start">
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4">{children}</div>
        {footer ? <SheetFooter>{footer}</SheetFooter> : null}
      </SheetContent>
    </Sheet>
  );
}
