import { userError } from "@/lib/user-error";
import type { StatusTone } from "@/components/app/status-badge";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Tables } from "@/integrations/supabase/types";
import { canManageStaff, canViewStaff, type EmployeeRow } from "@/lib/staff";

export type StudentAttendanceStatus = Database["public"]["Enums"]["student_attendance_status"];
export type StaffAttendanceStatus = Database["public"]["Enums"]["staff_attendance_status"];
export type StudentAttendance = Tables<"student_attendance">;
export type StaffAttendance = Tables<"staff_attendance">;
export type Stage = Tables<"stages">;
export type Grade = Tables<"grades">;
export type Section = Tables<"sections">;

export type AttendanceStudent = {
  id: string;
  full_name: string;
  student_number: string;
};

export type AttendanceEnrollment = {
  id: string;
  student_id: string;
  grade_id: string;
  section_id: string | null;
  student: AttendanceStudent;
};

export type StudentAttendanceSetup = {
  stages: Stage[];
  grades: Grade[];
  sections: Section[];
  enrollments: AttendanceEnrollment[];
};

export type StaffAttendanceSetup = {
  employees: EmployeeRow[];
};

export const STUDENT_ATTENDANCE_STATUS: Record<
  StudentAttendanceStatus,
  { label: string; tone: StatusTone }
> = {
  present: { label: "حاضر", tone: "success" },
  absent: { label: "غائب", tone: "danger" },
  late: { label: "متأخر", tone: "warning" },
  excused: { label: "بعذر", tone: "info" },
};

export const STAFF_ATTENDANCE_STATUS: Record<
  StaffAttendanceStatus,
  { label: string; tone: StatusTone }
> = {
  present: { label: "حاضر", tone: "success" },
  absent: { label: "غائب", tone: "danger" },
  late: { label: "متأخر", tone: "warning" },
  leave: { label: "إجازة", tone: "info" },
};

const STUDENT_ATTENDANCE_MANAGERS = [
  "super_admin",
  "school_owner",
  "school_manager",
  "registrar",
  "teacher",
];
const STUDENT_ATTENDANCE_VIEWERS = [...STUDENT_ATTENDANCE_MANAGERS, "accountant"];

export const canManageStudentAttendance = (roles: string[]) =>
  roles.some((role) => STUDENT_ATTENDANCE_MANAGERS.includes(role));
export const canViewStudentAttendance = (roles: string[]) =>
  roles.some((role) => STUDENT_ATTENDANCE_VIEWERS.includes(role));
export { canManageStaff as canManageStaffAttendance, canViewStaff as canViewStaffAttendance };

export const studentAttendanceSetupKey = (schoolId?: string, yearId?: string) =>
  ["student-attendance-setup", schoolId, yearId] as const;
export const studentAttendanceDayKey = (schoolId?: string, yearId?: string, date?: string) =>
  ["student-attendance-day", schoolId, yearId, date] as const;
export const staffAttendanceSetupKey = (schoolId?: string) =>
  ["staff-attendance-setup", schoolId] as const;
export const staffAttendanceDayKey = (schoolId?: string, date?: string) =>
  ["staff-attendance-day", schoolId, date] as const;

export const todayISO = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export async function fetchStudentAttendanceSetup(
  schoolId: string,
  yearId: string,
): Promise<StudentAttendanceSetup> {
  const [stages, grades, sections, enrollments] = await Promise.all([
    supabase
      .from("stages")
      .select("*")
      .eq("school_id", schoolId)
      .eq("status", "active")
      .order("order_index"),
    supabase
      .from("grades")
      .select("*")
      .eq("school_id", schoolId)
      .eq("status", "active")
      .order("order_index"),
    supabase
      .from("sections")
      .select("*")
      .eq("school_id", schoolId)
      .eq("academic_year_id", yearId)
      .eq("status", "active")
      .order("name"),
    supabase
      .from("student_enrollments")
      .select(
        "id, student_id, grade_id, section_id, student:students!inner(id, full_name, student_number)",
      )
      .eq("school_id", schoolId)
      .eq("academic_year_id", yearId)
      .eq("enrollment_status", "active")
      .eq("student.status", "active"),
  ]);
  for (const result of [stages, grades, sections, enrollments]) {
    if (result.error) throw result.error;
  }
  return {
    stages: stages.data ?? [],
    grades: grades.data ?? [],
    sections: sections.data ?? [],
    enrollments: (enrollments.data ?? []) as unknown as AttendanceEnrollment[],
  };
}

export async function fetchStudentAttendanceDay(
  schoolId: string,
  yearId: string,
  date: string,
): Promise<StudentAttendance[]> {
  const { data, error } = await supabase
    .from("student_attendance")
    .select("*")
    .eq("school_id", schoolId)
    .eq("academic_year_id", yearId)
    .eq("attendance_date", date);
  if (error) throw error;
  return data ?? [];
}

export async function fetchStaffAttendanceSetup(schoolId: string): Promise<StaffAttendanceSetup> {
  const { data, error } = await supabase
    .from("employees")
    .select("*, department:departments(name)")
    .eq("school_id", schoolId)
    .eq("status", "active")
    .order("full_name");
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<
    Tables<"employees"> & { department: { name: string } | null }
  >;
  return {
    employees: rows.map(({ department, ...employee }) => ({
      ...employee,
      department_name: department?.name ?? null,
    })),
  };
}

export async function fetchStaffAttendanceDay(
  schoolId: string,
  date: string,
): Promise<StaffAttendance[]> {
  const { data, error } = await supabase
    .from("staff_attendance")
    .select("*")
    .eq("school_id", schoolId)
    .eq("attendance_date", date);
  if (error) throw error;
  return data ?? [];
}

export function attendanceSummary<T extends string>(statuses: Array<T | null | undefined>) {
  const counts = new Map<T, number>();
  for (const status of statuses) {
    if (status) counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  const recorded = [...counts.values()].reduce((sum, count) => sum + count, 0);
  const attending = (counts.get("present" as T) ?? 0) + (counts.get("late" as T) ?? 0);
  return {
    counts,
    recorded,
    percentage: recorded ? Math.round((attending / recorded) * 100) : null,
  };
}

export function attendanceError(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message: string }).message);
    if (message.includes("row-level security") || message.includes("permission denied")) {
      return "ليست لديك صلاحية لتسجيل الحضور لهذه المجموعة.";
    }
    if (message.includes("تسجيل الطالب"))
      return "تعذر الحفظ لأن تسجيل أحد الطلاب لا يطابق السنة أو المدرسة.";
    if (message.includes("تاريخ الحضور")) return userError(error);
    return userError(error);
  }
  return "حدث خطأ غير متوقع.";
}
