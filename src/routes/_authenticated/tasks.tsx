import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ListTodo,
  Eye,
  MoreHorizontal,
  SlidersHorizontal,
  Pencil,
  Plus,
  SearchX,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/app-shell";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
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
import { TaskCommentsDrawer, TaskDrawer } from "@/components/app/task-dialogs";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  TASK_PRIORITY,
  TASK_STATUS,
  canManageTasks,
  isTaskDueSoon,
  isTaskOverdue,
  taskError,
  tasksKey,
  type TaskRow,
  type TaskStatus,
} from "@/lib/tasks";
import { formatDate } from "@/lib/students";
import { useWorkspace } from "@/lib/workspace";
import { fetchTasksMetadata, fetchTasksPage } from "@/lib/operational-list-pages";
import { usePagination, keepPageData } from "@/lib/pagination";

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => ({
    meta: [
      { title: "المهام — مدار | Madar" },
      { name: "description", content: "المهام التشغيلية الداخلية ومتابعتها." },
      { property: "og:title", content: "المهام — مدار | Madar" },
      { property: "og:description", content: "المهام التشغيلية الداخلية ومتابعتها." },
    ],
  }),
  component: TasksPage,
});

function TasksPage() {
  const { activeSchool, activeYear, roles, userId, can } = useWorkspace();
  const queryClient = useQueryClient();
  const schoolId = activeSchool?.id;
  const canManage = can("tasks", "edit", canManageTasks(roles));
  const canCreate = can("tasks", "create", canManageTasks(roles));
  const canAdminister = can("tasks", "manage", canManageTasks(roles));
  const canView = can("tasks", "view", roles.length > 0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(ALL);
  const [priority, setPriority] = useState(ALL);
  const [assignee, setAssignee] = useState(ALL);
  const [due, setDue] = useState(ALL);
  const [creator, setCreator] = useState(ALL);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<TaskRow | null>(null);
  const [commentTask, setCommentTask] = useState<TaskRow | null>(null);
  const [cancelTask, setCancelTask] = useState<TaskRow | null>(null);

  const filters = { search, status, priority, assignee, due, creator };
  const pagination = usePagination([schoolId, filters]);
  const metadata = useQuery({
    queryKey: [...tasksKey(schoolId), "metadata"],
    enabled: !!schoolId && canView,
    queryFn: () => fetchTasksMetadata(schoolId!),
  });
  const query = useQuery({
    placeholderData: (data, query) => keepPageData(data, query, tasksKey(schoolId)),
    queryKey: [...tasksKey(schoolId), "page", filters, pagination.page, pagination.pageSize],
    enabled: !!schoolId && canView && !!metadata.data,
    queryFn: () => fetchTasksPage(schoolId!, pagination, filters, metadata.data!),
  });
  const data = canView ? query.data : undefined;
  const summary = metadata.data?.summary ?? {
    open: 0,
    inProgress: 0,
    overdue: 0,
    completedThisMonth: 0,
  };
  const creators = metadata.data?.creators ?? [];
  const filtered = data?.tasks ?? [];

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: tasksKey(schoolId) });
    void queryClient.invalidateQueries({ queryKey: ["dashboard-tasks", schoolId] });
    void queryClient.invalidateQueries({ queryKey: ["notifications", schoolId] });
  }

  function resetFilters() {
    setSearch("");
    setStatus(ALL);
    setPriority(ALL);
    setAssignee(ALL);
    setDue(ALL);
    setCreator(ALL);
  }

  async function updateStatus(task: TaskRow, nextStatus: TaskStatus) {
    if (nextStatus === "cancelled") {
      setCancelTask(task);
      return;
    }
    const { error } = await supabase
      .from("tasks")
      .update({ status: nextStatus })
      .eq("id", task.id)
      .eq("school_id", task.school_id);
    if (error) {
      toast.error(taskError(error));
      return;
    }
    toast.success("تم تحديث حالة المهمة");
    refresh();
  }

  async function confirmCancel() {
    if (!cancelTask) return;
    const { error } = await supabase
      .from("tasks")
      .update({ status: "cancelled" })
      .eq("id", cancelTask.id)
      .eq("school_id", cancelTask.school_id);
    if (error) {
      toast.error(taskError(error));
      return;
    }
    toast.success("تم إلغاء المهمة مع الاحتفاظ بسجلها");
    setCancelTask(null);
    refresh();
  }

  const activeFilters = [status, priority, assignee, due, creator].filter(
    (value) => value !== ALL,
  ).length;
  const pageControl = {
    ...pagination,
    page: data?.page ?? pagination.page,
    total: data?.total ?? 0,
    loading: query.isFetching,
  };
  const taskStatus = (task: TaskRow) =>
    canManage || task.assigned_to_user_id === userId ? (
      <Select
        value={task.status}
        onValueChange={(value) => void updateStatus(task, value as TaskStatus)}
      >
        <SelectTrigger className="h-8 w-32" aria-label={`تغيير حالة ${task.title}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(TASK_STATUS)
            .filter(([key]) => canAdminister || key !== "cancelled")
            .map(([key, value]) => (
              <SelectItem key={key} value={key}>
                {value.label}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    ) : (
      <StatusBadge tone={TASK_STATUS[task.status].tone}>
        {TASK_STATUS[task.status].label}
      </StatusBadge>
    );
  const taskDue = (task: TaskRow) => (
    <div>
      <p className={isTaskOverdue(task) ? "font-medium text-destructive" : ""}>
        {formatDate(task.due_date)}
      </p>
      {isTaskOverdue(task) ? (
        <span className="text-xs text-destructive">متأخرة</span>
      ) : isTaskDueSoon(task) ? (
        <span className="text-xs text-warning-foreground">قريبة</span>
      ) : null}
    </div>
  );
  const taskActions = (task: TaskRow) => (
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          title="إجراءات المهمة"
          aria-label={`إجراءات ${task.title}`}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setCommentTask(task)}>
          <Eye className="size-4" />
          التفاصيل والملاحظات
        </DropdownMenuItem>
        {canManage ? (
          <DropdownMenuItem
            onClick={() => {
              setEditing(task);
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

  if (!canView)
    return (
      <AppShell>
        <EmptyState title="لا تملك صلاحية الوصول" />
      </AppShell>
    );
  return (
    <AppShell>
      <PageHeader
        title="المهام"
        description={
          activeSchool
            ? `المتابعات التشغيلية الداخلية في ${activeSchool.name_ar}`
            : "المتابعات التشغيلية الداخلية"
        }
        actions={
          canCreate && schoolId ? (
            <Button
              onClick={() => {
                setEditing(null);
                setDrawerOpen(true);
              }}
            >
              <Plus className="size-4" />
              مهمة جديدة
            </Button>
          ) : null
        }
      />

      {query.isPending && !metadata.isError ? (
        <DataTable<TaskRow> rows={[]} rowKey={(row) => row.id} columns={[]} isLoading />
      ) : query.isError || metadata.isError || !data ? (
        <EmptyState
          icon={SearchX}
          title="تعذر تحميل المهام"
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
            <StatCard label="المهام المفتوحة" value={summary.open} icon={ListTodo} accent />
            <StatCard label="قيد التنفيذ" value={summary.inProgress} icon={Clock3} />
            <StatCard label="متأخرة" value={summary.overdue} icon={AlertTriangle} />
            <StatCard
              label="مكتملة هذا الشهر"
              value={summary.completedThisMonth}
              icon={CheckCircle2}
            />
          </section>

          <FilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="عنوان المهمة، الوصف، المسند إليه، أو السياق"
            onReset={resetFilters}
          >
            <Button
              variant="outline"
              aria-expanded={filtersOpen}
              aria-controls="task-filters"
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <SlidersHorizontal className="size-4" />
              الفلاتر{activeFilters ? <span className="tnum">{activeFilters}</span> : null}
            </Button>
          </FilterBar>
          <div id="task-filters" hidden={!filtersOpen}>
            <div className="flex flex-wrap gap-2 border-b border-border pb-3">
              <FilterSelect
                value={status}
                onChange={setStatus}
                placeholder="الحالة"
                options={Object.entries(TASK_STATUS).map(([key, value]) => [key, value.label])}
              />
              <FilterSelect
                value={priority}
                onChange={setPriority}
                placeholder="الأولوية"
                options={Object.entries(TASK_PRIORITY).map(([key, value]) => [key, value.label])}
              />
              <FilterSelect
                value={assignee}
                onChange={setAssignee}
                placeholder="المسند إليه"
                options={[
                  ["unassigned", "بدون إسناد"],
                  ...data.assignees.map(
                    (item) => [`${item.kind}:${item.id}`, item.name] as [string, string],
                  ),
                ]}
              />
              <FilterSelect
                value={due}
                onChange={setDue}
                placeholder="الاستحقاق"
                options={[
                  ["overdue", "المتأخرة فقط"],
                  ["today", "مستحقة اليوم"],
                  ["week", "خلال 7 أيام"],
                  ["none", "بدون تاريخ"],
                ]}
              />
              {creators.length > 1 ? (
                <FilterSelect
                  value={creator}
                  onChange={setCreator}
                  placeholder="أنشأها"
                  options={creators}
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
              rowKey={(task) => task.id}
              emptyTitle={activeFilters || search ? "لا توجد مهام مطابقة" : "لا توجد مهام بعد"}
              emptyDescription={
                activeFilters || search
                  ? "غيّر عوامل التصفية لعرض نتائج أخرى."
                  : canManage
                    ? "أنشئ أول مهمة تشغيلية للمدرسة."
                    : "لا توجد مهام مسندة إلى حسابك."
              }
              columns={[
                {
                  key: "title",
                  header: "المهمة",
                  className: "min-w-48",
                  cell: (task) => (
                    <div>
                      <button
                        type="button"
                        onClick={() => setCommentTask(task)}
                        className="max-w-full break-words text-start font-medium hover:text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        {task.title}
                      </button>
                      <p className="line-clamp-1 text-xs text-muted-foreground">
                        {task.description ?? "بدون وصف"}
                      </p>
                    </div>
                  ),
                },
                {
                  key: "priority",
                  header: "الأولوية",
                  cell: (task) => (
                    <StatusBadge tone={TASK_PRIORITY[task.priority].tone}>
                      {TASK_PRIORITY[task.priority].label}
                    </StatusBadge>
                  ),
                },
                {
                  key: "assignee",
                  header: "المسند إليه",
                  className: "min-w-32",
                  cell: (task) => task.assigned_name ?? "بدون إسناد",
                },
                { key: "due", header: "الاستحقاق", cell: taskDue },
                { key: "status", header: "الحالة", cell: taskStatus },
                {
                  key: "actions",
                  header: "الإجراءات",
                  align: "end",
                  className: "w-12",
                  cell: taskActions,
                },
              ]}
            />
          </div>
          <div className="min-w-0 md:hidden" aria-busy={query.isFetching}>
            <div className="space-y-2">
              {filtered.length ? (
                filtered.map((task) => (
                  <article
                    key={task.id}
                    className={`min-w-0 rounded-md border bg-card p-3 ${isTaskOverdue(task) ? "border-destructive/30" : "border-border"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        className="min-w-0 break-words text-start text-sm font-semibold hover:underline"
                        onClick={() => setCommentTask(task)}
                      >
                        {task.title}
                      </button>
                      {taskActions(task)}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusBadge tone={TASK_PRIORITY[task.priority].tone}>
                        {TASK_PRIORITY[task.priority].label}
                      </StatusBadge>
                      <span className="break-words text-xs">
                        {task.assigned_name ?? "بدون إسناد"}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-end justify-between gap-3 text-sm">
                      <div>
                        <p className="mb-1 text-xs text-muted-foreground">الاستحقاق</p>
                        {taskDue(task)}
                      </div>
                      <div>
                        <p className="mb-1 text-xs text-muted-foreground">الحالة</p>
                        {taskStatus(task)}
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <EmptyState
                  icon={ListTodo}
                  title={activeFilters || search ? "لا توجد مهام مطابقة" : "لا توجد مهام بعد"}
                  description={
                    activeFilters || search
                      ? "غيّر عوامل التصفية لعرض نتائج أخرى."
                      : "لا توجد مهام متاحة."
                  }
                />
              )}
            </div>
            <TablePagination {...pageControl} />
          </div>
        </>
      )}

      {schoolId ? (
        <>
          <TaskDrawer
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            schoolId={schoolId}
            {...(activeYear?.id ? { academicYearId: activeYear.id } : {})}
            task={editing}
            assignees={data?.assignees ?? []}
            relatedOptions={data?.relatedOptions ?? []}
            onSaved={refresh}
          />
          <TaskCommentsDrawer
            task={commentTask}
            comments={(data?.comments ?? []).filter(
              (comment) => comment.task_id === commentTask?.id,
            )}
            open={!!commentTask}
            onOpenChange={(open) => {
              if (!open) setCommentTask(null);
            }}
            onSaved={refresh}
          />
        </>
      ) : null}

      <ConfirmDialog
        open={!!cancelTask}
        onOpenChange={(open) => {
          if (!open) setCancelTask(null);
        }}
        title="إلغاء المهمة"
        description="ستبقى المهمة وتعليقاتها وسجلها محفوظة، ولن تُحذف."
        confirmLabel="إلغاء المهمة"
        destructive
        onConfirm={() => void confirmCancel()}
      />
    </AppShell>
  );
}
