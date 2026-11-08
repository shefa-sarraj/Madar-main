import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarDays,
  CircleDollarSign,
  FileSearch,
  FolderCog,
  Lock,
  Paperclip,
  Pencil,
  Plus,
  ReceiptText,
  Tag,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/app-shell";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import {
  CancelExpenseDialog,
  ExpenseDrawer,
  ExpenseSetupDialog,
} from "@/components/app/expense-dialogs";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { ALL, FilterSelect } from "@/components/app/student-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  EXPENSE_STATUS,
  PAYMENT_METHOD,
  canManageFinance,
  expenseKey,
  fmtMoney,
  toCents,
  type ExpenseRow,
} from "@/lib/finance";
import { formatDate } from "@/lib/students";
import { useWorkspace } from "@/lib/workspace";
import { fetchExpensesMetadata, fetchExpensesPage } from "@/lib/finance-list-pages";
import { usePagination, keepPageData } from "@/lib/pagination";

export const Route = createFileRoute("/_authenticated/expenses")({
  head: () => ({
    meta: [
      { title: "المصروفات — مدار | Madar" },
      { name: "description", content: "إدارة مصروفات المدرسة وسندات الصرف ومرفقاتها." },
      { property: "og:title", content: "المصروفات — مدار | Madar" },
      { property: "og:description", content: "إدارة مصروفات المدرسة وسندات الصرف ومرفقاتها." },
    ],
  }),
  component: ExpensesPage,
});

