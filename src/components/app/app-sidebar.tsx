import { Link, useRouterState } from "@tanstack/react-router";
import { PanelRightClose, PanelRightOpen } from "lucide-react";

import { MadarMark } from "@/components/app/brand";
import { NAV_ITEMS } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function SidebarNav({
  collapsed = false,
  onNavigate,
  onToggle,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
  onToggle?: () => void;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div
      className={cn(
        "madar-sidebar flex h-full flex-col bg-sidebar text-sidebar-foreground",
        collapsed && "madar-sidebar--collapsed",
      )}
    >
      <div
        className={cn(
          "madar-sidebar__brand flex items-center gap-3 border-b border-sidebar-border px-4 py-4",
          collapsed && "flex-col justify-center px-2",
        )}
      >
        {collapsed ? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/95">
            <MadarMark className="size-7" />
          </span>
        ) : null}
        {!collapsed ? (
          <div className="min-w-0 flex-1">
            <img
              src="/images/madar-logo-official.webp"
              width="1920"
              height="640"
              alt="مدار | Madar — إدارة المدرسة"
              className="madar-sidebar__logo"
            />
          </div>
        ) : null}
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? "توسيع القائمة" : "طي القائمة"}
            title={collapsed ? "توسيع القائمة" : "طي القائمة"}
            className="hidden size-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-white lg:flex"
          >
            {collapsed ? (
              <PanelRightOpen className="size-4" />
            ) : (
              <PanelRightClose className="size-4" />
            )}
          </button>
        ) : null}
      </div>

      <nav
        aria-label="التنقل الرئيسي"
        className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-3"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.to || pathname.startsWith(`${item.to}/`);
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              title={collapsed ? item.title : undefined}
              aria-label={item.title}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                collapsed && "flex-col justify-center px-2",
                isActive
                  ? "bg-sidebar-accent font-medium text-white shadow-[inset_-2px_0_0_0_var(--gold)]"
                  : "text-sidebar-foreground/85 hover:bg-sidebar-accent/70 hover:text-white",
              )}
            >
              <item.icon className="size-[18px] shrink-0" />
              {!collapsed ? <span className="truncate">{item.title}</span> : null}
            </Link>
          );
        })}
      </nav>

      {!collapsed ? (
        <div className="border-t border-sidebar-border px-4 py-3 text-[11px] text-sidebar-foreground/60">
          منصة إدارة العمليات المدرسية
        </div>
      ) : null}
    </div>
  );
}
