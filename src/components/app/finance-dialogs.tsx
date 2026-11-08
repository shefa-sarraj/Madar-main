import { useQuery } from "@tanstack/react-query";
import { Plus, Printer, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { MadarLogo } from "@/components/app/brand";
import { FormField } from "@/components/app/form-field";
import { Modal } from "@/components/app/modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  centsToStr,
  financeError,
  fmtMoney,
  isValidMoney,
  PAYMENT_METHOD,
  todayISO,
  toCents,
  type Installment,
  type StudentFee,
  type FinanceData,
} from "@/lib/finance";
import { formatDate } from "@/lib/students";
import { useWorkspace } from "@/lib/workspace";

type Target = {
  key: string;
  fee: StudentFee;
  inst: Installment | null;
  label: string;
  due: string | null;
  remaining: number;
};

/* ============ Record payment ============ */
export function RecordPaymentDialog({
  open,
  onOpenChange,
  student,
  fees,
  installments,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  student: { id: string; full_name: string; student_number: string } | null;
  fees: StudentFee[];
  installments: Installment[];
  onSaved: (paymentId: string) => void;
}) {
  const targets = useMemo<Target[]>(() => {
    if (!student) return [];
    const list: Target[] = [];
    for (const f of fees.filter(
      (x) => x.student_id === student.id && !["cancelled", "waived", "paid"].includes(x.status),
    )) {
      const inst = installments.filter(
        (i) => i.student_fee_id === f.id && toCents(i.amount) > toCents(i.amount_paid),
      );
      if (inst.length) {
        for (const i of inst)
          list.push({
            key: i.id,
            fee: f,
            inst: i,
            label: `${f.name} — القسط ${i.installment_number}`,
            due: i.due_date,
            remaining: toCents(i.amount) - toCents(i.amount_paid),
          });
      }
      const unplanned =
        toCents(f.balance) -
        inst.reduce((sum, i) => sum + toCents(i.amount) - toCents(i.amount_paid), 0);
      if (unplanned > 0) {
        list.push({
          key: f.id,
          fee: f,
          inst: null,
          label: f.name,
          due: f.due_date,
          remaining: unplanned,
        });
      }
    }
    return list.sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  }, [student, fees, installments]);

  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [date, setDate] = useState(todayISO());
  const [ref, setRef] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAlloc({});
      setAmount("");
      setMethod("cash");
      setDate(todayISO());
      setRef("");
      setNotes("");
    }
  }, [open]);

  const totalOutstanding = targets.reduce((a, t) => a + t.remaining, 0);
  const allocated = Object.values(alloc).reduce((a, v) => a + toCents(v), 0);

  function autoDistribute(value: string) {
    setAmount(value);
    let left = toCents(value);
    const next: Record<string, string> = {};
    for (const t of targets) {
      if (left <= 0) break;
      const take = Math.min(left, t.remaining);
      next[t.key] = centsToStr(take);
      left -= take;
    }
    setAlloc(next);
  }

  async function save() {
    if (!student) return;
    if (!isValidMoney(amount)) return void toast.error("أدخل مبلغاً صحيحاً");
    if (toCents(amount) > totalOutstanding)
      return void toast.error("المبلغ أكبر من إجمالي المتبقي على الطالب");
    if (allocated !== toCents(amount))
      return void toast.error("مجموع التوزيع يجب أن يساوي مبلغ الدفعة");
    for (const t of targets)
      if (toCents(alloc[t.key]) > t.remaining)
        return void toast.error(`المبلغ يتجاوز المتبقي على: ${t.label}`);
    const allocations = targets
      .filter((t) => toCents(alloc[t.key]) > 0)
      .map((t) => ({
        student_fee_id: t.fee.id,
        installment_id: t.inst?.id ?? null,
        amount: centsToStr(toCents(alloc[t.key])),
      }));
    setSaving(true);
    const { data, error } = await supabase.rpc("record_payment", {
      _student_id: student.id,
      _amount: Number(centsToStr(toCents(amount))),
      _method: method as "cash",
      _payment_date: date,
      _reference: ref,
      _notes: notes,
      _allocations: allocations,
    });
    setSaving(false);
    if (error) return void toast.error(financeError(error));
    toast.success("تم تسجيل الدفعة");
    onOpenChange(false);
    onSaved(data as string);
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="تسجيل دفعة"
      description={student ? `${student.full_name} · ${student.student_number}` : undefined}
      footer={
        <>
          <Button onClick={save} disabled={saving || !targets.length}>
            {saving ? "جارٍ الحفظ..." : "حفظ الدفعة"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
        </>
      }
    >
      <div className="flex items-center justify-between rounded-lg bg-secondary/60 px-3 py-2 text-sm">
        <span className="text-muted-foreground">إجمالي المتبقي</span>
        <span className="tnum font-semibold text-primary">{fmtMoney(totalOutstanding)}</span>
      </div>
      {!targets.length ? (
        <p className="text-sm text-muted-foreground">لا توجد رسوم مستحقة على هذا الطالب.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="مبلغ الدفعة" required hint="يُوزَّع تلقائياً على الأقدم استحقاقاً">
              {(p) => (
                <Input
                  {...p}
                  dir="ltr"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => autoDistribute(e.target.value)}
                  placeholder="0.00"
                />
              )}
            </FormField>
            <FormField label="طريقة الدفع" required>
              {(p) => (
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger id={p.id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAYMENT_METHOD).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField label="تاريخ الدفع" required>
              {(p) => (
                <Input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              )}
            </FormField>
            <FormField label="رقم المرجع">
              {(p) => (
                <Input {...p} dir="ltr" value={ref} onChange={(e) => setRef(e.target.value)} />
              )}
            </FormField>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">توزيع الدفعة</p>
            <div className="max-h-56 space-y-2 overflow-y-auto">
              {targets.map((t) => (
                <div
                  key={t.key}
                  className="flex items-center gap-3 rounded-lg border border-border p-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.label}</p>
                    <p className="text-xs text-muted-foreground">
                      المتبقي <span className="tnum">{fmtMoney(t.remaining)}</span> · الاستحقاق{" "}
                      {formatDate(t.due)}
                    </p>
                  </div>
                  <Input
                    dir="ltr"
                    inputMode="decimal"
                    className="h-8 w-24"
                    value={alloc[t.key] ?? ""}
                    onChange={(e) => setAlloc((a) => ({ ...a, [t.key]: e.target.value }))}
                    placeholder="0.00"
                    aria-label={`مبلغ ${t.label}`}
                  />
                </div>
              ))}
            </div>
            <p
              className={`text-xs ${allocated === toCents(amount) ? "text-muted-foreground" : "text-destructive"}`}
            >
              الموزَّع: <span className="tnum">{fmtMoney(allocated)}</span> من{" "}
              <span className="tnum">{fmtMoney(toCents(amount))}</span>
            </p>
          </div>
          <FormField label="ملاحظات">
            {(p) => (
              <Textarea {...p} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            )}
          </FormField>
        </>
      )}
    </Modal>
  );
}

/* ============ Receipt ============ */
export function ReceiptDialog({
  paymentId,
  onOpenChange,
}: {
  paymentId: string | null;
  onOpenChange: (o: boolean) => void;
}) {
  const { activeSchool } = useWorkspace();
  const q = useQuery({
    queryKey: ["receipt", paymentId],
    enabled: !!paymentId,
    queryFn: async () => {
      const { data: p, error } = await supabase
        .from("payments")
        .select("*")
        .eq("id", paymentId!)
        .single();
      if (error) throw error;
      const [st, allocs, fees, en, prof] = await Promise.all([
        supabase
          .from("students")
          .select("full_name, student_number")
          .eq("id", p.student_id)
          .single(),
        supabase
          .from("payment_allocations")
          .select("amount, student_fee_id, installment:installments(installment_number)")
          .eq("payment_id", p.id),
        supabase
          .from("student_fees")
          .select("id, name, balance, status")
          .eq("student_id", p.student_id)
          .eq("academic_year_id", p.academic_year_id),
        supabase
          .from("student_enrollments")
          .select("grade:grades(name), section:sections(name)")
          .eq("student_id", p.student_id)
          .eq("academic_year_id", p.academic_year_id)
          .limit(1)
          .maybeSingle(),
        p.received_by
          ? supabase.from("profiles").select("full_name").eq("id", p.received_by).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const feeName = new Map((fees.data ?? []).map((f) => [f.id, f.name]));
      const remaining = (fees.data ?? [])
        .filter((f) => !["cancelled", "waived"].includes(f.status))
        .reduce((a, f) => a + toCents(f.balance), 0);
      return {
        p,
        student: st.data,
        lines: (allocs.data ?? []).map((a) => ({
          label: `${feeName.get(a.student_fee_id) ?? "رسم"}${a.installment ? ` — القسط ${(a.installment as { installment_number: number }).installment_number}` : ""}`,
          amount: toCents(a.amount),
        })),
        remaining,
        grade: (en.data?.grade as { name: string } | null)?.name,
        section: (en.data?.section as { name: string } | null)?.name,
        receiver: (prof.data as { full_name: string } | null)?.full_name,
      };
    },
  });
  const d = q.data;
  return (
    <Modal
      open={!!paymentId}
      onOpenChange={onOpenChange}
      title="إيصال قبض"
      footer={
        <>
          <Button onClick={() => window.print()}>
            <Printer className="size-4" /> طباعة الإيصال
          </Button>
          <Button
            variant="outline"
            onClick={() => window.print()}
            title="اختر «حفظ كملف PDF» من نافذة الطباعة"
          >
            حفظ PDF
          </Button>
        </>
      }
    >
      {!d ? (
        <p className="text-sm text-muted-foreground">جارٍ التحميل...</p>
      ) : (
        <div className="print-area space-y-4 text-sm" dir="rtl">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <p className="text-base font-semibold">{activeSchool?.name_ar}</p>
              <p className="text-xs text-muted-foreground">
                إيصال قبض رقم{" "}
                <span className="tnum font-medium text-foreground">{d.p.payment_number}</span>
              </p>
            </div>
            {activeSchool?.logo_url ? (
              <img src={activeSchool.logo_url} alt="" className="h-10" />
            ) : (
              <MadarLogo className="h-9" />
            )}
          </div>
          {d.p.status === "cancelled" ? (
            <p className="rounded-md bg-destructive/10 p-2 text-center font-semibold text-destructive">
              هذه الدفعة ملغاة
            </p>
          ) : null}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <Row k="تاريخ الدفع" v={formatDate(d.p.payment_date)} />
            <Row k="طريقة الدفع" v={PAYMENT_METHOD[d.p.payment_method] ?? d.p.payment_method} />
            <Row k="اسم الطالب" v={d.student?.full_name} />
            <Row k="الرقم المدرسي" v={d.student?.student_number} />
            <Row k="الصف / الشعبة" v={`${d.grade ?? "—"} / ${d.section ?? "—"}`} />
            <Row k="رقم المرجع" v={d.p.reference_number} />
          </dl>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="py-1.5 text-start font-medium">البند</th>
                <th className="py-1.5 text-end font-medium">المبلغ</th>
              </tr>
            </thead>
            <tbody>
              {d.lines.map((l, i) => (
                <tr key={i} className="border-b border-border/60">
                  <td className="py-1.5">{l.label}</td>
                  <td className="tnum py-1.5 text-end">{fmtMoney(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="space-y-1 rounded-lg bg-secondary/60 p-3">
            <div className="flex justify-between font-semibold">
              <span>المبلغ المدفوع</span>
              <span className="tnum text-primary">{fmtMoney(toCents(d.p.amount))}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>الرصيد المتبقي على الطالب</span>
              <span className="tnum">{fmtMoney(d.remaining)}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">استلمها: {d.receiver ?? "—"}</p>
        </div>
      )}
    </Modal>
  );
}
function Row({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="font-medium">{v || "—"}</dd>
    </div>
  );
}

/* ============ Add fee to student ============ */
export function AddFeeDialog({
  open,
  onOpenChange,
  schoolId,
  yearId,
  studentId,
  enrollment,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  schoolId: string;
  yearId: string;
  studentId: string;
  enrollment: { id: string; grade_id: string } | null;
  onSaved: () => void;
}) {
  const opts = useQuery({
    queryKey: ["fee-options", schoolId, yearId],
    enabled: open,
    queryFn: async () => {
      const [c, s] = await Promise.all([
        supabase
          .from("fee_categories")
          .select("id, name")
          .eq("school_id", schoolId)
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("fee_structures")
          .select("*")
          .eq("school_id", schoolId)
          .eq("academic_year_id", yearId)
          .eq("is_active", true),
      ]);
      return { cats: c.data ?? [], structures: s.data ?? [] };
    },
  });
  const [structureId, setStructureId] = useState("custom");
  const [catId, setCatId] = useState("");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setStructureId("custom");
      setCatId("");
      setName("");
      setAmount("");
      setDue("");
    }
  }, [open]);
  const structures = (opts.data?.structures ?? []).filter(
    (s) => !s.grade_id || s.grade_id === enrollment?.grade_id,
  );

  function pickStructure(id: string) {
    setStructureId(id);
    const s = structures.find((x) => x.id === id);
    if (s) {
      setCatId(s.fee_category_id);
      setName(s.name);
      setAmount(centsToStr(toCents(s.amount)));
      setDue(s.due_date ?? "");
    }
  }
  async function save() {
    if (!enrollment) return void toast.error("الطالب غير مسجل في السنة الحالية");
    if (!catId || !name.trim()) return void toast.error("اختر التصنيف وأدخل اسم الرسم");
    if (!isValidMoney(amount)) return void toast.error("أدخل مبلغاً صحيحاً");
    setSaving(true);
    const { error } = await supabase.from("student_fees").insert({
      school_id: schoolId,
      student_id: studentId,
      enrollment_id: enrollment.id,
      academic_year_id: yearId,
      fee_structure_id: structureId === "custom" ? null : structureId,
      fee_category_id: catId,
      name: name.trim(),
      original_amount: Number(centsToStr(toCents(amount))),
      due_date: due || null,
    });
    setSaving(false);
    if (error) return void toast.error(financeError(error));
    toast.success("تمت إضافة الرسم");
    onOpenChange(false);
    onSaved();
  }
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="إضافة رسم للطالب"
      footer={
        <>
          <Button onClick={save} disabled={saving}>
            حفظ
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
        </>
      }
    >
      <FormField label="من هيكل الرسوم">
        {(p) => (
          <Select value={structureId} onValueChange={pickStructure}>
            <SelectTrigger id={p.id}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="custom">رسم مخصص</SelectItem>
              {structures.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} — {fmtMoney(toCents(s.amount))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>
      <FormField label="التصنيف" required>
        {(p) => (
          <Select value={catId} onValueChange={setCatId}>
            <SelectTrigger id={p.id}>
              <SelectValue placeholder="اختر" />
            </SelectTrigger>
            <SelectContent>
              {(opts.data?.cats ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>
      <FormField label="اسم الرسم" required>
        {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="المبلغ" required>
          {(p) => (
            <Input
              {...p}
              dir="ltr"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          )}
        </FormField>
        <FormField label="تاريخ الاستحقاق">
          {(p) => <Input {...p} type="date" value={due} onChange={(e) => setDue(e.target.value)} />}
        </FormField>
      </div>
    </Modal>
  );
}

function useFinanceTarget(open: boolean, initialFee: StudentFee | null, data?: FinanceData) {
  const [studentId, setStudentId] = useState("");
  const [feeId, setFeeId] = useState("");
  useEffect(() => {
    setStudentId(initialFee?.student_id ?? "");
    setFeeId(initialFee?.id ?? "");
  }, [open, initialFee?.id, initialFee?.student_id]);
  return {
    studentId,
    feeId,
    fee: data
      ? (data.fees.find((f) => f.id === feeId && f.student_id === studentId) ?? null)
      : initialFee,
    selectStudent: (id: string) => {
      setStudentId(id);
      setFeeId("");
    },
    selectFee: setFeeId,
  };
}

function FinanceTargetFields({
  data,
  target,
  saving,
}: {
  data: FinanceData;
  target: ReturnType<typeof useFinanceTarget>;
  saving: boolean;
}) {
  const fees = data.fees.filter((f) => f.student_id === target.studentId);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FormField label="الطالب" required>
        {(p) => (
          <Select
            dir="rtl"
            value={target.studentId}
            onValueChange={target.selectStudent}
            disabled={saving}
          >
            <SelectTrigger id={p.id}>
              <SelectValue placeholder="اختر الطالب" />
            </SelectTrigger>
            <SelectContent>
              {data.students.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.full_name} — {s.student_number}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>
      <FormField label="الرسم المرتبط" required>
        {(p) => (
          <Select
            dir="rtl"
            value={target.feeId}
            onValueChange={target.selectFee}
            disabled={saving || !target.studentId}
          >
            <SelectTrigger id={p.id}>
              <SelectValue placeholder="اختر الرسم" />
            </SelectTrigger>
            <SelectContent>
              {fees.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name} — المتبقي {fmtMoney(toCents(f.balance))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>
      {target.studentId && !fees.length ? (
        <p className="text-sm text-muted-foreground sm:col-span-2">
          لا توجد رسوم لهذا الطالب في السنة الدراسية الحالية.
        </p>
      ) : null}
    </div>
  );
}

/* ============ Installment plan ============ */
export function InstallmentPlanDialog({
  fee: initialFee,
  open,
  data,
  onOpenChange,
  onSaved,
}: {
  fee: StudentFee | null;
  open?: boolean;
  data?: FinanceData;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const isOpen = open ?? !!initialFee;
  const target = useFinanceTarget(isOpen, initialFee, data);
  const fee = target.fee;
  const blocked =
    fee &&
    (fee.status === "cancelled" ||
      fee.status === "waived" ||
      toCents(fee.balance) <= 0 ||
      data?.allocations.some((a) => a.student_fee_id === fee.id && a.installment_id !== null));
  const [name, setName] = useState("خطة تقسيط");
  const [rows, setRows] = useState<{ amount: string; due_date: string }[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!fee) {
      setRows([]);
      return;
    }
    const total = toCents(fee.balance);
    const existing = data?.installments
      .filter((i) => i.student_fee_id === fee.id)
      .sort((a, b) => a.installment_number - b.installment_number);
    setName("خطة تقسيط");
    setRows(
      existing?.length
        ? existing.map((i) => ({ amount: centsToStr(toCents(i.amount)), due_date: i.due_date }))
        : [{ amount: centsToStr(total), due_date: fee.due_date ?? "" }],
    );
  }, [fee, isOpen, data]);
  const sum = rows.reduce((a, r) => a + toCents(r.amount), 0);
  const total = fee ? toCents(fee.balance) : 0;
  async function save() {
    if (!fee || saving || blocked) return;
    if (rows.some((r) => !isValidMoney(r.amount) || !r.due_date))
      return void toast.error("أدخل مبلغاً وتاريخاً لكل قسط");
    if (sum !== total) return void toast.error("مجموع الأقساط يجب أن يساوي الرصيد المتبقي");
    if (rows.some((r, i) => i > 0 && r.due_date < rows[i - 1]!.due_date))
      return void toast.error("رتّب الأقساط حسب تاريخ الاستحقاق");
    setSaving(true);
    const { error } = await supabase.rpc("set_installment_plan", {
      _student_fee_id: fee.id,
      _name: name,
      _items: rows.map((r) => ({ amount: centsToStr(toCents(r.amount)), due_date: r.due_date })),
    });
    setSaving(false);
    if (error) return void toast.error(financeError(error));
    toast.success("تم حفظ خطة التقسيط");
    onOpenChange(false);
    onSaved();
  }
  return (
    <Modal
      open={isOpen}
      onOpenChange={onOpenChange}
      title="إضافة قسط"
      description={fee ? `${fee.name} — ${fmtMoney(total)}` : undefined}
      footer={
        <>
          <Button
            onClick={save}
            disabled={
              saving ||
              !fee ||
              !!blocked ||
              sum !== total ||
              rows.some(
                (r, i) =>
                  !isValidMoney(r.amount) ||
                  !r.due_date ||
                  (i > 0 && r.due_date < rows[i - 1]!.due_date),
              )
            }
          >
            حفظ الخطة
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
        </>
      }
    >
      {data ? <FinanceTargetFields data={data} target={target} saving={saving} /> : null}
      {fee ? (
        <dl className="grid grid-cols-2 gap-3 text-sm" dir="rtl">
          <Row k="إجمالي الرسم" v={fmtMoney(toCents(fee.final_amount))} />
          <Row k="المدفوع" v={fmtMoney(toCents(fee.amount_paid))} />
          <Row k="المتبقي" v={fmtMoney(total)} />
          <Row k="الحد الأقصى المتاح للتقسيط" v={fmtMoney(blocked ? 0 : total)} />
        </dl>
      ) : null}
      {blocked ? (
        <p role="alert" className="text-sm text-destructive">
          لا يمكن تقسيط رسم مسدد بالكامل أو ملغى أو معفى، أو تعديل أقساط مرتبطة بدفعات.
        </p>
      ) : null}
      <fieldset disabled={saving || !fee || !!blocked} className="space-y-4">
        <FormField label="اسم الخطة">
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}
        </FormField>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[4rem_1fr_1fr_auto]"
            >
              <span className="col-span-2 text-xs text-muted-foreground sm:col-span-1">
                القسط {i + 1}
              </span>
              <Input
                dir="ltr"
                inputMode="decimal"
                className="col-span-2 h-9 sm:col-span-1"
                value={r.amount}
                aria-label={`مبلغ القسط ${i + 1}`}
                onChange={(e) =>
                  setRows((x) => x.map((y, j) => (j === i ? { ...y, amount: e.target.value } : y)))
                }
              />
              <Input
                type="date"
                className="h-9"
                value={r.due_date}
                aria-label={`تاريخ القسط ${i + 1}`}
                onChange={(e) =>
                  setRows((x) =>
                    x.map((y, j) => (j === i ? { ...y, due_date: e.target.value } : y)),
                  )
                }
              />
              <Button
                variant="ghost"
                size="icon"
                disabled={rows.length === 1}
                onClick={() => setRows((x) => x.filter((_, j) => j !== i))}
                aria-label="حذف القسط"
                title="حذف القسط"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRows((x) => [...x, { amount: "", due_date: "" }])}
          >
            <Plus className="size-4" /> إضافة قسط
          </Button>
        </div>
        <p className={`text-xs ${sum === total ? "text-muted-foreground" : "text-destructive"}`}>
          المجموع <span className="tnum">{fmtMoney(sum)}</span> من{" "}
          <span className="tnum">{fmtMoney(total)}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          التقسيط اختياري للرصيد المتبقي فقط. تُرقّم الأقساط حسب تاريخ الاستحقاق.
        </p>
      </fieldset>
    </Modal>
  );
}

/* ============ Discount ============ */
export function DiscountDialog({
  fee: initialFee,
  open,
  data,
  onOpenChange,
  onSaved,
}: {
  fee: StudentFee | null;
  open?: boolean;
  data?: FinanceData;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const isOpen = open ?? !!initialFee;
  const target = useFinanceTarget(isOpen, initialFee, data);
  const fee = target.fee;
  const blocked =
    fee &&
    (fee.status === "cancelled" ||
      fee.status === "waived" ||
      toCents(fee.balance) <= 0 ||
      data?.installments.some((i) => i.student_fee_id === fee.id));
  const [name, setName] = useState("خصم إخوة");
  const [type, setType] = useState<"percentage" | "fixed">("percentage");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setName("خصم إخوة");
    setType("percentage");
    setValue("");
    setReason("");
  }, [fee, isOpen]);
  const preview =
    fee && isValidMoney(value)
      ? type === "percentage"
        ? Math.round((toCents(fee.original_amount) * toCents(value)) / 10000)
        : toCents(value)
      : 0;
  async function save() {
    if (!fee || saving || blocked) return;
    if (!name.trim() || !isValidMoney(value)) return void toast.error("أدخل اسم الخصم وقيمته");
    if (type === "percentage" && toCents(value) > 10000)
      return void toast.error("النسبة لا تتجاوز 100%");
    if (preview <= 0 || preview > toCents(fee.balance))
      return void toast.error("قيمة الخصم يجب أن تكون أكبر من صفر ولا تتجاوز المتبقي على الرسم");
    setSaving(true);
    const { error } = await supabase.rpc("add_discount", {
      _student_fee_id: fee.id,
      _name: name.trim(),
      _type: type,
      _value: Number(value),
      ...(reason ? { _reason: reason } : {}),
    });
    setSaving(false);
    if (error) return void toast.error(financeError(error));
    toast.success("تمت إضافة الخصم");
    onOpenChange(false);
    onSaved();
  }
  return (
    <Modal
      open={isOpen}
      onOpenChange={onOpenChange}
      title="إضافة خصم"
      description={fee ? `${fee.name} — ${fmtMoney(toCents(fee.original_amount))}` : undefined}
      footer={
        <>
          <Button
            onClick={save}
            disabled={
              saving ||
              !fee ||
              !!blocked ||
              !isValidMoney(value) ||
              preview <= 0 ||
              preview > toCents(fee.balance) ||
              (type === "percentage" && toCents(value) > 10000)
            }
          >
            حفظ الخصم
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
        </>
      }
    >
      {data ? <FinanceTargetFields data={data} target={target} saving={saving} /> : null}
      {blocked ? (
        <p role="alert" className="text-sm text-destructive">
          لا يمكن إضافة خصم لرسم ملغى أو معفى أو مسدد بالكامل أو له خطة تقسيط. أضف الخصم قبل إنشاء
          الأقساط.
        </p>
      ) : null}
      <fieldset disabled={saving || !fee || !!blocked} className="space-y-4">
        <FormField label="تصنيف الخصم" required>
          {(p) => (
            <Select value={name} onValueChange={setName}>
              <SelectTrigger id={p.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["خصم إخوة", "منحة", "خصم موظفين", "خصم خاص"].map((x) => (
                  <SelectItem key={x} value={x}>
                    {x}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="نوع الخصم" required>
            {(p) => (
              <Select value={type} onValueChange={(v) => setType(v as "percentage" | "fixed")}>
                <SelectTrigger id={p.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">نسبة مئوية</SelectItem>
                  <SelectItem value="fixed">مبلغ ثابت</SelectItem>
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField label={type === "percentage" ? "النسبة %" : "المبلغ"} required>
            {(p) => (
              <Input
                {...p}
                dir="ltr"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            )}
          </FormField>
        </div>
        <FormField label="السبب">
          {(p) => (
            <Textarea {...p} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          )}
        </FormField>
        <p className="text-xs text-muted-foreground">
          قيمة الخصم: <span className="tnum font-medium text-foreground">{fmtMoney(preview)}</span>
        </p>
        <FormField label="الحالة بعد الحفظ">
          {(p) => (
            <p id={p.id} className="text-sm font-medium">
              فعال — يُطبّق فوراً على الرسم المحدد
            </p>
          )}
        </FormField>
        {fee &&
        value &&
        (!isValidMoney(value) ||
          preview <= 0 ||
          (type === "percentage" && toCents(value) > 10000) ||
          (fee && preview > toCents(fee.balance))) ? (
          <p role="alert" className="text-sm text-destructive">
            أدخل قيمة موجبة لا تتجاوز المتبقي على الرسم، وبنسبة لا تتجاوز 100%.
          </p>
        ) : null}
      </fieldset>
    </Modal>
  );
}

/* ============ Cancel payment ============ */
export function CancelPaymentDialog({
  paymentId,
  onOpenChange,
  onSaved,
}: {
  paymentId: string | null;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    setReason("");
    setConfirm(false);
  }, [paymentId]);
  async function save() {
    if (!paymentId || !reason.trim()) return void toast.error("سبب الإلغاء مطلوب");
    const { error } = await supabase.rpc("cancel_payment", {
      _payment_id: paymentId,
      _reason: reason.trim(),
    });
    if (error) return void toast.error(financeError(error));
    toast.success("تم إلغاء الدفعة وإعادة احتساب الأرصدة");
    onOpenChange(false);
    onSaved();
  }
  return (
    <Modal
      open={!!paymentId}
      onOpenChange={onOpenChange}
      title="إلغاء دفعة"
      description="لا تُحذف الدفعة؛ تبقى في السجل بحالة «ملغاة» ويُعاد احتساب أرصدة الرسوم."
      footer={
        <>
          <Button variant="destructive" onClick={save} disabled={!confirm}>
            إلغاء الدفعة
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            تراجع
          </Button>
        </>
      }
    >
      <FormField label="سبب الإلغاء" required>
        {(p) => (
          <Textarea {...p} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        )}
      </FormField>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={confirm} onCheckedChange={(v) => setConfirm(!!v)} /> أؤكد إلغاء هذه
        الدفعة
      </label>
    </Modal>
  );
}
