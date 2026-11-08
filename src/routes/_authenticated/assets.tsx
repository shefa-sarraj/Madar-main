import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Archive,
  ArrowLeftRight,
  Boxes,
  CircleAlert,
  History,
  Lock,
  MoreHorizontal,
  SlidersHorizontal,
  Pencil,
  Plus,
  SearchX,
  Tags,
  Undo2,
  UserCheck,
  UserPlus,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/app-shell";
import {
  AssetCategoryDialog,
  AssetDrawer,
  AssetEventDrawer,
  AssetHistoryDialog,
} from "@/components/app/asset-dialogs";
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
import {
  ASSET_CONDITION,
  ASSET_STATUS,
  assetsKey,
  canManageAssets,
  canViewAssets,
  formatAssetCost,
  type AssetEventType,
  type AssetRow,
} from "@/lib/assets";
import { formatDate } from "@/lib/students";
import { useWorkspace } from "@/lib/workspace";
import { fetchAssetsMetadata, fetchAssetsPage } from "@/lib/operational-list-pages";
import { usePagination, keepPageData } from "@/lib/pagination";

export const Route = createFileRoute("/_authenticated/assets")({
  head: () => ({
    meta: [
      { title: "الأصول — مدار | Madar" },
      { name: "description", content: "أصول المدرسة وسجل العهدة." },
      { property: "og:title", content: "الأصول — مدار | Madar" },
      { property: "og:description", content: "أصول المدرسة وسجل العهدة." },
    ],
  }),
  component: AssetsPage,
});

