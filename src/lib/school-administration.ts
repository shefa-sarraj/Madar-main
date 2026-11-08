import { userError } from "@/lib/user-error";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import type { Role } from "@/lib/settings";
export type PlatformPermission = "create_school" | "manage_schools" | "manage_platform_users";
export type PlatformUser = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  permissions: PlatformPermission[];
};
export const PLATFORM_PERMISSIONS: {
  id: PlatformPermission;
  label: string;
  description: string;
}[] = [
  { id: "create_school", label: "إنشاء المدارس", description: "إنشاء مدارس جديدة على المنصة" },
  {
    id: "manage_schools",
    label: "إدارة المدارس",
    description: "تعديل المدارس وتعطيلها وتعيين مسؤوليها",
  },
  {
    id: "manage_platform_users",
    label: "إدارة مستخدمي المنصة",
    description: "منح صلاحيات المنصة أو سحبها",
  },
];
export type EmployeeLink = {
  school_id: string;
  user_id: string;
  employee_id: string;
  created_at: string;
};
type AdminDatabase = Database & {
  public: {
    Tables: {
      school_user_employee_links: {
        Row: EmployeeLink;
        Insert: EmployeeLink;
        Update: Partial<EmployeeLink>;
        Relationships: [];
      };
    };
    Functions: {
      has_platform_permission: {
        Args: { _user_id: string; _permission: PlatformPermission };
        Returns: boolean;
      };
      platform_list_users: { Args: Record<string, never>; Returns: PlatformUser[] };
      platform_save_user_permissions: {
        Args: { _user_id: string; _permissions: PlatformPermission[] };
        Returns: undefined;
      };
      platform_create_school: {
        Args: {
          _school_id: string;
          _profile: Json;
          _status: Database["public"]["Enums"]["school_status"];
        };
        Returns: string;
      };
      platform_assign_administrator: {
        Args: { _school_id: string; _user_id: string; _role: "school_owner" | "school_manager" };
        Returns: undefined;
      };
      settings_provision_school_user: {
        Args: {
          _school_id: string;
          _user_id: string;
          _roles: Role[];
          _custom_roles: string[];
          _employee_id: string | null;
        };
        Returns: undefined;
      };
      settings_remove_school_user: {
        Args: { _school_id: string; _user_id: string; _delete_auth: boolean };
        Returns: boolean;
      };
      settings_cancel_auth_deletion: { Args: { _user_id: string }; Returns: undefined };
      platform_save_school: {
        Args: {
          _school_id: string;
          _create: boolean;
          _profile: Json;
          _status: Database["public"]["Enums"]["school_status"];
          _initial_user?: string | null;
          _initial_role?: "school_owner" | "school_manager" | null;
        };
        Returns: string;
      };
      settings_link_employee: {
        Args: { _school_id: string; _user_id: string; _employee_id: string | null };
        Returns: undefined;
      };
    };
  };
};
export const schoolAdminClient = (client: SupabaseClient<Database> = supabase) =>
  client as unknown as SupabaseClient<AdminDatabase>;
export const SCHOOL_STATUS = { active: "نشطة", suspended: "موقوفة", archived: "مؤرشفة" };
export function schoolAdministrationError(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error ? String(error.message) : "";
  if (message.includes("Platform administrator required"))
    return "إدارة المدارس متاحة لمسؤول النظام فقط.";
  if (message.includes("School management permission required"))
    return "ليس لديك صلاحية إدارة هذه المدرسة.";
  if (message.includes("Invalid school profile"))
    return "تحقق من اسم المدرسة والعملة والمنطقة الزمنية.";
  if (message.includes("Employee is not in current school"))
    return "الموظف لا يتبع المدرسة الحالية.";
  if (message.includes("User is not a member")) return "المستخدم ليس عضواً في المدرسة الحالية.";
  if (message.includes("school_user_employee_links_school_id_employee_id_key"))
    return "الموظف مرتبط بمستخدم آخر في هذه المدرسة.";
  return userError(error, "تعذر حفظ التغييرات. تحقق من البيانات وحاول مرة أخرى.");
}
export async function fetchEmployeeLinks(schoolId: string) {
  const [employees, links] = await Promise.all([
    supabase
      .from("employees")
      .select("id,full_name,employee_number")
      .eq("school_id", schoolId)
      .order("full_name"),
    schoolAdminClient().from("school_user_employee_links").select("*").eq("school_id", schoolId),
  ]);
  if (employees.error) throw employees.error;
  if (links.error) throw links.error;
  return { employees: employees.data ?? [], links: links.data ?? [] };
}
