import { completeQueries, completeIds } from "@/lib/supabase-read";
import type { StatusTone } from "@/components/app/status-badge";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type TaskPriority = Database["public"]["Enums"]["task_priority"];
export type TaskStatus = Database["public"]["Enums"]["task_status"];
export type TaskRecord = Database["public"]["Tables"]["tasks"]["Row"];
export type TaskCommentRecord = Database["public"]["Tables"]["task_comments"]["Row"];

export type TaskRow = TaskRecord & {
  assigned_name: string | null;
  created_by_name: string;
  related_label: string | null;
};

export type TaskComment = TaskCommentRecord & {
  author_name: string;
};

export type TaskAssignee = {
  id: string;
  kind: "user" | "employee";
  name: string;
  detail: string | null;
  active: boolean;
};

export type RelatedOption = {
  id: string;
  type: "student" | "employee" | "asset" | "inventory_item";
  label: string;
  detail: string | null;
};

export type TasksData = {
  tasks: TaskRow[];
  comments: TaskComment[];
  assignees: TaskAssignee[];
  relatedOptions: RelatedOption[];
};

export const TASK_PRIORITY: Record<TaskPriority, { label: string; tone: StatusTone }> = {
  low: { label: "منخفضة", tone: "neutral" },
  medium: { label: "متوسطة", tone: "info" },
  high: { label: "عالية", tone: "warning" },
  urgent: { label: "عاجلة", tone: "danger" },
};

export const TASK_STATUS: Record<TaskStatus, { label: string; tone: StatusTone }> = {
  open: { label: "مفتوحة", tone: "info" },
  in_progress: { label: "قيد التنفيذ", tone: "warning" },
  completed: { label: "مكتملة", tone: "success" },
  cancelled: { label: "ملغاة", tone: "neutral" },
};

export const RELATED_TYPE_LABELS: Record<RelatedOption["type"], string> = {
  student: "طالب",
  employee: "موظف",
  asset: "أصل",
  inventory_item: "صنف مخزون",
};

const TASK_MANAGERS = [
  "super_admin",
  "school_owner",
  "school_manager",
  "accountant",
  "registrar",
  "hr",
  "store_keeper",
];

export const tasksKey = (schoolId?: string) => ["tasks", schoolId] as const;
export const canManageTasks = (roles: string[]) =>
  roles.some((role) => TASK_MANAGERS.includes(role));

export function todayISO() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

export function isTaskOverdue(task: Pick<TaskRecord, "due_date" | "status">) {
  return (
    !!task.due_date &&
    task.due_date < todayISO() &&
    !["completed", "cancelled"].includes(task.status)
  );
}

export function isTaskDueSoon(task: Pick<TaskRecord, "due_date" | "status">, days = 3) {
  if (!task.due_date || ["completed", "cancelled"].includes(task.status)) return false;
  const today = new Date(`${todayISO()}T00:00:00`);
  const due = new Date(`${task.due_date}T00:00:00`);
  const difference = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  return difference >= 0 && difference <= days;
}

export function taskSummary(tasks: Pick<TaskRow, "status" | "due_date" | "completed_at">[]) {
  const month = todayISO().slice(0, 7);
  return {
    open: tasks.filter((task) => task.status === "open").length,
    inProgress: tasks.filter((task) => task.status === "in_progress").length,
    overdue: tasks.filter(isTaskOverdue).length,
    completedThisMonth: tasks.filter(
      (task) => task.status === "completed" && task.completed_at?.slice(0, 7) === month,
    ).length,
  };
}

