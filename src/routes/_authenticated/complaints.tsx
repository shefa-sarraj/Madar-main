import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardPlus,
  Eye,
  FolderClock,
  MoreHorizontal,
  SlidersHorizontal,
  Pencil,
  Plus,
  SearchX,
} from "lucide-react";

import { AppShell } from "@/components/app/app-shell";
import { CaseDetailsDrawer, CaseDrawer } from "@/components/app/case-dialogs";
import { TablePagination } from "@/components/app/table-pagination";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { ALL, FilterSelect } from "@/components/app/student-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CASE_PRIORITIES,
  CASE_STATUSES,
  CASE_TYPES,
  canCreateScopedCases,
  canManageAllCases,
  casesKey,
  isUnresolvedCase,
  type CaseRow,
} from "@/lib/cases";
import { formatDate } from "@/lib/students";
import { useWorkspace } from "@/lib/workspace";
import { fetchCasesMetadata, fetchCasesPage } from "@/lib/operational-list-pages";
import { usePagination, keepPageData } from "@/lib/pagination";

export const Route = createFileRoute("/_authenticated/complaints")({
  head: () => ({
    meta: [
      { title: "الشكاوى والملاحظات — مدار | Madar" },
      { name: "description", content: "إدارة الحالات والشكاوى والملاحظات الداخلية للمدرسة." },
      { property: "og:title", content: "الشكاوى والملاحظات — مدار | Madar" },
      {
        property: "og:description",
        content: "إدارة الحالات والشكاوى والملاحظات الداخلية للمدرسة.",
      },
    ],
  }),
  component: ComplaintsPage,
});

