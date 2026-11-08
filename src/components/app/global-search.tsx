import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { canViewStudents } from "@/lib/students";
import { useWorkspace } from "@/lib/workspace";

type Result = { id: string; title: string; subtitle: string };

/** Searches students (name, number) and guardians (name, phone) within the active school only. */
export function GlobalSearch() {
  const navigate = useNavigate();
  const { activeSchool, roles } = useWorkspace();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const enabled = !!activeSchool && canViewStudents(roles) && debounced.length >= 2;

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim().replace(/[,()%]/g, "")), 250);
    return () => clearTimeout(t);
  }, [term]);

  const results = useQuery({
    queryKey: ["global-search", activeSchool?.id, debounced],
    enabled,
    queryFn: async (): Promise<Result[]> => {
      const like = `%${debounced}%`;
      const [students, guardians] = await Promise.all([
        supabase
          .from("students")
          .select("id, full_name, student_number")
          .eq("school_id", activeSchool!.id)
          .or(`full_name.ilike.${like},student_number.ilike.${like}`)
          .limit(6),
        supabase
          .from("guardians")
          .select(
            "id, full_name, phone, links:student_guardians(student_id, student:students(full_name))",
          )
          .eq("school_id", activeSchool!.id)
          .or(`full_name.ilike.${like},phone.ilike.${like}`)
          .limit(6),
      ]);
      if (students.error) throw students.error;
      if (guardians.error) throw guardians.error;
      const out: Result[] = (students.data ?? []).map((s) => ({
        id: s.id,
        title: s.full_name,
        subtitle: `طالب · ${s.student_number}`,
      }));
      for (const g of guardians.data ?? []) {
        for (const link of (g.links ?? []) as {
          student_id: string;
          student: { full_name: string } | null;
        }[]) {
          if (out.some((r) => r.id === link.student_id)) continue;
          out.push({
            id: link.student_id,
            title: link.student?.full_name ?? "—",
            subtitle: `ولي الأمر: ${g.full_name} · ${g.phone}`,
          });
        }
      }
      return out.slice(0, 10);
    },
  });

  const go = (id: string) => {
    setOpen(false);
    setTerm("");
    navigate({ to: "/students/$studentId", params: { studentId: id } });
  };

  return (
    <Popover open={open && term.trim().length >= 2} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="madar-search relative mx-auto min-w-0 w-full max-w-sm">
          <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results.data?.[0]) go(results.data[0].id);
            }}
            placeholder="ابحث عن طالب أو ولي أمر..."
            className="h-9 bg-background pe-9"
            aria-label="بحث شامل"
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="madar-search-results w-[var(--radix-popover-trigger-width)] min-w-72 max-w-[calc(100vw-2rem)] p-1"
        dir="rtl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {!canViewStudents(roles) ? (
          <p className="p-3 text-sm text-muted-foreground">لا تملك صلاحية البحث في سجلات الطلاب.</p>
        ) : results.isFetching && !results.data ? (
          <p className="p-3 text-sm text-muted-foreground">جارٍ البحث...</p>
        ) : results.isError ? (
          <p role="alert" className="p-3 text-sm text-destructive">
            تعذر تحميل نتائج البحث.
          </p>
        ) : !results.data?.length ? (
          <p className="p-3 text-sm text-muted-foreground">لا توجد نتائج</p>
        ) : (
          results.data.map((r) => (
            <button
              key={r.id + r.subtitle}
              type="button"
              onClick={() => go(r.id)}
              className="block w-full rounded-md px-3 py-2 text-start hover:bg-secondary"
            >
              <p className="text-sm font-medium text-foreground">{r.title}</p>
              <p className="text-xs text-muted-foreground">{r.subtitle}</p>
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}
