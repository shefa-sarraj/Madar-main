import { useEffect, useState } from "react";
import { FileUp, Pencil, Plus, RotateCcw, Save, XCircle } from "lucide-react";
import { toast } from "sonner";

import { AppDrawer } from "@/components/app/drawer";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FormField } from "@/components/app/form-field";
import { Modal } from "@/components/app/modal";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  COST_CENTER_TYPE,
  PAYMENT_METHOD,
  centsToStr,
  financeError,
  isValidMoney,
  todayISO,
  toCents,
  type CostCenter,
  type ExpenseCategory,
  type ExpenseRow,
} from "@/lib/finance";

type CostCenterType = Database["public"]["Enums"]["cost_center_type"];
const EMPTY_METHOD = "none";

type ExpenseDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string;
  yearId: string;
  currency: string;
  expense: ExpenseRow | null;
  categories: ExpenseCategory[];
  costCenters: CostCenter[];
  onSaved: () => void;
};

export function ExpenseDrawer({
  open,
  onOpenChange,
  schoolId,
  yearId,
  currency,
  expense,
  categories,
  costCenters,
  onSaved,
}: ExpenseDrawerProps) {
  const [date, setDate] = useState(todayISO());
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [title, setTitle] = useState("");
  const [costCenterId, setCostCenterId] = useState("none");
  const [reference, setReference] = useState("");
  const [method, setMethod] = useState(EMPTY_METHOD);
  const [notes, setNotes] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setDate(expense?.expense_date ?? todayISO());
    setCategoryId(expense?.expense_category_id ?? "");
    setAmount(expense ? centsToStr(toCents(expense.amount)) : "");
    setTitle(expense?.title ?? "");
    setCostCenterId(expense?.cost_center_id ?? "none");
    setReference(expense?.reference_number ?? "");
    setMethod(expense?.payment_method ?? EMPTY_METHOD);
    setNotes(expense?.description ?? "");
    setAttachment(null);
    setErrors({});
  }, [expense, open]);

  async function save() {
    const nextErrors: Record<string, string> = {};
    if (!date) nextErrors["date"] = "التاريخ مطلوب.";
    if (!categoryId) nextErrors["category"] = "اختر تصنيف المصروف.";
    if (!title.trim()) nextErrors["title"] = "أدخل وصفاً مختصراً.";
    if (!isValidMoney(amount)) nextErrors["amount"] = "أدخل مبلغاً صحيحاً أكبر من صفر.";
    if (attachment && attachment.size > 10 * 1024 * 1024)
      nextErrors["attachment"] = "الحد الأقصى لحجم الملف 10 ميغابايت.";
    if (
      attachment &&
      !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(attachment.type)
    ) {
      nextErrors["attachment"] = "ارفع ملف PDF أو صورة PNG/JPG/WEBP.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setBusy(true);
    const expenseId = expense?.id ?? crypto.randomUUID();
    const payload = {
      school_id: schoolId,
      academic_year_id: yearId,
      expense_category_id: categoryId,
      cost_center_id: costCenterId === "none" ? null : costCenterId,
      title: title.trim(),
      amount: Number(centsToStr(toCents(amount))),
      currency,
      expense_date: date,
      payment_method:
        method === EMPTY_METHOD ? null : (method as Database["public"]["Enums"]["payment_method"]),
      reference_number: reference.trim() || null,
      description: notes.trim() || null,
    };

    const result = expense
      ? await supabase
          .from("expenses")
          .update(payload)
          .eq("id", expense.id)
          .eq("school_id", schoolId)
      : await supabase.from("expenses").insert({ id: expenseId, ...payload });
    if (result.error) {
      toast.error(financeError(result.error));
      setBusy(false);
      return;
    }

    let attachmentFailed = false;
    if (attachment) {
      const safeName = attachment.name.replace(/[^\w.-]/g, "_");
      const path = [schoolId, "expenses", expenseId, crypto.randomUUID() + "-" + safeName].join(
        "/",
      );
      const upload = await supabase.storage.from("finance-attachments").upload(path, attachment);
      if (upload.error) {
        attachmentFailed = true;
      } else {
        const linked = await supabase
          .from("expenses")
          .update({ attachment_url: path })
          .eq("id", expenseId)
          .eq("school_id", schoolId);
        attachmentFailed = !!linked.error;
      }
    }

    setBusy(false);
    toast.success(expense ? "تم تحديث المصروف" : "تم تسجيل المصروف");
    if (attachmentFailed)
      toast.error("حُفظ المصروف، لكن تعذر إرفاق الملف. يمكنك المحاولة من التعديل.");
    onOpenChange(false);
    onSaved();
  }

  return (
    <AppDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={expense ? "تعديل المصروف" : "تسجيل مصروف"}
      description={
        expense ? expense.expense_number : "أدخل بيانات سند الصرف وأرفق الإيصال عند توفره."
      }
      side="left"
      footer={
        <div className="flex w-full gap-2">
          <Button onClick={() => void save()} disabled={busy} className="flex-1">
            <Save className="size-4" />
            {busy ? "جارٍ الحفظ..." : "حفظ"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            إلغاء
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="تاريخ المصروف" required error={errors["date"]}>
          {(props) => (
            <Input
              {...props}
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          )}
        </FormField>
        <FormField label="التصنيف" required error={errors["category"]}>
          {(props) => (
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id={props.id} aria-invalid={props["aria-invalid"]}>
                <SelectValue placeholder="اختر التصنيف" />
              </SelectTrigger>
              <SelectContent>
                {categories
                  .filter((category) => category.is_active || category.id === categoryId)
                  .map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      </div>
      <FormField label="الوصف المختصر" required error={errors["title"]}>
        {(props) => (
          <Input
            {...props}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="مثال: فاتورة الكهرباء لشهر سبتمبر"
          />
        )}
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={"المبلغ (" + currency + ")"} required error={errors["amount"]}>
          {(props) => (
            <Input
              {...props}
              dir="ltr"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
            />
          )}
        </FormField>
        <FormField label="مركز التكلفة">
          {(props) => (
            <Select value={costCenterId} onValueChange={setCostCenterId}>
              <SelectTrigger id={props.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">بدون مركز تكلفة</SelectItem>
                {costCenters
                  .filter((center) => center.is_active || center.id === costCenterId)
                  .map((center) => (
                    <SelectItem key={center.id} value={center.id}>
                      {center.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField label="رقم المرجع / الإيصال">
          {(props) => (
            <Input
              {...props}
              dir="ltr"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="INV-2026-001"
            />
          )}
        </FormField>
        <FormField label="طريقة الدفع">
          {(props) => (
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id={props.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={EMPTY_METHOD}>غير محددة</SelectItem>
                {Object.entries(PAYMENT_METHOD).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      </div>
      <FormField label="ملاحظات">
        {(props) => (
          <Textarea
            {...props}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="تفاصيل إضافية عن المصروف"
            rows={4}
          />
        )}
      </FormField>
      <FormField
        label={expense?.attachment_url ? "استبدال المرفق" : "إرفاق إيصال أو مستند"}
        error={errors["attachment"]}
        hint="PDF أو صورة، بحد أقصى 10 ميغابايت. الملف خاص ولا يُنشر للعامة."
      >
        {(props) => (
          <label
            htmlFor={props.id}
            className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-border p-3 text-sm hover:bg-secondary/40"
          >
            <FileUp className="size-5 text-primary" />
            <span className="min-w-0 flex-1 truncate">
              {attachment?.name ?? (expense?.attachment_url ? "اختر ملفاً بديلاً" : "اختر ملفاً")}
            </span>
            <Input
              id={props.id}
              type="file"
              accept=".pdf,image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(event) => setAttachment(event.target.files?.[0] ?? null)}
            />
          </label>
        )}
      </FormField>
    </AppDrawer>
  );
}

export function CancelExpenseDialog({
  expense,
  open,
  onOpenChange,
  onSaved,
}: {
  expense: ExpenseRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  async function cancel() {
    if (!expense) return;
    const { error } = await supabase
      .from("expenses")
      .update({ status: "cancelled" })
      .eq("id", expense.id)
      .eq("school_id", expense.school_id)
      .eq("status", "recorded");
    if (error) toast.error(financeError(error));
    else {
      toast.success("تم إلغاء المصروف دون حذفه");
      onOpenChange(false);
      onSaved();
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="إلغاء المصروف"
      description={
        "سيبقى " +
        (expense?.expense_number ?? "السند") +
        " محفوظاً في السجل ويُستبعد من الإجماليات."
      }
      confirmLabel="إلغاء المصروف"
      destructive
      onConfirm={() => void cancel()}
    />
  );
}

type SetupDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string;
  categories: ExpenseCategory[];
  costCenters: CostCenter[];
  onChanged: () => void;
};

export function ExpenseSetupDialog({
  open,
  onOpenChange,
  schoolId,
  categories,
  costCenters,
  onChanged,
}: SetupDialogProps) {
  const [categoryName, setCategoryName] = useState("");
  const [categoryEdit, setCategoryEdit] = useState<ExpenseCategory | null>(null);
  const [centerName, setCenterName] = useState("");
  const [centerType, setCenterType] = useState<CostCenterType>("custom");
  const [centerEdit, setCenterEdit] = useState<CostCenter | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveCategory() {
    if (!categoryName.trim()) {
      toast.error("أدخل اسم التصنيف");
      return;
    }
    setBusy(true);
    const result = categoryEdit
      ? await supabase
          .from("expense_categories")
          .update({ name: categoryName.trim() })
          .eq("id", categoryEdit.id)
          .eq("school_id", schoolId)
      : await supabase
          .from("expense_categories")
          .insert({ school_id: schoolId, name: categoryName.trim() });
    setBusy(false);
    if (result.error) {
      toast.error(financeError(result.error));
      return;
    }
    toast.success(categoryEdit ? "تم تحديث التصنيف" : "تمت إضافة التصنيف");
    setCategoryName("");
    setCategoryEdit(null);
    onChanged();
  }

  async function saveCenter() {
    if (!centerName.trim()) {
      toast.error("أدخل اسم مركز التكلفة");
      return;
    }
    setBusy(true);
    const payload = { name: centerName.trim(), type: centerType };
    const result = centerEdit
      ? await supabase
          .from("cost_centers")
          .update(payload)
          .eq("id", centerEdit.id)
          .eq("school_id", schoolId)
      : await supabase.from("cost_centers").insert({ school_id: schoolId, ...payload });
    setBusy(false);
    if (result.error) {
      toast.error(financeError(result.error));
      return;
    }
    toast.success(centerEdit ? "تم تحديث مركز التكلفة" : "تمت إضافة مركز التكلفة");
    setCenterName("");
    setCenterType("custom");
    setCenterEdit(null);
    onChanged();
  }

  async function toggle(table: "expense_categories" | "cost_centers", id: string, active: boolean) {
    const { error } = await supabase
      .from(table)
      .update({ is_active: !active })
      .eq("id", id)
      .eq("school_id", schoolId);
    if (error) toast.error(financeError(error));
    else {
      toast.success(active ? "تمت الأرشفة" : "تمت الاستعادة");
      onChanged();
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="إعدادات المصروفات"
      description="إدارة التصنيفات ومراكز التكلفة دون حذف السجلات التاريخية."
    >
      <Tabs defaultValue="categories" dir="rtl">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="categories">التصنيفات</TabsTrigger>
          <TabsTrigger value="centers">مراكز التكلفة</TabsTrigger>
        </TabsList>
        <TabsContent value="categories" className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
              placeholder="اسم التصنيف"
            />
            <Button
              size="icon"
              onClick={() => void saveCategory()}
              disabled={busy}
              title="حفظ التصنيف"
              aria-label="حفظ التصنيف"
            >
              {categoryEdit ? <Save className="size-4" /> : <Plus className="size-4" />}
            </Button>
          </div>
          <SetupRows
            rows={categories}
            onEdit={(row) => {
              setCategoryEdit(row);
              setCategoryName(row.name);
            }}
            onToggle={(row) => void toggle("expense_categories", row.id, row.is_active)}
          />
        </TabsContent>
        <TabsContent value="centers" className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
            <Input
              value={centerName}
              onChange={(event) => setCenterName(event.target.value)}
              placeholder="اسم مركز التكلفة"
            />
            <Select
              value={centerType}
              onValueChange={(value) => setCenterType(value as CostCenterType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(COST_CENTER_TYPE).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="icon"
              onClick={() => void saveCenter()}
              disabled={busy}
              title="حفظ مركز التكلفة"
              aria-label="حفظ مركز التكلفة"
            >
              {centerEdit ? <Save className="size-4" /> : <Plus className="size-4" />}
            </Button>
          </div>
          <SetupRows
            rows={costCenters}
            onEdit={(row) => {
              setCenterEdit(row);
              setCenterName(row.name);
              setCenterType(row.type);
            }}
            onToggle={(row) => void toggle("cost_centers", row.id, row.is_active)}
            detail={(row) => COST_CENTER_TYPE[row.type] ?? row.type}
          />
        </TabsContent>
      </Tabs>
    </Modal>
  );
}

function SetupRows<T extends { id: string; name: string; is_active: boolean }>({
  rows,
  onEdit,
  onToggle,
  detail,
}: {
  rows: T[];
  onEdit: (row: T) => void;
  onToggle: (row: T) => void;
  detail?: (row: T) => string;
}) {
  return (
    <div className="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
      {rows.length ? (
        rows.map((row) => (
          <div key={row.id} className="flex items-center gap-2 p-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{row.name}</p>
              {detail ? <p className="text-xs text-muted-foreground">{detail(row)}</p> : null}
            </div>
            <StatusBadge tone={row.is_active ? "success" : "neutral"}>
              {row.is_active ? "فعال" : "مؤرشف"}
            </StatusBadge>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onEdit(row)}
              title="تعديل"
              aria-label="تعديل"
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onToggle(row)}
              title={row.is_active ? "أرشفة" : "استعادة"}
              aria-label={row.is_active ? "أرشفة" : "استعادة"}
            >
              {row.is_active ? <XCircle className="size-4" /> : <RotateCcw className="size-4" />}
            </Button>
          </div>
        ))
      ) : (
        <p className="p-5 text-center text-sm text-muted-foreground">لا توجد عناصر بعد.</p>
      )}
    </div>
  );
}
