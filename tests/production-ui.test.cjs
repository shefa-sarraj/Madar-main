const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const exportsObject = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync("src/lib/user-error.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  { exports: exportsObject },
);
test("user errors hide database internals and retain Arabic validation feedback", () => {
  const { userError } = exportsObject;
  for (const message of [
    "relation school_members does not exist",
    "Failed to fetch",
    "secret: sb_secret_fixture",
    "تعذر الحفظ SQL constraint student_id",
    "a".repeat(301),
  ])
    assert.equal(userError({ message }), userError(null));
  assert.equal(userError({ message: "أدخل اسم المدرسة." }), "أدخل اسم المدرسة.");
  assert.equal(
    userError({ message: "permission denied for table schools" }),
    "ليست لديك صلاحية لتنفيذ هذا الإجراء.",
  );
});
