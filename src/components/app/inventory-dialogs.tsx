import { useEffect, useMemo, useState } from "react";
import { Archive, Pencil, Plus, RotateCcw, Save, Tags } from "lucide-react";
import { toast } from "sonner";

import { AppDrawer } from "@/components/app/drawer";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FormField } from "@/components/app/form-field";
import { Modal } from "@/components/app/modal";
import { StatusBadge } from "@/components/app/status-badge";
import { ALL, FilterSelect } from "@/components/app/student-shared";
import { Button } from "@/components/ui/button";
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
import {
  INVENTORY_MOVEMENT,
  formatQuantity,
  inventoryError,
  movementImpact,
  type InventoryCategory,
  type InventoryItem,
  type InventoryMovement,
  type InventoryMovementType,
} from "@/lib/inventory";
import { formatDate } from "@/lib/students";
import { TablePagination } from "@/components/app/table-pagination";
import { slicePage, usePagination } from "@/lib/pagination";

const today = () => new Date().toISOString().slice(0, 10);

export function InventoryItemDrawer({
  open,
  onOpenChange,
  schoolId,
  item,
  categories,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string;
  item: InventoryItem | null;
  categories: InventoryCategory[];
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [unit, setUnit] = useState("");
  const [itemCode, setItemCode] = useState("");
  const [minimumStock, setMinimumStock] = useState("0");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? "");
    setCategoryId(item?.category_id ?? categories.find((category) => category.is_active)?.id ?? "");
    setUnit(item?.unit ?? "قطعة");
    setItemCode(item?.item_code ?? "");
    setMinimumStock(String(item?.minimum_stock ?? 0));
    setOpeningBalance("0");
    setLocation(item?.storage_location ?? "");
    setDescription(item?.description ?? "");
    setErrors({});
  }, [categories, item, open]);

  async function save() {
    const nextErrors: Record<string, string> = {};
    const minimum = Number(minimumStock);
    const opening = Number(openingBalance);
    if (!name.trim()) nextErrors["name"] = "اسم الصنف مطلوب.";
    if (!categoryId) nextErrors["category"] = "اختر التصنيف.";
    if (!unit.trim()) nextErrors["unit"] = "وحدة القياس مطلوبة.";
    if (!itemCode.trim()) nextErrors["code"] = "رمز الصنف مطلوب.";
    if (!Number.isFinite(minimum) || minimum < 0) nextErrors["minimum"] = "أدخل حداً أدنى صالحاً.";
    if (!item && (!Number.isFinite(opening) || opening < 0))
      nextErrors["opening"] = "أدخل رصيداً افتتاحياً صالحاً.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setBusy(true);
    const result = item
      ? await supabase
          .from("inventory_items")
          .update({
            name: name.trim(),
            category_id: categoryId,
            unit: unit.trim(),
            minimum_stock: minimum,
            storage_location: location.trim() || null,
            description: description.trim() || null,
          })
          .eq("id", item.id)
          .eq("school_id", schoolId)
      : await supabase.rpc("create_inventory_item", {
          _school_id: schoolId,
          _category_id: categoryId,
          _item_code: itemCode.trim(),
          _name: name.trim(),
          _unit: unit.trim(),
          _minimum_stock: minimum,
          _opening_balance: opening,
          _storage_location: location.trim(),
          _description: description.trim(),
        });
    setBusy(false);
    if (result.error) {
      toast.error(inventoryError(result.error));
      return;
    }
    toast.success(item ? "تم تحديث الصنف" : "تم إنشاء الصنف ورصيده الافتتاحي");
    onOpenChange(false);
    onSaved();
  }

  return (
    <AppDrawer
      open={open}
      onOpenChange={onOpenChange}
      side="left"
      title={item ? "تعديل الصنف" : "إضافة صنف"}
      description={item ? item.item_code : "أضف مادة استهلاكية إلى سجل المخزون."}
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
      <FormField label="اسم الصنف" required error={errors["name"]}>
        {(props) => (
          <Input {...props} value={name} onChange={(event) => setName(event.target.value)} />
        )}
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
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
        <FormField label="رمز الصنف" required error={errors["code"]}>
          {(props) => (
            <Input
              {...props}
              dir="ltr"
              disabled={!!item}
              value={itemCode}
              onChange={(event) => setItemCode(event.target.value)}
              placeholder="INV-001"
            />
          )}
        </FormField>
        <FormField label="وحدة القياس" required error={errors["unit"]}>
          {(props) => (
            <Input
              {...props}
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
              placeholder="قطعة، عبوة، رزمة"
            />
          )}
        </FormField>
        <FormField label="الحد الأدنى" required error={errors["minimum"]}>
          {(props) => (
            <Input
              {...props}
              dir="ltr"
              type="number"
              min="0"
              step="0.001"
              value={minimumStock}
              onChange={(event) => setMinimumStock(event.target.value)}
            />
          )}
        </FormField>
        {!item ? (
          <FormField
            label="الرصيد الافتتاحي"
            error={errors["opening"]}
            hint="يسجل كحركة افتتاحية مستقلة."
          >
            {(props) => (
              <Input
                {...props}
                dir="ltr"
                type="number"
                min="0"
                step="0.001"
                value={openingBalance}
                onChange={(event) => setOpeningBalance(event.target.value)}
              />
            )}
          </FormField>
        ) : null}
        <FormField label="موقع التخزين">
          {(props) => (
            <Input
              {...props}
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="المستودع الرئيسي - رف A"
            />
          )}
        </FormField>
      </div>
      <FormField label="الوصف">
        {(props) => (
          <Textarea
            {...props}
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        )}
      </FormField>
    </AppDrawer>
  );
}

