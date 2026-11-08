import type { ReportId } from "@/lib/reports";
import type { Module } from "@/lib/settings";

export const MODULE_GROUPS: { label: string; modules: Module[] }[] = [
  {
    label: "الطلاب والتعليم",
    modules: ["students", "admissions", "classes", "student_attendance"],
  },
  { label: "المالية", modules: ["fees", "expenses"] },
  { label: "الموظفون", modules: ["employees", "staff_attendance"] },
  { label: "التشغيل والمتابعة", modules: ["inventory", "assets", "tasks", "cases"] },
  { label: "التقارير والإدارة", modules: ["reports", "settings", "users"] },
];

export const REPORT_GROUPS: { label: string; reports: ReportId[] }[] = [
  { label: "الطلاب والتعليم", reports: ["students", "admissions", "student_attendance"] },
  { label: "المالية", reports: ["finance", "expenses"] },
  { label: "الموظفون", reports: ["employees", "staff_attendance"] },
  { label: "التشغيل والمتابعة", reports: ["inventory", "assets", "tasks", "cases"] },
];

// Hide only the confirmed debug label, never a selected or active academic year.
export function visibleAcademicYears<T extends { id: string; name: string; is_active: boolean }>(
  years: T[],
  selectedId?: string,
) {
  return years.filter(
    (year) =>
      year.name.trim().toUpperCase() !== "DEBUG" || year.is_active || year.id === selectedId,
  );
}

const STATUS_HEADINGS: Partial<Record<ReportId, string>> = {
  admissions: "حالة طلب القبول",
  expenses: "حالة سند الصرف",
  student_attendance: "حالة حضور الطالب",
  staff_attendance: "حالة حضور الموظف",
  employees: "حالة الموظف",
  inventory: "حالة المخزون",
  assets: "حالة الأصل",
  tasks: "حالة المهمة",
  cases: "حالة الشكوى / الحالة",
};

export function reportColumnHeading(id: ReportId, key: string, fallback: string) {
  if (key === "status") return STATUS_HEADINGS[id] ?? fallback;
  if (key === "name" && id === "assets") return "اسم الأصل";
  if (key === "name" && id === "inventory") return "اسم الصنف";
  if (key === "title" && id === "tasks") return "عنوان المهمة";
  if (key === "title" && id === "cases") return "عنوان الحالة";
  return fallback;
}
