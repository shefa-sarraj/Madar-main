import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Check,
  MoreHorizontal,
  ClipboardCopy,
  RotateCcw,
  Pencil,
  Plus,
  Save,
  Sparkles,
  UserPlus,
  UserMinus,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { DataTable } from "@/components/app/data-table";
import { FilterBar } from "@/components/app/filter-bar";
import { FormField } from "@/components/app/form-field";
import { Modal } from "@/components/app/modal";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { SettingsPermissions } from "@/components/app/settings-permissions";
import { visibleAcademicYears } from "@/lib/settings-report-presentation";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_LABELS } from "@/lib/navigation";
import { useWorkspace } from "@/lib/workspace";
import {
  fetchSettings,
  settingsClient,
  settingsError,
  SCHOOL_ROLES,
  MEMBER_LABELS,
  YEAR_LABELS,
} from "@/lib/settings";
import type {
  Member,
  MemberStatus,
  Role,
  SchoolProfile,
  SchoolSettings,
  Year,
  CustomRole,
} from "@/lib/settings";
import { resetSchoolUserPassword } from "@/lib/settings.functions";
import { generateTemporaryPassword } from "@/lib/temporary-password";
import { AcademicYearRollover } from "@/components/app/academic-year-rollover";
import { AppShell } from "@/components/app/app-shell";
import { PlatformSchools } from "@/components/app/platform-schools";
import { fetchEmployeeLinks } from "@/lib/school-administration";
import {
  ExistingSchoolUserModal,
  RemoveSchoolUserModal,
} from "@/components/app/school-user-administration";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "الإعدادات | مدار" }] }),
  component: SettingsRoute,
});
function SettingsRoute() {
  const { activeSchool } = useWorkspace();
  return (
    <AppShell>
      <SettingsPage key={activeSchool?.id ?? "none"} />
    </AppShell>
  );
}
function SettingsPage() {
  const { activeSchool, roles, userId, can, isPlatformAdmin } = useWorkspace();
  const allowed =
    isPlatformAdmin || can("settings", "view", roles.length > 0) || can("users", "view");
  const manage =
    isPlatformAdmin ||
    roles.some((r) => ["super_admin", "school_owner", "school_manager"].includes(r));
  const owner = manage;
  const viewUsers = can("users", "view", manage);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["settings", activeSchool?.id, viewUsers],
    enabled: !!activeSchool && allowed,
    queryFn: () => fetchSettings(activeSchool!.id, viewUsers),
  });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [role, setRole] = useState("all");
  const [member, setMember] = useState<Member | null>(null);

  const [year, setYear] = useState<Year | null | undefined>(undefined);
  const [rollover, setRollover] = useState(false);
  const [existingUser, setExistingUser] = useState(false);

  const [removeMember, setRemoveMember] = useState<Member | null>(null);
  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["settings"] }),
      queryClient.invalidateQueries({ queryKey: ["my-schools"] }),
      queryClient.invalidateQueries({ queryKey: ["my-roles"] }),
      queryClient.invalidateQueries({ queryKey: ["my-permissions"] }),
      queryClient.invalidateQueries({ queryKey: ["my-system-permissions"] }),
      queryClient.invalidateQueries({ queryKey: ["employee-links"] }),
      queryClient.invalidateQueries({ queryKey: ["academic-years"] }),
    ]);
  }
  const employeeLinks = useQuery({
    queryKey: ["employee-links", activeSchool?.id],
    enabled: !!activeSchool && viewUsers && manage,
    queryFn: () => fetchEmployeeLinks(activeSchool!.id),
  });
  if (!activeSchool) return <EmptyState title="اختر مدرسة" />;
  if (!allowed) return <EmptyState title="لا تملك صلاحية الوصول" />;
  const data = query.data;
  const filtered = (data?.members ?? []).filter(
    (m) =>
      (status === "all" || m.status === status) &&
      (role === "all" || m.roles.includes(role as Role) || m.custom_roles.includes(role)) &&
      (m.full_name + " " + (m.phone ?? "") + " " + m.user_id)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div dir="rtl" className="space-y-6">
      <PageHeader title="الإعدادات" />
      {query.isPending ? (
        <p role="status">جار تحميل الإعدادات...</p>
      ) : query.isError ? (
        <div role="alert" className="space-y-3 text-destructive">
          <p>تعذر تحميل الإعدادات: {settingsError(query.error)}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            إعادة المحاولة
          </Button>
        </div>
      ) : data ? (
        <>
          <Tabs defaultValue="school" dir="rtl">
            <TabsList className="h-auto flex-wrap">
              <TabsTrigger value="school">المدرسة</TabsTrigger>
              <TabsTrigger value="years">السنوات الدراسية</TabsTrigger>
              {viewUsers && <TabsTrigger value="users">المستخدمون</TabsTrigger>}
              <TabsTrigger value="permissions">الصلاحيات</TabsTrigger>
            </TabsList>
            <TabsContent value="school">
              <SchoolForm
                key={data.school.id + data.school.updated_at}
                school={data.school}
                settings={data.settings}
                manage={manage}
                onSaved={refresh}
              />
            </TabsContent>
            <TabsContent value="years" className="space-y-4">
              {manage && (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => setYear(null)}>
                    <Plus className="size-4" />
                    سنة جديدة
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!data.years.length}
                    onClick={() => setRollover(true)}
                  >
                    <Plus className="size-4" />
                    ترحيل السنة الدراسية
                  </Button>
                </div>
              )}
              <DataTable
                rows={visibleAcademicYears(data.years)}
                rowKey={(r) => r.id}
                emptyTitle="لا توجد سنوات دراسية"
                columns={[
                  { key: "name", header: "السنة", cell: (r) => r.name },
                  {
                    key: "start",
                    header: "البداية",
                    cell: (r) => <span dir="ltr">{r.start_date}</span>,
                  },
                  {
                    key: "end",
                    header: "النهاية",
                    cell: (r) => <span dir="ltr">{r.end_date}</span>,
                  },
                  { key: "status", header: "الحالة", cell: (r) => YEAR_LABELS[r.status] },
                  {
                    key: "actions",
                    header: "",
                    cell: (r) =>
                      manage ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="تعديل السنة"
                          onClick={() => setYear(r)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                      ) : null,
                  },
                ]}
              />
            </TabsContent>
            {viewUsers && (
              <TabsContent value="users" className="space-y-4">
                <div className="flex flex-wrap gap-4 items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    المستخدمون: {data.members.length} · النشطون:{" "}
                    {data.members.filter((m) => m.status === "active").length}
                  </p>
                  {owner && (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => setExistingUser(true)}>
                        <UserPlus className="size-4" />
                        إضافة مستخدم بحساب موجود
                      </Button>
                    </div>
                  )}
                </div>
                <FilterBar
                  searchValue={search}
                  onSearchChange={setSearch}
                  onReset={() => {
                    setSearch("");
                    setStatus("all");
                    setRole("all");
                  }}
                >
                  <Choice
                    label="حالة العضوية"
                    value={status}
                    onChange={setStatus}
                    options={[["all", "كل الحالات"], ...Object.entries(MEMBER_LABELS)]}
                  />
                  <Choice
                    label="الدور"
                    value={role}
                    onChange={setRole}
                    options={[
                      ["all", "كل الأدوار"],
                      ...SCHOOL_ROLES.map((r) => [r, ROLE_LABELS[r]!] as [string, string]),
                      ...data.customRoles.map((r) => [r.id, r.name] as [string, string]),
                    ]}
                  />
                </FilterBar>
                <DataTable
                  rows={filtered}
                  rowKey={(r) => r.user_id}
                  emptyTitle="لا توجد نتائج"
                  columns={[
                    {
                      key: "name",
                      header: "المستخدم",
                      cell: (r) => (
                        <div>
                          <p>{r.full_name}</p>
                          <p dir="ltr" className="text-xs text-muted-foreground">
                            {r.phone}
                          </p>
                        </div>
                      ),
                    },
                    {
                      key: "roles",
                      header: "الأدوار",
                      cell: (r) =>
                        [
                          ...r.roles.map((x) => ROLE_LABELS[x]),
                          ...r.custom_roles.map(
                            (id) => data.customRoles.find((role) => role.id === id)?.name,
                          ),
                        ]
                          .filter(Boolean)
                          .join("، ") || "دون أدوار",
                    },
                    {
                      key: "employee",
                      header: "الموظف المرتبط",
                      cell: (r) => {
                        if (employeeLinks.isPending) return "جار التحميل...";
                        if (employeeLinks.isError) return "تعذر التحميل";
                        const link = employeeLinks.data?.links.find((l) => l.user_id === r.user_id);
                        return (
                          employeeLinks.data?.employees.find((e) => e.id === link?.employee_id)
                            ?.full_name ?? "دون ربط"
                        );
                      },
                    },
                    { key: "status", header: "العضوية", cell: (r) => MEMBER_LABELS[r.status] },
                    {
                      key: "action",
                      header: "",
                      cell: (r) => (
                        <DropdownMenu dir="rtl">
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="إجراءات المستخدم"
                              aria-label={`إجراءات ${r.full_name}`}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              disabled={!owner}
                              onClick={async () => {
                                try {
                                  const result = await resetSchoolUserPassword({
                                    data: { schoolId: activeSchool.id, userId: r.user_id },
                                  });
                                  if (result.error)
                                    toast.error(settingsError({ message: result.error }));
                                  else toast.success("تم إرسال رابط إعادة تعيين كلمة المرور");
                                } catch (error) {
                                  toast.error(settingsError(error));
                                }
                              }}
                            >
                              <RotateCcw className="size-4" />
                              إرسال رابط إعادة تعيين كلمة المرور
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={r.user_id === userId || !owner}
                              onClick={() => setMember(r)}
                            >
                              <Pencil className="size-4" />
                              تعديل العضوية والأدوار
                            </DropdownMenuItem>
                            {owner && (
                              <DropdownMenuItem
                                disabled={
                                  r.user_id === userId ||
                                  (r.roles.includes("school_owner") &&
                                    data.members.filter(
                                      (m) =>
                                        m.status === "active" && m.roles.includes("school_owner"),
                                    ).length <= 1)
                                }
                                onClick={() => setRemoveMember(r)}
                              >
                                <UserMinus className="size-4" />
                                إزالة العضوية من المدرسة
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ),
                    },
                  ]}
                />
              </TabsContent>
            )}
            <TabsContent value="permissions">
              <SettingsPermissions
                members={data.members}
                schoolId={activeSchool.id}
                customRoles={data.customRoles}
                permissions={data.permissions}
                owner={owner}
                onSaved={refresh}
              />
            </TabsContent>
          </Tabs>
          {year !== undefined && (
            <YearModal
              schoolId={activeSchool.id}
              year={year}
              onClose={() => setYear(undefined)}
              onSaved={refresh}
            />
          )}
          {rollover && manage && (
            <AcademicYearRollover
              schoolId={activeSchool.id}
              years={data.years}
              onClose={() => setRollover(false)}
              onSaved={refresh}
            />
          )}
          {member && (
            <MemberModal
              schoolId={activeSchool.id}
              member={member}
              owner={owner}
              customRoles={data.customRoles}
              lastOwner={
                !!member &&
                member.status === "active" &&
                member.roles.includes("school_owner") &&
                data.members.filter(
                  (m) => m.status === "active" && m.roles.includes("school_owner"),
                ).length === 1
              }
              onClose={() => {
                setMember(null);
              }}
              onSaved={refresh}
            />
          )}
          {existingUser && owner && (
            <ExistingSchoolUserModal
              schoolId={activeSchool.id}
              customRoles={data.customRoles}
              onClose={() => setExistingUser(false)}
              onSaved={refresh}
            />
          )}

          {removeMember && owner && (
            <RemoveSchoolUserModal
              schoolId={activeSchool.id}
              member={removeMember}
              platformAdmin={isPlatformAdmin}
              onClose={() => setRemoveMember(null)}
              onSaved={refresh}
            />
          )}
        </>
      ) : null}
    </div>
  );
}
function Choice({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} dir="rtl" disabled={disabled}>
      <SelectTrigger aria-label={label} className="min-w-40 w-auto">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function SchoolForm({
  school,
  settings,
  manage,
  onSaved,
}: {
  school: SchoolProfile;
  settings: SchoolSettings | null;
  manage: boolean;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    name_ar: school.name_ar,
    name_en: school.name_en ?? "",
    phone: school.phone ?? "",
    email: school.email ?? "",
    address: school.address ?? "",
    logo_url: school.logo_url ?? "",
    currency: school.currency,
    timezone: school.timezone,
  });
  const [options, setOptions] = useState({
    date_format: settings?.date_format ?? "dd/MM/yyyy",
    attendance_enabled: settings?.attendance_enabled ?? true,
    inventory_enabled: settings?.inventory_enabled ?? true,
    cost_centers_enabled: settings?.cost_centers_enabled ?? false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      try {
        new Intl.DateTimeFormat("ar", { timeZone: form.timezone });
        new Intl.NumberFormat("ar", { style: "currency", currency: form.currency });
      } catch {
        throw new Error("العملة أو المنطقة الزمنية غير صالحة.");
      }
      if (form.logo_url && !/^https:\/\//i.test(form.logo_url))
        throw new Error("رابط الشعار يجب أن يبدأ بـ https://");
      const { error } = await settingsClient().rpc("settings_save_school", {
        _school_id: school.id,
        _profile: form,
        _settings: options,
      });
      if (error) throw error;
      await onSaved();
      toast.success("تم حفظ الإعدادات");
    } catch (e) {
      setError(settingsError(e));
    } finally {
      setBusy(false);
    }
  }
  const renderProfileFields = (regional: boolean) => (
    <div className="grid gap-4 sm:grid-cols-2">
      {(
        [
          ["name_ar", "اسم المدرسة بالعربية", "text"],
          ["name_en", "اسم المدرسة بالإنجليزية", "text"],
          ["phone", "الهاتف", "tel"],
          ["email", "البريد الإلكتروني", "email"],
          ["address", "العنوان", "text"],
          ["logo_url", "رابط الشعار", "url"],
          ["currency", "العملة", "text"],
          ["timezone", "المنطقة الزمنية", "text"],
        ] as const
      )
        .filter(([key]) => regional === ["currency", "timezone"].includes(key))
        .map(([key, label, type]) => (
          <FormField
            key={key}
            label={label}
            required={["name_ar", "currency", "timezone"].includes(key)}
          >
            {(props) => (
              <Input
                {...props}
                type={type}
                value={form[key]}
                required={["name_ar", "currency", "timezone"].includes(key)}
                maxLength={key === "currency" ? 3 : 500}
                dir={key === "name_ar" || key === "address" ? "rtl" : "ltr"}
                onChange={(e) =>
                  setForm({
                    ...form,
                    [key]: key === "currency" ? e.target.value.toUpperCase() : e.target.value,
                  })
                }
              />
            )}
          </FormField>
        ))}
    </div>
  );
  return (
    <form onSubmit={save} className="max-w-3xl space-y-5">
      <fieldset disabled={!manage || busy} className="space-y-5">
        <section aria-labelledby="school-info-heading" className="space-y-4">
          <h2 id="school-info-heading" className="text-sm font-semibold">
            معلومات المدرسة
          </h2>
          {renderProfileFields(false)}
        </section>
        <section
          aria-labelledby="regional-heading"
          className="space-y-4 border-t border-border pt-4"
        >
          <h2 id="regional-heading" className="text-sm font-semibold">
            الإعدادات الإقليمية
          </h2>
          {renderProfileFields(true)}
          <FormField label="تنسيق التاريخ">
            {() => (
              <Choice
                label="تنسيق التاريخ"
                value={options.date_format}
                onChange={(v) => setOptions({ ...options, date_format: v })}
                options={["dd/MM/yyyy", "yyyy-MM-dd", "MM/dd/yyyy"].map((x) => [x, x])}
              />
            )}
          </FormField>
        </section>
        <section
          aria-labelledby="module-settings-heading"
          className="space-y-3 border-t border-border pt-4"
        >
          <h2 id="module-settings-heading" className="text-sm font-semibold">
            إعدادات الوحدات
          </h2>
          {(
            [
              ["attendance_enabled", "الحضور"],
              ["inventory_enabled", "المخزون"],
              ["cost_centers_enabled", "مراكز التكلفة"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between border-b py-3">
              <span>{label}</span>
              <Switch
                aria-label={label}
                checked={options[key]}
                onCheckedChange={(v) => setOptions({ ...options, [key]: v })}
              />
            </label>
          ))}
        </section>
        {manage && (
          <Button type="submit" disabled={busy}>
            <Save className="size-4" />
            {busy ? "جار الحفظ..." : "حفظ الإعدادات"}
          </Button>
        )}
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
function YearModal({
  schoolId,
  year,
  onClose,
  onSaved,
}: {
  schoolId: string;
  year: Year | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(year?.name ?? "");
  const [start, setStart] = useState(year?.start_date ?? "");
  const [end, setEnd] = useState(year?.end_date ?? "");
  const [status, setStatus] = useState<Year["status"]>(year?.status ?? "planned");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  async function save() {
    setBusy(true);
    setError("");
    try {
      const { error } = await settingsClient().rpc("settings_save_year", {
        _school_id: schoolId,
        _id: year?.id ?? null,
        _name: name,
        _start: start,
        _end: end,
        _status: status,
        _active: status === "active",
      });
      if (error) throw error;
      await onSaved();
      toast.success("تم حفظ السنة");
      onClose();
    } catch (e) {
      setError(settingsError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Modal
        open
        onOpenChange={(v) => {
          if (!v && !busy) onClose();
        }}
        title={year ? "تعديل السنة الدراسية" : "سنة دراسية جديدة"}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (end <= start) {
              setError("يجب أن تكون النهاية بعد البداية.");
              return;
            }
            if (status === "active" && !year?.is_active) setConfirm(true);
            else void save();
          }}
        >
          <fieldset disabled={busy} className="space-y-4">
            <FormField label="اسم السنة" required>
              {(props) => (
                <Input {...props} required value={name} onChange={(e) => setName(e.target.value)} />
              )}
            </FormField>
            <FormField label="البداية" required>
              {(props) => (
                <Input
                  {...props}
                  required
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              )}
            </FormField>
            <FormField label="النهاية" required>
              {(props) => (
                <Input
                  {...props}
                  required
                  type="date"
                  value={end}
                  min={start}
                  onChange={(e) => setEnd(e.target.value)}
                />
              )}
            </FormField>
            <Choice
              label="حالة السنة"
              value={status}
              onChange={(v) => setStatus(v as Year["status"])}
              options={Object.entries(YEAR_LABELS)}
            />
            <Button type="submit">
              <Save className="size-4" />
              {busy ? "جار الحفظ..." : "حفظ"}
            </Button>
          </fieldset>
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
        </form>
      </Modal>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="تفعيل السنة الدراسية"
        description="سيتم إغلاق السنة النشطة الحالية وتعيين هذه السنة كسنة نشطة."
        onConfirm={() => void save()}
      />
    </>
  );
}
function MemberModal({
  schoolId,
  member,
  owner,
  customRoles,
  lastOwner,
  onClose,
  onSaved,
}: {
  schoolId: string;
  member: Member;
  owner: boolean;
  customRoles: CustomRole[];
  lastOwner: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const workspace = useWorkspace();
  const privileged = workspace.isPlatformAdmin || workspace.roles.includes("school_owner");
  const [roles, setRoles] = useState<Role[]>(member.roles);
  const [custom, setCustom] = useState(member.custom_roles);
  const [status, setStatus] = useState<MemberStatus>(member.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await settingsClient().rpc("settings_save_member_roles", {
        _school_id: schoolId,
        _user_id: member.user_id,
        _roles: roles,
        _custom_roles: custom,
        _status: status,
      });
      if (result.error) throw result.error;
      await onSaved();
      toast.success("تم حفظ العضوية والأدوار");
      onClose();
    } catch (error) {
      setError(settingsError(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      title={"عضوية " + member.full_name}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <form onSubmit={save} className="space-y-4">
        <fieldset disabled={busy || !owner} className="space-y-4">
          <Choice
            label="حالة العضوية"
            value={status}
            disabled={lastOwner}
            onChange={(value) => setStatus(value as MemberStatus)}
            options={Object.entries(MEMBER_LABELS)}
          />
          {SCHOOL_ROLES.filter(
            (r) => privileged || !["school_owner", "school_manager"].includes(r),
          ).map((role) => (
            <label key={role} className="flex items-center gap-2">
              <Checkbox
                checked={roles.includes(role)}
                disabled={lastOwner && role === "school_owner"}
                onCheckedChange={(v) =>
                  setRoles((current) =>
                    v === true ? [...current, role] : current.filter((r) => r !== role),
                  )
                }
              />
              {ROLE_LABELS[role]}
            </label>
          ))}
          {customRoles.map((role) => (
            <label key={role.id} className="flex items-center gap-2">
              <Checkbox
                checked={custom.includes(role.id)}
                disabled={!role.is_active && !custom.includes(role.id)}
                onCheckedChange={(v) =>
                  setCustom((current) =>
                    v === true ? [...current, role.id] : current.filter((r) => r !== role.id),
                  )
                }
              />
              {role.name}
            </label>
          ))}
          <Button type="submit" disabled={busy}>
            <Save className="size-4" />
            حفظ العضوية
          </Button>
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
