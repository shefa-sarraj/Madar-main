import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Boxes,
  CalendarCheck,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  FileWarning,
  Inbox,
  Layers,
  LineChart,
  MessageSquareWarning,
  Receipt,
  ShieldCheck,
  UserPlus,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";

import { AppShell } from "@/components/app/app-shell";
import { StatusBadge } from "@/components/app/status-badge";
import { supabase } from "@/integrations/supabase/client";
import {
  attendanceSummary,
  canViewStaffAttendance,
  canViewStudentAttendance,
  todayISO,
} from "@/lib/attendance";
import { canViewAssets } from "@/lib/assets";
import { canViewCases, isUnresolvedCase } from "@/lib/cases";
import { canManageFinance, fmtMoney, toCents } from "@/lib/finance";
import { canViewInventory, movementImpact } from "@/lib/inventory";
import { canViewStaff } from "@/lib/staff";
import { canViewStudents } from "@/lib/students";
import { isTaskDueSoon, isTaskOverdue } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "الرئيسية — مدار | Madar" },
      {
        name: "description",
        content: "لوحة متابعة العمليات الإدارية والمالية اليومية للمدرسة في منصة مدار.",
      },
      { property: "og:title", content: "الرئيسية — مدار | Madar" },
      {
        property: "og:description",
        content: "لوحة متابعة العمليات الإدارية والمالية اليومية للمدرسة في منصة مدار.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardPage,
});

const fmtDate = (d: string) =>
  new Intl.DateTimeFormat("ar", { day: "numeric", month: "short" }).format(new Date(d));

