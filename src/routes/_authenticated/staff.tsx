import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  BriefcaseBusiness,
  Building2,
  GraduationCap,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  SearchX,
  SlidersHorizontal,
  UserCheck,
  Users,
  UserX,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/app-shell";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import {
  DepartmentDialog,
  EmployeeDrawer,
  EmployeeStatusDialog,
} from "@/components/app/staff-dialogs";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { ALL, FilterSelect } from "@/components/app/student-shared";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  EMPLOYEE_STATUS,
  EMPLOYMENT_TYPE,
  canManageStaff,
  canViewStaff,
  staffKey,
  type EmployeeRow,
} from "@/lib/staff";
import { formatDate } from "@/lib/students";
import { useWorkspace } from "@/lib/workspace";
import { fetchStaffMetadata, fetchStaffPage } from "@/lib/core-list-pages";
import { usePagination, keepPageData } from "@/lib/pagination";
import { TablePagination } from "@/components/app/table-pagination";

export const Route = createFileRoute("/_authenticated/staff")({
  head: () => ({
    meta: [
      { title: "الموظفون — مدار | Madar" },
      { name: "description", content: "إدارة ملفات موظفي المدرسة وأقسامهم وحالاتهم الوظيفية." },
      { property: "og:title", content: "الموظفون — مدار | Madar" },
      {
        property: "og:description",
        content: "إدارة ملفات موظفي المدرسة وأقسامهم وحالاتهم الوظيفية.",
      },
    ],
  }),
  component: StaffPage,
});

