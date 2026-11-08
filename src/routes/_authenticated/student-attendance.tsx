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
import { StudentAttendanceHistoryDialog } from "@/components/app/attendance-history-dialogs";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { ALL, FilterSelect } from "@/components/app/student-shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  STUDENT_ATTENDANCE_STATUS,
  attendanceError,
  attendanceSummary,
  canManageStudentAttendance,
  canViewStudentAttendance,
  fetchStudentAttendanceDay,
  fetchStudentAttendanceSetup,
  studentAttendanceDayKey,
  studentAttendanceSetupKey,
  todayISO,
  type AttendanceEnrollment,
  type StudentAttendanceStatus,
} from "@/lib/attendance";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/student-attendance")({
  head: () => ({
    meta: [
      { title: "حضور الطلاب — مدار | Madar" },
      { name: "description", content: "تسجيل ومتابعة حضور طلاب المدرسة يومياً." },
      { property: "og:title", content: "حضور الطلاب — مدار | Madar" },
      { property: "og:description", content: "تسجيل ومتابعة حضور طلاب المدرسة يومياً." },
    ],
  }),
  component: StudentAttendancePage,
});

type Draft = { status: StudentAttendanceStatus | null; notes: string };
type HistoryTarget = { id: string; name: string } | null;
const OPTIONS = Object.entries(STUDENT_ATTENDANCE_STATUS).map(([value, item]) => ({
  value: value as StudentAttendanceStatus,
  label: item.label,
}));