function DashboardPage() {
  const { activeSchool, activeYear, roles, can } = useWorkspace();
  const canSee = canViewStudents(roles);
  const canSeeFinance = canManageFinance(roles);
  const canSeeStaff = canViewStaff(roles);
  const canSeeInventory = canViewInventory(roles);
  const canSeeAssets = canViewAssets(roles);
  const canSeeCases = canViewCases(roles);

  const casesQ = useQuery({
    queryKey: ["dashboard-cases", activeSchool?.id],
    enabled: !!activeSchool && canSeeCases,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("priority,status")
        .eq("school_id", activeSchool!.id)
        .in("priority", ["high", "urgent"]);
      if (error) throw error;
      return (data ?? []).filter(isUnresolvedCase).length;
    },
  });

  const tasksQ = useQuery({
    queryKey: ["dashboard-tasks", activeSchool?.id],
    enabled: !!activeSchool,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("due_date,status")
        .eq("school_id", activeSchool!.id)
        .in("status", ["open", "in_progress"]);
      if (error) throw error;
      return {
        overdue: (data ?? []).filter(isTaskOverdue).length,
        dueSoon: (data ?? []).filter((task) => isTaskDueSoon(task)).length,
      };
    },
  });

  const assetsQ = useQuery({
    queryKey: ["dashboard-assets", activeSchool?.id],
    enabled: !!activeSchool && canSeeAssets,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets")
        .select("status")
        .eq("school_id", activeSchool!.id)
        .in("status", ["under_maintenance", "damaged"]);
      if (error) throw error;
      return {
        maintenance: (data ?? []).filter((asset) => asset.status === "under_maintenance").length,
        damaged: (data ?? []).filter((asset) => asset.status === "damaged").length,
      };
    },
  });

  const inventoryQ = useQuery({
    queryKey: ["dashboard-inventory", activeSchool?.id],
    enabled: !!activeSchool && canSeeInventory,
    queryFn: async () => {
      const schoolId = activeSchool!.id;
      const [items, movements] = await Promise.all([
        supabase
          .from("inventory_items")
          .select("id, minimum_stock, is_active")
          .eq("school_id", schoolId)
          .eq("is_active", true),
        supabase
          .from("inventory_movements")
          .select("item_id, movement_type, quantity")
          .eq("school_id", schoolId),
      ]);
      if (items.error) throw items.error;
      if (movements.error) throw movements.error;
      const balances = new Map<string, number>();
      for (const movement of movements.data ?? []) {
        balances.set(
          movement.item_id,
          (balances.get(movement.item_id) ?? 0) + movementImpact(movement),
        );
      }
      return (items.data ?? []).filter(
        (item) => (balances.get(item.id) ?? 0) <= Number(item.minimum_stock),
      ).length;
    },
  });

  const q = useQuery({
    queryKey: ["dashboard-v2", activeSchool?.id, activeYear?.id],
    enabled: !!activeSchool && canSee,
    queryFn: async () => {
      const schoolId = activeSchool!.id;
      const [
        active,
        enrollments,
        stages,
        grades,
        newApps,
        recentApps,
        activeIds,
        docs,
        payments,
        expenses,
        fees,
        studentAttendance,
        staffAttendance,
      ] = await Promise.all([
        supabase
          .from("students")
          .select("id", { count: "exact", head: true })
          .eq("school_id", schoolId)
          .eq("status", "active"),
        activeYear
          ? supabase
              .from("student_enrollments")
              .select("grade_id")
              .eq("school_id", schoolId)
              .eq("academic_year_id", activeYear.id)
              .in("enrollment_status", ["active", "pending"])
          : Promise.resolve({ data: [] as { grade_id: string }[], error: null }),
        supabase
          .from("stages")
          .select("id, name, order_index")
          .eq("school_id", schoolId)
          .eq("status", "active")
          .order("order_index"),
        supabase.from("grades").select("id, stage_id").eq("school_id", schoolId),
        supabase
          .from("admission_applications")
          .select("id", { count: "exact", head: true })
          .eq("school_id", schoolId)
          .in("status", ["new", "under_review"]),
        supabase
          .from("admission_applications")
          .select("id, student_first_name, student_last_name, status, submitted_at")
          .eq("school_id", schoolId)
          .order("submitted_at", { ascending: false })
          .limit(5),
        supabase.from("students").select("id").eq("school_id", schoolId).eq("status", "active"),
        supabase.from("student_documents").select("student_id").eq("school_id", schoolId),
        activeYear && canSeeFinance
          ? supabase
              .from("payments")
              .select(
                "id, payment_number, amount, payment_date, status, student:students(full_name)",
              )
              .eq("school_id", schoolId)
              .eq("academic_year_id", activeYear.id)
              .eq("status", "completed")
              .order("payment_date", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        activeYear && canSeeFinance
          ? supabase
              .from("expenses")
              .select("amount, expense_date, status")
              .eq("school_id", schoolId)
              .eq("academic_year_id", activeYear.id)
              .eq("status", "recorded")
          : Promise.resolve({ data: [], error: null }),
        activeYear && canSeeFinance
          ? supabase
              .from("student_fees")
              .select("balance, status")
              .eq("school_id", schoolId)
              .eq("academic_year_id", activeYear.id)
              .not("status", "in", '("cancelled","waived")')
          : Promise.resolve({ data: [], error: null }),
        activeYear && canSee
          ? supabase
              .from("student_attendance")
              .select("status")
              .eq("school_id", schoolId)
              .eq("academic_year_id", activeYear.id)
              .eq("attendance_date", todayISO())
          : Promise.resolve({ data: [], error: null }),
        canSeeStaff
          ? supabase
              .from("staff_attendance")
              .select("status")
              .eq("school_id", schoolId)
              .eq("attendance_date", todayISO())
          : Promise.resolve({ data: [], error: null }),
      ]);
      const failed = [
        active,
        enrollments,
        stages,
        grades,
        newApps,
        recentApps,
        activeIds,
        docs,
        payments,
        expenses,
        fees,
        studentAttendance,
        staffAttendance,
      ].find((result) => result.error);
      if (failed?.error) throw failed.error;
      const gradeStage = new Map((grades.data ?? []).map((g) => [g.id, g.stage_id]));
      const byStage = (stages.data ?? []).map((st) => ({
        name: st.name,
        count: (enrollments.data ?? []).filter((e) => gradeStage.get(e.grade_id) === st.id).length,
      }));
      const withDocs = new Set((docs.data ?? []).map((d) => d.student_id));
      const missingDocs = (activeIds.data ?? []).filter((s) => !withDocs.has(s.id)).length;
      const month = new Date().toISOString().slice(0, 7);
      const completedPayments = (payments.data ?? []) as unknown as {
        id: string;
        payment_number: string;
        amount: number;
        payment_date: string;
        status: string;
        student: { full_name: string } | null;
      }[];
      const recordedExpenses = (expenses.data ?? []) as {
        amount: number;
        expense_date: string;
        status: string;
      }[];
      const financeMonths = activeYear
        ? buildFinanceMonths(
            activeYear.start_date,
            activeYear.end_date,
            completedPayments,
            recordedExpenses,
          )
        : [];
      const studentToday = attendanceSummary(
        ((studentAttendance.data ?? []) as { status: string }[]).map((record) => record.status),
      );
      const staffToday = attendanceSummary(
        ((staffAttendance.data ?? []) as { status: string }[]).map((record) => record.status),
      );
      return {
        active: active.count ?? 0,
        yearRegistrations: (enrollments.data ?? []).length,
        byStage,
        newApps: newApps.count ?? 0,
        recentApps: recentApps.data ?? [],
        missingDocs,
        collectedThisMonth: completedPayments
          .filter((payment) => payment.payment_date.startsWith(month))
          .reduce((sum, payment) => sum + toCents(payment.amount), 0),
        expensesThisMonth: recordedExpenses
          .filter((expense) => expense.expense_date.startsWith(month))
          .reduce((sum, expense) => sum + toCents(expense.amount), 0),
        outstanding: ((fees.data ?? []) as { balance: number }[]).reduce(
          (sum, fee) => sum + toCents(fee.balance),
          0,
        ),
        financeMonths,
        recentPayments: completedPayments.slice(0, 5),
        studentToday,
        staffToday,
      };
    },
  });

  const d = q.data;
  const alerts: {
    icon: LucideIcon;
    title: string;
    detail: string;
    count: number;
    to: "/admissions" | "/students" | "/inventory" | "/assets" | "/tasks" | "/complaints";
  }[] = [];
  if (d?.newApps)
    alerts.push({
      icon: UserPlus,
      title: "تسجيلات جديدة",
      detail: "طلبات قبول بانتظار المراجعة",
      count: d.newApps,
      to: "/admissions",
    });
  if (d?.missingDocs)
    alerts.push({
      icon: FileWarning,
      title: "وثائق ناقصة",
      detail: "طلاب فعالون بدون أي وثيقة مرفوعة",
      count: d.missingDocs,
      to: "/students",
    });
  if (inventoryQ.data)
    alerts.push({
      icon: Boxes,
      title: "مخزون منخفض",
      detail: "أصناف بلغت الحد الأدنى أو نفدت",
      count: inventoryQ.data,
      to: "/inventory",
    });
  if (assetsQ.data && (assetsQ.data.maintenance || assetsQ.data.damaged))
    alerts.push({
      icon: Wrench,
      title: "أصول تحتاج متابعة",
      detail: `${assetsQ.data.maintenance} تحت الصيانة · ${assetsQ.data.damaged} تالفة`,
      count: assetsQ.data.maintenance + assetsQ.data.damaged,
      to: "/assets",
    });
  if (tasksQ.data && (tasksQ.data.overdue || tasksQ.data.dueSoon))
    alerts.push({
      icon: ClipboardList,
      title: "مهام تحتاج متابعة",
      detail: `${tasksQ.data.overdue} متأخرة · ${tasksQ.data.dueSoon} قريبة الاستحقاق`,
      count: tasksQ.data.overdue + tasksQ.data.dueSoon,
      to: "/tasks",
    });
  if (casesQ.data)
    alerts.push({
      icon: MessageSquareWarning,
      title: "حالات حساسة تحتاج متابعة",
      detail: "حالات عالية أو عاجلة لم تُحل بعد",
      count: casesQ.data,
      to: "/complaints",
    });

  const alertOrder = ["/complaints", "/tasks", "/inventory", "/assets", "/admissions", "/students"];
  const orderedAlerts = [...alerts].sort(
    (a, b) => alertOrder.indexOf(a.to) - alertOrder.indexOf(b.to),
  );

  // Presentation gates reuse the attendance pages' existing authorization checks.
  const showStudentAttendance = can("student_attendance", "view", canViewStudentAttendance(roles));
  const showStaffAttendance = can("staff_attendance", "view", canViewStaffAttendance(roles));
  const loading = !!activeSchool && canSee && q.isPending;
  const attentionLoading =
    !!activeSchool &&
    (loading ||
      tasksQ.isPending ||
      (canSeeCases && casesQ.isPending) ||
      (canSeeAssets && assetsQ.isPending) ||
      (canSeeInventory && inventoryQ.isPending));
  const attentionError =
    q.isError || tasksQ.isError || casesQ.isError || assetsQ.isError || inventoryQ.isError;

  return (
    <AppShell>
      <div className="madar-dashboard">
        <div className="madar-dashboard__welcome">
          <div className="madar-dashboard__intro">
            <span className="madar-dashboard__brand-arch">
              <img src="/favicon.png" width="40" height="40" alt="" />
            </span>
            <div>
              <span className="madar-dashboard__eyebrow">مدار · إدارة المدرسة</span>
              <h1>{activeSchool ? activeSchool.name_ar : "مرحباً بك في مدار"}</h1>
              <p>نظرة موحدة على العمليات الإدارية والمالية</p>
            </div>
          </div>
          <div className="madar-dashboard__welcome-tools">
            <div className="madar-dashboard__year">
              <time dateTime={todayISO()}>
                {new Intl.DateTimeFormat("ar", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                }).format(new Date(`${todayISO()}T12:00:00`))}
              </time>
              {activeYear ? (
                <StatusBadge tone="gold">السنة الدراسية: {activeYear.name}</StatusBadge>
              ) : (
                <StatusBadge tone="neutral">لم يتم تحديد سنة دراسية</StatusBadge>
              )}
            </div>

            {canSee || canSeeFinance ? (
              <nav className="madar-dashboard__quick" aria-label="وصول سريع">
                <span>وصول سريع</span>
                {canSee ? (
                  <>
                    <Link to="/students">
                      <Users aria-hidden="true" />
                      سجل الطلاب
                      <ChevronLeft aria-hidden="true" />
                    </Link>
                    <Link to="/admissions">
                      <UserPlus aria-hidden="true" />
                      التسجيل والقبول
                      <ChevronLeft aria-hidden="true" />
                    </Link>
                  </>
                ) : null}
                {canSeeFinance ? (
                  <Link to="/payments" search={{ tab: "payments" }}>
                    <Wallet aria-hidden="true" />
                    الأقساط والمدفوعات
                    <ChevronLeft aria-hidden="true" />
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </div>
        </div>

        {/* KPIs */}
        <section
          className="madar-dashboard__kpis grid grid-cols-2 gap-3 lg:grid-cols-4"
          aria-label="مؤشرات المدرسة"
        >
          <Kpi
            primary
            label="إجمالي الطلاب"
            icon={Users}
            value={canSee ? d?.active : undefined}
            pending={
              !canSee
                ? "غير متاح لدورك"
                : loading
                  ? "جارٍ تحميل البيانات…"
                  : q.isError
                    ? "تعذر تحميل البيانات"
                    : "لا توجد بيانات بعد"
            }
            sub={
              canSee && d
                ? `${d.yearRegistrations} تسجيل في ${activeYear?.name ?? "السنة الحالية"}`
                : undefined
            }
          />
          <Kpi
            label="التحصيل هذا الشهر"
            pending={
              !canSeeFinance
                ? "غير متاح لدورك"
                : loading
                  ? "جارٍ تحميل البيانات…"
                  : q.isError
                    ? "تعذر تحميل البيانات"
                    : "لا توجد بيانات بعد"
            }
            icon={Wallet}
            value={
              canSeeFinance && d
                ? fmtMoney(d.collectedThisMonth, activeSchool?.currency)
                : undefined
            }
            sub={canSeeFinance ? "الدفعات المكتملة" : undefined}
          />
          <Kpi
            label="المبالغ المستحقة"
            pending={
              !canSeeFinance
                ? "غير متاح لدورك"
                : loading
                  ? "جارٍ تحميل البيانات…"
                  : q.isError
                    ? "تعذر تحميل البيانات"
                    : "لا توجد بيانات بعد"
            }
            icon={Receipt}
            value={canSeeFinance && d ? fmtMoney(d.outstanding, activeSchool?.currency) : undefined}
            sub={canSeeFinance ? "الرصيد المتبقي على الطلاب" : undefined}
          />
          <Kpi
            label="المصروفات هذا الشهر"
            pending={
              !canSeeFinance
                ? "غير متاح لدورك"
                : loading
                  ? "جارٍ تحميل البيانات…"
                  : q.isError
                    ? "تعذر تحميل البيانات"
                    : "لا توجد بيانات بعد"
            }
            icon={CalendarCheck}
            value={
              canSeeFinance && d ? fmtMoney(d.expensesThisMonth, activeSchool?.currency) : undefined
            }
            sub={canSeeFinance ? "المصروفات المسجلة فقط" : undefined}
          />
        </section>

        {/* Action center */}
        <Panel
          className="madar-dashboard__attention"
          icon={AlertTriangle}
          title="يحتاج انتباهك"
          description="أولويات المتابعة من بيانات المدرسة"
          accent
        >
          {attentionError ? (
            <p role="alert" className="madar-dashboard__notice">
              تعذر تحميل بعض التنبيهات. قد تكون القائمة غير مكتملة.
            </p>
          ) : null}
          {alerts.length ? (
            <>
              <ul className="madar-dashboard__alerts">
                {orderedAlerts.map((a) => (
                  <li key={a.title}>
                    <Link
                      to={a.to}
                      className="madar-dashboard__alert group"
                      data-severity={
                        a.to === "/complaints"
                          ? "high"
                          : a.to === "/tasks" && tasksQ.data?.overdue
                            ? "warning"
                            : a.to === "/inventory" || a.to === "/assets"
                              ? "warning"
                              : "info"
                      }
                    >
                      <span className="madar-dashboard__alert-icon">
                        <a.icon aria-hidden="true" className="size-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="madar-dashboard__alert-title">{a.title}</span>
                        <span className="madar-dashboard__alert-detail">{a.detail}</span>
                      </span>
                      <span className="madar-dashboard__alert-count tnum">{a.count}</span>
                      <span className="madar-dashboard__alert-footer">
                        <span className="madar-dashboard__severity">
                          {a.to === "/complaints"
                            ? "أولوية عالية"
                            : a.to === "/tasks" && tasksQ.data?.overdue
                              ? "مهام متأخرة"
                              : a.to === "/tasks"
                                ? "قريبة الاستحقاق"
                                : a.to === "/inventory" || a.to === "/assets"
                                  ? "تحتاج متابعة"
                                  : "للمراجعة"}
                        </span>
                        <span>
                          متابعة <ChevronLeft aria-hidden="true" />
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : attentionLoading ? (
            <Quiet icon={ClipboardList} text="جارٍ تحميل التنبيهات…" compact />
          ) : attentionError ? null : (
            <div className="madar-dashboard__clear flex items-center gap-3 py-2">
              <ShieldCheck className="size-5 text-primary" />
              <p className="text-sm text-muted-foreground">
                لا توجد تنبيهات حالياً — كل شيء تحت السيطرة.
              </p>
            </div>
          )}
        </Panel>

        <section className="madar-dashboard__workspace" aria-label="المالية والعمليات اليومية">
          <Panel
            className="madar-dashboard__attendance"
            icon={CalendarCheck}
            title="حضور اليوم"
            description="السجلات المحفوظة للطلاب والموظفين"
          >
            <div className="madar-dashboard__attendance-body">
              {showStudentAttendance ? (
                <AttendanceDashboardRow
                  label="الطلاب"
                  percentage={d?.studentToday.percentage ?? null}
                  detail={
                    !activeYear
                      ? "اختر سنة دراسية لعرض حضور الطلاب"
                      : loading
                        ? "جارٍ تحميل السجلات…"
                        : q.isError
                          ? "تعذر تحميل السجلات"
                          : d
                            ? d.studentToday.recorded
                              ? `${d.studentToday.counts.get("absent") ?? 0} غائب · ${d.studentToday.counts.get("late") ?? 0} متأخر`
                              : "لم يُسجّل حضور الطلاب اليوم"
                            : "لا تتوفر سجلات للعرض"
                  }
                />
              ) : null}
              {showStaffAttendance ? (
                <AttendanceDashboardRow
                  label="الموظفون"
                  percentage={d?.staffToday.percentage ?? null}
                  detail={
                    !canSeeStaff
                      ? "لا تتوفر سجلات للعرض"
                      : loading
                        ? "جارٍ تحميل السجلات…"
                        : q.isError
                          ? "تعذر تحميل السجلات"
                          : d
                            ? d.staffToday.recorded
                              ? `${d.staffToday.counts.get("absent") ?? 0} غائب · ${d.staffToday.counts.get("leave") ?? 0} إجازة`
                              : "لم يُسجّل حضور الموظفين اليوم"
                            : "لا تتوفر سجلات للعرض"
                  }
                />
              ) : null}
              {!showStudentAttendance && !showStaffAttendance ? (
                <Quiet icon={CalendarCheck} text="غير متاح لدورك." compact />
              ) : null}
            </div>
            <nav className="madar-dashboard__attendance-actions" aria-label="صفحات الحضور">
              {showStudentAttendance && activeYear ? (
                <Link to="/student-attendance">
                  حضور الطلاب
                  <ChevronLeft aria-hidden="true" />
                </Link>
              ) : null}
              {showStaffAttendance ? (
                <Link to="/staff-attendance">
                  حضور الموظفين
                  <ChevronLeft aria-hidden="true" />
                </Link>
              ) : null}
            </nav>
          </Panel>
          <Panel
            className="madar-dashboard__finance"
            icon={LineChart}
            title="الحركة المالية"
            description={activeYear ? `السنة الدراسية ${activeYear.name}` : "التحصيل والمصروفات"}
          >
            {canSeeFinance && d?.financeMonths.some((row) => row.collections || row.expenses) ? (
              <FinanceChart rows={d.financeMonths} currency={activeSchool?.currency ?? "USD"} />
            ) : (
              <Quiet
                icon={LineChart}
                text={
                  canSeeFinance
                    ? !activeYear
                      ? "اختر سنة دراسية لعرض الحركة المالية."
                      : loading
                        ? "جارٍ تحميل الحركة المالية…"
                        : q.isError
                          ? "تعذر تحميل الحركة المالية."
                          : "لا توجد حركة مالية مسجلة لهذه السنة بعد."
                    : "غير متاح لدورك."
                }
                compact
              />
            )}
            {canSeeFinance ? (
              <Link
                className="madar-dashboard__text-action"
                to="/payments"
                search={{ tab: "payments" }}
              >
                عرض المدفوعات
                <ChevronLeft aria-hidden="true" />
              </Link>
            ) : null}
          </Panel>
          <Panel
            className="madar-dashboard__distribution"
            icon={Layers}
            title="الطلاب حسب المرحلة"
            description="التسجيلات الفعالة هذه السنة"
          >
            {canSee && d?.byStage.length ? (
              <>
                <div className="madar-dashboard__distribution-total">
                  <strong className="tnum">{d.yearRegistrations.toLocaleString("ar")}</strong>
                  <span>تسجيل في السنة الدراسية</span>
                </div>
                <ul className="space-y-2.5">
                  {d.byStage.map((row) => {
                    const pct = d.yearRegistrations
                      ? Math.round((row.count / d.yearRegistrations) * 100)
                      : 0;
                    return (
                      <li key={row.name} className="space-y-1.5">
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="font-medium text-foreground">{row.name}</span>
                          <span className="tnum shrink-0 text-muted-foreground">
                            {row.count} <span className="text-xs">({pct}%)</span>
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <Quiet
                icon={Layers}
                text={
                  !canSee
                    ? "غير متاح لدورك."
                    : loading
                      ? "جارٍ تحميل توزيع الطلاب…"
                      : q.isError
                        ? "تعذر تحميل توزيع الطلاب."
                        : "لا توجد بيانات تسجيل حسب المرحلة بعد."
                }
              />
            )}
          </Panel>
          {/* Activity */}
          <section className="madar-dashboard__activity" aria-label="آخر العمليات">
            <Panel
              icon={Wallet}
              title="آخر المدفوعات"
              description="أحدث الدفعات المسجلة"
              link={canSeeFinance ? { to: "/payments", label: "عرض الكل" } : undefined}
            >
              {canSeeFinance && d?.recentPayments.length ? (
                <ul className="madar-dashboard__recent">
                  {d.recentPayments.map((payment) => (
                    <li key={payment.id} className="madar-dashboard__recent-row">
                      <span className="madar-dashboard__recent-icon">
                        <Wallet aria-hidden="true" className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {payment.student?.full_name ?? "طالب"}
                        </span>
                        <span className="madar-dashboard__recent-meta">
                          <span dir="ltr" className="tnum">
                            {payment.payment_number}
                          </span>
                          <time dateTime={payment.payment_date}>
                            {fmtDate(payment.payment_date)}
                          </time>
                        </span>
                      </span>
                      <span className="madar-dashboard__recent-amount">
                        <strong className="tnum">
                          {fmtMoney(toCents(payment.amount), activeSchool?.currency)}
                        </strong>
                        {payment.status === "completed" ? (
                          <span className="madar-dashboard__paid">
                            <CheckCircle2 aria-hidden="true" />
                            مكتملة
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Quiet
                  icon={Wallet}
                  text={
                    !canSeeFinance
                      ? "غير متاح لدورك."
                      : loading
                        ? "جارٍ تحميل المدفوعات…"
                        : q.isError
                          ? "تعذر تحميل المدفوعات."
                          : "لم تُسجَّل أي دفعات بعد."
                  }
                />
              )}
            </Panel>
            <Panel
              icon={UserPlus}
              title="أحدث التسجيلات"
              description="آخر طلبات القبول الواردة"
              link={canSee ? { to: "/admissions", label: "عرض الكل" } : undefined}
            >
              {canSee && d?.recentApps.length ? (
                <ul className="madar-dashboard__recent">
                  {d.recentApps.map((a) => (
                    <li key={a.id} className="madar-dashboard__recent-row">
                      <span className="madar-dashboard__recent-icon">
                        {a.student_first_name.charAt(0)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {a.student_first_name} {a.student_last_name}
                        </span>
                        <time className="madar-dashboard__recent-meta" dateTime={a.submitted_at}>
                          {fmtDate(a.submitted_at)}
                        </time>
                      </span>
                      <StatusBadge
                        tone={
                          a.status === "accepted" || a.status === "enrolled"
                            ? "success"
                            : a.status === "rejected"
                              ? "danger"
                              : "info"
                        }
                      >
                        {APP_STATUS[a.status] ?? a.status}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
              ) : (
                <Quiet
                  icon={Inbox}
                  text={
                    !canSee
                      ? "غير متاح لدورك."
                      : loading
                        ? "جارٍ تحميل طلبات القبول…"
                        : q.isError
                          ? "تعذر تحميل طلبات القبول."
                          : "لا توجد طلبات قبول بعد."
                  }
                />
              )}
            </Panel>
          </section>
        </section>
      </div>
    </AppShell>
  );
}

const APP_STATUS: Record<string, string> = {
  new: "جديد",
  under_review: "قيد المراجعة",
  accepted: "مقبول",
  rejected: "مرفوض",
  waiting: "انتظار",
  enrolled: "مسجّل",
};

function Kpi({
  label,
  icon: Icon,
  value,
  sub,
  pending,
  primary,
}: {
  label: string;
  icon: LucideIcon;
  value?: number | string | undefined;
  sub?: string | undefined;
  pending?: string;
  primary?: boolean;
}) {
  const has = value !== undefined;
  return (
    <div
      className={cn(
        "madar-dashboard__kpi relative flex min-h-32 min-w-0 flex-col rounded-lg border border-border bg-card p-4 shadow-card",
        primary && "madar-dashboard__kpi--primary",
      )}
    >
      <div className="madar-dashboard__kpi-heading flex items-center gap-2.5">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md",
            primary ? "bg-primary text-primary-foreground" : "bg-secondary text-primary",
          )}
        >
          <Icon className="size-[18px]" />
        </span>
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
      </div>
      {has ? (
        <p className="tnum mt-2 break-words text-2xl font-bold leading-tight text-primary">
          {typeof value === "number" ? value.toLocaleString("ar") : value}
        </p>
      ) : (
        <p className="mt-2 text-2xl font-semibold text-muted-foreground/70">—</p>
      )}
      <p className="madar-dashboard__kpi-context mt-auto pt-1.5 text-xs text-muted-foreground">
        {has ? sub : (pending ?? "لا توجد بيانات بعد")}
      </p>
    </div>
  );
}

function Panel({
  title,
  description,
  children,
  className,
  accent,
  link,
  icon: Icon,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
  accent?: boolean;
  link?: { to: "/admissions" | "/payments"; label: string } | undefined;
  icon?: LucideIcon;
}) {
  return (
    <div
      className={cn(
        "madar-dashboard__panel min-w-0 border-b border-border py-3",
        accent && "madar-dashboard__panel--attention",
        className,
      )}
    >
      <div className="madar-dashboard__panel-heading mb-3 flex items-start justify-between gap-3">
        <div className="madar-dashboard__panel-title space-y-0.5">
          {Icon ? (
            <span className="madar-dashboard__panel-icon">
              <Icon aria-hidden="true" />
            </span>
          ) : null}
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            {title}
          </h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {link ? (
          <Link
            to={link.to}
            search={link.to === "/payments" ? { tab: "payments" } : {}}
            className="flex shrink-0 items-center gap-1 py-1 text-xs font-medium text-primary hover:underline"
          >
            {link.label}
            <ChevronLeft className="size-3.5" />
          </Link>
        ) : null}
      </div>
      {children}
    </div>
  );
}

type FinanceMonth = {
  key: string;
  label: string;
  collections: number;
  expenses: number;
};

function buildFinanceMonths(
  startDate: string,
  endDate: string,
  payments: { amount: number; payment_date: string }[],
  expenses: { amount: number; expense_date: string }[],
): FinanceMonth[] {
  const start = new Date(`${startDate.slice(0, 7)}-01T00:00:00`);
  const end = new Date(`${endDate.slice(0, 7)}-01T00:00:00`);
  const rows: FinanceMonth[] = [];

  for (const cursor = new Date(start); cursor <= end; cursor.setMonth(cursor.getMonth() + 1)) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    rows.push({
      key,
      label: new Intl.DateTimeFormat("ar", { month: "short", year: "2-digit" }).format(cursor),
      collections: payments
        .filter((payment) => payment.payment_date.startsWith(key))
        .reduce((sum, payment) => sum + toCents(payment.amount), 0),
      expenses: expenses
        .filter((expense) => expense.expense_date.startsWith(key))
        .reduce((sum, expense) => sum + toCents(expense.amount), 0),
    });
  }

  return rows;
}

function FinanceChart({ rows, currency }: { rows: FinanceMonth[]; currency: string }) {
  const maximum = Math.max(1, ...rows.flatMap((row) => [row.collections, row.expenses]));
  const recordedRows = rows.filter((row) => row.collections || row.expenses);

  if (recordedRows.length < 4) {
    return (
      <div className="madar-dashboard__sparse-finance">
        <p>الأشهر التي تحتوي على حركة مالية مسجلة فقط</p>
        <ul>
          {recordedRows.map((row) => (
            <li key={row.key}>
              <span className="madar-dashboard__sparse-month">{row.label}</span>
              <dl>
                <div>
                  <dt>
                    <span className="madar-dashboard__legend-dot" />
                    التحصيل
                  </dt>
                  <dd className="tnum">{fmtMoney(row.collections, currency)}</dd>
                </div>
                <div>
                  <dt>
                    <span className="madar-dashboard__legend-dot madar-dashboard__legend-dot--gold" />
                    المصروفات
                  </dt>
                  <dd className="tnum">{fmtMoney(row.expenses, currency)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="madar-dashboard__coverage-note">الأشهر التي تحتوي على حركة مالية مسجلة فقط</p>
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-primary" />
          التحصيل
        </span>
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-gold" />
          المصروفات
        </span>
      </div>
      <div className="madar-dashboard__chart pb-1">
        <div className="madar-dashboard__axis" aria-hidden="true">
          <span>{fmtMoney(maximum, currency)}</span>
          <span>{fmtMoney(maximum / 2, currency)}</span>
          <span>{fmtMoney(0, currency)}</span>
        </div>
        <div
          className="madar-dashboard__months flex min-w-0 items-end gap-2"
          role="img"
          aria-label={`الأشهر ذات الحركة المالية المسجلة: ${recordedRows.map((row) => `${row.label}: التحصيل ${fmtMoney(row.collections, currency)}، المصروفات ${fmtMoney(row.expenses, currency)}`).join("؛ ")}`}
        >
          {recordedRows.map((row) => (
            <div key={row.key} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div className="madar-dashboard__bars flex w-full items-end justify-center gap-1 border-b border-border">
                <div
                  className="w-2/5 rounded-t-sm bg-primary transition-[height]"
                  style={{
                    height: `${Math.max(row.collections ? 4 : 0, (row.collections / maximum) * 100)}%`,
                  }}
                  title={`التحصيل: ${fmtMoney(row.collections, currency)}`}
                />
                <div
                  className="w-2/5 rounded-t-sm bg-gold/70 transition-[height]"
                  style={{
                    height: `${Math.max(row.expenses ? 4 : 0, (row.expenses / maximum) * 100)}%`,
                  }}
                  title={`المصروفات: ${fmtMoney(row.expenses, currency)}`}
                />
              </div>
              <span className="madar-dashboard__month-label text-[11px] text-muted-foreground">
                {row.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AttendanceDashboardRow({
  label,
  percentage,
  detail,
}: {
  label: string;
  percentage: number | null;
  detail: string;
}) {
  return (
    <div className="madar-dashboard__attendance-row">
      <span
        className="madar-dashboard__attendance-ring tnum"
        data-empty={percentage === null}
        style={
          percentage === null
            ? undefined
            : { background: `conic-gradient(var(--madar-navy) ${percentage}%, #e9eef1 0)` }
        }
      >
        <span>{percentage === null ? <CalendarCheck aria-hidden="true" /> : `${percentage}%`}</span>
      </span>
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function Quiet({
  icon: Icon,
  text,
  tall,
  compact,
}: {
  icon: LucideIcon;
  text: string;
  tall?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "madar-dashboard__empty flex items-center gap-2 text-muted-foreground",
        compact ? "py-1.5" : "flex-col justify-center px-3 text-center",
        !compact && (tall ? "min-h-36" : "py-4"),
      )}
    >
      <Icon className="size-4 shrink-0" />
      <p className="text-xs text-muted-foreground">{text}</p>
    </div>
  );
}