function ComplaintsPage() {
  const { activeSchool, activeYear, roles, userId, can } = useWorkspace();
  const queryClient = useQueryClient();
  const schoolId = activeSchool?.id;
  const canCreate = can("cases", "create", canCreateScopedCases(roles));
  const canView = can("cases", "view", roles.length > 0);
  const fullManager = canManageAllCases(roles);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(ALL);
  const [priority, setPriority] = useState(ALL);
  const [type, setType] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [assignee, setAssignee] = useState(ALL);
  const [student, setStudent] = useState(ALL);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CaseRow | null>(null);
  const [details, setDetails] = useState<CaseRow | null>(null);

  const filters = { search, status, priority, type, category, student, assignee, fromDate, toDate };
  const pagination = usePagination([schoolId, filters]);
  const metadata = useQuery({
    queryKey: [...casesKey(schoolId), "metadata"],
    enabled: !!schoolId && canView,
    queryFn: () => fetchCasesMetadata(schoolId!),
  });
  const query = useQuery({
    placeholderData: (data, query) => keepPageData(data, query, casesKey(schoolId)),
    queryKey: [...casesKey(schoolId), "page", filters, pagination.page, pagination.pageSize],
    enabled: !!schoolId && canView && !!metadata.data,
    queryFn: () => fetchCasesPage(schoolId!, pagination, filters, metadata.data!),
  });
  const data = canView ? query.data : undefined;
  const summary = metadata.data?.summary ?? {
    newCases: 0,
    active: 0,
    highUnresolved: 0,
    resolvedThisMonth: 0,
  };
  const categories = metadata.data?.categories ?? [];
  const filtered = data?.cases ?? [];

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: casesKey(schoolId) });
    void queryClient.invalidateQueries({ queryKey: ["dashboard-cases", schoolId] });
    void queryClient.invalidateQueries({ queryKey: ["notifications", schoolId] });
  }
  function reset() {
    setSearch("");
    setStatus(ALL);
    setPriority(ALL);
    setType(ALL);
    setCategory(ALL);
    setAssignee(ALL);
    setStudent(ALL);
    setFromDate("");
    setToDate("");
  }
  function canEdit(item: CaseRow) {
    if (fullManager || can("cases", "edit")) return true;
    if (roles.includes("hr") && !!item.employee_id) return true;
    if (roles.includes("registrar") && (!!item.student_id || !!item.guardian_id)) return true;
    if (roles.includes("teacher") && !!item.student_id) return true;
    return item.assigned_to_user_id === userId;
  }
  function canEditDetails(item: CaseRow) {
    return (
      fullManager ||
      can("cases", "edit") ||
      (roles.includes("hr") && !!item.employee_id) ||
      (roles.includes("registrar") && (!!item.student_id || !!item.guardian_id))
    );
  }

  const activeFilters =
    [status, priority, type, category, assignee, student].filter((value) => value !== ALL).length +
    Number(!!fromDate) +
    Number(!!toDate);
  const pageControl = {
    ...pagination,
    page: data?.page ?? pagination.page,
    total: data?.total ?? 0,
    loading: query.isFetching,
  };
  const needsAttention = (item: CaseRow) =>
    ["high", "urgent"].includes(item.priority) && isUnresolvedCase(item);
  const caseActions = (item: CaseRow) => (
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          title="إجراءات الحالة"
          aria-label={`إجراءات ${item.case_number}`}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setDetails(item)}>
          <Eye className="size-4" />
          التفاصيل والتعليقات
        </DropdownMenuItem>
        {canEdit(item) ? (
          <DropdownMenuItem
            onClick={() => {
              setEditing(item);
              setEditorOpen(true);
            }}
          >
            <Pencil className="size-4" />
            {canEditDetails(item) ? "تعديل وتحديث الحالة" : "تحديث الحالة"}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  if (!canView)
    return (
      <AppShell>
        <EmptyState title="لا تملك صلاحية الوصول" />
      </AppShell>
    );
  return (
    <AppShell>
      <PageHeader
        title="الشكاوى والملاحظات"
        description="متابعة الحالات التشغيلية الحساسة ضمن نطاق صلاحياتك."
        actions={
          canCreate ? (
            <Button
              onClick={() => {
                setEditing(null);
                setEditorOpen(true);
              }}
            >
              <Plus className="size-4" />
              حالة جديدة
            </Button>
          ) : undefined
        }
      />
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="حالات جديدة" value={summary.newCases} icon={ClipboardPlus} />
        <StatCard label="قيد المراجعة والمتابعة" value={summary.active} icon={FolderClock} />
        <StatCard
          label="عالية وعاجلة غير محلولة"
          value={summary.highUnresolved}
          icon={AlertTriangle}
        />
        <StatCard label="تم حلها هذا الشهر" value={summary.resolvedThisMonth} icon={CheckCircle2} />
      </section>

      {query.isError || metadata.isError ? (
        <EmptyState
          icon={SearchX}
          title="تعذر تحميل الحالات"
          description="تحقق من الاتصال أو الصلاحيات ثم حاول مرة أخرى."
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
      ) : query.isPending ? (
        <DataTable rows={[]} columns={[]} rowKey={() => ""} isLoading />
      ) : data ? (
        <>
          <FilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="ابحث بالرقم أو العنوان أو الوصف أو الشخص..."
            onReset={reset}
          >
            <Button
              variant="outline"
              aria-expanded={filtersOpen}
              aria-controls="case-filters"
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <SlidersHorizontal className="size-4" />
              الفلاتر{activeFilters ? <span className="tnum">{activeFilters}</span> : null}
            </Button>
          </FilterBar>
          <div id="case-filters" hidden={!filtersOpen}>
            <div className="flex flex-wrap gap-2 border-b border-border pb-3">
              <FilterSelect
                value={status}
                onChange={setStatus}
                placeholder="الحالة"
                options={Object.entries(CASE_STATUSES).map(([k, v]) => [k, v.label])}
              />
              <FilterSelect
                value={priority}
                onChange={setPriority}
                placeholder="الأولوية"
                options={Object.entries(CASE_PRIORITIES).map(([k, v]) => [k, v.label])}
              />
              <FilterSelect
                value={type}
                onChange={setType}
                placeholder="النوع"
                options={Object.entries(CASE_TYPES).map(([k, v]) => [k, v.label])}
              />
              <FilterSelect
                value={category}
                onChange={setCategory}
                placeholder="التصنيف"
                options={categories.map((x) => [x, x])}
              />
              <FilterSelect
                value={assignee}
                onChange={setAssignee}
                placeholder="المسند إليه"
                options={[
                  ["unassigned", "بدون إسناد"],
                  ...data.assignees.map((x) => [`${x.kind}:${x.id}`, x.name] as [string, string]),
                ]}
              />
              <FilterSelect
                value={student}
                onChange={setStudent}
                placeholder="الطالب"
                options={data.students.map((x) => [x.id, x.name])}
              />
              <Input
                aria-label="من تاريخ"
                title="من تاريخ"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-36"
              />
              <Input
                aria-label="إلى تاريخ"
                title="إلى تاريخ"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-36"
              />
            </div>
          </div>
          <div className="hidden md:block">
            <DataTable
              pagination={{
                ...pagination,
                page: data!.page,
                total: data!.total,
                loading: query.isFetching,
              }}
              rows={filtered}
              rowKey={(item) => item.id}
              emptyTitle={activeFilters || search ? "لا توجد حالات مطابقة" : "لا توجد حالات متاحة"}
              emptyDescription={
                activeFilters || search
                  ? "غيّر عوامل التصفية لعرض نتائج أخرى."
                  : canCreate
                    ? "أنشئ أول حالة تشغيلية ضمن نطاق صلاحياتك."
                    : "لا توجد حالات مسندة أو متاحة لدورك."
              }
              columns={[
                {
                  key: "title",
                  header: "الحالة ورقمها",
                  className: "min-w-48",
                  cell: (item) => (
                    <div
                      className={
                        needsAttention(item) ? "border-s-2 border-destructive/40 ps-2" : ""
                      }
                    >
                      <button
                        type="button"
                        onClick={() => setDetails(item)}
                        className="max-w-full break-words text-start font-medium hover:underline"
                      >
                        {item.title}
                      </button>
                      <p dir="ltr" className="tnum text-end text-xs text-muted-foreground">
                        {item.case_number}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {CASE_TYPES[item.type].label} · {item.category}
                      </p>
                    </div>
                  ),
                },
                {
                  key: "priority",
                  header: "الأولوية",
                  cell: (item) => (
                    <div>
                      <StatusBadge tone={CASE_PRIORITIES[item.priority].tone}>
                        {CASE_PRIORITIES[item.priority].label}
                      </StatusBadge>
                      {needsAttention(item) ? (
                        <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                          <AlertTriangle className="size-3" />
                          تحتاج متابعة
                        </p>
                      ) : null}
                    </div>
                  ),
                },
                {
                  key: "status",
                  header: "الحالة",
                  cell: (item) => (
                    <StatusBadge tone={CASE_STATUSES[item.status].tone}>
                      {CASE_STATUSES[item.status].label}
                    </StatusBadge>
                  ),
                },
                {
                  key: "assigned",
                  header: "المتابعة",
                  cell: (item) => (
                    <div className="text-xs text-muted-foreground">
                      <p>{item.assigned_name ?? "بدون إسناد"}</p>
                      <p className="mt-1">
                        {item.student_name ??
                          item.guardian_name ??
                          item.employee_name ??
                          "حالة عامة"}
                      </p>
                    </div>
                  ),
                },
                {
                  key: "created",
                  header: "تاريخ الإنشاء",
                  cell: (item) => (
                    <span className="text-xs text-muted-foreground">
                      {formatDate(item.created_at)}
                    </span>
                  ),
                },
                {
                  key: "actions",
                  header: "الإجراءات",
                  align: "end",
                  className: "w-12",
                  cell: caseActions,
                },
              ]}
            />
          </div>
          <div className="min-w-0 md:hidden" aria-busy={query.isFetching}>
            <div className="space-y-2">
              {filtered.length ? (
                filtered.map((item) => (
                  <article
                    key={item.id}
                    className={`min-w-0 rounded-md border bg-card p-3 ${needsAttention(item) ? "border-destructive/35" : "border-border"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <button
                          type="button"
                          className="break-words text-start text-sm font-semibold hover:underline"
                          onClick={() => setDetails(item)}
                        >
                          {item.title}
                        </button>
                        <p dir="ltr" className="tnum mt-1 text-end text-xs text-muted-foreground">
                          {item.case_number}
                        </p>
                      </div>
                      {caseActions(item)}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusBadge tone={CASE_PRIORITIES[item.priority].tone}>
                        {CASE_PRIORITIES[item.priority].label}
                      </StatusBadge>
                      <StatusBadge tone={CASE_STATUSES[item.status].tone}>
                        {CASE_STATUSES[item.status].label}
                      </StatusBadge>
                      {needsAttention(item) ? (
                        <span className="flex items-center gap-1 text-xs text-destructive">
                          <AlertTriangle className="size-3" />
                          تحتاج متابعة
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-3 break-words text-xs text-muted-foreground">
                      {CASE_TYPES[item.type].label} · {item.category}
                    </p>
                    <p className="mt-1 break-words text-xs text-muted-foreground">
                      {item.assigned_name ?? "بدون إسناد"} ·{" "}
                      {item.student_name ?? item.guardian_name ?? item.employee_name ?? "حالة عامة"}
                    </p>
                  </article>
                ))
              ) : (
                <EmptyState
                  icon={FolderClock}
                  title={activeFilters || search ? "لا توجد حالات مطابقة" : "لا توجد حالات متاحة"}
                  description={
                    activeFilters || search
                      ? "غيّر عوامل التصفية لعرض نتائج أخرى."
                      : "لا توجد حالات متاحة ضمن صلاحياتك."
                  }
                />
              )}
            </div>
            <TablePagination {...pageControl} />
          </div>
        </>
      ) : null}

      {schoolId && data ? (
        <CaseDrawer
          open={editorOpen}
          onOpenChange={setEditorOpen}
          schoolId={schoolId}
          {...(activeYear?.id ? { academicYearId: activeYear.id } : {})}
          item={editing}
          canEditDetails={!editing || canEditDetails(editing)}
          students={data.students}
          guardians={data.guardians}
          employees={data.employees}
          assignees={data.assignees}
          onSaved={invalidate}
        />
      ) : null}
      <CaseDetailsDrawer
        item={details}
        comments={(data?.comments ?? []).filter((x) => x.case_id === details?.id)}
        open={!!details}
        onOpenChange={(open) => {
          if (!open) setDetails(null);
        }}
        onSaved={invalidate}
      />
    </AppShell>
  );
}
