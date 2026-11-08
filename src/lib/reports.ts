import { completeRead, completeQueries } from "@/lib/supabase-read";
import { ASSET_CONDITION, ASSET_STATUS, fetchAssets } from "@/lib/assets";
import { STAFF_ATTENDANCE_STATUS, STUDENT_ATTENDANCE_STATUS } from "@/lib/attendance";
import { CASE_PRIORITIES, CASE_STATUSES, CASE_TYPES, fetchCases } from "@/lib/cases";
import { EXPENSE_STATUS, fetchExpenses, fetchFinance, fmtMoney, toCents } from "@/lib/finance";
import { fetchInventory, formatQuantity, STOCK_STATUS } from "@/lib/inventory";
import { EMPLOYEE_STATUS, EMPLOYMENT_TYPE, fetchStaff } from "@/lib/staff";
import { ADMISSION_STATUS } from "@/lib/students";
import { TASK_PRIORITY, TASK_STATUS, fetchTasks } from "@/lib/tasks";
import { supabase } from "@/integrations/supabase/client";
import { settingsClient } from "@/lib/settings";

export type ReportId =
  | "students"
  | "admissions"
  | "finance"
  | "expenses"
  | "student_attendance"
  | "staff_attendance"
  | "employees"
  | "inventory"
  | "assets"
  | "tasks"
  | "cases";

export type ReportCell = string | number;
export type ReportRow = Record<string, ReportCell> & { _id: string; _date?: string };
export type ReportColumn = { key: string; label: string };
export type ReportFilter = {
  key: string;
  label: string;
  options: { value: string; label: string }[];
};
export type ReportCard = { label: string; value: string | number; hint?: string };
export type ReportDefinition = {
  id: ReportId;
  title: string;
  description: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  filters: ReportFilter[];
  dateRelevant: boolean;
  yearRelevant: boolean;
  error: string | null;
  summarize: (rows: ReportRow[]) => ReportCard[];
};
export type ReportsData = Record<ReportId, ReportDefinition>;

type AcademicData = {
  students: { id: string; full_name: string; student_number: string; status: string }[];
  enrollments: {
    id: string;
    student_id: string;
    grade_id: string;
    section_id: string | null;
    enrollment_status: string;
    start_date: string;
  }[];
  stages: { id: string; name: string }[];
  grades: { id: string; name: string; stage_id: string }[];
  sections: { id: string; name: string; grade_id: string }[];
};

const unavailable = "هذا التقرير غير متاح لصلاحيات حسابك.";
const result = <T>(settled: PromiseSettledResult<T>) =>
  settled.status === "fulfilled"
    ? { data: settled.value, error: null }
    : { data: null, error: unavailable };
const label = (map: Record<string, { label: string }>, key: string) => map[key]?.label ?? key;
const simpleLabel = (map: Record<string, string>, key: string) => map[key] ?? key;
const countBy = (rows: ReportRow[], key: string, value: string) =>
  rows.filter((row) => row[key] === value).length;

async function fetchAcademic(
  schoolId: string,
  yearId: string,
  client = supabase,
): Promise<AcademicData> {
  const [students, enrollments, stages, grades, sections] = await completeQueries([
    client.from("students").select("id,full_name,student_number,status").eq("school_id", schoolId),
    client
      .from("student_enrollments")
      .select("id,student_id,grade_id,section_id,enrollment_status,start_date")
      .eq("school_id", schoolId)
      .eq("academic_year_id", yearId),
    client.from("stages").select("id,name").eq("school_id", schoolId),
    client.from("grades").select("id,name,stage_id").eq("school_id", schoolId),
    client.from("sections").select("id,name,grade_id").eq("school_id", schoolId),
  ]);
  for (const query of [students, enrollments, stages, grades, sections]) {
    if (query.error) throw query.error;
  }
  return {
    students: students.data ?? [],
    enrollments: enrollments.data ?? [],
    stages: stages.data ?? [],
    grades: grades.data ?? [],
    sections: sections.data ?? [],
  };
}

