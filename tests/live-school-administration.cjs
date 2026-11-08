// Opt-in live verification. Only the named test identity/role and authorized second
// school are created. The test identity/role are removed; the owner keeps school access.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const ts = require("typescript");
const { z } = require("zod");
const { createClient } = require("@supabase/supabase-js");

async function main() {
  assert.equal(process.env.MADAR_RUN_LIVE_CHECKS, "1", "Live checks require explicit opt-in");
  const { loadEnv } = await import("vite");
  const env = loadEnv("development", process.cwd(), "");
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const cli = path.join(process.env.APPDATA, "npm/node_modules/supabase/dist/supabase.js");
  function query(sql) {
    const stdout = execFileSync(process.execPath, [cli, "db", "query", "--linked", sql], {
      encoding: "utf8",
      timeout: 120000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(stdout).rows;
  }
  const owner = query(
    "select r.user_id,r.school_id from public.user_roles r join auth.users u on u.id=r.user_id join public.school_members m using(user_id,school_id) where u.email='mhmoudtariq172@gmail.com' and r.role='school_owner' and m.status='active' order by m.joined_at limit 1",
  )[0];
  assert.ok(owner, "Expected current owner was not found");
  function asOwner(sql) {
    return query(
      `BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${owner.user_id}',true); ${sql}; COMMIT;`,
    );
  }
  assert.equal(
    query(
      "select count(*)::int as count from auth.users where email='mhmoudtariq172+madar-role-test@gmail.com'",
    )[0].count,
    0,
    "Do not overwrite an existing test identity",
  );
  let school = query(
    "select id from public.schools where name_ar='Madar Multi-School Verification' limit 1",
  )[0]?.id;
  if (!school) {
    school = crypto.randomUUID();
    const actor = crypto.randomUUID();
    // This SQL-only actor exists inside one transaction, has no login credentials,
    // and is deleted before commit. No real owner receives platform privileges.
    query(`BEGIN;
      INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES('${actor}','sql-verification-${actor}@example.invalid','{}');
      INSERT INTO public.user_roles(user_id,school_id,role) VALUES('${actor}',NULL,'super_admin');
      SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${actor}',true);
      SELECT public.platform_create_school('${school}','{"name_ar":"Madar Multi-School Verification","currency":"USD","timezone":"Asia/Jerusalem"}','active');
      SELECT public.platform_assign_administrator('${school}','${owner.user_id}','school_owner');
      RESET ROLE;
      DELETE FROM public.user_roles WHERE user_id='${actor}'; DELETE FROM auth.users WHERE id='${actor}';
      COMMIT;`);
  }
  const roleId = asOwner(
    `SELECT public.settings_save_role('${owner.school_id}',NULL,'Madar Verification Role','Temporary live verification',true,'[{"module":"students","can_view":true,"can_create":false,"can_edit":false,"can_manage":false}]') AS id`,
  )[0].id;
  const password = crypto.randomBytes(24).toString("base64url") + "Aa1!";
  let testUser;
  try {
    const contextClient = {
      from: (table) => admin.from(table),
      rpc: async (name, args) => {
        try {
          if (name === "has_role")
            return {
              data: asOwner(
                `SELECT public.has_role('${owner.user_id}','${args._school_id}','school_owner') AS allowed`,
              )[0].allowed,
              error: null,
            };
          assert.equal(name, "settings_provision_school_user");
          assert.equal(args._school_id, owner.school_id);
          assert.equal(args._roles.length, 0);
          assert.deepEqual(Array.from(args._custom_roles), [roleId]);
          asOwner(
            `SELECT public.settings_provision_school_user('${owner.school_id}','${args._user_id}',ARRAY[]::public.app_role[],ARRAY['${roleId}']::uuid[],NULL)`,
          );
          return { error: null };
        } catch (error) {
          return { error };
        }
      },
    };
    const exports = {};
    const modules = {
      zod: { z },
      "@tanstack/react-start": {
        createServerFn: () => {
          let schema;
          const builder = {
            middleware: () => builder,
            validator: (value) => {
              schema = value;
              return builder;
            },
            handler: (fn) => (data) =>
              fn({
                data: schema.parse(data),
                context: { userId: owner.user_id, supabase: contextClient },
              }),
          };
          return builder;
        },
      },
      "@/integrations/supabase/auth-middleware": { requireSupabaseAuth: {} },
      "@/lib/settings": { settingsClient: (client) => client },
      "@/lib/school-administration": { schoolAdminClient: (client) => client },
      "@/integrations/supabase/client.server": { supabaseAdmin: admin },
      "@/lib/administration-error.server": {
        administrationError: (error) =>
          String(error.message).split(env.SUPABASE_SERVICE_ROLE_KEY).join("[redacted]"),
      },
    };
    vm.runInNewContext(
      ts.transpileModule(fs.readFileSync("src/lib/settings.functions.ts", "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText,
      {
        exports,
        require: (name) => {
          assert.ok(modules[name], name);
          return modules[name];
        },
      },
    );
    const result = await exports.createSchoolUser({
      schoolId: owner.school_id,
      fullName: "Madar Test User",
      email: "mhmoudtariq172+madar-role-test@gmail.com",
      temporaryPassword: password,
      roles: [],
      customRoles: [roleId],
      sendEmail: false,
    });
    testUser = query(
      "select id from auth.users where email='mhmoudtariq172+madar-role-test@gmail.com'",
    )[0]?.id;
    assert.equal(result.error, null);
    assert.ok(testUser);
    const profile = await admin.from("profiles").select("full_name").eq("id", testUser).single();
    assert.equal(profile.data.full_name, "Madar Test User");
    const sessionClient = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const login = await sessionClient.auth.signInWithPassword({
      email: "mhmoudtariq172+madar-role-test@gmail.com",
      password,
    });
    assert.equal(login.error, null);
    const permission = (action) =>
      sessionClient.rpc("has_custom_module_permission", {
        _user_id: testUser,
        _school_id: owner.school_id,
        _module: "students",
        _action: action,
      });
    assert.equal((await permission("view")).data, true);
    assert.equal((await permission("edit")).data, false);
    const foreign = await sessionClient.from("students").select("id").eq("school_id", school);
    assert.equal(foreign.error, null);
    assert.equal(foreign.data.length, 0);
    const foreignSchools = await sessionClient.from("schools").select("id").eq("id", school);
    assert.equal(foreignSchools.error, null);
    assert.equal(foreignSchools.data.length, 0);
    asOwner(
      `SELECT public.settings_save_member_roles('${owner.school_id}','${testUser}',ARRAY[]::public.app_role[],ARRAY['${roleId}']::uuid[],'suspended')`,
    );
    assert.equal((await permission("view")).data, false);
    asOwner(
      `SELECT public.settings_save_member_roles('${owner.school_id}','${testUser}',ARRAY[]::public.app_role[],ARRAY['${roleId}']::uuid[],'active')`,
    );
    assert.equal((await permission("view")).data, true);
    const memberships = asOwner(
      `SELECT count(*)::int AS count FROM public.school_members WHERE user_id='${owner.user_id}' AND status='active' AND school_id IN('${school}','${owner.school_id}')`,
    );
    assert.equal(memberships[0].count, 2);
    const ownerSchools = asOwner(
      `SELECT count(*)::int AS count FROM public.schools WHERE id IN('${school}','${owner.school_id}')`,
    );
    assert.equal(ownerSchools[0].count, 2);
    const years = await sessionClient.from("academic_years").select("id").eq("school_id", school);
    assert.equal(years.error, null);
    assert.equal(years.data.length, 0);
    await sessionClient.auth.signOut();
    console.log(
      "Live Auth/profile/membership/custom role, permission enforcement, deactivate/reactivate, second-school owner access and tenant/year isolation: passed.",
    );
    console.log("Owner browser clicks remain unverified; owner has two active school memberships.");
  } finally {
    if (testUser) {
      const memberships = await admin
        .from("school_members")
        .select("school_id")
        .eq("user_id", testUser);
      if (!memberships.error && memberships.data.some((m) => m.school_id === owner.school_id))
        asOwner(
          `SELECT public.settings_remove_school_user('${owner.school_id}','${testUser}',false)`,
        );
      const remaining = await admin
        .from("school_members")
        .select("school_id")
        .eq("user_id", testUser);
      if (!remaining.error && remaining.data.length === 0) {
        const deleted = await admin.auth.admin.deleteUser(testUser);
        assert.equal(deleted.error, null);
      }
    }
    query(
      `DELETE FROM public.school_roles WHERE id='${roleId}' AND school_id='${owner.school_id}' AND NOT EXISTS(SELECT 1 FROM public.school_user_custom_roles WHERE role_id='${roleId}')`,
    );
    console.log(
      "Named test identity and temporary custom role cleaned up; authorized second school retained.",
    );
  }
}
main().catch(() => {
  console.error(
    "Live verification failed; no credentials or passwords logged. Inspect named test fixtures before rerunning.",
  );
  process.exitCode = 1;
});
