import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Archive,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Ban,
  Boxes,
  History,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  SearchX,
  SlidersHorizontal,
  Tags,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/app-shell";
import { DataTable } from "@/components/app/data-table";
import { TablePagination } from "@/components/app/table-pagination";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar } from "@/components/app/filter-bar";
import {
  InventoryCategoryDialog,
  InventoryHistoryDialog,
  InventoryItemDrawer,
  InventoryItemStatusDialog,
  InventoryMovementDrawer,
} from "@/components/app/inventory-dialogs";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { ALL, FilterSelect } from "@/components/app/student-shared";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  STOCK_STATUS,
  canManageInventory,
  canViewInventory,
  formatQuantity,
  inventoryKey,
  type InventoryItem,
  type InventoryMovementType,
} from "@/lib/inventory";
import { useWorkspace } from "@/lib/workspace";
import { fetchInventoryPage, fetchInventoryHistory } from "@/lib/operational-list-pages";
import { usePagination, keepPageData } from "@/lib/pagination";
import { fetchInventoryListMetadata } from "@/lib/list-aggregates.functions";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({
    meta: [
      { title: "المخزون — مدار | Madar" },
      { name: "description", content: "المستودعات وحركة الأصناف." },
      { property: "og:title", content: "المخزون — مدار | Madar" },
      { property: "og:description", content: "المستودعات وحركة الأصناف." },
    ],
  }),
  component: InventoryPage,
});