function StaffPage() {
  const { activeSchool, roles, can } = useWorkspace();
  const queryClient = useQueryClient();
  const schoolId = activeSchool?.id;
  const canView = can("employees", "view", canViewStaff(roles));
  const canManage = can("employees", "edit", canManageStaff(roles));
  const canCreate = can("employees", "create", canManageStaff(roles));
  const canAdminister = can("employees", "manage", canManageStaff(roles));
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState(ALL);
  const [jobTitle, setJobTitle] = useState(ALL);
  const [employmentType, setEmploymentType] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeRow | null>(null);
  const [statusEmployee, setStatusEmployee] = useState<EmployeeRow | null>(null);
  const [departmentsOpen, setDepartmentsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filters = { search, department, jobTitle, employmentType, status };
  const pagination = usePagination([schoolId, filters]);
  const filterCount = [department, jobTitle, employmentType, status].filter(
    (value) => value !== ALL,
  ).length;

  const query = useQuery({
    placeholderData: (data, query) => keepPageData(data, query, staffKey(schoolId)),
    queryKey: [...staffKey(schoolId), "page", filters, pagination.page, pagination.pageSize],
    enabled: !!schoolId && canView,
    queryFn: () => fetchStaffPage(schoolId!, pagination, filters),
  });
  const metadata = useQuery({
    queryKey: [...staffKey(schoolId), "metadata"],
    enabled: !!schoolId && canView,
    queryFn: () => fetchStaffMetadata(schoolId!),
  });
  const data =
    metadata.data && query.data ? { ...metadata.data, employees: query.data.rows } : undefined;
  const summary = metadata.data?.summary ?? { total: 0, active: 0, teachers: 0, administrative: 0 };
  const jobTitles = metadata.data?.jobTitles ?? [];
  const filtered = query.data?.rows ?? [];
  const controls = {
    ...pagination,
    page: query.data?.page ?? pagination.page,
    total: query.data?.total ?? 0,
    loading: query.isFetching,
  };

  const refresh = () => void queryClient.invalidateQueries({ queryKey: staffKey(schoolId) });
  const resetFilters = () => {
    setSearch("");
    setDepartment(ALL);
    setJobTitle(ALL);
    setEmploymentType(ALL);
    setStatus(ALL);
  };
  const addEmployee = () => {
    if (!data?.departments.some((item) => item.is_active)) {
      toast.info("أضف قسماً واحداً على الأقل أولاً.");
      setDepartmentsOpen(true);
      return;
    }
    setEditing(null);
    setDrawerOpen(true);
  };
  const editEmployee = (employee: EmployeeRow) => {
    setEditing(employee);
    setDrawerOpen(true);
  };

  return (
    <AppShell>
      <PageHeader
        title="الموظفون"
        description={
          activeSchool ? `ملفات موظفي ${activeSchool.name_ar}` : "ملفات الموظفين والأقسام"
        }
        actions={
          canCreate && schoolId ? (
            <>
              <Button onClick={addEmployee} disabled={query.isPending || query.isError}>
                <Plus className="size-4" />
                إضافة موظف
              </Button>
              <Button variant="outline" onClick={() => setDepartmentsOpen(true)}>
                <Building2 className="size-4" />
                الأقسام
              </Button>
            </>
          ) : null
        }
      />

      {!canView ? (
        <EmptyState
          icon={Lock}
          title="لا تملك صلاحية الوصول إلى الموظفين"
          description="يمكن لمالك المدرسة ومديرها والموارد البشرية الإدارة، وللمحاسب ومسجل الطلبة العرض فقط."
        />
      ) : query.isLoading || metadata.isLoading ? (
        <DataTable<EmployeeRow> rows={[]} rowKey={(row) => row.id} columns={[]} isLoading />
      ) : query.isError || metadata.isError || !data ? (
        <EmptyState
          icon={SearchX}
          title="تعذر تحميل الموظفين"
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
          <section className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4 [&>div]:p-3 [&>div>div>span]:hidden sm:[&>div>div>span]:flex">
            <StatCard label="إجمالي الموظفين" value={summary.total} icon={Users} accent />
            <StatCard label="الموظفون الفعالون" value={summary.active} icon={UserCheck} />
            <StatCard label="المعلمون الفعالون" value={summary.teachers} icon={GraduationCap} />
            <StatCard
              label="الإداريون الفعالون"
              value={summary.administrative}
              icon={BriefcaseBusiness}
            />
          </section>

          <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen} className="space-y-3">
            <FilterBar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="الاسم، الرقم الوظيفي، الهاتف، أو البريد"
            >
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm">
                  <SlidersHorizontal className="size-4" /> الفلاتر
                  {filterCount ? <span className="tnum">({filterCount})</span> : null}
                </Button>
              </CollapsibleTrigger>
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="text-muted-foreground"
              >
                <RotateCcw className="size-4" /> مسح
              </Button>
            </FilterBar>
            <CollapsibleContent className="flex flex-wrap gap-2 border-b border-border pb-3">
              <FilterSelect
                value={department}
                onChange={setDepartment}
                placeholder="القسم"
                options={data.departments.map((item) => [item.id, item.name])}
              />
              <FilterSelect
                value={jobTitle}
                onChange={setJobTitle}
                placeholder="المسمى الوظيفي"
                options={jobTitles.map((item) => [item, item])}
              />
              <FilterSelect
                value={employmentType}
                onChange={setEmploymentType}
                placeholder="نوع التوظيف"
                options={Object.entries(EMPLOYMENT_TYPE)}
              />
              <FilterSelect
                value={status}
                onChange={setStatus}
                placeholder="الحالة"
                options={Object.entries(EMPLOYEE_STATUS).map(([key, item]) => [key, item.label])}
              />
            </CollapsibleContent>
          </Collapsible>

          <div className="hidden md:block">
            <DataTable
              pagination={controls}
              rows={filtered}
              rowKey={(employee) => employee.id}
              emptyTitle={summary.total ? "لا توجد نتائج مطابقة" : "لا يوجد موظفون بعد"}
              emptyDescription={
                summary.total
                  ? "غيّر عوامل التصفية لعرض نتائج أخرى."
                  : "أضف أول موظف لبدء إدارة فريق المدرسة."
              }
              columns={[
                {
                  key: "name",
                  header: "الاسم الكامل",
                  className: "min-w-44",
                  cell: (employee) => (
                    <div>
                      <p className="font-medium">{employee.full_name}</p>
                      <p dir="ltr" className="tnum text-right text-xs text-muted-foreground">
                        {employee.employee_number}
                      </p>
                      {employee.is_teacher ? (
                        <p className="text-xs text-muted-foreground">موظف تعليمي</p>
                      ) : null}
                    </div>
                  ),
                },
                {
                  key: "job",
                  header: "الوظيفة / القسم",
                  cell: (employee) => (
                    <div>
                      <p>{employee.job_title}</p>
                      <p className="text-xs text-muted-foreground">
                        {employee.department_name ?? "—"}
                      </p>
                    </div>
                  ),
                },
                {
                  key: "type",
                  header: "التوظيف",
                  cell: (employee) => (
                    <div>
                      <p>{EMPLOYMENT_TYPE[employee.employment_type] ?? employee.employment_type}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(employee.hire_date)}
                      </p>
                    </div>
                  ),
                },
                {
                  key: "phone",
                  header: "التواصل",
                  cell: (employee) => (
                    <div className="max-w-48 space-y-1">
                      <span dir="ltr" className="tnum block text-end">
                        {employee.phone ?? "—"}
                      </span>
                      <span
                        dir="ltr"
                        className="block truncate text-right text-xs text-muted-foreground"
                        title={employee.email ?? undefined}
                      >
                        {employee.email ?? "—"}
                      </span>
                    </div>
                  ),
                },
                {
                  key: "status",
                  header: "الحالة",
                  cell: (employee) => {
                    const item = EMPLOYEE_STATUS[employee.status] ?? {
                      label: employee.status,
                      tone: "neutral" as const,
                    };
                    return <StatusBadge tone={item.tone}>{item.label}</StatusBadge>;
                  },
                },
                ...(canManage
                  ? [
                      {
                        key: "actions",
                        header: "",
                        align: "center" as const,
                        cell: (employee: EmployeeRow) => (
                          <StaffActions
                            employee={employee}
                            canAdminister={canAdminister}
                            onEdit={() => editEmployee(employee)}
                            onStatus={() => setStatusEmployee(employee)}
                          />
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </div>
          <div className="space-y-2 md:hidden">
            {filtered.length ? (
              filtered.map((employee) => (
                <article
                  key={employee.id}
                  className="min-w-0 rounded-lg border border-border bg-card p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="break-words text-sm font-semibold">{employee.full_name}</h3>
                      <p dir="ltr" className="tnum text-right text-xs text-muted-foreground">
                        {employee.employee_number}
                      </p>
                    </div>
                    {canManage ? (
                      <StaffActions
                        employee={employee}
                        canAdminister={canAdminister}
                        onEdit={() => editEmployee(employee)}
                        onStatus={() => setStatusEmployee(employee)}
                      />
                    ) : null}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusBadge tone={EMPLOYEE_STATUS[employee.status]?.tone ?? "neutral"}>
                      {EMPLOYEE_STATUS[employee.status]?.label ?? employee.status}
                    </StatusBadge>
                    {employee.is_teacher ? (
                      <span className="text-xs text-muted-foreground">معلم</span>
                    ) : null}
                  </div>
                  <p className="mt-2 break-words text-sm">
                    {employee.job_title} · {employee.department_name ?? "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {EMPLOYMENT_TYPE[employee.employment_type]} · {formatDate(employee.hire_date)}
                  </p>
                  {employee.phone || employee.email ? (
                    <div className="mt-2 border-t border-border pt-2 text-xs">
                      {employee.phone ? (
                        <p dir="ltr" className="tnum text-right">
                          {employee.phone}
                        </p>
                      ) : null}
                      {employee.email ? (
                        <p dir="ltr" className="break-all text-right text-muted-foreground">
                          {employee.email}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              ))
            ) : (
              <EmptyState
                title={summary.total ? "لا توجد نتائج مطابقة" : "لا يوجد موظفون بعد"}
                description={
                  summary.total
                    ? "غيّر عوامل التصفية لعرض نتائج أخرى."
                    : "أضف أول موظف لبدء إدارة فريق المدرسة."
                }
              />
            )}
            <TablePagination {...controls} />
          </div>
        </>
      )}

      {schoolId && data ? (
        <>
          <EmployeeDrawer
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            schoolId={schoolId}
            employee={editing}
            departments={data.departments}
            onSaved={refresh}
          />
          <DepartmentDialog
            open={departmentsOpen}
            onOpenChange={setDepartmentsOpen}
            schoolId={schoolId}
            departments={data.departments}
            onChanged={refresh}
          />
        </>
      ) : null}
      <EmployeeStatusDialog
        employee={statusEmployee}
        open={!!statusEmployee}
        onOpenChange={(open) => {
          if (!open) setStatusEmployee(null);
        }}
        onSaved={() => {
          setStatusEmployee(null);
          refresh();
        }}
      />
    </AppShell>
  );
}

function StaffActions({
  employee,
  canAdminister,
  onEdit,
  onStatus,
}: {
  employee: EmployeeRow;
  canAdminister: boolean;
  onEdit: () => void;
  onStatus: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0"
          aria-label={`إجراءات ${employee.full_name}`}
          title={`إجراءات ${employee.full_name}`}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil className="size-4" /> تعديل
        </DropdownMenuItem>
        {employee.status === "active" || employee.status === "inactive" ? (
          <DropdownMenuItem disabled={!canAdminister} onSelect={onStatus}>
            {employee.status === "inactive" ? (
              <RotateCcw className="size-4" />
            ) : (
              <UserX className="size-4" />
            )}
            {employee.status === "inactive" ? "إعادة التفعيل" : "إلغاء التفعيل"}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
