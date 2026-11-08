import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FileBarChart, RefreshCw, SearchX, SlidersHorizontal } from "lucide-react";

import { AppShell } from "@/components/app/app-shell";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { ReportView } from "@/components/app/report-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { REPORT_GROUPS, visibleAcademicYears } from "@/lib/settings-report-presentation";
import { REPORT_OPTIONS, type ReportId } from "@/lib/reports";
import { useWorkspace } from "@/lib/workspace";
import { fetchReportPage } from "@/lib/report-pages.functions";
import { usePagination, keepPageData } from "@/lib/pagination";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "التقارير — مدار | Madar" },
      { name: "description", content: "تقارير المدرسة الأكاديمية والإدارية والمالية." },
      { property: "og:title", content: "التقارير — مدار | Madar" },
      {
        property: "og:description",
        content: "تقارير المدرسة الأكاديمية والإدارية والمالية.",
      },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const { activeSchool, activeYear, academicYears, setActiveYear, roles, can } = useWorkspace();
  const allowed = can("reports", "view", roles.length > 0);
  const [reportId, setReportId] = useState<ReportId>("students");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string>>({});

  const params = {
    schoolId: activeSchool?.id ?? "",
    yearId: activeYear?.id ?? "",
    currency: activeSchool?.currency ?? "USD",
    reportId,
    search,
    fromDate,
    toDate,
    filters: selectedFilters,
  };
  const pagination = usePagination(params);
  const query = useQuery({
    placeholderData: (data, query) =>
      keepPageData(data, query, ["reports", activeSchool?.id, activeYear?.id]),
    queryKey: [
      "reports",
      activeSchool?.id,
      activeYear?.id,
      params,
      pagination.page,
      pagination.pageSize,
    ],
    enabled: !!activeSchool && !!activeYear && allowed,
    queryFn: () =>
      fetchReportPage({
        data: { ...params, page: pagination.page, pageSize: pagination.pageSize, exportAll: false },
      }),
  });
  const sourceAllowed = can(reportId === "finance" ? "fees" : reportId, "view", roles.length > 0);
  const report = allowed && sourceAllowed ? query.data?.report : undefined;

  useEffect(() => {
    setSearch("");
    setFromDate("");
    setToDate("");
    setSelectedFilters({});
  }, [reportId]);

  const rows = query.data?.report.rows ?? [];
  const activeFilters = Object.keys(selectedFilters).length + Number(!!fromDate) + Number(!!toDate);
  const cards = query.data?.cards ?? [];
  const period =
    fromDate || toDate
      ? `الفترة: ${fromDate || "البداية"} إلى ${toDate || "اليوم"}`
      : "جميع الفترات المتاحة";

  function resetFilters() {
    setSearch("");
    setFromDate("");
    setToDate("");
    setSelectedFilters({});
  }

  function setReportFilter(key: string, value: string) {
    setSelectedFilters((current) => {
      const next = { ...current };
      if (value === "__all") delete next[key];
      else next[key] = value;
      return next;
    });
  }

  const filterControls = report ? (
    <>
      {report.dateRelevant ? (
        <>
          <Input
            aria-label="من تاريخ"
            title="من تاريخ"
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
            className="w-40"
          />
          <Input
            aria-label="إلى تاريخ"
            title="إلى تاريخ"
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
            className="w-40"
          />
        </>
      ) : null}
      {report.filters.map((filter) => (
        <Select
          key={filter.key}
          value={selectedFilters[filter.key] ?? "__all"}
          onValueChange={(value) => setReportFilter(filter.key, value)}
        >
          <SelectTrigger className="w-44" aria-label={filter.label}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">كل {filter.label}</SelectItem>
            {filter.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
    </>
  ) : null;

  if (!allowed)
    return (
      <AppShell>
        <EmptyState title="لا تملك صلاحية الوصول" />
      </AppShell>
    );
  return (
    <AppShell>
      <PageHeader
        title="التقارير"
        description="تقارير تشغيلية مستخرجة مباشرة من بيانات المدرسة المسموح لك بعرضها."
        actions={
          <Button
            variant="outline"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw className={query.isFetching ? "size-4 animate-spin" : "size-4"} />
            تحديث
          </Button>
        }
      />

      <section className="no-print flex min-w-0 flex-wrap items-end gap-3 border-b border-border pb-3">
        <div className="w-full space-y-1.5 sm:w-48">
          <label htmlFor="report-group" className="text-xs font-medium text-muted-foreground">
            فئة التقرير
          </label>
          <Select
            value={REPORT_GROUPS.find((group) => group.reports.includes(reportId))?.label ?? ""}
            onValueChange={(value) => {
              const first = REPORT_GROUPS.find((group) => group.label === value)?.reports[0];
              if (first) setReportId(first);
            }}
          >
            <SelectTrigger id="report-group">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REPORT_GROUPS.map((group) => (
                <SelectItem key={group.label} value={group.label}>
                  {group.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full space-y-1.5 sm:w-64">
          <label htmlFor="report-type" className="text-xs font-medium text-muted-foreground">
            نوع التقرير
          </label>
          <Select value={reportId} onValueChange={(value) => setReportId(value as ReportId)}>
            <SelectTrigger id="report-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REPORT_GROUPS.find((group) => group.reports.includes(reportId))?.reports.map(
                (id) => (
                  <SelectItem key={id} value={id}>
                    {REPORT_OPTIONS.find((option) => option.id === id)?.label}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>
        {report?.yearRelevant ? (
          <div className="space-y-1.5">
            <label htmlFor="report-year" className="text-xs font-medium text-muted-foreground">
              السنة الدراسية
            </label>
            <Select
              {...(activeYear?.id ? { value: activeYear.id } : {})}
              onValueChange={setActiveYear}
            >
              <SelectTrigger id="report-year">
                <SelectValue placeholder="اختر السنة الدراسية" />
              </SelectTrigger>
              <SelectContent>
                {visibleAcademicYears(academicYears, activeYear?.id).map((year) => (
                  <SelectItem key={year.id} value={year.id}>
                    {year.name}
                    {year.is_active ? " · النشطة" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </section>

      {report ? (
        <div className="no-print">
          <FilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="بحث داخل التقرير..."
            onReset={resetFilters}
          >
            {report.dateRelevant || report.filters.length ? (
              <Button
                variant="outline"
                aria-expanded={filtersOpen}
                aria-controls="report-filters"
                onClick={() => setFiltersOpen(!filtersOpen)}
              >
                <SlidersHorizontal className="size-4" />
                الفلاتر{activeFilters ? <span className="tnum">{activeFilters}</span> : null}
              </Button>
            ) : null}
          </FilterBar>
          <div id="report-filters" hidden={!filtersOpen}>
            <div className="flex flex-wrap gap-2 border-b border-border py-3">{filterControls}</div>
          </div>
        </div>
      ) : null}

      {query.isLoading ? (
        <div className="grid min-h-56 place-items-center rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="size-4 animate-spin" />
            جارٍ إعداد التقارير...
          </div>
        </div>
      ) : query.isError ? (
        <EmptyState
          icon={SearchX}
          title="تعذر إعداد التقارير"
          description="تحقق من الاتصال ثم أعد المحاولة."
          action={
            <Button variant="outline" onClick={() => void query.refetch()}>
              إعادة المحاولة
            </Button>
          }
        />
      ) : report && activeSchool ? (
        <ReportView
          report={report}
          pagination={{
            ...pagination,
            page: query.data?.page ?? pagination.page,
            total: query.data?.total ?? 0,
            loading: query.isFetching,
          }}
          onExport={async () =>
            (
              await fetchReportPage({
                data: { ...params, page: 1, pageSize: pagination.pageSize, exportAll: true },
              })
            ).report.rows
          }
          rows={rows}
          cards={cards}
          schoolName={activeSchool.name_ar}
          yearName={report.yearRelevant ? (activeYear?.name ?? null) : null}
          period={period}
        />
      ) : (
        <EmptyState
          icon={FileBarChart}
          title="اختر مدرسة وسنة دراسية"
          description="يلزم تحديد سياق المدرسة قبل إعداد التقارير."
        />
      )}
    </AppShell>
  );
}
