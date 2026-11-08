import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { settingsClient } from "@/lib/settings";
import { schoolAdminClient } from "@/lib/school-administration";

const input = z
  .object({
    schoolId: z.string().uuid(),
    email: z.string().trim().email().max(254),
    fullName: z.string().trim().min(1).max(200),
    temporaryPassword: z.string().min(8).max(128),
    roles: z.array(
      z.enum([
        "school_owner",
        "school_manager",
        "accountant",
        "registrar",
        "hr",
        "teacher",
        "store_keeper",
      ]),
    ),
    customRoles: z.array(z.string().uuid()),
    sendEmail: z.boolean().default(false),
    employeeId: z.string().uuid().nullable().optional(),
  })
  .refine((data) => data.roles.length + data.customRoles.length > 0, "اختر دورا واحدا على الأقل");

export const createSchoolUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(input)
  .handler(async ({ data, context }) => {
    try {
      const { data: owner, error: permissionError } = await context.supabase.rpc(
        "can_manage_school",
        { _user_id: context.userId, _school_id: data.schoolId },
      );
      if (permissionError) throw permissionError;
      if (!owner) throw new Error("School management permission required");
      const { data: school, error: schoolError } = await context.supabase
        .from("schools")
        .select("id")
        .eq("id", data.schoolId)
        .single();
      if (schoolError) throw schoolError;
      if (!school) throw new Error("المدرسة غير متاحة");
      if (data.employeeId) {
        const { data: employee, error } = await context.supabase
          .from("employees")
          .select("id")
          .eq("school_id", data.schoolId)
          .eq("id", data.employeeId)
          .maybeSingle();
        if (error) throw error;
        if (!employee) throw new Error("Employee is not in current school");
        const { data: existingLink, error: linkError } = await schoolAdminClient(context.supabase)
          .from("school_user_employee_links")
          .select("user_id")
          .eq("school_id", data.schoolId)
          .eq("employee_id", data.employeeId)
          .maybeSingle();
        if (linkError) throw linkError;
        if (existingLink)
          throw new Error("الموظف مرتبط بحساب دخول بالفعل. حدّث بيانات الوصول قبل المحاولة.");
      }
      if (data.customRoles.length) {
        const { data: roles, error } = await settingsClient(context.supabase)
          .from("school_roles")
          .select("id")
          .eq("school_id", data.schoolId)
          .eq("is_active", true)
          .in("id", data.customRoles);
        if (error) throw error;
        if (roles?.length !== new Set(data.customRoles).size)
          throw new Error("الدور غير فعال أو لا يتبع المدرسة");
      }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: created, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.temporaryPassword,
        email_confirm: true,
        user_metadata: { full_name: data.fullName },
      });
      if (authError) throw authError;
      if (!created.user) throw new Error("Auth did not return a created user");
      try {
        const { error: profileError } = await supabaseAdmin
          .from("profiles")
          .upsert({ id: created.user.id, full_name: data.fullName });
        if (profileError) throw profileError;
        const { error } = await schoolAdminClient(context.supabase).rpc(
          "settings_provision_school_user",
          {
            _school_id: data.schoolId,
            _user_id: created.user.id,
            _roles: data.roles,
            _custom_roles: data.customRoles,
            _employee_id: data.employeeId ?? null,
          },
        );
        if (error) throw error;
      } catch (error) {
        // A lost response can follow a committed membership; never cascade-delete that user.
        const { data: memberships, error: checkError } = await supabaseAdmin
          .from("school_members")
          .select("school_id")
          .eq("user_id", created.user.id);
        const rolledBack =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          /^[0-9A-Z]{5}$/.test(String(error.code));
        if (rolledBack && !checkError && memberships?.length === 0) {
          const { error: cleanupError } = await supabaseAdmin.auth.admin.deleteUser(
            created.user.id,
          );
          if (cleanupError)
            throw new Error(`${cleanupError.message}; account retained: ${created.user.id}`);
        } else {
          const { administrationError } = await import("@/lib/administration-error.server");
          throw new Error(
            `${administrationError(error)}; account retained: ${created.user.id}. Refresh school users before retrying.`,
          );
        }
        throw error;
      }
      if (data.sendEmail) {
        try {
          const { getRequest } = await import("@tanstack/react-start/server");
          const redirectTo = new URL("/reset-password", getRequest().url).href;
          const { error } = await context.supabase.auth.resetPasswordForEmail(data.email, {
            redirectTo,
          });
          if (error) throw error;
        } catch {
          return {
            error: null,
            warning: "تم إنشاء المستخدم والأدوار؛ تعذر إرسال البريد الاختياري.",
          };
        }
      }
      return { error: null, warning: null };
    } catch (error) {
      const { administrationError } = await import("@/lib/administration-error.server");
      return {
        error: administrationError(error).split(data.temporaryPassword).join("[redacted]"),
        warning: null,
      };
    }
  });

export const resetSchoolUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ schoolId: z.string().uuid(), userId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    try {
      const { data: allowed, error: authError } = await context.supabase.rpc("can_manage_school", {
        _user_id: context.userId,
        _school_id: data.schoolId,
      });
      if (authError || !allowed) throw new Error("لا تملك صلاحية إدارة مستخدمي هذه المدرسة.");
      const { data: member, error } = await context.supabase
        .from("school_members")
        .select("user_id")
        .eq("school_id", data.schoolId)
        .eq("user_id", data.userId)
        .maybeSingle();
      if (error || !member) throw new Error("المستخدم ليس عضواً في المدرسة الحالية.");
      const { data: roles, error: roleError } = await context.supabase
        .from("user_roles")
        .select("role")
        .eq("school_id", data.schoolId)
        .eq("user_id", data.userId);
      // Owner and manager credentials must not be reset by a delegated school manager.
      if (roleError) throw roleError;
      const { data: owner, error: ownerError } = await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _school_id: data.schoolId,
        _role: "school_owner",
      });
      const { data: platform, error: platformError } = await context.supabase.rpc(
        "is_super_admin",
        { _user_id: context.userId },
      );
      if (ownerError || platformError) throw new Error("تعذر التحقق من صلاحيات الإدارة.");
      if (
        !owner &&
        !platform &&
        roles?.some((r) => ["school_owner", "school_manager"].includes(r.role))
      )
        throw new Error("إعادة تعيين حسابات الإدارة متاحة لمالك المدرسة فقط.");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: account, error: lookupError } = await supabaseAdmin.auth.admin.getUserById(
        data.userId,
      );
      if (lookupError || !account.user?.email) throw new Error("تعذر العثور على حساب الدخول.");
      const { getRequest } = await import("@tanstack/react-start/server");
      const { error: mailError } = await context.supabase.auth.resetPasswordForEmail(
        account.user.email,
        { redirectTo: new URL("/reset-password", getRequest().url).href },
      );
      if (mailError) throw new Error("تعذر إرسال رابط إعادة تعيين كلمة المرور.");
      return { error: null };
    } catch {
      return { error: "تعذر إعادة تعيين كلمة المرور. تحقق من صلاحياتك وحاول مرة أخرى." };
    }
  });