export function InventoryMovementDrawer({
  open,
  onOpenChange,
  schoolId,
  item,
  initialType,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string;
  item: InventoryItem | null;
  initialType: Exclude<InventoryMovementType, "opening_balance">;
  onSaved: () => void;
}) {
  const [movementType, setMovementType] =
    useState<Exclude<InventoryMovementType, "opening_balance">>(initialType);
  const [quantity, setQuantity] = useState("");
  const [date, setDate] = useState(today());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMovementType(initialType);
    setQuantity("");
    setDate(today());
    setReference("");
    setNotes("");
    setError("");
  }, [initialType, open]);

  function validate() {
    const value = Number(quantity);
    if (!Number.isFinite(value) || value <= 0) return "أدخل كمية أكبر من صفر.";
    if (!date || date > today()) return "اختر تاريخاً صالحاً غير مستقبلي.";
    if (item && ["stock_out", "adjustment_out"].includes(movementType) && value > item.balance)
      return "الكمية تتجاوز الرصيد المتاح.";
    return "";
  }

  function attemptSave() {
    const validation = validate();
    setError(validation);
    if (validation) return;
    if (movementType.startsWith("adjustment_")) setConfirmOpen(true);
    else void save();
  }

  async function save() {
    if (!item) return;
    setConfirmOpen(false);
    setBusy(true);
    const { error: saveError } = await supabase.rpc("record_inventory_movement", {
      _school_id: schoolId,
      _item_id: item.id,
      _movement_type: movementType,
      _quantity: Number(quantity),
      _movement_date: date,
      _reference: reference.trim(),
      _notes: notes.trim(),
    });
    setBusy(false);
    if (saveError) {
      toast.error(inventoryError(saveError));
      return;
    }
    toast.success("تم تسجيل حركة المخزون");
    onOpenChange(false);
    onSaved();
  }

  return (
    <>
      <AppDrawer
        open={open}
        onOpenChange={onOpenChange}
        side="left"
        title="تسجيل حركة مخزون"
        description={
          item ? `${item.name} · الرصيد ${formatQuantity(item.balance)} ${item.unit}` : undefined
        }
        footer={
          <div className="flex w-full gap-2">
            <Button onClick={attemptSave} disabled={busy || !item} className="flex-1">
              <Save className="size-4" />
              {busy ? "جارٍ الحفظ..." : "تسجيل الحركة"}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              إلغاء
            </Button>
          </div>
        }
      >
        <FormField label="نوع الحركة" required>
          {(props) => (
            <Select
              value={movementType}
              onValueChange={(value) =>
                setMovementType(value as Exclude<InventoryMovementType, "opening_balance">)
              }
            >
              <SelectTrigger id={props.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["stock_in", "stock_out", "adjustment_in", "adjustment_out"] as const).map(
                  (type) => (
                    <SelectItem key={type} value={type}>
                      {INVENTORY_MOVEMENT[type].label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="الكمية" required error={error}>
            {(props) => (
              <Input
                {...props}
                dir="ltr"
                type="number"
                min="0.001"
                step="0.001"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            )}
          </FormField>
          <FormField label="التاريخ" required>
            {(props) => (
              <Input
                {...props}
                type="date"
                max={today()}
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            )}
          </FormField>
        </div>
        <FormField label="المرجع">
          {(props) => (
            <Input
              {...props}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="رقم فاتورة أو طلب صرف"
            />
          )}
        </FormField>
        <FormField label="ملاحظات">
          {(props) => (
            <Textarea
              {...props}
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          )}
        </FormField>
      </AppDrawer>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="تأكيد تسوية المخزون"
        description={`ستسجل تسوية ${movementType === "adjustment_in" ? "بالزيادة" : "بالنقص"} بقيمة ${quantity || "0"} ${item?.unit ?? ""}. لن يمكن تعديل الحركة بعد حفظها.`}
        confirmLabel="تسجيل التسوية"
        destructive={movementType === "adjustment_out"}
        onConfirm={() => void save()}
      />
    </>
  );
}

export function InventoryItemStatusDialog({
  item,
  open,
  onOpenChange,
  onSaved,
}: {
  item: InventoryItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const restoring = item?.is_active === false;
  async function updateStatus() {
    if (!item) return;
    const { error } = await supabase
      .from("inventory_items")
      .update({ is_active: restoring })
      .eq("id", item.id)
      .eq("school_id", item.school_id);
    if (error) toast.error(inventoryError(error));
    else {
      toast.success(restoring ? "تمت استعادة الصنف" : "تمت أرشفة الصنف");
      onOpenChange(false);
      onSaved();
    }
  }
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={restoring ? "استعادة الصنف" : "أرشفة الصنف"}
      description={
        restoring
          ? `سيصبح ${item?.name ?? "الصنف"} متاحاً للحركات الجديدة.`
          : `سيبقى سجل ${item?.name ?? "الصنف"} وحركاته محفوظاً.`
      }
      confirmLabel={restoring ? "استعادة" : "أرشفة"}
      destructive={!restoring}
      onConfirm={() => void updateStatus()}
    />
  );
}

export function InventoryCategoryDialog({
  open,
  onOpenChange,
  schoolId,
  categories,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string;
  categories: InventoryCategory[];
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState<InventoryCategory | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!name.trim()) {
      toast.error("أدخل اسم التصنيف");
      return;
    }
    setBusy(true);
    const result = editing
      ? await supabase
          .from("inventory_categories")
          .update({ name: name.trim(), description: description.trim() || null })
          .eq("id", editing.id)
          .eq("school_id", schoolId)
      : await supabase.from("inventory_categories").insert({
          school_id: schoolId,
          name: name.trim(),
          description: description.trim() || null,
        });
    setBusy(false);
    if (result.error) {
      toast.error(inventoryError(result.error));
      return;
    }
    toast.success(editing ? "تم تحديث التصنيف" : "تمت إضافة التصنيف");
    setName("");
    setDescription("");
    setEditing(null);
    onChanged();
  }
  async function toggle(category: InventoryCategory) {
    const { error } = await supabase
      .from("inventory_categories")
      .update({ is_active: !category.is_active })
      .eq("id", category.id)
      .eq("school_id", schoolId);
    if (error) toast.error(inventoryError(error));
    else {
      toast.success(category.is_active ? "تمت أرشفة التصنيف" : "تمت استعادة التصنيف");
      onChanged();
    }
  }
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="تصنيفات المخزون"
      description="نظّم المواد الاستهلاكية دون حذف سجلاتها."
    >
      <div className="space-y-2">
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="اسم التصنيف"
          />
          <Button
            size="icon"
            onClick={() => void save()}
            disabled={busy}
            title="حفظ التصنيف"
            aria-label="حفظ التصنيف"
          >
            {editing ? <Save className="size-4" /> : <Plus className="size-4" />}
          </Button>
        </div>
        <Input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="وصف اختياري"
        />
      </div>
      <div className="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
        {categories.length ? (
          categories.map((category) => (
            <div key={category.id} className="flex items-center gap-2 p-2.5">
              <Tags className="size-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{category.name}</p>
                {category.description ? (
                  <p className="truncate text-xs text-muted-foreground">{category.description}</p>
                ) : null}
              </div>
              <StatusBadge tone={category.is_active ? "success" : "neutral"}>
                {category.is_active ? "فعال" : "مؤرشف"}
              </StatusBadge>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  setEditing(category);
                  setName(category.name);
                  setDescription(category.description ?? "");
                }}
                title="تعديل"
                aria-label="تعديل"
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => void toggle(category)}
                title={category.is_active ? "أرشفة" : "استعادة"}
                aria-label={category.is_active ? "أرشفة" : "استعادة"}
              >
                {category.is_active ? (
                  <Archive className="size-4" />
                ) : (
                  <RotateCcw className="size-4" />
                )}
              </Button>
            </div>
          ))
        ) : (
          <p className="p-5 text-center text-sm text-muted-foreground">لا توجد تصنيفات بعد.</p>
        )}
      </div>
    </Modal>
  );
}

