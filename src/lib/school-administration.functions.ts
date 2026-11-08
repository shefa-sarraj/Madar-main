import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { settingsClient } from "@/lib/settings";
import { schoolAdminClient } from "@/lib/school-administration";

const role = z.enum([
  "school_owner",
  "school_manager",
  "accountant",
  "registrar",
  "hr",
  "teacher",
  "store_keeper",
]);
const account = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("existing"), email: z.string().trim().email().max(254) }),
  z.object({
    mode: z.literal("new"),
    email: z.string().trim().email().max(254),
    fullName: z.string().trim().min(1).max(200),
    temporaryPassword: z.string().min(8).max(128),
  }),
]);
const schoolInput = z
  .object({
    schoolId: z.string().uuid(),
    create: z.boolean(),
    profile: z.object({
      name_ar: z.string().trim().min(1).max(200),
      name_en: z.string().max(200),
      phone: z.string().max(100),
      email: z.union([z.literal(""), z.string().email()]),
      address: z.string().max(1000),
      logo_url: z.union([z.literal(""), z.string().url()]),
      currency: z.string().regex(/^[A-Z]{3}$/),
      timezone: z.string().min(1).max(100),
    }),
    status: z.enum(["active", "suspended", "archived"]),
    initialAccount: account.optional(),
    initialRole: z.enum(["school_owner", "school_manager"]).optional(),
  })
  .refine(
    (d) => !!d.initialAccount === !!d.initialRole && (d.create || !d.initialAccount),
    "حدد المالك أو المدير الأول",
  );

export const savePlatformSchool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(schoolInput)
  .handler(async ({ data, context }) => {
    try {
      const { data: admin, error: permissionError } = await schoolAdminClient(context.supabase).rpc(
        "has_platform_permission",
        {
          _user_id: context.userId,
          _permission: data.create ? "create_school" : "manage_schools",
        },
      );
      if (permissionError) throw permissionError;
      if (!admin) throw new Error("إدارة المدارس متاحة لمسؤول المنصة فقط");
      let initialUser: string | null = null;
      let createdUser: string | null = null;
      if (data.create && data.initialAccount) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        if (data.initialAccount.mode === "existing") {
          const { data: user, error } = await settingsClient(supabaseAdmin).rpc(
            "settings_find_auth_user",
            { _email: data.initialAccount.email },
          );
          if (error) throw error;
          if (!user) throw new Error("الحساب غير موجود. استخدم إنشاء حساب جديد.");
          initialUser = user;
        } else {
          const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
            email: data.initialAccount.email,
            password: data.initialAccount.temporaryPassword,
            email_confirm: true,
            user_metadata: { full_name: data.initialAccount.fullName },
          });
          if (error) throw error;
          if (!created.user) throw new Error("Auth did not return a created user");
          initialUser = created.user.id;
          createdUser = initialUser;
        }
      }
      try {
        if (createdUser && data.initialAccount?.mode === "new") {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin
            .from("profiles")
            .upsert({ id: createdUser, full_name: data.initialAccount.fullName });
          if (error) throw error;
        }
        if (data.create && !data.initialAccount) {
          const { data: id, error } = await schoolAdminClient(context.supabase).rpc(
            "platform_create_school",
            {
              _school_id: data.schoolId,
              _profile: data.profile,
              _status: data.status,
            },
          );
          if (error) throw error;
          return { schoolId: id, error: null };
        }
        const { data: id, error } = await schoolAdminClient(context.supabase).rpc(
          "platform_save_school",
          {
            _school_id: data.schoolId,
            _create: data.create,
            _profile: data.profile,
            _status: data.status,
            _initial_user: data.create ? initialUser : null,
            _initial_role: data.create ? (data.initialRole ?? null) : null,
          },
        );
        if (error) throw error;
        return { schoolId: id, error: null };
      } catch (error) {
        if (createdUser) {
          // A transport failure may follow a committed transaction. Never delete its administrator.
          const rolledBack =
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            /^[0-9A-Z]{5}$/.test(String(error.code));
          if (!rolledBack) {
            const { administrationError } = await import("@/lib/administration-error.server");
            throw new Error(
              `${administrationError(error)}; account retained: ${createdUser}. Refresh schools before retrying.`,
            );
          }
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: school, error: checkError } = await supabaseAdmin
            .from("schools")
            .select("id")
            .eq("id", data.schoolId)
            .maybeSingle();
          if (checkError || school) {
            const { administrationError } = await import("@/lib/administration-error.server");
            throw new Error(
              `${administrationError(error)}; account retained: ${createdUser}. Refresh schools before retrying.`,
            );
          }
          const { error: cleanupError } = await supabaseAdmin.auth.admin.deleteUser(createdUser);
          if (cleanupError)
            throw new Error(`${cleanupError.message}; account retained: ${createdUser}`);
        }
        throw error;
      }
    } catch (error) {
      const { administrationError } = await import("@/lib/administration-error.server");
      const message = administrationError(error);
      return {
        schoolId: null,
        error:
          data.initialAccount?.mode === "new"
            ? message.split(data.initialAccount.temporaryPassword).join("[redacted]")
            : message,
      };
    }
  });

