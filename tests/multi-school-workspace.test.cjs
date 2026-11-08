const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const source = ts.transpileModule(fs.readFileSync("src/lib/workspace.tsx", "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
function harness({
  admin = false,
  loadingRoles = false,
  overrides = {},
  systemError = false,
  systemLoading = false,
} = {}) {
  const a = { id: "school-a", status: "active" },
    b = { id: "school-b", status: "active" };
  let schools = [a, b];
  const states = ["school-a", "year-a"],
    storage = new Map();
  let cursor = 0;
  const queries = [];
  const react = {
    createContext: () => ({ Provider: "provider" }),
    useCallback: (fn) => fn,
    useContext: () => null,
    useEffect: () => {},
    useMemo: (fn) => fn(),
    useState: () => {
      const i = cursor++;
      return [
        states[i],
        (value) => {
          states[i] = value;
        },
      ];
    },
  };
  const queryClient = { invalidateQueries() {} };
  const permissions = {
    "school-a": { students: { edit: true } },
    "school-b": { students: { edit: false } },
  };
  const rq = {
    useQueryClient: () => queryClient,
    useQuery: (options) => {
      queries.push(options);
      const [key, , school] = options.queryKey;
      const activeSchool = options.queryKey[1];
      let data;
      if (key === "auth-user") data = { id: "user", email: "user@example.invalid" };
      if (key === "my-schools") data = schools;
      if (key === "platform-identity") data = admin;
      if (key === "my-roles")
        data = [
          { school_id: "school-a", role: "school_owner" },
          { school_id: "school-b", role: "teacher" },
          ...(admin ? [{ school_id: null, role: "super_admin" }] : []),
        ];
      if (key === "academic-years")
        data =
          activeSchool === "school-a"
            ? [{ id: "year-a", is_active: true }]
            : activeSchool === "school-b"
              ? [{ id: "year-b", is_active: true }]
              : [];
      if (key === "my-permissions") data = permissions[school];
      if (key === "my-system-permissions") data = overrides[school] ?? {};
      return {
        data,
        isLoading:
          (key === "my-roles" && loadingRoles) ||
          (key === "my-system-permissions" && systemLoading),
        isError: key === "my-system-permissions" && systemError,
      };
    },
  };
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    window: {
      localStorage: { setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) },
    },
    require: (name) => {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx: (_type, props) => props };
      if (name === "@tanstack/react-query") return rq;
      if (name === "@/integrations/supabase/client") return { supabase: {} };
      if (name === "@/lib/permissions")
        return { fetchMyPermissions: () => {}, hasPermission: (p, m, a) => !!p[m]?.[a] };
      throw new Error(name);
    },
  });
  return {
    render() {
      cursor = 0;
      queries.length = 0;
      return exports.WorkspaceProvider({ children: null }).value;
    },
    states,
    storage,
    queries,
    setSchools: (value) => {
      schools = value;
    },
  };
}
test("switching schools changes roles/permissions immediately and resets the year", () => {
  const h = harness();
  let value = h.render();
  assert.equal(value.roles.join(","), "school_owner");
  assert.equal(value.can("students", "edit"), true);
  value.setActiveSchool("school-b");
  value = h.render();
  assert.equal(value.activeSchool.id, "school-b");
  assert.equal(value.roles.join(","), "teacher");
  assert.equal(value.can("students", "edit"), false);
  assert.equal(value.activeYear.id, "year-b");
  assert.equal(h.states[1], null);
  assert.equal(h.storage.get("madar.active_school"), "school-b");
  assert.ok(
    h.queries.some((q) => q.queryKey[0] === "my-permissions" && q.queryKey[2] === "school-b"),
  );
});
test("selector rejects unknown schools and years from another school", () => {
  const h = harness();
  const value = h.render();
  value.setActiveSchool("foreign");
  assert.equal(h.states[0], "school-a");
  value.setActiveYear("year-b");
  assert.equal(h.states[1], "year-a");
  assert.equal(h.storage.size, 0);
});
test("revoked school selection falls back only to an available membership", () => {
  const h = harness();
  h.setSchools([{ id: "school-b", status: "active" }]);
  const value = h.render();
  assert.equal(value.activeSchool.id, "school-b");
  assert.equal(value.roles.join(","), "teacher");
  assert.equal(value.activeYear.id, "year-b");
  h.setSchools([]);
  assert.equal(h.render().activeSchool, null);
  assert.equal(h.render().roles.length, 0);
});
test("platform identity stays separate while switching school context", () => {
  const h = harness({ admin: true, loadingRoles: true });
  let value = h.render();
  assert.equal(value.isLoading, true);
  assert.equal(value.isPlatformAdmin, true);
  assert.equal(value.roles.includes("super_admin"), false);
  value.setActiveSchool("school-b");
  value = h.render();
  assert.equal(value.isPlatformAdmin, true);
  assert.equal(value.roles.includes("super_admin"), false);
  assert.ok(value.roles.includes("teacher"));
  assert.ok(!value.roles.includes("school_owner"));
});

test("school system overrides revoke legacy UI access, add explicit grants, and stay school-scoped", () => {
  const h = harness({
    overrides: {
      "school-a": { expenses: { view: false, edit: false }, inventory: { create: true } },
    },
  });
  let value = h.render();
  assert.equal(value.can("expenses", "view", true), false);
  assert.equal(value.can("inventory", "create", false), true);
  assert.equal(value.can("students", "edit", false), true);
  value.setActiveSchool("school-b");
  value = h.render();
  assert.equal(value.can("inventory", "create", false), false);
  assert.equal(value.can("expenses", "view", true), true);
});

test("system permission loading/errors fail closed without revoking independent custom grants", () => {
  for (const options of [{ systemError: true }, { systemLoading: true }]) {
    const value = harness(options).render();
    assert.equal(value.can("expenses", "view", true), false);
    assert.equal(value.can("students", "edit", false), true);
  }
});
