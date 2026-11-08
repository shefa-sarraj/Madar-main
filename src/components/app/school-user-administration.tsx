import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Modal } from "@/components/app/modal";
import { FormField } from "@/components/app/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ROLE_LABELS } from "@/lib/navigation";
import {
  SCHOOL_ROLES,
  settingsError,
  type CustomRole,
  type Member,
  type Role,
} from "@/lib/settings";
import { addExistingSchoolUser, removeSchoolUser } from "@/lib/school-administration.functions";
import {
  fetchEmployeeLinks,
  schoolAdminClient,
  schoolAdministrationError,
} from "@/lib/school-administration";

export function ExistingSchoolUserModal({
  schoolId,
  customRoles,
  onClose,
  onSaved,
}: {
  schoolId: string;
  customRoles: CustomRole[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [custom, setCustom] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function save() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await addExistingSchoolUser({
        data: { schoolId, email, roles, customRoles: custom },
      });
      if (result.error) throw new Error(result.error);
    } catch (e) {
      setError(schoolAdministrationError(e));
      setBusy(false);
      lock.current = false;
      return;
    }
    toast.success("تمت إضافة العضوية دون تغيير حساب المستخدم أو عضوياته الأخرى");
    onClose();
    await onSaved().catch(() => toast.warning("تم الحفظ؛ أعد تحميل القائمة"));
  }
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title="إضافة حساب موجود إلى المدرسة"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="space-y-4"
      >
        <fieldset disabled={busy} className="space-y-4">
          <FormField label="بريد الحساب الموجود" required>
            {(p) => (
              <Input
                {...p}
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </FormField>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {SCHOOL_ROLES.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={roles.includes(r)}
                  onCheckedChange={(checked) =>
                    setRoles((v) => (checked === true ? [...v, r] : v.filter((x) => x !== r)))
                  }
                />
                {ROLE_LABELS[r]}
              </label>
            ))}
            {customRoles
              .filter((r) => r.is_active)
              .map((r) => (
                <label key={r.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={custom.includes(r.id)}
                    onCheckedChange={(checked) =>
                      setCustom((v) =>
                        checked === true ? [...v, r.id] : v.filter((x) => x !== r.id),
                      )
                    }
                  />
                  {r.name}
                </label>
              ))}
          </div>
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy || roles.length + custom.length === 0}>
            {busy ? "جار الإضافة..." : "إضافة العضوية"}
          </Button>
        </fieldset>
      </form>
    </Modal>
  );
}

export function RemoveSchoolUserModal({
  schoolId,
  member,
  platformAdmin,
  onClose,
  onSaved,
}: {
  schoolId: string;
  member: Member;
  platformAdmin: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [deleteAuth, setDeleteAuth] = useState(false);
  const [busy, setBusy] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function save() {
    if (lock.current || !confirmed) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await removeSchoolUser({
        data: { schoolId, userId: member.user_id, deleteAuth },
      });
      if (result.removed) {
        setRemoved(true);
        await onSaved().catch(() => toast.warning("تمت الإزالة؛ أعد تحميل القائمة"));
      }
      if (result.error) throw new Error(result.error);
      toast.success("تمت إزالة العضوية والأدوار من هذه المدرسة فقط");
      onClose();
    } catch (e) {
      setError(schoolAdministrationError(e));
      lock.current = false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      title={`إزالة عضوية: ${member.full_name}`}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <div dir="rtl" className="space-y-4">
        <p>
          ستتم إزالة عضوية هذه المدرسة وأدوارها وربط الموظف فقط. لن تتغير عضويات المدارس الأخرى.
        </p>
        {removed ? (
          <p>تمت إزالة عضوية المدرسة.</p>
        ) : (
          <>
            <label className="flex items-center gap-2">
              <Checkbox
                disabled={busy}
                checked={confirmed}
                onCheckedChange={(v) => setConfirmed(v === true)}
              />
              أؤكد إزالة العضوية من المدرسة الحالية
            </label>
            {platformAdmin && (
              <label className="flex items-start gap-2">
                <Checkbox
                  disabled={busy}
                  checked={deleteAuth}
                  onCheckedChange={(v) => setDeleteAuth(v === true)}
                />
                حذف حساب الدخول نهائياً أيضاً، فقط إذا لم تبقَ أي عضويات في مدارس أخرى
              </label>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="text-destructive break-words">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            إغلاق
          </Button>
          {!removed && (
            <Button variant="destructive" disabled={busy || !confirmed} onClick={() => void save()}>
              {busy ? "جار الإزالة..." : "إزالة العضوية"}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function EmployeeLinkModal({
  schoolId,
  member,
  onClose,
}: {
  schoolId: string;
  member: Member;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["employee-links", schoolId],
    queryFn: () => fetchEmployeeLinks(schoolId),
  });
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const value =
    selected ?? query.data?.links.find((l) => l.user_id === member.user_id)?.employee_id ?? "";
  async function save() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const { error } = await schoolAdminClient().rpc("settings_link_employee", {
        _school_id: schoolId,
        _user_id: member.user_id,
        _employee_id: value || null,
      });
      if (error) throw error;
    } catch (e) {
      setError(schoolAdministrationError(e));
      lock.current = false;
      setBusy(false);
      return;
    }
    toast.success("تم حفظ ربط المستخدم بالموظف");
    onClose();
    await qc.invalidateQueries({ queryKey: ["employee-links", schoolId] });
  }
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title={`ربط موظف: ${member.full_name}`}
      footer={
        <Button disabled={busy || !query.data || query.isError} onClick={() => void save()}>
          حفظ الربط
        </Button>
      }
    >
      {query.isPending ? (
        <p role="status">جار تحميل الموظفين...</p>
      ) : query.isError ? (
        <div role="alert">
          <p>{settingsError(query.error)}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            إعادة المحاولة
          </Button>
        </div>
      ) : (
        <FormField label="الموظف في المدرسة الحالية">
          {(p) => (
            <select
              {...p}
              disabled={busy}
              value={value}
              onChange={(e) => setSelected(e.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3"
            >
              <option value="">دون ربط / إزالة الربط</option>
              {query.data.employees.map((e) => (
                <option
                  key={e.id}
                  value={e.id}
                  disabled={query.data.links.some(
                    (l) => l.employee_id === e.id && l.user_id !== member.user_id,
                  )}
                >
                  {e.full_name} ({e.employee_number})
                </option>
              ))}
            </select>
          )}
        </FormField>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </Modal>
  );
}
