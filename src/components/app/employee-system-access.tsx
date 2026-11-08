import type { useEmployeeAccess } from "@/lib/employee-access";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { FormField } from "@/components/app/form-field";
import { SettingsPermissions } from "@/components/app/settings-permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { SCHOOL_ROLES } from "@/lib/settings";
import { generateTemporaryPassword } from "@/lib/temporary-password";
import { ROLE_LABELS } from "@/lib/navigation";

export function EmployeeSystemAccess({
  access,
  schoolId,
}: {
  access: ReturnType<typeof useEmployeeAccess>;
  schoolId: string;
}) {
  if (!access.allowed || access.createdPassword) return null;
  const { query, linked } = access;
  return (
    <section className="space-y-4">
      {query.isPending ? (
        <p role="status">جار تحميل بيانات الوصول...</p>
      ) : query.isError ? (
        <div role="alert">
          <p>تعذر تحميل بيانات الوصول.</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            إعادة المحاولة
          </Button>
        </div>
      ) : (
        <>
          <fieldset className="flex flex-wrap gap-4">
            <legend className="sr-only">الوصول إلى النظام</legend>
            {[false, true].map((value) => (
              <label key={String(value)} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="system-access"
                  checked={access.enabled === value}
                  onChange={() => access.setEnabled(value)}
                />
                {value ? "تفعيل تسجيل الدخول" : linked ? "تعليق تسجيل الدخول" : "بدون حساب"}
              </label>
            ))}
          </fieldset>
          {linked && <p className="text-sm">الحساب المرتبط: {linked.full_name}</p>}
          {access.enabled && (
            <>
              {!linked && (
                <FormField label="الحساب">
                  {(p) => (
                    <select
                      {...p}
                      className="h-10 w-full rounded-md border bg-background px-3"
                      value={access.existingUserId}
                      onChange={(e) => {
                        access.setExistingUserId(e.target.value);
                        access.setPassword("");
                        const member = query.data?.members.find(
                          (m) => m.user_id === e.target.value,
                        );
                        access.setRoles(member?.roles ?? []);
                        access.setCustom(member?.custom_roles ?? []);
                      }}
                    >
                      <option value="">إنشاء حساب جديد</option>
                      {query.data?.members
                        .filter(
                          (m) =>
                            !query.data?.links.some((l) => l.user_id === m.user_id) &&
                            (access.administrators ||
                              !m.roles.some((r) => ["school_owner", "school_manager"].includes(r))),
                        )
                        .map((m) => (
                          <option key={m.user_id} value={m.user_id}>
                            {m.full_name}
                          </option>
                        ))}
                    </select>
                  )}
                </FormField>
              )}
              {!linked && !access.existingUserId && (
                <>
                  <FormField label="بريد الدخول" required>
                    {(p) => (
                      <Input
                        {...p}
                        type="email"
                        dir="ltr"
                        autoComplete="off"
                        value={access.loginEmail}
                        onChange={(e) => access.setLoginEmail(e.target.value)}
                      />
                    )}
                  </FormField>
                  <FormField label="كلمة المرور المؤقتة" required>
                    {(p) => (
                      <div className="flex flex-wrap gap-2">
                        <Input
                          {...p}
                          type="password"
                          dir="ltr"
                          autoComplete="new-password"
                          minLength={8}
                          maxLength={128}
                          value={access.password}
                          onChange={(e) => access.setPassword(e.target.value)}
                          className="min-w-0 flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            try {
                              access.setPassword(generateTemporaryPassword());
                            } catch {
                              toast.error("تعذر توليد كلمة المرور. أدخلها يدوياً.");
                            }
                          }}
                        >
                          <Sparkles className="size-4" />
                          توليد كلمة مرور
                        </Button>
                      </div>
                    )}
                  </FormField>
                </>
              )}
              <fieldset className="grid gap-2 sm:grid-cols-2">
                <legend className="mb-2 text-sm font-medium">الأدوار</legend>
                {SCHOOL_ROLES.filter(
                  (r) => access.administrators || !["school_owner", "school_manager"].includes(r),
                ).map((role) => (
                  <label key={role} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={access.roles.includes(role)}
                      onCheckedChange={(v) =>
                        access.setRoles((current) =>
                          v === true ? [...current, role] : current.filter((r) => r !== role),
                        )
                      }
                    />
                    {ROLE_LABELS[role]}
                  </label>
                ))}
                {query.data?.customRoles
                  .filter((r) => r.is_active || access.custom.includes(r.id))
                  .map((role) => (
                    <label key={role.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={access.custom.includes(role.id)}
                        disabled={!role.is_active}
                        onCheckedChange={(v) =>
                          access.setCustom((current) =>
                            v === true
                              ? [...current, role.id]
                              : current.filter((r) => r !== role.id),
                          )
                        }
                      />
                      {role.name}
                    </label>
                  ))}
              </fieldset>
              {query.data && (
                <details className="space-y-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    الأدوار والصلاحيات
                  </summary>
                  <SettingsPermissions
                    schoolId={schoolId}
                    customRoles={query.data.customRoles}
                    members={query.data.members}
                    permissions={query.data.permissions}
                    owner={access.allowed}
                    onSaved={access.refresh}
                  />
                </details>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
