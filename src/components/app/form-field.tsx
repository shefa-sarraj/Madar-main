import type { ReactNode } from "react";
import { useId } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FormFieldProps = {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  required?: boolean;
  className?: string;
  children: (props: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby"?: string;
    "aria-required": boolean;
  }) => ReactNode;
};

export function FormField({
  label,
  hint,
  error,
  required = false,
  className,
  children,
}: FormFieldProps) {
  const id = useId();

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children({
        id,
        "aria-invalid": !!error,
        "aria-required": required,
        ...(error || hint ? { "aria-describedby": `${id}-description` } : {}),
      })}
      {error ? (
        <p id={`${id}-description`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-description`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
