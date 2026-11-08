const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const { z } = require("zod");
const schoolId = "b2000000-0000-0000-0000-000000000001";
const userId = "b1000000-0000-0000-0000-000000000003";
const input = {
  schoolId,
  create: true,
  profile: {
    name_ar: "School",
    name_en: "",
    phone: "",
    email: "",
    address: "",
    logo_url: "",
    currency: "USD",
    timezone: "Asia/Jerusalem",
  },
  status: "active",
  initialRole: "school_owner",
  initialAccount: {
    mode: "new",
    email: "admin@example.invalid",
    fullName: "Admin",
    temporaryPassword: "Strong-Temporary-123!",
  },
};

function harness(options = {}) {
  const calls = { serviceLoads: 0, auth: [], lookup: [], writes: [], cleanup: [], checks: [] };
  const client = {
    rpc: async (name, args) => {
      if (name === "is_super_admin") return { data: options.admin !== false, error: null };
      if (name === "has_platform_permission") return { data: options.admin !== false, error: null };
      if (name === "can_manage_school") {
        assert.deepEqual(Object.keys(args).sort(), ["_school_id", "_user_id"]);
        return { data: options.owner !== false || options.manager === true, error: null };
      }
      if (name === "has_role") return { data: options.owner !== false, error: null };
      calls.writes.push({ name, args });
      if (options.transportFailure) throw new Error("network");
      return { data: schoolId, error: options.writeError ?? null };
    },
  };
  const admin = {
    rpc: async (name, args) => {
      calls.lookup.push({ name, args });
      return { data: options.missingUser ? null : userId, error: null };
    },
    auth: {
      admin: {
        createUser: async (args) => {
          calls.auth.push(args);
          return {
            data: { user: options.authError ? null : { id: userId } },
            error: options.authError ?? null,
          };
        },
        deleteUser: async (id) => {
          calls.cleanup.push(id);
          return { error: options.cleanupError ?? null };
        },
      },
    },
    from(table) {
      if (table === "profiles") return { upsert: async () => ({ error: null }) };
      assert.equal(table, "schools");
      const query = {
        select() {
          return query;
        },
        eq(key, value) {
          calls.checks.push([key, value]);
          return query;
        },
        async maybeSingle() {
          return {
            data: options.committed ? { id: schoolId } : null,
            error: options.checkError ?? null,
          };
        },
      };
      return query;
    },
  };
  const exports = {};
  function createServerFn() {
    let schema;
    const builder = {
      middleware() {
        return builder;
      },
      validator(value) {
        schema = value;
        return builder;
      },
      handler(fn) {
        return async (data) =>
          fn({
            data: schema.parse(data),
            context: { supabase: client, userId: "b1000000-0000-0000-0000-000000000001" },
          });
      },
    };
    return builder;
  }
  const requireMock = (name) => {
    if (name === "@tanstack/react-start") return { createServerFn };
    if (name === "zod") return { z };
    if (name.endsWith("auth-middleware")) return { requireSupabaseAuth: {} };
    if (name === "@/lib/settings") return { settingsClient: (value) => value };
    if (name === "@/lib/school-administration") return { schoolAdminClient: (value) => value };
    if (name === "@/lib/administration-error.server")
      return { administrationError: (error) => error.message };
    if (name.endsWith("client.server")) {
      calls.serviceLoads++;
      return { supabaseAdmin: admin };
    }
    throw new Error(name);
  };
  const source = ts.transpileModule(
    fs.readFileSync("src/lib/school-administration.functions.ts", "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  vm.runInNewContext(source, { exports, require: requireMock });
  return { ...exports, calls };
}
test("platform provisioning checks global authority before service access", async () => {
  const h = harness({ admin: false });
  assert.ok((await h.savePlatformSchool(input)).error);
  assert.equal(h.calls.serviceLoads, 0);
  assert.equal(h.calls.auth.length, 0);
  assert.equal(h.calls.writes.length, 0);
});
test("new platform school provisions Auth then the atomic scoped bootstrap", async () => {
  const h = harness();
  await h.savePlatformSchool(input);
  assert.equal(h.calls.auth.length, 1);
  const args = h.calls.writes[0].args;
  assert.equal(args._school_id, schoolId);
  assert.equal(args._initial_user, userId);
  assert.equal(args._initial_role, "school_owner");
  assert.equal(args._create, true);
  assert.equal(h.calls.cleanup.length, 0);
});
test("existing initial manager is linked without mutating Auth", async () => {
  const h = harness();
  await h.savePlatformSchool({
    ...input,
    initialRole: "school_manager",
    initialAccount: { mode: "existing", email: "existing@example.invalid" },
  });
  assert.equal(h.calls.auth.length, 0);
  assert.equal(h.calls.lookup[0].name, "settings_find_auth_user");
  assert.equal(h.calls.writes[0].args._initial_role, "school_manager");
});
test("failed bootstrap deletes only its new uncommitted Auth identity", async () => {
  const h = harness({ writeError: Object.assign(new Error("invalid school"), { code: "23514" }) });
  assert.ok((await h.savePlatformSchool(input)).error);
  assert.deepEqual(h.calls.cleanup, [userId]);
  assert.deepEqual(h.calls.checks, [["id", schoolId]]);
  const existing = harness({ writeError: new Error("failure") });
  assert.ok(
    (
      await existing.savePlatformSchool({
        ...input,
        initialAccount: { mode: "existing", email: "existing@example.invalid" },
      })
    ).error,
  );
  assert.equal(existing.calls.cleanup.length, 0);
});
test("uncertain or committed bootstrap never deletes the first administrator", async () => {
  for (const options of [
    { transportFailure: true, committed: true },
    { transportFailure: true, checkError: new Error("offline") },
  ]) {
    const h = harness(options);
    assert.ok((await h.savePlatformSchool(input)).error);
    assert.equal(h.calls.cleanup.length, 0);
  }
});
test("school edits never provision or replace the administrator", async () => {
  const h = harness();
  await h.savePlatformSchool({
    ...input,
    create: false,
    status: "suspended",
    initialAccount: undefined,
    initialRole: undefined,
  });
  assert.equal(h.calls.serviceLoads, 0);
  assert.equal(h.calls.auth.length, 0);
  assert.equal(h.calls.writes[0].args._initial_user, null);
  assert.equal(h.calls.writes[0].args._status, "suspended");
});
test("adding an existing account writes one school membership only", async () => {
  const h = harness();
  await h.addExistingSchoolUser({
    schoolId,
    email: "existing@example.invalid",
    roles: ["teacher"],
    customRoles: [],
  });
  assert.equal(h.calls.auth.length, 0);
  assert.equal(h.calls.cleanup.length, 0);
  const args = h.calls.writes[0].args;
  assert.equal(args._user_id, userId);
  assert.equal(args._school_id, schoolId);
  assert.equal(args._create, true);
  assert.equal(args._roles[0], "teacher");
});
test("membership attachment rejects unauthorized actors and platform-role escalation", async () => {
  const h = harness({ owner: false });
  assert.ok(
    (
      await h.addExistingSchoolUser({
        schoolId,
        email: "existing@example.invalid",
        roles: ["teacher"],
        customRoles: [],
      })
    ).error,
  );
  assert.equal(h.calls.serviceLoads, 0);
  const protectedRole = harness();
  await assert.rejects(
    protectedRole.addExistingSchoolUser({
      schoolId,
      email: "existing@example.invalid",
      roles: ["super_admin"],
      customRoles: [],
    }),
  );
  assert.equal(protectedRole.calls.serviceLoads, 0);
});
test("missing or duplicate existing accounts never mutate or delete Auth", async () => {
  const data = { schoolId, email: "existing@example.invalid", roles: ["teacher"], customRoles: [] };
  for (const options of [{ missingUser: true }, { writeError: new Error("already a member") }]) {
    const h = harness(options);
    assert.ok((await h.addExistingSchoolUser(data)).error);
    assert.equal(h.calls.auth.length, 0);
    assert.equal(h.calls.cleanup.length, 0);
  }
});

test("school creation without initial account never loads the private Auth client", async () => {
  const h = harness();
  const result = await h.savePlatformSchool({
    ...input,
    initialAccount: undefined,
    initialRole: undefined,
  });
  assert.equal(result.error, null);
  assert.equal(h.calls.serviceLoads, 0);
  assert.equal(h.calls.writes[0].name, "platform_create_school");
});
test("later assignment is global-only and scoped without Auth mutation", async () => {
  const data = { schoolId, email: "owner@example.invalid", role: "school_owner" };
  const denied = harness({ admin: false });
  assert.ok((await denied.assignSchoolAdministrator(data)).error);
  assert.equal(denied.calls.serviceLoads, 0);
  const h = harness();
  assert.equal((await h.assignSchoolAdministrator(data)).error, null);
  assert.equal(h.calls.writes[0].name, "platform_assign_administrator");
  assert.equal(h.calls.writes[0].args._school_id, schoolId);
  assert.equal(h.calls.auth.length, 0);
});
test("school-only removal does not load Auth or delete the identity", async () => {
  const h = harness();
  assert.equal((await h.removeSchoolUser({ schoolId, userId, deleteAuth: false })).error, null);
  assert.equal(h.calls.serviceLoads, 0);
  assert.equal(h.calls.cleanup.length, 0);
  assert.equal(h.calls.writes[0].args._delete_auth, false);
});
test("school-level owner cannot request permanent Auth deletion", async () => {
  const h = harness({ admin: false });
  assert.ok((await h.removeSchoolUser({ schoolId, userId, deleteAuth: true })).error);
  assert.equal(h.calls.serviceLoads, 0);
  assert.equal(h.calls.writes.length, 0);
});

test("approved school manager can attach an existing user without platform access", async () => {
  const h = harness({ owner: false, manager: true, admin: false });
  const result = await h.addExistingSchoolUser({
    schoolId,
    email: "existing@example.invalid",
    roles: ["teacher"],
    customRoles: [],
  });
  assert.equal(result.error, null);
  assert.equal(h.calls.writes[0].args._school_id, schoolId);
  assert.equal(h.calls.auth.length, 0);
});
