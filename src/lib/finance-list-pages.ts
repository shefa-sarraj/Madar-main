import { supabase } from "@/integrations/supabase/client";
import {
  computeTotals,
  computeOverdue,
  computeExpenseSummary,
  todayISO,
  toCents,
  type FinanceData,
  type OverdueRow,
  type ExpenseRow,
} from "@/lib/finance";
import { readAll, readPage, slicePage, searchOperand, type PageRequest } from "@/lib/pagination";

export async function fetchExpensesMetadata(schoolId: string, yearId: string) {
  const [categories, centers, index] = await Promise.all([
    supabase.from("expense_categories").select("*").eq("school_id", schoolId).order("name"),
    supabase.from("cost_centers").select("*").eq("school_id", schoolId).order("name"),
    readAll((from, to) =>
      supabase
        .from("expenses")
        .select("id,status,expense_date,amount,expense_category_id")
        .eq("school_id", schoolId)
        .eq("academic_year_id", yearId)
        .order("id")
        .range(from, to),
    ),
  ]);
  if (categories.error) throw categories.error;
  if (centers.error) throw centers.error;
  return {
    categories: categories.data ?? [],
    costCenters: centers.data ?? [],
    summary: computeExpenseSummary(
      index.map((row) => ({
        ...row,
        category_name:
          categories.data?.find((category) => category.id === row.expense_category_id)?.name ??
          "غير مصنف",
      })),
    ),
  };
}

export async function fetchExpensesPage(
  schoolId: string,
  yearId: string,
  request: PageRequest,
  filters: {
    search: string;
    category: string;
    costCenter: string;
    status: string;
    from: string;
    to: string;
  },
  metadata: Awaited<ReturnType<typeof fetchExpensesMetadata>>,
) {
  const page = await readPage((from, to) => {
    let q = supabase
      .from("expenses")
      .select("*,category:expense_categories(name),cost_center:cost_centers(name)", {
        count: "exact",
      })
      .eq("school_id", schoolId)
      .eq("academic_year_id", yearId);
    for (const [column, value] of [
      ["expense_category_id", filters.category],
      ["cost_center_id", filters.costCenter],
      ["status", filters.status],
    ])
      if (value !== "all") q = q.filter(column!, "eq", value);
    if (filters.from) q = q.gte("expense_date", filters.from);
    if (filters.to) q = q.lte("expense_date", filters.to);
    if (filters.search.trim()) {
      const term = searchOperand(filters.search),
        needle = filters.search.trim().toLocaleLowerCase("ar");
      const categories = metadata.categories
          .filter((row) => row.name.toLocaleLowerCase("ar").includes(needle))
          .map((row) => row.id),
        centers = metadata.costCenters
          .filter((row) => row.name.toLocaleLowerCase("ar").includes(needle))
          .map((row) => row.id);
      q = q.or(
        [
          ...["title", "description", "expense_number", "reference_number"].map(
            (column) => `${column}.ilike.${term}`,
          ),
          ...(categories.length ? [`expense_category_id.in.(${categories.join(",")})`] : []),
          ...(centers.length ? [`cost_center_id.in.(${centers.join(",")})`] : []),
        ].join(","),
      );
    }
    return q
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to);
  }, request);
  const ids = [...new Set(page.rows.flatMap((row) => (row.created_by ? [row.created_by] : [])))];
  const profiles = ids.length
    ? await supabase.from("profiles").select("id,full_name").in("id", ids)
    : { data: [], error: null };
  if (profiles.error) throw profiles.error;
  const names = new Map((profiles.data ?? []).map((row) => [row.id, row.full_name]));
  const expenses: ExpenseRow[] = page.rows.map(({ category, cost_center, ...row }) => ({
    ...row,
    category_name: category?.name ?? "غير مصنف",
    cost_center_name: cost_center?.name ?? null,
    created_by_name: row.created_by ? (names.get(row.created_by) ?? null) : null,
  }));
  return { ...metadata, expenses, total: page.total, page: page.page };
}

