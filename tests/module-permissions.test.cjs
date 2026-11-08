const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function permissionsModule(rows, error = null) {
  const calls = [];
  const client = {
    from(table) {
      const filters = [];
      const query = {
        select() {
          return query;
        },
        eq(key, value) {
          filters.push([key, value]);
          return query;
        },
        in(key, value) {
          filters.push([key, value]);
          return query;
        },
        then(resolve, reject) {
          calls.push({ table, filters });
          return Promise.resolve({ data: rows[table] ?? [], error }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync("src/lib/permissions.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { exports, require: () => ({ settingsClient: () => client }) });
  return { ...exports, calls };
}

test("active custom roles union action flags, scoped by school/user", async () => {
  const mod = permissionsModule({
    school_user_custom_roles: [
      { role_id: "active-a" },
      { role_id: "inactive" },
      { role_id: "active-b" },
    ],
    school_roles: [{ id: "active-a" }, { id: "active-b" }],
    school_role_permissions: [
      { module: "students", can_view: true, can_create: false, can_edit: false, can_manage: false },
      { module: "students", can_view: true, can_create: true, can_edit: false, can_manage: false },
      { module: "expenses", can_view: true, can_create: false, can_edit: true, can_manage: false },
    ],
  });
  const permissions = await mod.fetchMyPermissions("school-a", "user-a");
  assert.equal(mod.hasPermission(permissions, "students", "create"), true);
  assert.equal(mod.hasPermission(permissions, "students", "edit"), false);
  assert.equal(mod.hasPermission(permissions, "expenses", "edit"), true);
  assert.equal(mod.hasPermission(permissions, "fees", "edit"), false);
  for (const call of mod.calls)
    assert.ok(call.filters.some(([key, value]) => key === "school_id" && value === "school-a"));
  assert.ok(mod.calls[0].filters.some(([key, value]) => key === "user_id" && value === "user-a"));
  assert.ok(mod.calls[1].filters.some(([key, value]) => key === "is_active" && value === true));
  assert.equal(
    mod.calls[2].filters.find(([key]) => key === "role_id")[1].includes("inactive"),
    false,
  );
});

test("missing/inactive assignments and query errors fail closed", async () => {
  const empty = permissionsModule({});
  const permissions = await empty.fetchMyPermissions("school-a", "user-a");
  assert.equal(empty.hasPermission(permissions, "settings", "manage"), false);
  assert.equal(empty.calls.length, 1);
  const inactive = permissionsModule({ school_user_custom_roles: [{ role_id: "inactive" }] });
  assert.equal(Object.keys(await inactive.fetchMyPermissions("school-a", "user-a")).length, 0);
  const failed = permissionsModule({}, new Error("RLS denied"));
  await assert.rejects(failed.fetchMyPermissions("school-a", "user-a"), /RLS denied/);
});
