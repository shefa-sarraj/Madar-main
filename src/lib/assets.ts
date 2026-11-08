import { completeQueries, completeIds } from "@/lib/supabase-read";
import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";

export type AssetCategory = Database["public"]["Tables"]["asset_categories"]["Row"];
export type AssetStatus = Database["public"]["Enums"]["asset_status"];
export type AssetCondition = Database["public"]["Enums"]["asset_condition"];
export type AssetEventType = Database["public"]["Enums"]["asset_event_type"];
export type EmployeeOption = Pick<
  Database["public"]["Tables"]["employees"]["Row"],
  "id" | "full_name" | "employee_number" | "status"
>;

export type AssetRow = Database["public"]["Tables"]["assets"]["Row"] & {
  category_name: string;
  assigned_employee_name: string | null;
};

export type AssetHistoryRow = Database["public"]["Tables"]["asset_history"]["Row"] & {
  assigned_from_name: string | null;
  assigned_to_name: string | null;
  created_by_name: string | null;
};

export type AssetsData = {
  categories: AssetCategory[];
  assets: AssetRow[];
  history: AssetHistoryRow[];
  employees: EmployeeOption[];
};

export const ASSET_STATUS: Record<
  AssetStatus,
  { label: string; tone: "success" | "info" | "warning" | "danger" | "neutral" }
> = {
  active: { label: "فعال", tone: "success" },
  assigned: { label: "بعهدة موظف", tone: "info" },
  under_maintenance: { label: "تحت الصيانة", tone: "warning" },
  damaged: { label: "تالف", tone: "danger" },
  retired: { label: "متقاعد", tone: "neutral" },
};

export const ASSET_CONDITION: Record<AssetCondition, string> = {
  excellent: "ممتازة",
  good: "جيدة",
  fair: "متوسطة",
  poor: "ضعيفة",
};

export const ASSET_EVENT: Record<
  AssetEventType,
  { label: string; tone: "success" | "info" | "warning" | "danger" | "neutral" }
> = {
  registered: { label: "تسجيل الأصل", tone: "neutral" },
  assigned: { label: "تعيين عهدة", tone: "success" },
  transferred: { label: "نقل", tone: "info" },
  returned: { label: "إرجاع", tone: "success" },
  maintenance: { label: "إرسال للصيانة", tone: "warning" },
  damaged: { label: "تسجيل تلف", tone: "danger" },
  retired: { label: "تقاعد الأصل", tone: "neutral" },
};

export const assetsKey = (schoolId?: string) => ["assets", schoolId] as const;

export function canManageAssets(roles: string[]) {
  return roles.some((role) =>
    ["super_admin", "school_owner", "school_manager", "store_keeper"].includes(role),
  );
}

export function canViewAssets(roles: string[]) {
  return canManageAssets(roles) || roles.includes("accountant") || roles.includes("hr");
}

export async function fetchAssets(
  schoolId: string,
  ids?: string[],
  client = supabase,
): Promise<AssetsData> {
  let assetsQuery = client.from("assets").select("*").eq("school_id", schoolId);
  let historyQuery = client.from("asset_history").select("*").eq("school_id", schoolId);
  if (ids) {
    assetsQuery = assetsQuery.in("id", ids);
    historyQuery = historyQuery.in("asset_id", ids);
  }
  const [categoryResult, assetResult, historyResult, employeeResult] = await completeQueries([
    client.from("asset_categories").select("*").eq("school_id", schoolId).order("name"),
    assetsQuery.order("name").order("id"),
    historyQuery
      .order("event_date", { ascending: false })
      .order("created_at", { ascending: false }),
    client
      .from("employees")
      .select("id,full_name,employee_number,status")
      .eq("school_id", schoolId)
      .order("full_name"),
  ]);
  const failed = [categoryResult, assetResult, historyResult, employeeResult].find(
    (result) => result.error,
  );
  if (failed?.error) throw failed.error;

  const categories = categoryResult.data ?? [];
  const employees = employeeResult.data ?? [];
  const rawHistory = historyResult.data ?? [];
  const profileIds = [
    ...new Set(rawHistory.flatMap((row) => (row.created_by ? [row.created_by] : []))),
  ];
  const profileResult = profileIds.length
    ? await completeIds(profileIds, (ids) =>
        client.from("profiles").select("id,full_name").in("id", ids),
      )
    : { data: [], error: null };
  if (profileResult.error) throw profileResult.error;

  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const employeeNames = new Map(employees.map((employee) => [employee.id, employee.full_name]));
  const profileNames = new Map(
    (profileResult.data ?? []).map((profile) => [profile.id, profile.full_name]),
  );
  const assets = (assetResult.data ?? []).map((asset) => ({
    ...asset,
    category_name: categoryNames.get(asset.category_id) ?? "—",
    assigned_employee_name: asset.assigned_employee_id
      ? (employeeNames.get(asset.assigned_employee_id) ?? "موظف غير متاح")
      : null,
  }));
  const history = rawHistory.map((event) => ({
    ...event,
    assigned_from_name: event.assigned_from_employee_id
      ? (employeeNames.get(event.assigned_from_employee_id) ?? null)
      : null,
    assigned_to_name: event.assigned_to_employee_id
      ? (employeeNames.get(event.assigned_to_employee_id) ?? null)
      : null,
    created_by_name: event.created_by ? (profileNames.get(event.created_by) ?? null) : null,
  }));
  return { categories, assets, history, employees };
}

export function computeAssetSummary(assets: Pick<AssetRow, "is_active" | "status">[]) {
  return {
    active: assets.filter((asset) => asset.is_active).length,
    assigned: assets.filter((asset) => asset.status === "assigned").length,
    maintenance: assets.filter((asset) => asset.status === "under_maintenance").length,
    damagedOrRetired: assets.filter((asset) => ["damaged", "retired"].includes(asset.status))
      .length,
  };
}

export function formatAssetCost(amount: number | null, currency: string) {
  if (amount === null) return "—";
  return new Intl.NumberFormat("ar", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}

export function assetError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("assets_school_id_asset_code_key")) return "رمز الأصل مستخدم بالفعل.";
  if (message.includes("asset_categories_school_id_name_key")) return "اسم التصنيف مستخدم بالفعل.";
  if (message.includes("موظف غير فعال") || message.includes("مدرسة أخرى"))
    return "لا يمكن تعيين الأصل لموظف غير فعال أو من مدرسة أخرى.";
  if (message.includes("متقاعد")) return "لا يمكن تغيير أصل متقاعد.";
  if (message.includes("مستقبلياً")) return "لا يمكن تسجيل تاريخ مستقبلي.";
  if (message.includes("صلاحية")) return "لا تملك صلاحية تنفيذ هذا الإجراء.";
  return "تعذر حفظ بيانات الأصل. تحقق من القيم والصلاحيات ثم أعد المحاولة.";
}
