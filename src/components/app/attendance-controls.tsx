import { Check, Circle, MessageSquare, RotateCcw, Save, UserCheck, UserX } from "lucide-react";

import { StatCard } from "@/components/app/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<string, string> = {
  present: "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-600",
  absent: "border-destructive bg-destructive text-destructive-foreground hover:bg-destructive",
  late: "border-amber-500 bg-amber-500 text-amber-950 hover:bg-amber-500",
  excused: "border-sky-600 bg-sky-600 text-white hover:bg-sky-600",
  leave: "border-sky-600 bg-sky-600 text-white hover:bg-sky-600",
};

export function AttendanceStatusPicker<T extends string>({
  value,
  options,
  onChange,
  disabled,
  label,
}: {
  value: T | null;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div
      className="grid min-w-0 grid-cols-4 overflow-hidden rounded-md border border-border"
      role="group"
      aria-label={label}
    >
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "min-h-10 border-e border-border px-1 py-2 text-xs font-medium transition-colors last:border-e-0 hover:bg-secondary focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60",
              active && STATUS_STYLE[option.value],
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function AttendanceSummary({
  entries,
  percentage,
}: {
  entries: Array<{ key: string; label: string; value: number }>;
  percentage: number | null;
}) {
  return (
    <section aria-label="ملخص الحضور" className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {entries.map((entry, index) => (
        <StatCard
          key={entry.key}
          label={entry.label}
          value={entry.value}
          accent={index === 0}
          className="min-w-0 p-2.5 shadow-none [&>p]:mt-1 [&>p]:text-lg [&>div>p]:text-xs"
        />
      ))}
      <StatCard
        label="نسبة الحضور"
        value={percentage === null ? null : `${percentage}%`}
        className="col-span-2 min-w-0 p-2.5 shadow-none sm:col-span-1 [&>p]:mt-1 [&>p]:text-lg [&>div>p]:text-xs"
      />
    </section>
  );
}

export function AttendanceListHeader({
  total,
  shown,
  noun,
  selectedCount,
  unsavedCount,
  saving,
  canManage,
  onSave,
  onAllPresent,
  onSelectedAbsent,
  onReset,
}: {
  total: number;
  shown: number;
  noun: string;
  selectedCount: number;
  unsavedCount: number;
  saving: boolean;
  canManage: boolean;
  onSave: () => void;
  onAllPresent: () => void;
  onSelectedAbsent: () => void;
  onReset: () => void;
}) {
  return (
    <header className="sticky top-0 z-10 space-y-2 border-b border-border bg-card px-3 py-2.5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-xs text-muted-foreground">
            <span dir="ltr" className="tnum inline-block">
              {shown} / {total}
            </span>{" "}
            {noun}
          </p>
          <p
            role="status"
            aria-live="polite"
            className={cn(
              "flex items-center gap-1.5 text-xs",
              unsavedCount ? "font-medium text-amber-700" : "text-muted-foreground",
            )}
          >
            {unsavedCount ? (
              <Circle className="size-2 fill-current" />
            ) : (
              <Check className="size-3" />
            )}
            {unsavedCount
              ? `${unsavedCount} ${unsavedCount === 1 ? "تغيير غير محفوظ" : "تغييرات غير محفوظة"}`
              : "لا توجد تغييرات غير محفوظة"}
          </p>
        </div>
        {canManage ? (
          <Button
            size="sm"
            onClick={onSave}
            disabled={saving || !unsavedCount}
            variant={unsavedCount ? "default" : "outline"}
          >
            <Save className="size-4" />{" "}
            {saving ? "جارٍ الحفظ..." : unsavedCount ? `حفظ (${unsavedCount})` : "حفظ"}
          </Button>
        ) : null}
      </div>
      {canManage ? (
        <div
          role="group"
          aria-label="إجراءات الحضور الجماعية"
          className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2"
        >
          <Button size="sm" variant="outline" onClick={onAllPresent} disabled={saving || !total}>
            <UserCheck className="size-4" /> الكل حاضر
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onSelectedAbsent}
            disabled={saving || !selectedCount}
          >
            <UserX className="size-4" /> المحدد غائب{selectedCount ? ` (${selectedCount})` : ""}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            title="التراجع عن التغييرات"
            aria-label="التراجع عن التغييرات"
            onClick={onReset}
            disabled={saving || !unsavedCount}
          >
            <RotateCcw className="size-4" />
          </Button>
        </div>
      ) : null}
    </header>
  );
}

export function AttendanceNote({
  value,
  onChange,
  disabled,
  name,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  name: string;
}) {
  return (
    <details className="min-w-0 text-xs text-muted-foreground">
      <summary className="w-fit cursor-pointer rounded-sm py-1 focus-visible:outline focus-visible:outline-ring">
        <span className="inline-flex items-center gap-1">
          <MessageSquare className="size-3.5" />
          {value ? "ملاحظة مضافة" : "ملاحظة"}
        </span>
      </summary>
      <Input
        className="mt-1 h-9 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder="ملاحظة اختيارية"
        aria-label={`ملاحظة ${name}`}
      />
    </details>
  );
}
