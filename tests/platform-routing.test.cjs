const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const source = ts.transpileModule(fs.readFileSync("src/routes/_authenticated/route.tsx", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function guard({ platform = false, error = null, user = true } = {}) {
  const exports = {};
  const modules = {
    "@tanstack/react-router": {
      createFileRoute: () => (options) => options,
      redirect: (options) => ({ redirect: options.to, reloadDocument: options.reloadDocument }),
    },
    "@/integrations/supabase/client": {
      supabase: {
        auth: {
          getUser: async () => ({
            data: { user: user ? { id: "fixed-or-school-user" } : null },
            error: null,
          }),
        },
        rpc: async (name, args) => {
          assert.equal(name, "is_super_admin");
          assert.equal(args._user_id, "fixed-or-school-user");
          return { data: platform, error };
        },
      },
    },
    "@/lib/workspace": {},
    "react/jsx-runtime": {},
  };
  vm.runInNewContext(source, { exports, require: (name) => modules[name] });
  return (pathname) => exports.Route.beforeLoad({ location: { pathname } });
}
test("fixed platform identity goes directly to the platform dashboard", async () => {
  await assert.rejects(
    guard({ platform: true })("/dashboard"),
    (e) => e.redirect === "/platform" && e.reloadDocument === true,
  );
  await guard({ platform: true })("/platform");
  await guard({ platform: true })("/settings");
  await assert.rejects(
    guard({ platform: true })("/select-school"),
    (e) => e.redirect === "/platform",
  );
});
test("school manager cannot enter the platform route", async () => {
  await assert.rejects(
    guard()("/platform"),
    (e) => e.redirect === "/dashboard" && e.reloadDocument === true,
  );
  await guard()("/dashboard");
});
test("platform route requires authentication and fails closed on authorization errors", async () => {
  await assert.rejects(guard({ user: false })("/platform"), (e) => e.redirect === "/");
  await assert.rejects(
    guard({ error: new Error("Database unavailable") })("/platform"),
    /Database unavailable/,
  );
});
