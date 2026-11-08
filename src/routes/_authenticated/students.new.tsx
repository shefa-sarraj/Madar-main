import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, Plus, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/app-shell";
import { FormField } from "@/components/app/form-field";
import { PageHeader } from "@/components/app/page-header";
import {
  AccessDenied,
  emptyGuardian,
  findExistingGuardian,
  GuardianFields,
  guardianPayload,
  InfoGrid,
  Section,
  TextField,
  validateGuardian,
  type GuardianDraft,
} from "@/components/app/student-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  canManageStudents,
  DOCUMENT_TYPES,
  errorMessage,
  fetchStructure,
  GENDER_LABELS,
  STUDENT_STATUS,
  structureKey,
} from "@/lib/students";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/students/new")({
  head: () => ({
    meta: [
      { title: "إضافة طالب — مدار | Madar" },
      { name: "description", content: "تسجيل طالب جديد مع ولي الأمر والتسجيل الأكاديمي." },
      { property: "og:title", content: "إضافة طالب — مدار | Madar" },
      { property: "og:description", content: "تسجيل طالب جديد مع ولي الأمر والتسجيل الأكاديمي." },
    ],
  }),
  component: NewStudentPage,
});

const n = (v: string) => (v.trim() ? v.trim() : null);

function NewStudentPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeSchool, activeYear, academicYears, roles, can } = useWorkspace();
  const schoolId = activeSchool?.id;
  const canCreate = can("students", "create", canManageStudents(roles));
  const [step, setStep] = useState(0);
  const wizardRef = useRef<HTMLDivElement>(null);
  const [guardianMode, setGuardianMode] = useState("new");
  const [selectedGuardianId, setSelectedGuardianId] = useState("");
  const [guardianSearch, setGuardianSearch] = useState("");
  const guardians = useQuery({
    queryKey: ["student-guardian-options", schoolId],
    enabled: !!schoolId && canCreate && guardianMode === "existing",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("guardians")
        .select("id,full_name,phone,email,secondary_phone,address,occupation,notes,relationship")
        .eq("school_id", schoolId!)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const structure = useQuery({
    queryKey: structureKey(schoolId),
    enabled: !!schoolId,
    queryFn: () => fetchStructure(schoolId!),
  });

  const [s, setS] = useState({
    first_name: "",
    middle_name: "",
    last_name: "",
    gender: "",
    date_of_birth: "",
    place_of_birth: "",
    nationality: "",
    address: "",
    phone: "",
    emergency_phone: "",
    student_number: "",
    previous_school: "",
    status: "new",
    enrollment_date: new Date().toISOString().slice(0, 10),
    medical_notes: "",
    administrative_notes: "",
  });
  const [guardian, setGuardian] = useState<GuardianDraft>(emptyGuardian);
  const [yearId, setYearId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [files, setFiles] = useState<{ id: string; type: string; file: File | null }[]>([
    { id: "document-1", type: DOCUMENT_TYPES[0]!, file: null },
  ]);
  const [errors, setErrors] = useState<
    Partial<
      Record<"first_name" | "last_name" | "gender" | "enrollment_date" | "grade" | "year", string>
    >
  >({});
  const [gErrors, setGErrors] = useState<Partial<Record<keyof GuardianDraft, string>>>({});
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof s) => (v: string) => setS((prev) => ({ ...prev, [key]: v }));
  const effectiveYear = yearId || activeYear?.id || "";

  if (!canCreate) {
    return (
      <AppShell>
        <PageHeader title="إضافة طالب" />
        <AccessDenied />
      </AppShell>
    );
  }

  const grades = (structure.data?.grades ?? []).filter((g) => g.status === "active");
  const sections = (structure.data?.sections ?? []).filter(
    (x) => x.status === "active" && x.grade_id === gradeId && x.academic_year_id === effectiveYear,
  );
  const steps = ["بيانات الطالب", "ولي الأمر", "التسجيل الأكاديمي", "المستندات والمراجعة"];
  const selectedGuardian = guardians.data?.find((g) => g.id === selectedGuardianId);
  const guardianOptions = (guardians.data ?? []).filter(
    (g) =>
      g.id === selectedGuardianId ||
      `${g.full_name} ${g.phone} ${g.email ?? ""}`
        .toLowerCase()
        .includes(guardianSearch.trim().toLowerCase()),
  );
  function goToStep(next: number) {
    setStep(next);
    wizardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function nextStep() {
    const e: typeof errors = {};
    if (step === 0) {
      if (!s.first_name.trim()) e.first_name = "الاسم الأول مطلوب";
      if (!s.last_name.trim()) e.last_name = "اسم العائلة مطلوب";
      if (!s.gender) e.gender = "اختر الجنس";
    }
    if (step === 1) {
      const ge = validateGuardian(guardian);
      if (guardianMode === "existing" && !selectedGuardian) ge.full_name = "اختر ولي أمر مسجلاً";
      setGErrors(ge);
      if (Object.keys(ge).length) return;
    }
    if (step === 2) {
      if (!s.enrollment_date) e.enrollment_date = "تاريخ الالتحاق مطلوب";
      if (!gradeId) e.grade = "اختر الصف";
      if (!effectiveYear) e.year = "لا توجد سنة دراسية";
    }
    setErrors(e);
    if (!Object.keys(e).length) goToStep(step + 1);
  }

  async function submit() {
    const e: typeof errors = {};
    if (!s.first_name.trim()) e.first_name = "الاسم الأول مطلوب";
    if (!s.last_name.trim()) e.last_name = "اسم العائلة مطلوب";
    if (!s.gender) e.gender = "اختر الجنس";
    if (!s.enrollment_date) e.enrollment_date = "تاريخ الالتحاق مطلوب";
    if (!gradeId) e.grade = "اختر الصف";
    if (!effectiveYear) e.year = "لا توجد سنة دراسية";
    const ge = validateGuardian(guardian);
    if (guardianMode === "existing" && !selectedGuardian) ge.full_name = "اختر ولي أمر مسجلاً";
    setErrors(e);
    setGErrors(ge);
    if (Object.keys(e).length || Object.keys(ge).length) {
      goToStep(e.first_name || e.last_name || e.gender ? 0 : Object.keys(ge).length ? 1 : 2);
      toast.error("يرجى استكمال الحقول المطلوبة.");
      return;
    }
    setSaving(true);
    try {
      const { data: student, error } = await supabase
        .from("students")
        .insert({
          school_id: schoolId!,
          student_number: s.student_number.trim(),
          first_name: s.first_name.trim(),
          middle_name: n(s.middle_name),
          last_name: s.last_name.trim(),
          gender: s.gender as "male" | "female",
          date_of_birth: n(s.date_of_birth),
          place_of_birth: n(s.place_of_birth),
          nationality: n(s.nationality),
          address: n(s.address),
          phone: n(s.phone),
          emergency_phone: n(s.emergency_phone),
          enrollment_date: s.enrollment_date,
          status: s.status as "new",
          previous_school: n(s.previous_school),
          medical_notes: n(s.medical_notes),
          administrative_notes: n(s.administrative_notes),
        })
        .select("id")
        .single();
      if (error) throw error;

      let guardianId =
        guardianMode === "existing"
          ? selectedGuardian!.id
          : (await findExistingGuardian(schoolId!, guardian.phone, guardian.email))?.id;
      if (!guardianId) {
        const { data: g, error: gErr } = await supabase
          .from("guardians")
          .insert({ school_id: schoolId!, ...guardianPayload(guardian) })
          .select("id")
          .single();
        if (gErr) throw gErr;
        guardianId = g.id;
      }
      const { error: linkErr } = await supabase.from("student_guardians").insert({
        school_id: schoolId!,
        student_id: student.id,
        guardian_id: guardianId,
        relationship: guardian.relationship.trim() || "ولي أمر",
        is_primary: true,
      });
      if (linkErr) throw linkErr;
      const { error: enrErr } = await supabase.from("student_enrollments").insert({
        school_id: schoolId!,
        student_id: student.id,
        academic_year_id: effectiveYear,
        grade_id: gradeId,
        section_id: sectionId || null,
        start_date: s.enrollment_date,
      });
      if (enrErr) throw enrErr;

      for (const item of files.flatMap((row) =>
        row.file ? [{ type: row.type, file: row.file }] : [],
      )) {
        const path = `${schoolId}/${student.id}/${crypto.randomUUID()}-${item.file.name.replace(/[^\w.-]/g, "_")}`;
        const { error: upErr } = await supabase.storage
          .from("student-documents")
          .upload(path, item.file);
        if (upErr) {
          toast.error(`تعذر رفع ${item.file.name}`);
          continue;
        }
        await supabase.from("student_documents").insert({
          school_id: schoolId!,
          student_id: student.id,
          document_type: item.type,
          file_url: path,
          file_name: item.file.name,
        });
      }

      await queryClient.invalidateQueries({ queryKey: ["students"] });
      toast.success("تمت إضافة الطالب بنجاح");
      navigate({ to: "/students/$studentId", params: { studentId: student.id } });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="إضافة طالب"
        description={`الخطوة ${step + 1} من 4 — ${steps[step]}`}
        actions={
          <Button variant="outline" asChild>
            <Link to="/students">إلغاء</Link>
          </Button>
        }
      />

      <div ref={wizardRef} className="scroll-mt-4">
        <ol
          aria-label="خطوات إضافة الطالب"
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          dir="rtl"
        >
          {steps.map((label, index) => (
            <li key={label}>
              <button
                type="button"
                disabled={index > step || saving}
                aria-current={index === step ? "step" : undefined}
                onClick={() => goToStep(index)}
                className={`flex h-full w-full items-center gap-2 border-b-2 px-2 py-3 text-start text-sm ${index === step ? "border-primary font-semibold text-primary" : "border-border text-muted-foreground"}`}
              >
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs ${index === step ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
                >
                  {index < step ? <Check className="size-3.5" /> : index + 1}
                </span>
                {label}
              </button>
            </li>
          ))}
        </ol>
      </div>
      <fieldset disabled={saving} className="min-w-0 space-y-4">
        <div hidden={step !== 0}>
          <Section title="البيانات الشخصية">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <TextField
                label="الاسم الأول"
                value={s.first_name}
                onChange={set("first_name")}
                required
                error={errors.first_name}
              />
              <TextField label="اسم الأب" value={s.middle_name} onChange={set("middle_name")} />
              <TextField
                label="اسم العائلة"
                value={s.last_name}
                onChange={set("last_name")}
                required
                error={errors.last_name}
              />
              <FormField
                label="الجنس"
                required
                {...(errors.gender ? { error: errors.gender } : {})}
              >
                {(p) => (
                  <Select value={s.gender} onValueChange={set("gender")}>
                    <SelectTrigger id={p.id} aria-invalid={p["aria-invalid"]}>
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
              <TextField
                label="تاريخ الميلاد"
                type="date"
                value={s.date_of_birth}
                onChange={set("date_of_birth")}
              />
              <TextField
                label="مكان الميلاد"
                value={s.place_of_birth}
                onChange={set("place_of_birth")}
              />
              <TextField label="الجنسية" value={s.nationality} onChange={set("nationality")} />
              <TextField
                label="هاتف الطالب"
                value={s.phone}
                onChange={set("phone")}
                ltr
                type="tel"
              />
              <TextField
                label="هاتف الطوارئ"
                value={s.emergency_phone}
                onChange={set("emergency_phone")}
                ltr
                type="tel"
              />
              <TextField label="العنوان" value={s.address} onChange={set("address")} />
              <TextField
                label="المدرسة السابقة"
                value={s.previous_school}
                onChange={set("previous_school")}
              />
            </div>
          </Section>
        </div>

        <div hidden={step !== 1}>
          <Section title="بيانات ولي الأمر">
            <div className="mb-4 flex flex-wrap gap-1" role="group" aria-label="اختيار ولي الأمر">
              {[
                ["existing", "ولي أمر مسجل"],
                ["new", "ولي أمر جديد"],
              ].map(([value, label]) => (
                <Button
                  key={value}
                  variant={guardianMode === value ? "default" : "outline"}
                  size="sm"
                  aria-pressed={guardianMode === value}
                  onClick={() => {
                    setGuardianMode(value!);
                    setSelectedGuardianId("");
                    setGuardian(emptyGuardian);
                    setGErrors({});
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>
            {guardianMode === "existing" ? (
              <div className="space-y-4">
                <Input
                  aria-label="بحث ولي الأمر"
                  placeholder="اسم ولي الأمر أو الهاتف أو البريد"
                  value={guardianSearch}
                  onChange={(e) => setGuardianSearch(e.target.value)}
                />
                <FormField
                  label="ولي الأمر المسجل"
                  required
                  {...(gErrors.full_name ? { error: gErrors.full_name } : {})}
                >
                  {(p) => (
                    <Select
                      dir="rtl"
                      value={selectedGuardianId}
                      onValueChange={(id) => {
                        const g = guardians.data?.find((row) => row.id === id);
                        if (!g) return;
                        setSelectedGuardianId(id);
                        setGuardian({
                          full_name: g.full_name,
                          phone: g.phone,
                          email: g.email ?? "",
                          secondary_phone: g.secondary_phone ?? "",
                          address: g.address ?? "",
                          occupation: g.occupation ?? "",
                          notes: g.notes ?? "",
                          relationship: g.relationship ?? "",
                        });
                        setGErrors({});
                      }}
                    >
                      <SelectTrigger id={p.id} aria-invalid={p["aria-invalid"]}>
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
                {guardians.isError ? (
                  <p role="alert" className="text-sm text-destructive">
                    تعذر تحميل أولياء الأمور.{" "}
                    <Button variant="link" onClick={() => void guardians.refetch()}>
                      إعادة المحاولة
                    </Button>
                  </p>
                ) : !guardians.isLoading && !guardianOptions.length ? (
                  <p className="text-sm text-muted-foreground">لا يوجد ولي أمر مطابق.</p>
                ) : null}
                {selectedGuardian ? (
                  <>
                    <InfoGrid
                      items={[
                        ["الاسم", guardian.full_name],
                        ["الهاتف", guardian.phone],
                        ["البريد الإلكتروني", guardian.email],
                      ]}
                    />
                    <TextField
                      label="صلة القرابة بالطالب"
                      value={guardian.relationship}
                      onChange={(v) => setGuardian((g) => ({ ...g, relationship: v }))}
                    />
                  </>
                ) : null}
              </div>
            ) : (
              <GuardianFields value={guardian} onChange={setGuardian} errors={gErrors} />
            )}
          </Section>
        </div>

        <div hidden={step !== 2}>
          <Section title="التسجيل الأكاديمي">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FormField label="الرقم المدرسي">
                {(p) => (
                  <Input
                    {...p}
                    readOnly
                    value="يُولّد تلقائياً عند الحفظ"
                    className="bg-secondary/50 text-muted-foreground"
                  />
                )}
              </FormField>
              <FormField
                label="السنة الدراسية"
                required
                {...(errors.year ? { error: errors.year } : {})}
              >
                {(p) => (
                  <Select
                    value={effectiveYear}
                    onValueChange={(v) => {
                      setYearId(v);
                      setSectionId("");
                    }}
                  >
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
                label="الصف"
                required
                {...(errors.grade ? { error: errors.grade } : {})}
                hint={grades.length ? undefined : "أضف الصفوف أولاً من صفحة الصفوف والشعب"}
              >
                {(p) => (
                  <Select
                    value={gradeId}
                    onValueChange={(v) => {
                      setGradeId(v);
                      setSectionId("");
                    }}
                  >
                    <SelectTrigger id={p.id} aria-invalid={p["aria-invalid"]}>
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
              <FormField
                label="الشعبة"
                hint={
                  !gradeId
                    ? "اختر الصف أولاً"
                    : !sections.length
                      ? "لا توجد شعب فعالة لهذا الصف في السنة المحددة؛ يمكن الحفظ دون شعبة."
                      : "اختياري"
                }
              >
                {(p) => (
                  <Select
                    value={sectionId}
                    onValueChange={setSectionId}
                    disabled={!sections.length}
                  >
                    <SelectTrigger id={p.id}>
                      <SelectValue placeholder={sections.length ? "اختر" : "لا توجد شعب"} />
                    </SelectTrigger>
                    <SelectContent>
                      {sections.map((x) => (
                        <SelectItem key={x.id} value={x.id}>
                          {x.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <TextField
                label="تاريخ الالتحاق"
                type="date"
                value={s.enrollment_date}
                onChange={set("enrollment_date")}
                required
                error={errors.enrollment_date}
              />
              <FormField label="حالة الطالب">
                {(p) => (
                  <Select value={s.status} onValueChange={set("status")}>
                    <SelectTrigger id={p.id}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STUDENT_STATUS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
            </div>
          </Section>
        </div>

        <div hidden={step !== 0}>
          <Section title="الملاحظات">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="ملاحظات صحية"
                value={s.medical_notes}
                onChange={set("medical_notes")}
                multiline
              />
              <TextField
                label="ملاحظات إدارية"
                value={s.administrative_notes}
                onChange={set("administrative_notes")}
                multiline
              />
            </div>
          </Section>
        </div>

        <div hidden={step !== 3} className="space-y-4">
          <Section title="المستندات" description="اختياري — الحد الأقصى 10 ميغابايت لكل ملف.">
            <div className="space-y-3">
              {files.map((row, index) => (
                <div
                  key={row.id}
                  className="grid min-w-0 items-end gap-3 border-b border-border pb-3 sm:grid-cols-[12rem_minmax(0,1fr)_auto]"
                >
                  <FormField label={`نوع المستند ${index + 1}`}>
                    {(p) => (
                      <Select
                        dir="rtl"
                        value={row.type}
                        onValueChange={(type) =>
                          setFiles((all) => all.map((r) => (r.id === row.id ? { ...r, type } : r)))
                        }
                      >
                        <SelectTrigger id={p.id}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DOCUMENT_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </FormField>
                  <div className="min-w-0 space-y-2">
                    <input
                      id={`file-${row.id}`}
                      type="file"
                      hidden
                      aria-label={`ملف المستند ${index + 1}`}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file && file.size > 10 * 1024 * 1024)
                          toast.error("الحد الأقصى للملف 10 ميغابايت");
                        else if (file)
                          setFiles((all) => all.map((r) => (r.id === row.id ? { ...r, file } : r)));
                        e.target.value = "";
                      }}
                    />
                    <Button
                      variant="outline"
                      className="w-full"
                      aria-label={`${row.file ? "تغيير" : "اختيار"} ملف المستند ${index + 1}`}
                      onClick={() => document.getElementById(`file-${row.id}`)?.click()}
                    >
                      <Upload className="size-4" /> {row.file ? "تغيير الملف" : "اختيار ملف"}
                    </Button>
                    <p className="truncate text-xs text-muted-foreground" title={row.file?.name}>
                      {row.file?.name ?? "لم يُحدد ملف"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`إزالة المستند ${index + 1}`}
                    title="إزالة المستند"
                    onClick={() => setFiles((all) => all.filter((r) => r.id !== row.id))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setFiles((all) => [
                    ...all,
                    { id: crypto.randomUUID(), type: DOCUMENT_TYPES[0]!, file: null },
                  ])
                }
              >
                <Plus className="size-4" /> إضافة مستند
              </Button>
            </div>
          </Section>
          <Section title="مراجعة بيانات الطالب">
            <InfoGrid
              items={[
                ["الطالب", [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ")],
                ["الجنس", GENDER_LABELS[s.gender]],
                ["ولي الأمر", guardian.full_name],
                ["هاتف ولي الأمر", guardian.phone],
                ["السنة الدراسية", academicYears.find((y) => y.id === effectiveYear)?.name],
                ["الصف", grades.find((g) => g.id === gradeId)?.name],
                [
                  "الشعبة",
                  sections.find((section) => section.id === sectionId)?.name ?? "دون شعبة",
                ],
                ["المستندات", String(files.filter((row) => row.file).length)],
              ]}
            />
          </Section>
        </div>
      </fieldset>

      <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4">
        <Button
          variant="outline"
          disabled={step === 0 || saving}
          onClick={() => goToStep(step - 1)}
        >
          <ArrowRight className="size-4" /> السابق
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/students">إلغاء</Link>
          </Button>
          {step < 3 ? (
            <Button onClick={nextStep} disabled={saving}>
              التالي <ArrowLeft className="size-4" />
            </Button>
          ) : (
            <Button onClick={submit} disabled={saving}>
              {saving ? "جارٍ الحفظ..." : "حفظ الطالب"}
            </Button>
          )}
        </div>
      </div>
    </AppShell>
  );
}
