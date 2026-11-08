import { EmployeeSystemAccess } from "@/components/app/employee-system-access";
import { useEmployeeAccess } from "@/lib/employee-access";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Pencil,
  Plus,
  Save,
  UserCheck,
  UserX,
} from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  EMPLOYEE_STATUS,
  EMPLOYMENT_TYPE,
  GENDER_LABEL,
  staffError,
  type Department,
  type EmployeeRow,
} from "@/lib/staff";

type EmploymentType = Database["public"]["Enums"]["employment_type"];
type EmployeeStatus = Database["public"]["Enums"]["employee_status"];
type Gender = Database["public"]["Enums"]["gender"];
const NONE = "none";

type EmployeeDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string;
  employee: EmployeeRow | null;
  departments: Department[];
  onSaved: () => void;
};

export function EmployeeDrawer({
  open,
  onOpenChange,
  schoolId,
  employee,
  departments,
  onSaved,
}: EmployeeDrawerProps) {
  const [savedId, setSavedId] = useState<string | null>(employee?.id ?? null);
  const access = useEmployeeAccess(schoolId, savedId, open);
  const [fullName, setFullName] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState(NONE);
  const [birthDate, setBirthDate] = useState("");
  const [address, setAddress] = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [employmentType, setEmploymentType] = useState<EmploymentType>("full_time");
  const [hireDate, setHireDate] = useState("");
  const [isTeacher, setIsTeacher] = useState(false);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<EmployeeStatus>("active");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const steps = ["المعلومات الشخصية", "المعلومات الوظيفية", "الوصول إلى النظام"];

  useEffect(() => {
    if (!open) return;
    setSavedId(employee?.id ?? null);
    setFullName(employee?.full_name ?? "");
    setNationalId(employee?.national_id ?? "");
    setPhone(employee?.phone ?? "");
    setEmail(employee?.email ?? "");
    setGender(employee?.gender ?? NONE);
    setBirthDate(employee?.date_of_birth ?? "");
    setAddress(employee?.address ?? "");
    setEmployeeNumber(employee?.employee_number ?? "");
    setJobTitle(employee?.job_title ?? "");
    setDepartmentId(employee?.department_id ?? "");
    setEmploymentType(employee?.employment_type ?? "full_time");
    setHireDate(employee?.hire_date ?? new Date().toISOString().slice(0, 10));
    setIsTeacher(employee?.is_teacher ?? false);
    setNotes(employee?.notes ?? "");
    setStatus(employee?.status ?? "active");
    setErrors({});
    setStep(0);
  }, [employee, open]);

  function validateFields() {
    const nextErrors: Record<string, string> = {};
    const today = new Date().toISOString().slice(0, 10);
    if (!fullName.trim()) nextErrors["fullName"] = "الاسم الكامل مطلوب.";
    if (!jobTitle.trim()) nextErrors["jobTitle"] = "المسمى الوظيفي مطلوب.";
    if (!departmentId) nextErrors["department"] = "اختر القسم.";
    if (!hireDate) nextErrors["hireDate"] = "تاريخ التعيين مطلوب.";
    if (hireDate && hireDate > today)
      nextErrors["hireDate"] = "لا يمكن أن يكون تاريخ التعيين في المستقبل.";
    if (birthDate && birthDate > today) nextErrors["birthDate"] = "تاريخ الميلاد غير صالح.";
    if (birthDate && hireDate && birthDate >= hireDate)
      nextErrors["birthDate"] = "يجب أن يسبق تاريخ الميلاد تاريخ التعيين.";
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      nextErrors["email"] = "أدخل بريداً إلكترونياً صحيحاً.";
    return nextErrors;
  }

  function nextStep() {
    const allErrors = validateFields();
    const fields =
      step === 0
        ? ["fullName", "birthDate", "email"]
        : ["jobTitle", "department", "hireDate", "birthDate"];
    const currentErrors = Object.fromEntries(
      Object.entries(allErrors).filter(([key]) => fields.includes(key)),
    );
    setErrors(currentErrors);
    if (!Object.keys(currentErrors).length) setStep(step + 1);
    else if (currentErrors["birthDate"]) setStep(0);
  }

  async function save() {
    const nextErrors = validateFields();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setStep(["fullName", "birthDate", "email"].some((key) => nextErrors[key]) ? 0 : 1);
      return;
    }

    try {
      access.validate();
    } catch (error) {
      toast.error(staffError(error));
      return;
    }
    setBusy(true);
    const payload = {
      school_id: schoolId,
      full_name: fullName.trim(),
      national_id: nationalId.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      gender: gender === NONE ? null : (gender as Gender),
      date_of_birth: birthDate || null,
      address: address.trim() || null,
      employee_number: employeeNumber.trim(),
      job_title: jobTitle.trim(),
      department_id: departmentId,
      employment_type: employmentType,
      hire_date: hireDate,
      is_teacher: isTeacher,
      notes: notes.trim() || null,
      status,
    };
    try {
      const result = savedId
        ? await supabase
            .from("employees")
            .update(payload)
            .eq("id", savedId)
            .eq("school_id", schoolId)
            .select("id")
            .single()
        : await supabase.from("employees").insert(payload).select("id").single();
      if (result.error) throw result.error;
      const id = result.data!.id;
      setSavedId(id);
      onSaved();
      await access.provision(id, fullName.trim());
      toast.success(employee ? "تم تحديث بيانات الموظف" : "تمت إضافة الموظف");
      if (!access.enabled || access.linked || access.existingUserId) onOpenChange(false);
    } catch (error) {
      toast.error(staffError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppDrawer
      open={open}
      onOpenChange={(value) => {
        if (!busy) {
          access.setCreatedPassword(null);
          access.setPassword("");
          onOpenChange(value);
        }
      }}
      title={employee ? "تعديل الموظف" : "إضافة موظف"}
      description={`الخطوة ${step + 1} من 3: ${steps[step]}`}
      side="left"
      footer={
        <div className="flex w-full flex-wrap gap-2">
          {step < 2 ? (
            <Button onClick={nextStep} className="flex-1" disabled={busy}>
              التالي <ArrowLeft className="size-4" />
            </Button>
          ) : (
            <Button
              onClick={() => void save()}
              disabled={busy || !!access.createdPassword}
              className="flex-1"
            >
              <Save className="size-4" />
              {busy ? "جارٍ الحفظ..." : "حفظ"}
            </Button>
          )}
          {step > 0 ? (
            <Button
              variant="outline"
              onClick={() => setStep(step - 1)}
              disabled={busy || !!access.createdPassword}
            >
              <ArrowRight className="size-4" /> السابق
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            إلغاء
          </Button>
        </div>
      }
    >
      <ol aria-label="خطوات بيانات الموظف" className="grid grid-cols-3 gap-2">
        {steps.map((label, index) => (
          <li key={label}>
            <button
              type="button"
              aria-current={step === index ? "step" : undefined}
              disabled={index > step || busy || !!access.createdPassword}
              onClick={() => setStep(index)}
              className={`flex h-full w-full flex-col items-start gap-1 border-b-2 pb-2 text-start text-xs ${step === index ? "border-primary font-semibold text-primary" : "border-border text-muted-foreground"}`}
            >
              <span className="flex h-5 items-center">
                {index < step ? <Check className="size-4" /> : index + 1}
              </span>
              {label}
            </button>
          </li>
        ))}
      </ol>
      {access.createdPassword && (
        <div role="status" className="space-y-2 rounded-md border p-3">
          <p>تم إنشاء الحساب وربطه بالموظف. كلمة المرور المؤقتة:</p>
          <code dir="ltr" className="block break-all select-all">
            {access.createdPassword}
          </code>
          <Button
            onClick={() => {
              access.setCreatedPassword(null);
              onOpenChange(false);
            }}
          >
            إغلاق
          </Button>
        </div>
      )}
      <div hidden={step !== 0} className="space-y-4">
        <FormField label="الاسم الكامل" required error={errors["fullName"]}>
          {(props) => (
            <Input
              {...props}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
          )}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="رقم الهوية / المعرّف">
            {(props) => (
              <Input
                {...props}
                dir="ltr"
                value={nationalId}
                onChange={(event) => setNationalId(event.target.value)}
              />
            )}
          </FormField>
          <FormField label="الهاتف">
            {(props) => (
              <Input
                {...props}
                dir="ltr"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            )}
          </FormField>
          <FormField label="البريد الإلكتروني" error={errors["email"]}>
            {(props) => (
              <Input
                {...props}
                dir="ltr"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            )}
          </FormField>
          <FormField label="الجنس">
            {(props) => (
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger id={props.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>غير محدد</SelectItem>
                  {Object.entries(GENDER_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField label="تاريخ الميلاد" error={errors["birthDate"]}>
            {(props) => (
              <Input
                {...props}
                type="date"
                value={birthDate}
                onChange={(event) => setBirthDate(event.target.value)}
              />
            )}
          </FormField>
        </div>
        <FormField label="العنوان">
          {(props) => (
            <Input
              {...props}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
          )}
        </FormField>
      </div>
      <div hidden={step !== 1} className="space-y-4">
        <FormField
          label="الرقم الوظيفي"
          hint={employeeNumber ? undefined : "يُولّد تلقائياً عند الحفظ."}
        >
          {(props) => (
            <Input
              {...props}
              dir={employeeNumber ? "ltr" : "rtl"}
              readOnly
              value={employeeNumber || "تلقائي"}
              className="bg-muted/50"
            />
          )}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="المسمى الوظيفي" required error={errors["jobTitle"]}>
            {(props) => (
              <Input
                {...props}
                value={jobTitle}
                onChange={(event) => setJobTitle(event.target.value)}
                placeholder="مثال: معلم رياضيات"
              />
            )}
          </FormField>
          <FormField label="القسم" required error={errors["department"]}>
            {(props) => (
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger id={props.id} aria-invalid={props["aria-invalid"]}>
                  <SelectValue placeholder="اختر القسم" />
                </SelectTrigger>
                <SelectContent>
                  {departments
                    .filter((department) => department.is_active || department.id === departmentId)
                    .map((department) => (
                      <SelectItem key={department.id} value={department.id}>
                        {department.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField label="نوع التوظيف">
            {(props) => (
              <Select
                value={employmentType}
                onValueChange={(value) => setEmploymentType(value as EmploymentType)}
              >
                <SelectTrigger id={props.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(EMPLOYMENT_TYPE).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField label="تاريخ التعيين" required error={errors["hireDate"]}>
            {(props) => (
              <Input
                {...props}
                type="date"
                value={hireDate}
                onChange={(event) => setHireDate(event.target.value)}
              />
            )}
          </FormField>
          <FormField label="الحالة">
            {(props) => (
              <Select value={status} onValueChange={(value) => setStatus(value as EmployeeStatus)}>
                <SelectTrigger id={props.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(EMPLOYEE_STATUS).map(([value, item]) => (
                    <SelectItem key={value} value={value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <div className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2.5 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">معلم</p>
            </div>
            <Switch checked={isTeacher} onCheckedChange={setIsTeacher} aria-label="معلم" />
          </div>
        </div>
        <FormField label="ملاحظات">
          {(props) => (
            <Textarea
              {...props}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
            />
          )}
        </FormField>
      </div>
      <div hidden={step !== 2} className="space-y-4">
        {access.allowed ? (
          <EmployeeSystemAccess access={access} schoolId={schoolId} />
        ) : (
          <p className="text-sm text-muted-foreground">
            إدارة حساب الدخول متاحة لمالك المدرسة أو مديرها فقط. سيتم حفظ البيانات الوظيفية دون
            تغيير الوصول إلى النظام.
          </p>
        )}
      </div>
    </AppDrawer>
  );
}

export function EmployeeStatusDialog({
  employee,
  open,
  onOpenChange,
  onSaved,
}: {
  employee: EmployeeRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const activating = employee?.status === "inactive";
  async function updateStatus() {
    if (!employee) return;
    const { error } = await supabase
      .from("employees")
      .update({ status: activating ? "active" : "inactive" })
      .eq("id", employee.id)
      .eq("school_id", employee.school_id);
    if (error) toast.error(staffError(error));
    else {
      toast.success(activating ? "تمت إعادة تفعيل الموظف" : "تم إلغاء تفعيل الموظف");
      onOpenChange(false);
      onSaved();
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={activating ? "إعادة تفعيل الموظف" : "إلغاء تفعيل الموظف"}
      description={
        activating
          ? `سيعود ${employee?.full_name ?? "الموظف"} إلى قائمة الموظفين الفعالين.`
          : `سيبقى ملف ${employee?.full_name ?? "الموظف"} محفوظاً في السجل.`
      }
      confirmLabel={activating ? "إعادة التفعيل" : "إلغاء التفعيل"}
      destructive={!activating}
      onConfirm={() => void updateStatus()}
    />
  );
}

export function DepartmentDialog({
  open,
  onOpenChange,
  schoolId,
  departments,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string;
  departments: Department[];
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<Department | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) {
      toast.error("أدخل اسم القسم");
      return;
    }
    setBusy(true);
    const result = editing
      ? await supabase
          .from("departments")
          .update({ name: name.trim() })
          .eq("id", editing.id)
          .eq("school_id", schoolId)
      : await supabase.from("departments").insert({ school_id: schoolId, name: name.trim() });
    setBusy(false);
    if (result.error) {
      toast.error(staffError(result.error));
      return;
    }
    toast.success(editing ? "تم تحديث القسم" : "تمت إضافة القسم");
    setName("");
    setEditing(null);
    onChanged();
  }

  async function toggle(department: Department) {
    const { error } = await supabase
      .from("departments")
      .update({ is_active: !department.is_active })
      .eq("id", department.id)
      .eq("school_id", schoolId);
    if (error) toast.error(staffError(error));
    else {
      toast.success(department.is_active ? "تمت أرشفة القسم" : "تمت استعادة القسم");
      onChanged();
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="الأقسام"
      description="إدارة أقسام المدرسة دون حذف السجلات المرتبطة."
    >
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="اسم القسم"
        />
        <Button
          size="icon"
          onClick={() => void save()}
          disabled={busy}
          title="حفظ القسم"
          aria-label="حفظ القسم"
        >
          {editing ? <Save className="size-4" /> : <Plus className="size-4" />}
        </Button>
      </div>
      <div className="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
        {departments.length ? (
          departments.map((department) => (
            <div key={department.id} className="flex items-center gap-2 p-2.5">
              <Building2 className="size-4 text-muted-foreground" />
              <p className="min-w-0 flex-1 truncate text-sm font-medium">{department.name}</p>
              <StatusBadge tone={department.is_active ? "success" : "neutral"}>
                {department.is_active ? "فعال" : "مؤرشف"}
              </StatusBadge>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  setEditing(department);
                  setName(department.name);
                }}
                title="تعديل"
                aria-label="تعديل"
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => void toggle(department)}
                title={department.is_active ? "أرشفة" : "استعادة"}
                aria-label={department.is_active ? "أرشفة" : "استعادة"}
              >
                {department.is_active ? (
                  <UserX className="size-4" />
                ) : (
                  <UserCheck className="size-4" />
                )}
              </Button>
            </div>
          ))
        ) : (
          <p className="p-5 text-center text-sm text-muted-foreground">لا توجد أقسام بعد.</p>
        )}
      </div>
    </Modal>
  );
}