async function fetchAdmissions(schoolId: string, yearId: string, client = supabase) {
  const { data, error } = await completeRead(
    client
      .from("admission_applications")
      .select(
        "id,application_number,student_first_name,student_middle_name,student_last_name,guardian_name,guardian_phone,requested_grade_id,status,submitted_at",
      )
      .eq("school_id", schoolId)
      .eq("academic_year_id", yearId)
      .order("submitted_at", { ascending: false }),
  );
  if (error) throw error;
  return data ?? [];
}

async function fetchStudentAttendance(schoolId: string, yearId: string, client = supabase) {
  const { data, error } = await completeRead(
    client
      .from("student_attendance")
      .select("id,student_id,attendance_date,status,notes")
      .eq("school_id", schoolId)
      .eq("academic_year_id", yearId)
      .order("attendance_date", { ascending: false }),
  );
  if (error) throw error;
  return data ?? [];
}

async function fetchStaffAttendance(schoolId: string, client = supabase) {
  const { data, error } = await completeRead(
    client
      .from("staff_attendance")
      .select("id,employee_id,attendance_date,status,check_in,check_out,notes")
      .eq("school_id", schoolId)
      .order("attendance_date", { ascending: false }),
  );
  if (error) throw error;
  return data ?? [];
}

export async function fetchReports(
  schoolId: string,
  yearId: string,
  currency = "USD",
  client = supabase,
  selected?: ReportId,
): Promise<ReportsData> {
  const access = await settingsClient(client).rpc("can_access_reports", { _school_id: schoolId });
  if (access.error) throw access.error;
  if (!access.data) throw new Error("لا تملك صلاحية عرض التقارير.");
  const needed = (...ids: ReportId[]) => !selected || ids.includes(selected);
  const settled = await Promise.allSettled([
    needed("students", "admissions", "finance", "student_attendance")
      ? fetchAcademic(schoolId, yearId, client)
      : undefined,
    needed("admissions") ? fetchAdmissions(schoolId, yearId, client) : undefined,
    needed("finance") ? fetchFinance(schoolId, yearId, undefined, client) : undefined,
    needed("expenses") ? fetchExpenses(schoolId, yearId, client) : undefined,
    needed("student_attendance") ? fetchStudentAttendance(schoolId, yearId, client) : undefined,
    needed("staff_attendance") ? fetchStaffAttendance(schoolId, client) : undefined,
    needed("employees", "staff_attendance") ? fetchStaff(schoolId, client) : undefined,
    needed("inventory") ? fetchInventory(schoolId, client) : undefined,
    needed("assets") ? fetchAssets(schoolId, undefined, client) : undefined,
    needed("tasks") ? fetchTasks(schoolId, undefined, client) : undefined,
    needed("cases") ? fetchCases(schoolId, undefined, client) : undefined,
  ] as const);
  const academic = result(settled[0]);
  const admissions = result(settled[1]);
  const finance = result(settled[2]);
  const expenses = result(settled[3]);
  const studentAttendance = result(settled[4]);
  const staffAttendance = result(settled[5]);
  const staff = result(settled[6]);
  const inventory = result(settled[7]);
  const assets = result(settled[8]);
  const tasks = result(settled[9]);
  const cases = result(settled[10]);

  const studentNames = new Map(academic.data?.students.map((x) => [x.id, x]) ?? []);
  const gradeNames = new Map(academic.data?.grades.map((x) => [x.id, x]) ?? []);
  const stageNames = new Map(academic.data?.stages.map((x) => [x.id, x.name]) ?? []);
  const sectionNames = new Map(academic.data?.sections.map((x) => [x.id, x.name]) ?? []);
  const employeeNames = new Map(staff.data?.employees.map((x) => [x.id, x.full_name]) ?? []);

  const studentRows: ReportRow[] = (academic.data?.enrollments ?? []).map((enrollment) => {
    const student = studentNames.get(enrollment.student_id);
    const grade = gradeNames.get(enrollment.grade_id);
    return {
      _id: enrollment.id,
      _date: enrollment.start_date,
      student_number: student?.student_number ?? "—",
      student_name: student?.full_name ?? "—",
      stage: grade ? (stageNames.get(grade.stage_id) ?? "—") : "—",
      grade: grade?.name ?? "—",
      section: enrollment.section_id ? (sectionNames.get(enrollment.section_id) ?? "—") : "—",
      status: enrollment.enrollment_status,
    };
  });

  const admissionRows: ReportRow[] = (admissions.data ?? []).map((item) => ({
    _id: item.id,
    _date: item.submitted_at.slice(0, 10),
    application_number: item.application_number,
    student_name: [item.student_first_name, item.student_middle_name, item.student_last_name]
      .filter(Boolean)
      .join(" "),
    guardian: item.guardian_name,
    phone: item.guardian_phone,
    grade: gradeNames.get(item.requested_grade_id)?.name ?? "—",
    status: label(ADMISSION_STATUS, item.status),
    status_key: item.status,
    submitted_at: item.submitted_at.slice(0, 10),
  }));

  const feesByStudent = new Map<
    string,
    { total: number; paid: number; balance: number; count: number }
  >();
  for (const fee of finance.data?.fees ?? []) {
    if (fee.status === "cancelled" || fee.status === "waived") continue;
    const current = feesByStudent.get(fee.student_id) ?? {
      total: 0,
      paid: 0,
      balance: 0,
      count: 0,
    };
    current.total += toCents(fee.final_amount);
    current.paid += toCents(fee.amount_paid);
    current.balance += toCents(fee.balance);
    current.count += 1;
    feesByStudent.set(fee.student_id, current);
  }
  const financeRows: ReportRow[] = [...feesByStudent.entries()].map(([studentId, totals]) => ({
    _id: studentId,
    student_number: studentNames.get(studentId)?.student_number ?? "—",
    student_name:
      studentNames.get(studentId)?.full_name ??
      finance.data?.students.find((x) => x.id === studentId)?.full_name ??
      "—",
    fee_count: totals.count,
    total: fmtMoney(totals.total, currency),
    collected: fmtMoney(totals.paid, currency),
    outstanding: fmtMoney(totals.balance, currency),
    collection_state: totals.balance > 0 ? "متبقي" : "مسدد",
    _total: totals.total,
    _collected: totals.paid,
    _outstanding: totals.balance,
  }));

  const expenseRows: ReportRow[] = (expenses.data?.expenses ?? []).map((item) => ({
    _id: item.id,
    _date: item.expense_date,
    number: item.expense_number,
    date: item.expense_date,
    title: item.title,
    category: item.category_name,
    cost_center: item.cost_center_name ?? "—",
    amount: fmtMoney(toCents(item.amount), item.currency),
    _amount: toCents(item.amount),
    status: label(EXPENSE_STATUS, item.status),
    status_key: item.status,
  }));

  const studentAttendanceRows: ReportRow[] = (studentAttendance.data ?? []).map((item) => ({
    _id: item.id,
    _date: item.attendance_date,
    date: item.attendance_date,
    student_number: studentNames.get(item.student_id)?.student_number ?? "—",
    student_name: studentNames.get(item.student_id)?.full_name ?? "—",
    status: label(STUDENT_ATTENDANCE_STATUS, item.status),
    status_key: item.status,
    notes: item.notes ?? "—",
  }));
  const staffAttendanceRows: ReportRow[] = (staffAttendance.data ?? []).map((item) => ({
    _id: item.id,
    _date: item.attendance_date,
    date: item.attendance_date,
    employee_name: employeeNames.get(item.employee_id) ?? "—",
    status: label(STAFF_ATTENDANCE_STATUS, item.status),
    status_key: item.status,
    check_in: item.check_in ?? "—",
    check_out: item.check_out ?? "—",
    notes: item.notes ?? "—",
  }));

  const employeeRows: ReportRow[] = (staff.data?.employees ?? []).map((item) => ({
    _id: item.id,
    _date: item.hire_date,
    employee_number: item.employee_number,
    full_name: item.full_name,
    job_title: item.job_title,
    department: item.department_name ?? "—",
    employment_type: simpleLabel(EMPLOYMENT_TYPE, item.employment_type),
    hire_date: item.hire_date,
    status: label(EMPLOYEE_STATUS, item.status),
    status_key: item.status,
    teacher: item.is_teacher ? "معلم" : "إداري",
  }));
  const inventoryRows: ReportRow[] = (inventory.data?.items ?? []).map((item) => ({
    _id: item.id,
    item_code: item.item_code,
    name: item.name,
    category: item.category_name,
    balance: formatQuantity(item.balance),
    minimum: formatQuantity(Number(item.minimum_stock)),
    unit: item.unit,
    location: item.storage_location ?? "—",
    status: STOCK_STATUS[item.stock_status].label,
    status_key: item.stock_status,
  }));
  const assetRows: ReportRow[] = (assets.data?.assets ?? []).map((item) => ({
    _id: item.id,
    ...(item.purchase_date ? { _date: item.purchase_date } : {}),
    asset_code: item.asset_code,
    name: item.name,
    category: item.category_name,
    location: item.location,
    assigned_to: item.assigned_employee_name ?? "—",
    condition: ASSET_CONDITION[item.condition],
    status: ASSET_STATUS[item.status].label,
    status_key: item.status,
  }));
  const taskRows: ReportRow[] = (tasks.data?.tasks ?? []).map((item) => ({
    _id: item.id,
    _date: item.created_at.slice(0, 10),
    title: item.title,
    assignee: item.assigned_name ?? "بدون إسناد",
    priority: TASK_PRIORITY[item.priority].label,
    priority_key: item.priority,
    status: TASK_STATUS[item.status].label,
    status_key: item.status,
    due_date: item.due_date ?? "—",
    created_at: item.created_at.slice(0, 10),
  }));
  const caseRows: ReportRow[] = (cases.data?.cases ?? []).map((item) => ({
    _id: item.id,
    _date: item.created_at.slice(0, 10),
    case_number: item.case_number,
    title: item.title,
    type: CASE_TYPES[item.type].label,
    category: item.category,
    related: item.student_name ?? item.guardian_name ?? item.employee_name ?? "حالة عامة",
    priority: CASE_PRIORITIES[item.priority].label,
    priority_key: item.priority,
    status: CASE_STATUSES[item.status].label,
    status_key: item.status,
    created_at: item.created_at.slice(0, 10),
  }));

  return {
    students: report(
      "students",
      "الطلاب حسب الهيكل الأكاديمي",
      "توزيع تسجيلات الطلاب على المراحل والصفوف والشعب.",
      [
        ["student_number", "رقم الطالب"],
        ["student_name", "الطالب"],
        ["stage", "المرحلة"],
        ["grade", "الصف"],
        ["section", "الشعبة"],
        ["status", "حالة التسجيل"],
      ],
      studentRows,
      academic.error,
      [
        rowFilter(studentRows, "stage", "المرحلة"),
        rowFilter(studentRows, "grade", "الصف"),
        rowFilter(studentRows, "section", "الشعبة", "—"),
        rowFilter(studentRows, "status", "حالة التسجيل"),
      ],
      true,
      true,
      (rows) => [
        card("إجمالي التسجيلات", rows.length),
        card("المراحل", unique(rows, "stage")),
        card("الصفوف", unique(rows, "grade")),
        card("الشعب", unique(rows, "section", "—")),
      ],
    ),
    admissions: report(
      "admissions",
      "حالات القبول والتسجيل",
      "طلبات القبول وحالتها خلال السنة الدراسية.",
      [
        ["application_number", "رقم الطلب"],
        ["student_name", "الطالب"],
        ["guardian", "ولي الأمر"],
        ["phone", "الهاتف"],
        ["grade", "الصف المطلوب"],
        ["status", "الحالة"],
        ["submitted_at", "تاريخ التقديم"],
      ],
      admissionRows,
      admissions.error,
      [
        rowFilter(admissionRows, "grade", "الصف المطلوب"),
        rowFilter(admissionRows, "status_key", "الحالة", undefined, "status"),
      ],
      true,
      true,
      (rows) => [
        card("إجمالي الطلبات", rows.length),
        card("جديدة", countBy(rows, "status_key", "new")),
        card("قيد المراجعة", countBy(rows, "status_key", "under_review")),
        card(
          "مقبولة/مسجلة",
          countBy(rows, "status_key", "accepted") + countBy(rows, "status_key", "enrolled"),
        ),
      ],
    ),
    finance: report(
      "finance",
      "الرسوم والتحصيل والأرصدة",
      "ملخص الرسوم الفعلية والتحصيل والرصيد لكل طالب.",
      [
        ["student_number", "رقم الطالب"],
        ["student_name", "الطالب"],
        ["fee_count", "عدد الرسوم"],
        ["total", "إجمالي الرسوم"],
        ["collected", "المحصّل"],
        ["outstanding", "المتبقي"],
        ["collection_state", "حالة التحصيل"],
      ],
      financeRows,
      finance.error,
      [rowFilter(financeRows, "collection_state", "حالة التحصيل")],
      false,
      true,
      (rows) => [
        card("إجمالي الرسوم", fmtMoney(sumInternal(rows, "_total"), currency)),
        card("التحصيل", fmtMoney(sumInternal(rows, "_collected"), currency)),
        card("الأرصدة القائمة", fmtMoney(sumInternal(rows, "_outstanding"), currency)),
        card("طلاب لديهم رسوم", rows.length),
      ],
    ),
    expenses: report(
      "expenses",
      "المصروفات",
      "سندات الصرف المسجلة بحسب الفترة.",
      [
        ["number", "رقم السند"],
        ["date", "التاريخ"],
        ["title", "البيان"],
        ["category", "التصنيف"],
        ["cost_center", "مركز التكلفة"],
        ["amount", "المبلغ"],
        ["status", "الحالة"],
      ],
      expenseRows,
      expenses.error,
      [
        rowFilter(expenseRows, "category", "التصنيف"),
        rowFilter(expenseRows, "cost_center", "مركز التكلفة", "—"),
        rowFilter(expenseRows, "status_key", "الحالة", undefined, "status"),
      ],
      true,
      true,
      (rows) => [
        card(
          "إجمالي المصروفات",
          fmtMoney(
            sumInternal(
              rows.filter((x) => x["status_key"] === "recorded"),
              "_amount",
            ),
            currency,
          ),
        ),
        card("عدد السجلات", rows.length),
        card("مسجلة", countBy(rows, "status_key", "recorded")),
        card("ملغاة", countBy(rows, "status_key", "cancelled")),
      ],
    ),
    student_attendance: report(
      "student_attendance",
      "حضور الطلاب",
      "سجلات حضور الطلاب بحسب التاريخ.",
      [
        ["date", "التاريخ"],
        ["student_number", "رقم الطالب"],
        ["student_name", "الطالب"],
        ["status", "الحالة"],
        ["notes", "ملاحظات"],
      ],
      studentAttendanceRows,
      studentAttendance.error,
      [rowFilter(studentAttendanceRows, "status_key", "الحالة", undefined, "status")],
      true,
      true,
      attendanceCards("student"),
    ),
    staff_attendance: report(
      "staff_attendance",
      "حضور الموظفين",
      "سجلات دوام الموظفين بحسب التاريخ.",
      [
        ["date", "التاريخ"],
        ["employee_name", "الموظف"],
        ["status", "الحالة"],
        ["check_in", "الحضور"],
        ["check_out", "الانصراف"],
        ["notes", "ملاحظات"],
      ],
      staffAttendanceRows,
      staffAttendance.error,
      [rowFilter(staffAttendanceRows, "status_key", "الحالة", undefined, "status")],
      true,
      false,
      attendanceCards("staff"),
    ),
    employees: report(
      "employees",
      "الموظفون",
      "القوى العاملة وحالتها الوظيفية.",
      [
        ["employee_number", "الرقم الوظيفي"],
        ["full_name", "الموظف"],
        ["job_title", "المسمى"],
        ["department", "القسم"],
        ["employment_type", "نوع التوظيف"],
        ["hire_date", "تاريخ التعيين"],
        ["teacher", "التصنيف"],
        ["status", "الحالة"],
      ],
      employeeRows,
      staff.error,
      [
        rowFilter(employeeRows, "department", "القسم", "—"),
        rowFilter(employeeRows, "employment_type", "نوع التوظيف"),
        rowFilter(employeeRows, "teacher", "التصنيف"),
        rowFilter(employeeRows, "status_key", "الحالة", undefined, "status"),
      ],
      true,
      false,
      (rows) => [
        card("إجمالي الموظفين", rows.length),
        card("فعالون", countBy(rows, "status_key", "active")),
        card("المعلمون", countBy(rows, "teacher", "معلم")),
        card("الإداريون", countBy(rows, "teacher", "إداري")),
      ],
    ),
    inventory: report(
      "inventory",
      "المخزون",
      "الأرصدة الحالية وحدود إعادة الطلب.",
      [
        ["item_code", "رمز الصنف"],
        ["name", "الصنف"],
        ["category", "التصنيف"],
        ["balance", "الرصيد"],
        ["minimum", "الحد الأدنى"],
        ["unit", "الوحدة"],
        ["location", "الموقع"],
        ["status", "الحالة"],
      ],
      inventoryRows,
      inventory.error,
      [
        rowFilter(inventoryRows, "category", "التصنيف"),
        rowFilter(inventoryRows, "location", "الموقع", "—"),
        rowFilter(inventoryRows, "status_key", "الحالة", undefined, "status"),
      ],
      false,
      false,
      (rows) => [
        card("إجمالي الأصناف", rows.length),
        card("طبيعي", countBy(rows, "status_key", "normal")),
        card("مخزون منخفض", countBy(rows, "status_key", "low")),
        card("نافد", countBy(rows, "status_key", "out")),
      ],
    ),
    assets: report(
      "assets",
      "حالة الأصول",
      "الأصول المسجلة وحالتها وعهدتها.",
      [
        ["asset_code", "رمز الأصل"],
        ["name", "الأصل"],
        ["category", "التصنيف"],
        ["location", "الموقع"],
        ["assigned_to", "العهدة"],
        ["condition", "الحالة الفنية"],
        ["status", "الحالة"],
      ],
      assetRows,
      assets.error,
      [
        rowFilter(assetRows, "category", "التصنيف"),
        rowFilter(assetRows, "location", "الموقع"),
        rowFilter(assetRows, "condition", "الحالة الفنية"),
        rowFilter(assetRows, "status_key", "الحالة", undefined, "status"),
      ],
      true,
      false,
      (rows) => [
        card("إجمالي الأصول", rows.length),
        card("فعالة", countBy(rows, "status_key", "active")),
        card("بعهدة", countBy(rows, "status_key", "assigned")),
        card(
          "تحتاج متابعة",
          countBy(rows, "status_key", "under_maintenance") + countBy(rows, "status_key", "damaged"),
        ),
      ],
    ),
    tasks: report(
      "tasks",
      "المهام",
      "المهام التشغيلية وحالة الإنجاز.",
      [
        ["title", "المهمة"],
        ["assignee", "المسند إليه"],
        ["priority", "الأولوية"],
        ["status", "الحالة"],
        ["due_date", "الاستحقاق"],
        ["created_at", "تاريخ الإنشاء"],
      ],
      taskRows,
      tasks.error,
      [
        rowFilter(taskRows, "assignee", "المسند إليه"),
        rowFilter(taskRows, "priority_key", "الأولوية", undefined, "priority"),
        rowFilter(taskRows, "status_key", "الحالة", undefined, "status"),
      ],
      true,
      true,
      (rows) => [
        card("إجمالي المهام", rows.length),
        card("مفتوحة", countBy(rows, "status_key", "open")),
        card("قيد التنفيذ", countBy(rows, "status_key", "in_progress")),
        card("مكتملة", countBy(rows, "status_key", "completed")),
      ],
    ),
    cases: report(
      "cases",
      "الشكاوى والحالات",
      "الحالات الداخلية المتاحة ضمن صلاحيات المستخدم.",
      [
        ["case_number", "رقم الحالة"],
        ["title", "العنوان"],
        ["type", "النوع"],
        ["category", "التصنيف"],
        ["related", "مرتبط بـ"],
        ["priority", "الأولوية"],
        ["status", "الحالة"],
        ["created_at", "تاريخ الإنشاء"],
      ],
      caseRows,
      cases.error,
      [
        rowFilter(caseRows, "type", "النوع"),
        rowFilter(caseRows, "category", "التصنيف"),
        rowFilter(caseRows, "priority_key", "الأولوية", undefined, "priority"),
        rowFilter(caseRows, "status_key", "الحالة", undefined, "status"),
      ],
      true,
      true,
      (rows) => [
        card("إجمالي الحالات", rows.length),
        card("جديدة", countBy(rows, "status_key", "new")),
        card(
          "قيد المتابعة",
          countBy(rows, "status_key", "under_review") + countBy(rows, "status_key", "in_progress"),
        ),
        card(
          "عالية/عاجلة",
          rows.filter(
            (x) =>
              ["high", "urgent"].includes(String(x["priority_key"])) &&
              !["resolved", "closed", "rejected"].includes(String(x["status_key"])),
          ).length,
        ),
      ],
    ),
  };
}

