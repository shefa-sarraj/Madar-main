import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchReports, filterReportRows, REPORT_OPTIONS, type ReportId } from "@/lib/reports";
import { slicePage, type PageSize } from "@/lib/pagination";

const input = z.object({
  schoolId: z.string().uuid(),
  yearId: z.string().uuid(),
  currency: z.string().max(8),
  reportId: z.custom<ReportId>(
    (value) => typeof value === "string" && REPORT_OPTIONS.some((option) => option.id === value),
  ),
  search: z.string().max(500),
  fromDate: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/),
  toDate: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/),
  filters: z.record(z.string(), z.string().max(500)),
  page: z.number().int().min(1),
  pageSize: z.number().refine((value) => [25, 50, 100].includes(value)),
  exportAll: z.boolean().default(false),
});

export const fetchReportPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(input)
  .handler(async ({ data, context }) => {
    // The request-scoped authenticated client preserves the same RLS as direct browser reads.
    const reports = await fetchReports(
      data.schoolId,
      data.yearId,
      data.currency,
      context.supabase,
      data.reportId,
    );
    const report = reports[data.reportId];
    const needle = data.search.trim().toLocaleLowerCase("ar");
    const rows = filterReportRows(report.rows, data.fromDate, data.toDate)
      .filter((row) =>
        report.filters.every(
          (filter) =>
            !data.filters[filter.key] || String(row[filter.key] ?? "") === data.filters[filter.key],
        ),
      )
      .filter(
        (row) =>
          !needle ||
          report.columns
            .map((column) => String(row[column.key] ?? ""))
            .join(" ")
            .toLocaleLowerCase("ar")
            .includes(needle),
      );
    const page = data.exportAll
      ? { rows, total: rows.length, page: 1 }
      : slicePage(rows, { page: data.page, pageSize: data.pageSize as PageSize });
    const { summarize, ...metadata } = report;
    return {
      report: { ...metadata, rows: page.rows },
      cards: summarize(rows),
      total: page.total,
      page: page.page,
    };
  });
