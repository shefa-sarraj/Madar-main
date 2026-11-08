import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Archive, ArchiveRestore, Layers, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/app-shell";
import { EmptyState } from "@/components/app/empty-state";
import { FormField } from "@/components/app/form-field";
import { Modal } from "@/components/app/modal";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied, TextField } from "@/components/app/student-shared";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { canManageStructure, errorMessage, fetchStructure, structureKey } from "@/lib/students";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/classes")({
  head: () => ({
    meta: [
      { title: "الصفوف والشعب — مدار | Madar" },
      { name: "description", content: "إدارة المراحل والصفوف والشعب وسعتها في المدرسة." },
      { property: "og:title", content: "الصفوف والشعب — مدار | Madar" },
      { property: "og:description", content: "إدارة المراحل والصفوف والشعب وسعتها في المدرسة." },
    ],
  }),
  component: ClassesPage,
});

type Kind = "stage" | "grade" | "section";
type EditState = {
  kind: Kind;
  id?: string;
  name: string;
  order: string;
  parentId: string;
  capacity: string;
};
const TABLE: Record<Kind, "stages" | "grades" | "sections"> = {
  stage: "stages",
  grade: "grades",
  section: "sections",
};
const KIND_LABEL: Record<Kind, string> = { stage: "مرحلة", grade: "صف", section: "شعبة" };

