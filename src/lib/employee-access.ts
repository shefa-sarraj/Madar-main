import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSettings, settingsClient, type Role } from "@/lib/settings";
import { fetchEmployeeLinks, schoolAdminClient } from "@/lib/school-administration";
import { createSchoolUser } from "@/lib/settings.functions";
import { useWorkspace } from "@/lib/workspace";
export function useEmployeeAccess(schoolId: string, employeeId: string | null, open: boolean) {
  const workspace = useWorkspace();
  const qc = useQueryClient();
  const allowed =
    workspace.isPlatformAdmin ||
    workspace.roles.some((r) => ["school_owner", "school_manager"].includes(r));
  const administrators = workspace.isPlatformAdmin || workspace.roles.includes("school_owner");
  const [existingUserId, setExistingUserId] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [password, setPassword] = useState("");
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [custom, setCustom] = useState<string[]>([]);
  const query = useQuery({
    queryKey: ["staff-system-access", schoolId],
    enabled: open && allowed,
    queryFn: async () => {
      const [settings, links] = await Promise.all([
        fetchSettings(schoolId, true),
        fetchEmployeeLinks(schoolId),
      ]);
      return { ...settings, ...links };
    },
  });
  const linkedId = query.data?.links.find((l) => l.employee_id === employeeId)?.user_id;
  const linked = query.data?.members.find((m) => m.user_id === linkedId);
  useEffect(() => {
    if (!open) {
      setExistingUserId("");
      setPassword("");
      setLoginEmail("");
      setCreatedPassword(null);
    }
    setEnabled(linked?.status === "active");
    setRoles(linked?.roles ?? []);
    setCustom(linked?.custom_roles ?? []);
  }, [open, linkedId, linked?.status, linked?.roles, linked?.custom_roles]);
  const validate = () => {
    if (!allowed) return;
    if (!enabled && !linkedId) return;
    if (query.isPending || query.isError)
      throw new Error("تعذر تحميل بيانات الوصول. أعد المحاولة.");
    if (!enabled) return;
    if (!roles.length && !custom.length) throw new Error("اختر دوراً واحداً على الأقل.");
    if (
      !linkedId &&
      !existingUserId &&
      (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginEmail.trim()) ||
        password.length < 8 ||
        password.length > 128)
    )
      throw new Error("أدخل بريد الدخول وكلمة مرور من ثمانية أحرف على الأقل.");
  };
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["staff-system-access", schoolId] }),
      qc.invalidateQueries({ queryKey: ["employee-links", schoolId] }),
      qc.invalidateQueries({ queryKey: ["settings", schoolId] }),
      qc.invalidateQueries({ queryKey: ["my-roles"] }),
      qc.invalidateQueries({ queryKey: ["my-permissions"] }),
      qc.invalidateQueries({ queryKey: ["my-system-permissions"] }),
    ]);
  };
  async function provision(id: string, fullName: string) {
    if (!allowed || createdPassword || (!enabled && !linkedId)) return;
    const targetId = linkedId || existingUserId;
    if (targetId) {
      if (!linkedId && enabled) {
        const { error } = await schoolAdminClient().rpc("settings_link_employee", {
          _school_id: schoolId,
          _user_id: targetId,
          _employee_id: id,
        });
        if (error) throw error;
      }
      const { error } = await settingsClient().rpc("settings_save_member_roles", {
        _school_id: schoolId,
        _user_id: targetId,
        _roles: roles,
        _custom_roles: custom,
        _status: enabled ? "active" : "suspended",
      });
      if (error) throw error;
    } else if (enabled) {
      const result = await createSchoolUser({
        data: {
          schoolId,
          employeeId: id,
          fullName,
          email: loginEmail,
          temporaryPassword: password,
          roles,
          customRoles: custom,
          sendEmail: false,
        },
      });
      if (result.error) {
        await refresh().catch(() => {});
        throw new Error(result.error);
      }
      setCreatedPassword(password);
      setExistingUserId("");
      setPassword("");
      setLoginEmail("");
    }
    await refresh().catch(() => {});
  }
  return {
    allowed,
    existingUserId,
    setExistingUserId,
    enabled,
    setEnabled,
    loginEmail,
    setLoginEmail,
    password,
    setPassword,
    createdPassword,
    setCreatedPassword,
    roles,
    setRoles,
    custom,
    setCustom,
    administrators,
    linked,
    query,
    validate,
    provision,
    refresh,
  };
}
