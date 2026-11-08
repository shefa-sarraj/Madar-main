import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Ban,
  ChevronDown,
  CircleDollarSign,
  Eye,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Receipt,
  SlidersHorizontal,
  Users,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/app-shell";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar } from "@/components/app/filter-bar";
import {
  CancelPaymentDialog,
  DiscountDialog,
  InstallmentPlanDialog,
  ReceiptDialog,
  RecordPaymentDialog,
} from "@/components/app/finance-dialogs";
import { FormField } from "@/components/app/form-field";
import { Modal } from "@/components/app/modal";
import { PageHeader } from "@/components/app/page-header";
import { ALL, FilterSelect } from "@/components/app/student-shared";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import {
  canManageFinance,
  canViewFinance,
  centsToStr,
  FEE_STATUS,
  fetchFinance,
  financeError,
  financeKey,
  fmtMoney,
  INSTALLMENT_STATUS,
  isValidMoney,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  toCents,
  todayISO,
} from "@/lib/finance";
import { fetchStructure, formatDate, structureKey } from "@/lib/students";
import { useWorkspace } from "@/lib/workspace";
import { fetchFinancePage } from "@/lib/finance-list-pages";
import { usePagination, keepPageData } from "@/lib/pagination";
import { fetchFinanceListMetadata, fetchOverdueListPage } from "@/lib/list-aggregates.functions";

