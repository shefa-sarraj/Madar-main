import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarCheck, History, Lock, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/app-shell";
import {
  AttendanceListHeader,
  AttendanceNote,
  AttendanceStatusPicker,
  AttendanceSummary,
} from "@/components/app/attendance-controls";
import { StaffAttendanceHistoryDialog } from "@/components/app/attendance-history-dialogs";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { ALL, FilterSelect } from "@/components/app/student-shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  STAFF_ATTENDANCE_STATUS,
  attendanceError,
  attendanceSummary,
  canManageStaffAttendance,
  canViewStaffAttendance,
  fetchStaffAttendanceDay,
  fetchStaffAttendanceSetup,
  staffAttendanceDayKey,
  staffAttendanceSetupKey,
  todayISO,
  type StaffAttendanceStatus,
} from "@/lib/attendance";
import type { EmployeeRow } from "@/lib/staff";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/staff-attendance")({
  head: () => ({
    meta: [
      { title: "حضور الموظفين — مدار | Madar" },
      { name: "description", content: "تسجيل ومتابعة حضور موظفي المدرسة يومياً." },
      { property: "og:title", content: "حضور الموظفين — مدار | Madar" },
      { property: "og:description", content: "تسجيل ومتابعة حضور موظفي المدرسة يومياً." },
    ],
  }),
  component: StaffAttendancePage,
});

type Draft = {
  status: StaffAttendanceStatus | null;
  checkIn: string;
  checkOut: string;
  notes: string;
};
type HistoryTarget = { id: string; name: string } | null;
const OPTIONS = Object.entries(STAFF_ATTENDANCE_STATUS).map(([value, item]) => ({
  value: value as StaffAttendanceStatus,
  label: item.label,
}));

