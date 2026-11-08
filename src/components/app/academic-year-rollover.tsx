import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Eye } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/app/modal";
import { DataTable } from "@/components/app/data-table";
import { FormField } from "@/components/app/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { fetchRolloverPreview, rolloverYear, rolloverError } from "@/lib/academic-year-rollover";
import type { Placement } from "@/lib/academic-year-rollover";
import type { Year } from "@/lib/settings";

export function AcademicYearRollover({
  schoolId,
  years,
  onClose,
  onSaved,
}: {
  schoolId: string;
  years: Year[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [source, setSource] = useState(years.find((y) => y.is_active)?.id ?? years[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title="ترحيل السنة الدراسية"
    >
      <FormField label="السنة السابقة">
        {(field) => (
          <select
            {...field}
            disabled={busy}
            className="h-10 w-full rounded-md border bg-background px-3"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            {years.map((year) => (
              <option key={year.id} value={year.id}>
                {year.name}
              </option>
            ))}
          </select>
        )}
      </FormField>
      <div className="max-h-[65vh] overflow-y-auto">
        {source && (
          <RolloverForm
            key={source}
            schoolId={schoolId}
            source={source}
            onSaved={onSaved}
            onClose={onClose}
            onBusyChange={setBusy}
          />
        )}
      </div>
    </Modal>
  );
}

function RolloverForm({
  schoolId,
  source,
  onSaved,
  onClose,
  onBusyChange,
}: {
  schoolId: string;
  source: string;
  onSaved: () => Promise<void>;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["rollover-preview", schoolId, source],
    queryFn: () => fetchRolloverPreview(schoolId, source),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [placements, setPlacements] = useState<Record<string, Placement>>({});
  const [review, setReview] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const lock = useRef(false);
  const request = useRef<{ signature: string; id: string } | null>(null);
  const snapshot = useRef(query.data);
  const data = review ? snapshot.current : query.data;
  const selected = Object.values(placements);
  const gradeName = (id: string) => {
    const grade = data?.grades.find((g) => g.id === id);
    return `${data?.stages.find((s) => s.id === grade?.stage_id)?.name ?? ""} / ${grade?.name ?? ""}`;
  };
  if (query.isPending) return <p role="status">جار تحميل بيانات السنة...</p>;
  if (query.isError || !data)
    return (
      <div role="alert">
        <p>{rolloverError(query.error)}</p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          إعادة المحاولة
        </Button>
      </div>
    );
  if (data.completed_year_id)
    return <p role="status">تم ترحيل هذه السنة سابقاً. لا يمكن تكرار العملية.</p>;
  function update(id: string, placement: Placement | null) {
    setPlacements((current) => {
      const next = { ...current };
      if (placement) next[id] = placement;
      else delete next[id];
      return next;
    });
  }
  function preview() {
    if (!name.trim() || !start || !end || end <= start || start <= data!.year.end_date) {
      setFailure("أدخل اسم السنة وتواريخ صحيحة تبدأ بعد نهاية السنة السابقة.");
      return;
    }
    if (selected.some((p) => !p.grade_id)) {
      setFailure("اختر الصف الجديد لكل طالب محدد.");
      return;
    }
    if (
      data!.sections.some(
        (s) =>
          s.capacity !== null && selected.filter((p) => p.section_id === s.id).length > s.capacity!,
      )
    ) {
      setFailure("عدد الطلاب يتجاوز سعة إحدى الشعب.");
      return;
    }
    snapshot.current = data;
    setFailure("");
    setConfirmed(false);
    setReview(true);
  }
  async function submit() {
    if (lock.current || !confirmed || !snapshot.current) return;
    lock.current = true;
    setBusy(true);
    onBusyChange(true);
    setFailure("");
    const signature = JSON.stringify([name, start, end, selected, snapshot.current.version]);
    if (request.current?.signature !== signature)
      request.current = { signature, id: crypto.randomUUID() };
    try {
      await rolloverYear(
        schoolId,
        snapshot.current,
        request.current.id,
        name,
        start,
        end,
        selected,
      );
    } catch (error) {
      setFailure(rolloverError(error));
      lock.current = false;
      setBusy(false);
      onBusyChange(false);
      return;
    }
    toast.success("تم إنشاء السنة المخططة وترحيل الطلاب المحددين");
    onClose();
    await Promise.all([
      onSaved(),
      queryClient.invalidateQueries({ queryKey: ["rollover-preview", schoolId] }),
      queryClient.invalidateQueries({ queryKey: ["structure", schoolId] }),
      queryClient.invalidateQueries({ queryKey: ["students", schoolId] }),
    ]).catch(() => toast.error("تم الترحيل؛ أعد تحميل الصفحة لتحديث البيانات"));
  }
  const rows = data.students.filter((student) =>
    review
      ? !!placements[student.id]
      : (!gradeFilter || student.grade_id === gradeFilter) &&
        `${student.full_name} ${student.student_number}`.includes(search),
  );
  return (
    <div className="space-y-4">
      <fieldset disabled={busy || review} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FormField label="اسم السنة الجديدة" required>
            {(field) => (
              <Input {...field} required value={name} onChange={(e) => setName(e.target.value)} />
            )}
          </FormField>
        </div>
        <FormField label="البداية" required>
          {(field) => (
            <Input
              {...field}
              required
              type="date"
              dir="ltr"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          )}
        </FormField>
        <FormField label="النهاية" required>
          {(field) => (
            <Input
              {...field}
              required
              type="date"
              dir="ltr"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          )}
        </FormField>
      </fieldset>
      <p className="text-sm text-muted-foreground">
        السنة الجديدة: مخططة. القيد الجديد: معلق. تبقى السنة السابقة وسجلاتها دون تغيير.
      </p>
      <p className="text-sm">
        المراحل: {data.stages.length} · الصفوف: {data.grades.length} · الشعب الجديدة:{" "}
        {data.sections.length} · الطلاب المحددون: {selected.length}
      </p>
      {review ? (
        <>
          <p className="text-sm">
            تُحفظ نسخة من هيكل المراحل والصفوف المشترك، وتُنسخ الشعب دون إسناد المعلمين. لا تُنقل
            سجلات الحضور أو المال أو الحالات أو المعاملات السابقة.
          </p>
        </>
      ) : (
        <div className="space-y-2">
          <Input
            aria-label="بحث عن طالب"
            placeholder="بحث بالاسم أو رقم الطالب"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            aria-label="تصفية حسب الصف الحالي"
            className="h-10 w-full rounded-md border bg-background px-3"
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
          >
            <option value="">كل الصفوف الحالية</option>
            {data.grades.map((g) => (
              <option key={g.id} value={g.id}>
                {gradeName(g.id)}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="max-h-64 overflow-auto">
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          emptyTitle={review ? "لم يتم تحديد طلاب؛ سينسخ الهيكل فقط" : "لا يوجد طلاب نشطون"}
          columns={[
            ...(!review
              ? [
                  {
                    key: "selected",
                    header: "اختيار",
                    cell: (r: (typeof rows)[number]) => (
                      <Checkbox
                        aria-label={`اختيار ${r.full_name}`}
                        checked={!!placements[r.id]}
                        onCheckedChange={(checked) =>
                          update(
                            r.id,
                            checked === true
                              ? {
                                  enrollment_id: r.id,
                                  grade_id: data.grades.some((g) => g.id === r.grade_id)
                                    ? r.grade_id
                                    : "",
                                  section_id: data.sections.some(
                                    (s) => s.id === r.section_id && s.grade_id === r.grade_id,
                                  )
                                    ? r.section_id
                                    : null,
                                }
                              : null,
                          )
                        }
                      />
                    ),
                  },
                ]
              : []),
            {
              key: "student",
              header: "الطالب",
              cell: (r) => (
                <div>
                  {r.full_name}
                  <p className="text-xs text-muted-foreground">{r.student_number}</p>
                </div>
              ),
            },
            { key: "old", header: "الصف السابق", cell: (r) => gradeName(r.grade_id) },
            {
              key: "grade",
              header: "الصف الجديد",
              cell: (r) =>
                review ? (
                  gradeName(placements[r.id]!.grade_id)
                ) : (
                  <select
                    aria-label={`الصف الجديد: ${r.full_name}`}
                    disabled={!placements[r.id]}
                    className="h-10 w-40 rounded-md border bg-background"
                    value={placements[r.id]?.grade_id ?? ""}
                    onChange={(e) =>
                      update(r.id, {
                        enrollment_id: r.id,
                        grade_id: e.target.value,
                        section_id: null,
                      })
                    }
                  >
                    <option value="">اختر الصف</option>
                    {data.grades.map((g) => (
                      <option key={g.id} value={g.id}>
                        {gradeName(g.id)}
                      </option>
                    ))}
                  </select>
                ),
            },
            {
              key: "section",
              header: "الشعبة الجديدة",
              cell: (r) =>
                review ? (
                  (data.sections.find((s) => s.id === placements[r.id]?.section_id)?.name ??
                  "دون شعبة")
                ) : (
                  <select
                    aria-label={`الشعبة الجديدة: ${r.full_name}`}
                    disabled={!placements[r.id]}
                    className="h-10 w-32 rounded-md border bg-background"
                    value={placements[r.id]?.section_id ?? ""}
                    onChange={(e) =>
                      update(r.id, { ...placements[r.id]!, section_id: e.target.value || null })
                    }
                  >
                    <option value="">دون شعبة</option>
                    {data.sections
                      .filter((s) => s.grade_id === placements[r.id]?.grade_id)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                          {s.capacity !== null ? ` (${s.capacity})` : ""}
                        </option>
                      ))}
                  </select>
                ),
            },
          ]}
        />
      </div>
      {review && (
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={confirmed}
            disabled={busy}
            onCheckedChange={(value) => setConfirmed(value === true)}
          />
          أؤكد إنشاء السنة والقيد للطلاب المحددين فقط. لا يمكن تكرار ترحيل السنة نفسها.
        </label>
      )}
      {failure && (
        <p role="alert" className="text-sm text-destructive">
          {failure}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {review ? (
          <>
            <Button disabled={busy || !confirmed} onClick={() => void submit()}>
              <Check className="size-4" />
              {busy ? "جار الترحيل..." : "تأكيد الترحيل"}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setReview(false);
                setConfirmed(false);
              }}
            >
              <ArrowLeft className="size-4" />
              تعديل
            </Button>
          </>
        ) : (
          <Button onClick={preview}>
            <Eye className="size-4" />
            معاينة الترحيل
          </Button>
        )}
      </div>
    </div>
  );
}
