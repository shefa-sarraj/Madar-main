import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ClipboardCopy,
  LockKeyhole,
  MoreHorizontal,
  Pencil,
  Plus,
  ShieldCheck,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/app/status-badge";
import { TablePagination } from "@/components/app/table-pagination";
import { usePagination, slicePage } from "@/lib/pagination";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { DataTable } from "@/components/app/data-table";
import { FormField } from "@/components/app/form-field";
import { Modal } from "@/components/app/modal";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { savePlatformSchool } from "@/lib/school-administration.functions";
import {
  type PlatformUser,
  SCHOOL_STATUS,
  PLATFORM_PERMISSIONS,
  schoolAdminClient,
  schoolAdministrationError,
} from "@/lib/school-administration";

import { MEMBER_LABELS, settingsError, type SchoolProfile } from "@/lib/settings";
import { generateTemporaryPassword } from "@/lib/temporary-password";
import { useWorkspace } from "@/lib/workspace";
import { SchoolAdministratorModal } from "@/components/app/school-administrator-modal";

export function PlatformSchools({ onSelectSchool }: { onSelectSchool?: () => void }) {
  const { isPlatformAdmin, setActiveSchool } = useWorkspace();
  const admin = isPlatformAdmin;
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["platform-schools"],
    enabled: admin,
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("*").order("name_ar");
      if (error) throw error;
      return data;
    },
  });
  const members = useQuery({
    queryKey: ["platform-school-members"],
    enabled: admin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_members")
        .select("school_id,user_id,status");
      if (error) throw error;
      return data ?? [];
    },
  });
  const platformUsers = useQuery({
    queryKey: ["platform-users"],
    enabled: admin,
    queryFn: async () => {
      const { data, error } = await schoolAdminClient().rpc("platform_list_users", {});
      if (error) throw error;
      return data ?? [];
    },
  });
  const administrators = useQuery({
    queryKey: ["platform-school-administrators"],
    enabled: admin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("school_id,user_id,role")
        .in("role", ["school_owner", "school_manager"]);
      if (error) throw error;
      return data ?? [];
    },
  });
  const [school, setSchool] = useState<SchoolProfile | null | undefined>(undefined);
  const [assignSchool, setAssignSchool] = useState<{ id: string; name_ar: string } | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["platform-schools"] }),
      qc.invalidateQueries({ queryKey: ["my-schools"] }),
      qc.invalidateQueries({ queryKey: ["settings"] }),
      qc.invalidateQueries({ queryKey: ["my-roles"] }),
    ]);
  }
  const pagination = usePagination([search, status]);
  const page = slicePage(
    (query.data ?? []).filter(
      (s) =>
        (!status || s.status === status) &&
        `${s.name_ar} ${s.name_en ?? ""}`.toLowerCase().includes(search.toLowerCase()),
    ),
    pagination,
  );
  const pageControl = {
    ...pagination,
    page: page.page,
    total: page.total,
    loading: query.isFetching,
  };
  const administratorLabel = (school: SchoolProfile) =>
    administrators.data
      ?.filter((r) => r.school_id === school.id)
      .map(
        (r) =>
          `${platformUsers.data?.find((u) => u.user_id === r.user_id)?.full_name || platformUsers.data?.find((u) => u.user_id === r.user_id)?.email || r.user_id} (${r.role === "school_owner" ? "مالك" : "مدير"})`,
      )
      .join("، ") || "—";
  const schoolActions = (school: SchoolProfile) => (
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label={`إجراءات ${school.name_ar}`}
          title="إجراءات المدرسة"
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setSchool(school)}>
          <Pencil className="size-4" />
          تعديل المدرسة وحالتها
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setAssignSchool(school)}>
          <UserPlus className="size-4" />
          تعيين مالك أو مدير
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const openSchool = (school: SchoolProfile) => (
    <Button
      size="sm"
      variant="outline"
      onClick={() => {
        setActiveSchool(school.id);
        onSelectSchool?.();
      }}
    >
      <Building2 className="size-4" />
      فتح المدرسة · إدارة المنصة
    </Button>
  );
  if (!admin) return null;
  return (
    <section dir="rtl" className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">إدارة المدارس</h2>
        <Button onClick={() => setSchool(null)}>
          <Plus className="size-4" />
          إنشاء مدرسة
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        المدارس: {query.data?.length ?? 0} · النشطة:{" "}
        {query.data?.filter((s) => s.status === "active").length ?? 0}
      </p>
      <div className="flex flex-wrap gap-2">
        <Input
          aria-label="بحث عن مدرسة"
          placeholder="بحث عن مدرسة"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
        />
        <select
          aria-label="حالة المدرسة"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-10 rounded-md border bg-background px-3"
        >
          <option value="">كل الحالات</option>
          {Object.entries(SCHOOL_STATUS).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {query.isError ? (
        <div role="alert">
          <p>{settingsError(query.error)}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            إعادة المحاولة
          </Button>
        </div>
      ) : (
        <>
          <div className="hidden md:block">
            <DataTable
              isLoading={query.isPending}
              pagination={pageControl}
              rows={page.rows}
              rowKey={(school) => school.id}
              emptyTitle="لا توجد مدارس مطابقة"
              columns={[
                {
                  key: "name",
                  header: "المدرسة",
                  cell: (school) => (
                    <div>
                      <p className="font-semibold">{school.name_ar}</p>
                      <p className="text-xs text-muted-foreground">{school.name_en}</p>
                    </div>
                  ),
                },
                {
                  key: "status",
                  header: "الحالة",
                  cell: (school) => (
                    <StatusBadge
                      tone={
                        school.status === "active"
                          ? "success"
                          : school.status === "suspended"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {SCHOOL_STATUS[school.status]}
                    </StatusBadge>
                  ),
                },
                {
                  key: "administrators",
                  header: "المالك / المدير",
                  cell: (school) => (
                    <p className="max-w-64 break-words text-sm">
                      {administrators.isPending || platformUsers.isPending
                        ? "جار التحميل..."
                        : administrators.isError || platformUsers.isError
                          ? "تعذر التحميل"
                          : administratorLabel(school)}
                    </p>
                  ),
                },
                {
                  key: "users",
                  header: "المستخدمون النشطون",
                  cell: (school) => (
                    <span className="tnum font-semibold">
                      {members.isPending
                        ? "—"
                        : members.isError
                          ? "غير متاح"
                          : (members.data?.filter(
                              (member) =>
                                member.school_id === school.id && member.status === "active",
                            ).length ?? 0)}
                    </span>
                  ),
                },
                {
                  key: "actions",
                  header: "إدارة المدرسة",
                  cell: (school) => (
                    <div className="flex items-center justify-end gap-1">
                      {openSchool(school)}
                      {schoolActions(school)}
                    </div>
                  ),
                },
              ]}
            />
          </div>
          <div className="space-y-2 md:hidden" aria-busy={query.isFetching}>
            {query.isPending ? (
              <p role="status" className="py-3 text-sm text-muted-foreground">
                جار تحميل المدارس...
              </p>
            ) : page.rows.length ? (
              page.rows.map((school) => (
                <article
                  key={school.id}
                  className="min-w-0 space-y-3 rounded-md border border-border bg-card p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="break-words text-sm font-semibold">{school.name_ar}</h3>
                      <p className="break-words text-xs text-muted-foreground">{school.name_en}</p>
                    </div>
                    {schoolActions(school)}
                  </div>
                  <StatusBadge
                    tone={
                      school.status === "active"
                        ? "success"
                        : school.status === "suspended"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {SCHOOL_STATUS[school.status]}
                  </StatusBadge>
                  <p className="break-words text-xs text-muted-foreground">
                    المالك / المدير:{" "}
                    {administrators.isError || platformUsers.isError
                      ? "تعذر التحميل"
                      : administratorLabel(school)}
                  </p>
                  <p className="text-xs">
                    المستخدمون النشطون:{" "}
                    <span className="tnum font-semibold">
                      {members.isPending || members.isError
                        ? "—"
                        : (members.data?.filter(
                            (member) =>
                              member.school_id === school.id && member.status === "active",
                          ).length ?? 0)}
                    </span>
                  </p>
                  {openSchool(school)}
                </article>
              ))
            ) : (
              <p className="py-3 text-sm text-muted-foreground">لا توجد مدارس مطابقة.</p>
            )}
            <TablePagination {...pageControl} />
          </div>
        </>
      )}
      {school !== undefined && (
        <PlatformSchoolModal
          school={school}
          onClose={() => setSchool(undefined)}
          onSaved={refresh}
          onCreated={(id, name_ar) => setAssignSchool({ id, name_ar })}
        />
      )}
      <PlatformUsers onSelectSchool={onSelectSchool} />
      {assignSchool && (
        <SchoolAdministratorModal
          schoolId={assignSchool.id}
          schoolName={assignSchool.name_ar}
          onClose={() => setAssignSchool(null)}
          onSaved={refresh}
        />
      )}
    </section>
  );
}
function PlatformUsers({ onSelectSchool }: { onSelectSchool: (() => void) | undefined }) {
  const { schools, setActiveSchool, userId } = useWorkspace();
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const memberships = useQuery({
    queryKey: ["platform-school-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_members")
        .select("school_id,user_id,status");
      if (error) throw error;
      return data ?? [];
    },
  });
  const query = useQuery({
    queryKey: ["platform-users"],
    queryFn: async () => {
      const { data, error } = await schoolAdminClient().rpc("platform_list_users", {});
      if (error) throw error;
      return data ?? [];
    },
  });
  const pagination = usePagination(["platform-users"]);
  const page = slicePage(query.data ?? [], pagination);
  const pageControl = {
    ...pagination,
    page: page.page,
    total: page.total,
    loading: query.isFetching,
  };
  const membershipCount = (id: string) =>
    memberships.isPending || memberships.isError
      ? "—"
      : (memberships.data?.filter((member) => member.user_id === id).length ?? 0);
  const userActions = (user: PlatformUser) => (
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          title="إجراءات المستخدم"
          aria-label={`إجراءات ${user.full_name || user.email}`}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          disabled={user.user_id === userId}
          onClick={() => setSelectedUser(user.user_id)}
        >
          <Building2 className="size-4" />
          إدارة عضويات المدارس
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  return (
    <section className="min-w-0 space-y-3 border-t border-border pt-4">
      <h2 className="text-lg font-semibold">مستخدمو المنصة</h2>
      {query.isError && <p role="alert">{settingsError(query.error)}</p>}
      <div className="hidden md:block">
        <DataTable
          rows={page.rows}
          pagination={pageControl}
          isLoading={query.isPending}
          rowKey={(user) => user.user_id}
          emptyTitle="لا يوجد مستخدمون"
          columns={[
            {
              key: "name",
              header: "المستخدم",
              cell: (user) => (
                <div className="flex items-center gap-2">
                  {user.email === "super.madar@gmail.com" ? (
                    <ShieldCheck className="size-4 shrink-0 text-gold-foreground" />
                  ) : null}
                  <span className="font-medium">{user.full_name || user.email}</span>
                </div>
              ),
            },
            {
              key: "platform",
              header: "دور المنصة",
              cell: (user) => (
                <StatusBadge tone={user.email === "super.madar@gmail.com" ? "gold" : "neutral"}>
                  {user.email === "super.madar@gmail.com"
                    ? "Super Admin · مسؤول المنصة"
                    : "مستخدم مدرسة"}
                </StatusBadge>
              ),
            },
            {
              key: "email",
              header: "البريد الإلكتروني",
              cell: (user) => (
                <span dir="ltr" className="text-xs text-muted-foreground">
                  {user.email}
                </span>
              ),
            },
            {
              key: "memberships",
              header: "عضويات المدارس",
              cell: (user) => <span className="tnum">{membershipCount(user.user_id)}</span>,
            },
            { key: "actions", header: "الإجراءات", cell: userActions },
          ]}
        />
      </div>
      <div className="space-y-2 md:hidden">
        {query.isPending ? (
          <p role="status" className="py-3 text-sm text-muted-foreground">
            جار تحميل المستخدمين...
          </p>
        ) : (
          page.rows.map((user) => (
            <article
              key={user.user_id}
              className={`min-w-0 space-y-2 rounded-md border bg-card p-3 ${user.email === "super.madar@gmail.com" ? "border-gold/50" : "border-border"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="break-words text-sm font-semibold">
                    {user.full_name || user.email}
                  </h3>
                  <p dir="ltr" className="break-all text-end text-xs text-muted-foreground">
                    {user.email}
                  </p>
                </div>
                {userActions(user)}
              </div>
              <StatusBadge tone={user.email === "super.madar@gmail.com" ? "gold" : "neutral"}>
                {user.email === "super.madar@gmail.com"
                  ? "Super Admin · مسؤول المنصة"
                  : "مستخدم مدرسة"}
              </StatusBadge>
              <p className="text-xs text-muted-foreground">
                عضويات المدارس: <span className="tnum">{membershipCount(user.user_id)}</span>
              </p>
            </article>
          ))
        )}
        <TablePagination {...pageControl} />
      </div>
      <details className="min-w-0 border-t border-border pt-3">
        <summary className="cursor-pointer text-sm font-semibold">
          مصفوفة صلاحيات المنصة{" "}
          <span className="font-normal text-muted-foreground">· للعرض فقط</span>
        </summary>
        <div
          role="region"
          aria-label="صلاحيات مستخدمي المنصة"
          tabIndex={0}
          className="mt-3 max-h-80 min-w-0 overflow-auto rounded-md border border-border"
        >
          <table className="w-full min-w-[560px] text-sm">
            <thead className="sticky top-0 z-10 bg-secondary">
              <tr className="border-b border-border">
                <th rowSpan={2} className="p-3 text-start" scope="col">
                  المستخدم
                </th>
                <th colSpan={2} className="border-s border-border p-2 text-center" scope="colgroup">
                  إدارة المدارس
                </th>
                <th className="border-s border-border p-2 text-center" scope="colgroup">
                  إدارة المنصة
                </th>
              </tr>
              <tr>
                {PLATFORM_PERMISSIONS.map((permission) => (
                  <th key={permission.id} scope="col" className="px-3 py-2 text-center text-xs">
                    {permission.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {query.data?.map((user) => (
                <tr key={user.user_id} className="border-t border-border">
                  <th scope="row" className="px-3 py-2 text-start font-normal">
                    {user.full_name || user.email}
                    {user.email === "super.madar@gmail.com" ? (
                      <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <LockKeyhole className="size-3" />
                        مسؤول منصة محمي
                      </span>
                    ) : null}
                  </th>
                  {PLATFORM_PERMISSIONS.map((permission) => (
                    <td key={permission.id} className="p-3 text-center">
                      <Checkbox
                        disabled
                        checked={user.permissions.includes(permission.id)}
                        aria-label={`${permission.label} · ${user.full_name || user.email}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      {selectedUser && (
        <Modal
          open
          title="عضويات المستخدم"
          onOpenChange={(open) => {
            if (!open) setSelectedUser(null);
          }}
        >
          {memberships.isError && <p role="alert">{settingsError(memberships.error)}</p>}
          <DataTable
            rows={(memberships.data ?? []).filter((m) => m.user_id === selectedUser)}
            rowKey={(m) => m.school_id}
            emptyTitle="لا توجد عضويات"
            columns={[
              {
                key: "school",
                header: "المدرسة",
                cell: (m) => schools.find((s) => s.id === m.school_id)?.name_ar ?? m.school_id,
              },
              { key: "status", header: "الحالة", cell: (m) => MEMBER_LABELS[m.status] },
              {
                key: "manage",
                header: "",
                cell: (m) => (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setActiveSchool(m.school_id);
                      setSelectedUser(null);
                      onSelectSchool?.();
                    }}
                  >
                    <Pencil className="size-4" />
                    إدارة المستخدمين
                  </Button>
                ),
              },
            ]}
          />
        </Modal>
      )}
    </section>
  );
}
function PlatformSchoolModal({
  school,
  onClose,
  onSaved,
  onCreated,
}: {
  school: SchoolProfile | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onCreated: (id: string, name: string) => void;
}) {
  const [step, setStep] = useState(0);
  const regional = useQuery({
    queryKey: ["platform-school-regional", school?.id],
    enabled: !!school,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_settings")
        .select("date_format")
        .eq("school_id", school!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const [profile, setProfile] = useState({
    name_ar: school?.name_ar ?? "",
    name_en: school?.name_en ?? "",
    phone: school?.phone ?? "",
    email: school?.email ?? "",
    address: school?.address ?? "",
    logo_url: school?.logo_url ?? "",
    currency: school?.currency ?? "USD",
    timezone: school?.timezone ?? "Asia/Jerusalem",
  });
  const [status, setStatus] = useState<SchoolProfile["status"]>(school?.status ?? "active");
  const [newAccount, setNewAccount] = useState(false);
  const [assignNow, setAssignNow] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [initialRole, setInitialRole] = useState<"school_owner" | "school_manager">("school_owner");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const lock = useRef(false);
  const [schoolId] = useState(() => school?.id ?? crypto.randomUUID());
  async function save() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await savePlatformSchool({
        data: {
          schoolId,
          create: !school,
          profile,
          status,
          ...(!school && assignNow
            ? {
                initialRole,
                initialAccount: newAccount
                  ? { mode: "new" as const, email, fullName: name, temporaryPassword: password }
                  : { mode: "existing" as const, email },
              }
            : {}),
        },
      });
      if (result.error) throw new Error(result.error);
    } catch (e) {
      setError(schoolAdministrationError(e));
      setBusy(false);
      lock.current = false;
      return;
    }
    toast.success(school ? "تم حفظ المدرسة وحالتها" : "تم إنشاء المدرسة");
    if (!school && assignNow && newAccount) {
      setRevealed(password);
      setPassword("");
      setBusy(false);
    } else {
      setPassword("");
      onClose();
    }
    await onSaved().catch(() => toast.warning("تم الحفظ؛ أعد تحميل قائمة المدارس"));
    if (!school && !assignNow) onCreated(schoolId, profile.name_ar);
  }
  if (revealed !== null)
    return (
      <Modal
        open
        onOpenChange={(open) => {
          if (!open) {
            setRevealed(null);
            onClose();
          }
        }}
        title="تم إنشاء المدرسة والمستخدم"
        description="تظهر كلمة المرور مرة واحدة فقط."
        footer={
          <Button
            onClick={() => {
              setRevealed(null);
              onClose();
            }}
          >
            إغلاق
          </Button>
        }
      >
        <p dir="ltr" className="break-all">
          {email}
        </p>
        <div className="flex items-center gap-2">
          <code dir="ltr" className="min-w-0 flex-1 break-all select-all">
            {revealed}
          </code>
          <Button
            size="icon"
            variant="outline"
            title="نسخ كلمة المرور"
            onClick={() =>
              void navigator.clipboard
                .writeText(revealed)
                .then(() => setCopied(true))
                .catch(() => toast.error("تعذر النسخ"))
            }
          >
            {copied ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />}
          </Button>
        </div>
      </Modal>
    );
  return (
    <>
      <Modal
        open
        onOpenChange={(open) => {
          if (!open && !busy) onClose();
        }}
        title={school ? "تعديل المدرسة" : "إنشاء مدرسة"}
        footer={
          <div className="flex w-full flex-wrap gap-2">
            {step > 0 ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setStep(step - 1);
                  setError("");
                }}
              >
                <ArrowRight className="size-4" />
                السابق
              </Button>
            ) : null}
            <Button type="submit" form="platform-school-form" disabled={busy} className="flex-1">
              {step < 2 ? (
                <>
                  التالي
                  <ArrowLeft className="size-4" />
                </>
              ) : busy ? (
                "جار الحفظ..."
              ) : school ? (
                "حفظ المدرسة"
              ) : (
                "إنشاء المدرسة"
              )}
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              إلغاء
            </Button>
          </div>
        }
      >
        <ol aria-label="خطوات المدرسة" className="grid grid-cols-3 gap-2 text-xs">
          {["معلومات المدرسة", "الإعدادات الإقليمية", "المسؤول والمراجعة"].map((label, index) => (
            <li
              key={label}
              aria-current={step === index ? "step" : undefined}
              className={`border-b-2 pb-2 ${step === index ? "border-primary font-semibold" : "border-border text-muted-foreground"}`}
            >
              {index + 1}. {label}
            </li>
          ))}
        </ol>
        <form
          id="platform-school-form"
          className="max-h-[55vh] space-y-4 overflow-y-auto px-0.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (step < 2) {
              setStep(step + 1);
              setError("");
            } else setConfirm(true);
          }}
        >
          <fieldset disabled={busy} className="space-y-3">
            <h2 className="text-sm font-semibold">
              {["معلومات المدرسة", "الإعدادات الإقليمية", "المسؤول الأول والمراجعة"][step]}
            </h2>
            {(
              [
                ["name_ar", "اسم المدرسة بالعربية"],
                ["name_en", "الاسم بالإنجليزية"],
                ["phone", "الهاتف"],
                ["email", "بريد المدرسة"],
                ["address", "العنوان"],
                ["logo_url", "رابط الشعار"],
                ["currency", "العملة"],
                ["timezone", "المنطقة الزمنية"],
              ] as const
            )
              .filter(([key]) =>
                step === 0
                  ? !["logo_url", "currency", "timezone"].includes(key)
                  : step === 1
                    ? ["logo_url", "currency", "timezone"].includes(key)
                    : false,
              )
              .map(([key, label]) => (
                <FormField
                  key={key}
                  label={label}
                  required={["name_ar", "currency", "timezone"].includes(key)}
                >
                  {(p) => (
                    <Input
                      {...p}
                      required={["name_ar", "currency", "timezone"].includes(key)}
                      type={key === "email" ? "email" : key === "logo_url" ? "url" : "text"}
                      dir={key === "name_ar" || key === "address" ? "rtl" : "ltr"}
                      value={profile[key]}
                      onChange={(e) =>
                        setProfile((v) => ({
                          ...v,
                          [key]: key === "currency" ? e.target.value.toUpperCase() : e.target.value,
                        }))
                      }
                    />
                  )}
                </FormField>
              ))}
            {step === 1 ? (
              <FormField label="تنسيق التاريخ" hint="يُدار تنسيق التاريخ ضمن إعدادات المدرسة.">
                {(props) => (
                  <Input
                    {...props}
                    dir="ltr"
                    readOnly
                    value={
                      !school
                        ? "dd/MM/yyyy"
                        : regional.isPending
                          ? "جار التحميل..."
                          : regional.isError
                            ? "تعذر التحميل"
                            : (regional.data?.date_format ?? "dd/MM/yyyy")
                    }
                  />
                )}
              </FormField>
            ) : null}
            {step === 2 ? (
              <>
                <FormField label="حالة المدرسة">
                  {(p) => (
                    <select
                      {...p}
                      className="h-10 w-full rounded-md border bg-background px-3"
                      value={status}
                      onChange={(e) => setStatus(e.target.value as SchoolProfile["status"])}
                    >
                      {Object.entries(SCHOOL_STATUS).map(([id, label]) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ))}
                    </select>
                  )}
                </FormField>
                {!school && (
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={assignNow}
                      onCheckedChange={(v) => setAssignNow(v === true)}
                    />
                    تعيين المسؤول أثناء الإنشاء
                  </label>
                )}
                {!school && assignNow && (
                  <>
                    <h3 className="text-sm font-semibold">المالك أو المدير الأول</h3>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={newAccount}
                        onCheckedChange={(value) => {
                          setNewAccount(value === true);
                          setPassword("");
                        }}
                      />
                      إنشاء حساب جديد
                    </label>
                    <FormField label="بريد المستخدم" required>
                      {(p) => (
                        <Input
                          {...p}
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      )}
                    </FormField>
                    {newAccount && (
                      <>
                        <FormField label="اسم المستخدم" required>
                          {(p) => (
                            <Input
                              {...p}
                              required
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                            />
                          )}
                        </FormField>
                        <FormField label="كلمة المرور المؤقتة" required>
                          {(p) => (
                            <div className="flex gap-2">
                              <Input
                                {...p}
                                type="password"
                                autoComplete="new-password"
                                minLength={8}
                                maxLength={128}
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                title="توليد كلمة مرور"
                                onClick={() => setPassword(generateTemporaryPassword())}
                              >
                                <Sparkles className="size-4" />
                                توليد
                              </Button>
                            </div>
                          )}
                        </FormField>
                      </>
                    )}
                    <FormField label="الدور الأول">
                      {(p) => (
                        <select
                          {...p}
                          className="h-10 w-full rounded-md border bg-background px-3"
                          value={initialRole}
                          onChange={(e) => setInitialRole(e.target.value as typeof initialRole)}
                        >
                          <option value="school_owner">مالك المدرسة</option>
                          <option value="school_manager">مدير المدرسة</option>
                        </select>
                      )}
                    </FormField>
                  </>
                )}
                {school ? (
                  <p className="text-xs text-muted-foreground">
                    يبقى تعيين المالك والمدير مستقلاً عن تعديل بيانات المدرسة.
                  </p>
                ) : null}
                <section aria-label="مراجعة المدرسة" className="border-t border-border pt-3">
                  <h3 className="mb-2 text-sm font-semibold">مراجعة قبل الحفظ</h3>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
                    {[
                      ["المدرسة", profile.name_ar],
                      ["الاسم بالإنجليزية", profile.name_en],
                      ["الهاتف", profile.phone],
                      ["البريد", profile.email],
                      ["العنوان", profile.address],
                      ["العملة", profile.currency],
                      ["المنطقة الزمنية", profile.timezone],
                      ["رابط الشعار", profile.logo_url],
                      [
                        "تنسيق التاريخ",
                        !school
                          ? "dd/MM/yyyy"
                          : regional.isError
                            ? "تعذر التحميل"
                            : regional.isPending
                              ? "جار التحميل..."
                              : (regional.data?.date_format ?? "dd/MM/yyyy"),
                      ],
                      ["الحالة", SCHOOL_STATUS[status]],
                      ...(!school
                        ? [
                            ["المسؤول الأول", assignNow ? email : "تعيين بعد الإنشاء"],
                            ...(assignNow
                              ? [
                                  ["نوع الحساب", newAccount ? "حساب جديد" : "حساب موجود"],
                                  [
                                    "الدور",
                                    initialRole === "school_owner"
                                      ? "مالك المدرسة"
                                      : "مدير المدرسة",
                                  ],
                                  ...(newAccount ? [["اسم المسؤول", name]] : []),
                                ]
                              : []),
                          ]
                        : []),
                    ].map(([label, value]) => (
                      <div key={label} className="contents">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="min-w-0 break-words">{value || "—"}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              </>
            ) : null}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </fieldset>
        </form>
      </Modal>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={school ? "تأكيد تعديل المدرسة" : "تأكيد إنشاء المدرسة"}
        description={
          status !== "active"
            ? "سيتم إيقاف وصول أعضاء المدرسة. يبقى مسؤول النظام قادراً على إدارتها."
            : school
              ? "سيتم حفظ بيانات المدرسة وحالتها."
              : assignNow
                ? "سيتم إنشاء المدرسة وربط الحساب المحدد بالدور الأول."
                : "سيتم إنشاء المدرسة ثم تعيين مسؤول لها."
        }
        onConfirm={() => void save()}
      />
    </>
  );
}