export async function fetchFinanceMetadata(
  schoolId: string,
  yearId: string,
  client = supabase,
  includeOverdue = false,
) {
  await client.rpc("refresh_finance_statuses", { _school_id: schoolId });
  const [fees, installments, discounts, students, enrollments, links, categories] =
    await Promise.all([
      readAll((from, to) =>
        client
          .from("student_fees")
          .select("id,student_id,status,due_date,balance,final_amount,amount_paid")
          .eq("school_id", schoolId)
          .eq("academic_year_id", yearId)
          .order("id")
          .range(from, to),
      ),
      readAll((from, to) =>
        client
          .from("installments")
          .select(
            "id,student_fee_id,due_date,amount,amount_paid,fee:student_fees!inner(academic_year_id)",
          )
          .eq("school_id", schoolId)
          .eq("fee.academic_year_id", yearId)
          .order("id")
          .range(from, to),
      ),
      readAll((from, to) =>
        client
          .from("discounts")
          .select("id,is_active,calculated_amount")
          .eq("school_id", schoolId)
          .eq("academic_year_id", yearId)
          .order("id")
          .range(from, to),
      ),
      readAll((from, to) =>
        client
          .from("students")
          .select("id,full_name,student_number")
          .eq("school_id", schoolId)
          .order("id")
          .range(from, to),
      ),
      readAll((from, to) =>
        client
          .from("student_enrollments")
          .select("id,student_id,grade_id,section_id")
          .eq("school_id", schoolId)
          .eq("academic_year_id", yearId)
          .order("id")
          .range(from, to),
      ),
      readAll((from, to) =>
        client
          .from("student_guardians")
          .select("student_id,guardian:guardians(full_name,phone)")
          .eq("school_id", schoolId)
          .eq("is_primary", true)
          .order("id")
          .range(from, to),
      ),
      client.from("fee_categories").select("*").eq("school_id", schoolId).order("name"),
    ]);
  if (categories.error) throw categories.error;
  const guardians: FinanceData["guardians"] = {};
  for (const link of links)
    if (link.guardian)
      guardians[link.student_id] = { name: link.guardian.full_name, phone: link.guardian.phone };
  const withPlan = new Set(installments.map((row) => row.student_fee_id));
  const overdueFeeCounts: Record<string, number> = {};
  for (const fee of fees)
    if (
      !["cancelled", "waived"].includes(fee.status) &&
      fee.due_date &&
      fee.due_date < todayISO() &&
      toCents(fee.balance) > 0 &&
      !withPlan.has(fee.id)
    )
      overdueFeeCounts[fee.student_id] = (overdueFeeCounts[fee.student_id] ?? 0) + 1;
  const overdue = computeOverdue({ fees, installments });
  return {
    students,
    enrollments,
    guardians,
    categories: categories.data ?? [],
    totals: computeTotals({ fees, installments, payments: [], discounts }),
    overdue: includeOverdue ? overdue : [],
    overdueStudents: overdue.map((row) => row.student_id),
    overdueFeeCounts,
  };
}