function ClassesPage() {
  const queryClient = useQueryClient();
  const { activeSchool, activeYear, roles, can } = useWorkspace();
  const schoolId = activeSchool?.id;
  const canEdit = can("classes", "edit", canManageStructure(roles));
  const canCreate = can("classes", "create", canManageStructure(roles));
  const canAdminister = can("classes", "manage", canManageStructure(roles));
  const allowed =
    can("classes", "view") ||
    canManageStructure(roles) ||
    roles.some((r) => ["accountant", "teacher"].includes(r));
  const [showArchived, setShowArchived] = useState(false);
  const [edit, setEdit] = useState<EditState | null>(null);

  const structure = useQuery({
    queryKey: structureKey(schoolId),
    enabled: !!schoolId && allowed,
    queryFn: () => fetchStructure(schoolId!),
  });
  const counts = useQuery({
    queryKey: ["section-counts", schoolId, activeYear?.id, "grade-summary"],
    enabled: !!schoolId && !!activeYear && allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_enrollments")
        .select("section_id,grade_id")
        .eq("school_id", schoolId!)
        .eq("academic_year_id", activeYear!.id)
        .in("enrollment_status", ["active", "pending"]);
      if (error) throw error;
      const map = new Map<string, number>();
      const byGrade = new Map<string, number>();
      for (const row of data ?? []) {
        byGrade.set(row.grade_id, (byGrade.get(row.grade_id) ?? 0) + 1);
        if (row.section_id) map.set(row.section_id, (map.get(row.section_id) ?? 0) + 1);
      }
      return { bySection: map, byGrade };
    },
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["structure"] });
    queryClient.invalidateQueries({ queryKey: ["section-counts"] });
  };

  async function toggleArchive(kind: Kind, id: string, status: string) {
    const { error } = await supabase
      .from(TABLE[kind])
      .update({ status: status === "active" ? "archived" : "active" })
      .eq("id", id);
    if (error) toast.error(errorMessage(error));
    else {
      toast.success(status === "active" ? "تمت الأرشفة" : "تمت الاستعادة");
      refresh();
    }
  }

  async function save() {
    if (!edit || !schoolId) return;
    if (!edit.name.trim()) {
      toast.error("الاسم مطلوب");
      return;
    }
    if (edit.kind !== "stage" && !edit.parentId) {
      toast.error("اختر العنصر الأعلى");
      return;
    }
    const capacity = edit.capacity.trim() ? Number(edit.capacity) : null;
    if (capacity !== null && (!Number.isInteger(capacity) || capacity < 0)) {
      toast.error("السعة يجب أن تكون رقماً صحيحاً");
      return;
    }
    const order = Number(edit.order) || 0;
    let result;
    if (edit.kind === "stage") {
      const payload = { name: edit.name.trim(), order_index: order };
      result = edit.id
        ? await supabase.from("stages").update(payload).eq("id", edit.id)
        : await supabase.from("stages").insert({ ...payload, school_id: schoolId });
    } else if (edit.kind === "grade") {
      const payload = { name: edit.name.trim(), order_index: order, stage_id: edit.parentId };
      result = edit.id
        ? await supabase.from("grades").update(payload).eq("id", edit.id)
        : await supabase.from("grades").insert({ ...payload, school_id: schoolId });
    } else {
      if (!activeYear) {
        toast.error("لا توجد سنة دراسية نشطة");
        return;
      }
      const payload = { name: edit.name.trim(), capacity, grade_id: edit.parentId };
      result = edit.id
        ? await supabase.from("sections").update(payload).eq("id", edit.id)
        : await supabase
            .from("sections")
            .insert({ ...payload, school_id: schoolId, academic_year_id: activeYear.id });
    }
    if (result.error) toast.error(errorMessage(result.error));
    else {
      toast.success("تم الحفظ");
      setEdit(null);
      refresh();
    }
  }

  const visible = <T extends { status: string }>(items: T[]) =>
    showArchived ? items : items.filter((i) => i.status === "active");
  const stages = visible(structure.data?.stages ?? []);
  const grades = visible(structure.data?.grades ?? []);
  const sections = visible(
    (structure.data?.sections ?? []).filter((s) => s.academic_year_id === activeYear?.id),
  );

  return (
    <AppShell>
      <PageHeader
        title="الصفوف والشعب"
        description={
          activeYear ? `الهيكل الدراسي — الشعب للسنة ${activeYear.name}` : "الهيكل الدراسي للمدرسة"
        }
        actions={
          canCreate ? (
            <Button
              onClick={() =>
                setEdit({
                  kind: "stage",
                  name: "",
                  order: String((structure.data?.stages.length ?? 0) + 1),
                  parentId: "",
                  capacity: "",
                })
              }
            >
              <Plus className="size-4" /> مرحلة جديدة
            </Button>
          ) : null
        }
      />
      {!allowed ? (
        <AccessDenied />
      ) : structure.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <p className="text-sm text-muted-foreground">
              <span className="tnum font-medium text-foreground">{stages.length}</span> مراحل ·{" "}
              <span className="tnum font-medium text-foreground">{grades.length}</span> صفوف ·{" "}
              <span className="tnum font-medium text-foreground">{sections.length}</span> شعب
            </p>
            <div className="flex items-center gap-2">
              <Switch id="archived" checked={showArchived} onCheckedChange={setShowArchived} />
              <Label htmlFor="archived" className="text-sm text-muted-foreground">
                إظهار العناصر المؤرشفة
              </Label>
            </div>
          </div>
          {counts.isError ? (
            <p role="alert" className="text-sm text-destructive">
              تعذر تحميل أعداد الطلاب.{" "}
              <Button size="sm" variant="link" onClick={() => void counts.refetch()}>
                إعادة المحاولة
              </Button>
            </p>
          ) : null}
          {stages.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="لا توجد مراحل بعد"
              description="ابدأ بإضافة مرحلة دراسية (مثل: ابتدائي، إعدادي) ثم أضف الصفوف والشعب."
            />
          ) : (
            <Accordion
              type="multiple"
              defaultValue={stages.map((stage) => stage.id)}
              className="space-y-2"
              dir="rtl"
            >
              {stages.map((stage) => (
                <AccordionItem key={stage.id} value={stage.id} className="border-border">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 [&>h3]:min-w-0">
                    <AccordionTrigger className="gap-2 py-3 text-start hover:no-underline">
                      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-base font-semibold text-foreground">
                          {stage.name}
                        </span>
                        {stage.status === "archived" ? <StatusBadge>مؤرشف</StatusBadge> : null}
                        <span className="tnum text-xs font-normal text-muted-foreground">
                          {grades.filter((grade) => grade.stage_id === stage.id).length} صفوف
                        </span>
                      </span>
                    </AccordionTrigger>
                    {canEdit || canCreate || canAdminister ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!canCreate}
                          onClick={() =>
                            setEdit({
                              kind: "grade",
                              name: "",
                              order: "0",
                              parentId: stage.id,
                              capacity: "",
                            })
                          }
                        >
                          <Plus className="size-4" /> إضافة صف
                        </Button>
                        <IconActions
                          label={`إجراءات ${stage.name}`}
                          canEdit={canEdit}
                          canArchive={canAdminister}
                          onEdit={() =>
                            setEdit({
                              kind: "stage",
                              id: stage.id,
                              name: stage.name,
                              order: String(stage.order_index),
                              parentId: "",
                              capacity: "",
                            })
                          }
                          status={stage.status}
                          onArchive={() => toggleArchive("stage", stage.id, stage.status)}
                        />
                      </div>
                    ) : null}
                  </div>
                  <AccordionContent className="pb-0">
                    <div className="divide-y divide-border">
                      {grades.filter((g) => g.stage_id === stage.id).length === 0 ? (
                        <p className="px-3 py-3 text-sm text-muted-foreground">
                          لا توجد صفوف في هذه المرحلة.
                        </p>
                      ) : (
                        grades
                          .filter((g) => g.stage_id === stage.id)
                          .map((grade) => {
                            const gradeSections = sections.filter((s) => s.grade_id === grade.id);
                            return (
                              <div key={grade.id} className="px-1 py-3 sm:px-3">
                                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                  <div className="min-w-0 space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <h4 className="text-sm font-semibold text-foreground">
                                        {grade.name}
                                      </h4>
                                      {grade.status === "archived" ? (
                                        <StatusBadge>مؤرشف</StatusBadge>
                                      ) : null}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      <span className="tnum">{gradeSections.length}</span> شعب ·{" "}
                                      <span className="tnum">
                                        {counts.data
                                          ? (counts.data.byGrade.get(grade.id) ?? 0)
                                          : "—"}
                                      </span>{" "}
                                      طالب
                                    </p>
                                  </div>
                                  {canEdit || canCreate || canAdminister ? (
                                    <div className="flex gap-1">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled={!canCreate || !activeYear}
                                        onClick={() =>
                                          setEdit({
                                            kind: "section",
                                            name: "",
                                            order: "0",
                                            parentId: grade.id,
                                            capacity: "",
                                          })
                                        }
                                      >
                                        <Plus className="size-4" /> إضافة شعبة
                                      </Button>
                                      <IconActions
                                        label={`إجراءات ${grade.name}`}
                                        canEdit={canEdit}
                                        canArchive={canAdminister}
                                        onEdit={() =>
                                          setEdit({
                                            kind: "grade",
                                            id: grade.id,
                                            name: grade.name,
                                            order: String(grade.order_index),
                                            parentId: grade.stage_id,
                                            capacity: "",
                                          })
                                        }
                                        status={grade.status}
                                        onArchive={() =>
                                          toggleArchive("grade", grade.id, grade.status)
                                        }
                                      />
                                    </div>
                                  ) : null}
                                </div>
                                {gradeSections.length === 0 ? (
                                  <p className="text-xs text-muted-foreground">
                                    لا توجد شعب لهذه السنة.
                                  </p>
                                ) : (
                                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                    {gradeSections.map((section) => {
                                      const enrolled = counts.data
                                        ? (counts.data.bySection.get(section.id) ?? 0)
                                        : null;
                                      const available =
                                        section.capacity === null || enrolled === null
                                          ? null
                                          : Math.max(section.capacity - enrolled, 0);
                                      const occupancy =
                                        section.capacity === null || enrolled === null
                                          ? null
                                          : section.capacity > 0
                                            ? Math.round((enrolled / section.capacity) * 100)
                                            : enrolled > 0
                                              ? 100
                                              : 0;
                                      const overCapacity =
                                        enrolled !== null &&
                                        section.capacity !== null &&
                                        enrolled > section.capacity;
                                      return (
                                        <div
                                          key={section.id}
                                          className="min-w-0 rounded-lg border border-border bg-card p-2.5"
                                        >
                                          <div className="flex items-center justify-between gap-2">
                                            <p className="min-w-0 text-sm font-medium">
                                              {section.name.startsWith("شعبة")
                                                ? section.name
                                                : `شعبة ${section.name}`}
                                            </p>
                                            <div className="flex shrink-0 items-center gap-1">
                                              {section.status === "archived" ? (
                                                <StatusBadge>مؤرشف</StatusBadge>
                                              ) : canEdit || canAdminister ? (
                                                <IconActions
                                                  label={`إجراءات ${grade.name} - ${section.name}`}
                                                  canEdit={canEdit}
                                                  canArchive={canAdminister}
                                                  onEdit={() =>
                                                    setEdit({
                                                      kind: "section",
                                                      id: section.id,
                                                      name: section.name,
                                                      order: "0",
                                                      parentId: section.grade_id,
                                                      capacity: section.capacity?.toString() ?? "",
                                                    })
                                                  }
                                                  status={section.status}
                                                  onArchive={() =>
                                                    toggleArchive(
                                                      "section",
                                                      section.id,
                                                      section.status,
                                                    )
                                                  }
                                                />
                                              ) : null}
                                              {section.status === "archived" && canAdminister ? (
                                                <IconActions
                                                  label={`إجراءات ${grade.name} - ${section.name}`}
                                                  canEdit={canEdit}
                                                  canArchive={canAdminister}
                                                  status="archived"
                                                  onArchive={() =>
                                                    toggleArchive(
                                                      "section",
                                                      section.id,
                                                      section.status,
                                                    )
                                                  }
                                                />
                                              ) : null}
                                            </div>
                                          </div>
                                          <dl className="mt-1.5 grid grid-cols-2 gap-2 text-xs">
                                            <div>
                                              <dt className="text-muted-foreground">
                                                المسجلون / السعة
                                              </dt>
                                              <dd dir="ltr" className="tnum text-right font-medium">
                                                {enrolled ?? "—"} /{" "}
                                                {section.capacity ?? "غير محددة"}
                                              </dd>
                                            </div>
                                            <div>
                                              <dt className="text-muted-foreground">مقاعد متاحة</dt>
                                              <dd
                                                className={`tnum font-medium ${available === 0 ? "text-destructive" : ""}`}
                                              >
                                                {section.capacity === null
                                                  ? "غير محددة"
                                                  : (available ?? "—")}
                                              </dd>
                                            </div>
                                          </dl>
                                          <div className="mt-2 space-y-1">
                                            <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                                              <span>
                                                {overCapacity ? "تجاوز السعة" : "الإشغال"}
                                              </span>
                                              <span className="tnum">
                                                {occupancy === null ? "—" : `${occupancy}%`}
                                              </span>
                                            </div>
                                            {occupancy !== null ? (
                                              <div
                                                role="progressbar"
                                                aria-label={`إشغال ${grade.name} - ${section.name}`}
                                                aria-valuemin={0}
                                                aria-valuemax={100}
                                                aria-valuenow={Math.min(occupancy, 100)}
                                                aria-valuetext={`${enrolled} من ${section.capacity} (${occupancy}%)`}
                                                className="h-1.5 overflow-hidden rounded-full bg-secondary"
                                              >
                                                <div
                                                  className={`h-full rounded-full ${available === 0 ? "bg-destructive" : "bg-primary"}`}
                                                  style={{ width: `${Math.min(occupancy, 100)}%` }}
                                                />
                                              </div>
                                            ) : (
                                              <div
                                                aria-hidden="true"
                                                className="h-1.5 rounded-full bg-secondary"
                                              />
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </>
      )}

      {edit ? (
        <Modal
          open
          onOpenChange={(o) => !o && setEdit(null)}
          title={`${edit.id ? "تعديل" : "إضافة"} ${KIND_LABEL[edit.kind]}`}
          footer={
            <>
              <Button onClick={save}>حفظ</Button>
              <Button variant="outline" onClick={() => setEdit(null)}>
                إلغاء
              </Button>
            </>
          }
        >
          <TextField
            label="الاسم"
            value={edit.name}
            onChange={(v) => setEdit({ ...edit, name: v })}
            required
          />
          {edit.kind === "grade" ? (
            <FormField label="المرحلة" required>
              {(p) => (
                <Select
                  value={edit.parentId}
                  onValueChange={(v) => setEdit({ ...edit, parentId: v })}
                >
                  <SelectTrigger id={p.id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(structure.data?.stages ?? [])
                      .filter((s) => s.status === "active")
                      .map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          ) : null}
          {edit.kind !== "section" ? (
            <TextField
              label="الترتيب"
              type="number"
              value={edit.order}
              onChange={(v) => setEdit({ ...edit, order: v })}
            />
          ) : (
            <TextField
              label="السعة (اختياري)"
              type="number"
              value={edit.capacity}
              onChange={(v) => setEdit({ ...edit, capacity: v })}
            />
          )}
        </Modal>
      ) : null}
    </AppShell>
  );
}

function IconActions({
  label,
  onEdit,
  onArchive,
  status,
  canEdit,
  canArchive,
}: {
  label: string;
  onEdit?: () => void;
  onArchive: () => void;
  status: string;
  canEdit: boolean;
  canArchive: boolean;
}) {
  if ((!onEdit || !canEdit) && !canArchive) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0"
          aria-label={label}
          title={label}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onEdit && canEdit ? (
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil className="size-4" /> تعديل
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem disabled={!canArchive} onSelect={onArchive}>
          {status === "active" ? (
            <Archive className="size-4" />
          ) : (
            <ArchiveRestore className="size-4" />
          )}
          {status === "active" ? "أرشفة" : "استعادة"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
