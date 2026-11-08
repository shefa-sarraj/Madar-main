import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CircleCheck,
  CirclePause,
  ClipboardList,
  LogOut,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { SchoolProfile } from "@/lib/settings";
import type { PlatformUser } from "@/lib/school-administration";
import type { ManagerRequest } from "@/lib/platform-requests";
import { useWorkspace, signOutAndRedirect } from "@/lib/workspace";
import { PlatformSchools } from "@/components/app/platform-schools";
import { ManagerRequests } from "@/components/app/manager-requests";

import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/_authenticated/platform")({
  head: () => ({ meta: [{ title: "إدارة منصة مدار | Madar" }] }),
  component: PlatformPage,
});
function PlatformPage() {
  const { isPlatformAdmin, isLoading } = useWorkspace();
  const navigate = useNavigate();
  const qc = useQueryClient();
  if (isLoading) return <p role="status">جار التحميل...</p>;
  if (!isPlatformAdmin) return null;
  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gold/40 bg-primary px-4 py-3 text-primary-foreground sm:px-6">
        <div className="flex items-center gap-3">
          <img src="/favicon.png" alt="" className="size-10" />
          <span className="font-semibold">مدار | Madar</span>
        </div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-gold" />
          <h1 className="text-lg font-semibold">إدارة منصة مدار</h1>
        </div>
        <Button
          variant="ghost"
          className="text-primary-foreground hover:bg-white/10 hover:text-primary-foreground"
          onClick={() => {
            qc.clear();
            void signOutAndRedirect((o) => navigate(o as { to: "/"; replace?: boolean }));
          }}
        >
          <LogOut className="size-4" />
          تسجيل الخروج
        </Button>
      </header>
      <main className="mx-auto max-w-7xl min-w-0 space-y-5 px-4 py-4">
        <PlatformOverview />
        <ManagerRequests review />
        <PlatformSchools onSelectSchool={() => void navigate({ to: "/settings" })} />
      </main>
    </div>
  );
}

function PlatformOverview() {
  // Observe the existing platform queries without issuing additional reads.
  const schools = useQuery<SchoolProfile[]>({ queryKey: ["platform-schools"], enabled: false });
  const users = useQuery<PlatformUser[]>({ queryKey: ["platform-users"], enabled: false });
  const requests = useQuery<ManagerRequest[]>({ queryKey: ["manager-requests"], enabled: false });
  const cards = [
    {
      label: "إجمالي المدارس",
      value: schools.data?.length,
      failed: schools.isError,
      icon: Building2,
    },
    {
      label: "المدارس النشطة",
      value: schools.data?.filter((s) => s.status === "active").length,
      failed: schools.isError,
      icon: CircleCheck,
    },
    {
      label: "المدارس الموقوفة",
      value: schools.data?.filter((s) => s.status === "suspended").length,
      failed: schools.isError,
      icon: CirclePause,
    },
    {
      label: "طلبات قيد المراجعة",
      value: requests.data?.filter((r) => r.status === "pending").length,
      failed: requests.isError,
      icon: ClipboardList,
    },
    { label: "مستخدمو المنصة", value: users.data?.length, failed: users.isError, icon: Users },
  ];
  return (
    <section aria-label="مؤشرات المنصة" className="grid grid-cols-2 gap-2 lg:grid-cols-5">
      {cards.map(({ label, value, failed, icon: Icon }) => (
        <article
          key={label}
          className="rounded-md border border-border bg-card px-3 py-3 last:col-span-2 lg:last:col-span-1"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-medium text-muted-foreground">{label}</h2>
            <Icon className="size-4 shrink-0 text-primary/70" />
          </div>
          <p className="tnum mt-2 text-2xl font-semibold">
            {failed ? <span className="text-xs text-destructive">غير متاح</span> : (value ?? "—")}
          </p>
        </article>
      ))}
    </section>
  );
}
