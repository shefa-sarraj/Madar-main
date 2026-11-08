import { userError } from "@/lib/user-error";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";

export type Role = Exclude<Database["public"]["Enums"]["app_role"], "super_admin">;
export type MemberStatus = Database["public"]["Enums"]["member_status"];
export type SchoolProfile = Database["public"]["Tables"]["schools"]["Row"];
export type SchoolSettings = Database["public"]["Tables"]["school_settings"]["Row"];
export type Year = Database["public"]["Tables"]["academic_years"]["Row"];
export type Member = {
  user_id: string;
  status: MemberStatus;
  full_name: string;
  phone: string | null;
  roles: Role[];
  custom_roles: string[];
};
export const MODULES = [
  ["students", "الطلاب"],
  ["admissions", "القبول"],
  ["classes", "الصفوف والشعب"],
  ["fees", "الرسوم والتحصيل"],
  ["expenses", "المصروفات"],
  ["student_attendance", "حضور الطلاب"],
  ["staff_attendance", "حضور الموظفين"],
  ["employees", "الموظفون"],
  ["inventory", "المخزون"],
  ["assets", "الأصول"],
  ["tasks", "المهام"],
  ["cases", "الحالات"],
  ["reports", "التقارير"],
  ["settings", "الإعدادات"],
  ["users", "المستخدمون والأدوار"],
] as const;
export type Module = (typeof MODULES)[number][0];
export type Permission = {
  module: Module;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_manage: boolean;
};
export type CustomRole = {
  id: string;
  school_id: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
};
export type RolePermission = Permission & { role_id: string; school_id: string };
export type CustomAssignment = { school_id: string; user_id: string; role_id: string };
type ScopedTable<T> = { Row: T; Insert: T; Update: Partial<T>; Relationships: [] };
type SettingsDatabase = Database & {
  public: {
    Tables: {
      school_system_role_permissions: ScopedTable<Permission & { school_id: string; role: Role }>;
      school_roles: ScopedTable<CustomRole>;
      school_role_permissions: ScopedTable<RolePermission>;
      school_user_custom_roles: ScopedTable<CustomAssignment>;
    };
    Functions: {
      settings_my_system_permissions: { Args: { _school_id: string }; Returns: Json };
      settings_save_system_role: {
        Args: { _school_id: string; _role: Role; _permissions: Json };
        Returns: undefined;
      };
      can_access_reports: { Args: { _school_id: string }; Returns: boolean };
      settings_save_member_roles: {
        Args: {
          _school_id: string;
          _user_id: string;
          _roles: Role[];
          _custom_roles: string[];
          _status: MemberStatus;
          _create?: boolean;
        };
        Returns: undefined;
      };
      settings_save_role: {
        Args: {
          _school_id: string;
          _id: string | null;
          _name: string;
          _description: string;
          _active: boolean;
          _permissions: Json;
        };
        Returns: string;
      };
      settings_save_member: {
        Args: { _school_id: string; _user_id: string; _roles: Role[]; _status: MemberStatus };
        Returns: undefined;
      };
      settings_save_year: {
        Args: {
          _school_id: string;
          _id: string | null;
          _name: string;
          _start: string;
          _end: string;
          _status: Year["status"];
          _active: boolean;
        };
        Returns: undefined;
      };
      settings_save_school: {
        Args: { _school_id: string; _profile: Json; _settings: Json };
        Returns: undefined;
      };
      settings_find_auth_user: { Args: { _email: string }; Returns: string | null };
    };
  };
};
export const settingsClient = (client: SupabaseClient<Database> = supabase) =>
  client as unknown as SupabaseClient<SettingsDatabase>;
export const MEMBER_LABELS = { active: "نشط", invited: "مدعو", suspended: "موقوف" };
export const YEAR_LABELS = { planned: "مخطط", active: "نشط", closed: "مغلق" };
export const SCHOOL_ROLES: Role[] = [
  "school_owner",
  "school_manager",
  "accountant",
  "registrar",
  "hr",
  "teacher",
  "store_keeper",
];
export const ROLE_SCOPE: Record<string, string> = {
  super_admin: "إدارة النظام والمدارس",
  school_owner: "إعدادات المدرسة والمستخدمون والأدوار وجميع الوحدات",
  school_manager: "إعدادات المدرسة وجميع الوحدات؛ عرض المستخدمين والأدوار",
  accountant: "إدارة المالية؛ عرض الطلاب والموظفين والمخزون والأصول؛ المهام",
  registrar:
    "إدارة الطلاب والقبول والحضور؛ عرض المالية والموظفين؛ المهام والحالات المرتبطة بالطلاب",
  hr: "إدارة الموظفين وحضورهم؛ عرض الأصول؛ المهام والحالات المرتبطة بالموظفين",
  teacher:
    "عرض الصفوف والحضور؛ تسجيل حضور الشعب المسندة؛ المهام المسندة والحالات ضمن الشعب المسندة",
  store_keeper: "إدارة المخزون والأصول؛ المهام",
};
export async function fetchSettings(schoolId: string, manage: boolean) {
  const [school, settings, years, members, roles, customRoles, permissions, assignments] =
    await Promise.all([
      supabase.from("schools").select("*").eq("id", schoolId).single(),
      supabase.from("school_settings").select("*").eq("school_id", schoolId).maybeSingle(),
      supabase
        .from("academic_years")
        .select("*")
        .eq("school_id", schoolId)
        .order("start_date", { ascending: false }),
      manage
        ? supabase.from("school_members").select("user_id,status").eq("school_id", schoolId)
        : Promise.resolve({ data: [], error: null }),
      manage
        ? supabase.from("user_roles").select("user_id,role").eq("school_id", schoolId)
        : Promise.resolve({ data: [], error: null }),
      settingsClient().from("school_roles").select("*").eq("school_id", schoolId).order("name"),
      settingsClient().from("school_role_permissions").select("*").eq("school_id", schoolId),
      settingsClient().from("school_user_custom_roles").select("*").eq("school_id", schoolId),
    ]);
  for (const result of [
    school,
    settings,
    years,
    members,
    roles,
    customRoles,
    permissions,
    assignments,
  ])
    if (result.error) throw result.error;
  const ids = (members.data ?? []).map((m) => m.user_id);
  const profiles = ids.length
    ? await supabase.from("profiles").select("id,full_name,phone").in("id", ids)
    : { data: [], error: null };
  if (profiles.error) throw profiles.error;
  return {
    school: school.data!,
    settings: settings.data,
    years: years.data ?? [],
    customRoles: customRoles.data ?? [],
    permissions: permissions.data ?? [],
    members: (members.data ?? []).map((m) => ({
      ...m,
      full_name: profiles.data?.find((p) => p.id === m.user_id)?.full_name || m.user_id,
      phone: profiles.data?.find((p) => p.id === m.user_id)?.phone ?? null,
      roles: (roles.data ?? []).filter((r) => r.user_id === m.user_id).map((r) => r.role),
      custom_roles: (assignments.data ?? [])
        .filter((r) => r.user_id === m.user_id)
        .map((r) => r.role_id),
    })) as Member[],
  };
}
export function settingsError(error: unknown) {
  return userError(error, "تعذر حفظ التغييرات. تحقق من البيانات وحاول مرة أخرى.");
}
