import {
  LayoutDashboard,
  Users,
  UserPlus,
  School,
  Wallet,
  Receipt,
  Briefcase,
  CalendarCheck,
  ClipboardCheck,
  Boxes,
  Building2,
  ListTodo,
  MessageSquareWarning,
  BarChart3,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  to: string;
  icon: LucideIcon;
  description: string;
};

/** Sidebar navigation — single source of truth for labels, icons and page titles. */
export const NAV_ITEMS: NavItem[] = [
  {
    title: "الرئيسية",
    to: "/dashboard",
    icon: LayoutDashboard,
    description: "نظرة عامة على أداء المدرسة.",
  },
  {
    title: "الطلاب",
    to: "/students",
    icon: Users,
    description: "سجل الطلاب وبياناتهم الأساسية.",
  },
  {
    title: "التسجيل والقبول",
    to: "/admissions",
    icon: UserPlus,
    description: "طلبات التسجيل وإجراءات القبول.",
  },
  {
    title: "الصفوف والشعب",
    to: "/classes",
    icon: School,
    description: "هيكل الصفوف والشعب الدراسية.",
  },
  {
    title: "الأقساط والمدفوعات",
    to: "/payments",
    icon: Wallet,
    description: "الأقساط المستحقة وسندات القبض.",
  },
  {
    title: "المصروفات",
    to: "/expenses",
    icon: Receipt,
    description: "مصروفات المدرسة وسندات الصرف.",
  },
  {
    title: "الموظفون",
    to: "/staff",
    icon: Briefcase,
    description: "ملفات الموظفين والعقود.",
  },
  {
    title: "حضور الطلاب",
    to: "/student-attendance",
    icon: CalendarCheck,
    description: "تسجيل ومتابعة حضور الطلاب.",
  },
  {
    title: "حضور الموظفين",
    to: "/staff-attendance",
    icon: ClipboardCheck,
    description: "تسجيل ومتابعة حضور الموظفين.",
  },
  {
    title: "المخزون",
    to: "/inventory",
    icon: Boxes,
    description: "المستودعات وحركة الأصناف.",
  },
  {
    title: "الأصول",
    to: "/assets",
    icon: Building2,
    description: "أصول المدرسة وسجل العهدة.",
  },
  {
    title: "المهام",
    to: "/tasks",
    icon: ListTodo,
    description: "المهام الإدارية ومتابعتها.",
  },
  {
    title: "الشكاوى والملاحظات",
    to: "/complaints",
    icon: MessageSquareWarning,
    description: "شكاوى وملاحظات أولياء الأمور والموظفين.",
  },
  {
    title: "التقارير",
    to: "/reports",
    icon: BarChart3,
    description: "التقارير الإدارية والمالية.",
  },
  {
    title: "الإعدادات",
    to: "/settings",
    icon: Settings,
    description: "إعدادات المدرسة والصلاحيات.",
  },
];

export const ROLE_LABELS: Record<string, string> = {
  super_admin: "مشرف النظام",
  school_owner: "مالك المدرسة",
  school_manager: "مدير المدرسة",
  accountant: "محاسب",
  registrar: "مسؤول تسجيل",
  hr: "الموارد البشرية",
  teacher: "معلم",
  store_keeper: "أمين مستودع",
};
