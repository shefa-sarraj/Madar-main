import type { ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string | undefined;
  footer?: ReactNode;
  children: ReactNode;
};

export function Modal({ open, onOpenChange, title, description, footer, children }: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        {...(!description ? { "aria-describedby": undefined } : {})}
        dir="rtl"
        className="max-w-lg text-start"
      >
        <DialogHeader className="text-start">
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="space-y-4">{children}</div>
        {footer ? (
          <DialogFooter className="gap-2 sm:flex-row-reverse sm:justify-start">
            {footer}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