export const addExistingSchoolUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z
      .object({
        schoolId: z.string().uuid(),
        email: z.string().trim().email().max(254),
        roles: z.array(role),
        customRoles: z.array(z.string().uuid()),
      })
      .refine((d) => d.roles.length + d.customRoles.length > 0, "اختر دوراً واحداً على الأقل"),
  )
  .handler(async ({ data, context }) => {
    try {
      const { data: owner, error } = await context.supabase.rpc("can_manage_school", {
        _user_id: context.userId,
        _school_id: data.schoolId,
      });
      if (error) throw error;
      if (!owner) throw new Error("إضافة العضويات متاحة لإدارة المدرسة فقط");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: user, error: lookupError } = await settingsClient(supabaseAdmin).rpc(
        "settings_find_auth_user",
        { _email: data.email },
      );
      if (lookupError) throw lookupError;
      if (!user) throw new Error("تعذر إضافة الحساب. تحقق من البريد وأن الحساب موجود.");
      const { error: saveError } = await settingsClient(context.supabase).rpc(
        "settings_save_member_roles",
        {
          _school_id: data.schoolId,
          _user_id: user,
          _roles: data.roles,
          _custom_roles: data.customRoles,
          _status: "active",
          _create: true,
        },
      );
      if (saveError) throw saveError;
      return { success: true, error: null };
    } catch (error) {
      const { administrationError } = await import("@/lib/administration-error.server");
      return { success: false, error: administrationError(error) };
    }
  });

export const assignSchoolAdministrator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      schoolId: z.string().uuid(),
      email: z.string().trim().email().max(254),
      role: z.enum(["school_owner", "school_manager"]),
    }),
  )
  .handler(async ({ data, context }) => {
    try {
      const { data: admin, error } = await schoolAdminClient(context.supabase).rpc(
        "has_platform_permission",
        {
          _user_id: context.userId,
          _permission: "manage_schools",
        },
      );
      if (error) throw error;
      if (!admin) throw new Error("Platform administrator required");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: user, error: lookupError } = await settingsClient(supabaseAdmin).rpc(
        "settings_find_auth_user",
        { _email: data.email },
      );
      if (lookupError) throw lookupError;
      if (!user) throw new Error("الحساب غير موجود. استخدم إنشاء حساب جديد.");
      const { error: assignmentError } = await schoolAdminClient(context.supabase).rpc(
        "platform_assign_administrator",
        { _school_id: data.schoolId, _user_id: user, _role: data.role },
      );
      if (assignmentError) throw assignmentError;
      return { error: null };
    } catch (error) {
      const { administrationError } = await import("@/lib/administration-error.server");
      return { error: administrationError(error) };
    }
  });

export const removeSchoolUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      schoolId: z.string().uuid(),
      userId: z.string().uuid(),
      deleteAuth: z.boolean().default(false),
    }),
  )
  .handler(async ({ data, context }) => {
    let removed = false;
    try {
      // Validate the private client before a destructive request changes the membership.
      let adminClient;
      if (data.deleteAuth) {
        const { data: permitted, error } = await schoolAdminClient(context.supabase).rpc(
          "has_platform_permission",
          {
            _user_id: context.userId,
            _permission: "manage_platform_users",
          },
        );
        if (error) throw error;
        if (!permitted) throw new Error("Platform administrator required for Auth deletion");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        adminClient = supabaseAdmin;
        void adminClient.auth;
      }
      const { data: deleteAuth, error } = await schoolAdminClient(context.supabase).rpc(
        "settings_remove_school_user",
        { _school_id: data.schoolId, _user_id: data.userId, _delete_auth: data.deleteAuth },
      );
      if (error) throw error;
      removed = true;
      if (deleteAuth && adminClient) {
        try {
          const { error: deleteError } = await adminClient.auth.admin.deleteUser(data.userId);
          if (deleteError) throw deleteError;
        } catch (deleteError) {
          const { error: cancelError } = await schoolAdminClient(context.supabase).rpc(
            "settings_cancel_auth_deletion",
            { _user_id: data.userId },
          );
          const { administrationError } = await import("@/lib/administration-error.server");
          throw new Error(
            `${administrationError(deleteError)}${cancelError ? `; ${cancelError.message}` : ""}`,
          );
        }
      }
      return { removed: true, error: null };
    } catch (error) {
      const { administrationError } = await import("@/lib/administration-error.server");
      return { removed, error: administrationError(error) };
    }
  });