function StudentAttendancePage() {
  const { activeSchool, activeYear, roles, userId, can } = useWorkspace();
  const queryClient = useQueryClient();
  const schoolId = activeSchool?.id;
  const yearId = activeYear?.id;
  const canView = can("student_attendance", "view", canViewStudentAttendance(roles));
  const canCreate = can("student_attendance", "create", canManageStudentAttendance(roles));
  const canEdit = can("student_attendance", "edit", canManageStudentAttendance(roles));
  const canManage = canCreate || canEdit;
  const fullManager = roles.some((role) =>
    ["super_admin", "school_owner", "school_manager", "registrar"].includes(role),
  );
  const teacherOnly =
    roles.includes("teacher") && !fullManager && !can("student_attendance", "view");
  const [date, setDate] = useState(todayISO());
  const [stageId, setStageId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<HistoryTarget>(null);

  const setup = useQuery({
    queryKey: studentAttendanceSetupKey(schoolId, yearId),
    enabled: !!schoolId && !!yearId && canView,
    queryFn: () => fetchStudentAttendanceSetup(schoolId!, yearId!),
  });
  const day = useQuery({
    queryKey: studentAttendanceDayKey(schoolId, yearId, date),
    enabled: !!schoolId && !!yearId && !!date && canView,
    queryFn: () => fetchStudentAttendanceDay(schoolId!, yearId!, date),
  });

  const allowedSections = useMemo(
    () =>
      (setup.data?.sections ?? []).filter(
        (section) => !teacherOnly || section.homeroom_teacher_id === userId,
      ),
    [setup.data?.sections, teacherOnly, userId],
  );
  const allowedGradeIds = useMemo(
    () => new Set(allowedSections.map((section) => section.grade_id)),
    [allowedSections],
  );
  const allowedGrades = useMemo(
    () => (setup.data?.grades ?? []).filter((grade) => allowedGradeIds.has(grade.id)),
    [allowedGradeIds, setup.data?.grades],
  );
  const allowedStageIds = useMemo(
    () => new Set(allowedGrades.map((grade) => grade.stage_id)),
    [allowedGrades],
  );
  const allowedStages = useMemo(
    () => (setup.data?.stages ?? []).filter((stage) => allowedStageIds.has(stage.id)),
    [allowedStageIds, setup.data?.stages],
  );

  useEffect(() => {
    if (!allowedStages.length) return;
    if (!allowedStages.some((stage) => stage.id === stageId)) setStageId(allowedStages[0]!.id);
  }, [allowedStages, stageId]);
  const stageGrades = allowedGrades.filter((grade) => grade.stage_id === stageId);
  useEffect(() => {
    if (!stageGrades.length) {
      setGradeId("");
      return;
    }
    if (!stageGrades.some((grade) => grade.id === gradeId)) setGradeId(stageGrades[0]!.id);
  }, [gradeId, stageGrades]);
  const gradeSections = allowedSections.filter((section) => section.grade_id === gradeId);
  useEffect(() => {
    if (!gradeSections.length) {
      setSectionId("");
      return;
    }
    if (!gradeSections.some((section) => section.id === sectionId))
      setSectionId(gradeSections[0]!.id);
  }, [gradeSections, sectionId]);

  const savedByStudent = useMemo(
    () => new Map((day.data ?? []).map((record) => [record.student_id, record])),
    [day.data],
  );
  useEffect(() => {
    const next: Record<string, Draft> = {};
    for (const record of day.data ?? [])
      next[record.student_id] = { status: record.status, notes: record.notes ?? "" };
    setDrafts(next);
    setSelected(new Set());
  }, [day.data, date]);

  const sectionEnrollments = useMemo(
    () =>
      (setup.data?.enrollments ?? []).filter((enrollment) => enrollment.section_id === sectionId),
    [sectionId, setup.data?.enrollments],
  );
  const currentDraft = (studentId: string): Draft =>
    drafts[studentId] ?? {
      status: savedByStudent.get(studentId)?.status ?? null,
      notes: savedByStudent.get(studentId)?.notes ?? "",
    };
  const summary = attendanceSummary(
    sectionEnrollments.map((enrollment) => currentDraft(enrollment.student_id).status),
  );
  const filtered = sectionEnrollments.filter((enrollment) => {
    const draft = currentDraft(enrollment.student_id);
    if (statusFilter !== ALL && draft.status !== statusFilter) return false;
    const needle = search.trim().toLocaleLowerCase("ar");
    return (
      !needle ||
      enrollment.student.full_name.toLocaleLowerCase("ar").includes(needle) ||
      enrollment.student.student_number.toLocaleLowerCase("ar").includes(needle)
    );
  });
  const unsavedCount = sectionEnrollments.filter((enrollment) => {
    const draft = currentDraft(enrollment.student_id);
    const saved = savedByStudent.get(enrollment.student_id);
    return draft.status !== (saved?.status ?? null) || draft.notes.trim() !== (saved?.notes ?? "");
  }).length;

  function setDraft(studentId: string, patch: Partial<Draft>) {
    setDrafts((current) => {
      const saved = savedByStudent.get(studentId);
      const base = current[studentId] ?? {
        status: saved?.status ?? null,
        notes: saved?.notes ?? "",
      };
      return { ...current, [studentId]: { ...base, ...patch } };
    });
  }
  function markAllPresent() {
    setDrafts((current) => {
      const next = { ...current };
      for (const enrollment of sectionEnrollments) {
        const saved = savedByStudent.get(enrollment.student_id);
        const base = current[enrollment.student_id] ?? {
          status: saved?.status ?? null,
          notes: saved?.notes ?? "",
        };
        next[enrollment.student_id] = { ...base, status: "present" };
      }
      return next;
    });
  }
  function markSelectedAbsent() {
    if (!selected.size) {
      toast.info("اختر طالباً واحداً على الأقل.");
      return;
    }
    setDrafts((current) => {
      const next = { ...current };
      for (const studentId of selected) {
        const saved = savedByStudent.get(studentId);
        const base = current[studentId] ?? {
          status: saved?.status ?? null,
          notes: saved?.notes ?? "",
        };
        next[studentId] = { ...base, status: "absent" };
      }
      return next;
    });
  }
  function clearChanges() {
    const next: Record<string, Draft> = {};
    for (const record of day.data ?? [])
      next[record.student_id] = { status: record.status, notes: record.notes ?? "" };
    setDrafts(next);
    setSelected(new Set());
  }
  async function save() {
    if (!schoolId || !yearId || !sectionEnrollments.length) return;
    const rows = sectionEnrollments.flatMap((enrollment) => {
      const draft = currentDraft(enrollment.student_id);
      if (!draft.status || (savedByStudent.has(enrollment.student_id) ? !canEdit : !canCreate))
        return [];
      return [
        {
          school_id: schoolId,
          academic_year_id: yearId,
          student_id: enrollment.student_id,
          enrollment_id: enrollment.id,
          attendance_date: date,
          status: draft.status,
          notes: draft.notes.trim() || null,
        },
      ];
    });
    if (!rows.length) {
      toast.info("حدد حالة طالب واحد على الأقل.");
      return;
    }
    setSaving(true);
    const pending = rows.filter((row) => !savedByStudent.has(row.student_id));
    const results = await Promise.all([
      ...(pending.length ? [supabase.from("student_attendance").insert(pending)] : []),
      ...rows
        .filter((row) => savedByStudent.has(row.student_id))
        .map((row) =>
          supabase
            .from("student_attendance")
            .update(row)
            .eq("school_id", schoolId)
            .eq("id", savedByStudent.get(row.student_id)!.id),
        ),
    ]);
    const error = results.find((result) => result.error)?.error;
    setSaving(false);
    if (error) {
      toast.error(attendanceError(error));
      return;
    }
    toast.success(`تم حفظ حضور ${rows.length} طالباً`);
    await queryClient.invalidateQueries({
      queryKey: studentAttendanceDayKey(schoolId, yearId, date),
    });
    void queryClient.invalidateQueries({ queryKey: ["dashboard-v2", schoolId, yearId] });
  }

  const loading = setup.isLoading || day.isLoading;
  const failed = setup.isError || day.isError;
  const maxDate = activeYear ? [todayISO(), activeYear.end_date].sort()[0]! : todayISO();

  return (
    <AppShell>
      <div className="space-y-4">
        <PageHeader
          title="حضور الطلاب"
          description={
            activeYear ? `الحضور اليومي للسنة الدراسية ${activeYear.name}` : "الحضور اليومي للطلاب"
          }
        />
        {!canView ? (
          <EmptyState icon={Lock} title="لا تملك صلاحية عرض حضور الطلاب" />
        ) : !activeYear ? (
          <EmptyState title="لم يتم تحديد سنة دراسية" description="اختر سنة دراسية لعرض الحضور." />
        ) : loading ? (
          <Skeleton className="h-96 w-full" />
        ) : failed ? (
          <EmptyState
            title="تعذر تحميل الحضور"
            description="تحقق من الاتصال ثم أعد المحاولة."
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
        ) : !allowedSections.length ? (
          <EmptyState
            icon={CalendarCheck}
            title={teacherOnly ? "لا توجد شعبة مسندة إليك" : "لا توجد شعب نشطة"}
            description={
              teacherOnly
                ? "يجب إسنادك كمعلم شعبة قبل تسجيل الحضور."
                : "أضف الشعب والتسجيلات أولاً."
            }
          />
        ) : (
          <>
            <section
              aria-label="اختيار الشعبة والتاريخ"
              className="grid grid-cols-2 gap-2 border-b border-border pb-3 lg:grid-cols-4"
            >
              <label className="min-w-0 space-y-1 text-xs font-medium">
                <span>التاريخ</span>
                <Input
                  type="date"
                  className="h-9 min-w-0"
                  min={activeYear.start_date}
                  max={maxDate}
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>
              <Selector
                label="المرحلة"
                value={stageId}
                onChange={setStageId}
                options={allowedStages.map((item) => [item.id, item.name])}
              />
              <Selector
                label="الصف"
                value={gradeId}
                onChange={setGradeId}
                options={stageGrades.map((item) => [item.id, item.name])}
              />
              <Selector
                label="الشعبة"
                value={sectionId}
                onChange={setSectionId}
                options={gradeSections.map((item) => [item.id, item.name])}
              />
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
              searchPlaceholder="اسم الطالب أو رقمه"
            >
              <div className="flex min-w-0 items-center gap-2 [&>button:first-child]:w-40">
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
                    setStatusFilter(ALL);
                  }}
                >
                  <RotateCcw className="size-4" />
                </Button>
              </div>
            </FilterBar>

            {!sectionEnrollments.length ? (
              <EmptyState title="لا يوجد طلاب مسجلون في هذه الشعبة" />
            ) : (
              <section
                role="region"
                aria-label="قائمة حضور الطلاب"
                tabIndex={0}
                className="max-h-[70dvh] overflow-y-auto rounded-lg border border-border bg-card focus-visible:outline focus-visible:outline-ring"
              >
                <AttendanceListHeader
                  total={sectionEnrollments.length}
                  shown={filtered.length}
                  noun="طالب"
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
                  {filtered.map((enrollment) => (
                    <StudentAttendanceRow
                      key={enrollment.id}
                      enrollment={enrollment}
                      draft={currentDraft(enrollment.student_id)}
                      selected={selected.has(enrollment.student_id)}
                      canManage={savedByStudent.has(enrollment.student_id) ? canEdit : canCreate}
                      onSelect={(checked) =>
                        setSelected((current) => {
                          const next = new Set(current);
                          if (checked) next.add(enrollment.student_id);
                          else next.delete(enrollment.student_id);
                          return next;
                        })
                      }
                      onChange={(patch) => setDraft(enrollment.student_id, patch)}
                      onHistory={() =>
                        setHistory({
                          id: enrollment.student_id,
                          name: enrollment.student.full_name,
                        })
                      }
                    />
                  ))}
                </div>
                {!filtered.length ? <EmptyState compact title="لا توجد نتائج مطابقة" /> : null}
              </section>
            )}
          </>
        )}
        {schoolId && yearId ? (
          <StudentAttendanceHistoryDialog
            target={history}
            schoolId={schoolId}
            yearId={yearId}
            onOpenChange={(open) => {
              if (!open) setHistory(null);
            }}
          />
        ) : null}
      </div>
    </AppShell>
  );
}

