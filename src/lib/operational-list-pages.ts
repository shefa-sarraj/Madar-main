import { supabase } from "@/integrations/supabase/client";
import { readAll, readPage, searchOperand, type PageRequest } from "@/lib/pagination";
import { fetchAssets, computeAssetSummary } from "@/lib/assets";
import { fetchTasks, taskSummary, todayISO } from "@/lib/tasks";
import { fetchCases, caseSummary } from "@/lib/cases";
import { movementImpact, stockStatus, computeInventorySummary } from "@/lib/inventory";

const contains = (value: string | null, term: string) =>
  !!value?.toLocaleLowerCase("ar").includes(term.trim().toLocaleLowerCase("ar"));
const idsFilter = (column: string, ids: string[]) =>
  ids.length ? [`${column}.in.(${[...new Set(ids)].join(",")})`] : [];

export async function fetchInventoryMetadata(schoolId: string, client = supabase) {
  const [categories, index, movements] = await Promise.all([
    client.from("inventory_categories").select("*").eq("school_id", schoolId).order("name"),
    readAll((from, to) =>
      client
        .from("inventory_items")
        .select("id,is_active,minimum_stock,storage_location")
        .eq("school_id", schoolId)
        .order("id")
        .range(from, to),
    ),
    readAll((from, to) =>
      client
        .from("inventory_movements")
        .select("item_id,movement_type,quantity,movement_date")
        .eq("school_id", schoolId)
        .order("id")
        .range(from, to),
    ),
  ]);
  if (categories.error) throw categories.error;
  const balances = new Map<string, number>();
  for (const movement of movements)
    balances.set(
      movement.item_id,
      (balances.get(movement.item_id) ?? 0) + movementImpact(movement),
    );
  const items = index.map((item) => ({
    ...item,
    balance: balances.get(item.id) ?? 0,
    stock_status: stockStatus(
      item.is_active,
      balances.get(item.id) ?? 0,
      Number(item.minimum_stock),
    ),
  }));
  return {
    categories: categories.data ?? [],
    items,
    summary: computeInventorySummary(items, movements),
    locations: [
      ...new Set(index.flatMap((item) => (item.storage_location ? [item.storage_location] : []))),
    ].sort((a, b) => a.localeCompare(b, "ar")),
  };
}

export async function fetchInventoryPage(
  schoolId: string,
  request: PageRequest,
  filters: { search: string; category: string; stock: string; activity: string; location: string },
  metadata: Awaited<ReturnType<typeof fetchInventoryMetadata>>,
) {
  const page = await readPage((from, to) => {
    let q = supabase
      .from("inventory_items")
      .select("*", { count: "exact" })
      .eq("school_id", schoolId);
    if (filters.category !== "all") q = q.eq("category_id", filters.category);
    if (filters.activity !== "all") q = q.eq("is_active", filters.activity === "true");
    if (filters.location !== "all") q = q.eq("storage_location", filters.location);
    if (filters.stock !== "all")
      q = q.in(
        "id",
        metadata.items.filter((item) => item.stock_status === filters.stock).map((item) => item.id),
      );
    if (filters.search.trim()) {
      const term = searchOperand(filters.search);
      q = q.or(
        [
          ...["item_code", "name", "unit", "storage_location", "description"].map(
            (column) => `${column}.ilike.${term}`,
          ),
          ...idsFilter(
            "category_id",
            metadata.categories
              .filter((row) => contains(row.name, filters.search))
              .map((row) => row.id),
          ),
        ].join(","),
      );
    }
    return q.order("name").order("id").range(from, to);
  }, request);
  const items = new Map(metadata.items.map((item) => [item.id, item]));
  return {
    categories: metadata.categories,
    items: page.rows.map((item) => ({
      ...item,
      category_name:
        metadata.categories.find((category) => category.id === item.category_id)?.name ?? "—",
      balance: items.get(item.id)?.balance ?? 0,
      stock_status: items.get(item.id)?.stock_status ?? ("normal" as const),
    })),
    total: page.total,
    page: page.page,
  };
}

