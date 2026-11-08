import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X, Send } from "lucide-react";
import { toast } from "sonner";
import { platformRequestsClient, type ManagerRequest } from "@/lib/platform-requests";
import { settingsError } from "@/lib/settings";
import { DataTable } from "@/components/app/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/app/modal";
import { FormField } from "@/components/app/form-field";

export function ManagerRequests({ review = false }: { review?: boolean }) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["manager-requests"],
    queryFn: async () => {
      const { data, error } = await platformRequestsClient()
        .from("school_manager_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const [school, setSchool] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"school_owner" | "school_manager">("school_owner");
  const [decision, setDecision] = useState<{ request: ManagerRequest; approve: boolean } | null>(
    null,
  );
  const [note, setNote] = useState("");
  const [existingSchool, setExistingSchool] = useState("");
  const [busy, setBusy] = useState(false);
  const schools = useQuery({
    queryKey: ["approval-schools"],
    enabled: review,
    queryFn: async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await supabase.from("schools").select("id,name_ar").order("name_ar");
      if (error) throw error;
      return data ?? [];
    },
  });
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { error } = await platformRequestsClient().rpc("submit_school_manager_request", {
        _school_name: school,
        _full_name: name,
        _role: role,
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["manager-requests"] });
      setSchool("");
      toast.success("تم إرسال الطلب");
    } catch (error) {
      toast.error(settingsError(error));
    } finally {
      setBusy(false);
    }
  }
  async function decide() {
    if (!decision) return;
    setBusy(true);
    try {
      const { error } = await platformRequestsClient().rpc("review_school_manager_request", {
        _id: decision.request.id,
        _approve: decision.approve,
        _note: note,
        _school_id: existingSchool || null,
      });
      if (error) throw error;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["manager-requests"] }),
        qc.invalidateQueries({ queryKey: ["platform-schools"] }),
        qc.invalidateQueries({ queryKey: ["my-schools"] }),
        qc.invalidateQueries({ queryKey: ["platform-users"] }),
        qc.invalidateQueries({ queryKey: ["platform-school-members"] }),
      ]);
      setDecision(null);
      toast.success("تمت مراجعة الطلب");
    } catch (error) {
      toast.error(settingsError(error));
    } finally {
      setBusy(false);
    }
  }
  const labels = { pending: "قيد المراجعة", approved: "مقبول", rejected: "مرفوض" };
  return (
    <section dir="rtl" className="space-y-4">
      <h2 className="text-lg font-semibold">طلبات إدارة المدارس</h2>
      {review && (
        <p className="text-sm text-muted-foreground">
          قيد المراجعة: {query.data?.filter((r) => r.status === "pending").length ?? 0} · المقبولة:{" "}
          {query.data?.filter((r) => r.status === "approved").length ?? 0} · المرفوضة:{" "}
          {query.data?.filter((r) => r.status === "rejected").length ?? 0}
        </p>
      )}
      {!review && !query.isPending && !query.data?.some((r) => r.status === "pending") && (
        <form onSubmit={submit} className="space-y-3">
          <FormField label="اسم المدرسة" required>
            {(p) => (
              <Input
                {...p}
                required
                maxLength={200}
                value={school}
                onChange={(e) => setSchool(e.target.value)}
              />
            )}
          </FormField>
          <FormField label="الاسم الكامل" required>
            {(p) => (
              <Input
                {...p}
                required
                maxLength={200}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </FormField>
          <select
            aria-label="الدور المطلوب"
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
            className="h-10 border rounded-md bg-background px-3"
          >
            <option value="school_owner">مالك المدرسة</option>
            <option value="school_manager">مدير المدرسة</option>
          </select>
          <Button type="submit" disabled={busy}>
            <Send className="size-4" />
            إرسال الطلب
          </Button>
        </form>
      )}
      {query.isError && (
        <div role="alert" className="space-y-2 text-sm text-destructive">
          <p>{settingsError(query.error)}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            إعادة المحاولة
          </Button>
        </div>
      )}
      {review && !query.isPending && !query.isError && !query.data?.length ? (
        <p
          role="status"
          className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground"
        >
          لا توجد طلبات لإدارة المدارس.
        </p>
      ) : (
        <DataTable
          rows={query.data ?? []}
          {...(query.isError ? { emptyDescription: "أعد المحاولة." } : {})}
          isLoading={query.isPending}
          rowKey={(r) => r.id}
          emptyTitle={query.isError ? "تعذر تحميل الطلبات" : "لا توجد طلبات"}
          columns={[
            { key: "school", header: "المدرسة", cell: (r) => r.school_name },
            {
              key: "manager",
              header: "المسؤول",
              cell: (r) => (
                <div>
                  {r.full_name}
                  <p className="text-xs text-muted-foreground">
                    {r.requested_role === "school_owner" ? "مالك" : "مدير"}
                  </p>
                </div>
              ),
            },
            { key: "status", header: "الحالة", cell: (r) => labels[r.status] },
            { key: "note", header: "ملاحظات", cell: (r) => r.review_note },
            {
              key: "actions",
              header: "",
              cell: (r) =>
                review && r.status === "pending" ? (
                  <div className="flex gap-2">
                    {[true, false].map((approve) => (
                      <Button
                        key={String(approve)}
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setDecision({ request: r, approve });
                          setNote("");
                          setExistingSchool("");
                        }}
                      >
                        {approve ? <Check className="size-4" /> : <X className="size-4" />}
                        {approve ? "قبول" : "رفض"}
                      </Button>
                    ))}
                  </div>
                ) : null,
            },
          ]}
        />
      )}
      {decision && (
        <Modal
          open
          title={decision.approve ? "قبول الطلب" : "رفض الطلب"}
          onOpenChange={(open) => {
            if (!open && !busy) setDecision(null);
          }}
          footer={
            <Button disabled={busy} onClick={() => void decide()}>
              {decision.approve ? <Check className="size-4" /> : <X className="size-4" />}تأكيد
            </Button>
          }
        >
          <p>
            {decision.request.school_name} · {decision.request.full_name}
          </p>
          {decision.approve && (
            <select
              aria-label="المدرسة"
              className="my-3 h-10 w-full border rounded-md bg-background px-3"
              value={existingSchool}
              onChange={(e) => setExistingSchool(e.target.value)}
            >
              <option value="">إنشاء مدرسة جديدة</option>
              {schools.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name_ar}
                </option>
              ))}
            </select>
          )}
          <Input
            aria-label="ملاحظات المراجعة"
            placeholder="ملاحظات المراجعة"
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Modal>
      )}
    </section>
  );
}