export const Route = createFileRoute("/_authenticated/payments")({
  head: () => ({
    meta: [
      { title: "الأقساط والمدفوعات — مدار | Madar" },
      { name: "description", content: "رسوم الطلاب والأقساط والمدفوعات والمتأخرات والخصومات." },
      { property: "og:title", content: "الأقساط والمدفوعات — مدار | Madar" },
      {
        property: "og:description",
        content: "رسوم الطلاب والأقساط والمدفوعات والمتأخرات والخصومات.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { tab?: string } =>
    typeof s["tab"] === "string" ? { tab: s["tab"] } : {},
  component: PaymentsPage,
});

function PaymentsPage() {
  const { activeSchool, activeYear, roles, can } = useWorkspace();
  const { tab } = Route.useSearch();
  const qc = useQueryClient();
  const canView = can("fees", "view", canViewFinance(roles));
  const canManage = can("fees", "edit", canManageFinance(roles));
  const canCreate = can("fees", "create", canManageFinance(roles));
  const canAdminister = can("fees", "manage", canManageFinance(roles));
  const schoolId = activeSchool?.id;
  const metadata = useQuery({
    queryKey: [...financeKey(schoolId, activeYear?.id), "metadata"],
    enabled: !!schoolId && !!activeYear && canView,
    queryFn: () =>
      fetchFinanceListMetadata({ data: { schoolId: schoolId!, yearId: activeYear!.id } }),
  });
  const st = useQuery({
    queryKey: structureKey(schoolId),
    enabled: !!schoolId && canView,
    queryFn: () => fetchStructure(schoolId!),
  });

  const [activeTab, setActiveTab] = useState(tab ?? "fees");
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [stage, setStage] = useState(ALL);
  const [grade, setGrade] = useState(ALL);
  const [section, setSection] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [method, setMethod] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [payFor, setPayFor] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [cancelPay, setCancelPay] = useState<string | null>(null);
  const [addInstallment, setAddInstallment] = useState(false);
  const [addDiscount, setAddDiscount] = useState(false);
  const reset = () => {
    setSearch("");
    setStage(ALL);
    setGrade(ALL);
    setSection(ALL);
    setStatus(ALL);
    setMethod(ALL);
    setFrom("");
    setTo("");
  };
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["finance"] });
    qc.invalidateQueries({ queryKey: ["student-finance"] });
    qc.invalidateQueries({ queryKey: ["dashboard-v2"] });
  };

  const md = metadata.data;
  const s = st.data;
  const studentOk = useMemo(() => {
    if (!md || !s) return () => true;
    const term = search.trim().toLowerCase();
    const gradeStage = new Map(s.grades.map((g) => [g.id, g.stage_id]));
    return (sid: string) => {
      const en = md.enrollments.find((e) => e.student_id === sid);
      if (stage !== ALL && (!en || gradeStage.get(en.grade_id) !== stage)) return false;
      if (grade !== ALL && en?.grade_id !== grade) return false;
      if (section !== ALL && en?.section_id !== section) return false;
      if (term) {
        const stu = md.students.find((x) => x.id === sid);
        const g = md.guardians[sid];
        const hay =
          `${stu?.full_name ?? ""} ${stu?.student_number ?? ""} ${g?.phone ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    };
  }, [md, s, search, stage, grade, section]);
  const studentIds = useMemo(
    () =>
      search.trim() || stage !== ALL || grade !== ALL || section !== ALL
        ? (md?.students ?? [])
            .filter((student) => studentOk(student.id))
            .map((student) => student.id)
        : null,
    [md, studentOk, search, stage, grade, section],
  );
  const pageFilters = { status, method, from, to, studentIds };
  const pagination = usePagination([
    schoolId,
    activeYear?.id,
    activeTab,
    search,
    stage,
    grade,
    section,
    status,
    method,
    from,
    to,
  ]);
  const q = useQuery({
    placeholderData: (data, query) =>
      keepPageData(data, query, financeKey(schoolId, activeYear?.id)),
    queryKey: [
      ...financeKey(schoolId, activeYear?.id),
      "page",
      activeTab,
      pageFilters,
      pagination.page,
      pagination.pageSize,
    ],
    enabled: !!schoolId && !!activeYear && canView && !!md && !!s,
    queryFn: async () => {
      const base = await fetchFinancePage(
        schoolId!,
        activeYear!.id,
        pagination,
        activeTab === "overdue" ? "setup" : activeTab,
        pageFilters,
        md!,
      );
      if (activeTab !== "overdue") return base;
      const page = await fetchOverdueListPage({
        data: {
          schoolId: schoolId!,
          yearId: activeYear!.id,
          page: pagination.page,
          pageSize: pagination.pageSize,
          search,
          stage,
          grade,
          section,
        },
      });
      return { ...base, overdue: page.rows, total: page.total, page: page.page };
    },
  });
  const d = q.data;
  const controls = {
    ...pagination,
    page: d?.page ?? pagination.page,
    total: d?.total ?? 0,
    loading: q.isFetching,
  };
  const forms = useQuery({
    queryKey: [...financeKey(schoolId, activeYear?.id), "form-data", payFor],
    enabled: !!schoolId && !!activeYear && canView && !!(payFor || addInstallment || addDiscount),
    queryFn: () => fetchFinance(schoolId!, activeYear!.id, payFor ?? undefined),
  });
  const formData = forms.data;

  if (!canView)
    return (
      <AppShell>
        <PageHeader title="الأقساط والمدفوعات" />
        <EmptyState
          title="لا تملك صلاحية الوصول"
          description="هذا القسم متاح للإدارة والمحاسبة وموظفي التسجيل."
        />
      </AppShell>
    );

  const name = (sid: string) => d?.students.find((x) => x.id === sid);
  const gradeOf = (sid: string) => {
    const en = d?.enrollments.find((e) => e.student_id === sid);
    return `${s?.grades.find((g) => g.id === en?.grade_id)?.name ?? "—"}${en?.section_id ? ` / ${s?.sections.find((x) => x.id === en.section_id)?.name ?? ""}` : ""}`;
  };
  const StudentCell = ({ sid }: { sid: string }) => (
    <Link to="/students/$studentId" params={{ studentId: sid }} className="block">
      <span className="block font-medium text-foreground hover:underline">
        {name(sid)?.full_name ?? "—"}
      </span>
      <span className="tnum text-xs text-muted-foreground">{name(sid)?.student_number}</span>
    </Link>
  );

  const t = md?.totals;
  const fees = d?.fees ?? [];
  const insts = d?.installments ?? [];
  const pays = d?.payments ?? [];
  const overdue = d?.overdue ?? [];
  const overdueTotal = (md?.overdueStudents ?? []).filter(studentOk).length;
  const discs = d?.discounts ?? [];
  const activeFilterCount =
    [stage, grade, section, status, method].filter((v) => v !== ALL).length +
    Number(!!from) +
    Number(!!to);
  const grades = (s?.grades ?? []).filter((g) => stage === ALL || g.stage_id === stage);
  const sections = (s?.sections ?? []).filter(
    (x) => x.academic_year_id === activeYear?.id && (grade === ALL || x.grade_id === grade),
  );
  const payStudent = payFor ? (name(payFor) ?? null) : null;

  return (
    <AppShell>
      <PageHeader
        title="الأقساط والمدفوعات"
        description={activeYear ? `السنة الدراسية ${activeYear.name}` : "حدد سنة دراسية"}
      />

      {!activeYear ? (
        <EmptyState title="لم يتم تحديد سنة دراسية" />
      ) : q.isPending && !metadata.isError && !st.isError ? (
        <Skeleton className="h-40 w-full" />
      ) : q.isError || metadata.isError || st.isError || !t ? (
        <EmptyState
          title="تعذر تحميل البيانات المالية"
          description="حاول مرة أخرى. إذا استمرت المشكلة فتواصل مع مسؤول النظام."
          action={
            <Button
              variant="outline"
              onClick={async () => {
                await metadata.refetch();
                await st.refetch();
                await q.refetch();
              }}
            >
              إعادة المحاولة
            </Button>
          }
        />
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <Metric label="إجمالي الرسوم" icon={CircleDollarSign} v={fmtMoney(t.total)} primary />
            <Metric
              label="المحصّل"
              icon={Wallet}
              v={fmtMoney(t.collected)}
              sub={
                t.total ? `${Math.round((t.collected / t.total) * 100)}% من الإجمالي` : undefined
              }
            />
            <Metric label="المتبقي" icon={Receipt} v={fmtMoney(t.outstanding)} />
            <Metric
              label="المتأخر"
              icon={AlertTriangle}
              v={fmtMoney(t.overdue)}
              danger={t.overdue > 0}
            />
            <Metric
              label="الطلاب المتأخرون"
              icon={Users}
              v={String(t.overdueStudents)}
              danger={t.overdueStudents > 0}
            />
          </section>

          <FilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="اسم الطالب، الرقم المدرسي، أو هاتف ولي الأمر"
            onReset={reset}
          >
            <Button
              variant="outline"
              size="sm"
              aria-expanded={filtersOpen}
              aria-controls="finance-secondary-filters"
              onClick={() => setFiltersOpen((v) => !v)}
            >
              <SlidersHorizontal className="size-4" /> الفلاتر
              {activeFilterCount ? <span className="tnum">({activeFilterCount})</span> : null}
              <ChevronDown className={`size-4 ${filtersOpen ? "rotate-180" : ""}`} />
            </Button>
          </FilterBar>
          <div id="finance-secondary-filters" hidden={!filtersOpen}>
            <div className="flex flex-wrap items-center gap-2 border-b border-border pb-4">
              <FilterSelect
                value={stage}
                onChange={(v) => {
                  setStage(v);
                  setGrade(ALL);
                  setSection(ALL);
                }}
                placeholder="المرحلة"
                options={(s?.stages ?? []).map((x) => [x.id, x.name])}
              />
              <FilterSelect
                value={grade}
                onChange={(v) => {
                  setGrade(v);
                  setSection(ALL);
                }}
                placeholder="الصف"
                options={grades.map((x) => [x.id, x.name])}
              />
              <FilterSelect
                value={section}
                onChange={setSection}
                placeholder="الشعبة"
                options={sections.map((x) => [x.id, x.name])}
              />
              <FilterSelect
                value={status}
                onChange={setStatus}
                placeholder="حالة الرسم"
                options={Object.entries(FEE_STATUS).map(([k, v]) => [k, v.label])}
              />
              <FilterSelect
                value={method}
                onChange={setMethod}
                placeholder="طريقة الدفع"
                options={Object.entries(PAYMENT_METHOD)}
              />
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9 w-36"
                aria-label="من تاريخ"
              />
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-9 w-36"
                aria-label="إلى تاريخ"
              />
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
            <TabsList className="h-auto flex-wrap justify-start">
              <TabsTrigger value="fees">الرسوم</TabsTrigger>
              <TabsTrigger value="installments">الأقساط</TabsTrigger>
              <TabsTrigger value="payments">المدفوعات</TabsTrigger>
              <TabsTrigger value="overdue">
                المتأخرات{" "}
                {overdueTotal ? (
                  <span className="tnum ms-1 rounded-full bg-destructive/10 px-1.5 text-xs text-destructive">
                    {overdueTotal}
                  </span>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="discounts">الخصومات</TabsTrigger>
              {canCreate || canManage ? (
                <TabsTrigger value="setup">هياكل الرسوم</TabsTrigger>
              ) : null}
            </TabsList>

            <TabsContent value="fees" className="mt-4">
              <DataTable
                pagination={controls}
                rows={fees}
                rowKey={(r) => r.id}
                emptyTitle="لا توجد رسوم مطابقة"
                columns={[
                  { key: "s", header: "الطالب", cell: (r) => <StudentCell sid={r.student_id} /> },
                  { key: "g", header: "الصف", cell: (r) => gradeOf(r.student_id) },
                  { key: "n", header: "الرسم", cell: (r) => r.name },
                  {
                    key: "f",
                    header: "إجمالي الرسم",
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
                    cell: (r) => (
                      <span className="tnum font-medium">{fmtMoney(toCents(r.balance))}</span>
                    ),
                  },
                  { key: "d", header: "الاستحقاق", cell: (r) => formatDate(r.due_date) },
                  {
                    key: "st",
                    header: "الحالة",
                    cell: (r) => (
                      <StatusBadge tone={FEE_STATUS[r.status]?.tone}>
                        {FEE_STATUS[r.status]?.label}
                      </StatusBadge>
                    ),
                  },
                ]}
              />
            </TabsContent>

            <TabsContent value="installments" className="mt-4">
              {canManage ? (
                <div className="mb-4 flex justify-start">
                  <Button onClick={() => setAddInstallment(true)}>
                    <Plus className="size-4" /> إضافة قسط
                  </Button>
                </div>
              ) : null}
              <DataTable
                pagination={controls}
                rows={insts}
                rowKey={(r) => r.id}
                emptyTitle={
                  d!.installments.length ? "لا توجد أقساط مطابقة للفلاتر" : "لم تُضف أقساط بعد"
                }
                emptyDescription="التقسيط اختياري للرصيد المتبقي على رسم الطالب."
                columns={[
                  {
                    key: "s",
                    header: "الطالب",
                    cell: (r) => (
                      <StudentCell
                        sid={d!.fees.find((f) => f.id === r.student_fee_id)!.student_id}
                      />
                    ),
                  },
                  {
                    key: "f",
                    header: "الرسم",
                    cell: (r) => d!.fees.find((f) => f.id === r.student_fee_id)?.name,
                  },
                  {
                    key: "n",
                    header: "رقم القسط",
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
                  {
                    key: "d",
                    header: "تاريخ الاستحقاق",
                    cell: (r) => (
                      <span className="tnum whitespace-nowrap">{formatDate(r.due_date)}</span>
                    ),
                  },
                  {
                    key: "st",
                    header: "الحالة",
                    cell: (r) => (
                      <StatusBadge tone={INSTALLMENT_STATUS[r.status]?.tone}>
                        {INSTALLMENT_STATUS[r.status]?.label}
                      </StatusBadge>
                    ),
                  },
                ]}
              />
            </TabsContent>

            <TabsContent value="payments" className="mt-4">
              <DataTable
                pagination={controls}
                rows={pays}
                rowKey={(r) => r.id}
                emptyTitle="لا توجد مدفوعات"
                columns={[
                  {
                    key: "n",
                    header: "رقم الإيصال",
                    cell: (r) => <span className="tnum">{r.payment_number}</span>,
                  },
                  { key: "s", header: "الطالب", cell: (r) => <StudentCell sid={r.student_id} /> },
                  { key: "d", header: "التاريخ", cell: (r) => formatDate(r.payment_date) },
                  {
                    key: "a",
                    header: "المبلغ",
                    cell: (r) => (
                      <span className="tnum font-medium">{fmtMoney(toCents(r.amount))}</span>
                    ),
                  },
                  { key: "m", header: "الطريقة", cell: (r) => PAYMENT_METHOD[r.payment_method] },
                  {
                    key: "r",
                    header: "استلمها",
                    cell: (r) => (r.received_by ? (d!.profiles[r.received_by] ?? "—") : "—"),
                  },
                  {
                    key: "st",
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
                          aria-label="الإيصال"
                          title="الإيصال"
                          onClick={() => setReceipt(r.id)}
                        >
                          <Receipt className="size-4" />
                        </Button>
                        {canAdminister && r.status === "completed" ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="إلغاء"
                            title="إلغاء الدفعة"
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
            </TabsContent>

            <TabsContent value="overdue" className="mt-4">
              <DataTable
                pagination={controls}
                rows={overdue}
                rowKey={(r) => r.student_id}
                emptyTitle="لا توجد متأخرات"
                emptyDescription="لا توجد أرصدة رسوم أو أقساط متأخرة."
                columns={[
                  { key: "s", header: "الطالب", cell: (r) => <StudentCell sid={r.student_id} /> },
                  {
                    key: "gu",
                    header: "ولي الأمر",
                    cell: (r) => d!.guardians[r.student_id]?.name ?? "—",
                  },
                  {
                    key: "ph",
                    header: "الهاتف",
                    cell: (r) => (
                      <span dir="ltr" className="tnum">
                        {d!.guardians[r.student_id]?.phone ?? "—"}
                      </span>
                    ),
                  },
                  { key: "g", header: "الصف", cell: (r) => gradeOf(r.student_id) },
                  {
                    key: "a",
                    header: "المبلغ المتأخر",
                    cell: (r) => (
                      <span className="tnum font-semibold text-destructive">
                        {fmtMoney(r.amount)}
                      </span>
                    ),
                  },
                  { key: "o", header: "أقدم استحقاق", cell: (r) => formatDate(r.oldest) },
                  {
                    key: "d",
                    header: "أيام التأخير",
                    cell: (r) => <span className="tnum">{r.days}</span>,
                  },
                  {
                    key: "n",
                    header: "مصدر المتأخرات",
                    cell: (r) => {
                      const feeCount = md?.overdueFeeCounts[r.student_id] ?? 0;
                      return (
                        <div className="space-y-1 text-xs">
                          {feeCount > 0 ? (
                            <p>
                              رسوم متأخرة <span className="tnum">({feeCount})</span>
                            </p>
                          ) : null}
                          {r.installments > 0 ? (
                            <p>
                              أقساط متأخرة <span className="tnum">({r.installments})</span>
                            </p>
                          ) : null}
                        </div>
                      );
                    },
                  },
                  {
                    key: "x",
                    header: "",
                    cell: (r) => {
                      const g = d!.guardians[r.student_id];
                      const phone = g?.phone.replace(/\D/g, "");
                      const msg = encodeURIComponent(
                        `السلام عليكم ${g?.name ?? ""}، نود تذكيركم بوجود مبلغ مستحق قدره ${fmtMoney(r.amount)} على الطالب/ة ${name(r.student_id)?.full_name ?? ""}. شكراً لتعاونكم — ${activeSchool?.name_ar ?? ""}`,
                      );
                      return (
                        <div className="flex gap-1">
                          <Button
                            asChild
                            size="icon"
                            variant="ghost"
                            title="عرض الطالب"
                            aria-label="عرض الطالب"
                          >
                            <Link to="/students/$studentId" params={{ studentId: r.student_id }}>
                              <Eye className="size-4" />
                            </Link>
                          </Button>
                          {canCreate ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              title="تسجيل دفعة"
                              aria-label="تسجيل دفعة"
                              onClick={() => setPayFor(r.student_id)}
                            >
                              <Wallet className="size-4" />
                            </Button>
                          ) : null}
                          {phone ? (
                            <Button
                              asChild
                              size="icon"
                              variant="ghost"
                              title="فتح واتساب"
                              aria-label="فتح واتساب"
                            >
                              <a
                                href={`https://wa.me/${phone}?text=${msg}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <MessageCircle className="size-4" />
                              </a>
                            </Button>
                          ) : null}
                        </div>
                      );
                    },
                  },
                ]}
              />
            </TabsContent>

            <TabsContent value="discounts" className="mt-4">
              {canCreate ? (
                <div className="mb-4 flex justify-start">
                  <Button onClick={() => setAddDiscount(true)}>
                    <Plus className="size-4" /> إضافة خصم
                  </Button>
                </div>
              ) : null}
              <DataTable
                pagination={controls}
                rows={discs}
                rowKey={(r) => r.id}
                emptyTitle={
                  d!.discounts.length ? "لا توجد خصومات مطابقة للفلاتر" : "لم تُضف خصومات بعد"
                }
                emptyDescription="يُطبّق كل خصم على طالب ورسم محددين."
                columns={[
                  { key: "s", header: "الطالب", cell: (r) => <StudentCell sid={r.student_id} /> },
                  {
                    key: "n",
                    header: "الخصم",
                    cell: (r) => (
                      <div className="space-y-1">
                        <p>{r.name}</p>
                        {[
                          "تحقق مباشر Finance fixed 2026-10-11",
                          "تحقق مباشر Finance percentage 2026-10-11",
                        ].includes(r.reason ?? "") ? (
                          <StatusBadge tone="warning">خصم تحقق مؤقت</StatusBadge>
                        ) : null}
                      </div>
                    ),
                  },
                  {
                    key: "f",
                    header: "الرسم المستهدف",
                    cell: (r) =>
                      d!.fees.find((f) => f.id === r.student_fee_id)?.name ?? "رسم غير متاح",
                  },
                  {
                    key: "type",
                    header: "نوع الخصم",
                    cell: (r) => (r.type === "percentage" ? "نسبة مئوية" : "مبلغ ثابت"),
                  },
                  {
                    key: "v",
                    header: "القيمة",
                    cell: (r) =>
                      r.type === "percentage" ? `${r.value}%` : fmtMoney(toCents(r.value)),
                  },
                  {
                    key: "a",
                    header: "المبلغ",
                    cell: (r) => (
                      <span className="tnum">{fmtMoney(toCents(r.calculated_amount))}</span>
                    ),
                  },
                  { key: "r", header: "السبب", cell: (r) => r.reason ?? "—" },
                  {
                    key: "st",
                    header: "الحالة",
                    cell: (r) => (
                      <StatusBadge tone={r.is_active ? "success" : "neutral"}>
                        {r.is_active ? "فعال" : "ملغى"}
                      </StatusBadge>
                    ),
                  },
                ]}
              />
            </TabsContent>

            {(canCreate || canManage) && schoolId ? (
              <TabsContent value="setup" className="mt-4">
                <FeeSetup
                  schoolId={schoolId}
                  yearId={activeYear.id}
                  grades={s?.grades ?? []}
                  categories={d!.categories}
                  onChanged={refresh}
                />
              </TabsContent>
            ) : null}
          </Tabs>
        </>
      )}

      {formData && canManage && addInstallment ? (
        <InstallmentPlanDialog
          key={`installments-${schoolId}-${activeYear?.id}`}
          fee={null}
          open={addInstallment}
          data={formData}
          onOpenChange={setAddInstallment}
          onSaved={refresh}
        />
      ) : null}
      {formData && canCreate && addDiscount ? (
        <DiscountDialog
          key={`discounts-${schoolId}-${activeYear?.id}`}
          fee={null}
          open={addDiscount}
          data={formData}
          onOpenChange={setAddDiscount}
          onSaved={refresh}
        />
      ) : null}
      {formData && payFor ? (
        <RecordPaymentDialog
          open={!!payFor}
          onOpenChange={(o) => !o && setPayFor(null)}
          student={payStudent}
          fees={formData.fees}
          installments={formData.installments}
          onSaved={(id) => {
            refresh();
            setReceipt(id);
          }}
        />
      ) : null}
      {(payFor || addInstallment || addDiscount) && !formData ? (
        <Modal
          open
          onOpenChange={(open) => {
            if (!open) {
              setPayFor(null);
              setAddInstallment(false);
              setAddDiscount(false);
            }
          }}
          title="بيانات المالية"
        >
          {forms.isError ? (
            <EmptyState
              title="تعذر تحميل البيانات"
              action={<Button onClick={() => void forms.refetch()}>إعادة المحاولة</Button>}
            />
          ) : (
            <p role="status">جارٍ تحميل البيانات...</p>
          )}
        </Modal>
      ) : null}
      <ReceiptDialog paymentId={receipt} onOpenChange={(o) => !o && setReceipt(null)} />
      <CancelPaymentDialog
        paymentId={cancelPay}
        onOpenChange={(o) => !o && setCancelPay(null)}
        onSaved={refresh}
      />
    </AppShell>
  );
}

