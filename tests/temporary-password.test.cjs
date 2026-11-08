const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");
const ts = require("typescript");

function loadGenerator(crypto = webcrypto) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync("src/lib/temporary-password.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { exports, crypto });
  return exports.generateTemporaryPassword;
}

test("generated passwords are strong, diverse, and use secure randomness", () => {
  const generate = loadGenerator();
  const passwords = new Set();
  for (let i = 0; i < 256; i++) {
    const password = generate();
    assert.equal(password.length, 20);
    for (const group of [/[A-Z]/, /[a-z]/, /[2-9]/, /[!@#$%&*+\-=?]/])
      assert.match(password, group);
    passwords.add(password);
  }
  assert.equal(passwords.size, 256);
  assert.throws(loadGenerator(null), /Secure randomness is unavailable/);
});

function harness({ failCreation = false, failRefresh = false, linked = false } = {}) {
  const state = [];
  let index = 0;
  let effects = [];
  let prior = [];
  let open = true;
  const calls = { create: [], rpc: [] };
  const source = ts.transpileModule(fs.readFileSync("src/lib/employee-access.ts", "utf8"), {
    fileName: "employee-system-access.tsx",
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const query = {
    data: {
      members: linked
        ? [{ user_id: "user", status: "active", roles: ["teacher"], custom_roles: [] }]
        : [],
      links: linked ? [{ employee_id: "employee", user_id: "user" }] : [],
      customRoles: [],
      permissions: [],
    },
    isPending: false,
    isError: false,
  };
  const react = {
    useState(initial) {
      const key = index++;
      if (!(key in state)) state[key] = initial;
      return [
        state[key],
        (value) => {
          state[key] = typeof value === "function" ? value(state[key]) : value;
        },
      ];
    },
    useEffect(fn, deps) {
      const key = index++;
      if (!prior[key] || deps.some((d, i) => d !== prior[key][i])) effects.push(fn);
      prior[key] = deps;
    },
  };
  const modules = {
    react,
    "@tanstack/react-query": {
      useQuery: () => query,
      useQueryClient: () => ({
        invalidateQueries: async () => {
          if (failRefresh) throw new Error("Refresh failed");
        },
      }),
    },
    "@/lib/workspace": {
      useWorkspace: () => ({ roles: ["school_owner"], isPlatformAdmin: false }),
    },
    "@/lib/settings": {
      settingsClient: () => ({
        rpc: async (...args) => {
          calls.rpc.push(args);
          return { error: null };
        },
      }),
      SCHOOL_ROLES: ["teacher"],
    },
    "@/lib/school-administration": {
      schoolAdminClient: () => ({
        rpc: async (...args) => {
          calls.rpc.push(args);
          return { error: null };
        },
      }),
    },
    "@/lib/settings.functions": {
      createSchoolUser: async ({ data }) => {
        calls.create.push(data);
        return { error: failCreation ? "Creation failed" : null };
      },
    },
    "@/lib/temporary-password": { generateTemporaryPassword: loadGenerator() },
    "@/lib/navigation": { ROLE_LABELS: { teacher: "Teacher" } },
    "react/jsx-runtime": require("react/jsx-runtime"),
  };
  const exports = {};
  vm.runInNewContext(source, { exports, require: (id) => modules[id] ?? {} });
  const render = () => {
    index = 0;
    effects = [];
    let result = exports.useEmployeeAccess("school", "employee", open);
    if (effects.length) {
      effects.forEach((fn) => fn());
      index = 0;
      effects = [];
      result = exports.useEmployeeAccess("school", "employee", open);
    }
    return result;
  };
  const fill = () => {
    const access = render();
    access.setEnabled(true);
    access.setLoginEmail("employee@example.invalid");
    access.setPassword("Manual-Test-123!");
    access.setRoles(["teacher"]);
    return render();
  };
  return {
    calls,
    render,
    fill,
    close: () => {
      open = false;
      return render();
    },
  };
}

test("employees remain valid without login, while enabled access requires credentials and roles", () => {
  const h = harness();
  assert.doesNotThrow(() => h.render().validate());
  h.render().setEnabled(true);
  assert.throws(() => h.render().validate());
  assert.doesNotThrow(() => h.fill().validate());
});

test("employee creation links school and employee, reveals once, and clears on close", async () => {
  const h = harness();
  await h.fill().provision("employee", "Employee");
  assert.equal(h.calls.create[0].employeeId, "employee");
  assert.equal(h.calls.create[0].schoolId, "school");
  assert.equal(h.calls.create[0].temporaryPassword, "Manual-Test-123!");
  assert.equal(h.render().createdPassword, "Manual-Test-123!");
  assert.equal(h.render().password, "");
  await h.render().provision("employee", "Employee");
  assert.equal(h.calls.create.length, 1);
  assert.equal(h.close().createdPassword, null);
  assert.equal(h.render().password, "");
});

test("creation failures never reveal passwords; refresh failures cannot duplicate accounts", async () => {
  const failed = harness({ failCreation: true });
  await assert.rejects(failed.fill().provision("employee", "Employee"), /Creation failed/);
  assert.equal(failed.render().createdPassword, null);
  const refresh = harness({ failRefresh: true });
  await refresh.fill().provision("employee", "Employee");
  await refresh.render().provision("employee", "Employee");
  assert.equal(refresh.calls.create.length, 1);
  assert.equal(refresh.render().createdPassword, "Manual-Test-123!");
});

test("existing employee accounts are updated without creating another Auth user", async () => {
  const h = harness({ linked: true });
  h.render().setEnabled(false);
  await h.render().provision("employee", "Employee");
  assert.equal(h.calls.create.length, 0);
  assert.equal(h.calls.rpc[0][0], "settings_save_member_roles");
  assert.equal(h.calls.rpc[0][1]._status, "suspended");
});

test("existing school accounts can be linked only through employee administration", async () => {
  const h = harness();
  h.fill().setExistingUserId("existing");
  await h.render().provision("employee", "Employee");
  assert.equal(h.calls.create.length, 0);
  assert.equal(h.calls.rpc[0][0], "settings_link_employee");
  assert.equal(h.calls.rpc[0][1]._employee_id, "employee");
  assert.equal(h.calls.rpc[1][1]._user_id, "existing");
});