export function InventoryHistoryDialog({
  item,
  movements,
  open,
  onOpenChange,
  isLoading = false,
  failed = false,
  onRetry,
}: {
  item: InventoryItem | null;
  movements: InventoryMovement[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isLoading?: boolean;
  failed?: boolean;
  onRetry?: () => void;
}) {
  const [type, setType] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const rows = useMemo(() => {
    let balance = 0;
    const balances = new Map<string, number>();
    [...movements]
      .sort(
        (a, b) =>
          a.movement_date.localeCompare(b.movement_date) ||
          a.created_at.localeCompare(b.created_at),
      )
      .forEach((movement) => {
        balance += movementImpact(movement);
        balances.set(movement.id, balance);
      });
    return movements
      .filter(
        (movement) =>
          (type === ALL || movement.movement_type === type) &&
          (!from || movement.movement_date >= from) &&
          (!to || movement.movement_date <= to),
      )
      .map((movement) => ({ ...movement, balanceAfter: balances.get(movement.id) ?? 0 }));
  }, [from, movements, to, type]);
  const pagination = usePagination([item?.id, type, from, to]);
  const page = slicePage(rows, pagination);
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="سجل حركة الصنف"
      description={item ? `${item.name} · ${item.item_code}` : undefined}
    >
      <div className="flex flex-wrap gap-2">
        <FilterSelect
          value={type}
          onChange={setType}
          placeholder="نوع الحركة"
          options={Object.entries(INVENTORY_MOVEMENT).map(([key, value]) => [key, value.label])}
        />
        <Input
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          className="h-9 w-36"
          aria-label="من تاريخ"
        />
        <Input
          type="date"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          className="h-9 w-36"
          aria-label="إلى تاريخ"
        />
      </div>
      <div className="max-h-[55vh] overflow-auto rounded-md border border-border">
        {isLoading ? (
          <p role="status" className="p-4 text-sm text-muted-foreground">
            جارٍ تحميل سجل الحركة...
          </p>
        ) : failed ? (
          <div role="alert" className="p-4 text-sm">
            <p>تعذر تحميل سجل الحركة.</p>
            <Button variant="outline" onClick={onRetry}>
              إعادة المحاولة
            </Button>
          </div>
        ) : rows.length ? (
          <div className="divide-y divide-border">
            {page.rows.map((movement) => {
              const impact = movementImpact(movement);
              const meta = INVENTORY_MOVEMENT[movement.movement_type];
              return (
                <div
                  key={movement.id}
                  className="grid gap-2 p-3 text-sm sm:grid-cols-[7rem_9rem_1fr_8rem] sm:items-center"
                >
                  <span>{formatDate(movement.movement_date)}</span>
                  <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                  <div>
                    <p className="font-medium" dir="ltr">
                      {impact > 0 ? "+" : ""}
                      {formatQuantity(impact)} {item?.unit}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      الرصيد بعد الحركة: {formatQuantity(movement.balanceAfter)} ·{" "}
                      {movement.created_by_name ?? "النظام"}
                    </p>
                    {movement.notes ? (
                      <p className="mt-1 text-xs text-muted-foreground">{movement.notes}</p>
                    ) : null}
                  </div>
                  <span className="truncate text-xs text-muted-foreground">
                    {movement.reference ?? "—"}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="p-8 text-center text-sm text-muted-foreground">لا توجد حركات مطابقة.</p>
        )}
      </div>
      {!isLoading && !failed ? (
        <TablePagination {...pagination} page={page.page} total={rows.length} />
      ) : null}
    </Modal>
  );
}
