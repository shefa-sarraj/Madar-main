import { Construction } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { AppShell } from "@/components/app/app-shell";

/** Shared shell for modules that arrive in later phases. */
export function ModulePlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <AppShell>
      <PageHeader title={title} description={description} />
      <EmptyState
        icon={Construction}
        title="هذه الوحدة قيد الإعداد"
        description="تم تجهيز البنية الأساسية والصلاحيات لهذه الوحدة، وسيتم تفعيل محتواها في مرحلة لاحقة."
      />
    </AppShell>
  );
}
