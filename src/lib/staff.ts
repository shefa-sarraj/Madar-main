import { completeQueries } from "@/lib/supabase-read";
import { userError } from "@/lib/user-error";
import type { StatusTone } from "@/components/app/status-badge";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Department = Tables<"departments">;
export type Employee = Tables<"employees">;

export type EmployeeRow = Employee & {
  department_name: string | null;
};

export type StaffData = {
  employees: EmployeeRow[];
  departments: Department[];
};

export const EMPLOYMENT_TYPE: Record<string, string> = {
  full_time: "دوام كامل",
  part_time: "دوام جزئي",
  contract: "عقد",
  temporary: "مؤقت",
};

export const EMPLOYEE_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  active: { label: "فعال", tone: "success" },
  inactive: { label: "غير فعال", tone: "neutral" },
  on_leave: { label: "في إجازة", tone: "warning" },
  terminated: { label: "منتهية خدمته", tone: "danger" },
};

export const GENDER_LABEL: Record<string, string> = {
  male: "ذكر",
  female: "أنثى",
};

const STAFF_MANAGERS = ["super_admin", "school_owner", "school_manager", "hr"];
const STAFF_VIEWERS = [...STAFF_MANAGERS, "accountant", "registrar"];

export const canManageStaff = (roles: string[]) =>
  roles.some((role) => STAFF_MANAGERS.includes(role));
export const canViewStaff = (roles: string[]) => roles.some((role) => STAFF_VIEWERS.includes(role));

export const staffKey = (schoolId?: string) => ["staff", schoolId] as const;

export async function fetchStaff(schoolId: string, client = supabase): Promise<StaffData> {
  const [employees, departments] = await completeQueries([
    client
      .from("employees")
      .select("*, department:departments(name)")
      .eq("school_id", schoolId)
      .order("full_name"),
    client.from("departments").select("*").eq("school_id", schoolId).order("name"),
  ]);
  if (employees.error) throw employees.error;
  if (departments.error) throw departments.error;

  const rows = (employees.data ?? []) as unknown as Array<
    Employee & { department: { name: string } | null }
  >;
  return {
    employees: rows.map(({ department, ...employee }) => ({
      ...employee,
      department_name: department?.name ?? null,
    })),
    departments: departments.data ?? [],
  };
}

export function computeStaffSummary(employees: EmployeeRow[]) {
  const active = employees.filter((employee) => employee.status === "active");
  return {
    total: employees.length,
    active: active.length,
    teachers: active.filter((employee) => employee.is_teacher).length,
    administrative: active.filter((employee) => !employee.is_teacher).length,
  };
}

export function staffError(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message: string }).message);
    if (message.includes("row-level security") || message.includes("permission denied")) {
      return "ليست لديك صلاحية لتنفيذ هذا الإجراء.";
    }
    if (message.includes("employees_school_national_id_idx")) return "رقم الهوية مستخدم لموظف آخر.";
    if (message.includes("employees_school_id_employee_number_key"))
      return "الرقم الوظيفي مستخدم بالفعل.";
    if (message.includes("departments_school_id_name_key")) return "يوجد قسم بهذا الاسم بالفعل.";
    return userError(error);
  }
  return "حدث خطأ غير متوقع.";
}
