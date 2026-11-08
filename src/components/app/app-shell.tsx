import { Button } from "@/components/ui/button";
import { Building2 } from "lucide-react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import { SidebarNav } from "@/components/app/app-sidebar";
import { Topbar } from "@/components/app/topbar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { NAV_ITEMS } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace";

const COLLAPSE_KEY = "madar.sidebar_collapsed";

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { activeSchool, schools, isLoading, isPlatformAdmin } = useWorkspace();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (isPlatformAdmin) {
      if (pathname !== "/settings") navigate({ to: "/platform", replace: true });
      return;
    }
    if (!activeSchool && schools.length !== 1) {
      navigate({ to: "/select-school", replace: true });
    }
  }, [activeSchool, schools.length, isLoading, navigate, pathname, isPlatformAdmin]);

  function toggleCollapsed() {
    setCollapsed((previous) => {
      const next = !previous;
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  }

  if (isPlatformAdmin)
    return (
      <div dir="rtl" className="min-h-screen bg-background">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
          <h1 className="text-lg font-semibold">{activeSchool?.name_ar ?? "إدارة منصة مدار"}</h1>
          <Button variant="outline" onClick={() => void navigate({ to: "/platform" })}>
            <Building2 className="size-4" />
            إدارة المنصة
          </Button>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">
          {pathname === "/settings" ? children : null}
        </main>
      </div>
    );

  const current = NAV_ITEMS.find(
    (item) => pathname === item.to || pathname.startsWith(`${item.to}/`),
  );

  return (
    <div dir="rtl" className="madar-workspace flex min-h-screen w-full bg-background">
      <a
        href="#school-content"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:p-3"
      >
        انتقل إلى المحتوى
      </a>
      <aside
        className={cn(
          "madar-workspace__sidebar sticky top-0 hidden h-dvh shrink-0 border-s border-sidebar-border transition-[width] duration-200 lg:block",
          collapsed ? "w-[72px]" : "w-64",
        )}
      >
        <SidebarNav collapsed={collapsed} onToggle={toggleCollapsed} />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          aria-describedby={undefined}
          side="right"
          dir="rtl"
          className="madar-mobile-sidebar w-72 border-s-0 bg-sidebar p-0"
        >
          <SheetTitle className="sr-only">القائمة الرئيسية</SheetTitle>
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={current?.title ?? "مدار"} onOpenSidebar={() => setMobileOpen(true)} />
        <main
          id="school-content"
          tabIndex={-1}
          className="madar-workspace__content min-w-0 flex-1 px-4 py-6 lg:px-8"
        >
          <div
            className={cn(
              "mx-auto w-full max-w-7xl space-y-6",
              pathname === "/students" && "madar-students",
              pathname === "/students/new" && "madar-student-wizard",
              pathname.startsWith("/students/") &&
                pathname !== "/students/new" &&
                "madar-student-profile",
              pathname === "/admissions" && "madar-admissions",
            )}
          >
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full max-w-64" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : isPlatformAdmin && pathname !== "/settings" ? null : (
              children
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
