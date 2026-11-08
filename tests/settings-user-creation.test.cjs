const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const { z } = require("zod");

const source = ts.transpileModule(fs.readFileSync("src/lib/settings.functions.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const schoolId = "20000000-0000-0000-0000-000000000001";
const newId = "10000000-0000-0000-0000-000000000003";
const customRole = "30000000-0000-0000-0000-000000000001";
const input = {
  schoolId,
  email: "new@example.invalid",
  fullName: "Test User",
  temporaryPassword: "Temporary-123!",
  roles: ["teacher"],
  customRoles: [],
  sendEmail: false,
};

function harness(options = {}) {
  const calls = { auth: [], membership: [], cleanup: [], email: [] };
  const client = {
    rpc: async (name, args) => {
      if (name === "can_manage_school") {
        assert.deepEqual(Object.keys(args).sort(), ["_school_id", "_user_id"]);
        return { data: options.owner !== false || options.manager === true, error: null };
      }
      if (name === "has_role") return { data: options.owner !== false, error: null };
      if (name === "is_super_admin") return { data: false, error: null };
      assert.equal(name, "settings_provision_school_user");
      calls.membership.push(args);
      if (options.membershipThrows) throw new Error("network error");
      return { error: options.membershipError ?? null };
    },
    from: (table) => {
      const query = {
        then: (resolve) =>
          resolve({
            data: options.protectedTarget ? [{ role: "school_owner" }] : [{ role: "teacher" }],
            error: null,
          }),
        select: () => query,
        eq: () => query,
        single: async () => ({ data: { id: schoolId }, error: null }),
        maybeSingle: async () => ({
          data:
            table === "school_members"
              ? options.foreignMember
                ? null
                : { user_id: newId }
              : table === "school_user_employee_links"
                ? options.alreadyLinked
                  ? { user_id: newId }
                  : null
                : options.foreignEmployee
                  ? null
                  : { id: newId },
          error: null,
        }),
        in: async () => ({ data: options.foreignRole ? [] : [{ id: customRole }], error: null }),
      };
      assert.ok(
        [
          "schools",
          "school_roles",
          "employees",
          "school_user_employee_links",
          "school_members",
          "user_roles",
        ].includes(table),
      );
      return query;
    },
    auth: {
      resetPasswordForEmail: async (...args) => {
        calls.email.push(args);
        if (options.mailThrows) throw new Error("network error");
        return { error: options.mailError ?? null };
      },
    },
  };
  const admin = {
    from: (table) => {
      if (table === "profiles")
        return { upsert: async () => ({ error: options.profileError ?? null }) };
      assert.equal(table, "school_members");
      return {
        select: () => ({
          eq: async () => ({
            data: options.committed ? [{ school_id: schoolId }] : [],
            error: options.checkError ?? null,
          }),
        }),
      };
    },
    auth: {
      admin: {
        getUserById: async (id) => {
          calls.auth.push({ lookup: id });
          return { data: { user: { email: input.email } }, error: null };
        },
        createUser: async (args) => {
          calls.auth.push(args);
          return {
            data: { user: options.authError ? null : { id: newId } },
            error: options.authError ?? null,
          };
        },
        deleteUser: async (id) => {
          calls.cleanup.push(id);
          return { error: options.cleanupError ?? null };
        },
      },
    },
  };
  const result = { exports: {} };
  const modules = {
    zod: { z },
    "@tanstack/react-start": {
      createServerFn: () => {
        let validator;
        const builder = {
          middleware: () => builder,
          validator: (next) => {
            validator = next;
            return builder;
          },
          handler: (handler) => async (data) =>
            handler({
              data: validator.parse(data),
              context: { userId: "owner", supabase: client },
            }),
        };
        return builder;
      },
    },
    "@/integrations/supabase/auth-middleware": { requireSupabaseAuth: {} },
    "@/lib/settings": { settingsClient: (value) => value },
    "@/lib/school-administration": { schoolAdminClient: (value) => value },
    "@/lib/administration-error.server": { administrationError: (error) => error.message },
    "@/integrations/supabase/client.server": { supabaseAdmin: admin },
    "@tanstack/react-start/server": {
      getRequest: () => ({ url: "https://school.example.invalid/_server/" }),
    },
  };
  vm.runInNewContext(source, {
    exports: result.exports,
    require: (id) => {
      assert.ok(modules[id], "Unexpected import: " + id);
      return modules[id];
    },
    URL,
  });
  return {
    run: result.exports.createSchoolUser,
    reset: result.exports.resetSchoolUserPassword,
    calls,
  };
}

test("direct creation provisions both role types without sending email", async () => {
  const { run, calls } = harness();
  const result = await run({ ...input, customRoles: [customRole] });
  assert.equal(result.warning, null);
  assert.equal(calls.auth[0].password, input.temporaryPassword);
  assert.equal(calls.auth[0].email_confirm, true);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.auth[0].user_metadata)), {
    full_name: input.fullName,
  });
  assert.equal(calls.membership[0]._user_id, newId);
  assert.equal(calls.membership[0]._school_id, schoolId);
  assert.equal(calls.membership[0]._employee_id, null);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.membership[0]._roles)), ["teacher"]);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.membership[0]._custom_roles)), [customRole]);
  assert.equal(calls.email.length, 0);
  assert.equal(calls.cleanup.length, 0);
});
test("unauthorized actors and foreign-school custom roles are rejected before Auth writes", async () => {
  for (const options of [{ owner: false }, { foreignRole: true }]) {
    const { run, calls } = harness(options);
    assert.ok((await run({ ...input, customRoles: [customRole] })).error);
    assert.equal(calls.auth.length, 0);
  }
});
test("failed membership creation removes only the new Auth identity", async () => {
  const { run, calls } = harness({ membershipError: { message: "failed", code: "23514" } });
  assert.equal((await run(input)).error, "failed");
  assert.deepEqual(calls.cleanup, [newId]);
  assert.equal(calls.email.length, 0);
});
test("membership transport exceptions never delete a committed identity", async () => {
  const { run, calls } = harness({ membershipThrows: true, committed: true });
  assert.match((await run(input)).error, /network error; account retained/);
  assert.deepEqual(calls.cleanup, []);
});
test("custom-only roles can provision a user without a protected role", async () => {
  const { run, calls } = harness();
  await run({ ...input, roles: [], customRoles: [customRole] });
  assert.equal(calls.membership[0]._roles.length, 0);
  assert.equal(calls.membership[0]._custom_roles[0], customRole);
});