function ExpensesPage() {
  const { activeSchool, activeYear, roles, can } = useWorkspace();
  const queryClient = useQueryClient();
  const canManage = can("expenses", "edit", canManageFinance(roles));
  const canView = can("expenses", "view", canManageFinance(roles));
  const canCreate = can("expenses", "create", canManageFinance(roles));
  const canAdminister = can("expenses", "manage", canManageFinance(roles));
  const schoolId = activeSchool?.id;
  const yearId = activeYear?.id;
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL);
  const [costCenter, setCostCenter] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);
  const [cancelling, setCancelling] = useState<ExpenseRow | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);

  const filters = { search, category, costCenter, status, from, to };
  const pagination = usePagination([schoolId, yearId, filters]);
  const metadata = useQuery({
    queryKey: [...expenseKey(schoolId, yearId), "metadata"],
    enabled: !!schoolId && !!yearId && canView,
    queryFn: () => fetchExpensesMetadata(schoolId!, yearId!),
  });
  const query = useQuery({
    placeholderData: (data, query) => keepPageData(data, query, expenseKey(schoolId, yearId)),
    queryKey: [
      ...expenseKey(schoolId, yearId),
      "page",
      filters,
      pagination.page,
      pagination.pageSize,
    ],
    enabled: !!schoolId && !!yearId && canView && !!metadata.data,
    queryFn: () => fetchExpensesPage(schoolId!, yearId!, pagination, filters, metadata.data!),
  });
  const data = query.data;
  const summary = metadata.data?.summary ?? {
    thisMonth: 0,
    academicYear: 0,
    topCategory: null,
    topCategoryAmount: 0,
    recordCount: 0,
  };
  const filtered = data?.expenses ?? [];

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: expenseKey(schoolId, yearId) });
    void queryClient.invalidateQueries({ queryKey: ["dashboard-v2", schoolId, yearId] });
  };
  const resetFilters = () => {
    setSearch("");
    setCategory(ALL);
    setCostCenter(ALL);
    setStatus(ALL);
    setFrom("");
    setTo("");
  };
  const addExpense = () => {
    if (!data?.categories.some((item) => item.is_active)) {
      toast.info("أضف تصنيف مصروف واحداً على الأقل أولاً.");
      setSetupOpen(true);
      return;
    }
    setEditing(null);
    setDrawerOpen(true);
  };
  const editExpense = (expense: ExpenseRow) => {
    setEditing(expense);
    setDrawerOpen(true);
  };
  async function openAttachment(path: string) {
    const { data: signed, error } = await supabase.storage
      .from("finance-attachments")
      .createSignedUrl(path, 60);
    if (error || !signed) toast.error("تعذر فتح المرفق الخاص.");
    else window.open(signed.signedUrl, "_blank", "noopener");
  }

  return (
    <AppShell>
      <PageHeader
        title="المصروفات"
        description={
          activeYear
            ? "سندات الصرف والمصروفات للسنة الدراسية " + activeYear.name
            : "سندات الصرف والمصروفات"
        }
        actions={
          canCreate && schoolId && yearId ? (
            <>
              <Button variant="outline" onClick={() => setSetupOpen(true)}>
                <FolderCog className="size-4" />
                التصنيفات ومراكز التكلفة
              </Button>
              <Button onClick={addExpense}>
                <Plus className="size-4" />
                تسجيل مصروف
              </Button>
            </>
          ) : null
        }
      />

      {!canView ? (
        <EmptyState
          icon={Lock}
          title="لا تملك صلاحية الوصول إلى المصروفات"
          description="تتوفر هذه الوحدة لمالك المدرسة ومديرها والمحاسب فقط."
        />
      ) : !activeYear ? (
        <EmptyState title="لم يتم تحديد سنة دراسية" description="اختر سنة دراسية لعرض مصروفاتها." />
      ) : query.isPending && !metadata.isError ? (
        <DataTable<ExpenseRow> rows={[]} rowKey={(row) => row.id} isLoading columns={[]} />
      ) : query.isError || metadata.isError || !data ? (
        <EmptyState
          icon={FileSearch}
          title="تعذر تحميل المصروفات"
          description="تحقق من الاتصال ثم أعد المحاولة."
          action={
            <Button
              variant="outline"
              onClick={async () => {
                const result = await metadata.refetch();
                if (result.data) void query.refetch();
              }}
            >
              إعادة المحاولة
            </Button>
          }
        />
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              icon={CalendarDays}
              label="المصروفات هذا الشهر"
              value={fmtMoney(summary.thisMonth, activeSchool?.currency)}
              primary
            />
            <Metric
              icon={CircleDollarSign}
              label="مصروفات السنة الدراسية"
              value={fmtMoney(summary.academicYear, activeSchool?.currency)}
            />
            <Metric
              icon={Tag}
              label="أعلى تصنيف"
              value={summary.topCategory ?? "—"}
              sub={
                summary.topCategory
                  ? fmtMoney(summary.topCategoryAmount, activeSchool?.currency)
                  : "لا توجد مصروفات مسجلة"
              }
            />
            <Metric
              icon={ReceiptText}
              label="عدد السجلات"
              value={summary.recordCount.toLocaleString("ar")}
              sub="يشمل السجلات الملغاة"
            />
          </section>

          <FilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="الوصف، رقم السند، أو المرجع"
            onReset={resetFilters}
          >
            <FilterSelect
              value={category}
              onChange={setCategory}
              placeholder="التصنيف"
              options={data.categories.map((item) => [item.id, item.name])}
            />
            <FilterSelect
              value={costCenter}
              onChange={setCostCenter}
              placeholder="مركز التكلفة"
              options={data.costCenters.map((item) => [item.id, item.name])}
            />
            <FilterSelect
              value={status}
              onChange={setStatus}
              placeholder="الحالة"
              options={Object.entries(EXPENSE_STATUS).map(([key, value]) => [key, value.label])}
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
          </FilterBar>

          <DataTable
            pagination={{
              ...pagination,
              page: data.page,
              total: data.total,
              loading: query.isFetching,
            }}
            rows={filtered}
            rowKey={(expense) => expense.id}
            emptyTitle={data.expenses.length ? "لا توجد مصروفات مطابقة" : "لا توجد مصروفات بعد"}
            emptyDescription={
              data.expenses.length
                ? "غيّر عوامل التصفية لعرض نتائج أخرى."
                : "سجّل أول مصروف لتبدأ متابعة الإنفاق الفعلي."
            }
            columns={[
              {
                key: "date",
                header: "التاريخ",
                cell: (expense) => formatDate(expense.expense_date),
              },
              {
                key: "number",
                header: "السند / المرجع",
                cell: (expense) => (
                  <div>
                    <p dir="ltr" className="tnum text-end font-medium">
                      {expense.expense_number}
                    </p>
                    <p dir="ltr" className="tnum text-end text-xs text-muted-foreground">
                      {expense.reference_number ?? "—"}
                    </p>
                  </div>
                ),
              },
              { key: "category", header: "التصنيف", cell: (expense) => expense.category_name },
              {
                key: "description",
                header: "الوصف",
                className: "min-w-56",
                cell: (expense) => (
                  <div>
                    <p className="font-medium">{expense.title}</p>
                    {expense.description ? (
                      <p className="line-clamp-1 text-xs text-muted-foreground">
                        {expense.description}
                      </p>
                    ) : null}
                  </div>
                ),
              },
              {
                key: "center",
                header: "مركز التكلفة",
                cell: (expense) => expense.cost_center_name ?? "—",
              },
              {
                key: "amount",
                header: "المبلغ",
                cell: (expense) => (
                  <span className="tnum font-semibold text-primary">
                    {fmtMoney(toCents(expense.amount), expense.currency)}
                  </span>
                ),
              },
              {
                key: "method",
                header: "طريقة الدفع",
                cell: (expense) =>
                  expense.payment_method ? PAYMENT_METHOD[expense.payment_method] : "—",
              },
              {
                key: "attachment",
                header: "المرفق",
                align: "center",
                cell: (expense) =>
                  expense.attachment_url ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => void openAttachment(expense.attachment_url!)}
                      title="فتح المرفق الخاص"
                      aria-label="فتح المرفق الخاص"
                    >
                      <Paperclip className="size-4" />
                    </Button>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  ),
              },
              {
                key: "status",
                header: "الحالة",
                cell: (expense) => {
                  const status = EXPENSE_STATUS[expense.status] ?? {
                    label: expense.status,
                    tone: "neutral" as const,
                  };
                  return <StatusBadge tone={status.tone}>{status.label}</StatusBadge>;
                },
              },
              {
                key: "creator",
                header: "أنشأه",
                cell: (expense) => expense.created_by_name ?? "—",
              },
              {
                key: "actions",
                header: "",
                align: "center",
                cell: (expense) => (
                  <div className="flex justify-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => editExpense(expense)}
                      disabled={!canManage || expense.status === "cancelled"}
                      title="تعديل"
                      aria-label="تعديل"
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setCancelling(expense)}
                      disabled={!canAdminister || expense.status === "cancelled"}
                      title="إلغاء المصروف"
                      aria-label="إلغاء المصروف"
                    >
                      <XCircle className="size-4" />
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </>
      )}

      {schoolId && yearId && data ? (
        <>
          <ExpenseDrawer
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            schoolId={schoolId}
            yearId={yearId}
            currency={activeSchool?.currency ?? "USD"}
            expense={editing}
            categories={data.categories}
            costCenters={data.costCenters}
            onSaved={refresh}
          />
          <ExpenseSetupDialog
            open={setupOpen}
            onOpenChange={setSetupOpen}
            schoolId={schoolId}
            categories={data.categories}
            costCenters={data.costCenters}
            onChanged={refresh}
          />
        </>
      ) : null}
      <CancelExpenseDialog
        expense={cancelling}
        open={!!cancelling}
        onOpenChange={(open) => {
          if (!open) setCancelling(null);
        }}
        onSaved={() => {
          setCancelling(null);
          refresh();
        }}
      />
    </AppShell>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  sub,
  primary,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
  sub?: string;
  primary?: boolean;
}) {
  return (
    <div
      className={
        "rounded-xl border border-border bg-card p-4 shadow-card " +
        (primary ? "border-t-2 border-t-gold" : "")
      }
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </div>
      <p className="tnum mt-2 text-xl font-bold text-primary">{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}