function Metric({
  label,
  v,
  sub,
  icon: Icon,
  primary,
  danger,
}: {
  label: string;
  v: string;
  sub?: string | undefined;
  icon: typeof Wallet;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-border bg-card p-4 shadow-card ${primary ? "border-t-2 border-t-gold" : ""}`}
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4" /> {label}
      </div>
      <p className={`tnum mt-2 text-xl font-bold ${danger ? "text-destructive" : "text-primary"}`}>
        {v}
      </p>
      {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function FeeSetup({
  schoolId,
  yearId,
  grades,
  categories,
  onChanged,
}: {
  schoolId: string;
  yearId: string;
  grades: { id: string; name: string }[];
  categories: { id: string; name: string; is_active: boolean }[];
  onChanged: () => void;
}) {
  const { can, roles } = useWorkspace();
  const canCreate = can("fees", "create", canManageFinance(roles));
  const canAdminister = can("fees", "manage", canManageFinance(roles));
  const qc = useQueryClient();
  const sq = useQuery({
    queryKey: ["fee-structures", schoolId, yearId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_structures")
        .select("*")
        .eq("school_id", schoolId)
        .eq("academic_year_id", yearId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
  const [open, setOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [catName, setCatName] = useState("");
  const [form, setForm] = useState({ name: "", category: "", grade: ALL, amount: "", due: "" });
  const reload = () => {
    qc.invalidateQueries({ queryKey: ["fee-structures", schoolId] });
    onChanged();
  };

  async function saveStructure() {
    if (!form.name.trim() || !form.category || !isValidMoney(form.amount))
      return void toast.error("أكمل الاسم والتصنيف والمبلغ");
    const { error } = await supabase.from("fee_structures").insert({
      school_id: schoolId,
      academic_year_id: yearId,
      grade_id: form.grade === ALL ? null : form.grade,
      fee_category_id: form.category,
      name: form.name.trim(),
      amount: Number(centsToStr(toCents(form.amount))),
      due_date: form.due || null,
    });
    if (error) return void toast.error(financeError(error));
    toast.success("تمت إضافة هيكل الرسوم");
    setOpen(false);
    setForm({ name: "", category: "", grade: ALL, amount: "", due: "" });
    reload();
  }
  async function saveCategory() {
    if (!catName.trim()) return;
    const { error } = await supabase
      .from("fee_categories")
      .insert({ school_id: schoolId, name: catName.trim() });
    if (error) return void toast.error(financeError(error));
    toast.success("تمت إضافة التصنيف");
    setCatOpen(false);
    setCatName("");
    reload();
  }
  async function apply(id: string) {
    const { data, error } = await supabase.rpc("apply_fee_structure", { _structure_id: id });
    if (error) return void toast.error(financeError(error));
    toast.success(
      data ? `أضيف الرسم إلى ${data} طالب` : "جميع الطلاب المعنيين لديهم هذا الرسم مسبقاً",
    );
    reload();
  }
  async function toggle(id: string, active: boolean) {
    const { error } = await supabase
      .from("fee_structures")
      .update({ is_active: !active })
      .eq("id", id);
    if (error) toast.error(financeError(error));
    else reload();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <StatusBadge key={c.id}>{c.name}</StatusBadge>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!canCreate}
            onClick={() => setCatOpen(true)}
          >
            <Plus className="size-4" /> إضافة تصنيف
          </Button>
          <Button
            size="sm"
            onClick={() => setOpen(true)}
            disabled={!canCreate || !categories.length}
          >
            <Plus className="size-4" /> إضافة هيكل رسوم
          </Button>
        </div>
      </div>
      <DataTable
        rows={sq.data ?? []}
        isLoading={sq.isLoading}
        rowKey={(r) => r.id}
        emptyTitle="لا توجد هياكل رسوم لهذه السنة"
        emptyDescription="عرّف الرسوم حسب الصف والتصنيف ثم طبّقها على الطلاب المسجلين."
        columns={[
          { key: "n", header: "الاسم", cell: (r) => <span className="font-medium">{r.name}</span> },
          {
            key: "c",
            header: "التصنيف",
            cell: (r) => categories.find((c) => c.id === r.fee_category_id)?.name ?? "—",
          },
          {
            key: "g",
            header: "الصف",
            cell: (r) =>
              r.grade_id ? (grades.find((g) => g.id === r.grade_id)?.name ?? "—") : "جميع الصفوف",
          },
          {
            key: "a",
            header: "المبلغ",
            cell: (r) => <span className="tnum">{fmtMoney(toCents(r.amount), r.currency)}</span>,
          },
          { key: "d", header: "الاستحقاق", cell: (r) => formatDate(r.due_date) },
          {
            key: "s",
            header: "الحالة",
            cell: (r) => (
              <StatusBadge tone={r.is_active ? "success" : "neutral"}>
                {r.is_active ? "فعال" : "مؤرشف"}
              </StatusBadge>
            ),
          },
          {
            key: "x",
            header: "",
            cell: (r) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    title={`إجراءات ${r.name}`}
                    aria-label={`إجراءات ${r.name}`}
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {r.is_active ? (
                    <DropdownMenuItem disabled={!canCreate} onSelect={() => apply(r.id)}>
                      <Users className="size-4" /> تطبيق على الطلاب المسجلين
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    disabled={!canAdminister}
                    onSelect={() => toggle(r.id, r.is_active)}
                  >
                    {r.is_active ? (
                      <Archive className="size-4" />
                    ) : (
                      <ArchiveRestore className="size-4" />
                    )}
                    {r.is_active ? "أرشفة هيكل الرسوم" : "استعادة هيكل الرسوم"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ),
          },
        ]}
      />

      <Modal
        open={open}
        onOpenChange={setOpen}
        title="إضافة هيكل رسوم"
        footer={
          <>
            <Button onClick={saveStructure}>حفظ</Button>
            <Button variant="outline" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
          </>
        }
      >
        <FormField label="الاسم" required>
          {(p) => (
            <Input
              {...p}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="مثال: الرسوم الدراسية — الصف الأول"
            />
          )}
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="التصنيف" required>
            {(p) => (
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v })}
              >
                <SelectTrigger id={p.id}>
                  <SelectValue placeholder="اختر" />
                </SelectTrigger>
                <SelectContent>
                  {categories
                    .filter((c) => c.is_active)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField label="الصف">
            {(p) => (
              <Select value={form.grade} onValueChange={(v) => setForm({ ...form, grade: v })}>
                <SelectTrigger id={p.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>جميع الصفوف</SelectItem>
                  {grades.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField label="المبلغ (USD)" required>
            {(p) => (
              <Input
                {...p}
                dir="ltr"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            )}
          </FormField>
          <FormField label="تاريخ الاستحقاق">
            {(p) => (
              <Input
                {...p}
                type="date"
                value={form.due}
                onChange={(e) => setForm({ ...form, due: e.target.value })}
              />
            )}
          </FormField>
        </div>
      </Modal>
      <Modal
        open={catOpen}
        onOpenChange={setCatOpen}
        title="إضافة تصنيف"
        footer={
          <>
            <Button onClick={saveCategory}>حفظ</Button>
            <Button variant="outline" onClick={() => setCatOpen(false)}>
              إلغاء
            </Button>
          </>
        }
      >
        <FormField label="الاسم" required>
          {(p) => (
            <Input
              {...p}
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder="مثال: الكتب"
            />
          )}
        </FormField>
      </Modal>
    </div>
  );
}