export async function fetchInventoryHistory(schoolId: string, itemId: string) {
  const rows = await readAll((from, to) =>
    supabase
      .from("inventory_movements")
      .select("*")
      .eq("school_id", schoolId)
      .eq("item_id", itemId)
      .order("movement_date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
  const ids = [...new Set(rows.flatMap((row) => (row.created_by ? [row.created_by] : [])))];
  const profiles = ids.length
    ? await supabase.from("profiles").select("id,full_name").in("id", ids)
    : { data: [], error: null };
  if (profiles.error) throw profiles.error;
  const names = new Map((profiles.data ?? []).map((row) => [row.id, row.full_name]));
  return rows.map((row) => ({
    ...row,
    created_by_name: row.created_by ? (names.get(row.created_by) ?? null) : null,
  }));
}

export async function fetchAssetsMetadata(schoolId: string) {
  const [data, index] = await Promise.all([
    fetchAssets(schoolId, []),
    readAll((from, to) =>
      supabase
        .from("assets")
        .select("id,is_active,status,location")
        .eq("school_id", schoolId)
        .order("id")
        .range(from, to),
    ),
  ]);
  return {
    ...data,
    summary: computeAssetSummary(index),
    locations: [...new Set(index.map((row) => row.location))].sort((a, b) =>
      a.localeCompare(b, "ar"),
    ),
  };
}

export async function fetchAssetsPage(
  schoolId: string,
  request: PageRequest,
  filters: {
    search: string;
    category: string;
    status: string;
    condition: string;
    location: string;
    assignment: string;
  },
  metadata: Awaited<ReturnType<typeof fetchAssetsMetadata>>,
) {
  const page = await readPage((from, to) => {
    let q = supabase.from("assets").select("id", { count: "exact" }).eq("school_id", schoolId);
    for (const [column, value] of [
      ["category_id", filters.category],
      ["status", filters.status],
      ["condition", filters.condition],
      ["location", filters.location],
    ])
      if (value !== "all") q = q.filter(column!, "eq", value);
    if (filters.assignment === "assigned") q = q.not("assigned_employee_id", "is", null);
    if (filters.assignment === "unassigned") q = q.is("assigned_employee_id", null);
    if (filters.search.trim()) {
      const term = searchOperand(filters.search);
      q = q.or(
        [
          ...["asset_code", "name", "serial_number", "location"].map(
            (column) => `${column}.ilike.${term}`,
          ),
          ...idsFilter(
            "category_id",
            metadata.categories
              .filter((row) => contains(row.name, filters.search))
              .map((row) => row.id),
          ),
          ...idsFilter(
            "assigned_employee_id",
            metadata.employees
              .filter((row) => contains(row.full_name, filters.search))
              .map((row) => row.id),
          ),
        ].join(","),
      );
    }
    return q.order("name").order("id").range(from, to);
  }, request);
  return {
    ...(await fetchAssets(
      schoolId,
      page.rows.map((row) => row.id),
    )),
    total: page.total,
    page: page.page,
  };
}

export async function fetchTasksMetadata(schoolId: string) {
  const [data, index] = await Promise.all([
    fetchTasks(schoolId, []),
    readAll((from, to) =>
      supabase
        .from("tasks")
        .select("id,status,due_date,completed_at,created_by")
        .eq("school_id", schoolId)
        .order("id")
        .range(from, to),
    ),
  ]);
  const ids = [...new Set(index.map((row) => row.created_by))];
  const profiles = ids.length
    ? await supabase.from("profiles").select("id,full_name").in("id", ids)
    : { data: [], error: null };
  if (profiles.error) throw profiles.error;
  const names = new Map((profiles.data ?? []).map((row) => [row.id, row.full_name]));
  return {
    ...data,
    summary: taskSummary(index),
    creators: ids
      .map((id) => [id, names.get(id) ?? "مستخدم المدرسة"] as [string, string])
      .sort((a, b) => a[1].localeCompare(b[1], "ar")),
  };
}

export async function fetchTasksPage(
  schoolId: string,
  request: PageRequest,
  filters: {
    search: string;
    status: string;
    priority: string;
    assignee: string;
    due: string;
    creator: string;
  },
  metadata: Awaited<ReturnType<typeof fetchTasksMetadata>>,
) {
  const page = await readPage((from, to) => {
    let q = supabase.from("tasks").select("id", { count: "exact" }).eq("school_id", schoolId);
    for (const [column, value] of [
      ["status", filters.status],
      ["priority", filters.priority],
      ["created_by", filters.creator],
    ])
      if (value !== "all") q = q.filter(column!, "eq", value);
    if (filters.assignee === "unassigned")
      q = q.is("assigned_to_user_id", null).is("assigned_to_employee_id", null);
    else if (filters.assignee !== "all") {
      const [kind, id] = filters.assignee.split(":");
      q = q.filter(kind === "user" ? "assigned_to_user_id" : "assigned_to_employee_id", "eq", id);
    }
    const today = todayISO();
    if (filters.due === "overdue")
      q = q.lt("due_date", today).not("status", "in", "(completed,cancelled)");
    if (filters.due === "today") q = q.eq("due_date", today);
    if (filters.due === "none") q = q.is("due_date", null);
    if (filters.due === "week") {
      const end = new Date(`${today}T00:00:00`);
      end.setDate(end.getDate() + 7);
      q = q
        .gte("due_date", today)
        .lte("due_date", end.toISOString().slice(0, 10))
        .not("status", "in", "(completed,cancelled)");
    }
    if (filters.search.trim()) {
      const term = searchOperand(filters.search);
      const matching = metadata.assignees.filter((row) => contains(row.name, filters.search));
      const related = metadata.relatedOptions.filter((row) => contains(row.label, filters.search));
      const terms = [
        `title.ilike.${term}`,
        `description.ilike.${term}`,
        ...idsFilter(
          "assigned_to_user_id",
          matching.filter((row) => row.kind === "user").map((row) => row.id),
        ),
        ...idsFilter(
          "assigned_to_employee_id",
          matching.filter((row) => row.kind === "employee").map((row) => row.id),
        ),
        ...idsFilter(
          "created_by",
          metadata.creators.filter((row) => contains(row[1], filters.search)).map((row) => row[0]),
        ),
      ];
      for (const type of ["student", "employee", "asset", "inventory_item"]) {
        const ids = related.filter((row) => row.type === type).map((row) => row.id);
        if (ids.length)
          terms.push(`and(related_entity_type.eq.${type},related_entity_id.in.(${ids.join(",")}))`);
      }
      q = q.or(terms.join(","));
    }
    return q.order("created_at", { ascending: false }).order("id").range(from, to);
  }, request);
  return {
    ...(await fetchTasks(
      schoolId,
      page.rows.map((row) => row.id),
    )),
    total: page.total,
    page: page.page,
  };
}

export async function fetchCasesMetadata(schoolId: string) {
  const [data, index] = await Promise.all([
    fetchCases(schoolId, []),
    readAll((from, to) =>
      supabase
        .from("cases")
        .select("id,status,priority,resolved_at,category")
        .eq("school_id", schoolId)
        .order("id")
        .range(from, to),
    ),
  ]);
  return {
    ...data,
    summary: caseSummary(index),
    categories: [...new Set(index.map((row) => row.category))].sort((a, b) =>
      a.localeCompare(b, "ar"),
    ),
  };
}

export async function fetchCasesPage(
  schoolId: string,
  request: PageRequest,
  filters: {
    search: string;
    status: string;
    priority: string;
    type: string;
    category: string;
    student: string;
    assignee: string;
    fromDate: string;
    toDate: string;
  },
  metadata: Awaited<ReturnType<typeof fetchCasesMetadata>>,
) {
  const page = await readPage((from, to) => {
    let q = supabase.from("cases").select("id", { count: "exact" }).eq("school_id", schoolId);
    for (const [column, value] of [
      ["status", filters.status],
      ["priority", filters.priority],
      ["type", filters.type],
      ["category", filters.category],
      ["student_id", filters.student],
    ])
      if (value !== "all") q = q.filter(column!, "eq", value);
    if (filters.assignee === "unassigned")
      q = q.is("assigned_to_user_id", null).is("assigned_to_employee_id", null);
    else if (filters.assignee !== "all") {
      const [kind, id] = filters.assignee.split(":");
      q = q.filter(kind === "user" ? "assigned_to_user_id" : "assigned_to_employee_id", "eq", id);
    }
    if (filters.fromDate) q = q.gte("created_at", `${filters.fromDate}T00:00:00Z`);
    if (filters.toDate) {
      const next = new Date(`${filters.toDate}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      q = q.lt("created_at", next.toISOString());
    }
    if (filters.search.trim()) {
      const term = searchOperand(filters.search);
      const matches = metadata.assignees.filter((row) => contains(row.name, filters.search));
      q = q.or(
        [
          ...[
            "case_number",
            "title",
            "description",
            "category",
            "submitted_by_name",
            "submitted_by_phone",
          ].map((column) => `${column}.ilike.${term}`),
          ...idsFilter(
            "student_id",
            metadata.students
              .filter((row) => contains(row.name, filters.search))
              .map((row) => row.id),
          ),
          ...idsFilter(
            "guardian_id",
            metadata.guardians
              .filter((row) => contains(row.name, filters.search))
              .map((row) => row.id),
          ),
          ...idsFilter(
            "employee_id",
            metadata.employees
              .filter((row) => contains(row.name, filters.search))
              .map((row) => row.id),
          ),
          ...idsFilter(
            "assigned_to_user_id",
            matches.filter((row) => row.kind === "user").map((row) => row.id),
          ),
          ...idsFilter(
            "assigned_to_employee_id",
            matches.filter((row) => row.kind === "employee").map((row) => row.id),
          ),
        ].join(","),
      );
    }
    return q.order("created_at", { ascending: false }).order("id").range(from, to);
  }, request);
  return {
    ...(await fetchCases(
      schoolId,
      page.rows.map((row) => row.id),
    )),
    total: page.total,
    page: page.page,
  };
}
