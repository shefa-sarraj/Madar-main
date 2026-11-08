const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

test("local Vite loads only approved private variables into the server process", () => {
  const exports = {};
  const process = { env: { SUPABASE_URL: "existing-server-url" }, cwd: () => "/workspace" };
  let mode;
  let options;
  const modules = {
    "@lovable.dev/vite-tanstack-config": {
      defineConfig: (config) => {
        options = config;
        return (env) => env;
      },
    },
    vite: {
      loadEnv: (value, cwd, prefix) => {
        mode = value;
        assert.equal(prefix, "SUPABASE_");
        return {
          SUPABASE_URL: "file-url",
          SUPABASE_SERVICE_ROLE_KEY: "private-test-key",
          SUPABASE_OTHER: "ignored",
        };
      },
    },
  };
  const source = ts.transpileModule(fs.readFileSync("vite.config.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(source, { exports, process, require: (name) => modules[name] });
  exports.default({ mode: "custom-mode" });
  assert.equal(mode, "custom-mode");
  assert.equal(process.env.SUPABASE_URL, "existing-server-url");
  assert.equal(process.env.SUPABASE_SERVICE_ROLE_KEY, "private-test-key");
  assert.equal(process.env.SUPABASE_OTHER, undefined);
  assert.equal(options.vite?.define, undefined);
});

test("actionable server errors redact the configured private key", () => {
  const exports = {};
  const source = ts.transpileModule(
    fs.readFileSync("src/lib/administration-error.server.ts", "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
  vm.runInNewContext(source, {
    exports,
    process: { env: { SUPABASE_SERVICE_ROLE_KEY: "private-test-key" } },
  });
  assert.equal(
    exports.administrationError(new Error("failed: private-test-key")),
    "failed: [redacted]",
  );
});
