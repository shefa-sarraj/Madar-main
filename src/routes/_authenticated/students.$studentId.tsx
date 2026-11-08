import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarCheck,
  FileText,
  Pencil,
  Plus,
  Star,
  Trash2,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/app-shell";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { FormField } from "@/components/app/form-field";
import { Modal } from "@/components/app/modal";
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
import { StatusBadge } from "@/components/app/status-badge";
import { StudentFinanceTab } from "@/components/app/student-finance-tab";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  canManageStudents,
  canViewStudents,
  DOCUMENT_TYPES,
  ENROLLMENT_STATUS,
  errorMessage,
  fetchStructure,
  formatDate,
  GENDER_LABELS,
  STUDENT_STATUS,
  structureKey,
} from "@/lib/students";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/students/$studentId")({
  head: () => ({
    meta: [
      { title: "ملف الطالب — مدار | Madar" },
      {
        name: "description",
        content: "الملف الكامل للطالب: البيانات والتسجيلات وأولياء الأمور والمستندات.",
      },
      { property: "og:title", content: "ملف الطالب — مدار | Madar" },
      {
        property: "og:description",
        content: "الملف الكامل للطالب: البيانات والتسجيلات وأولياء الأمور والمستندات.",
      },
    ],
  }),
  component: StudentProfilePage,
  validateSearch: (search: Record<string, unknown>): { tab?: string; action?: string } => ({
    ...(typeof search["tab"] === "string" &&
    [
      "overview",
      "enrollments",
      "guardians",
      "attendance",
      "finance",
      "documents",
      "notes",
    ].includes(search["tab"])
      ? { tab: search["tab"] }
      : {}),
    ...(search["action"] === "edit" ? { action: "edit" } : {}),
  }),
});

const n = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

