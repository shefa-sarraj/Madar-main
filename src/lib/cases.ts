import { completeQueries, completeIds } from "@/lib/supabase-read";
import type { StatusTone } from "@/components/app/status-badge";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type CaseType = Database["public"]["Enums"]["case_type"];
export type CasePriority = Database["public"]["Enums"]["case_priority"];
export type CaseStatus = Database["public"]["Enums"]["case_status"];
export type CaseRecord = Database["public"]["Tables"]["cases"]["Row"];
export type CaseCommentRecord = Database["public"]["Tables"]["case_comments"]["Row"];

export type CaseRow = CaseRecord & {
  assigned_name: string | null;
  created_by_name: string;
  student_name: string | null;
  guardian_name: string | null;
  employee_name: string | null;
};
export type CaseComment = CaseCommentRecord & { author_name: string };
export type CaseOption = { id: string; name: string; detail: string | null };
export type CaseAssignee = CaseOption & { kind: "user" | "employee"; active: boolean };
export type CasesData = {
  cases: CaseRow[];
  comments: CaseComment[];
  students: CaseOption[];
  guardians: CaseOption[];
  employees: CaseOption[];
  assignees: CaseAssignee[];
};

export const CASE_TYPES: Record<CaseType, { label: string; tone: StatusTone }> = {
  complaint: { label: "شكوى", tone: "danger" },
  note: { label: "ملاحظة", tone: "info" },
  incident: { label: "حادثة", tone: "warning" },
  feedback: { label: "تغذية راجعة", tone: "gold" },
};
export const CASE_PRIORITIES: Record<CasePriority, { label: string; tone: StatusTone }> = {
  low: { label: "منخفضة", tone: "neutral" },
  medium: { label: "متوسطة", tone: "info" },
  high: { label: "عالية", tone: "warning" },
  urgent: { label: "عاجلة", tone: "danger" },
};
export const CASE_STATUSES: Record<CaseStatus, { label: string; tone: StatusTone }> = {
  new: { label: "جديدة", tone: "info" },
  under_review: { label: "قيد المراجعة", tone: "warning" },
  in_progress: { label: "قيد المتابعة", tone: "gold" },
  resolved: { label: "تم الحل", tone: "success" },
  closed: { label: "مغلقة", tone: "neutral" },
  rejected: { label: "مرفوضة", tone: "danger" },
};
export const CASE_CATEGORIES = [
  "سلوك طلابي",
  "خدمة أولياء الأمور",
  "شؤون موظفين",
  "مرافق وصيانة",
  "نقل مدرسي",
  "تسجيل وقبول",
  "تعليم وأكاديميات",
  "أخرى",
];

const FULL_MANAGERS = ["super_admin", "school_owner", "school_manager"];
export const casesKey = (schoolId?: string) => ["cases", schoolId] as const;
export const canManageAllCases = (roles: string[]) =>
  roles.some((role) => FULL_MANAGERS.includes(role));
export const canCreateScopedCases = (roles: string[]) =>
  roles.some((role) => [...FULL_MANAGERS, "hr", "registrar", "teacher"].includes(role));
export const canViewCases = canCreateScopedCases;
export const isUnresolvedCase = (item: Pick<CaseRecord, "status">) =>
  !["resolved", "closed", "rejected"].includes(item.status);

export function caseSummary(rows: Pick<CaseRow, "status" | "priority" | "resolved_at">[]) {
  const month = new Date().toISOString().slice(0, 7);
  return {
    newCases: rows.filter((row) => row.status === "new").length,
    active: rows.filter((row) => ["under_review", "in_progress"].includes(row.status)).length,
    highUnresolved: rows.filter(
      (row) => ["high", "urgent"].includes(row.priority) && isUnresolvedCase(row),
    ).length,
    resolvedThisMonth: rows.filter(
      (row) => row.status === "resolved" && row.resolved_at?.slice(0, 7) === month,
    ).length,
  };
}