type FinancePage = FinanceData & { total: number; page: number; overdue: OverdueRow[] };
export async function fetchFinancePage(
  schoolId: string,
  yearId: string,
  request: PageRequest,
  tab: string,
  filters: {
    status: string;
    method: string;
    from: string;
    to: string;
    studentIds: string[] | null;
  },
  metadata: Awaited<ReturnType<typeof fetchFinanceMetadata>>,
): Promise<FinancePage> {
  const result: FinancePage = {
    fees: [],
    installments: [],
    payments: [],
    allocations: [],
    discounts: [],
    categories: metadata.categories,
    students: metadata.students,
    enrollments: metadata.enrollments,
    guardians: metadata.guardians,
    profiles: {},
    total: 0,
    page: 1,
    overdue: [],
  };
  if (tab === "overdue") {
    const ids = filters.studentIds ? new Set(filters.studentIds) : null;
    const page = slicePage(
      metadata.overdue.filter((row) => !ids || ids.has(row.student_id)),
      request,
    );
    return { ...result, overdue: page.rows, total: page.total, page: page.page };
  }
  if (tab === "fees") {
    const page = await readPage((from, to) => {
      let q = supabase
        .from("student_fees")
        .select("*", { count: "exact" })
        .eq("school_id", schoolId)
        .eq("academic_year_id", yearId);
      if (filters.studentIds) q = q.in("student_id", filters.studentIds);
      if (filters.status !== "all") q = q.filter("status", "eq", filters.status);
      if (filters.from || filters.to)
        q = q.or(
          `due_date.is.null,and(${[...(filters.from ? [`due_date.gte.${filters.from}`] : []), ...(filters.to ? [`due_date.lte.${filters.to}`] : [])].join(",")})`,
        );
      return q.order("due_date", { nullsFirst: false }).order("id").range(from, to);
    }, request);
    return { ...result, fees: page.rows, total: page.total, page: page.page };
  }
  if (tab === "installments") {
    const page = await readPage((from, to) => {
      let q = supabase
        .from("installments")
        .select("*,fee:student_fees!inner(student_id,academic_year_id)", { count: "exact" })
        .eq("school_id", schoolId)
        .eq("fee.academic_year_id", yearId);
      if (filters.studentIds) q = q.in("fee.student_id", filters.studentIds);
      if (filters.from) q = q.gte("due_date", filters.from);
      if (filters.to) q = q.lte("due_date", filters.to);
      return q.order("due_date").order("id").range(from, to);
    }, request);
    result.installments = page.rows;
    result.total = page.total;
    result.page = page.page;
    const ids = [...new Set(page.rows.map((row) => row.student_fee_id))];
    if (ids.length) {
      const fees = await supabase
        .from("student_fees")
        .select("*")
        .eq("school_id", schoolId)
        .eq("academic_year_id", yearId)
        .in("id", ids);
      if (fees.error) throw fees.error;
      result.fees = fees.data ?? [];
    }
  }
  if (tab === "payments") {
    const page = await readPage((from, to) => {
      let q = supabase
        .from("payments")
        .select("*", { count: "exact" })
        .eq("school_id", schoolId)
        .eq("academic_year_id", yearId);
      if (filters.studentIds) q = q.in("student_id", filters.studentIds);
      if (filters.method !== "all") q = q.filter("payment_method", "eq", filters.method);
      if (filters.from) q = q.gte("payment_date", filters.from);
      if (filters.to) q = q.lte("payment_date", filters.to);
      return q.order("payment_date", { ascending: false }).order("id").range(from, to);
    }, request);
    result.payments = page.rows;
    result.total = page.total;
    result.page = page.page;
    const ids = [
      ...new Set(page.rows.flatMap((row) => (row.received_by ? [row.received_by] : []))),
    ];
    if (ids.length) {
      const profiles = await supabase.from("profiles").select("id,full_name").in("id", ids);
      if (profiles.error) throw profiles.error;
      result.profiles = Object.fromEntries(
        (profiles.data ?? []).map((row) => [row.id, row.full_name]),
      );
    }
  }
  if (tab === "discounts") {
    const page = await readPage((from, to) => {
      let q = supabase
        .from("discounts")
        .select("*", { count: "exact" })
        .eq("school_id", schoolId)
        .eq("academic_year_id", yearId);
      if (filters.studentIds) q = q.in("student_id", filters.studentIds);
      return q.order("created_at", { ascending: false }).order("id").range(from, to);
    }, request);
    result.discounts = page.rows;
    result.total = page.total;
    result.page = page.page;
    const ids = [
      ...new Set(page.rows.flatMap((row) => (row.student_fee_id ? [row.student_fee_id] : []))),
    ];
    if (ids.length) {
      const fees = await supabase
        .from("student_fees")
        .select("*")
        .eq("school_id", schoolId)
        .eq("academic_year_id", yearId)
        .in("id", ids);
      if (fees.error) throw fees.error;
      result.fees = fees.data ?? [];
    }
  }
  return result;
}