function InventoryPage() {
  const { activeSchool, roles, can } = useWorkspace();
  const queryClient = useQueryClient();
  const schoolId = activeSchool?.id;
  const canView = can("inventory", "view", canViewInventory(roles));
  const canManage = can("inventory", "edit", canManageInventory(roles));
  const canCreate = can("inventory", "create", canManageInventory(roles));
  const canAdminister = can("inventory", "manage", canManageInventory(roles));
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL);
  const [stock, setStock] = useState(ALL);
  const [activity, setActivity] = useState(ALL);
  const [location, setLocation] = useState(ALL);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [itemDrawerOpen, setItemDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [statusItem, setStatusItem] = useState<InventoryItem | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [movementItem, setMovementItem] = useState<InventoryItem | null>(null);
  const [movementType, setMovementType] =
    useState<Exclude<InventoryMovementType, "opening_balance">>("stock_in");
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);

  const filters = { search, category, stock, activity, location };
  const pagination = usePagination([schoolId, filters]);
  const metadata = useQuery({
    queryKey: [...inventoryKey(schoolId), "metadata"],
    enabled: !!schoolId && canView,
    queryFn: () => fetchInventoryListMetadata({ data: { schoolId: schoolId! } }),
  });
  const historyQuery = useQuery({
    queryKey: [...inventoryKey(schoolId), "history", historyItem?.id],
    enabled: !!schoolId && canView && !!historyItem,
    queryFn: () => fetchInventoryHistory(schoolId!, historyItem!.id),
  });
  const query = useQuery({
    placeholderData: (data, query) => keepPageData(data, query, inventoryKey(schoolId)),
    queryKey: [...inventoryKey(schoolId), "page", filters, pagination.page, pagination.pageSize],
    enabled: !!schoolId && canView && !!metadata.data,
    queryFn: () => fetchInventoryPage(schoolId!, pagination, filters, metadata.data!),
  });
  const data = query.data ? { ...query.data, movements: historyQuery.data ?? [] } : undefined;
  const summary = metadata.data?.summary ?? { active: 0, low: 0, out: 0, movementsThisMonth: 0 };
  const locations = metadata.data?.locations ?? [];
  const filtered = data?.items ?? [];
  const activeFilterCount = [category, stock, activity, location].filter(
    (value) => value !== ALL,
  ).length;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: inventoryKey(schoolId) });
    void queryClient.invalidateQueries({ queryKey: ["dashboard-v2", schoolId] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard-inventory", schoolId] });
  };
  const resetFilters = () => {
    setSearch("");
    setCategory(ALL);
    setStock(ALL);
    setActivity(ALL);
    setLocation(ALL);
  };
  const addItem = () => {
    if (!data?.categories.some((item) => item.is_active)) {
      toast.info("أضف تصنيف مخزون واحداً على الأقل أولاً.");
      setCategoriesOpen(true);
      return;
    }
    setEditing(null);
    setItemDrawerOpen(true);
  };
  const openMovement = (
    item: InventoryItem,
    type: Exclude<InventoryMovementType, "opening_balance">,
  ) => {
    setMovementItem(item);
    setMovementType(type);
  };
  const itemActions = (item: InventoryItem) => (
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label={`إجراءات ${item.name}`}
          title="إجراءات الصنف"
          className="shrink-0"
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canCreate && item.is_active ? (
          <>
            <DropdownMenuItem onSelect={() => openMovement(item, "stock_in")}>
              <ArrowDownToLine className="size-4" /> توريد مخزون
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openMovement(item, "stock_out")}>
              <ArrowUpFromLine className="size-4" /> صرف مخزون
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openMovement(item, "adjustment_in")}>
              <SlidersHorizontal className="size-4" /> تسوية مخزون
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem onSelect={() => setHistoryItem(item)}>
          <History className="size-4" /> سجل الحركات
        </DropdownMenuItem>
        {canManage ? (
          <>
            <DropdownMenuItem
              onSelect={() => {
                setEditing(item);
                setItemDrawerOpen(true);
              }}
            >
              <Pencil className="size-4" /> تعديل
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canAdminister} onSelect={() => setStatusItem(item)}>
              {item.is_active ? <Archive className="size-4" /> : <RotateCcw className="size-4" />}
              {item.is_active ? "أرشفة" : "استعادة"}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <AppShell>
      <PageHeader
        title="المخزون"
        description={
          activeSchool
            ? `المواد الاستهلاكية وحركة مخزون ${activeSchool.name_ar}`
            : "المواد الاستهلاكية وحركتها"
        }
        actions={
          canCreate && schoolId ? (
            <>
              <Button variant="outline" onClick={() => setCategoriesOpen(true)}>
                <Tags className="size-4" />
                التصنيفات
              </Button>
              <Button onClick={addItem}>
                <Plus className="size-4" />
                إضافة صنف
              </Button>
            </>
          ) : null
        }
      />

      {!canView ? (
        <EmptyState
          icon={Lock}
          title="لا تملك صلاحية الوصول إلى المخزون"
          description="يمكن لمالك المدرسة ومديرها وأمين المستودع الإدارة، وللمحاسب العرض فقط."
        />
      ) : query.isPending && !metadata.isError ? (
        <DataTable<InventoryItem> rows={[]} rowKey={(row) => row.id} columns={[]} isLoading />
      ) : query.isError || metadata.isError || !data ? (
        <EmptyState
          icon={SearchX}
          title="تعذر تحميل المخزون"
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
            <StatCard label="الأصناف الفعالة" value={summary.active} icon={Boxes} accent />
            <StatCard label="مخزون منخفض" value={summary.low} icon={AlertTriangle} />
            <StatCard label="نفد المخزون" value={summary.out} icon={Ban} />
            <StatCard
              label="حركات هذا الشهر"
              value={summary.movementsThisMonth}
              icon={ArrowLeftRight}
            />
          </section>

          {summary.low + summary.out > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              <AlertTriangle className="size-5 shrink-0" />
              <span className="me-auto">أصناف تحتاج إلى إعادة التوريد</span>
              {summary.low > 0 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-pressed={stock === "low"}
                  onClick={() => {
                    setStock("low");
                    setActivity("true");
                    setFiltersOpen(true);
                  }}
                >
                  مخزون منخفض ({summary.low})
                </Button>
              ) : null}
              {summary.out > 0 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-pressed={stock === "out"}
                  onClick={() => {
                    setStock("out");
                    setActivity("true");
                    setFiltersOpen(true);
                  }}
                >
                  نفد المخزون ({summary.out})
                </Button>
              ) : null}
            </div>
          ) : null}

          <Collapsible
            open={filtersOpen}
            onOpenChange={setFiltersOpen}
            className="min-w-0 space-y-3"
          >
            <FilterBar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="رمز الصنف، الاسم، التصنيف، أو الموقع"
              onReset={resetFilters}
            >
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm">
                  <SlidersHorizontal className="size-4" />
                  الفلاتر{activeFilterCount ? ` (${activeFilterCount})` : ""}
                </Button>
              </CollapsibleTrigger>
            </FilterBar>
            <CollapsibleContent className="flex flex-wrap gap-2 border-b border-border pb-3">
              <FilterSelect
                value={category}
                onChange={setCategory}
                placeholder="التصنيف"
                options={data.categories.map((item) => [item.id, item.name])}
              />
              <FilterSelect
                value={stock}
                onChange={setStock}
                placeholder="حالة المخزون"
                options={Object.entries(STOCK_STATUS)
                  .filter(([key]) => key !== "inactive")
                  .map(([key, value]) => [key, value.label])}
              />
              <FilterSelect
                value={activity}
                onChange={setActivity}
                placeholder="حالة الصنف"
                options={[
                  ["true", "فعال"],
                  ["false", "مؤرشف"],
                ]}
              />
              {locations.length ? (
                <FilterSelect
                  value={location}
                  onChange={setLocation}
                  placeholder="موقع التخزين"
                  options={locations.map((item) => [item, item])}
                />
              ) : null}
            </CollapsibleContent>
          </Collapsible>

          <div className="hidden min-w-0 md:block [&_tbody_tr:has([data-low-stock=true])]:bg-amber-50/50">
            <DataTable
              pagination={{
                ...pagination,
                page: data.page,
                total: data.total,
                loading: query.isFetching,
              }}
              rows={filtered}
              rowKey={(item) => item.id}
              emptyTitle={
                search || activeFilterCount ? "لا توجد أصناف مطابقة" : "لا توجد أصناف بعد"
              }
              emptyDescription={
                search || activeFilterCount
                  ? "غيّر عوامل التصفية لعرض نتائج أخرى."
                  : "أضف أول صنف لبدء إدارة مخزون المدرسة."
              }
              columns={[
                {
                  key: "code",
                  header: "رمز الصنف",
                  cell: (item) => (
                    <span dir="ltr" className="tnum block text-end font-medium">
                      {item.item_code}
                    </span>
                  ),
                },
                {
                  key: "name",
                  header: "الصنف",
                  className: "min-w-44",
                  cell: (item) => (
                    <div
                      data-low-stock={item.stock_status === "low" || item.stock_status === "out"}
                    >
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.category_name} · {item.storage_location ?? "دون موقع"}
                      </p>
                    </div>
                  ),
                },
                {
                  key: "balance",
                  header: "الرصيد",
                  align: "end",
                  cell: (item) => (
                    <div>
                      <p className="tnum text-lg font-bold">
                        {formatQuantity(item.balance)}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          {item.unit}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        الحد الأدنى: {formatQuantity(Number(item.minimum_stock))}
                      </p>
                    </div>
                  ),
                },
                {
                  key: "status",
                  header: "الحالة",
                  cell: (item) => (
                    <StatusBadge tone={STOCK_STATUS[item.stock_status].tone}>
                      {STOCK_STATUS[item.stock_status].label}
                    </StatusBadge>
                  ),
                },
                {
                  key: "actions",
                  header: "الإجراءات",
                  align: "end",
                  cell: itemActions,
                },
              ]}
            />
          </div>
          <div className="min-w-0 space-y-2 md:hidden" aria-busy={query.isFetching || undefined}>
            {query.isFetching ? (
              <p role="status" className="text-xs text-muted-foreground">
                جار تحميل النتائج...
              </p>
            ) : null}
            {!filtered.length ? (
              <EmptyState
                title={search || activeFilterCount ? "لا توجد أصناف مطابقة" : "لا توجد أصناف بعد"}
                description={
                  search || activeFilterCount
                    ? "غيّر عوامل التصفية لعرض نتائج أخرى."
                    : "أضف أول صنف لبدء إدارة مخزون المدرسة."
                }
              />
            ) : null}
            {filtered.map((item) => (
              <article
                key={item.id}
                className={`min-w-0 rounded-lg border p-3 ${item.stock_status === "low" || item.stock_status === "out" ? "border-amber-200 bg-amber-50/50" : "border-border bg-card"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="break-words text-sm font-semibold">{item.name}</h2>
                    <p className="mt-0.5 break-words text-xs text-muted-foreground">
                      <bdi>{item.item_code}</bdi> · {item.category_name}
                    </p>
                  </div>
                  {itemActions(item)}
                </div>
                <div className="my-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">الرصيد الحالي</p>
                    <p className="tnum text-xl font-bold">
                      {formatQuantity(item.balance)}{" "}
                      <span className="text-xs font-normal text-muted-foreground">{item.unit}</span>
                    </p>
                  </div>
                  <StatusBadge tone={STOCK_STATUS[item.stock_status].tone}>
                    {STOCK_STATUS[item.stock_status].label}
                  </StatusBadge>
                </div>
                <div className="flex flex-wrap justify-between gap-2 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                  <span>الحد الأدنى: {formatQuantity(Number(item.minimum_stock))}</span>
                  <span className="min-w-0 break-words">
                    {item.storage_location ?? "دون موقع تخزين"}
                  </span>
                </div>
              </article>
            ))}
            <TablePagination
              {...pagination}
              page={data.page}
              total={data.total}
              loading={query.isFetching}
            />
          </div>
        </>
      )}

      {schoolId ? (
        <>
          <InventoryItemDrawer
            open={itemDrawerOpen}
            onOpenChange={setItemDrawerOpen}
            schoolId={schoolId}
            item={editing}
            categories={data?.categories ?? []}
            onSaved={refresh}
          />
          <InventoryMovementDrawer
            open={!!movementItem}
            onOpenChange={(open) => {
              if (!open) setMovementItem(null);
            }}
            schoolId={schoolId}
            item={movementItem}
            initialType={movementType}
            onSaved={refresh}
          />
          <InventoryItemStatusDialog
            item={statusItem}
            open={!!statusItem}
            onOpenChange={(open) => {
              if (!open) setStatusItem(null);
            }}
            onSaved={refresh}
          />
          <InventoryCategoryDialog
            open={categoriesOpen}
            onOpenChange={setCategoriesOpen}
            schoolId={schoolId}
            categories={data?.categories ?? []}
            onChanged={refresh}
          />
          <InventoryHistoryDialog
            isLoading={historyQuery.isLoading}
            failed={historyQuery.isError}
            onRetry={() => void historyQuery.refetch()}
            item={historyItem}
            movements={(data?.movements ?? []).filter(
              (movement) => movement.item_id === historyItem?.id,
            )}
            open={!!historyItem}
            onOpenChange={(open) => {
              if (!open) setHistoryItem(null);
            }}
          />
        </>
      ) : null}
    </AppShell>
  );
}