test("foreign employee is rejected before Auth creation; scoped link reaches atomic RPC", async () => {
  const denied = harness({ foreignEmployee: true });
  assert.equal(
    (await denied.run({ ...input, employeeId: newId })).error,
    "Employee is not in current school",
  );
  assert.equal(denied.calls.auth.length, 0);
  const allowed = harness();
  assert.equal((await allowed.run({ ...input, employeeId: newId })).error, null);
  assert.equal(allowed.calls.membership[0]._employee_id, newId);
});
test("uncertain membership lookup does not trigger destructive cleanup", async () => {
  const h = harness({
    membershipError: { message: "failed", code: "23514" },
    checkError: { message: "offline" },
  });
  assert.match((await h.run(input)).error, /account retained/);
  assert.equal(h.calls.cleanup.length, 0);
});
test("optional email failure keeps the created account and returns a warning", async () => {
  const { run, calls } = harness({ mailError: { message: "delivery failed" } });
  const result = await run({ ...input, sendEmail: true });
  assert.ok(result.warning);
  assert.equal(calls.membership.length, 1);
  assert.equal(calls.cleanup.length, 0);
  assert.equal(calls.email[0][1].redirectTo, "https://school.example.invalid/reset-password");
});
test("optional email transport errors do not fail successful account creation", async () => {
  const { run, calls } = harness({ mailThrows: true });
  const result = await run({ ...input, sendEmail: true });
  assert.ok(result.warning);
  assert.equal(calls.membership.length, 1);
  assert.equal(calls.cleanup.length, 0);
});
test("existing email and invalid system roles never mutate memberships or passwords", async () => {
  const duplicate = harness({ authError: { message: "already registered" } });
  assert.equal((await duplicate.run(input)).error, "already registered");
  assert.equal(duplicate.calls.membership.length, 0);
  assert.equal(duplicate.calls.cleanup.length, 0);
  const invalid = harness();
  await assert.rejects(invalid.run({ ...input, roles: ["super_admin"] }));
  assert.equal(invalid.calls.auth.length, 0);
});

test("approved school manager can provision users in their own school", async () => {
  const { run, calls } = harness({ owner: false, manager: true });
  const result = await run(input);
  assert.equal(result.error, null);
  assert.equal(calls.auth.length, 1);
  assert.equal(calls.membership[0]._school_id, schoolId);
});

test("already-linked employees are rejected before creating Auth accounts", async () => {
  const { run, calls } = harness({ alreadyLinked: true });
  assert.ok((await run({ ...input, employeeId: newId })).error);
  assert.equal(calls.auth.length, 0);
});

test("school password reset checks scoped membership and protected target before private Auth lookup", async () => {
  for (const options of [
    { owner: false },
    { foreignMember: true },
    { owner: false, manager: true, protectedTarget: true },
  ]) {
    const h = harness(options);
    assert.ok((await h.reset({ schoolId, userId: newId })).error);
    assert.equal(h.calls.auth.length, 0);
    assert.equal(h.calls.email.length, 0);
  }
  const h = harness({ owner: false, manager: true });
  assert.equal((await h.reset({ schoolId, userId: newId })).error, null);
  assert.equal(h.calls.auth[0].lookup, newId);
  assert.equal(h.calls.email[0][0], input.email);
});

test("password reset mail failures expose only a safe generic message", async () => {
  const h = harness({ mailThrows: true });
  const result = await h.reset({ schoolId, userId: newId });
  assert.ok(result.error);
  assert.doesNotMatch(result.error, /network error/);
});
