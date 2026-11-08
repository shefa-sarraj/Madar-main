import { userError } from "@/lib/user-error";
import type { StatusTone } from "@/components/app/status-badge";
import { supabase } from "@/integrations/supabase/client";

export const STUDENT_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  active: { label: "فعال", tone: "success" },
  new: { label: "جديد", tone: "info" },
  suspended: { label: "موقوف", tone: "warning" },
  withdrawn: { label: "منسحب", tone: "danger" },
  transferred: { label: "منقول", tone: "neutral" },
  graduated: { label: "متخرج", tone: "gold" },
};

export const ENROLLMENT_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  active: { label: "فعال", tone: "success" },
  pending: { label: "معلق", tone: "warning" },
  completed: { label: "مكتمل", tone: "neutral" },
  withdrawn: { label: "منسحب", tone: "danger" },
  transferred: { label: "منقول", tone: "neutral" },
};

export const ADMISSION_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  new: { label: "جديد", tone: "info" },
  under_review: { label: "قيد المراجعة", tone: "warning" },
  accepted: { label: "مقبول", tone: "success" },
  waiting: { label: "انتظار", tone: "neutral" },
  rejected: { label: "مرفوض", tone: "danger" },
  enrolled: { label: "تم التسجيل", tone: "gold" },
};

export const GENDER_LABELS: Record<string, string> = { male: "ذكر", female: "أنثى" };

export const DOCUMENT_TYPES = [
  "شهادة ميلاد",
  "هوية ولي الأمر",
  "صورة شخصية",
  "ملف سابق",
  "مستند آخر",
];

const MANAGER_ROLES = ["super_admin", "school_owner", "school_manager", "registrar"];
const VIEWER_ROLES = [...MANAGER_ROLES, "accountant"];

export function canManageStudents(roles: string[]) {
  return roles.some((role) => MANAGER_ROLES.includes(role));
}
export function canViewStudents(roles: string[]) {
  return roles.some((role) => VIEWER_ROLES.includes(role));
}
export function canManageStructure(roles: string[]) {
  return canManageStudents(roles);
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB");
}

export function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    const msg = String((error as { message: string }).message);
    if (msg.includes("row-level security")) return "ليست لديك صلاحية لتنفيذ هذا الإجراء.";
    if (msg.includes("students_school_id_student_number_key"))
      return "الرقم المدرسي مستخدم مسبقاً.";
    if (msg.includes("violates foreign key"))
      return "لا يمكن الحذف لأن السجل مرتبط بتسجيلات طلاب. استخدم الأرشفة بدلاً من ذلك.";
    if (msg.includes("student_enrollments_one_active_per_year"))
      return "للطالب تسجيل فعال في هذه السنة مسبقاً.";
    return userError(error);
  }
  return "حدث خطأ غير متوقع.";
}

export type StructureData = {
  stages: { id: string; name: string; order_index: number; status: string }[];
  grades: { id: string; stage_id: string; name: string; order_index: number; status: string }[];
  sections: {
    id: string;
    grade_id: string;
    academic_year_id: string;
    name: string;
    capacity: number | null;
    status: string;
  }[];
};

export async function fetchStructure(schoolId: string): Promise<StructureData> {
  const [stages, grades, sections] = await Promise.all([
    supabase
      .from("stages")
      .select("id, name, order_index, status")
      .eq("school_id", schoolId)
      .order("order_index"),
    supabase
      .from("grades")
      .select("id, stage_id, name, order_index, status")
      .eq("school_id", schoolId)
      .order("order_index"),
    supabase
      .from("sections")
      .select("id, grade_id, academic_year_id, name, capacity, status")
      .eq("school_id", schoolId)
      .order("name"),
  ]);
  if (stages.error) throw stages.error;
  if (grades.error) throw grades.error;
  if (sections.error) throw sections.error;
  return { stages: stages.data ?? [], grades: grades.data ?? [], sections: sections.data ?? [] };
}

export const structureKey = (schoolId: string | undefined) => ["structure", schoolId] as const;
