import { completeQueries, completeIds } from "@/lib/supabase-read";
import { userError } from "@/lib/user-error";
import type { StatusTone } from "@/components/app/status-badge";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

/* ---------- Money: all arithmetic in integer cents to avoid float rounding ---------- */
export const toCents = (v: number | string | null | undefined) => {
  if (v === null || v === undefined || v === "") return 0;
  const s = String(v).trim();
  const neg = s.startsWith("-");
  const [i = "0", f = ""] = s.replace("-", "").split(".");
  const cents = parseInt(i || "0", 10) * 100 + parseInt((f + "00").slice(0, 2), 10);
  return Number.isNaN(cents) ? 0 : neg ? -cents : cents;
};
export const centsToStr = (c: number) => {
  const neg = c < 0;
  const a = Math.abs(c);
  return `${neg ? "-" : ""}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
};
export const fmtMoney = (c: number, currency = "USD") =>
  `${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency === "USD" ? "$" : currency}`;
export const sumCents = <T>(rows: T[], pick: (r: T) => number | string | null | undefined) =>
  rows.reduce((acc, r) => acc + toCents(pick(r)), 0);
export const isValidMoney = (s: string) => /^\d+(\.\d{1,2})?$/.test(s.trim()) && toCents(s) > 0;

/* ---------- Labels ---------- */
export const FEE_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  unpaid: { label: "غير مدفوع", tone: "neutral" },
  partial: { label: "مدفوع جزئياً", tone: "info" },
  paid: { label: "مدفوع", tone: "success" },
  overdue: { label: "متأخر", tone: "danger" },
  waived: { label: "معفى", tone: "gold" },
  cancelled: { label: "ملغى", tone: "neutral" },
};
export const INSTALLMENT_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  upcoming: { label: "قادم", tone: "neutral" },
  due: { label: "مستحق قريباً", tone: "warning" },
  partial: { label: "مدفوع جزئياً", tone: "info" },
  paid: { label: "مدفوع", tone: "success" },
  overdue: { label: "متأخر", tone: "danger" },
};
export const PAYMENT_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  completed: { label: "مكتملة", tone: "success" },
  pending: { label: "معلقة", tone: "warning" },
  cancelled: { label: "ملغاة", tone: "danger" },
  refunded: { label: "مستردة", tone: "neutral" },
};
export const PAYMENT_METHOD: Record<string, string> = {
  cash: "نقداً",
  bank_transfer: "تحويل بنكي",
  card: "بطاقة",
  other: "أخرى",
};
export const EXPENSE_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  recorded: { label: "مسجل", tone: "success" },
  cancelled: { label: "ملغى", tone: "danger" },
};
export const COST_CENTER_TYPE: Record<string, string> = {
  school: "المدرسة",
  stage: "مرحلة",
  department: "قسم",
  custom: "مخصص",
};

/* ---------- Permissions (UI mirror of DB can_manage_finance / can_view_finance) ---------- */
const FIN_MANAGERS = ["super_admin", "school_owner", "school_manager", "accountant"];
export const canManageFinance = (roles: string[]) => roles.some((r) => FIN_MANAGERS.includes(r));
export const canViewFinance = (roles: string[]) =>
  canManageFinance(roles) || roles.includes("registrar");

/* ---------- Dates ---------- */
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const addDaysISO = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const daysBetween = (fromIso: string, toIso: string) =>
  Math.round(
    (new Date(`${toIso}T00:00:00`).getTime() - new Date(`${fromIso}T00:00:00`).getTime()) /
      86400000,
  );

/* ---------- Data ---------- */
export type StudentFee = Tables<"student_fees">;
export type Installment = Tables<"installments">;
export type Payment = Tables<"payments">;
export type Allocation = Tables<"payment_allocations">;
export type Discount = Tables<"discounts">;

export type FinanceData = {
  fees: StudentFee[];
  installments: Installment[];
  payments: Payment[];
  allocations: Allocation[];
  discounts: Discount[];
  categories: Tables<"fee_categories">[];
  students: { id: string; full_name: string; student_number: string }[];
  enrollments: { id: string; student_id: string; grade_id: string; section_id: string | null }[];
  guardians: Record<string, { name: string; phone: string }>;
  profiles: Record<string, string>;
};

export type Expense = Tables<"expenses">;
export type ExpenseCategory = Tables<"expense_categories">;
export type CostCenter = Tables<"cost_centers">;

export type ExpenseRow = Expense & {
  category_name: string;
  cost_center_name: string | null;
  created_by_name: string | null;
};

export type ExpenseData = {
  expenses: ExpenseRow[];
  categories: ExpenseCategory[];
  costCenters: CostCenter[];
};

export const expenseKey = (schoolId?: string, yearId?: string) =>
  ["expenses", schoolId, yearId] as const;

export async function fetchExpenses(
  schoolId: string,
  yearId: string,
  client = supabase,
): Promise<ExpenseData> {
  const [expenses, categories, costCenters] = await completeQueries([
    client
      .from("expenses")
      .select("*, category:expense_categories(name), cost_center:cost_centers(name)")
      .eq("school_id", schoolId)
      .eq("academic_year_id", yearId)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false }),
    client.from("expense_categories").select("*").eq("school_id", schoolId).order("name"),
    client.from("cost_centers").select("*").eq("school_id", schoolId).order("name"),
  ]);
  for (const result of [expenses, categories, costCenters]) {
    if (result.error) throw result.error;
  }

  const raw = (expenses.data ?? []) as unknown as Array<
    Expense & {
      category: { name: string } | null;
      cost_center: { name: string } | null;
    }
  >;
  const creatorIds = [...new Set(raw.map((row) => row.created_by).filter(Boolean))] as string[];
  const profiles = creatorIds.length
    ? await completeIds(creatorIds, (ids) =>
        client.from("profiles").select("id, full_name").in("id", ids),
      )
    : { data: [] as { id: string; full_name: string }[], error: null };
  if (profiles.error) throw profiles.error;
  const names = new Map((profiles.data ?? []).map((profile) => [profile.id, profile.full_name]));

  return {
    expenses: raw.map(({ category, cost_center: costCenter, ...expense }) => ({
      ...expense,
      category_name: category?.name ?? "غير مصنف",
      cost_center_name: costCenter?.name ?? null,
      created_by_name: expense.created_by ? (names.get(expense.created_by) ?? null) : null,
    })),
    categories: categories.data ?? [],
    costCenters: costCenters.data ?? [],
  };
}

export function computeExpenseSummary(
  expenses: Pick<ExpenseRow, "status" | "expense_date" | "amount" | "category_name">[],
  month = todayISO().slice(0, 7),
) {
  const recorded = expenses.filter((expense) => expense.status === "recorded");
  const thisMonth = sumCents(
    recorded.filter((expense) => expense.expense_date.startsWith(month)),
    (expense) => expense.amount,
  );
  const academicYear = sumCents(recorded, (expense) => expense.amount);
  const byCategory = new Map<string, number>();
  for (const expense of recorded) {
    byCategory.set(
      expense.category_name,
      (byCategory.get(expense.category_name) ?? 0) + toCents(expense.amount),
    );
  }
  const topCategory = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
  return {
    thisMonth,
    academicYear,
    topCategory: topCategory?.[0] ?? null,
    topCategoryAmount: topCategory?.[1] ?? 0,
    recordCount: expenses.length,
  };
}

export const financeKey = (schoolId?: string, yearId?: string) =>
  ["finance", schoolId, yearId] as const;

export async function fetchFinance(
  schoolId: string,
  yearId: string,
  studentId?: string,
  client = supabase,
): Promise<FinanceData> {
  await client.rpc("refresh_finance_statuses", { _school_id: schoolId });
  const sid = studentId ?? null;
  let feesQ = client
    .from("student_fees")
    .select("*")
    .eq("school_id", schoolId)
    .eq("academic_year_id", yearId);
  let paysQ = client
    .from("payments")
    .select("*")
    .eq("school_id", schoolId)
    .eq("academic_year_id", yearId);
  let discQ = client
    .from("discounts")
    .select("*")
    .eq("school_id", schoolId)
    .eq("academic_year_id", yearId);
  let studQ = client
    .from("students")
    .select("id, full_name, student_number")
    .eq("school_id", schoolId);
  let ensQ = client
    .from("student_enrollments")
    .select("id, student_id, grade_id, section_id")
    .eq("school_id", schoolId)
    .eq("academic_year_id", yearId);
  let linkQ = client
    .from("student_guardians")
    .select("student_id, guardian:guardians(full_name, phone)")
    .eq("school_id", schoolId)
    .eq("is_primary", true);
  if (sid) {
    feesQ = feesQ.eq("student_id", sid);
    paysQ = paysQ.eq("student_id", sid);
    discQ = discQ.eq("student_id", sid);
    studQ = studQ.eq("id", sid);
    ensQ = ensQ.eq("student_id", sid);
    linkQ = linkQ.eq("student_id", sid);
  }
  const [fees, inst, pays, disc, cats, studs, ens, links] = await completeQueries([
    feesQ.order("due_date", { nullsFirst: false }),
    client.from("installments").select("*").eq("school_id", schoolId).order("due_date"),
    paysQ.order("payment_date", { ascending: false }),
    discQ.order("created_at", { ascending: false }),
    client.from("fee_categories").select("*").eq("school_id", schoolId).order("name"),
    studQ,
    ensQ,
    linkQ,
  ]);
  for (const r of [fees, inst, pays, disc, cats, studs, ens]) if (r.error) throw r.error;
  const feeIds = new Set((fees.data ?? []).map((f) => f.id));
  const payIds = (pays.data ?? []).map((p) => p.id);
  const allocs = payIds.length
    ? await completeIds(payIds, (ids) =>
        client.from("payment_allocations").select("*").in("payment_id", ids),
      )
    : { data: [] as Allocation[], error: null };
  if (allocs.error) throw allocs.error;
  const receivers = [
    ...new Set((pays.data ?? []).map((p) => p.received_by).filter(Boolean)),
  ] as string[];
  const profs = receivers.length
    ? await completeIds(receivers, (ids) =>
        client.from("profiles").select("id, full_name").in("id", ids),
      )
    : { data: [] };
  const guardians: FinanceData["guardians"] = {};
  for (const l of (links.data ?? []) as {
    student_id: string;
    guardian: { full_name: string; phone: string } | null;
  }[]) {
    if (l.guardian)
      guardians[l.student_id] = { name: l.guardian.full_name, phone: l.guardian.phone };
  }
  return {
    fees: fees.data ?? [],
    installments: (inst.data ?? []).filter((i) => feeIds.has(i.student_fee_id)),
    payments: pays.data ?? [],
    allocations: allocs.data ?? [],
    discounts: disc.data ?? [],
    categories: cats.data ?? [],
    students: studs.data ?? [],
    enrollments: ens.data ?? [],
    guardians,
    profiles: Object.fromEntries((profs.data ?? []).map((p) => [p.id, p.full_name])),
  };
}

/** Consistent definitions (spec §17). Cancelled/waived fees are excluded from totals. */
export type FeeBalance = Pick<
  StudentFee,
  "id" | "student_id" | "status" | "due_date" | "balance" | "final_amount" | "amount_paid"
>;
export type InstallmentBalance = Pick<
  Installment,
  "student_fee_id" | "due_date" | "amount" | "amount_paid"
>;
export function computeTotals(d: {
  fees: FeeBalance[];
  installments: InstallmentBalance[];
  payments: unknown[];
  discounts: Pick<Discount, "is_active" | "calculated_amount">[];
}) {
  const today = todayISO();
  const live = d.fees.filter((f) => f.status !== "cancelled" && f.status !== "waived");
  const total = sumCents(live, (f) => f.final_amount);
  const collected = sumCents(live, (f) => f.amount_paid);
  const discounts = sumCents(
    d.discounts.filter((x) => x.is_active),
    (x) => x.calculated_amount,
  );
  const feesWithPlan = new Set(d.installments.map((i) => i.student_fee_id));
  let overdue = 0;
  const overdueStudents = new Set<string>();
  for (const f of live) {
    if (feesWithPlan.has(f.id)) {
      const od = d.installments.filter((i) => i.student_fee_id === f.id && i.due_date < today);
      const c = od.reduce((a, i) => a + toCents(i.amount) - toCents(i.amount_paid), 0);
      if (c > 0) {
        overdue += c;
        overdueStudents.add(f.student_id);
      }
    } else if (f.due_date && f.due_date < today && toCents(f.balance) > 0) {
      overdue += toCents(f.balance);
      overdueStudents.add(f.student_id);
    }
  }
  return {
    total,
    collected,
    outstanding: total - collected,
    overdue,
    discounts,
    overdueStudents: overdueStudents.size,
  };
}

export type OverdueRow = {
  student_id: string;
  amount: number;
  oldest: string;
  days: number;
  installments: number;
};

export function computeOverdue(d: {
  fees: FeeBalance[];
  installments: InstallmentBalance[];
}): OverdueRow[] {
  const today = todayISO();
  const map = new Map<string, OverdueRow>();
  const feesWithPlan = new Set(d.installments.map((i) => i.student_fee_id));
  const add = (sid: string, amt: number, due: string, isInst: boolean) => {
    if (amt <= 0) return;
    const r = map.get(sid) ?? { student_id: sid, amount: 0, oldest: due, days: 0, installments: 0 };
    r.amount += amt;
    if (due < r.oldest) r.oldest = due;
    if (isInst) r.installments += 1;
    r.days = daysBetween(r.oldest, today);
    map.set(sid, r);
  };
  for (const f of d.fees) {
    if (f.status === "cancelled" || f.status === "waived") continue;
    if (feesWithPlan.has(f.id)) {
      for (const i of d.installments.filter((x) => x.student_fee_id === f.id && x.due_date < today))
        add(f.student_id, toCents(i.amount) - toCents(i.amount_paid), i.due_date, true);
    } else if (f.due_date && f.due_date < today)
      add(f.student_id, toCents(f.balance), f.due_date, false);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export function financeError(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    const msg = String((error as { message: string }).message);
    if (msg.includes("row-level security") || msg.includes("permission denied"))
      return "ليست لديك صلاحية لتنفيذ هذا الإجراء.";
    if (msg.includes("student_fees_one_per_structure")) return "هذا الرسم مضاف للطالب مسبقاً.";
    return userError(error);
  }
  return "حدث خطأ غير متوقع.";
}

export function downloadCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = "\uFEFF" + [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