export async function fetchTasks(
  schoolId: string,
  ids?: string[],
  client = supabase,
): Promise<TasksData> {
  let tasksQuery = client.from("tasks").select("*").eq("school_id", schoolId);
  let commentsQuery = client.from("task_comments").select("*").eq("school_id", schoolId);
  if (ids) {
    tasksQuery = tasksQuery.in("id", ids);
    commentsQuery = commentsQuery.in("task_id", ids);
  }
  const [taskResult, commentResult, memberResult, employeeResult] = await completeQueries([
    tasksQuery.order("created_at", { ascending: false }).order("id"),
    commentsQuery.order("created_at", { ascending: true }),
    client
      .from("school_members")
      .select("user_id")
      .eq("school_id", schoolId)
      .eq("status", "active"),
    client
      .from("employees")
      .select("id,full_name,employee_number,status")
      .eq("school_id", schoolId)
      .order("full_name"),
  ]);
  if (taskResult.error) throw taskResult.error;
  if (commentResult.error) throw commentResult.error;
  if (memberResult.error) throw memberResult.error;

  const rawTasks = taskResult.data ?? [];
  const rawComments = commentResult.data ?? [];
  const employees = employeeResult.error ? [] : (employeeResult.data ?? []);
  const profileIds = [
    ...new Set([
      ...(memberResult.data ?? []).map((member) => member.user_id),
      ...rawTasks.map((task) => task.created_by),
      ...rawTasks.flatMap((task) => (task.assigned_to_user_id ? [task.assigned_to_user_id] : [])),
      ...rawComments.map((comment) => comment.user_id),
    ]),
  ];
  const profileResult = profileIds.length
    ? await completeIds(profileIds, (ids) =>
        client.from("profiles").select("id,full_name").in("id", ids),
      )
    : { data: [], error: null };
  if (profileResult.error) throw profileResult.error;

  const [studentResult, assetResult, inventoryResult] = await completeQueries([
    client.from("students").select("id,full_name,student_number").eq("school_id", schoolId),
    client.from("assets").select("id,name,asset_code").eq("school_id", schoolId),
    client.from("inventory_items").select("id,name,item_code").eq("school_id", schoolId),
  ]);
  const profiles = profileResult.data ?? [];
  const profileNames = new Map(profiles.map((profile) => [profile.id, profile.full_name]));
  const employeeNames = new Map(employees.map((employee) => [employee.id, employee.full_name]));
  const relatedOptions: RelatedOption[] = [
    ...(studentResult.error
      ? []
      : (studentResult.data ?? []).map((student) => ({
          id: student.id,
          type: "student" as const,
          label: student.full_name,
          detail: student.student_number,
        }))),
    ...employees.map((employee) => ({
      id: employee.id,
      type: "employee" as const,
      label: employee.full_name,
      detail: employee.employee_number,
    })),
    ...(assetResult.error
      ? []
      : (assetResult.data ?? []).map((asset) => ({
          id: asset.id,
          type: "asset" as const,
          label: asset.name,
          detail: asset.asset_code,
        }))),
    ...(inventoryResult.error
      ? []
      : (inventoryResult.data ?? []).map((item) => ({
          id: item.id,
          type: "inventory_item" as const,
          label: item.name,
          detail: item.item_code,
        }))),
  ];
  const relatedLabels = new Map(
    relatedOptions.map((option) => [`${option.type}:${option.id}`, option.label]),
  );
  const tasks: TaskRow[] = rawTasks.map((task) => ({
    ...task,
    assigned_name: task.assigned_to_user_id
      ? (profileNames.get(task.assigned_to_user_id) ?? "مستخدم المدرسة")
      : task.assigned_to_employee_id
        ? (employeeNames.get(task.assigned_to_employee_id) ?? "موظف المدرسة")
        : null,
    created_by_name: profileNames.get(task.created_by) ?? "مستخدم المدرسة",
    related_label:
      task.related_entity_type && task.related_entity_id
        ? (relatedLabels.get(`${task.related_entity_type}:${task.related_entity_id}`) ?? null)
        : null,
  }));
  const comments: TaskComment[] = rawComments.map((comment) => ({
    ...comment,
    author_name: profileNames.get(comment.user_id) ?? "مستخدم المدرسة",
  }));
  const assignees: TaskAssignee[] = [
    ...(memberResult.data ?? []).map((member) => ({
      id: member.user_id,
      kind: "user" as const,
      name: profileNames.get(member.user_id) ?? "مستخدم المدرسة",
      detail: "حساب مستخدم",
      active: true,
    })),
    ...employees.map((employee) => ({
      id: employee.id,
      kind: "employee" as const,
      name: employee.full_name,
      detail: employee.employee_number,
      active: employee.status === "active",
    })),
  ];
  return { tasks, comments, assignees, relatedOptions };
}

export function taskError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("المستخدم المسند")) return "المستخدم المسند إليه غير فعال في المدرسة.";
  if (message.includes("الموظف المسند")) return "الموظف المسند إليه غير فعال أو لا يتبع المدرسة.";
  if (message.includes("تغيير حالة المهمة فقط")) return "يمكنك تغيير حالة المهمة المسندة إليك فقط.";
  if (message.includes("صلاحية")) return "لا تملك صلاحية تنفيذ هذا الإجراء.";
  return "تعذر حفظ المهمة. تحقق من البيانات والصلاحيات ثم أعد المحاولة.";
}
