import { completeQueries, completeIds } from "@/lib/supabase-read";
import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";

export type InventoryCategory = Database["public"]["Tables"]["inventory_categories"]["Row"];
export type InventoryMovementBase = Database["public"]["Tables"]["inventory_movements"]["Row"];
export type InventoryMovementType = Database["public"]["Enums"]["inventory_movement_type"];
export type StockStatus = "normal" | "low" | "out" | "inactive";

export type InventoryMovement = InventoryMovementBase & {
  created_by_name: string | null;
};

export type InventoryItem = Database["public"]["Tables"]["inventory_items"]["Row"] & {
  category_name: string;
  balance: number;
  stock_status: StockStatus;
};

export type InventoryData = {
  categories: InventoryCategory[];
  items: InventoryItem[];
  movements: InventoryMovement[];
};

export const INVENTORY_MOVEMENT: Record<
  InventoryMovementType,
  { label: string; sign: 1 | -1; tone: "success" | "danger" | "warning" | "neutral" }
> = {
  opening_balance: { label: "رصيد افتتاحي", sign: 1, tone: "neutral" },
  stock_in: { label: "توريد مخزون", sign: 1, tone: "success" },
  stock_out: { label: "صرف مخزون", sign: -1, tone: "danger" },
  adjustment_in: { label: "تسوية بالزيادة", sign: 1, tone: "warning" },
  adjustment_out: { label: "تسوية بالنقص", sign: -1, tone: "warning" },
};

export const STOCK_STATUS: Record<
  StockStatus,
  { label: string; tone: "success" | "danger" | "warning" | "neutral" }
> = {
  normal: { label: "طبيعي", tone: "success" },
  low: { label: "مخزون منخفض", tone: "warning" },
  out: { label: "نفد المخزون", tone: "danger" },
  inactive: { label: "مؤرشف", tone: "neutral" },
};

export const inventoryKey = (schoolId?: string) => ["inventory", schoolId] as const;

export function canManageInventory(roles: string[]) {
  return roles.some((role) =>
    ["super_admin", "school_owner", "school_manager", "store_keeper"].includes(role),
  );
}

export function canViewInventory(roles: string[]) {
  return canManageInventory(roles) || roles.includes("accountant");
}

export function movementImpact(
  movement: Pick<InventoryMovementBase, "movement_type" | "quantity">,
) {
  return Number(movement.quantity) * INVENTORY_MOVEMENT[movement.movement_type].sign;
}

export function stockStatus(active: boolean, balance: number, minimum: number): StockStatus {
  if (!active) return "inactive";
  if (balance <= 0) return "out";
  if (balance <= minimum) return "low";
  return "normal";
}

export async function fetchInventory(schoolId: string, client = supabase): Promise<InventoryData> {
  const [categoryResult, itemResult, movementResult] = await completeQueries([
    client.from("inventory_categories").select("*").eq("school_id", schoolId).order("name"),
    client.from("inventory_items").select("*").eq("school_id", schoolId).order("name"),
    client
      .from("inventory_movements")
      .select("*")
      .eq("school_id", schoolId)
      .order("movement_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  const failed = [categoryResult, itemResult, movementResult].find((result) => result.error);
  if (failed?.error) throw failed.error;

  const categories = categoryResult.data ?? [];
  const rawMovements = movementResult.data ?? [];
  const profileIds = [
    ...new Set(rawMovements.flatMap((row) => (row.created_by ? [row.created_by] : []))),
  ];
  const profileResult = profileIds.length
    ? await completeIds(profileIds, (ids) =>
        client.from("profiles").select("id,full_name").in("id", ids),
      )
    : { data: [], error: null };
  if (profileResult.error) throw profileResult.error;

  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const profileNames = new Map(
    (profileResult.data ?? []).map((profile) => [profile.id, profile.full_name]),
  );
  const balances = new Map<string, number>();
  for (const movement of rawMovements) {
    balances.set(
      movement.item_id,
      (balances.get(movement.item_id) ?? 0) + movementImpact(movement),
    );
  }

  const items = (itemResult.data ?? []).map((item) => {
    const balance = balances.get(item.id) ?? 0;
    return {
      ...item,
      category_name: categoryNames.get(item.category_id) ?? "—",
      balance,
      stock_status: stockStatus(item.is_active, balance, Number(item.minimum_stock)),
    };
  });
  const movements = rawMovements.map((movement) => ({
    ...movement,
    created_by_name: movement.created_by ? (profileNames.get(movement.created_by) ?? null) : null,
  }));
  return { categories, items, movements };
}

export function computeInventorySummary(
  items: Pick<InventoryItem, "is_active" | "stock_status">[],
  movements: Pick<InventoryMovement, "movement_date">[],
) {
  const month = new Date().toISOString().slice(0, 7);
  return {
    active: items.filter((item) => item.is_active).length,
    low: items.filter((item) => item.stock_status === "low").length,
    out: items.filter((item) => item.stock_status === "out").length,
    movementsThisMonth: movements.filter((movement) => movement.movement_date.startsWith(month))
      .length,
  };
}

export function inventoryError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("inventory_items_school_id_item_code_key"))
    return "رمز الصنف مستخدم بالفعل.";
  if (message.includes("inventory_categories_school_id_name_key"))
    return "اسم التصنيف مستخدم بالفعل.";
  if (message.includes("الكمية المصروفة")) return "الكمية المصروفة تتجاوز الرصيد المتاح.";
  if (message.includes("أعد تفعيل")) return "أعد تفعيل الصنف قبل تسجيل حركة جديدة.";
  if (message.includes("future") || message.includes("مستقبلي"))
    return "لا يمكن تسجيل حركة بتاريخ مستقبلي.";
  return "تعذر حفظ بيانات المخزون. تحقق من القيم والصلاحيات ثم أعد المحاولة.";
}

export function formatQuantity(value: number) {
  return new Intl.NumberFormat("ar", { maximumFractionDigits: 3 }).format(value);
}