function report(
  id: ReportId,
  title: string,
  description: string,
  columns: [string, string][],
  rows: ReportRow[],
  error: string | null,
  filters: ReportFilter[],
  dateRelevant: boolean,
  yearRelevant: boolean,
  summarize: (rows: ReportRow[]) => ReportCard[],
): ReportDefinition {
  return {
    id,
    title,
    description,
    columns: columns.map(([key, label]) => ({ key, label })),
    rows,
    filters: filters.filter((filter) => filter.options.length > 1),
    error,
    dateRelevant,
    yearRelevant,
    summarize,
  };
}
const card = (label: string, value: string | number, hint?: string): ReportCard => ({
  label,
  value,
  ...(hint ? { hint } : {}),
});
const unique = (rows: ReportRow[], key: string, ignored?: string) =>
  new Set(rows.map((row) => String(row[key])).filter((value) => value && value !== ignored)).size;
const rowFilter = (
  rows: ReportRow[],
  key: string,
  label: string,
  ignored?: string,
  labelKey?: string,
): ReportFilter => {
  const options = new Map<string, string>();
  for (const row of rows) {
    const value = String(row[key] ?? "");
    if (!value || value === ignored) continue;
    options.set(value, String(row[labelKey ?? key] ?? value));
  }
  return {
    key,
    label,
    options: [...options.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "ar")),
  };
};
const sumInternal = (rows: ReportRow[], key: string) =>
  rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0);
