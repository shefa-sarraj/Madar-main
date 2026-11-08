import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  CalendarCheck,
  Eye,
  MoreHorizontal,
  Pencil,
  Plus,
  SlidersHorizontal,
  Upload,
  Users,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/app-shell";
import { DataTable, type Column } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { canViewFinance } from "@/lib/finance";
import { AccessDenied, ALL, FilterSelect } from "@/components/app/student-shared";
import { fetchStudentPage } from "@/lib/core-list-pages";
import { usePagination, keepPageData } from "@/lib/pagination";
import {
  canManageStudents,
  canViewStudents,
  fetchStructure,
  formatDate,
  GENDER_LABELS,
  STUDENT_STATUS,
  structureKey,
} from "@/lib/students";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/students/")({
  head: () => ({
    meta: [
      { title: "الطلاب — مدار | Madar" },
      { name: "description", content: "سجل الطلاب وبياناتهم الأساسية وتسجيلاتهم الأكاديمية." },
      { property: "og:title", content: "الطلاب — مدار | Madar" },
      {
        property: "og:description",
        content: "سجل الطلاب وبياناتهم الأساسية وتسجيلاتهم الأكاديمية.",
      },
    ],
  }),
  component: StudentsPage,
});

function StudentsPage() {
  const navigate = useNavigate();
  const { activeSchool, activeYear, academicYears, roles, can } = useWorkspace();
  const schoolId = activeSchool?.id;
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [yearId, setYearId] = useState<string>("");
  const [stageId, setStageId] = useState(ALL);
  const [gradeId, setGradeId] = useState(ALL);
  const [sectionId, setSectionId] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [gender, setGender] = useState(ALL);
  const effectiveYear = yearId || activeYear?.id || "";
  const filters = { search, status, gender, stageId, gradeId, sectionId, yearId: effectiveYear };
  const pagination = usePagination([schoolId, filters]);

  const allowed = can("students", "view", canViewStudents(roles));
  const structure = useQuery({
    queryKey: structureKey(schoolId),
    enabled: !!schoolId && allowed,
    queryFn: () => fetchStructure(schoolId!),
  });
  const students = useQuery({
    placeholderData: (data, query) => keepPageData(data, query, ["students", schoolId]),
    queryKey: ["students", schoolId, "page", filters, pagination.page, pagination.pageSize],
    enabled: !!schoolId && allowed && !!structure.data,
    queryFn: () => fetchStudentPage(schoolId!, pagination, filters, structure.data!.grades),
  });

  const grades = useMemo(() => structure.data?.grades ?? [], [structure.data?.grades]);
  const sections = structure.data?.sections ?? [];
  const gradeName = (id?: string) => grades.find((g) => g.id === id)?.name ?? "—";
  const sectionName = (id?: string | null) => sections.find((s) => s.id === id)?.name ?? "—";

  const rows = useMemo(() => {
    return (students.data?.rows ?? []).map((s) => ({
      ...s,
      current: s.enrollments.find((e) => e.academic_year_id === effectiveYear),
    }));
  }, [students.data, effectiveYear]);
  const activeFilterCount =
    [stageId, gradeId, sectionId, status, gender].filter((v) => v !== ALL).length +
    Number(!!yearId && yearId !== activeYear?.id);

  const columns: Column<(typeof rows)[number]>[] = [
    {
      key: "name",
      header: "الطالب",
      cell: (r) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{r.full_name}</span>
          {r.is_demo ? <StatusBadge tone="neutral">تجريبي</StatusBadge> : null}
        </div>
      ),
    },
    {
      key: "number",
      header: "الرقم المدرسي",
      cell: (r) => <span className="tnum">{r.student_number}</span>,
    },
    { key: "grade", header: "الصف", cell: (r) => gradeName(r.current?.grade_id) },
    { key: "section", header: "الشعبة", cell: (r) => sectionName(r.current?.section_id) },
    {
      key: "guardian",
      header: "ولي الأمر",
      cell: (r) => r.guardians.find((g) => g.is_primary)?.guardian?.full_name ?? "—",
    },
    {
      key: "phone",
      header: "الهاتف",
      cell: (r) => (
        <span className="tnum" dir="ltr">
          {r.phone || r.guardians.find((g) => g.is_primary)?.guardian?.phone || "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      cell: (r) => (
        <StatusBadge tone={STUDENT_STATUS[r.status]?.tone}>
          {STUDENT_STATUS[r.status]?.label ?? r.status}
        </StatusBadge>
      ),
    },
    {
      key: "date",
      header: "تاريخ التسجيل",
      cell: (r) => <span className="tnum">{formatDate(r.enrollment_date)}</span>,
    },
    {
      key: "actions",
      header: "الإجراءات",
      cell: (r) => (
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`إجراءات ${r.full_name}`}
                title="إجراءات الطالب"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to="/students/$studentId" params={{ studentId: r.id }} search={{}}>
                  <Eye /> عرض
                </Link>
              </DropdownMenuItem>
              {can("students", "edit", canManageStudents(roles)) ? (
                <DropdownMenuItem asChild>
                  <Link
                    to="/students/$studentId"
                    params={{ studentId: r.id }}
                    search={{ action: "edit" }}
                  >
                    <Pencil /> تعديل
                  </Link>
                </DropdownMenuItem>
              ) : null}
              {can("fees", "view", canViewFinance(roles)) ? (
                <DropdownMenuItem asChild>
                  <Link
                    to="/students/$studentId"
                    params={{ studentId: r.id }}
                    search={{ tab: "finance" }}
                  >
                    <Wallet /> المالية
                  </Link>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem asChild>
                <Link
                  to="/students/$studentId"
                  params={{ studentId: r.id }}
                  search={{ tab: "attendance" }}
                >
                  <CalendarCheck /> الحضور
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  const filteredGrades = stageId === ALL ? grades : grades.filter((g) => g.stage_id === stageId);
  const filteredSections = sections.filter(
    (s) => s.academic_year_id === effectiveYear && (gradeId === ALL || s.grade_id === gradeId),
  );

  return (
    <AppShell>
      <PageHeader
        title="الطلاب"
        description={allowed ? `الطلاب المطابقون: ${students.data?.total ?? 0}` : undefined}
        actions={
          can("students", "create", canManageStudents(roles)) ? (
            <>
              <Button asChild>
                <Link to="/students/new">
                  <Plus className="size-4" /> إضافة طالب
                </Link>
              </Button>
              <Button
                variant="outline"
                onClick={() => toast.info("استيراد ملفات CSV سيتوفر لاحقاً.")}
              >
                <Upload className="size-4" />
                استيراد CSV
              </Button>
            </>
          ) : null
        }
      />
      {!allowed ? (
        <AccessDenied />
      ) : (
        <>
          <FilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="ابحث بالاسم أو الرقم المدرسي أو ولي الأمر..."
            onReset={() => {
              setSearch("");
              setYearId("");
              setStageId(ALL);
              setGradeId(ALL);
              setSectionId(ALL);
              setStatus(ALL);
              setGender(ALL);
            }}
          >
            <Button
              size="sm"
              variant="outline"
              aria-expanded={filtersOpen}
              aria-controls="students-secondary-filters"
              onClick={() => setFiltersOpen((v) => !v)}
            >
              <SlidersHorizontal className="size-4" /> الفلاتر
              {activeFilterCount ? <span className="tnum">({activeFilterCount})</span> : null}
            </Button>
          </FilterBar>
          <div id="students-secondary-filters" hidden={!filtersOpen}>
            <div className="flex flex-wrap gap-2 border-b border-border pb-4">
              <FilterSelect
                value={effectiveYear}
                onChange={setYearId}
                placeholder="السنة"
                options={academicYears.map((y) => [y.id, y.name])}
                noAll
              />
              <FilterSelect
                value={stageId}
                onChange={(v) => {
                  setStageId(v);
                  setGradeId(ALL);
                  setSectionId(ALL);
                }}
                placeholder="المرحلة"
                options={(structure.data?.stages ?? []).map((s) => [s.id, s.name])}
              />
              <FilterSelect
                value={gradeId}
                onChange={(v) => {
                  setGradeId(v);
                  setSectionId(ALL);
                }}
                placeholder="الصف"
                options={filteredGrades.map((g) => [g.id, g.name])}
              />
              <FilterSelect
                value={sectionId}
                onChange={setSectionId}
                placeholder="الشعبة"
                options={filteredSections.map((s) => [
                  s.id,
                  `${gradeName(s.grade_id)} / ${s.name}`,
                ])}
              />
              <FilterSelect
                value={status}
                onChange={setStatus}
                placeholder="الحالة"
                options={Object.entries(STUDENT_STATUS).map(([k, v]) => [k, v.label])}
              />
              <FilterSelect
                value={gender}
                onChange={setGender}
                placeholder="الجنس"
                options={Object.entries(GENDER_LABELS)}
              />
            </div>
          </div>
          {students.isError || structure.isError ? (
            <EmptyState
              icon={Users}
              title="تعذر تحميل الطلاب"
              description="تحقق من الاتصال ثم أعد المحاولة."
              action={
                <Button
                  variant="outline"
                  onClick={async () => {
                    await structure.refetch();
                    await students.refetch();
                  }}
                >
                  إعادة المحاولة
                </Button>
              }
            />
          ) : (
            <>
              <DataTable
                columns={columns}
                rows={rows}
                pagination={{
                  ...pagination,
                  page: students.data?.page ?? pagination.page,
                  total: students.data?.total ?? 0,
                  loading: students.isFetching,
                }}
                rowKey={(r) => r.id}
                isLoading={students.isPending || structure.isLoading}
                emptyTitle="لا توجد نتائج مطابقة"
                emptyDescription={
                  activeFilterCount || search
                    ? "جرّب تعديل البحث أو الفلاتر."
                    : "ابدأ بإضافة أول طالب أو تحويل طلب قبول مقبول."
                }
                onRowClick={(r) =>
                  navigate({ to: "/students/$studentId", params: { studentId: r.id } })
                }
              />
            </>
          )}
        </>
      )}
    </AppShell>
  );
}
