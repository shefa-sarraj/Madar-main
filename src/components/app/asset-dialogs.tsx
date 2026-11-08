import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Tags,
} from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { AppDrawer } from "@/components/app/drawer";
import { FormField } from "@/components/app/form-field";
import { Modal } from "@/components/app/modal";
import { StatusBadge } from "@/components/app/status-badge";
import { ALL, FilterSelect } from "@/components/app/student-shared";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
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
  ASSET_CONDITION,
  ASSET_EVENT,
  ASSET_STATUS,
  assetError,
  type AssetCategory,
  type AssetCondition,
  type AssetEventType,
  type AssetHistoryRow,
  type AssetRow,
  type EmployeeOption,
} from "@/lib/assets";
import { formatDate } from "@/lib/students";

const NONE = "none";
const today = () => new Date().toISOString().slice(0, 10);

export function AssetDrawer({
  open,
  onOpenChange,
  schoolId,
  currency,
  asset,
  categories,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string;
  currency: string;
  asset: AssetRow | null;
  categories: AssetCategory[];
  onSaved: () => void;
}) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [assetCode, setAssetCode] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [purchaseCost, setPurchaseCost] = useState("");
  const [assetCurrency, setAssetCurrency] = useState(currency);
  const [location, setLocation] = useState("");
  const [condition, setCondition] = useState<AssetCondition>("good");
  const [warrantyExpiry, setWarrantyExpiry] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setName(asset?.name ?? "");
    setCategoryId(asset?.category_id ?? categories.find((item) => item.is_active)?.id ?? "");
    setAssetCode(asset?.asset_code ?? "");
    setSerialNumber(asset?.serial_number ?? "");
    setPurchaseDate(asset?.purchase_date ?? "");
    setPurchaseCost(
      asset?.purchase_cost === null || asset?.purchase_cost === undefined
        ? ""
        : String(asset.purchase_cost),
    );
    setAssetCurrency(asset?.currency ?? currency);
    setLocation(asset?.location ?? "");
    setCondition(asset?.condition ?? "good");
    setWarrantyExpiry(asset?.warranty_expiry ?? "");
    setDescription(asset?.description ?? "");
    setNotes(asset?.notes ?? "");
    setErrors({});
  }, [asset, categories, currency, open]);

  function validate() {
    const nextErrors: Record<string, string> = {};
    const cost = purchaseCost ? Number(purchaseCost) : null;
    if (!name.trim()) nextErrors["name"] = "اسم الأصل مطلوب.";
    if (!categoryId) nextErrors["category"] = "اختر التصنيف.";
    if (!assetCode.trim()) nextErrors["code"] = "رمز الأصل مطلوب.";
    if (!asset && !location.trim()) nextErrors["location"] = "الموقع الحالي مطلوب.";
    if (purchaseDate && purchaseDate > today())
      nextErrors["purchaseDate"] = "تاريخ الشراء لا يمكن أن يكون مستقبلياً.";
    if (cost !== null && (!Number.isFinite(cost) || cost < 0))
      nextErrors["cost"] = "أدخل تكلفة شراء صالحة.";
    if (warrantyExpiry && purchaseDate && warrantyExpiry < purchaseDate)
      nextErrors["warranty"] = "انتهاء الضمان يجب أن يلي تاريخ الشراء.";
    if (!/^[A-Za-z]{3}$/.test(assetCurrency))
      nextErrors["currency"] = "أدخل رمز عملة من ثلاثة أحرف.";
    return nextErrors;
  }
  function nextStep() {
    const all = validate();
    const keys =
      step === 0
        ? ["name", "category", "code"]
        : ["location", "purchaseDate", "cost", "warranty", "currency"];
    const current = Object.fromEntries(Object.entries(all).filter(([key]) => keys.includes(key)));
    setErrors(current);
    if (!Object.keys(current).length) setStep(step + 1);
  }
  async function save() {
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setStep(["name", "category", "code"].some((key) => nextErrors[key]) ? 0 : 1);
      return;
    }
    const cost = purchaseCost ? Number(purchaseCost) : null;
    setBusy(true);
    const common = {
      category_id: categoryId,
      name: name.trim(),
      serial_number: serialNumber.trim() || null,
      purchase_date: purchaseDate || null,
      purchase_cost: cost,
      currency: assetCurrency.toUpperCase(),
      condition,
      warranty_expiry: warrantyExpiry || null,
      description: description.trim() || null,
      notes: notes.trim() || null,
    };
    const result = asset
      ? await supabase.from("assets").update(common).eq("id", asset.id).eq("school_id", schoolId)
      : await supabase.from("assets").insert({
          ...common,
          school_id: schoolId,
          asset_code: assetCode.trim(),
          location: location.trim(),
        });
    setBusy(false);
    if (result.error) {
      toast.error(assetError(result.error));
      return;
    }
    toast.success(asset ? "تم تحديث بيانات الأصل" : "تم تسجيل الأصل");
    onOpenChange(false);
    onSaved();
  }

  return (
    <AppDrawer
      open={open}
      onOpenChange={onOpenChange}
      side="left"
      title={asset ? "تعديل بيانات الأصل" : "تسجيل أصل جديد"}
      description={asset ? asset.asset_code : "أضف أصلاً دائماً مملوكاً للمدرسة."}
      footer={
        <div className="flex w-full gap-2">
          {step > 0 ? (
            <Button
              variant="outline"
              onClick={() => {
                setErrors({});
                setStep(step - 1);
              }}
              disabled={busy}
            >
              <ArrowRight className="size-4" />
              السابق
            </Button>
          ) : null}
          {step < 2 ? (
            <Button className="flex-1" onClick={nextStep}>
              التالي
              <ArrowLeft className="size-4" />
            </Button>
          ) : (
            <Button className="flex-1" onClick={() => void save()} disabled={busy}>
              <Save className="size-4" />
              {busy ? "جارٍ الحفظ..." : "حفظ الأصل"}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            إلغاء
          </Button>
        </div>
      }
    >
      <ol aria-label="خطوات الأصل" className="grid grid-cols-3 gap-2 text-xs">
        {["بيانات الأصل", "الشراء والموقع", "العهدة والمراجعة"].map((label, index) => (
          <li
            key={label}
            aria-current={index === step ? "step" : undefined}
            className={`border-b-2 pb-2 ${index === step ? "border-primary font-semibold text-foreground" : "border-border text-muted-foreground"}`}
          >
            <span className="tnum">{index + 1}.</span> {label}
          </li>
        ))}
      </ol>
      <h2 className="text-sm font-semibold">
        {["بيانات الأصل", "الشراء والموقع", "العهدة والوصف والمراجعة"][step]}
      </h2>
      <div hidden={step !== 0} className="space-y-4">
        <FormField label="اسم الأصل" required error={errors["name"]}>
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
                    .filter((item) => item.is_active || item.id === categoryId)
                    .map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField
            label="رمز الأصل"
            required
            error={errors["code"]}
            hint={asset ? "رمز الأصل ثابت." : undefined}
          >
            {(props) => (
              <Input
                {...props}
                dir="ltr"
                readOnly={!!asset}
                value={assetCode}
                onChange={(event) => setAssetCode(event.target.value)}
                placeholder="AST-001"
              />
            )}
          </FormField>
          <FormField label="الرقم التسلسلي">
            {(props) => (
              <Input
                {...props}
                dir="ltr"
                value={serialNumber}
                onChange={(event) => setSerialNumber(event.target.value)}
              />
            )}
          </FormField>
          <FormField label="الحالة الفنية">
            {(props) => (
              <Select
                value={condition}
                onValueChange={(value) => setCondition(value as AssetCondition)}
              >
                <SelectTrigger id={props.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ASSET_CONDITION).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        </div>
      </div>
      <div hidden={step !== 1} className="grid gap-4 sm:grid-cols-2">
        <FormField label="تاريخ الشراء" error={errors["purchaseDate"]}>
          {(props) => (
            <Input
              {...props}
              type="date"
              max={today()}
              value={purchaseDate}
              onChange={(event) => setPurchaseDate(event.target.value)}
            />
          )}
        </FormField>
        <FormField label="تكلفة الشراء" error={errors["cost"]}>
          {(props) => (
            <Input
              {...props}
              dir="ltr"
              type="number"
              min="0"
              step="0.01"
              value={purchaseCost}
              onChange={(event) => setPurchaseCost(event.target.value)}
            />
          )}
        </FormField>
        <FormField label="العملة" error={errors["currency"]}>
          {(props) => (
            <Input
              {...props}
              dir="ltr"
              maxLength={3}
              value={assetCurrency}
              onChange={(event) => setAssetCurrency(event.target.value.toUpperCase())}
            />
          )}
        </FormField>
        <FormField label="انتهاء الضمان" error={errors["warranty"]}>
          {(props) => (
            <Input
              {...props}
              type="date"
              value={warrantyExpiry}
              onChange={(event) => setWarrantyExpiry(event.target.value)}
            />
          )}
        </FormField>
        <FormField
          label="الموقع الحالي"
          required={!asset}
          error={errors["location"]}
          hint={asset ? "غيّر الموقع من إجراء النقل لحفظ السجل التاريخي." : undefined}
        >
          {(props) => (
            <Input
              {...props}
              disabled={!!asset}
              value={location}
              onChange={(event) => setLocation(event.target.value)}
            />
          )}
        </FormField>
      </div>
      <div hidden={step !== 2} className="space-y-4">
        <div className="border-b border-border pb-3 text-sm">
          <p className="text-xs text-muted-foreground">العهدة الحالية</p>
          <p className="mt-1 font-medium">{asset?.assigned_employee_name ?? "بدون عهدة"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            تُسجل تغييرات العهدة من إجراء تعيين العهدة أو النقل.
          </p>
        </div>
        <FormField label="الوصف">
          {(props) => (
            <Textarea
              {...props}
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
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
        <section aria-label="مراجعة الأصل" className="border-t border-border pt-3">
          <h3 className="mb-2 text-sm font-semibold">مراجعة الأصل</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {[
              ["الأصل", name],
              ["الرمز", assetCode],
              ["التصنيف", categories.find((item) => item.id === categoryId)?.name],
              ["الرقم التسلسلي", serialNumber],
              ["الحالة الفنية", ASSET_CONDITION[condition]],
              ["الموقع", location],
              ["تاريخ الشراء", purchaseDate ? formatDate(purchaseDate) : ""],
              ["التكلفة", purchaseCost ? `${purchaseCost} ${assetCurrency}` : ""],
              ["انتهاء الضمان", warrantyExpiry ? formatDate(warrantyExpiry) : ""],
            ].map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="min-w-0 break-words">{value || "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </AppDrawer>
  );
}

export function AssetEventDrawer({
  asset,
  eventType,
  employees,
  open,
  onOpenChange,
  onSaved,
}: {
  asset: AssetRow | null;
  eventType: Exclude<AssetEventType, "registered">;
  employees: EmployeeOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(today());
  const [location, setLocation] = useState("");
  const [employeeId, setEmployeeId] = useState(NONE);
  const [condition, setCondition] = useState<AssetCondition>("good");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDate(today());
    setLocation(asset?.location ?? "");
    setEmployeeId(eventType === "transferred" ? (asset?.assigned_employee_id ?? NONE) : NONE);
    setCondition(asset?.condition ?? "good");
    setNotes("");
    setError("");
  }, [asset, eventType, open]);

  function validate() {
    if (!asset) return "اختر أصلاً.";
    if (!date || date > today()) return "اختر تاريخاً صالحاً غير مستقبلي.";
    if (asset.purchase_date && date < asset.purchase_date) return "التاريخ يسبق تاريخ شراء الأصل.";
    if (eventType === "assigned" && employeeId === NONE) return "اختر الموظف المستلم.";
    if (
      eventType === "transferred" &&
      employeeId === (asset.assigned_employee_id ?? NONE) &&
      location.trim() === asset.location
    )
      return "حدد موظفاً أو موقعاً جديداً.";
    if (eventType === "returned" && !location.trim()) return "حدد موقع الإرجاع.";
    return "";
  }

  function attemptSave() {
    const nextError = validate();
    setError(nextError);
    if (nextError) return;
    if (["damaged", "retired"].includes(eventType)) setConfirmOpen(true);
    else void save();
  }

  async function save() {
    if (!asset) return;
    setConfirmOpen(false);
    setBusy(true);
    const { error: saveError } = await supabase.rpc("record_asset_event", {
      _asset_id: asset.id,
      _event_type: eventType,
      _event_date: date,
      _to_location: location.trim(),
      _condition: condition,
      _notes: notes.trim(),
      ...(employeeId === NONE ? {} : { _to_employee_id: employeeId }),
    });
    setBusy(false);
    if (saveError) {
      toast.error(assetError(saveError));
      return;
    }
    toast.success(`تم ${ASSET_EVENT[eventType].label}`);
    onOpenChange(false);
    onSaved();
  }

  const showEmployee = eventType === "assigned" || eventType === "transferred";
  return (
    <>
      <AppDrawer
        open={open}
        onOpenChange={onOpenChange}
        side="left"
        title={ASSET_EVENT[eventType].label}
        description={asset ? `${asset.name} · ${asset.asset_code}` : undefined}
        footer={
          <div className="flex w-full gap-2">
            <Button className="flex-1" onClick={attemptSave} disabled={busy || !asset}>
              <Save className="size-4" />
              {busy ? "جارٍ الحفظ..." : "حفظ الحركة"}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              إلغاء
            </Button>
          </div>
        }
      >
        {showEmployee ? (
          <FormField
            label={eventType === "assigned" ? "الموظف المستلم" : "الموظف الجديد"}
            required={eventType === "assigned"}
            error={error}
          >
            {(props) => (
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger id={props.id} aria-invalid={props["aria-invalid"]}>
                  <SelectValue placeholder="اختر الموظف" />
                </SelectTrigger>
                <SelectContent>
                  {eventType === "transferred" ? (
                    <SelectItem value={NONE}>الإبقاء على العهدة الحالية</SelectItem>
                  ) : null}
                  {employees
                    .filter((employee) => employee.status === "active")
                    .map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {employee.full_name} · {employee.employee_number}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        ) : null}
        <FormField
          label={eventType === "returned" ? "موقع الإرجاع" : "الموقع بعد الحركة"}
          required={eventType === "returned"}
          error={!showEmployee ? error : undefined}
        >
          {(props) => (
            <Input
              {...props}
              value={location}
              onChange={(event) => setLocation(event.target.value)}
            />
          )}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="تاريخ الحركة" required error={!showEmployee ? undefined : error}>
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
          <FormField label="الحالة الفنية بعد الحركة">
            {(props) => (
              <Select
                value={condition}
                onValueChange={(value) => setCondition(value as AssetCondition)}
              >
                <SelectTrigger id={props.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ASSET_CONDITION).map(([value, label]) => (
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
        title={eventType === "retired" ? "تأكيد تقاعد الأصل" : "تأكيد تسجيل التلف"}
        description={
          eventType === "retired"
            ? "سيصبح الأصل غير متاح لأي تعيين أو حركة لاحقة، وسيبقى سجله محفوظاً."
            : "سيتم فك العهدة الحالية وتسجيل الأصل كتالف في السجل الدائم."
        }
        confirmLabel={eventType === "retired" ? "تقاعد الأصل" : "تسجيل التلف"}
        destructive
        onConfirm={() => void save()}
      />
    </>
  );
}

export function AssetCategoryDialog({
  open,
  onOpenChange,
  schoolId,
  categories,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string;
  categories: AssetCategory[];
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState<AssetCategory | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!name.trim()) {
      toast.error("أدخل اسم التصنيف");
      return;
    }
    setBusy(true);
    const result = editing
      ? await supabase
          .from("asset_categories")
          .update({ name: name.trim(), description: description.trim() || null })
          .eq("id", editing.id)
          .eq("school_id", schoolId)
      : await supabase.from("asset_categories").insert({
          school_id: schoolId,
          name: name.trim(),
          description: description.trim() || null,
        });
    setBusy(false);
    if (result.error) {
      toast.error(assetError(result.error));
      return;
    }
    toast.success(editing ? "تم تحديث التصنيف" : "تمت إضافة التصنيف");
    setName("");
    setDescription("");
    setEditing(null);
    onChanged();
  }
  async function toggle(category: AssetCategory) {
    const { error } = await supabase
      .from("asset_categories")
      .update({ is_active: !category.is_active })
      .eq("id", category.id)
      .eq("school_id", schoolId);
    if (error) toast.error(assetError(error));
    else {
      toast.success(category.is_active ? "تمت أرشفة التصنيف" : "تمت استعادة التصنيف");
      onChanged();
    }
  }
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="تصنيفات الأصول"
      description="إدارة أنواع الأصول الدائمة دون حذف السجلات."
    >
      <div className="space-y-2">
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="اسم التصنيف"
            aria-label="اسم التصنيف"
          />
          <Button
            onClick={() => void save()}
            disabled={busy}
            title={editing ? "حفظ التصنيف" : "إضافة تصنيف"}
            aria-label={editing ? "حفظ التصنيف" : "إضافة تصنيف"}
          >
            {editing ? <Save className="size-4" /> : <Plus className="size-4" />}
            {editing ? "حفظ التصنيف" : "إضافة تصنيف"}
          </Button>
          {editing ? (
            <Button
              variant="ghost"
              onClick={() => {
                setEditing(null);
                setName("");
                setDescription("");
              }}
            >
              إلغاء
            </Button>
          ) : null}
        </div>
        <Input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="وصف اختياري"
          aria-label="وصف التصنيف"
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
              <DropdownMenu dir="rtl">
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="إجراءات التصنيف"
                    aria-label={`إجراءات ${category.name}`}
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      setEditing(category);
                      setName(category.name);
                      setDescription(category.description ?? "");
                    }}
                  >
                    <Pencil className="size-4" />
                    تعديل
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void toggle(category)}>
                    {category.is_active ? (
                      <Archive className="size-4" />
                    ) : (
                      <RotateCcw className="size-4" />
                    )}
                    {category.is_active ? "أرشفة" : "استعادة"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))
        ) : (
          <p className="p-5 text-center text-sm text-muted-foreground">لا توجد تصنيفات بعد.</p>
        )}
      </div>
    </Modal>
  );
}

export function AssetHistoryDialog({
  asset,
  history,
  open,
  onOpenChange,
}: {
  asset: AssetRow | null;
  history: AssetHistoryRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [eventType, setEventType] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const rows = useMemo(
    () =>
      history.filter(
        (event) =>
          (eventType === ALL || event.event_type === eventType) &&
          (!from || event.event_date >= from) &&
          (!to || event.event_date <= to),
      ),
    [eventType, from, history, to],
  );
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="سجل الأصل"
      description={asset ? `${asset.name} · ${asset.asset_code}` : undefined}
    >
      <div className="flex flex-wrap gap-2">
        <FilterSelect
          value={eventType}
          onChange={setEventType}
          placeholder="نوع الحدث"
          options={Object.entries(ASSET_EVENT).map(([key, value]) => [key, value.label])}
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
        {rows.length ? (
          <div className="divide-y divide-border">
            {rows.map((event) => (
              <div key={event.id} className="space-y-2 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StatusBadge tone={ASSET_EVENT[event.event_type].tone}>
                    {ASSET_EVENT[event.event_type].label}
                  </StatusBadge>
                  <span>{formatDate(event.event_date)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {event.from_location ?? "—"} ← {event.to_location ?? "—"}
                </p>
                {event.assigned_from_name || event.assigned_to_name ? (
                  <p className="text-xs text-muted-foreground">
                    العهدة: {event.assigned_from_name ?? "بدون"} ←{" "}
                    {event.assigned_to_name ?? "بدون"}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  الحالة: {event.status_from ? ASSET_STATUS[event.status_from].label : "—"} ←{" "}
                  {ASSET_STATUS[event.status_to].label} · المنفذ:{" "}
                  {event.created_by_name ?? "النظام"}
                </p>
                {event.notes ? <p>{event.notes}</p> : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="p-8 text-center text-sm text-muted-foreground">لا توجد أحداث مطابقة.</p>
        )}
      </div>
    </Modal>
  );
}