const attendanceCards =
  (kind: "student" | "staff") =>
  (rows: ReportRow[]): ReportCard[] => {
    const present = countBy(rows, "status_key", "present");
    const absent = countBy(rows, "status_key", "absent");
    const late = countBy(rows, "status_key", "late");
    const denominator =
      present +
      absent +
      late +
      (kind === "student"
        ? countBy(rows, "status_key", "excused")
        : countBy(rows, "status_key", "leave"));
    return [
      card("إجمالي السجلات", rows.length),
      card("حاضر", present),
      card("غائب", absent),
      card("نسبة الحضور", denominator ? `${Math.round((present / denominator) * 100)}%` : "—"),
    ];
  };

export const REPORT_OPTIONS: { id: ReportId; label: string }[] = [
  { id: "students", label: "الطلاب حسب الهيكل" },
  { id: "admissions", label: "القبول والتسجيل" },
  { id: "finance", label: "الرسوم والتحصيل" },
  { id: "expenses", label: "المصروفات" },
  { id: "student_attendance", label: "حضور الطلاب" },
  { id: "staff_attendance", label: "حضور الموظفين" },
  { id: "employees", label: "الموظفون" },
  { id: "inventory", label: "المخزون" },
  { id: "assets", label: "الأصول" },
  { id: "tasks", label: "المهام" },
  { id: "cases", label: "الشكاوى والحالات" },
];

export function filterReportRows(rows: ReportRow[], fromDate: string, toDate: string) {
  return rows.filter((row) => {
    if (!row._date) return true;
    if (fromDate && row._date < fromDate) return false;
    if (toDate && row._date > toDate) return false;
    return true;
  });
}

export function exportReportCsv(
  report: Pick<ReportDefinition, "columns" | "id">,
  rows: ReportRow[],
) {
  const escape = (value: ReportCell) => `"${String(value).replace(/"/g, '""')}"`;
  const csv =
    "\uFEFF" +
    [
      report.columns.map((column) => column.label),
      ...rows.map((row) => report.columns.map((column) => row[column.key] ?? "")),
    ]
      .map((row) => row.map(escape).join(","))
      .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `madar-${report.id}-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
