import { Download, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import { reportColumnHeading } from "@/lib/settings-report-presentation";
import type { PaginationControl } from "@/lib/pagination";

import { DataTable, type Column } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { StatCard } from "@/components/app/stat-card";
import { Button } from "@/components/ui/button";
import {
  exportReportCsv,
  type ReportCard,
  type ReportDefinition,
  type ReportRow,
} from "@/lib/reports";

export function ReportView({
  report,
  rows,
  cards,
  schoolName,
  yearName,
  period,
  pagination,
  onExport,
}: {
  report: Omit<ReportDefinition, "summarize">;
  rows: ReportRow[];
  cards: ReportCard[];
  schoolName: string;
  yearName: string | null;
  period: string;
  pagination: PaginationControl;
  onExport: () => Promise<ReportRow[]>;
}) {
  const [busy, setBusy] = useState(false);
  const [printRows, setPrintRows] = useState<ReportRow[] | null>(null);
  useEffect(() => {
    const clear = () => setPrintRows(null);
    window.addEventListener("afterprint", clear);
    return () => window.removeEventListener("afterprint", clear);
  }, []);
  async function exportRows(print: boolean) {
    setBusy(true);
    try {
      const all = await onExport();
      if (print) {
        flushSync(() => setPrintRows(all));
        window.print();
      } else exportReportCsv(report, all);
    } catch {
      toast.error("تعذر إعداد جميع سجلات التقرير. أعد المحاولة.");
    } finally {
      setBusy(false);
    }
  }
  if (report.error) {
    return (
      <EmptyState
        title="التقرير غير متاح"
        description="لا تسمح صلاحيات حسابك بعرض بيانات هذا التقرير."
      />
    );
  }

  const columns: Column<ReportRow>[] = report.columns.map((column) => ({
    key: column.key,
    header: reportColumnHeading(report.id, column.key, column.label),
    cell: (row) => String(row[column.key] ?? "—"),
    className: "whitespace-nowrap",
  }));

  return (
    <section className="print-area min-w-0 space-y-4">
      <div className="hidden border-b border-border pb-4 print:block">
        <p className="text-lg font-semibold">{schoolName}</p>
        <h2 className="mt-1 text-xl font-bold">{report.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {yearName ? "السنة الدراسية: " + yearName + " · " : ""}
          {period}
        </p>
      </div>

      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{report.title}</h2>
          <p className="text-sm text-muted-foreground">{report.description}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => void exportRows(false)}
            disabled={busy || !pagination.total}
          >
            <Download className="size-4" />
            CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => void exportRows(true)}
            disabled={busy || !pagination.total}
          >
            <Printer className="size-4" />
            طباعة
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {cards.map((card) => (
          <StatCard
            key={card.label}
            label={card.label}
            value={card.value}
            {...(card.hint ? { hint: card.hint } : {})}
          />
        ))}
      </div>

      <div className="no-print">
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row._id}
          emptyTitle="لا توجد بيانات ضمن الفلاتر"
          emptyDescription="غيّر السنة الدراسية أو الفترة لعرض سجلات أخرى."
          pagination={pagination}
        />
      </div>
      {printRows ? (
        <div className="hidden print:block">
          <DataTable rows={printRows} columns={columns} rowKey={(row) => row._id} />
        </div>
      ) : null}

      <p className="hidden text-xs text-muted-foreground print:block">
        عدد السجلات: {pagination.total.toLocaleString("ar")} · طُبع من منصة مدار
      </p>
    </section>
  );
}