function Selector({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[][];
}) {
  return (
    <label className="min-w-0 space-y-1 text-xs font-medium">
      <span>{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 min-w-0" aria-label={label}>
          <SelectValue placeholder={`اختر ${label}`} />
        </SelectTrigger>
        <SelectContent>
          {options.map(([id, name]) => (
            <SelectItem key={id} value={id!}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function StudentAttendanceRow({
  enrollment,
  draft,
  selected,
  canManage,
  onSelect,
  onChange,
  onHistory,
}: {
  enrollment: AttendanceEnrollment;
  draft: Draft;
  selected: boolean;
  canManage: boolean;
  onSelect: (checked: boolean) => void;
  onChange: (patch: Partial<Draft>) => void;
  onHistory: () => void;
}) {
  return (
    <article
      aria-label={enrollment.student.full_name}
      className="grid min-w-0 gap-2 p-3 lg:grid-cols-[minmax(140px,1fr)_minmax(260px,1.2fr)_minmax(100px,.7fr)] lg:items-center"
    >
      <div className="flex min-w-0 items-center gap-2">
        {canManage ? (
          <Checkbox
            checked={selected}
            onCheckedChange={(value) => onSelect(!!value)}
            aria-label={`تحديد ${enrollment.student.full_name}`}
            className="size-5 shrink-0"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-medium">{enrollment.student.full_name}</p>
          <p dir="ltr" className="tnum text-right text-xs text-muted-foreground">
            {enrollment.student.student_number}
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0 text-muted-foreground"
          onClick={onHistory}
          title="سجل الحضور"
          aria-label={`سجل حضور ${enrollment.student.full_name}`}
        >
          <History className="size-4" />
        </Button>
      </div>
      <AttendanceStatusPicker
        value={draft.status}
        options={OPTIONS}
        onChange={(status) => onChange({ status })}
        disabled={!canManage}
        label={`حالة حضور ${enrollment.student.full_name}`}
      />
      <AttendanceNote
        value={draft.notes}
        onChange={(notes) => onChange({ notes })}
        disabled={!canManage}
        name={enrollment.student.full_name}
      />
    </article>
  );
}
