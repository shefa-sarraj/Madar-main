import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { Modal } from "@/components/app/modal";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  STAFF_ATTENDANCE_STATUS,
  STUDENT_ATTENDANCE_STATUS,
  attendanceSummary,
  type StaffAttendance,
  type StudentAttendance,
} from "@/lib/attendance";
import { formatDate } from "@/lib/students";

type HistoryTarget = { id: string; name: string } | null;

export function StudentAttendanceHistoryDialog({
  target,
  schoolId,
  yearId,
  onOpenChange,
}: {
  target: HistoryTarget;
  schoolId: string;
  yearId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const query = useQuery({
    queryKey: ["student-attendance-history", schoolId, yearId, target?.id],
    enabled: !!target,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_attendance")
        .select("*")
        .eq("school_id", schoolId)
        .eq("academic_year_id", yearId)
        .eq("student_id", target!.id)
        .order("attendance_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <AttendanceHistoryModal
      open={!!target}
      onOpenChange={onOpenChange}
      title={`سجل حضور ${target?.name ?? "الطالب"}`}
      rows={query.data ?? []}
      loading={query.isLoading}
      error={query.isError}
      onRetry={() => void query.refetch()}
      labels={STUDENT_ATTENDANCE_STATUS}
      extraKey="excused"
      extraLabel="بعذر"
    />
  );
}

export function StaffAttendanceHistoryDialog({
  target,
  schoolId,
  onOpenChange,
}: {
  target: HistoryTarget;
  schoolId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const query = useQuery({
    queryKey: ["staff-attendance-history", schoolId, target?.id],
    enabled: !!target,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_attendance")
        .select("*")
        .eq("school_id", schoolId)
        .eq("employee_id", target!.id)
        .order("attendance_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <AttendanceHistoryModal
      open={!!target}
      onOpenChange={onOpenChange}
      title={`سجل حضور ${target?.name ?? "الموظف"}`}
      rows={query.data ?? []}
      loading={query.isLoading}
      error={query.isError}
      onRetry={() => void query.refetch()}
      labels={STAFF_ATTENDANCE_STATUS}
      extraKey="leave"
      extraLabel="إجازة"
    />
  );
}

function AttendanceHistoryModal<T extends StudentAttendance | StaffAttendance>({
  open,
  onOpenChange,
  title,
  rows,
  loading,
  error,
  onRetry,
  labels,
  extraKey,
  extraLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  rows: T[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  labels: Record<
    string,
    { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" | "gold" }
  >;
  extraKey: string;
  extraLabel: string;
}) {
  const summary = attendanceSummary<string>(rows.map((row) => row.status));
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="ملخص السنة وأحدث سجلات الحضور."
    >
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-20" />
          <Skeleton className="h-40" />
        </div>
      ) : error ? (
        <EmptyState
          compact
          title="تعذر تحميل السجل"
          action={
            <Button variant="outline" onClick={onRetry}>
              إعادة المحاولة
            </Button>
          }
        />
      ) : rows.length ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard label="أيام الغياب" value={summary.counts.get("absent") ?? 0} />
            <StatCard label="أيام التأخير" value={summary.counts.get("late") ?? 0} />
            <StatCard label={extraLabel} value={summary.counts.get(extraKey) ?? 0} />
            <StatCard
              label="نسبة الحضور"
              value={summary.percentage === null ? null : `${summary.percentage}%`}
              accent
            />
          </div>
          <div className="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
            {rows.slice(0, 12).map((row) => {
              const status = labels[row.status] ?? { label: row.status, tone: "neutral" as const };
              return (
                <div key={row.id} className="flex items-center gap-3 p-3">
                  <CalendarDays className="size-4 text-muted-foreground" />
                  <span className="tnum flex-1 text-sm">{formatDate(row.attendance_date)}</span>
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                  <span className="max-w-40 truncate text-xs text-muted-foreground">
                    {row.notes ?? ""}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <EmptyState compact icon={CalendarDays} title="لا يوجد سجل حضور بعد" />
      )}
    </Modal>
  );
}