export async function fetchCases(
  schoolId: string,
  ids?: string[],
  client = supabase,
): Promise<CasesData> {
  let casesQuery = client.from("cases").select("*").eq("school_id", schoolId);
  let commentsQuery = client.from("case_comments").select("*").eq("school_id", schoolId);
  if (ids) {
    casesQuery = casesQuery.in("id", ids);
    commentsQuery = commentsQuery.in("case_id", ids);
  }
  const [
    casesResult,
    commentsResult,
    membersResult,
    studentsResult,
    guardiansResult,
    employeesResult,
  ] = await completeQueries([
    casesQuery.order("created_at", { ascending: false }).order("id"),
    commentsQuery.order("created_at"),
    client
      .from("school_members")
      .select("user_id")
      .eq("school_id", schoolId)
      .eq("status", "active"),
    client
      .from("students")
      .select("id,full_name,student_number")
      .eq("school_id", schoolId)
      .order("full_name"),
    client
      .from("guardians")
      .select("id,full_name,phone")
      .eq("school_id", schoolId)
      .order("full_name"),
    client
      .from("employees")
      .select("id,full_name,employee_number,status")
      .eq("school_id", schoolId)
      .order("full_name"),
  ]);
  if (casesResult.error) throw casesResult.error;
  if (commentsResult.error) throw commentsResult.error;
  if (membersResult.error) throw membersResult.error;

  const rawCases = casesResult.data ?? [];
  const rawComments = commentsResult.data ?? [];
  const employeeRows = employeesResult.error ? [] : (employeesResult.data ?? []);
  const students = studentsResult.error
    ? []
    : (studentsResult.data ?? []).map((row) => ({
        id: row.id,
        name: row.full_name,
        detail: row.student_number,
      }));
  const guardians = guardiansResult.error
    ? []
    : (guardiansResult.data ?? []).map((row) => ({
        id: row.id,
        name: row.full_name,
        detail: row.phone,
      }));
  const employees = employeeRows.map((row) => ({
    id: row.id,
    name: row.full_name,
    detail: row.employee_number,
  }));
  const profileIds = [
    ...new Set([
      ...(membersResult.data ?? []).map((row) => row.user_id),
      ...rawCases.map((row) => row.created_by),
      ...rawCases.flatMap((row) => (row.assigned_to_user_id ? [row.assigned_to_user_id] : [])),
      ...rawComments.map((row) => row.user_id),
    ]),
  ];
  const profilesResult = profileIds.length
    ? await completeIds(profileIds, (ids) =>
        client.from("profiles").select("id,full_name").in("id", ids),
      )
    : { data: [], error: null };
  if (profilesResult.error) throw profilesResult.error;
  const profileNames = new Map((profilesResult.data ?? []).map((row) => [row.id, row.full_name]));
  const studentNames = new Map(students.map((row) => [row.id, row.name]));
  const guardianNames = new Map(guardians.map((row) => [row.id, row.name]));
  const employeeNames = new Map(employees.map((row) => [row.id, row.name]));

  return {
    cases: rawCases.map((row) => ({
      ...row,
      assigned_name: row.assigned_to_user_id
        ? (profileNames.get(row.assigned_to_user_id) ?? "مستخدم المدرسة")
        : row.assigned_to_employee_id
          ? (employeeNames.get(row.assigned_to_employee_id) ?? "موظف المدرسة")
          : null,
      created_by_name: profileNames.get(row.created_by) ?? "مستخدم المدرسة",
      student_name: row.student_id ? (studentNames.get(row.student_id) ?? "طالب") : null,
      guardian_name: row.guardian_id ? (guardianNames.get(row.guardian_id) ?? "ولي أمر") : null,
      employee_name: row.employee_id ? (employeeNames.get(row.employee_id) ?? "موظف") : null,
    })),
    comments: rawComments.map((row) => ({
      ...row,
      author_name: profileNames.get(row.user_id) ?? "مستخدم المدرسة",
    })),
    students,
    guardians,
    employees,
    assignees: [
      ...(membersResult.data ?? []).map((row) => ({
        id: row.user_id,
        kind: "user" as const,
        name: profileNames.get(row.user_id) ?? "مستخدم المدرسة",
        detail: "حساب مستخدم",
        active: true,
      })),
      ...employeeRows.map((row) => ({
        id: row.id,
        kind: "employee" as const,
        name: row.full_name,
        detail: row.employee_number,
        active: row.status === "active",
      })),
    ],
  };
}

export function caseError(error: { message?: string }) {
  const message = error.message ?? "";
  if (message.includes("صلاحية")) return message;
  if (message.includes("ملخص الحل")) return "أدخل ملخص الحل قبل إنهاء الحالة.";
  if (message.includes("لا يتبع المدرسة")) return message;
  return "تعذر حفظ الحالة. تحقق من البيانات وحاول مرة أخرى.";
}
