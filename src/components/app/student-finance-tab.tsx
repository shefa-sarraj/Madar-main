import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CalendarRange, Lock, Percent, Plus, Receipt, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import {
  AddFeeDialog,
  CancelPaymentDialog,
  DiscountDialog,
  InstallmentPlanDialog,
  ReceiptDialog,
  RecordPaymentDialog,
} from "@/components/app/finance-dialogs";
import { Section } from "@/components/app/student-shared";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  canManageFinance,
  canViewFinance,
  computeTotals,
  fetchFinance,
  FEE_STATUS,
  financeError,
  fmtMoney,
  INSTALLMENT_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  toCents,
  type StudentFee,
} from "@/lib/finance";
import { formatDate } from "@/lib/students";
import { useWorkspace } from "@/lib/workspace";

export function StudentFinanceTab({
  studentId,
  enrollment,
}: {
  studentId: string;
  enrollment: { id: string; grade_id: string } | null;
}) {
  const { activeSchool, activeYear, roles, can } = useWorkspace();
  const qc = useQueryClient();
  const canView = can("fees", "view", canViewFinance(roles));
  const canManage = can("fees", "edit", canManageFinance(roles));
  const canCreate = can("fees", "create", canManageFinance(roles));
  const canAdminister = can("fees", "manage", canManageFinance(roles));
  const key = ["student-finance", studentId, activeYear?.id];
  const q = useQuery({
    queryKey: key,
    enabled: !!activeSchool && !!activeYear && canView,
    queryFn: () => fetchFinance(activeSchool!.id, activeYear!.id, studentId),
  });
  const [payOpen, setPayOpen] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [addFee, setAddFee] = useState(false);
  const [planFee, setPlanFee] = useState<StudentFee | null>(null);
  const [discFee, setDiscFee] = useState<StudentFee | null>(null);
  const [cancelPay, setCancelPay] = useState<string | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["student-finance", studentId] });
    qc.invalidateQueries({ queryKey: ["finance"] });
    qc.invalidateQueries({ queryKey: ["dashboard-v2"] });
  };

  if (!canView) return <EmptyState icon={Lock} title="لا تملك صلاحية عرض البيانات المالية" />;
  if (!activeYear) return <EmptyState icon={Wallet} title="حدد سنة دراسية لعرض البيانات المالية" />;
  if (q.isLoading) return <Skeleton className="h-64 w-full" />;
  if (q.isError || !q.data) {
    return (
      <EmptyState
        icon={Wallet}
        title="تعذر تحميل البيانات المالية"
        description="حاول مرة أخرى. إذا استمرت المشكلة فتواصل مع مسؤول النظام."
        action={
          <Button variant="outline" onClick={() => void q.refetch()}>
            إعادة المحاولة
          </Button>
        }
      />
    );
  }
  const d = q.data;
  const t = computeTotals(d);
  const student = d.students[0] ?? null;

  async function cancelDiscount(id: string) {
    const { error } = await supabase.rpc("deactivate_discount", { _discount_id: id });
    if (error) toast.error(financeError(error));
    else {
      toast.success("تم إلغاء الخصم");
      refresh();
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Mini label="إجمالي الرسوم" v={fmtMoney(t.total + t.discounts)} />
        <Mini label="إجمالي الخصومات" v={fmtMoney(t.discounts)} />
        <Mini label="المدفوع" v={fmtMoney(t.collected)} tone="text-success" />
        <Mini label="المتبقي" v={fmtMoney(t.outstanding)} tone="text-primary" />
        <Mini
          label="المتأخر"
          v={fmtMoney(t.overdue)}
          tone={t.overdue ? "text-destructive" : undefined}
        />
      </div>

      <Section
        title="الرسوم"
        description={`السنة الدراسية ${activeYear.name}`}
        actions={
          canCreate ? (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setAddFee(true)}>
                <Plus className="size-4" /> إضافة رسم
              </Button>
              <Button size="sm" onClick={() => setPayOpen(true)} disabled={!t.outstanding}>
                <Wallet className="size-4" /> تسجيل دفعة
              </Button>
            </div>
          ) : undefined
        }
      >
        <DataTable
          rows={d.fees}
          rowKey={(r) => r.id}
          emptyTitle="لا توجد رسوم على الطالب لهذه السنة"
          columns={[
            {
              key: "n",
              header: "الرسم",
              cell: (r) => <span className="font-medium">{r.name}</span>,
            },
            {
              key: "o",
              header: "الأصلي",
              cell: (r) => <span className="tnum">{fmtMoney(toCents(r.original_amount))}</span>,
            },
            {
              key: "d",
              header: "الخصم",
              cell: (r) => <span className="tnum">{fmtMoney(toCents(r.discount_amount))}</span>,
            },
            {
              key: "f",
              header: "النهائي",
              cell: (r) => <span className="tnum">{fmtMoney(toCents(r.final_amount))}</span>,
            },
            {
              key: "p",
              header: "المدفوع",
              cell: (r) => <span className="tnum">{fmtMoney(toCents(r.amount_paid))}</span>,
            },
            {
              key: "b",
              header: "المتبقي",
              cell: (r) => <span className="tnum font-medium">{fmtMoney(toCents(r.balance))}</span>,
            },
            { key: "due", header: "الاستحقاق", cell: (r) => formatDate(r.due_date) },
            {
              key: "s",
              header: "الحالة",
              cell: (r) => (
                <StatusBadge tone={FEE_STATUS[r.status]?.tone}>
                  {FEE_STATUS[r.status]?.label}
                </StatusBadge>
              ),
            },
            ...(canManage
              ? [
                  {
                    key: "a",
                    header: "",
                    cell: (r: StudentFee) =>
                      r.status === "cancelled" ||
                      r.status === "waived" ||
                      r.status === "paid" ? null : (
                        <div className="flex gap-1">
                          {!d.installments.some((i) => i.student_fee_id === r.id) ? (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                title="خطة تقسيط"
                                aria-label="خطة تقسيط"
                                onClick={() => setPlanFee(r)}
                              >
                                <CalendarRange className="size-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                title="خصم"
                                aria-label="خصم"
                                disabled={!canCreate}
                                onClick={() => setDiscFee(r)}
                              >
                                <Percent className="size-4" />
                              </Button>
                            </>
                          ) : null}
                        </div>
                      ),
                  },
                ]
              : []),
          ]}
        />
      </Section>

      {d.installments.length > 0 ? (
        <Section title="خطة التقسيط">
          <DataTable
            rows={d.installments}
            rowKey={(r) => r.id}
            emptyTitle="لا توجد خطط تقسيط"
            columns={[
              {
                key: "f",
                header: "الرسم",
                cell: (r) => d.fees.find((f) => f.id === r.student_fee_id)?.name ?? "—",
              },
              {
                key: "n",
                header: "القسط",
                cell: (r) => <span className="tnum">{r.installment_number}</span>,
              },
              {
                key: "a",
                header: "المبلغ",
                cell: (r) => <span className="tnum">{fmtMoney(toCents(r.amount))}</span>,
              },
              {
                key: "p",
                header: "المدفوع",
                cell: (r) => <span className="tnum">{fmtMoney(toCents(r.amount_paid))}</span>,
              },
              { key: "d", header: "الاستحقاق", cell: (r) => formatDate(r.due_date) },
              {
                key: "s",
                header: "الحالة",
                cell: (r) => (
                  <StatusBadge tone={INSTALLMENT_STATUS[r.status]?.tone}>
                    {INSTALLMENT_STATUS[r.status]?.label}
                  </StatusBadge>
                ),
              },
            ]}
          />
        </Section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="المدفوعات والإيصالات">
          <DataTable
            rows={d.payments}
            rowKey={(r) => r.id}
            emptyTitle="لا توجد مدفوعات"
            columns={[
              {
                key: "n",
                header: "رقم الإيصال",
                cell: (r) => <span className="tnum">{r.payment_number}</span>,
              },
              { key: "d", header: "التاريخ", cell: (r) => formatDate(r.payment_date) },
              {
                key: "a",
                header: "المبلغ",
                cell: (r) => <span className="tnum">{fmtMoney(toCents(r.amount))}</span>,
              },
              { key: "m", header: "الطريقة", cell: (r) => PAYMENT_METHOD[r.payment_method] },
              {
                key: "s",
                header: "الحالة",
                cell: (r) => (
                  <StatusBadge tone={PAYMENT_STATUS[r.status]?.tone}>
                    {PAYMENT_STATUS[r.status]?.label}
                  </StatusBadge>
                ),
              },
              {
                key: "x",
                header: "",
                cell: (r) => (
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      title="الإيصال"
                      aria-label="الإيصال"
                      onClick={() => setReceipt(r.id)}
                    >
                      <Receipt className="size-4" />
                    </Button>
                    {canAdminister && r.status === "completed" ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="إلغاء الدفعة"
                        aria-label="إلغاء الدفعة"
                        onClick={() => setCancelPay(r.id)}
                      >
                        <Ban className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                ),
              },
            ]}
          />
        </Section>
        <Section title="الخصومات">
          <DataTable
            rows={d.discounts}
            rowKey={(r) => r.id}
            emptyTitle="لا توجد خصومات"
            columns={[
              { key: "n", header: "الخصم", cell: (r) => r.name },
              {
                key: "v",
                header: "القيمة",
                cell: (r) => (r.type === "percentage" ? `${r.value}%` : fmtMoney(toCents(r.value))),
              },
              {
                key: "a",
                header: "المبلغ",
                cell: (r) => <span className="tnum">{fmtMoney(toCents(r.calculated_amount))}</span>,
              },
              {
                key: "s",
                header: "الحالة",
                cell: (r) => (
                  <StatusBadge tone={r.is_active ? "success" : "neutral"}>
                    {r.is_active ? "فعال" : "ملغى"}
                  </StatusBadge>
                ),
              },
              ...(canAdminister
                ? [
                    {
                      key: "x",
                      header: "",
                      cell: (r: (typeof d.discounts)[number]) =>
                        r.is_active ? (
                          <Button size="sm" variant="ghost" onClick={() => cancelDiscount(r.id)}>
                            إلغاء
                          </Button>
                        ) : null,
                    },
                  ]
                : []),
            ]}
          />
        </Section>
      </div>

      <RecordPaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        student={student}
        fees={d.fees}
        installments={d.installments}
        onSaved={(id) => {
          refresh();
          setReceipt(id);
        }}
      />
      <ReceiptDialog paymentId={receipt} onOpenChange={(o) => !o && setReceipt(null)} />
      {activeSchool ? (
        <AddFeeDialog
          open={addFee}
          onOpenChange={setAddFee}
          schoolId={activeSchool.id}
          yearId={activeYear.id}
          studentId={studentId}
          enrollment={enrollment}
          onSaved={refresh}
        />
      ) : null}
      <InstallmentPlanDialog
        fee={planFee}
        data={d}
        onOpenChange={(o) => !o && setPlanFee(null)}
        onSaved={refresh}
      />
      <DiscountDialog
        fee={discFee}
        onOpenChange={(o) => !o && setDiscFee(null)}
        onSaved={refresh}
      />
      <CancelPaymentDialog
        paymentId={cancelPay}
        onOpenChange={(o) => !o && setCancelPay(null)}
        onSaved={refresh}
      />
    </div>
  );
}

function Mini({ label, v, tone }: { label: string; v: string; tone?: string | undefined }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5 shadow-card">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`tnum mt-1.5 text-lg font-semibold ${tone ?? "text-foreground"}`}>{v}</p>
    </div>
  );
}