function StudentProfilePage() {
  const { studentId } = Route.useParams();
  const routeSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const { activeSchool, activeYear, academicYears, roles, can } = useWorkspace();
  const schoolId = activeSchool?.id;
  const allowed = can("students", "view", canViewStudents(roles));
  const canEdit = can("students", "edit", canManageStudents(roles));
  const canCreate = can("students", "create", canManageStudents(roles));
  const canAdminister = can("students", "manage", canManageStudents(roles));

  const structure = useQuery({
    queryKey: structureKey(schoolId),
    enabled: !!schoolId && allowed,
    queryFn: () => fetchStructure(schoolId!),
  });
  const q = useQuery({
    queryKey: ["student", studentId],
    enabled: !!schoolId && allowed,
    queryFn: async () => {
      const [student, links, enrollments, docs] = await Promise.all([
        supabase
          .from("students")
          .select("*")
          .eq("id", studentId)
          .eq("school_id", schoolId!)
          .maybeSingle(),
        supabase
          .from("student_guardians")
          .select("*, guardian:guardians(*)")
          .eq("student_id", studentId)
          .order("is_primary", { ascending: false }),
        supabase
          .from("student_enrollments")
          .select("*")
          .eq("student_id", studentId)
          .order("start_date", { ascending: false }),
        supabase
          .from("student_documents")
          .select("*")
          .eq("student_id", studentId)
          .order("created_at", { ascending: false }),
      ]);
      if (student.error) throw student.error;
      return {
        student: student.data,
        links: links.data ?? [],
        enrollments: enrollments.data ?? [],
        docs: docs.data ?? [],
      };
    },
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["student", studentId] });
    queryClient.invalidateQueries({ queryKey: ["students"] });
  };

  const [localEditOpen, setLocalEditOpen] = useState(false);
  const editOpen = canEdit && (localEditOpen || routeSearch.action === "edit");
  const setEditOpen = (open: boolean) => {
    setLocalEditOpen(open);
    if (!open && routeSearch.action)
      void navigate({ search: routeSearch.tab ? { tab: routeSearch.tab } : {}, replace: true });
  };
  const [guardianModal, setGuardianModal] = useState<
    { mode: "add" } | { mode: "edit"; id: string; draft: GuardianDraft } | null
  >(null);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [deleteDoc, setDeleteDoc] = useState<{ id: string; file_url: string } | null>(null);

  if (!allowed)
    return (
      <AppShell>
        <AccessDenied />
      </AppShell>
    );
  if (q.isLoading)
    return (
      <AppShell>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </AppShell>
    );
  const data = q.data;
  const student = data?.student;
  if (!student) {
    return (
      <AppShell>
        <EmptyState
          title="لم يتم العثور على الطالب"
          description="قد يكون السجل محذوفاً أو تابعاً لمدرسة أخرى."
          action={
            <Button asChild variant="outline">
              <Link to="/students">العودة إلى الطلاب</Link>
            </Button>
          }
        />
      </AppShell>
    );
  }

  const grades = structure.data?.grades ?? [];
  const sections = structure.data?.sections ?? [];
  const gradeName = (id?: string | null) => grades.find((g) => g.id === id)?.name ?? "—";
  const sectionName = (id?: string | null) => sections.find((s) => s.id === id)?.name ?? "—";
  const yearName = (id: string) => academicYears.find((y) => y.id === id)?.name ?? "—";
  const current =
    data.enrollments.find(
      (e) =>
        e.academic_year_id === activeYear?.id &&
        ["active", "pending"].includes(e.enrollment_status),
    ) ?? data.enrollments[0];
  const primary = data.links.find((l) => l.is_primary)?.guardian;

  async function setPrimary(linkId: string) {
    const { error: e1 } = await supabase
      .from("student_guardians")
      .update({ is_primary: false })
      .eq("student_id", studentId)
      .eq("is_primary", true);
    const { error: e2 } = e1
      ? { error: e1 }
      : await supabase.from("student_guardians").update({ is_primary: true }).eq("id", linkId);
    if (e2) toast.error(errorMessage(e2));
    else {
      toast.success("تم تعيين ولي الأمر الأساسي");
      refresh();
    }
  }
  async function unlink(linkId: string, isPrimary: boolean) {
    if (isPrimary) {
      toast.error("لا يمكن إزالة ولي الأمر الأساسي. عيّن ولي أمر أساسياً آخر أولاً.");
      return;
    }
    const { error } = await supabase.from("student_guardians").delete().eq("id", linkId);
    if (error) toast.error(errorMessage(error));
    else {
      toast.success("تمت إزالة الربط");
      refresh();
    }
  }
  async function openDoc(path: string) {
    const { data: signed, error } = await supabase.storage
      .from("student-documents")
      .createSignedUrl(path, 60);
    if (error || !signed) toast.error("تعذر فتح الملف");
    else window.open(signed.signedUrl, "_blank", "noopener");
  }
  async function removeDoc() {
    if (!deleteDoc) return;
    await supabase.storage.from("student-documents").remove([deleteDoc.file_url]);
    const { error } = await supabase.from("student_documents").delete().eq("id", deleteDoc.id);
    if (error) toast.error(errorMessage(error));
    else {
      toast.success("تم حذف المستند");
      refresh();
    }
    setDeleteDoc(null);
  }

  return (
    <AppShell>
      <Link
        to="/students"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowRight className="size-4" /> الطلاب
      </Link>

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-card sm:flex-row sm:items-center">
        <Avatar className="size-16">
          <AvatarFallback className="bg-primary text-lg text-primary-foreground">
            {student.first_name.slice(0, 1)}
            {student.last_name.slice(0, 1)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">{student.full_name}</h1>
            <StatusBadge tone={STUDENT_STATUS[student.status]?.tone}>
              {STUDENT_STATUS[student.status]?.label}
            </StatusBadge>
            {student.is_demo ? <StatusBadge>سجل تجريبي</StatusBadge> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            الرقم المدرسي: <span className="tnum">{student.student_number}</span>
            {" · "}
            {current
              ? `${gradeName(current.grade_id)} / ${sectionName(current.section_id)}`
              : "غير مسجل في صف"}
          </p>
        </div>
        {canEdit ? (
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" /> تعديل البيانات
          </Button>
        ) : null}
      </div>

      <Tabs
        key={`${studentId}-${routeSearch.tab ?? "overview"}`}
        defaultValue={routeSearch.tab ?? "overview"}
        dir="rtl"
      >
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
          <TabsTrigger value="enrollments">التسجيلات</TabsTrigger>
          <TabsTrigger value="guardians">أولياء الأمور</TabsTrigger>
          <TabsTrigger value="attendance">الحضور</TabsTrigger>
          <TabsTrigger value="finance">المالية</TabsTrigger>
          <TabsTrigger value="documents">المستندات</TabsTrigger>
          <TabsTrigger value="notes">الملاحظات</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 grid gap-4 lg:grid-cols-2">
          <Section title="البيانات الشخصية">
            <InfoGrid
              items={[
                ["الجنس", GENDER_LABELS[student.gender]],
                ["تاريخ الميلاد", formatDate(student.date_of_birth)],
                ["مكان الميلاد", student.place_of_birth],
                ["الجنسية", student.nationality],
                ["الهاتف", student.phone ? <span dir="ltr">{student.phone}</span> : null],
                [
                  "هاتف الطوارئ",
                  student.emergency_phone ? <span dir="ltr">{student.emergency_phone}</span> : null,
                ],
                ["العنوان", student.address],
              ]}
            />
          </Section>
          <Section title="ولي الأمر الأساسي">
            {primary ? (
              <InfoGrid
                items={[
                  ["الاسم", primary.full_name],
                  [
                    "الهاتف",
                    <span dir="ltr" key="p">
                      {primary.phone}
                    </span>,
                  ],
                  ["البريد", primary.email],
                  ["المهنة", primary.occupation],
                ]}
              />
            ) : (
              <EmptyState compact title="لا يوجد ولي أمر أساسي" />
            )}
          </Section>
          <Section title="التسجيل الأكاديمي الحالي">
            {current ? (
              <InfoGrid
                items={[
                  ["السنة الدراسية", yearName(current.academic_year_id)],
                  ["الصف", gradeName(current.grade_id)],
                  ["الشعبة", sectionName(current.section_id)],
                  ["حالة التسجيل", ENROLLMENT_STATUS[current.enrollment_status]?.label],
                ]}
              />
            ) : (
              <EmptyState compact title="لا يوجد تسجيل أكاديمي" />
            )}
          </Section>
          <Section title="بيانات إدارية">
            <InfoGrid
              items={[
                ["تاريخ الالتحاق", formatDate(student.enrollment_date)],
                ["المدرسة السابقة", student.previous_school],
                ["تاريخ إنشاء السجل", formatDate(student.created_at)],
                ["آخر تحديث", formatDate(student.updated_at)],
              ]}
            />
          </Section>
        </TabsContent>

        <TabsContent value="enrollments" className="mt-4">
          <Section
            title="السجل الأكاديمي"
            description="يحتفظ النظام بتسجيل منفصل لكل سنة دراسية."
            actions={
              canCreate ? (
                <Button size="sm" onClick={() => setEnrollOpen(true)}>
                  <Plus className="size-4" /> تسجيل جديد
                </Button>
              ) : null
            }
          >
            <DataTable
              rows={data.enrollments}
              rowKey={(r) => r.id}
              emptyTitle="لا توجد تسجيلات"
              columns={[
                { key: "y", header: "السنة", cell: (r) => yearName(r.academic_year_id) },
                { key: "g", header: "الصف", cell: (r) => gradeName(r.grade_id) },
                { key: "s", header: "الشعبة", cell: (r) => sectionName(r.section_id) },
                {
                  key: "st",
                  header: "الحالة",
                  cell: (r) => (
                    <StatusBadge tone={ENROLLMENT_STATUS[r.enrollment_status]?.tone}>
                      {ENROLLMENT_STATUS[r.enrollment_status]?.label}
                    </StatusBadge>
                  ),
                },
                {
                  key: "d",
                  header: "من",
                  cell: (r) => <span className="tnum">{formatDate(r.start_date)}</span>,
                },
                {
                  key: "e",
                  header: "إلى",
                  cell: (r) => <span className="tnum">{formatDate(r.end_date)}</span>,
                },
                ...(canEdit
                  ? [
                      {
                        key: "a",
                        header: "تغيير الحالة",
                        cell: (r: (typeof data.enrollments)[number]) => (
                          <Select
                            value={r.enrollment_status}
                            onValueChange={async (v) => {
                              const { error } = await supabase
                                .from("student_enrollments")
                                .update({
                                  enrollment_status: v as "active",
                                  end_date: ["completed", "withdrawn", "transferred"].includes(v)
                                    ? new Date().toISOString().slice(0, 10)
                                    : null,
                                })
                                .eq("id", r.id);
                              if (error) toast.error(errorMessage(error));
                              else refresh();
                            }}
                          >
                            <SelectTrigger className="h-8 w-28">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(ENROLLMENT_STATUS).map(([k, v]) => (
                                <SelectItem key={k} value={k}>
                                  {v.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </Section>
        </TabsContent>

        <TabsContent value="guardians" className="mt-4">
          <Section
            title="أولياء الأمور"
            actions={
              canEdit ? (
                <Button size="sm" onClick={() => setGuardianModal({ mode: "add" })}>
                  <Plus className="size-4" /> إضافة ولي أمر
                </Button>
              ) : null
            }
          >
            {data.links.length === 0 ? (
              <EmptyState compact title="لا يوجد أولياء أمور مرتبطون" />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {data.links.map(
                  (l) =>
                    l.guardian && (
                      <div key={l.id} className="space-y-3 rounded-lg border border-border p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-foreground">{l.guardian.full_name}</p>
                            <p className="text-xs text-muted-foreground">{l.relationship}</p>
                          </div>
                          {l.is_primary ? <StatusBadge tone="gold">أساسي</StatusBadge> : null}
                        </div>
                        <InfoGrid
                          items={[
                            [
                              "الهاتف",
                              <span dir="ltr" key="p">
                                {l.guardian.phone}
                              </span>,
                            ],
                            ["البريد", l.guardian.email],
                            ["استلام الطالب", l.can_pickup ? "مسموح" : "غير مسموح"],
                            ["الإشعارات", l.receives_notifications ? "يستقبل" : "لا يستقبل"],
                          ]}
                        />
                        {canEdit ? (
                          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const g = l.guardian!;
                                setGuardianModal({
                                  mode: "edit",
                                  id: g.id,
                                  draft: {
                                    full_name: g.full_name,
                                    relationship: g.relationship ?? "",
                                    phone: g.phone,
                                    secondary_phone: g.secondary_phone ?? "",
                                    email: g.email ?? "",
                                    address: g.address ?? "",
                                    occupation: g.occupation ?? "",
                                    notes: g.notes ?? "",
                                  },
                                });
                              }}
                            >
                              <Pencil className="size-4" /> تعديل
                            </Button>
                            {!l.is_primary ? (
                              <Button size="sm" variant="outline" onClick={() => setPrimary(l.id)}>
                                <Star className="size-4" /> تعيين كأساسي
                              </Button>
                            ) : null}
                            {!l.is_primary && canAdminister ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => unlink(l.id, l.is_primary)}
                              >
                                إزالة الربط
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ),
                )}
              </div>
            )}
          </Section>
        </TabsContent>

        <TabsContent value="attendance" className="mt-4">
          <EmptyState
            icon={CalendarCheck}
            title="سجل الحضور غير مفعّل بعد"
            description="سيظهر هنا حضور الطالب وغيابه بعد تفعيل وحدة الحضور في مرحلة لاحقة."
          />
        </TabsContent>
        <TabsContent value="finance" className="mt-4">
          <StudentFinanceTab
            studentId={studentId}
            enrollment={
              current && current.academic_year_id === activeYear?.id
                ? { id: current.id, grade_id: current.grade_id }
                : null
            }
          />
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <DocumentsTab
            schoolId={schoolId!}
            studentId={studentId}
            docs={data.docs}
            canEdit={canCreate}
            canDelete={canAdminister}
            onChanged={refresh}
            onOpen={openDoc}
            onDelete={setDeleteDoc}
          />
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <NotesTab
            key={student.updated_at}
            studentId={studentId}
            medical={student.medical_notes}
            admin={student.administrative_notes}
            canEdit={canEdit}
            onSaved={refresh}
          />
        </TabsContent>
      </Tabs>

      {editOpen ? (
        <EditStudentModal student={student} onClose={() => setEditOpen(false)} onSaved={refresh} />
      ) : null}
      {guardianModal ? (
        <GuardianModal
          state={guardianModal}
          schoolId={schoolId!}
          studentId={studentId}
          hasPrimary={!!primary}
          linkedIds={data.links.map((l) => l.guardian_id)}
          onClose={() => setGuardianModal(null)}
          onSaved={refresh}
        />
      ) : null}
      {enrollOpen ? (
        <EnrollmentModal
          schoolId={schoolId!}
          studentId={studentId}
          structure={structure.data}
          onClose={() => setEnrollOpen(false)}
          onSaved={refresh}
        />
      ) : null}
      <ConfirmDialog
        open={!!deleteDoc}
        onOpenChange={(o) => !o && setDeleteDoc(null)}
        title="حذف المستند"
        description="سيتم حذف الملف نهائياً. هل أنت متأكد؟"
        confirmLabel="حذف"
        destructive
        onConfirm={removeDoc}
      />
    </AppShell>
  );
}

type StudentRecord = Tables<"students">;

function EditStudentModal({
  student,
  onClose,
  onSaved,
}: {
  student: StudentRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    first_name: student.first_name,
    middle_name: student.middle_name ?? "",
    last_name: student.last_name,
    gender: student.gender as string,
    date_of_birth: student.date_of_birth ?? "",
    place_of_birth: student.place_of_birth ?? "",
    nationality: student.nationality ?? "",
    phone: student.phone ?? "",
    emergency_phone: student.emergency_phone ?? "",
    address: student.address ?? "",
    previous_school: student.previous_school ?? "",
    status: student.status as string,
    student_number: student.student_number,
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  async function save() {
    if (!f.first_name.trim() || !f.last_name.trim() || !f.student_number.trim()) {
      toast.error("الاسم الأول واسم العائلة والرقم المدرسي مطلوبة");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("students")
      .update({
        first_name: f.first_name.trim(),
        middle_name: n(f.middle_name),
        last_name: f.last_name.trim(),
        gender: f.gender as "male",
        date_of_birth: n(f.date_of_birth),
        place_of_birth: n(f.place_of_birth),
        nationality: n(f.nationality),
        phone: n(f.phone),
        emergency_phone: n(f.emergency_phone),
        address: n(f.address),
        previous_school: n(f.previous_school),
        status: f.status as "active",
        student_number: f.student_number.trim(),
      })
      .eq("id", student.id);
    setSaving(false);
    if (error) toast.error(errorMessage(error));
    else {
      toast.success("تم حفظ التعديلات");
      onSaved();
      onClose();
    }
  }
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="تعديل بيانات الطالب"
      footer={
        <>
          <Button onClick={save} disabled={saving}>
            حفظ
          </Button>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
        </>
      }
    >
      <div className="grid max-h-[60vh] gap-4 overflow-y-auto p-1 sm:grid-cols-2">
        <TextField label="الاسم الأول" value={f.first_name} onChange={set("first_name")} required />
        <TextField label="اسم الأب" value={f.middle_name} onChange={set("middle_name")} />
        <TextField label="اسم العائلة" value={f.last_name} onChange={set("last_name")} required />
        <TextField
          label="الرقم المدرسي"
          value={f.student_number}
          onChange={set("student_number")}
          required
          ltr
        />
        <FormField label="الجنس">
          {(p) => (
            <Select value={f.gender} onValueChange={set("gender")}>
              <SelectTrigger id={p.id}>
                <SelectValue />
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
        <FormField label="الحالة">
          {(p) => (
            <Select value={f.status} onValueChange={set("status")}>
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
        <TextField
          label="تاريخ الميلاد"
          type="date"
          value={f.date_of_birth}
          onChange={set("date_of_birth")}
        />
        <TextField label="مكان الميلاد" value={f.place_of_birth} onChange={set("place_of_birth")} />
        <TextField label="الجنسية" value={f.nationality} onChange={set("nationality")} />
        <TextField label="الهاتف" value={f.phone} onChange={set("phone")} ltr />
        <TextField
          label="هاتف الطوارئ"
          value={f.emergency_phone}
          onChange={set("emergency_phone")}
          ltr
        />
        <TextField label="العنوان" value={f.address} onChange={set("address")} />
        <TextField
          label="المدرسة السابقة"
          value={f.previous_school}
          onChange={set("previous_school")}
        />
      </div>
    </Modal>
  );
}

function GuardianModal({
  state,
  schoolId,
  studentId,
  hasPrimary,
  linkedIds,
  onClose,
  onSaved,
}: {
  state: { mode: "add" } | { mode: "edit"; id: string; draft: GuardianDraft };
  schoolId: string;
  studentId: string;
  hasPrimary: boolean;
  linkedIds: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<GuardianDraft>(
    state.mode === "edit" ? state.draft : emptyGuardian,
  );
  const [errors, setErrors] = useState<Partial<Record<keyof GuardianDraft, string>>>({});
  const [existing, setExisting] = useState<{ id: string; full_name: string; phone: string } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);

  async function link(guardianId: string) {
    if (linkedIds.includes(guardianId)) {
      toast.error("ولي الأمر مرتبط بالطالب مسبقاً");
      return false;
    }
    const { error } = await supabase.from("student_guardians").insert({
      school_id: schoolId,
      student_id: studentId,
      guardian_id: guardianId,
      relationship: draft.relationship.trim() || "ولي أمر",
      is_primary: !hasPrimary,
    });
    if (error) {
      toast.error(errorMessage(error));
      return false;
    }
    return true;
  }
  async function save() {
    const e = validateGuardian(draft);
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      if (state.mode === "edit") {
        const { error } = await supabase
          .from("guardians")
          .update(guardianPayload(draft))
          .eq("id", state.id);
        if (error) throw error;
        toast.success("تم تحديث بيانات ولي الأمر");
      } else {
        if (!existing) {
          const found = await findExistingGuardian(schoolId, draft.phone, draft.email);
          if (found) {
            setExisting(found);
            setSaving(false);
            return;
          }
        }
        const { data, error } = await supabase
          .from("guardians")
          .insert({ school_id: schoolId, ...guardianPayload(draft) })
          .select("id")
          .single();
        if (error) throw error;
        if (!(await link(data.id))) return;
        toast.success("تمت إضافة ولي الأمر");
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={state.mode === "edit" ? "تعديل بيانات ولي الأمر" : "إضافة ولي أمر"}
      footer={
        <>
          <Button onClick={save} disabled={saving}>
            {existing ? "إنشاء سجل جديد رغم ذلك" : "حفظ"}
          </Button>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
        </>
      }
    >
      {existing ? (
        <div className="space-y-2 rounded-lg border border-gold/50 bg-gold/10 p-3 text-sm">
          <p>
            يوجد ولي أمر مسجل بنفس الهاتف أو البريد: <strong>{existing.full_name}</strong> (
            <span dir="ltr">{existing.phone}</span>)
          </p>
          <Button
            size="sm"
            onClick={async () => {
              setSaving(true);
              if (await link(existing.id)) {
                toast.success("تم ربط ولي الأمر الموجود");
                onSaved();
                onClose();
              }
              setSaving(false);
            }}
          >
            ربط ولي الأمر الموجود
          </Button>
        </div>
      ) : null}
      <div className="max-h-[55vh] overflow-y-auto p-1">
        <GuardianFields
          value={draft}
          onChange={(d) => {
            setDraft(d);
            setExisting(null);
          }}
          errors={errors}
        />
      </div>
    </Modal>
  );
}

function EnrollmentModal({
  schoolId,
  studentId,
  structure,
  onClose,
  onSaved,
}: {
  schoolId: string;
  studentId: string;
  structure: Awaited<ReturnType<typeof fetchStructure>> | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { academicYears, activeYear } = useWorkspace();
  const [yearId, setYearId] = useState(activeYear?.id ?? "");
  const [gradeId, setGradeId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const grades = (structure?.grades ?? []).filter((g) => g.status === "active");
  const sections = (structure?.sections ?? []).filter(
    (s) => s.status === "active" && s.grade_id === gradeId && s.academic_year_id === yearId,
  );
  async function save() {
    if (!yearId || !gradeId) {
      toast.error("اختر السنة والصف");
      return;
    }
    const { error } = await supabase.from("student_enrollments").insert({
      school_id: schoolId,
      student_id: studentId,
      academic_year_id: yearId,
      grade_id: gradeId,
      section_id: sectionId || null,
      start_date: startDate,
    });
    if (error) toast.error(errorMessage(error));
    else {
      toast.success("تم إنشاء التسجيل");
      onSaved();
      onClose();
    }
  }
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="تسجيل أكاديمي جديد"
      footer={
        <>
          <Button onClick={save}>حفظ</Button>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="السنة الدراسية" required>
          {(p) => (
            <Select
              value={yearId}
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
        <FormField label="الصف" required>
          {(p) => (
            <Select
              value={gradeId}
              onValueChange={(v) => {
                setGradeId(v);
                setSectionId("");
              }}
            >
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
        <FormField label="الشعبة">
          {(p) => (
            <Select value={sectionId} onValueChange={setSectionId} disabled={!sections.length}>
              <SelectTrigger id={p.id}>
                <SelectValue placeholder={sections.length ? "اختر" : "لا توجد شعب"} />
              </SelectTrigger>
              <SelectContent>
                {sections.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <TextField label="تاريخ البدء" type="date" value={startDate} onChange={setStartDate} />
      </div>
    </Modal>
  );
}

function DocumentsTab({
  schoolId,
  studentId,
  docs,
  canEdit,
  canDelete,
  onChanged,
  onOpen,
  onDelete,
}: {
  schoolId: string;
  studentId: string;
  docs: {
    id: string;
    document_type: string;
    file_name: string;
    file_url: string;
    expiry_date: string | null;
    created_at: string;
  }[];
  canEdit: boolean;
  canDelete: boolean;
  onChanged: () => void;
  onOpen: (path: string) => void;
  onDelete: (d: { id: string; file_url: string }) => void;
}) {
  const [type, setType] = useState(DOCUMENT_TYPES[0]!);
  const [expiry, setExpiry] = useState("");
  const [busy, setBusy] = useState(false);
  async function upload(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("حجم الملف يتجاوز 10 ميغابايت");
      return;
    }
    setBusy(true);
    const path = `${schoolId}/${studentId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error } = await supabase.storage.from("student-documents").upload(path, file);
    if (error) {
      toast.error("تعذر رفع الملف");
      setBusy(false);
      return;
    }
    const { error: e2 } = await supabase.from("student_documents").insert({
      school_id: schoolId,
      student_id: studentId,
      document_type: type,
      file_url: path,
      file_name: file.name,
      expiry_date: expiry || null,
    });
    setBusy(false);
    if (e2) toast.error(errorMessage(e2));
    else {
      toast.success("تم رفع المستند");
      onChanged();
    }
  }
  return (
    <Section title="المستندات">
      {canEdit ? (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <FormField label="نوع المستند" className="sm:w-44">
            {(p) => (
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id={p.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <TextField
            label="تاريخ الانتهاء (اختياري)"
            type="date"
            value={expiry}
            onChange={setExpiry}
          />
          <FormField label="الملف" className="flex-1">
            {(p) => (
              <Input
                {...p}
                type="file"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload(f);
                  e.target.value = "";
                }}
              />
            )}
          </FormField>
        </div>
      ) : null}
      {docs.length === 0 ? (
        <EmptyState compact icon={FileText} title="لا توجد مستندات" />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {docs.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium text-foreground">{d.document_type}</p>
                <p className="text-xs text-muted-foreground">
                  {d.file_name} · {formatDate(d.created_at)}
                  {d.expiry_date ? ` · ينتهي ${formatDate(d.expiry_date)}` : ""}
                </p>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => onOpen(d.file_url)}>
                  فتح
                </Button>
                {canDelete ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="حذف"
                    onClick={() => onDelete({ id: d.id, file_url: d.file_url })}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function NotesTab({
  studentId,
  medical,
  admin,
  canEdit,
  onSaved,
}: {
  studentId: string;
  medical: string | null;
  admin: string | null;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [m, setM] = useState(medical ?? "");
  const [a, setA] = useState(admin ?? "");
  async function save() {
    const { error } = await supabase
      .from("students")
      .update({ medical_notes: n(m), administrative_notes: n(a) })
      .eq("id", studentId);
    if (error) toast.error(errorMessage(error));
    else {
      toast.success("تم حفظ الملاحظات");
      onSaved();
    }
  }
  if (!canEdit)
    return (
      <Section title="الملاحظات">
        <InfoGrid
          items={[
            ["ملاحظات صحية", medical],
            ["ملاحظات إدارية", admin],
          ]}
        />
      </Section>
    );
  return (
    <Section
      title="الملاحظات"
      actions={
        <Button size="sm" onClick={save}>
          حفظ
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="ملاحظات صحية" value={m} onChange={setM} multiline />
        <TextField label="ملاحظات إدارية" value={a} onChange={setA} multiline />
      </div>
    </Section>
  );
}
