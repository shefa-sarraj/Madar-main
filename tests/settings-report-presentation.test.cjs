const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const api = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync("src/lib/settings-report-presentation.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  { exports: api },
);

test("only the confirmed debug label is hidden, with active/selected safeguards", () => {
  const years = [
    { id: "normal", name: "2026/2027", is_active: true },
    { id: "debug", name: " DEBUG ", is_active: false },
    { id: "active-debug", name: "debug", is_active: true },
    { id: "school", name: "سنة المدرسة التجريبية", is_active: false },
  ];
  assert.deepEqual(
    Array.from(api.visibleAcademicYears(years), (row) => row.id),
    ["normal", "active-debug", "school"],
  );
  assert.equal(api.visibleAcademicYears(years, "debug").length, 4);
  assert.equal(years.length, 4);
});

test("compact report groups cover every existing report exactly once", () => {
  const ids = api.REPORT_GROUPS.flatMap((group) => group.reports);
  assert.equal(ids.length, 11);
  assert.equal(new Set(ids).size, 11);
  assert.ok(api.REPORT_GROUPS.every((group) => group.reports.length <= 4));
  assert.deepEqual(
    Array.from(ids).sort(),
    [
      "students",
      "admissions",
      "finance",
      "expenses",
      "student_attendance",
      "staff_attendance",
      "employees",
      "inventory",
      "assets",
      "tasks",
      "cases",
    ].sort(),
  );
});

test("permission groups retain all modules without duplication", () => {
  const modules = Array.from(api.MODULE_GROUPS.flatMap((group) => group.modules));
  assert.equal(new Set(modules).size, 15);
  assert.deepEqual(
    modules.sort(),
    [
      "students",
      "admissions",
      "classes",
      "fees",
      "expenses",
      "student_attendance",
      "staff_attendance",
      "employees",
      "inventory",
      "assets",
      "tasks",
      "cases",
      "reports",
      "settings",
      "users",
    ].sort(),
  );
});

test("report-specific headings are presentation-only with unchanged fallbacks", () => {
  assert.equal(api.reportColumnHeading("tasks", "status", "الحالة"), "حالة المهمة");
  assert.equal(api.reportColumnHeading("inventory", "name", "الاسم"), "اسم الصنف");
  assert.equal(api.reportColumnHeading("students", "student_name", "الطالب"), "الطالب");
});
