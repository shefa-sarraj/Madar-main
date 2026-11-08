import { Lock } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/app/empty-state";
import { FormField } from "@/components/app/form-field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

export const ALL = "all";

export function AccessDenied() {
  return (
    <EmptyState
      icon={Lock}
      title="لا تملك صلاحية الوصول"
      description="هذا القسم متاح لإدارة المدرسة وموظفي التسجيل فقط. تواصل مع مدير المدرسة إذا كنت بحاجة إلى صلاحية."
    />
  );
}

export function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
  noAll = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: (readonly [string, string] | string[])[];
  noAll?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-full min-w-32 sm:w-36" aria-label={placeholder}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {noAll ? null : <SelectItem value={ALL}>{placeholder}: الكل</SelectItem>}
        {options.map(([k, v]) => (
          <SelectItem key={k} value={k!}>
            {v}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function Section({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function InfoGrid({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="space-y-0.5">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="text-sm text-foreground">{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export type GuardianDraft = {
  full_name: string;
  relationship: string;
  phone: string;
  secondary_phone: string;
  email: string;
  address: string;
  occupation: string;
  notes: string;
};

export const emptyGuardian: GuardianDraft = {
  full_name: "",
  relationship: "",
  phone: "",
  secondary_phone: "",
  email: "",
  address: "",
  occupation: "",
  notes: "",
};

export function TextField({
  label,
  value,
  onChange,
  required,
  error,
  type = "text",
  ltr,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  error?: string | undefined;
  type?: string;
  ltr?: boolean;
  multiline?: boolean;
}) {
  return (
    <FormField label={label} required={required ?? false} {...(error ? { error } : {})}>
      {(props) =>
        multiline ? (
          <Textarea {...props} value={value} onChange={(e) => onChange(e.target.value)} rows={3} />
        ) : (
          <Input
            {...props}
            type={type}
            value={value}
            dir={ltr ? "ltr" : undefined}
            className={ltr ? "text-end" : undefined}
            onChange={(e) => onChange(e.target.value)}
          />
        )
      }
    </FormField>
  );
}

export function GuardianFields({
  value,
  onChange,
  errors = {},
}: {
  value: GuardianDraft;
  onChange: (value: GuardianDraft) => void;
  errors?: Partial<Record<keyof GuardianDraft, string>>;
}) {
  const set = (key: keyof GuardianDraft) => (v: string) => onChange({ ...value, [key]: v });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        label="اسم ولي الأمر"
        value={value.full_name}
        onChange={set("full_name")}
        required
        error={errors.full_name}
      />
      <TextField label="صلة القرابة" value={value.relationship} onChange={set("relationship")} />
      <TextField
        label="رقم الهاتف"
        value={value.phone}
        onChange={set("phone")}
        required
        error={errors.phone}
        ltr
        type="tel"
      />
      <TextField
        label="هاتف إضافي"
        value={value.secondary_phone}
        onChange={set("secondary_phone")}
        ltr
        type="tel"
      />
      <TextField
        label="البريد الإلكتروني"
        value={value.email}
        onChange={set("email")}
        ltr
        type="email"
        error={errors.email}
      />
      <TextField label="المهنة" value={value.occupation} onChange={set("occupation")} />
      <TextField label="العنوان" value={value.address} onChange={set("address")} />
      <TextField label="ملاحظات" value={value.notes} onChange={set("notes")} />
    </div>
  );
}

export function validateGuardian(g: GuardianDraft) {
  const errors: Partial<Record<keyof GuardianDraft, string>> = {};
  if (!g.full_name.trim()) errors.full_name = "اسم ولي الأمر مطلوب";
  if (!g.phone.trim()) errors.phone = "رقم الهاتف مطلوب";
  if (g.email.trim() && !/^\S+@\S+\.\S+$/.test(g.email.trim()))
    errors.email = "بريد إلكتروني غير صالح";
  return errors;
}

export function guardianPayload(g: GuardianDraft) {
  const n = (v: string) => (v.trim() ? v.trim() : null);
  return {
    full_name: g.full_name.trim(),
    relationship: n(g.relationship),
    phone: g.phone.trim(),
    secondary_phone: n(g.secondary_phone),
    email: n(g.email),
    address: n(g.address),
    occupation: n(g.occupation),
    notes: n(g.notes),
  };
}

/** Finds an existing guardian in the same school by phone or email to avoid duplicates. */
export async function findExistingGuardian(schoolId: string, phone: string, email: string) {
  const filters = [`phone.eq.${phone.trim()}`];
  if (email.trim()) filters.push(`email.ilike.${email.trim()}`);
  const { data } = await supabase
    .from("guardians")
    .select("id, full_name, phone, email")
    .eq("school_id", schoolId)
    .or(filters.join(","))
    .limit(1)
    .maybeSingle();
  return data;
}
