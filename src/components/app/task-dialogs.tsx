import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Link2, MessageSquarePlus, Save, Send } from "lucide-react";
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
import { formatDate } from "@/lib/students";
import { useWorkspace } from "@/lib/workspace";
import {
  canManageTasks,
  isTaskOverdue,
  RELATED_TYPE_LABELS,
  TASK_PRIORITY,
  TASK_STATUS,
  taskError,
  type RelatedOption,
  type TaskAssignee,
  type TaskComment,
  type TaskPriority,
  type TaskRow,
  type TaskStatus,
} from "@/lib/tasks";

const NONE = "__none__";

export function TaskDrawer({
  open,
  onOpenChange,
  schoolId,
  academicYearId,
  task,
  assignees,
  relatedOptions,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string;
  academicYearId?: string;
  task: TaskRow | null;
  assignees: TaskAssignee[];
  relatedOptions: RelatedOption[];
  onSaved: () => void;
}) {
  const { roles, can } = useWorkspace();
  const canCancel = can("tasks", "manage", canManageTasks(roles));
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [status, setStatus] = useState<TaskStatus>("open");
  const [dueDate, setDueDate] = useState("");
  const [assignee, setAssignee] = useState(NONE);
  const [related, setRelated] = useState(NONE);
  const [contextType, setContextType] = useState(NONE);
  const [contextError, setContextError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setContextType(task?.related_entity_type ?? NONE);
    setContextError("");
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setPriority(task?.priority ?? "medium");
    setStatus(task?.status ?? "open");
    setDueDate(task?.due_date ?? "");
    setAssignee(
      task?.assigned_to_user_id
        ? `user:${task.assigned_to_user_id}`
        : task?.assigned_to_employee_id
          ? `employee:${task.assigned_to_employee_id}`
          : NONE,
    );
    setRelated(
      task?.related_entity_type && task.related_entity_id
        ? `${task.related_entity_type}:${task.related_entity_id}`
        : NONE,
    );
    setError("");
  }, [open, task]);

  const groupedRelated = useMemo(
    () =>
      Object.entries(RELATED_TYPE_LABELS).map(([type, label]) => ({
        type,
        label,
        options: relatedOptions.filter((option) => option.type === type),
      })),
    [relatedOptions],
  );

  async function save() {
    if (!title.trim()) {
      setError("أدخل عنوان المهمة.");
      return;
    }
    if (contextType !== NONE && related === NONE) {
      setContextError("اختر السجل المرتبط أو اختر بدون سياق.");
      return;
    }
    const [assigneeKind, assigneeId] = assignee === NONE ? [null, null] : assignee.split(":");
    const [relatedType, relatedId] = related === NONE ? [null, null] : related.split(":");
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      priority,
      status,
      due_date: dueDate || null,
      assigned_to_user_id: assigneeKind === "user" ? assigneeId : null,
      assigned_to_employee_id: assigneeKind === "employee" ? assigneeId : null,
      related_entity_type: relatedType,
      related_entity_id: relatedId,
      academic_year_id: academicYearId ?? null,
    };
    setBusy(true);
    const result = task
      ? await supabase.from("tasks").update(payload).eq("id", task.id).eq("school_id", schoolId)
      : await supabase.from("tasks").insert({ ...payload, school_id: schoolId });
    setBusy(false);
    if (result.error) {
      toast.error(taskError(result.error));
      return;
    }
    toast.success(task ? "تم تحديث المهمة" : "تم إنشاء المهمة");
    onOpenChange(false);
    onSaved();
  }

  return (
    <AppDrawer
      open={open}
      onOpenChange={onOpenChange}
      side="left"
      title={task ? "تعديل المهمة" : "مهمة جديدة"}
      description="متابعة تشغيلية واضحة ومحددة داخل المدرسة."
      footer={
        <div className="flex w-full gap-2">
          <Button className="flex-1" onClick={() => void save()} disabled={busy}>
            <Save className="size-4" />
            {busy ? "جارٍ الحفظ..." : "حفظ المهمة"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            إلغاء
          </Button>
        </div>
      }
    >
      <h2 className="text-sm font-semibold">بيانات المهمة</h2>
      <FormField label="عنوان المهمة" required error={error}>
        {(props) => (
          <Input
            {...props}
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setError("");
            }}
            placeholder="مثال: استكمال وثائق الطالب"
          />
        )}
      </FormField>
      <FormField label="الوصف">
        {(props) => (
          <Textarea
            {...props}
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        )}
      </FormField>
      <h2 className="border-t border-border pt-3 text-sm font-semibold">الإسناد والمتابعة</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="الأولوية">
          {(props) => (
            <Select value={priority} onValueChange={(value) => setPriority(value as TaskPriority)}>
              <SelectTrigger id={props.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TASK_PRIORITY).map(([value, item]) => (
                  <SelectItem key={value} value={value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField label="الحالة">
          {(props) => (
            <Select value={status} onValueChange={(value) => setStatus(value as TaskStatus)}>
              <SelectTrigger id={props.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TASK_STATUS)
                  .filter(
                    ([value]) => value !== "cancelled" || canCancel || task?.status === "cancelled",
                  )
                  .map(([value, item]) => (
                    <SelectItem key={value} value={value}>
                      {item.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      </div>
      <FormField label="تاريخ الاستحقاق">
        {(props) => (
          <Input
            {...props}
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        )}
      </FormField>
      <FormField label="المسند إليه">
        {(props) => (
          <Select value={assignee} onValueChange={setAssignee}>
            <SelectTrigger id={props.id}>
              <SelectValue placeholder="بدون إسناد" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>بدون إسناد</SelectItem>
              {assignees
                .filter((item) => item.active)
                .map((item) => (
                  <SelectItem key={`${item.kind}:${item.id}`} value={`${item.kind}:${item.id}`}>
                    {item.name} · {item.kind === "user" ? "حساب" : item.detail}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
      </FormField>
      <h2 className="border-t border-border pt-3 text-sm font-semibold">السياق المرتبط</h2>
      <FormField label="نوع السياق">
        {(props) => (
          <Select
            value={contextType}
            onValueChange={(value) => {
              setContextType(value);
              setRelated(NONE);
              setContextError("");
            }}
          >
            <SelectTrigger id={props.id}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>بدون سياق</SelectItem>
              {groupedRelated.map((group) => (
                <SelectItem key={group.type} value={group.type}>
                  {group.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>
      {contextType !== NONE ? (
        <FormField
          label={RELATED_TYPE_LABELS[contextType as RelatedOption["type"]] ?? "السجل المرتبط"}
          required
          error={contextError}
        >
          {(props) => (
            <Select
              value={related}
              onValueChange={(value) => {
                setRelated(value);
                setContextError("");
              }}
            >
              <SelectTrigger id={props.id} aria-invalid={props["aria-invalid"]}>
                <SelectValue placeholder="اختر السجل المرتبط" />
              </SelectTrigger>
              <SelectContent>
                {relatedOptions
                  .filter((option) => option.type === contextType)
                  .map((option) => (
                    <SelectItem key={option.id} value={`${option.type}:${option.id}`}>
                      {option.label}
                      {option.detail ? ` · ${option.detail}` : ""}
                    </SelectItem>
                  ))}
                {task?.related_entity_type === contextType &&
                related !== NONE &&
                !relatedOptions.some((option) => `${option.type}:${option.id}` === related) ? (
                  <SelectItem value={related}>
                    {task.related_label ?? "السجل المرتبط الحالي"}
                  </SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          )}
        </FormField>
      ) : null}
      {contextType !== NONE &&
      !relatedOptions.some((option) => option.type === contextType) &&
      !(task?.related_entity_type === contextType && related !== NONE) ? (
        <p role="status" className="text-xs text-muted-foreground">
          لا توجد سجلات متاحة لهذا السياق.
        </p>
      ) : null}
    </AppDrawer>
  );
}

export function TaskCommentsDrawer({
  task,
  comments,
  open,
  onOpenChange,
  onSaved,
}: {
  task: TaskRow | null;
  comments: TaskComment[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { roles, can } = useWorkspace();
  const canComment = can("tasks", "create", roles.length > 0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setComment("");
  }, [open, task?.id]);

  async function addComment() {
    if (!task || !canComment || !comment.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("task_comments").insert({
      school_id: task.school_id,
      task_id: task.id,
      comment: comment.trim(),
    });
    setBusy(false);
    if (error) {
      toast.error(taskError(error));
      return;
    }
    setComment("");
    toast.success("تمت إضافة الملاحظة");
    onSaved();
  }

  return (
    <AppDrawer
      open={open}
      onOpenChange={onOpenChange}
      side="left"
      title="تفاصيل المهمة"
      description={task?.title}
      footer={
        <div className="flex w-full gap-2">
          <Button
            className="flex-1"
            onClick={() => void addComment()}
            disabled={!canComment || busy || !comment.trim()}
          >
            <Send className="size-4" />
            {busy ? "جارٍ الإضافة..." : "إضافة ملاحظة"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
        </div>
      }
    >
      {task ? (
        <section aria-label="بيانات المهمة" className="space-y-3 border-b border-border pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={TASK_STATUS[task.status].tone}>
              {TASK_STATUS[task.status].label}
            </StatusBadge>
            <StatusBadge tone={TASK_PRIORITY[task.priority].tone}>
              {TASK_PRIORITY[task.priority].label}
            </StatusBadge>
          </div>
          {task.description ? (
            <p className="whitespace-pre-wrap break-words text-sm text-foreground">
              {task.description}
            </p>
          ) : null}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">المسند إليه</dt>
            <dd className="min-w-0 break-words">{task.assigned_name ?? "بدون إسناد"}</dd>
            <dt className="text-muted-foreground">الاستحقاق</dt>
            <dd className={isTaskOverdue(task) ? "font-medium text-destructive" : ""}>
              {formatDate(task.due_date)}
              {isTaskOverdue(task) ? " · متأخرة" : ""}
            </dd>
            <dt className="text-muted-foreground">أنشأها</dt>
            <dd className="min-w-0 break-words text-muted-foreground">
              {task.created_by_name ?? "—"}
            </dd>
          </dl>
          {task.related_entity_type ? (
            <section aria-label="السجل المرتبط" className="border-s-2 border-primary/30 ps-3">
              <h3 className="flex items-center gap-2 text-xs text-muted-foreground">
                <Link2 className="size-4 shrink-0" />
                {RELATED_TYPE_LABELS[task.related_entity_type as RelatedOption["type"]] ??
                  "السجل المرتبط"}
              </h3>
              <p className="mt-1 break-words text-sm font-medium">
                {task.related_label ?? "سجل مرتبط"}
              </p>
            </section>
          ) : null}
        </section>
      ) : null}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <MessageSquarePlus className="size-4" />
          سجل الملاحظات
        </div>
        {comments.length ? (
          comments.map((item) => (
            <article key={item.id} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">{item.author_name}</span>
                <time className="text-xs text-muted-foreground">
                  {new Date(item.created_at).toLocaleString("ar")}
                </time>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground">
                {item.comment}
              </p>
            </article>
          ))
        ) : (
          <div className="flex items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4" />
            لا توجد ملاحظات بعد.
          </div>
        )}
      </div>
      <FormField label="ملاحظة جديدة">
        {(props) => (
          <Textarea
            disabled={!canComment}
            {...props}
            rows={4}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="اكتب تحديثاً مختصراً على المهمة..."
          />
        )}
      </FormField>
    </AppDrawer>
  );
}
