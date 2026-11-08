import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  ChevronLeft,
  Eye,
  MoreHorizontal,
  Plus,
  UserCheck,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/app-shell";
import { EmptyState } from "@/components/app/empty-state";
import { DataTable, type Column } from "@/components/app/data-table";
import { AppDrawer } from "@/components/app/drawer";
import { FilterBar } from "@/components/app/filter-bar";
import { FormField } from "@/components/app/form-field";
import { Modal } from "@/components/app/modal";
import { PageHeader } from "@/components/app/page-header";
import {
  AccessDenied,
  ALL,
  FilterSelect,
  InfoGrid,
  TextField,
} from "@/components/app/student-shared";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  ADMISSION_STATUS,
  canManageStudents,
  errorMessage,
  fetchStructure,
  formatDate,
  GENDER_LABELS,
  structureKey,
} from "@/lib/students";
import { useWorkspace } from "@/lib/workspace";
import { fetchAdmissionCounts, fetchAdmissionsPage } from "@/lib/core-list-pages";
import { usePagination, keepPageData } from "@/lib/pagination";

export const Route = createFileRoute("/_authenticated/admissions")({
  head: () => ({
    meta: [
      { title: "التسجيل والقبول — مدار | Madar" },
      { name: "description", content: "متابعة طلبات القبول ومراجعتها وتحويلها إلى تسجيل طلاب." },
      { property: "og:title", content: "التسجيل والقبول — مدار | Madar" },
      {
        property: "og:description",
        content: "متابعة طلبات القبول ومراجعتها وتحويلها إلى تسجيل طلاب.",
      },
    ],
  }),
  component: AdmissionsPage,
});

type App = Tables<"admission_applications">;
const ORDER = ["new", "under_review", "accepted", "waiting", "rejected", "enrolled"] as const;
const WORKFLOW = ["new", "under_review", "accepted", "enrolled"] as const;

function AdmissionsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeSchool, activeYear, academicYears, roles, userId, can } = useWorkspace();
  const schoolId = activeSchool?.id;
  const allowed = can("admissions", "view", canManageStudents(roles));
  const canCreate = can("admissions", "create", canManageStudents(roles));
  const canEdit = can("admissions", "edit", canManageStudents(roles));
  const canConvert =
    canManageStudents(roles) || (can("admissions", "manage") && can("students", "create"));
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(ALL);
  const [gradeFilter, setGradeFilter] = useState(ALL);
  const filters = { search, status, gradeFilter };
  const pagination = usePagination([schoolId, filters]);
  const [selected, setSelected] = useState<App | null>(null);
  const [creating, setCreating] = useState(false);
  const [sectionId, setSectionId] = useState("");
  const [busy, setBusy] = useState(false);

  const structure = useQuery({
    queryKey: structureKey(schoolId),
    enabled: !!schoolId && allowed,
    queryFn: () => fetchStructure(schoolId!),
  });
  const apps = useQuery({
    placeholderData: (data, query) => keepPageData(data, query, ["admissions", schoolId]),
    queryKey: ["admissions", schoolId, "page", filters, pagination.page, pagination.pageSize],
    enabled: !!schoolId && allowed,
    queryFn: () => fetchAdmissionsPage(schoolId!, pagination, filters),
  });
  const totals = useQuery({
    queryKey: ["admissions", schoolId, "counts"],
    enabled: !!schoolId && allowed,
    queryFn: () => fetchAdmissionCounts(schoolId!),
  });
  const grades = structure.data?.grades ?? [];
  const gradeName = (id: string) => grades.find((g) => g.id === id)?.name ?? "—";
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admissions"] });
    queryClient.invalidateQueries({ queryKey: ["students"] });
  };
  const openApplication = (app: App) => {
    setSelected(app);
    setSectionId("");
  };

  const counts = totals.data ?? {};
  const rows = apps.data?.rows ?? [];

  async function changeStatus(app: App, next: App["status"]) {
    if (busy || !canEdit || app.status === "enrolled") return;
    setSectionId("");
    setBusy(true);
    const { data, error } = await supabase
      .from("admission_applications")
      .update({ status: next, reviewed_at: new Date().toISOString(), reviewed_by: userId })
      .eq("id", app.id)
      .select("*")
      .single();
    setBusy(false);
    if (error) toast.error(errorMessage(error));
    else {
      toast.success("تم تحديث حالة الطلب");
      setSelected(data);
      refresh();
    }
  }
  async function convert(app: App) {
    if (busy || !canConvert || app.status !== "accepted") return;
    setBusy(true);
    const { data, error } = await supabase.rpc("convert_admission_application", {
      _application_id: app.id,
      ...(sectionId ? { _section_id: sectionId } : {}),
    });
    setBusy(false);
    if (error) {
      toast.error(errorMessage(error));
      return;
    }
    toast.success("تم تسجيل الطالب بنجاح");
    refresh();
    setSelected(null);
    navigate({ to: "/students/$studentId", params: { studentId: data as string } });
  }

  const columns: Column<App>[] = [
    {
      key: "no",
      header: "رقم الطلب",
      cell: (a) => <span className="tnum">{a.application_number}</span>,
    },
    {
      key: "name",
      header: "الطالب",
      cell: (a) => (
        <span className="font-medium">
          {[a.student_first_name, a.student_middle_name, a.student_last_name]
            .filter(Boolean)
            .join(" ")}
          {a.is_demo ? " " : ""}
          {a.is_demo ? <StatusBadge className="ms-2">تجريبي</StatusBadge> : null}
        </span>
      ),
    },
    { key: "grade", header: "الصف المطلوب", cell: (a) => gradeName(a.requested_grade_id) },
    { key: "guardian", header: "ولي الأمر", cell: (a) => a.guardian_name },
    {
      key: "phone",
      header: "الهاتف",
      cell: (a) => (
        <span dir="ltr" className="tnum">
          {a.guardian_phone}
        </span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      cell: (a) => (
        <StatusBadge tone={ADMISSION_STATUS[a.status]?.tone}>
          {ADMISSION_STATUS[a.status]?.label}
        </StatusBadge>
      ),
    },
    {
      key: "date",
      header: "تاريخ التقديم",
      cell: (a) => <span className="tnum">{formatDate(a.submitted_at)}</span>,
    },
    {
      key: "actions",
      header: "الإجراءات",
      cell: (app) => (
        <div onClick={(event) => event.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`إجراءات ${app.application_number}`}
                title="إجراءات الطلب"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => openApplication(app)}>
                <Eye /> عرض
              </DropdownMenuItem>
              {canEdit && ["new", "waiting"].includes(app.status) ? (
                <DropdownMenuItem
                  disabled={busy}
                  onSelect={() => void changeStatus(app, "under_review")}
                >
                  <Eye /> بدء المراجعة
                </DropdownMenuItem>
              ) : null}
              {canEdit && ["new", "under_review", "waiting"].includes(app.status) ? (
                <DropdownMenuItem
                  disabled={busy}
                  onSelect={() => void changeStatus(app, "accepted")}
                >
                  <CheckCircle /> قبول
                </DropdownMenuItem>
              ) : null}
              {canEdit && !["enrolled", "rejected"].includes(app.status) ? (
                <DropdownMenuItem
                  disabled={busy}
                  onSelect={() => void changeStatus(app, "rejected")}
                >
                  <XCircle /> رفض
                </DropdownMenuItem>
              ) : null}
              {canConvert && app.status === "accepted" ? (
                <DropdownMenuItem disabled={busy} onSelect={() => openApplication(app)}>
                  <UserCheck /> تحويل إلى طالب
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  const sectionsForApp = selected
    ? (structure.data?.sections ?? []).filter(
        (s) =>
          s.status === "active" &&
          s.grade_id === selected.requested_grade_id &&
          s.academic_year_id === selected.academic_year_id,
      )
    : [];

  return (
    <AppShell>
      <PageHeader
        title="التسجيل والقبول"
        description="متابعة طلبات القبول والتسجيل"
        actions={
          canCreate ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" /> طلب جديد
            </Button>
          ) : null
        }
      />
      {!allowed ? (
        <AccessDenied />
      ) : (
        <>
          <div aria-label="مسار القبول" className="grid grid-cols-2 gap-3 lg:grid-cols-4" dir="rtl">
            {WORKFLOW.map((key, index) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatus(status === key ? ALL : key)}
                aria-pressed={status === key}
                className={`rounded-lg border bg-card p-3 text-start shadow-card transition-colors ${status === key ? "border-primary bg-secondary/50" : "border-border hover:border-primary/40"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <span className="tnum flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-xs text-primary">
                      {index + 1}
                    </span>
                    {ADMISSION_STATUS[key]!.label}
                  </p>
                  {index < WORKFLOW.length - 1 ? (
                    <ChevronLeft className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <Check className="size-3.5 text-primary" />
                  )}
                </div>
                <p className="tnum mt-1 text-xl font-semibold text-foreground">
                  {counts[key] ?? 0}
                </p>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={status === "rejected"}
              onClick={() => setStatus(status === "rejected" ? ALL : "rejected")}
              className="text-destructive"
            >
              <XCircle className="size-4" /> طلبات مرفوضة{" "}
              <span className="tnum">({counts["rejected"] ?? 0})</span>
            </Button>
            {counts["waiting"] ? (
              <span className="text-xs text-muted-foreground">
                طلبات انتظار: <span className="tnum">{counts["waiting"]}</span>
              </span>
            ) : null}
          </div>
          <FilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="ابحث برقم الطلب أو اسم الطالب أو ولي الأمر..."
            onReset={() => {
              setSearch("");
              setStatus(ALL);
              setGradeFilter(ALL);
            }}
          >
            <FilterSelect
              value={status}
              onChange={setStatus}
              placeholder="الحالة"
              options={ORDER.map((k) => [k, ADMISSION_STATUS[k]!.label])}
            />
            <FilterSelect
              value={gradeFilter}
              onChange={setGradeFilter}
              placeholder="الصف"
              options={grades.map((g) => [g.id, g.name])}
            />
          </FilterBar>
          {apps.isError ? (
            <EmptyState
              title="تعذر تحميل طلبات القبول"
              description="تحقق من الاتصال ثم أعد المحاولة."
              action={
                <Button variant="outline" onClick={() => void apps.refetch()}>
                  إعادة المحاولة
                </Button>
              }
            />
          ) : (
            <DataTable
              pagination={{
                ...pagination,
                page: apps.data?.page ?? pagination.page,
                total: apps.data?.total ?? 0,
                loading: apps.isFetching,
              }}
              columns={columns}
              rows={rows}
              rowKey={(a) => a.id}
              isLoading={apps.isLoading}
              emptyTitle={
                search || status !== ALL || gradeFilter !== ALL
                  ? "لا توجد نتائج مطابقة"
                  : "لا توجد طلبات قبول بعد"
              }
              onRowClick={openApplication}
            />
          )}
        </>
      )}

      <AppDrawer
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        title={selected ? `طلب ${selected.application_number}` : ""}
        description={selected ? ADMISSION_STATUS[selected.status]?.label : undefined}
      >
        {selected ? (
          <div className="space-y-5 pb-6">
            {selected.status === "rejected" ? (
              <p className="flex items-center gap-2 border-s-2 border-destructive ps-3 text-sm text-destructive">
                <XCircle className="size-4 shrink-0" /> انتهى مسار هذا الطلب بالرفض.
              </p>
            ) : (
              <ol
                aria-label="حالة الطلب في مسار القبول"
                className="grid grid-cols-2 gap-2 text-xs"
                dir="rtl"
              >
                {WORKFLOW.map((state, index) => (
                  <li
                    key={state}
                    aria-current={selected.status === state ? "step" : undefined}
                    className={`flex items-center gap-2 border-b-2 py-2 ${selected.status === state ? "border-primary font-semibold text-primary" : "border-border text-muted-foreground"}`}
                  >
                    <span className="tnum">{index + 1}</span>
                    {ADMISSION_STATUS[state]!.label}
                  </li>
                ))}
              </ol>
            )}
            <InfoGrid
              items={[
                [
                  "اسم الطالب",
                  [
                    selected.student_first_name,
                    selected.student_middle_name,
                    selected.student_last_name,
                  ]
                    .filter(Boolean)
                    .join(" "),
                ],
                ["الجنس", selected.gender ? GENDER_LABELS[selected.gender] : null],
                ["تاريخ الميلاد", formatDate(selected.date_of_birth)],
                ["الصف المطلوب", gradeName(selected.requested_grade_id)],
                ["السنة", academicYears.find((y) => y.id === selected.academic_year_id)?.name],
                ["المدرسة السابقة", selected.previous_school],
                ["ولي الأمر", selected.guardian_name],
                [
                  "هاتف ولي الأمر",
                  <span dir="ltr" key="p">
                    {selected.guardian_phone}
                  </span>,
                ],
                ["البريد", selected.guardian_email],
                ["تاريخ التقديم", formatDate(selected.submitted_at)],
                ["تاريخ المراجعة", formatDate(selected.reviewed_at)],
                ["ملاحظات", selected.notes],
              ]}
            />
            {selected.status === "enrolled" ? (
              <div className="space-y-2 rounded-lg border border-border bg-secondary/50 p-3 text-sm">
                <p>تم تحويل هذا الطلب إلى تسجيل طالب.</p>
                {selected.converted_student_id ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      navigate({
                        to: "/students/$studentId",
                        params: { studentId: selected.converted_student_id! },
                      })
                    }
                  >
                    عرض ملف الطالب
                  </Button>
                ) : null}
              </div>
            ) : (
              <>
                <FormField label="تغيير الحالة">
                  {(p) => (
                    <Select
                      value={selected.status}
                      onValueChange={(v) => changeStatus(selected, v as App["status"])}
                      disabled={busy || !canEdit}
                    >
                      <SelectTrigger id={p.id}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ORDER.filter((k) => k !== "enrolled").map((k) => (
                          <SelectItem key={k} value={k}>
                            {ADMISSION_STATUS[k]!.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormField>
                {selected.status === "accepted" && canConvert ? (
                  <div className="space-y-3 rounded-lg border border-gold/50 bg-gold/10 p-3">
                    <p className="text-sm font-semibold">الطلب مقبول — جاهز للتحويل إلى طالب</p>
                    <p className="text-xs text-muted-foreground">
                      سيتم إنشاء ولي الأمر (أو ربط الموجود بنفس الهاتف) والطالب والتسجيل الأكاديمي.
                    </p>
                    <FormField label="الشعبة (اختياري)">
                      {(p) => (
                        <Select
                          value={sectionId}
                          onValueChange={setSectionId}
                          disabled={!sectionsForApp.length}
                        >
                          <SelectTrigger id={p.id}>
                            <SelectValue
                              placeholder={sectionsForApp.length ? "اختر" : "لا توجد شعب"}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {sectionsForApp.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </FormField>
                    <Button className="w-full" onClick={() => convert(selected)} disabled={busy}>
                      <UserCheck className="size-4" /> {busy ? "جارٍ التحويل..." : "تحويل إلى طالب"}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </AppDrawer>

      {creating ? (
        <NewApplicationModal
          schoolId={schoolId!}
          defaultYear={activeYear?.id ?? ""}
          grades={grades.filter((g) => g.status === "active")}
          onClose={() => setCreating(false)}
          onSaved={refresh}
        />
      ) : null}
    </AppShell>
  );
}

function NewApplicationModal({
  schoolId,
  defaultYear,
  grades,
  onClose,
  onSaved,
}: {
  schoolId: string;
  defaultYear: string;
  grades: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { academicYears } = useWorkspace();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [guardianMode, setGuardianMode] = useState("new");
  const [guardianId, setGuardianId] = useState("");
  const [guardianSearch, setGuardianSearch] = useState("");
  const guardians = useQuery({
    queryKey: ["admission-guardian-options", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("guardians")
        .select("id,full_name,phone,email")
        .eq("school_id", schoolId)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const [f, setF] = useState({
    first: "",
    middle: "",
    last: "",
    dob: "",
    gender: "",
    grade: "",
    year: defaultYear,
    gName: "",
    gPhone: "",
    gEmail: "",
    prev: "",
    notes: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof f, string>>>({});
  const steps = ["بيانات الطالب", "ولي الأمر", "طلب القبول والمراجعة"];
  const guardianOptions = (guardians.data ?? []).filter(
    (g) =>
      g.id === guardianId ||
      `${g.full_name} ${g.phone} ${g.email ?? ""}`
        .toLowerCase()
        .includes(guardianSearch.trim().toLowerCase()),
  );
  const matchingGuardian = (guardians.data ?? []).find(
    (g) =>
      g.phone === f.gPhone.trim() ||
      (!!f.gEmail.trim() && g.email?.toLowerCase() === f.gEmail.trim().toLowerCase()),
  );
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const n = (v: string) => (v.trim() ? v.trim() : null);
  function validateStep(current: number) {
    const e: typeof errors = {};
    if (current === 0) {
      if (!f.first.trim()) e.first = "الاسم الأول مطلوب";
      if (!f.last.trim()) e.last = "اسم العائلة مطلوب";
    }
    if (current === 1) {
      if (!f.gName.trim())
        e.gName = guardianMode === "existing" ? "اختر ولي الأمر" : "اسم ولي الأمر مطلوب";
      if (!f.gPhone.trim()) e.gPhone = "هاتف ولي الأمر مطلوب";
    }
    if (current === 2) {
      if (!f.grade) e.grade = "اختر الصف المطلوب";
      if (!f.year) e.year = "اختر السنة الدراسية";
    }
    setErrors(e);
    return !Object.keys(e).length;
  }
  async function save() {
    if (saving) return;
    if (
      !f.first.trim() ||
      !f.last.trim() ||
      !f.grade ||
      !f.year ||
      !f.gName.trim() ||
      !f.gPhone.trim()
    ) {
      toast.error("يرجى استكمال الحقول المطلوبة");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("admission_applications").insert({
      school_id: schoolId,
      application_number: "",
      academic_year_id: f.year,
      student_first_name: f.first.trim(),
      student_middle_name: n(f.middle),
      student_last_name: f.last.trim(),
      date_of_birth: n(f.dob),
      gender: (f.gender || null) as "male" | null,
      requested_grade_id: f.grade,
      guardian_name: f.gName.trim(),
      guardian_phone: f.gPhone.trim(),
      guardian_email: n(f.gEmail),
      previous_school: n(f.prev),
      notes: n(f.notes),
    });
    setSaving(false);
    if (error) toast.error(errorMessage(error));
    else {
      toast.success("تم إنشاء الطلب");
      onSaved();
      onClose();
    }
  }
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="طلب قبول جديد"
      description={`الخطوة ${step + 1} من 3 — ${steps[step]}`}
      footer={
        <>
          {step < 2 ? (
            <Button
              disabled={saving}
              onClick={() => {
                if (validateStep(step)) setStep(step + 1);
              }}
            >
              التالي <ArrowLeft className="size-4" />
            </Button>
          ) : (
            <Button
              disabled={saving}
              onClick={() => {
                if (validateStep(2)) void save();
              }}
            >
              {saving ? "جارٍ الحفظ..." : "حفظ طلب القبول"}
            </Button>
          )}
          <Button
            variant="outline"
            disabled={step === 0 || saving}
            onClick={() => setStep(step - 1)}
          >
            <ArrowRight className="size-4" /> السابق
          </Button>
          <Button variant="ghost" disabled={saving} onClick={onClose}>
            إلغاء
          </Button>
        </>
      }
    >
      <ol aria-label="خطوات طلب القبول" className="grid grid-cols-3 gap-2" dir="rtl">
        {steps.map((label, index) => (
          <li key={label}>
            <button
              type="button"
              aria-current={step === index ? "step" : undefined}
              disabled={index > step || saving}
              onClick={() => setStep(index)}
              className={`flex h-full w-full flex-col items-start gap-1 border-b-2 pb-2 text-start text-xs ${index === step ? "border-primary font-semibold text-primary" : "border-border text-muted-foreground"}`}
            >
              <span className="tnum">
                {index < step ? <Check className="size-4" /> : index + 1}
              </span>
              {label}
            </button>
          </li>
        ))}
      </ol>
      <fieldset disabled={saving} className="max-h-[50vh] min-w-0 overflow-y-auto p-1">
        <div hidden={step !== 0}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="الاسم الأول"
              value={f.first}
              onChange={set("first")}
              required
              error={errors.first}
            />
            <TextField label="اسم الأب" value={f.middle} onChange={set("middle")} />
            <TextField
              label="اسم العائلة"
              value={f.last}
              onChange={set("last")}
              required
              error={errors.last}
            />
            <TextField label="تاريخ الميلاد" type="date" value={f.dob} onChange={set("dob")} />
            <FormField label="الجنس">
              {(p) => (
                <Select value={f.gender} onValueChange={set("gender")}>
                  <SelectTrigger id={p.id}>
                    <SelectValue placeholder="اختر" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(GENDER_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <TextField label="المدرسة السابقة" value={f.prev} onChange={set("prev")} />
          </div>
        </div>
        <div hidden={step !== 1} className="space-y-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="اختيار ولي الأمر">
            {[
              ["existing", "ولي أمر مسجل"],
              ["new", "ولي أمر جديد"],
            ].map(([value, label]) => (
              <Button
                key={value}
                size="sm"
                variant={guardianMode === value ? "default" : "outline"}
                aria-pressed={guardianMode === value}
                onClick={() => {
                  setGuardianMode(value!);
                  setGuardianId("");
                  setF((prev) => ({ ...prev, gName: "", gPhone: "", gEmail: "" }));
                  setErrors({});
                }}
              >
                {label}
              </Button>
            ))}
          </div>
          {guardianMode === "existing" ? (
            <>
              <Input
                aria-label="بحث ولي الأمر"
                placeholder="الاسم أو الهاتف أو البريد"
                value={guardianSearch}
                onChange={(e) => setGuardianSearch(e.target.value)}
              />
              <FormField
                label="ولي الأمر المسجل"
                required
                {...(errors.gName ? { error: errors.gName } : {})}
              >
                {(p) => (
                  <Select
                    dir="rtl"
                    value={guardianId}
                    disabled={guardians.isLoading}
                    onValueChange={(id) => {
                      const guardian = guardians.data?.find((g) => g.id === id);
                      if (!guardian) return;
                      setGuardianId(id);
                      setF((prev) => ({
                        ...prev,
                        gName: guardian.full_name,
                        gPhone: guardian.phone,
                        gEmail: guardian.email ?? "",
                      }));
                      setErrors({});
                    }}
                  >
                    <SelectTrigger id={p.id}>
                      <SelectValue
                        placeholder={guardians.isLoading ? "جارٍ التحميل..." : "اختر ولي الأمر"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {guardianOptions.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.full_name} — {g.phone}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              {guardianId ? (
                <InfoGrid
                  items={[
                    ["ولي الأمر", f.gName],
                    ["الهاتف", f.gPhone],
                    ["البريد", f.gEmail],
                  ]}
                />
              ) : null}
              {!guardians.isLoading && !guardians.isError && !guardianOptions.length ? (
                <p className="text-xs text-muted-foreground">لا يوجد ولي أمر مطابق.</p>
              ) : null}
              {guardians.isError ? (
                <p role="alert" className="text-sm text-destructive">
                  تعذر تحميل أولياء الأمور.{" "}
                  <Button variant="link" onClick={() => void guardians.refetch()}>
                    إعادة المحاولة
                  </Button>
                </p>
              ) : null}
            </>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="اسم ولي الأمر"
                value={f.gName}
                onChange={set("gName")}
                required
                error={errors.gName}
              />
              <TextField
                label="هاتف ولي الأمر"
                value={f.gPhone}
                onChange={set("gPhone")}
                required
                ltr
                error={errors.gPhone}
              />
              <TextField label="بريد ولي الأمر" value={f.gEmail} onChange={set("gEmail")} ltr />
              {matchingGuardian ? (
                <p className="text-xs text-primary sm:col-span-2">
                  ولي أمر مسجل بنفس بيانات الاتصال: {matchingGuardian.full_name}
                </p>
              ) : null}
            </div>
          )}
        </div>
        <div hidden={step !== 2} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="السنة الدراسية"
              required
              {...(errors.year ? { error: errors.year } : {})}
            >
              {(p) => (
                <Select value={f.year} onValueChange={set("year")}>
                  <SelectTrigger id={p.id}>
                    <SelectValue placeholder="اختر" />
                  </SelectTrigger>
                  <SelectContent>
                    {academicYears.map((y) => (
                      <SelectItem key={y.id} value={y.id}>
                        {y.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField
              label="الصف المطلوب"
              required
              {...(errors.grade ? { error: errors.grade } : {})}
            >
              {(p) => (
                <Select value={f.grade} onValueChange={set("grade")}>
                  <SelectTrigger id={p.id}>
                    <SelectValue placeholder="اختر" />
                  </SelectTrigger>
                  <SelectContent>
                    {grades.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <TextField label="ملاحظات" value={f.notes} onChange={set("notes")} multiline />
          </div>
          <div className="border-t border-border pt-4">
            <h3 className="mb-3 text-sm font-semibold">مراجعة طلب القبول</h3>
            <InfoGrid
              items={[
                ["الطالب", [f.first, f.middle, f.last].filter(Boolean).join(" ")],
                ["ولي الأمر", f.gName],
                ["الهاتف", f.gPhone],
                ["السنة الدراسية", academicYears.find((year) => year.id === f.year)?.name],
                ["الصف المطلوب", grades.find((grade) => grade.id === f.grade)?.name],
                ["الحالة", "جديد"],
              ]}
            />
          </div>
        </div>
      </fieldset>
    </Modal>
  );
}