function StaffAttendancePage() {
  const { activeSchool, roles, can } = useWorkspace();
  const queryClient = useQueryClient();
  const schoolId = activeSchool?.id;
  const canView = can("staff_attendance", "view", canViewStaffAttendance(roles));
  const canCreate = can("staff_attendance", "create", canManageStaffAttendance(roles));
  const canEdit = can("staff_attendance", "edit", canManageStaffAttendance(roles));
  const canManage = canCreate || canEdit;
  const [date, setDate] = useState(todayISO());
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<HistoryTarget>(null);

  const setup = useQuery({
    queryKey: staffAttendanceSetupKey(schoolId),
    enabled: !!schoolId && canView,
    queryFn: () => fetchStaffAttendanceSetup(schoolId!),
  });
  const day = useQuery({
    queryKey: staffAttendanceDayKey(schoolId, date),
    enabled: !!schoolId && !!date && canView,
    queryFn: () => fetchStaffAttendanceDay(schoolId!, date),
  });
  const savedByEmployee = useMemo(
    () => new Map((day.data ?? []).map((record) => [record.employee_id, record])),
    [day.data],
  );
  useEffect(() => {
    const next: Record<string, Draft> = {};
    for (const record of day.data ?? []) {
      next[record.employee_id] = {
        status: record.status,
        checkIn: record.check_in?.slice(0, 5) ?? "",
        checkOut: record.check_out?.slice(0, 5) ?? "",
        notes: record.notes ?? "",
      };
    }
    setDrafts(next);
    setSelected(new Set());
  }, [day.data, date]);

  const employees = useMemo(
    () => (setup.data?.employees ?? []).filter((employee) => employee.hire_date <= date),
    [date, setup.data?.employees],
  );
  const departments = useMemo(
    () =>
      [
        ...new Set(
          employees.map((employee) => employee.department_name).filter(Boolean) as string[],
        ),
      ].sort((a, b) => a.localeCompare(b, "ar")),
    [employees],
  );
  const currentDraft = (employeeId: string): Draft => {
    const saved = savedByEmployee.get(employeeId);
    return (
      drafts[employeeId] ?? {
        status: saved?.status ?? null,
        checkIn: saved?.check_in?.slice(0, 5) ?? "",
        checkOut: saved?.check_out?.slice(0, 5) ?? "",
        notes: saved?.notes ?? "",
      }
    );
  };
  const summary = attendanceSummary(employees.map((employee) => currentDraft(employee.id).status));
  const filtered = employees.filter((employee) => {
    const draft = currentDraft(employee.id);
    if (department !== ALL && employee.department_name !== department) return false;
    if (statusFilter !== ALL && draft.status !== statusFilter) return false;
    const needle = search.trim().toLocaleLowerCase("ar");
    return (
      !needle ||
      employee.full_name.toLocaleLowerCase("ar").includes(needle) ||
      employee.employee_number.toLocaleLowerCase("ar").includes(needle) ||
      employee.job_title.toLocaleLowerCase("ar").includes(needle)
    );
  });
  const unsavedCount = employees.filter((employee) => {
    const draft = currentDraft(employee.id);
    const saved = savedByEmployee.get(employee.id);
    return (
      draft.status !== (saved?.status ?? null) ||
      draft.checkIn !== (saved?.check_in?.slice(0, 5) ?? "") ||
      draft.checkOut !== (saved?.check_out?.slice(0, 5) ?? "") ||
      draft.notes.trim() !== (saved?.notes ?? "")
    );
  }).length;

  function setDraft(employeeId: string, patch: Partial<Draft>) {
    setDrafts((current) => {
      const saved = savedByEmployee.get(employeeId);
      const base = current[employeeId] ?? {
        status: saved?.status ?? null,
        checkIn: saved?.check_in?.slice(0, 5) ?? "",
        checkOut: saved?.check_out?.slice(0, 5) ?? "",
        notes: saved?.notes ?? "",
      };
      const next = { ...base, ...patch };
      if (patch.status === "absent" || patch.status === "leave") {
        next.checkIn = "";
        next.checkOut = "";
      }
      return { ...current, [employeeId]: next };
    });
  }
  function markAllPresent() {
    setDrafts((current) => {
      const next = { ...current };
      for (const employee of employees) {
        const saved = savedByEmployee.get(employee.id);
        const base = current[employee.id] ?? {
          status: saved?.status ?? null,
          checkIn: saved?.check_in?.slice(0, 5) ?? "",
          checkOut: saved?.check_out?.slice(0, 5) ?? "",
          notes: saved?.notes ?? "",
        };
        next[employee.id] = { ...base, status: "present" };
      }
      return next;
    });
  }
  function markSelectedAbsent() {
    if (!selected.size) {
      toast.info("اختر موظفاً واحداً على الأقل.");
      return;
    }
    setDrafts((current) => {
      const next = { ...current };
      for (const employeeId of selected) {
        const saved = savedByEmployee.get(employeeId);
        const base = current[employeeId] ?? {
          status: saved?.status ?? null,
          checkIn: saved?.check_in?.slice(0, 5) ?? "",
          checkOut: saved?.check_out?.slice(0, 5) ?? "",
          notes: saved?.notes ?? "",
        };
        next[employeeId] = { ...base, status: "absent", checkIn: "", checkOut: "" };
      }
      return next;
    });
  }
  function clearChanges() {
    const next: Record<string, Draft> = {};
    for (const record of day.data ?? [])
      next[record.employee_id] = {
        status: record.status,
        checkIn: record.check_in?.slice(0, 5) ?? "",
        checkOut: record.check_out?.slice(0, 5) ?? "",
        notes: record.notes ?? "",
      };
    setDrafts(next);
    setSelected(new Set());
  }
  async function save() {
    if (!schoolId) return;
    const rows = employees.flatMap((employee) => {
      const draft = currentDraft(employee.id);
      if (!draft.status || (savedByEmployee.has(employee.id) ? !canEdit : !canCreate)) return [];
      return [
        {
          school_id: schoolId,
          employee_id: employee.id,
          attendance_date: date,
          status: draft.status,
          check_in: draft.checkIn || null,
          check_out: draft.checkOut || null,
          notes: draft.notes.trim() || null,
        },
      ];
    });
    if (!rows.length) {
      toast.info("حدد حالة موظف واحد على الأقل.");
      return;
    }
    setSaving(true);
    const pending = rows.filter((row) => !savedByEmployee.has(row.employee_id));
    const results = await Promise.all([
      ...(pending.length ? [supabase.from("staff_attendance").insert(pending)] : []),
      ...rows
        .filter((row) => savedByEmployee.has(row.employee_id))
        .map((row) =>
          supabase
            .from("staff_attendance")
            .update(row)
            .eq("school_id", schoolId)
            .eq("id", savedByEmployee.get(row.employee_id)!.id),
        ),
    ]);
    const error = results.find((result) => result.error)?.error;
    setSaving(false);
    if (error) {
      toast.error(attendanceError(error));
      return;
    }
    toast.success(`تم حفظ حضور ${rows.length} موظفاً`);
    await queryClient.invalidateQueries({ queryKey: staffAttendanceDayKey(schoolId, date) });
    void queryClient.invalidateQueries({ queryKey: ["dashboard-v2", schoolId] });
  }

  const loading = setup.isLoading || day.isLoading;
  const failed = setup.isError || day.isError;
  return (
    <AppShell>
      <div className="space-y-4">
        <PageHeader
          title="حضور الموظفين"
          description={
            activeSchool ? `الحضور اليومي لموظفي ${activeSchool.name_ar}` : "الحضور اليومي للموظفين"
          }
        />
        {!canView ? (
          <EmptyState icon={Lock} title="لا تملك صلاحية عرض حضور الموظفين" />
        ) : loading ? (
          <Skeleton className="h-96 w-full" />
        ) : failed ? (
          <EmptyState
            title="تعذر تحميل حضور الموظفين"
            action={
              <Button
                variant="outline"
                onClick={() => {
                  void setup.refetch();
                  void day.refetch();
                }}
              >
                إعادة المحاولة
              </Button>
            }
          />
        ) : (
          <>
            <section className="max-w-xs">
              <label className="space-y-1 text-xs font-medium">
                <span>التاريخ</span>
                <Input
                  type="date"
                  className="h-9"
                  max={todayISO()}
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>
            </section>
            <AttendanceSummary
              entries={OPTIONS.map((option) => ({
                key: option.value,
                label: option.label,
                value: summary.counts.get(option.value) ?? 0,
              }))}
              percentage={summary.percentage}
            />
            <FilterBar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="اسم الموظف أو رقمه أو مسماه"
            >
              <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 [&>button]:min-w-0">
                <FilterSelect
                  value={department}
                  onChange={setDepartment}
                  placeholder="القسم"
                  options={departments.map((item) => [item, item])}
                />
                <FilterSelect
                  value={statusFilter}
                  onChange={setStatusFilter}
                  placeholder="الحالة"
                  options={OPTIONS.map((option) => [option.value, option.label])}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  title="مسح البحث والفلاتر"
                  aria-label="مسح البحث والفلاتر"
                  onClick={() => {
                    setSearch("");
                    setDepartment(ALL);
                    setStatusFilter(ALL);
                  }}
                >
                  <RotateCcw className="size-4" />
                </Button>
              </div>
            </FilterBar>
            {!employees.length ? (
              <EmptyState icon={CalendarCheck} title="لا يوجد موظفون فعالون في هذا التاريخ" />
            ) : (
              <section
                role="region"
                aria-label="قائمة حضور الموظفين"
                tabIndex={0}
                className="max-h-[70dvh] overflow-y-auto rounded-lg border border-border bg-card focus-visible:outline focus-visible:outline-ring"
              >
                <AttendanceListHeader
                  total={employees.length}
                  shown={filtered.length}
                  noun="موظف"
                  selectedCount={selected.size}
                  unsavedCount={unsavedCount}
                  saving={saving}
                  canManage={canManage}
                  onSave={() => void save()}
                  onAllPresent={markAllPresent}
                  onSelectedAbsent={markSelectedAbsent}
                  onReset={clearChanges}
                />
                <div className="divide-y divide-border">
                  {filtered.map((employee) => (
                    <StaffAttendanceRow
                      key={employee.id}
                      employee={employee}
                      draft={currentDraft(employee.id)}
                      selected={selected.has(employee.id)}
                      canManage={savedByEmployee.has(employee.id) ? canEdit : canCreate}
                      onSelect={(checked) =>
                        setSelected((current) => {
                          const next = new Set(current);
                          if (checked) next.add(employee.id);
                          else next.delete(employee.id);
                          return next;
                        })
                      }
                      onChange={(patch) => setDraft(employee.id, patch)}
                      onHistory={() => setHistory({ id: employee.id, name: employee.full_name })}
                    />
                  ))}
                </div>
                {!filtered.length ? <EmptyState compact title="لا توجد نتائج مطابقة" /> : null}
              </section>
            )}
          </>
        )}
        {schoolId ? (
          <StaffAttendanceHistoryDialog
            target={history}
            schoolId={schoolId}
            onOpenChange={(open) => {
              if (!open) setHistory(null);
            }}
          />
        ) : null}
      </div>
    </AppShell>
  );
}

