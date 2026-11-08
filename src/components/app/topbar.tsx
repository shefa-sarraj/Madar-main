import { visibleAcademicYears } from "@/lib/settings-report-presentation";
import { useNavigate } from "@tanstack/react-router";
import { Bell, ChevronDown, LogOut, Menu, Settings, User } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { EmptyState } from "@/components/app/empty-state";
import { GlobalSearch } from "@/components/app/global-search";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABELS } from "@/lib/navigation";
import { signOutAndRedirect, useWorkspace } from "@/lib/workspace";

export function Topbar({ title, onOpenSidebar }: { title: string; onOpenSidebar: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile, email, activeSchool, academicYears, activeYear, setActiveYear, roles, schools } =
    useWorkspace();

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOutAndRedirect((options) => navigate(options as { to: "/"; replace?: boolean }));
  }

  const notificationsQuery = useQuery({
    queryKey: ["notifications", activeSchool?.id],
    enabled: !!activeSchool?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, message, type, is_read, created_at")
        .eq("school_id", activeSchool!.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const notifications = notificationsQuery.data ?? [];
  const unread = notifications.filter((item) => !item.is_read).length;
  const displayName = profile?.full_name?.trim() || email || "المستخدم";
  const initials = displayName.slice(0, 2);
  const primaryRole = roles[0];
  const roleLabel = primaryRole ? (ROLE_LABELS[primaryRole] ?? primaryRole) : "بدون صلاحية محددة";

  return (
    <header className="madar-topbar sticky top-0 z-30 flex min-h-16 flex-wrap items-center gap-3 border-b border-border bg-card/95 px-4 py-2 backdrop-blur lg:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onOpenSidebar}
        aria-label="فتح القائمة"
      >
        <Menu className="size-5" />
      </Button>

      <div className="madar-topbar__title min-w-0">
        <h2 className="truncate text-base font-semibold text-foreground">{title}</h2>
        <p className="hidden truncate text-xs text-muted-foreground sm:block">
          {activeSchool?.name_ar}
        </p>
      </div>

      <GlobalSearch />

      <div className="ms-auto flex shrink-0 items-center gap-1 sm:gap-2">
        {academicYears.length > 0 ? (
          <Select {...(activeYear ? { value: activeYear.id } : {})} onValueChange={setActiveYear}>
            <SelectTrigger className="hidden h-9 w-40 sm:flex" aria-label="السنة الدراسية">
              <SelectValue placeholder="السنة الدراسية" />
            </SelectTrigger>
            <SelectContent className="madar-topbar-select">
              {visibleAcademicYears(academicYears, activeYear?.id).map((year) => (
                <SelectItem key={year.id} value={year.id}>
                  {year.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="hidden rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground sm:inline">
            لا توجد سنة دراسية بعد
          </span>
        )}

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label="التنبيهات">
              <Bell className="size-5" />
              {unread > 0 ? (
                <span className="absolute end-1.5 top-1.5 size-2 rounded-full bg-gold" />
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            dir="rtl"
            className="madar-notifications w-80 max-w-[calc(100vw-2rem)] p-0"
          >
            <div className="border-b border-border px-4 py-3 text-sm font-semibold">التنبيهات</div>
            <div className="max-h-80 overflow-y-auto p-2">
              {notificationsQuery.isPending ? (
                <p role="status" className="p-3 text-sm text-muted-foreground">
                  جار تحميل التنبيهات...
                </p>
              ) : notificationsQuery.isError ? (
                <p role="alert" className="p-3 text-sm text-destructive">
                  تعذر تحميل التنبيهات. حاول مرة أخرى لاحقاً.
                </p>
              ) : notifications.length === 0 ? (
                <EmptyState
                  compact
                  title="لا توجد تنبيهات بعد"
                  className="border-0 bg-transparent"
                />
              ) : (
                notifications.map((item) => (
                  <div key={item.id} className="rounded-md p-3 hover:bg-secondary">
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.message}</p>
                  </div>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              aria-label="قائمة الحساب"
              className="madar-topbar__account h-10 gap-2 px-2"
            >
              <Avatar className="size-7">
                <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="hidden min-w-0 max-w-32 text-start sm:block">
                <span className="block truncate text-sm">{displayName}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {roleLabel}
                </span>
              </span>
              <ChevronDown className="size-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="madar-user-menu w-60 max-w-[calc(100vw-2rem)]"
          >
            <DropdownMenuLabel className="space-y-0.5">
              <p className="truncate text-sm font-medium">{displayName}</p>
              <p className="truncate text-xs font-normal text-muted-foreground" dir="ltr">
                {email}
              </p>
              <p className="text-xs font-normal text-muted-foreground">{roleLabel}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {activeSchool ? (
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                {activeSchool.name_ar}
              </DropdownMenuLabel>
            ) : null}
            {schools.length > 1 ? (
              <DropdownMenuItem onSelect={() => navigate({ to: "/select-school" })}>
                <User className="size-4" />
                تبديل المدرسة
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={() => navigate({ to: "/settings" })}>
              <Settings className="size-4" />
              الإعدادات
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => void handleSignOut()}
            >
              <LogOut className="size-4" />
              تسجيل الخروج
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="order-last flex w-full items-center justify-between gap-3 border-t border-border pt-2 text-xs text-muted-foreground sm:hidden">
        <span className="min-w-0 truncate">{activeSchool?.name_ar}</span>
        {academicYears.length > 0 ? (
          <Select {...(activeYear ? { value: activeYear.id } : {})} onValueChange={setActiveYear}>
            <SelectTrigger className="h-8 w-36 shrink-0" aria-label="السنة الدراسية">
              <SelectValue placeholder="السنة الدراسية" />
            </SelectTrigger>
            <SelectContent className="madar-topbar-select">
              {visibleAcademicYears(academicYears, activeYear?.id).map((year) => (
                <SelectItem key={year.id} value={year.id}>
                  {year.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span>لا توجد سنة دراسية بعد</span>
        )}
      </div>
    </header>
  );
}
