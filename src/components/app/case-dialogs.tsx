import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, MessageSquarePlus, Save, Send } from "lucide-react";
import { toast } from "sonner";

import { AppDrawer } from "@/components/app/drawer";
import { FormField } from "@/components/app/form-field";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import {
  CASE_CATEGORIES,
  CASE_PRIORITIES,
  CASE_STATUSES,
  CASE_TYPES,
  caseError,
  type CaseAssignee,
  type CaseComment,
  type CaseOption,
  type CasePriority,
  type CaseRow,
  type CaseStatus,
  type CaseType,
} from "@/lib/cases";

const NONE = "__none__";

export function CaseDrawer({
  open,
  onOpenChange,
  schoolId,
  academicYearId,
  item,
  canEditDetails,
  students,
  guardians,
  employees,
  assignees,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string;
  academicYearId?: string;
  item: CaseRow | null;
  canEditDetails: boolean;
  students: CaseOption[];
  guardians: CaseOption[];
  employees: CaseOption[];
  assignees: CaseAssignee[];
  onSaved: () => void;
}) {
  const [step, setStep] = useState(0);
  const [relation, setRelation] = useState(NONE);
  const [type, setType] = useState<CaseType>("complaint");
  const [category, setCategory] = useState(CASE_CATEGORIES[0]!);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<CasePriority>("medium");
  const [status, setStatus] = useState<CaseStatus>("new");
  const [studentId, setStudentId] = useState(NONE);
  const [guardianId, setGuardianId] = useState(NONE);
  const [employeeId, setEmployeeId] = useState(NONE);
  const [assignee, setAssignee] = useState(NONE);
  const [submittedName, setSubmittedName] = useState("");
  const [submittedPhone, setSubmittedPhone] = useState("");
  const [resolution, setResolution] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setStep(canEditDetails ? 0 : 1);
    setRelation(
      item?.student_id
        ? "student"
        : item?.guardian_id
          ? "guardian"
          : item?.employee_id
            ? "employee"
            : NONE,
    );
    setType(item?.type ?? "complaint");
    setCategory(item?.category ?? CASE_CATEGORIES[0]!);
    setTitle(item?.title ?? "");
    setDescription(item?.description ?? "");
    setPriority(item?.priority ?? "medium");
    setStatus(item?.status ?? "new");
    setStudentId(item?.student_id ?? NONE);
    setGuardianId(item?.guardian_id ?? NONE);
    setEmployeeId(item?.employee_id ?? NONE);
    setAssignee(
      item?.assigned_to_user_id
        ? `user:${item.assigned_to_user_id}`
        : item?.assigned_to_employee_id
          ? `employee:${item.assigned_to_employee_id}`
          : NONE,
    );
    setSubmittedName(item?.submitted_by_name ?? "");
    setSubmittedPhone(item?.submitted_by_phone ?? "");
    setResolution(item?.resolution ?? "");
    setError("");
  }, [open, item, canEditDetails]);

  function nextStep() {
    if (!title.trim() || !description.trim() || !category.trim()) {
      setError("أدخل العنوان والوصف والتصنيف.");
      return;
    }
    setError("");
    setStep(1);
  }
  const relations = [
    {
      type: "student",
      label: "الطالب المرتبط",
      value: studentId,
      setValue: setStudentId,
      options: students,
      currentName: item?.student_name,
    },
    {
      type: "guardian",
      label: "ولي الأمر المرتبط",
      value: guardianId,
      setValue: setGuardianId,
      options: guardians,
      currentName: item?.guardian_name,
    },
    {
      type: "employee",
      label: "الموظف المرتبط",
      value: employeeId,
      setValue: setEmployeeId,
      options: employees,
      currentName: item?.employee_name,
    },
  ];
  async function save() {
    if (!title.trim() || !description.trim() || !category.trim()) {
      setError("أدخل العنوان والوصف والتصنيف.");
      if (canEditDetails) setStep(0);
      return;
    }
    if (["resolved", "closed"].includes(status) && !resolution.trim()) {
      setError("أدخل ملخص الحل قبل إنهاء الحالة.");
      return;
    }
    const [assigneeKind, assigneeId] = assignee === NONE ? [null, null] : assignee.split(":");
    const workflow = { status, resolution: resolution.trim() || null };
    const payload = canEditDetails
      ? {
          ...workflow,
          type,
          category: category.trim(),
          title: title.trim(),
          description: description.trim(),
          priority,
          student_id: studentId === NONE ? null : studentId,
          guardian_id: guardianId === NONE ? null : guardianId,
          employee_id: employeeId === NONE ? null : employeeId,
          assigned_to_user_id: assigneeKind === "user" ? assigneeId : null,
          assigned_to_employee_id: assigneeKind === "employee" ? assigneeId : null,
          submitted_by_name: submittedName.trim() || null,
          submitted_by_phone: submittedPhone.trim() || null,
          academic_year_id: academicYearId ?? null,
        }
      : workflow;
    setBusy(true);
    const result = item
      ? await supabase.from("cases").update(payload).eq("id", item.id).eq("school_id", schoolId)
      : await supabase.from("cases").insert({ ...payload, school_id: schoolId } as never);
    setBusy(false);
    if (result.error) {
      const message = caseError(result.error);
      setError(message);
      toast.error(message);
      return;
    }
    toast.success(item ? "تم تحديث الحالة" : "تم إنشاء الحالة");
    onOpenChange(false);
    onSaved();
  }

  return (
    <AppDrawer
      open={open}
      onOpenChange={onOpenChange}
      side="left"
      title={item ? `تحديث ${item.case_number}` : "حالة جديدة"}
      description={
        canEditDetails
          ? "سجل داخلي حساس للمتابعة ضمن صلاحيات المدرسة."
          : "يمكنك تحديث سير الحالة المسندة إليك."
      }
      footer={
        <div className="flex w-full gap-2">
          {canEditDetails && step === 1 ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setStep(0);
                setError("");
              }}
            >
              <ArrowRight className="size-4" />
              السابق
            </Button>
          ) : null}
          {canEditDetails && step === 0 ? (
            <Button className="flex-1" onClick={nextStep}>
              التالي
              <ArrowLeft className="size-4" />
            </Button>
          ) : (
            <Button className="flex-1" disabled={busy} onClick={() => void save()}>
              <Save className="size-4" />
              {busy ? "جارٍ الحفظ..." : "حفظ الحالة"}
            </Button>
          )}
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
        </div>
      }
    >
      {canEditDetails ? (
        <ol aria-label="خطوات الحالة" className="grid grid-cols-2 gap-3 text-xs">
          {["بيانات الحالة", "الارتباط والمراجعة"].map((label, index) => (
            <li
              key={label}
              aria-current={index === step ? "step" : undefined}
              className={`border-b-2 pb-2 ${index === step ? "border-primary font-semibold text-foreground" : "border-border text-muted-foreground"}`}
            >
              {index + 1}. {label}
            </li>
          ))}
        </ol>
      ) : null}
      {canEditDetails ? (
        <>
          <div hidden={step !== 0} className="space-y-4">
            <h2 className="text-sm font-semibold">بيانات الحالة</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="النوع"
                value={type}
                onChange={(v) => setType(v as CaseType)}
                options={Object.entries(CASE_TYPES).map(([v, x]) => [v, x.label])}
              />
              <SelectField
                label="الأولوية"
                value={priority}
                onChange={(v) => setPriority(v as CasePriority)}
                options={Object.entries(CASE_PRIORITIES).map(([v, x]) => [v, x.label])}
              />
            </div>
            <FormField label="التصنيف" required>
              {(props) => (
                <Input
                  {...props}
                  list="case-categories"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
              )}
            </FormField>
            <datalist id="case-categories">
              {CASE_CATEGORIES.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
            <FormField label="العنوان" required error={error}>
              {(props) => (
                <Input
                  {...props}
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setError("");
                  }}
                />
              )}
            </FormField>
            <FormField label="الوصف" required>
              {(props) => (
                <Textarea
                  {...props}
                  rows={5}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              )}
            </FormField>
          </div>
          <div hidden={step !== 1} className="space-y-4">
            <h2 className="text-sm font-semibold">الارتباط والإسناد</h2>
            <SelectField
              label="إضافة أو تعديل ارتباط"
              value={relation}
              onChange={setRelation}
              options={[
                [NONE, "اختر نوع الارتباط"],
                ["student", "طالب"],
                ["guardian", "ولي أمر"],
                ["employee", "موظف"],
              ]}
            />
            {relations
              .filter((link) => link.type === relation)
              .map((link) => (
                <OptionField
                  key={link.type}
                  label={link.label}
                  value={link.value}
                  onChange={link.setValue}
                  options={
                    link.value !== NONE && !link.options.some((option) => option.id === link.value)
                      ? [
                          ...link.options,
                          {
                            id: link.value,
                            name: link.currentName ?? "الارتباط الحالي",
                            detail: null,
                          },
                        ]
                      : link.options
                  }
                />
              ))}
            {relations.some((link) => link.value !== NONE) ? (
              <div className="space-y-1 border-s-2 border-primary/25 ps-3">
                {relations
                  .filter((link) => link.value !== NONE)
                  .map((link) => (
                    <button
                      type="button"
                      key={link.type}
                      className="block max-w-full break-words text-start text-xs text-muted-foreground hover:underline"
                      onClick={() => setRelation(link.type)}
                    >
                      {link.label}:{" "}
                      {link.options.find((option) => option.id === link.value)?.name ??
                        link.currentName ??
                        "سجل مرتبط"}
                    </button>
                  ))}
              </div>
            ) : null}
            <div className="grid gap-4">
              <FormField label="المسند إليه">
                {(props) => (
                  <Select value={assignee} onValueChange={setAssignee}>
                    <SelectTrigger id={props.id}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>بدون إسناد</SelectItem>
                      {assignees
                        .filter((x) => x.active)
                        .map((x) => (
                          <SelectItem key={`${x.kind}:${x.id}`} value={`${x.kind}:${x.id}`}>
                            {x.name} · {x.kind === "user" ? "حساب" : x.detail}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="اسم مقدم البلاغ">
                {(props) => (
                  <Input
                    {...props}
                    value={submittedName}
                    onChange={(e) => setSubmittedName(e.target.value)}
                  />
                )}
              </FormField>
              <FormField label="هاتف مقدم البلاغ">
                {(props) => (
                  <Input
                    {...props}
                    dir="ltr"
                    value={submittedPhone}
                    onChange={(e) => setSubmittedPhone(e.target.value)}
                  />
                )}
              </FormField>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-md border border-border bg-secondary/40 p-3">
          <p className="font-medium">{item?.title}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
            {item?.description}
          </p>
        </div>
      )}
      <div hidden={canEditDetails && step !== 1} className="space-y-4">
        <h2 className="border-t border-border pt-3 text-sm font-semibold">سير الحالة</h2>
        <SelectField
          label="الحالة"
          value={status}
          onChange={(v) => setStatus(v as CaseStatus)}
          options={Object.entries(CASE_STATUSES).map(([v, x]) => [v, x.label])}
        />
        {["resolved", "closed"].includes(status) ? (
          <FormField label="ملخص الحل" required error={error}>
            {(props) => (
              <Textarea
                {...props}
                rows={4}
                value={resolution}
                onChange={(e) => {
                  setResolution(e.target.value);
                  setError("");
                }}
              />
            )}
          </FormField>
        ) : null}
        {canEditDetails ? (
          <section aria-label="مراجعة الحالة" className="border-t border-border pt-3">
            <h2 className="mb-2 text-sm font-semibold">مراجعة قبل الحفظ</h2>
            <p className="break-words text-sm font-medium">{title}</p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
              {description}
            </p>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
              {[
                ["رقم الحالة", item?.case_number ?? "يُولّد عند الحفظ"],
                ["النوع", CASE_TYPES[type].label],
                ["التصنيف", category],
                ["الأولوية", CASE_PRIORITIES[priority].label],
                ["الحالة", CASE_STATUSES[status].label],
                [
                  "المسند إليه",
                  assignee === NONE
                    ? "بدون إسناد"
                    : (assignees.find((option) => `${option.kind}:${option.id}` === assignee)
                        ?.name ??
                      item?.assigned_name ??
                      "بدون إسناد"),
                ],
                ...relations
                  .filter((link) => link.value !== NONE)
                  .map((link) => [
                    link.label,
                    link.options.find((option) => option.id === link.value)?.name ??
                      link.currentName ??
                      "سجل مرتبط",
                  ]),
                ["مقدم البلاغ", submittedName || "—"],
                ["هاتف مقدم البلاغ", submittedPhone || "—"],
              ].map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="min-w-0 break-words">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
        {error && (canEditDetails ? step === 1 : true) ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </AppDrawer>
  );
}

export function CaseDetailsDrawer({
  item,
  comments,
  open,
  onOpenChange,
  onSaved,
}: {
  item: CaseRow | null;
  comments: CaseComment[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { roles, can } = useWorkspace();
  const canComment = can("cases", "create", roles.length > 0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setComment("");
  }, [open, item?.id]);
  async function addComment() {
    if (!item || !canComment || !comment.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("case_comments").insert({
      school_id: item.school_id,
      case_id: item.id,
      comment: comment.trim(),
    });
    setBusy(false);
    if (error) {
      toast.error(caseError(error));
      return;
    }
    setComment("");
    toast.success("تمت إضافة التعليق");
    onSaved();
  }
  return (
    <AppDrawer
      open={open}
      onOpenChange={onOpenChange}
      side="left"
      title={item?.case_number ?? "تفاصيل الحالة"}
      description={item?.title}
      footer={
        <div className="flex w-full gap-2">
          <Button
            className="flex-1"
            disabled={!canComment || busy || !comment.trim()}
            onClick={() => void addComment()}
          >
            <Send className="size-4" />
            إضافة تعليق
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
        </div>
      }
    >
      {item ? (
        <div className="space-y-3 rounded-md border border-border bg-secondary/40 p-3">
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={CASE_STATUSES[item.status].tone}>
              {CASE_STATUSES[item.status].label}
            </StatusBadge>
            <StatusBadge tone={CASE_PRIORITIES[item.priority].tone}>
              {CASE_PRIORITIES[item.priority].label}
            </StatusBadge>
            <StatusBadge tone={CASE_TYPES[item.type].tone}>
              {CASE_TYPES[item.type].label}
            </StatusBadge>
          </div>
          <p className="whitespace-pre-wrap break-words text-sm">{item.description}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 border-t border-border pt-3 text-xs">
            {[
              ["التصنيف", item.category],
              ["المسند إليه", item.assigned_name ?? "بدون إسناد"],
              ...(item.student_name ? [["الطالب", item.student_name]] : []),
              ...(item.guardian_name ? [["ولي الأمر", item.guardian_name]] : []),
              ...(item.employee_name ? [["الموظف", item.employee_name]] : []),
            ].map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="min-w-0 break-words">{value}</dd>
              </div>
            ))}
          </dl>
          {item.resolution ? (
            <div className="border-t border-border pt-3">
              <p className="text-xs font-semibold text-muted-foreground">الحل</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm">{item.resolution}</p>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <MessageSquarePlus className="size-4" />
          سجل المتابعة
        </h3>
        {comments.length ? (
          comments.map((x) => (
            <article key={x.id} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="text-sm font-medium">{x.author_name}</span>
                <time className="text-xs text-muted-foreground">
                  {new Date(x.created_at).toLocaleString("ar")}
                </time>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm">{x.comment}</p>
            </article>
          ))
        ) : (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            لا توجد تعليقات داخلية بعد.
          </p>
        )}
      </div>
      <FormField label="تعليق داخلي جديد">
        {(props) => (
          <Textarea
            disabled={!canComment}
            {...props}
            rows={4}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        )}
      </FormField>
    </AppDrawer>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <FormField label={label}>
      {(props) => (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={props.id}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map(([v, l]) => (
              <SelectItem key={v} value={v}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );
}
function OptionField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: CaseOption[];
}) {
  return (
    <SelectField
      label={label}
      value={value}
      onChange={onChange}
      options={[
        [NONE, "بدون ربط"],
        ...options.map(
          (x) => [x.id, `${x.name}${x.detail ? ` · ${x.detail}` : ""}`] as [string, string],
        ),
      ]}
    />
  );
}