function StaffAttendanceRow({
  employee,
  draft,
  selected,
  canManage,
  onSelect,
  onChange,
  onHistory,
}: {
  employee: EmployeeRow;
  draft: Draft;
  selected: boolean;
  canManage: boolean;
  onSelect: (checked: boolean) => void;
  onChange: (patch: Partial<Draft>) => void;
  onHistory: () => void;
}) {
  const showTimes = draft.status === "present" || draft.status === "late";
  return (
    <article
      aria-label={employee.full_name}
      className="grid min-w-0 gap-2 p-3 lg:grid-cols-[minmax(160px,1fr)_minmax(260px,1.2fr)] lg:items-start"
    >
      <div className="flex min-w-0 items-center gap-2">
        {canManage ? (
          <Checkbox
            checked={selected}
            onCheckedChange={(value) => onSelect(!!value)}
            aria-label={`تحديد ${employee.full_name}`}
            className="size-5 shrink-0"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-medium">{employee.full_name}</p>
          <p className="break-words text-xs text-muted-foreground">
            {employee.job_title} · {employee.department_name ?? "بدون قسم"}
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0 text-muted-foreground"
          onClick={onHistory}
          title="سجل الحضور"
          aria-label={`سجل حضور ${employee.full_name}`}
        >
          <History className="size-4" />
        </Button>
      </div>
      <div className="min-w-0 space-y-2">
        <AttendanceStatusPicker
          value={draft.status}
          options={OPTIONS}
          onChange={(status) => onChange({ status })}
          disabled={!canManage}
          label={`حالة حضور ${employee.full_name}`}
        />
        {showTimes ? (
          <div className="grid min-w-0 grid-cols-2 gap-2">
            <label className="min-w-0 space-y-1 text-xs text-muted-foreground">
              <span>الحضور</span>
              <Input
                type="time"
                className="h-9 min-w-0"
                value={draft.checkIn}
                onChange={(event) => onChange({ checkIn: event.target.value })}
                disabled={!canManage}
                aria-label={`وقت حضور ${employee.full_name}`}
              />
            </label>
            <label className="min-w-0 space-y-1 text-xs text-muted-foreground">
              <span>الانصراف</span>
              <Input
                type="time"
                className="h-9 min-w-0"
                value={draft.checkOut}
                onChange={(event) => onChange({ checkOut: event.target.value })}
                disabled={!canManage}
                aria-label={`وقت انصراف ${employee.full_name}`}
              />
            </label>
          </div>
        ) : null}
      </div>
      <div className="min-w-0 lg:col-span-2">
        <AttendanceNote
          value={draft.notes}
          onChange={(notes) => onChange({ notes })}
          disabled={!canManage}
          name={employee.full_name}
        />
      </div>
    </article>
  );
}
