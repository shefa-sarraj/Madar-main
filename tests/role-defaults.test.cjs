const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

test("system matrix UI defaults exactly match database permission defaults", () => {
  const migration = fs.readFileSync(
    "supabase/migrations/20261010170000_school_system_role_permissions.sql",
    "utf8",
  );
  const defaults = JSON.parse(migration.match(/'({"school_owner":.*})'::jsonb/)[1]);
  const modules = Object.keys(defaults.school_owner).map((name) => [name, name]);
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync("src/lib/role-permissions.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { exports, require: () => ({ MODULES: modules }) });
  for (const [role, matrix] of Object.entries(defaults)) {
    const actual = exports.defaultRolePermissions(role);
    assert.equal(actual.length, 15);
    assert.deepEqual(JSON.parse(JSON.stringify(actual)), Object.values(matrix), role);
  }
  assert.equal(Object.hasOwn(defaults, "super_admin"), false);
});