function AssetsPage() {
  const { activeSchool, roles, can } = useWorkspace();
  const queryClient = useQueryClient();
  const schoolId = activeSchool?.id;
  const canView = can("assets", "view", canViewAssets(roles));
  const canManage = can("assets", "edit", canManageAssets(roles));
  const canCreate = can("assets", "create", canManageAssets(roles));
  const canAdminister = can("assets", "manage", canManageAssets(roles));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [condition, setCondition] = useState(ALL);
  const [location, setLocation] = useState(ALL);
  const [assignment, setAssignment] = useState(ALL);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<AssetRow | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [eventAsset, setEventAsset] = useState<AssetRow | null>(null);
  const [eventType, setEventType] = useState<Exclude<AssetEventType, "registered">>("assigned");
  const [historyAsset, setHistoryAsset] = useState<AssetRow | null>(null);
  const filters = { search, category, status, condition, location, assignment };
  const pagination = usePagination([schoolId, filters]);
  const metadata = useQuery({
    queryKey: [...assetsKey(schoolId), "metadata"],
    enabled: !!schoolId && canView,
    queryFn: () => fetchAssetsMetadata(schoolId!),
  });

  const query = useQuery({
    placeholderData: (data, query) => keepPageData(data, query, assetsKey(schoolId)),
    queryKey: [...assetsKey(schoolId), "page", filters, pagination.page, pagination.pageSize],
    enabled: !!schoolId && canView && !!metadata.data,
    queryFn: () => fetchAssetsPage(schoolId!, pagination, filters, metadata.data!),
  });
  const data = query.data;
  const summary = metadata.data?.summary ?? {
    active: 0,
    assigned: 0,
    maintenance: 0,
    damagedOrRetired: 0,
  };
  const locations = metadata.data?.locations ?? [];
  const filtered = data?.assets ?? [];

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: assetsKey(schoolId) });
    void queryClient.invalidateQueries({ queryKey: ["dashboard-assets", schoolId] });
  };
  const resetFilters = () => {
    setSearch("");
    setCategory(ALL);
    setStatus(ALL);
    setCondition(ALL);
    setLocation(ALL);
    setAssignment(ALL);
  };
  const addAsset = () => {
    if (!data?.categories.some((item) => item.is_active)) {
      toast.info("أضف تصنيف أصول واحداً على الأقل أولاً.");
      setCategoriesOpen(true);
      return;
    }
    setEditing(null);
    setDrawerOpen(true);
  };
  const openEvent = (asset: AssetRow, type: Exclude<AssetEventType, "registered">) => {
    setEventAsset(asset);
    setEventType(type);
  };

  const activeFilters = [category, status, condition, location, assignment].filter(
    (value) => value !== ALL,
  ).length;
  const pageControl = {
    ...pagination,
    page: data?.page ?? pagination.page,
    total: data?.total ?? 0,
    loading: query.isFetching,
  };
  const assetActions = (asset: AssetRow) => (
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label={`إجراءات ${asset.name}`}
          title="إجراءات الأصل"
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setHistoryAsset(asset)}>
          <History className="size-4" />
          السجل
        </DropdownMenuItem>
        {canAdminister && asset.status === "active" ? (
          <DropdownMenuItem onClick={() => openEvent(asset, "assigned")}>
            <UserPlus className="size-4" />
            تعيين عهدة
          </DropdownMenuItem>
        ) : null}
        {canAdminister && ["active", "assigned"].includes(asset.status) ? (
          <DropdownMenuItem onClick={() => openEvent(asset, "transferred")}>
            <ArrowLeftRight className="size-4" />
            نقل
          </DropdownMenuItem>
        ) : null}
        {canAdminister && ["assigned", "under_maintenance", "damaged"].includes(asset.status) ? (
          <DropdownMenuItem onClick={() => openEvent(asset, "returned")}>
            <Undo2 className="size-4" />
            إرجاع للخدمة
          </DropdownMenuItem>
        ) : null}
        {canAdminister && asset.status !== "retired" ? (
          <>
            <DropdownMenuItem onClick={() => openEvent(asset, "maintenance")}>
              <Wrench className="size-4" />
              صيانة
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openEvent(asset, "damaged")}>
              <CircleAlert className="size-4" />
              تالف
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openEvent(asset, "retired")}>
              <Archive className="size-4" />
              تقاعد
            </DropdownMenuItem>
          </>
        ) : null}
        {canManage && asset.status !== "retired" ? (
          <DropdownMenuItem
            onClick={() => {
              setEditing(asset);
              setDrawerOpen(true);
            }}
          >
            <Pencil className="size-4" />
            تعديل
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  return (
    <AppShell>
      <PageHeader
        title="الأصول"
        description={
          activeSchool
            ? `الأصول الدائمة وسجل العهدة في ${activeSchool.name_ar}`
            : "الأصول الدائمة وسجل العهدة"
        }
        actions={
          canCreate && schoolId ? (
            <>
              <Button variant="outline" onClick={() => setCategoriesOpen(true)}>
                <Tags className="size-4" />
                التصنيفات
              </Button>
              <Button onClick={addAsset}>
                <Plus className="size-4" />
                تسجيل أصل
              </Button>
            </>
          ) : null
        }
      />

      {!canView ? (
        <EmptyState
          icon={Lock}
          title="لا تملك صلاحية الوصول إلى الأصول"
          description="يمكن لمالك المدرسة ومديرها وأمين المستودع الإدارة، وللمحاسب والموارد البشرية العرض فقط."
        />
      ) : query.isPending && !metadata.isError ? (
        <DataTable<AssetRow> rows={[]} rowKey={(row) => row.id} columns={[]} isLoading />
      ) : query.isError || metadata.isError || !data ? (
        <EmptyState
          icon={SearchX}
          title="تعذر تحميل الأصول"
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
          <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard label="الأصول الفعالة" value={summary.active} icon={Boxes} accent />
            <StatCard label="الأصول بعهدة" value={summary.assigned} icon={UserCheck} />
            <StatCard label="تحت الصيانة" value={summary.maintenance} icon={Wrench} />
            <StatCard
              label="تالفة أو متقاعدة"
              value={summary.damagedOrRetired}
              icon={CircleAlert}
            />
          </section>

          <FilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="رمز الأصل، الاسم، الرقم التسلسلي، أو الموظف"
            onReset={resetFilters}
          >
            <Button
              variant="outline"
              aria-expanded={filtersOpen}
              aria-controls="asset-filters"
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <SlidersHorizontal className="size-4" />
              الفلاتر{activeFilters ? <span className="tnum">{activeFilters}</span> : null}
            </Button>
          </FilterBar>
          <div id="asset-filters" hidden={!filtersOpen}>
            <div className="flex flex-wrap gap-2 border-b border-border pb-3">
              <FilterSelect
                value={category}
                onChange={setCategory}
                placeholder="التصنيف"
                options={data.categories.map((item) => [item.id, item.name])}
              />
              <FilterSelect
                value={status}
                onChange={setStatus}
                placeholder="الحالة"
                options={Object.entries(ASSET_STATUS).map(([key, value]) => [key, value.label])}
              />
              <FilterSelect
                value={condition}
                onChange={setCondition}
                placeholder="الحالة الفنية"
                options={Object.entries(ASSET_CONDITION)}
              />
              <FilterSelect
                value={assignment}
                onChange={setAssignment}
                placeholder="العهدة"
                options={[
                  ["assigned", "بعهدة موظف"],
                  ["unassigned", "بدون عهدة"],
                ]}
              />
              {locations.length ? (
                <FilterSelect
                  value={location}
                  onChange={setLocation}
                  placeholder="الموقع"
                  options={locations.map((item) => [item, item])}
                />
              ) : null}
            </div>
          </div>

          <div className="hidden md:block">
            <DataTable
              pagination={{
                ...pagination,
                page: data.page,
                total: data.total,
                loading: query.isFetching,
              }}
              rows={filtered}
              rowKey={(asset) => asset.id}
              emptyTitle={activeFilters || search ? "لا توجد أصول مطابقة" : "لا توجد أصول بعد"}
              emptyDescription={
                activeFilters || search
                  ? "غيّر عوامل التصفية لعرض نتائج أخرى."
                  : "سجل أول أصل دائم للمدرسة."
              }
              columns={[
                {
                  key: "name",
                  header: "الأصل",
                  className: "min-w-40",
                  cell: (asset) => (
                    <div>
                      <p className="font-medium">{asset.name}</p>
                      <p dir="ltr" className="tnum text-end text-xs text-muted-foreground">
                        {asset.asset_code}
                      </p>
                      <p className="text-xs text-muted-foreground">{asset.category_name}</p>
                      {asset.serial_number ? (
                        <p dir="ltr" className="text-end text-xs text-muted-foreground">
                          {asset.serial_number}
                        </p>
                      ) : null}
                    </div>
                  ),
                },
                {
                  key: "status",
                  header: "الحالة",
                  cell: (asset) => (
                    <StatusBadge tone={ASSET_STATUS[asset.status].tone}>
                      {ASSET_STATUS[asset.status].label}
                    </StatusBadge>
                  ),
                },
                {
                  key: "location",
                  header: "الموقع",
                  className: "min-w-36",
                  cell: (asset) => asset.location,
                },
                {
                  key: "employee",
                  header: "العهدة",
                  className: "min-w-36",
                  cell: (asset) => asset.assigned_employee_name ?? "—",
                },
                {
                  key: "purchase",
                  header: "الشراء",
                  cell: (asset) => (
                    <div className="text-xs text-muted-foreground">
                      <p>{asset.purchase_date ? formatDate(asset.purchase_date) : "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatAssetCost(asset.purchase_cost, asset.currency)}
                      </p>
                    </div>
                  ),
                },
                {
                  key: "actions",
                  header: "الإجراءات",
                  align: "end",
                  className: "w-12",
                  cell: (asset) => assetActions(asset),
                },
              ]}
            />
          </div>
          <div className="min-w-0 md:hidden" aria-busy={query.isFetching}>
            <div className="space-y-2">
              {filtered.length ? (
                filtered.map((asset) => (
                  <article
                    key={asset.id}
                    className="min-w-0 rounded-md border border-border bg-card p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="break-words text-sm font-semibold">{asset.name}</h2>
                        <p
                          dir="ltr"
                          className="tnum break-all text-end text-xs text-muted-foreground"
                        >
                          {asset.asset_code}
                        </p>
                      </div>
                      {assetActions(asset)}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusBadge tone={ASSET_STATUS[asset.status].tone}>
                        {ASSET_STATUS[asset.status].label}
                      </StatusBadge>
                      <span className="text-xs text-muted-foreground">
                        {ASSET_CONDITION[asset.condition]}
                      </span>
                    </div>
                    <dl className="mt-3 grid min-w-0 grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                      <dt className="text-muted-foreground">الموقع</dt>
                      <dd className="break-words">{asset.location}</dd>
                      <dt className="text-muted-foreground">العهدة</dt>
                      <dd className="break-words">{asset.assigned_employee_name ?? "بدون عهدة"}</dd>
                    </dl>
                    <details className="mt-2 text-xs text-muted-foreground">
                      <summary className="cursor-pointer">تفاصيل الشراء والأصل</summary>
                      <p className="mt-2 break-words">
                        {asset.category_name} · {asset.serial_number ?? "بدون رقم تسلسلي"}
                      </p>
                      <p>
                        {asset.purchase_date ? formatDate(asset.purchase_date) : "—"} ·{" "}
                        {formatAssetCost(asset.purchase_cost, asset.currency)}
                      </p>
                    </details>
                  </article>
                ))
              ) : (
                <EmptyState
                  icon={Boxes}
                  title={activeFilters || search ? "لا توجد أصول مطابقة" : "لا توجد أصول بعد"}
                  description="سجل أصلاً أو غيّر عوامل التصفية."
                />
              )}
            </div>
            <TablePagination {...pageControl} />
          </div>
        </>
      )}

      {schoolId ? (
        <>
          <AssetDrawer
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            schoolId={schoolId}
            currency={activeSchool?.currency ?? "USD"}
            asset={editing}
            categories={data?.categories ?? []}
            onSaved={refresh}
          />
          <AssetCategoryDialog
            open={categoriesOpen}
            onOpenChange={setCategoriesOpen}
            schoolId={schoolId}
            categories={data?.categories ?? []}
            onChanged={refresh}
          />
          <AssetEventDrawer
            asset={eventAsset}
            eventType={eventType}
            employees={data?.employees ?? []}
            open={!!eventAsset}
            onOpenChange={(open) => {
              if (!open) setEventAsset(null);
            }}
            onSaved={refresh}
          />
          <AssetHistoryDialog
            asset={historyAsset}
            history={(data?.history ?? []).filter((event) => event.asset_id === historyAsset?.id)}
            open={!!historyAsset}
            onOpenChange={(open) => {
              if (!open) setHistoryAsset(null);
            }}
          />
        </>
      ) : null}
    </AppShell>
  );
}
