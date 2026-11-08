import { settingsClient } from "@/lib/settings";

export type PermissionAction = "view" | "create" | "edit" | "manage";
export type ModulePermissions = Record<string, Partial<Record<PermissionAction, boolean>>>;

export function hasPermission(
  permissions: ModulePermissions,
  module: string,
  action: PermissionAction,
) {
  return permissions[module]?.[action] === true;
}

export async function fetchMyPermissions(
  schoolId: string,
  userId: string,
): Promise<ModulePermissions> {
  const client = settingsClient();
  const assignments = await client
    .from("school_user_custom_roles")
    .select("role_id")
    .eq("school_id", schoolId)
    .eq("user_id", userId);
  if (assignments.error) throw assignments.error;
  const ids = (assignments.data ?? []).map((row) => row.role_id);
  if (!ids.length) return {};
  const roles = await client
    .from("school_roles")
    .select("id")
    .eq("school_id", schoolId)
    .eq("is_active", true)
    .in("id", ids);
  if (roles.error) throw roles.error;
  const activeIds = (roles.data ?? []).map((row) => row.id);
  if (!activeIds.length) return {};
  const matrix = await client
    .from("school_role_permissions")
    .select("*")
    .eq("school_id", schoolId)
    .in("role_id", activeIds);
  if (matrix.error) throw matrix.error;
  const permissions: ModulePermissions = {};
  for (const row of matrix.data ?? []) {
    const current = permissions[row.module] ?? {};
    for (const action of ["view", "create", "edit", "manage"] as const) {
      current[action] = current[action] === true || row[`can_${action}`];
    }
    permissions[row.module] = current;
  }
  return permissions;
}

export async function fetchMySystemPermissions(schoolId: string): Promise<ModulePermissions> {
  const { data, error } = await settingsClient().rpc("settings_my_system_permissions", {
    _school_id: schoolId,
  });
  if (error) throw error;
  return (data ?? {}) as ModulePermissions;
}
