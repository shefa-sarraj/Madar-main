import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "@/lib/workspace";
import { defaultRolePermissions } from "@/lib/role-permissions";
import { platformRequestsClient } from "@/lib/platform-requests";
import { Fragment, useState } from "react";
import { LockKeyhole, Pencil, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/app/data-table";
import { AppDrawer } from "@/components/app/drawer";
import { FormField } from "@/components/app/form-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MODULE_GROUPS } from "@/lib/settings-report-presentation";
import { ROLE_LABELS } from "@/lib/navigation";
import {
  MEMBER_LABELS,
  MODULES,
  ROLE_SCOPE,
  SCHOOL_ROLES,
  settingsClient,
  settingsError,
} from "@/lib/settings";
import type { CustomRole, Member, Module, Permission, RolePermission } from "@/lib/settings";

const ACTIONS = [
  ["can_view", "عرض"],
  ["can_create", "إنشاء"],
  ["can_edit", "تعديل"],
  ["can_manage", "إدارة"],
] as const;
const emptyPermission = (module: Module): Permission => ({
  module,
  can_view: false,
  can_create: false,
  can_edit: false,
  can_manage: false,
});

// Protected roles retain their existing scopes; scoped teacher/case access still uses RLS.
function Matrix({
  rows,
  onChange,
  lockAdministration = false,
  disabled = false,
}: {
  rows: Permission[];
  lockAdministration?: boolean;
  disabled?: boolean;
  onChange?: (module: Module, key: (typeof ACTIONS)[number][0], checked: boolean) => void;
}) {
  const editable = (row: Permission, key: (typeof ACTIONS)[number][0]) =>
    !!onChange &&
    !disabled &&
    !(["settings", "users"].includes(row.module) && (lockAdministration || key !== "can_view"));
  const cells = (scope: Permission[], action?: (typeof ACTIONS)[number][0]) =>
    scope.flatMap((row) =>
      ACTIONS.filter(([key]) => (!action || key === action) && editable(row, key)).map(([key]) => ({
        row,
        key,
      })),
    );
  const bulk = (
    scope: Permission[],
    action: (typeof ACTIONS)[number][0] | undefined,
    label: string,
  ) => {
    const targets = cells(scope, action);
    const selected = targets.filter(({ row, key }) => row[key]).length;
    return (
      <Checkbox
        aria-label={label}
        title={label}
        disabled={!targets.length}
        checked={
          targets.length > 0 && selected === targets.length
            ? true
            : selected
              ? "indeterminate"
              : false
        }
        onCheckedChange={(checked) =>
          targets.forEach(({ row, key }) => onChange?.(row.module, key, checked === true))
        }
      />
    );
  };
  return (
    <div
      className="max-h-[60vh] min-w-0 overflow-auto rounded-md border border-border"
      role="region"
      aria-label="مصفوفة الصلاحيات"
      tabIndex={0}
    >
      <table className="w-full min-w-[440px] border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-secondary shadow-sm">
          <tr>
            <th scope="col" className="p-3 text-start">
              الوحدة
            </th>
            {ACTIONS.map(([key, label]) => (
              <th key={key} scope="col" className="p-2 text-center">
                <span className="block">{label}</span>
                {onChange ? (
                  <span className="mt-1 inline-flex items-center gap-1 text-xs font-normal">
                    {bulk(rows, key, `تحديد جميع صلاحيات ${label} القابلة للتعديل`)}الكل
                  </span>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MODULE_GROUPS.map((group) => {
            const grouped = group.modules.flatMap((module) =>
              rows.filter((row) => row.module === module),
            );
            return grouped.length ? (
              <Fragment key={group.label}>
                <tr className="border-y border-border bg-muted/60">
                  <th
                    scope="rowgroup"
                    colSpan={5}
                    className="px-3 py-2 text-start text-xs font-semibold"
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span>{group.label}</span>
                      {onChange ? (
                        <span className="inline-flex items-center gap-2 font-normal">
                          {bulk(
                            grouped,
                            undefined,
                            `تحديد جميع الصلاحيات القابلة للتعديل في ${group.label}`,
                          )}
                          تحديد المجموعة
                        </span>
                      ) : null}
                    </span>
                  </th>
                </tr>
                {grouped.map((row) => (
                  <tr
                    key={row.module}
                    className="border-b border-border last:border-0 hover:bg-muted/30"
                  >
                    <th scope="row" className="px-3 py-2.5 text-start font-normal">
                      {MODULES.find(([key]) => key === row.module)?.[1]}
                    </th>
                    {ACTIONS.map(([key, label]) => (
                      <td key={key} className="px-2 py-2.5 text-center">
                        <Checkbox
                          aria-label={label + " " + MODULES.find(([id]) => id === row.module)?.[1]}
                          checked={row[key]}
                          disabled={!editable(row, key)}
                          onCheckedChange={(checked) =>
                            onChange?.(row.module, key, checked === true)
                          }
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ) : null;
          })}
        </tbody>
      </table>
    </div>
  );
}

export function SettingsPermissions({
  schoolId,
  customRoles,
  members,
  permissions,
  owner,
  onSaved,
}: {
  schoolId: string;
  customRoles: CustomRole[];
  members: Member[];
  permissions: RolePermission[];
  owner: boolean;
  onSaved: () => Promise<void>;
}) {
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const systemMatrix = useQuery({
    queryKey: ["system-role-matrix", schoolId],
    queryFn: async () => {
      const { data, error } = await settingsClient()
        .from("school_system_role_permissions")
        .select("*")
        .eq("school_id", schoolId);
      if (error) throw error;
      return data ?? [];
    },
  });
  const [replacement, setReplacement] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const [selected, setSelected] = useState("school_owner");
  const [editing, setEditing] = useState<CustomRole | null | undefined>(undefined);
  const custom = customRoles.find((role) => role.id === selected);
  const rows = custom
    ? MODULES.map(
        ([module]) =>
          permissions.find((p) => p.role_id === custom.id && p.module === module) ??
          emptyPermission(module),
      )
    : defaultRolePermissions(selected).map(
        (row) =>
          systemMatrix.data?.find((p) => p.role === selected && p.module === row.module) ?? row,
      );
  const editableSystem =
    owner &&
    selected !== "school_owner" &&
    (selected !== "school_manager" ||
      workspace.isPlatformAdmin ||
      workspace.roles.includes("school_owner"));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select dir="rtl" value={selected} onValueChange={setSelected}>
          <SelectTrigger aria-label="الدور" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCHOOL_ROLES.map((role) => (
              <SelectItem key={role} value={role}>
                {ROLE_LABELS[role]}
              </SelectItem>
            ))}
            {customRoles.map((role) => (
              <SelectItem key={role.id} value={role.id}>
                {role.name}
                {role.is_active ? "" : " (موقوف)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!custom && !editableSystem && (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <LockKeyhole className="size-4" />
            دور نظام محمي
          </span>
        )}
        {owner && (
          <Button onClick={() => setEditing(null)}>
            <Plus className="size-4" />
            دور مخصص
          </Button>
        )}
        {owner && custom && (
          <Button
            variant="outline"
            size="icon"
            title="تعديل الدور"
            onClick={() => setEditing(custom)}
          >
            <Pencil className="size-4" />
          </Button>
        )}
      </div>
      <p className="break-words text-sm text-muted-foreground">
        {custom?.description ?? ROLE_SCOPE[selected]}
      </p>
      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          {!custom && systemMatrix.isError ? (
            <p role="alert" className="text-sm text-destructive">
              تعذر تحميل الصلاحيات.{" "}
              <button type="button" onClick={() => systemMatrix.refetch()}>
                إعادة المحاولة
              </button>
            </p>
          ) : !custom && systemMatrix.isPending ? (
            <p role="status">جار تحميل الصلاحيات...</p>
          ) : (custom && owner) || (!custom && editableSystem) ? (
            <EditableRoleMatrix
              key={selected + JSON.stringify(rows)}
              schoolId={schoolId}
              role={custom}
              systemRole={custom ? undefined : (selected as import("@/lib/settings").Role)}
              rows={rows}
              onSaved={async () => {
                await queryClient.invalidateQueries({ queryKey: ["system-role-matrix", schoolId] });
                await queryClient.invalidateQueries({ queryKey: ["my-system-permissions"] });
                await onSaved();
              }}
            />
          ) : (
            <Matrix rows={rows} />
          )}
        </div>
        <aside className="min-w-0 space-y-3 xl:sticky xl:top-3">
          <p className="text-sm font-semibold">
            المستخدمون المعينون:{" "}
            {
              members.filter((m) =>
                custom
                  ? m.custom_roles.includes(custom.id)
                  : m.roles.includes(selected as import("@/lib/settings").Role),
              ).length
            }
          </p>
          {
            <section className="max-h-[60vh] space-y-3 overflow-auto">
              <h3 className="text-sm font-semibold">المستخدمون المعينون</h3>
              <DataTable
                rows={members.filter((m) =>
                  custom
                    ? m.custom_roles.includes(custom.id)
                    : m.roles.includes(selected as import("@/lib/settings").Role),
                )}
                rowKey={(m) => m.user_id}
                emptyTitle="لا يوجد مستخدمون معينون"
                columns={[
                  { key: "name", header: "المستخدم", cell: (m) => m.full_name },
                  { key: "status", header: "الحالة", cell: (m) => MEMBER_LABELS[m.status] },
                ]}
              />
              {owner && custom?.is_active && (
                <div className="flex flex-wrap gap-2">
                  <select
                    aria-label="الدور البديل"
                    value={replacement}
                    onChange={(e) => setReplacement(e.target.value)}
                    className="h-10 border rounded-md bg-background px-3"
                  >
                    <option value="">اختر الدور البديل</option>
                    {customRoles
                      .filter((r) => r.id !== custom.id && r.is_active)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                  </select>
                  <Button
                    variant="outline"
                    disabled={!replacement || reassigning}
                    onClick={async () => {
                      setReassigning(true);
                      try {
                        const { error } = await platformRequestsClient().rpc(
                          "settings_reassign_custom_role",
                          {
                            _school_id: schoolId,
                            _role_id: custom.id,
                            _replacement_id: replacement,
                          },
                        );
                        if (error) throw error;
                        await onSaved();
                        setReplacement("");
                        toast.success("تم نقل المستخدمين وتعطيل الدور");
                      } catch (error) {
                        toast.error(settingsError(error));
                      } finally {
                        setReassigning(false);
                      }
                    }}
                  >
                    <Save className="size-4" />
                    نقل المستخدمين وتعطيل الدور
                  </Button>
                </div>
              )}
            </section>
          }
        </aside>
      </div>
      {editing !== undefined && (
        <RoleDrawer
          schoolId={schoolId}
          role={editing}
          permissions={permissions}
          assignedCount={
            members.filter(
              (m) => m.status === "active" && m.custom_roles.includes(editing?.id ?? ""),
            ).length
          }
          onClose={() => setEditing(undefined)}
          onSaved={async (id) => {
            await onSaved();
            setSelected(id);
          }}
        />
      )}
    </div>
  );
}

function RoleDrawer({
  schoolId,
  role,
  permissions,
  assignedCount,
  onClose,
  onSaved,
}: {
  schoolId: string;
  role: CustomRole | null;
  permissions: RolePermission[];
  assignedCount: number;
  onClose: () => void;
  onSaved: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [active, setActive] = useState(role?.is_active ?? true);
  const [rows, setRows] = useState<Permission[]>(() =>
    MODULES.map(([module]) => {
      const saved = permissions.find((p) => p.role_id === role?.id && p.module === module);
      return saved
        ? {
            module,
            can_view: saved.can_view,
            can_create: saved.can_create,
            can_edit: saved.can_edit,
            can_manage: saved.can_manage,
          }
        : emptyPermission(module);
    }),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function change(module: Module, key: (typeof ACTIONS)[number][0], checked: boolean) {
    setRows((current) =>
      current.map((row) => {
        if (row.module !== module) return row;
        const next = { ...row, [key]: checked };
        if (key === "can_view" && !checked) return emptyPermission(module);
        if (checked) next.can_view = true;
        if (key === "can_manage" && checked) {
          next.can_create = true;
          next.can_edit = true;
        }
        if ((key === "can_create" || key === "can_edit") && !checked) next.can_manage = false;
        return next;
      }),
    );
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data, error } = await settingsClient().rpc("settings_save_role", {
        _school_id: schoolId,
        _id: role?.id ?? null,
        _name: name,
        _description: description,
        _active: active,
        _permissions: rows,
      });
      if (error) throw error;
      await onSaved(data);
      toast.success("تم حفظ الدور والصلاحيات");
      onClose();
    } catch (error) {
      setError(settingsError(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppDrawer
      open
      title={role ? "تعديل الدور" : "دور مخصص جديد"}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <form onSubmit={save} className="space-y-5 pb-6">
        <fieldset disabled={busy} className="space-y-5">
          <FormField label="اسم الدور" required>
            {(props) => (
              <Input
                {...props}
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </FormField>
          <FormField label="الوصف">
            {(props) => (
              <Input
                {...props}
                maxLength={500}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            )}
          </FormField>
          <label className="flex items-center justify-between">
            <span>دور فعال</span>
            <Switch
              aria-label="دور فعال"
              checked={active}
              disabled={!!role?.is_active && assignedCount > 0}
              onCheckedChange={setActive}
            />
          </label>
          {role?.is_active && assignedCount > 0 && (
            <p className="text-xs text-muted-foreground">
              انقل المستخدمين إلى دور آخر قبل تعطيل هذا الدور.
            </p>
          )}
          <Matrix rows={rows} onChange={change} disabled={busy} />
          <Button type="submit" disabled={busy}>
            <Save className="size-4" />
            {busy ? "جار الحفظ..." : "حفظ الدور"}
          </Button>
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>
    </AppDrawer>
  );
}

function EditableRoleMatrix({
  schoolId,
  role,
  systemRole,
  rows: initial,
  onSaved,
}: {
  schoolId: string;
  role?: CustomRole | undefined;
  systemRole?: import("@/lib/settings").Role | undefined;
  rows: Permission[];
  onSaved: () => Promise<void>;
}) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);
  return (
    <div className="space-y-3">
      <Matrix
        rows={rows}
        disabled={busy}
        lockAdministration={!!systemRole}
        onChange={(module, key, checked) => {
          if (busy) return;
          setRows((current) =>
            current.map((row) => {
              if (row.module !== module) return row;
              if (key === "can_view" && !checked) return emptyPermission(module);
              const next = { ...row, [key]: checked };
              if (checked) next.can_view = true;
              if (key === "can_manage" && checked) {
                next.can_create = true;
                next.can_edit = true;
              }
              if ((key === "can_create" || key === "can_edit") && !checked) next.can_manage = false;
              return next;
            }),
          );
        }}
      />
      <Button
        disabled={!dirty || busy}
        onClick={async () => {
          setBusy(true);
          try {
            const { error } = systemRole
              ? await settingsClient().rpc("settings_save_system_role", {
                  _school_id: schoolId,
                  _role: systemRole,
                  _permissions: rows,
                })
              : await settingsClient().rpc("settings_save_role", {
                  _school_id: schoolId,
                  _id: role!.id,
                  _name: role!.name,
                  _description: role!.description,
                  _active: role!.is_active,
                  _permissions: rows,
                });
            if (error) throw error;
            await onSaved();
            toast.success("تم حفظ الصلاحيات");
          } catch (error) {
            toast.error(settingsError(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Save className="size-4" />
        {busy ? "جار الحفظ..." : "حفظ الصلاحيات"}
      </Button>
    </div>
  );
}
