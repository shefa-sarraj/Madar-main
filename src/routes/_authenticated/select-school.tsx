import { ManagerRequests } from "@/components/app/manager-requests";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Building2, ChevronLeft, LogOut } from "lucide-react";

import { MadarLogo } from "@/components/app/brand";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { signOutAndRedirect, useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/select-school")({
  head: () => ({
    meta: [
      { title: "اختيار المدرسة — مدار | Madar" },
      { name: "description", content: "اختر المدرسة التي تريد العمل عليها في منصة مدار." },
      { property: "og:title", content: "اختيار المدرسة — مدار | Madar" },
      { property: "og:description", content: "اختر المدرسة التي تريد العمل عليها في منصة مدار." },
    ],
  }),
  component: SelectSchoolPage,
});

function SelectSchoolPage() {
  const navigate = useNavigate();
  const { schools, isLoading, setActiveSchool, activeSchool, isPlatformAdmin } = useWorkspace();
  const platformAdmin = isPlatformAdmin;

  // A single membership never needs a picker.
  useEffect(() => {
    const only = schools[0];
    if (!isLoading && !platformAdmin && schools.length === 1 && only) {
      setActiveSchool(only.id);
      navigate({ to: "/dashboard", replace: true });
    }
  }, [isLoading, schools, setActiveSchool, navigate, platformAdmin]);

  function choose(schoolId: string) {
    setActiveSchool(schoolId);
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div dir="rtl" className="w-full max-w-lg space-y-8">
        <MadarLogo className="h-12 w-auto" />

        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-foreground">
            {schools.length > 1 ? "اختر المدرسة" : "طلبات إدارة المدارس"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {schools.length > 1
              ? "حسابك مرتبط بأكثر من مدرسة. اختر المدرسة التي تريد العمل عليها الآن."
              : "حالة طلبك لإدارة المدرسة"}
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : schools.length === 1 ? (
          <p role="status">جار فتح المدرسة...</p>
        ) : schools.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="لا توجد مدرسة مرتبطة بحسابك"
            description="لم يتم ربط حسابك بأي مدرسة بعد. يرجى التواصل مع إدارة النظام لإضافتك كعضو في مدرسة."
          />
        ) : (
          <div className="space-y-3">
            {schools.map((school) => (
              <button
                key={school.id}
                type="button"
                onClick={() => choose(school.id)}
                className="flex w-full items-center gap-4 rounded-lg border border-border bg-card p-4 text-start shadow-card transition-colors hover:border-primary-soft hover:bg-secondary/60 focus-visible:outline-2 focus-visible:outline-ring"
                aria-pressed={school.id === activeSchool?.id}
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                  <Building2 className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {school.name_ar}
                  </span>
                  {school.name_en ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {school.name_en}
                    </span>
                  ) : null}
                </span>
                {school.id === activeSchool?.id ? (
                  <StatusBadge tone="info">الحالية</StatusBadge>
                ) : null}
                <ChevronLeft className="size-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
        {!isLoading && schools.length === 0 && !platformAdmin && <ManagerRequests />}
        {platformAdmin && (
          <Button variant="outline" onClick={() => navigate({ to: "/platform" })}>
            <Building2 className="size-4" />
            إدارة المدارس
          </Button>
        )}

        <Button
          variant="ghost"
          className="gap-2 text-muted-foreground"
          onClick={() =>
            void signOutAndRedirect((options) =>
              navigate(options as { to: "/"; replace?: boolean }),
            )
          }
        >
          <LogOut className="size-4" />
          تسجيل الخروج
        </Button>
      </div>
    </div>
  );
}
