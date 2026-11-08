import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchFinanceMetadata } from "@/lib/finance-list-pages";
import { fetchInventoryMetadata } from "@/lib/operational-list-pages";
import { slicePage, type PageSize } from "@/lib/pagination";

const school = z.object({ schoolId: z.string().uuid() });
const finance = school.extend({ yearId: z.string().uuid() });
export const fetchInventoryListMetadata = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(school)
  .handler(({ data, context }) => fetchInventoryMetadata(data.schoolId, context.supabase));
export const fetchFinanceListMetadata = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(finance)
  .handler(({ data, context }) =>
    fetchFinanceMetadata(data.schoolId, data.yearId, context.supabase),
  );

export const fetchOverdueListPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    finance.extend({
      page: z.number().int().min(1),
      pageSize: z.number().refine((value) => [25, 50, 100].includes(value)),
      search: z.string().max(500),
      stage: z.string(),
      grade: z.string(),
      section: z.string(),
    }),
  )
  .handler(async ({ data, context }) => {
    const metadata = await fetchFinanceMetadata(data.schoolId, data.yearId, context.supabase, true);
    const grades = await context.supabase
      .from("grades")
      .select("id,stage_id")
      .eq("school_id", data.schoolId);
    if (grades.error) throw grades.error;
    const stages = new Map((grades.data ?? []).map((row) => [row.id, row.stage_id]));
    const enrollments = new Map(metadata.enrollments.map((row) => [row.student_id, row]));
    const students = new Map(metadata.students.map((row) => [row.id, row]));
    const term = data.search.trim().toLowerCase();
    return slicePage(
      metadata.overdue.filter((row) => {
        const enrollment = enrollments.get(row.student_id),
          student = students.get(row.student_id),
          guardian = metadata.guardians[row.student_id];
        if (data.stage !== "all" && (!enrollment || stages.get(enrollment.grade_id) !== data.stage))
          return false;
        if (data.grade !== "all" && enrollment?.grade_id !== data.grade) return false;
        if (data.section !== "all" && enrollment?.section_id !== data.section) return false;
        return (
          !term ||
          `${student?.full_name ?? ""} ${student?.student_number ?? ""} ${guardian?.phone ?? ""}`
            .toLowerCase()
            .includes(term)
        );
      }),
      { page: data.page, pageSize: data.pageSize as PageSize },
    );
  });
