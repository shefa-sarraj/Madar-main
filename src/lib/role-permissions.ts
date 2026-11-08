import { MODULES, type Module, type Permission } from "@/lib/settings";
const emptyPermission = (module: Module): Permission => ({
  module,
  can_view: false,
  can_create: false,
  can_edit: false,
  can_manage: false,
});
export function defaultRolePermissions(role: string): Permission[] {
  const managers = ["school_owner", "school_manager"];
  return MODULES.map(([module]) => {
    const permission = emptyPermission(module);
    if (managers.includes(role)) {
      return {
        ...permission,
        can_view: true,
        can_create: module !== "reports",
        can_edit: module !== "reports",
        can_manage: module !== "reports",
      };
    }
    if (module === "settings" || module === "reports") return { ...permission, can_view: true };
    const full =
      (role === "accountant" && ["fees", "expenses", "tasks"].includes(module)) ||
      (role === "registrar" &&
        ["students", "admissions", "classes", "student_attendance", "tasks"].includes(module)) ||
      (role === "hr" && ["employees", "staff_attendance", "tasks"].includes(module)) ||
      (role === "store_keeper" && ["inventory", "assets", "tasks"].includes(module));
    if (full)
      return { ...permission, can_view: true, can_create: true, can_edit: true, can_manage: true };
    const view =
      (role === "accountant" &&
        [
          "students",
          "classes",
          "student_attendance",
          "employees",
          "staff_attendance",
          "inventory",
          "assets",
        ].includes(module)) ||
      (role === "registrar" &&
        ["fees", "expenses", "employees", "staff_attendance"].includes(module)) ||
      (role === "hr" && module === "assets") ||
      (role === "teacher" && ["classes", "student_attendance"].includes(module));
    if (module === "cases")
      return {
        ...permission,
        can_view: true,
        can_create: ["hr", "registrar", "teacher"].includes(role),
        can_edit: true,
      };
    if (module === "tasks" && role === "teacher")
      return { ...permission, can_view: true, can_edit: true };
    if (module === "student_attendance" && role === "teacher")
      return { ...permission, can_view: true, can_create: true, can_edit: true };
    return { ...permission, can_view: view };
  });
}
