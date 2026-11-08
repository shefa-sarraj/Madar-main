const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(path, modules = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    exports,
    require: (name) => {
      if (name in modules) return modules[name];
      throw new Error(`Unexpected import ${name}`);
    },
    Date,
    Map,
    Set,
  });
  return exports;
}
const pager = load("src/lib/pagination.ts", {
  react: {
    useState: () => {
      throw new Error("unexpected hook");
    },
  },
});
const plain = (value) => JSON.parse(JSON.stringify(value));

test("default sizes, inclusive ranges and empty pages", () => {
  assert.deepEqual(plain(pager.PAGE_SIZES), [25, 50, 100]);
  assert.deepEqual(plain(pager.pageRange(1, 25)), { from: 0, to: 24 });
  assert.deepEqual(plain(pager.pageRange(3, 50)), { from: 100, to: 149 });
  assert.equal(pager.pageCount(0, 25), 1);
  assert.deepEqual(plain(pager.slicePage([], { page: 4, pageSize: 25 })), {
    rows: [],
    total: 0,
    page: 1,
  });
});

test("large sorted lists have no omissions or overlap at every size", () => {
  const rows = Array.from({ length: 5053 }, (_, id) => ({ id }));
  for (const pageSize of pager.PAGE_SIZES) {
    const ids = [];
    for (let page = 1; page <= pager.pageCount(rows.length, pageSize); page++) {
      const result = pager.slicePage(rows, { page, pageSize });
      assert.ok(result.rows.length <= pageSize);
      ids.push(...result.rows.map((row) => row.id));
    }
    assert.deepEqual(
      ids,
      rows.map((row) => row.id),
    );
  }
});

test("search, filter, tenant and year changes reset page before fetching", () => {
  let state;
  const { usePagination } = load("src/lib/pagination.ts", {
    react: {
      useState(initial) {
        state ??= initial;
        return [
          state,
          (next) => {
            state = next;
          },
        ];
      },
    },
  });
  const render = (scope) => usePagination(scope);
  let result = render(["school-a", "year-a", { search: "", status: "all" }]);
  assert.equal(result.pageSize, 25);
  result.onPageChange(8);
  assert.equal(render(["school-a", "year-a", { search: "", status: "all" }]).page, 8);
  result = render(["school-a", "year-a", { search: "target", status: "all" }]);
  assert.equal(result.page, 1);
  result.onPageChange(3);
  assert.equal(render(["school-a", "year-a", { search: "target", status: "active" }]).page, 1);
  assert.equal(render(["school-b", "year-a", { search: "target", status: "all" }]).page, 1);
  assert.equal(render(["school-a", "year-b", { search: "target", status: "all" }]).page, 1);
  result.onPageSizeChange(100);
  result = render(["school-a", "year-a", { search: "target", status: "all" }]);
  assert.equal(result.page, 1);
  assert.equal(result.pageSize, 100);
});

test("previous data cannot cross tenant/year scopes", () => {
  const data = { rows: ["private"] };
  assert.equal(
    pager.keepPageData(data, { queryKey: ["finance", "a", "2026", "page"] }, [
      "finance",
      "b",
      "2026",
    ]),
    undefined,
  );
  assert.equal(
    pager.keepPageData(data, { queryKey: ["finance", "a", "2026", "page"] }, [
      "finance",
      "a",
      "2027",
    ]),
    undefined,
  );
  assert.equal(
    pager.keepPageData(data, { queryKey: ["finance", "a", "2026", "page"] }, [
      "finance",
      "a",
      "2026",
    ]),
    data,
  );
});

test("counted reads clamp a deleted last page and never accept missing counts", async () => {
  const requests = [];
  const result = await pager.readPage(
    async (from, to) => {
      requests.push([from, to]);
      return { data: from === 25 ? [26, 27] : [], count: 27, error: null };
    },
    { page: 3, pageSize: 25 },
  );
  assert.deepEqual(requests, [
    [50, 74],
    [25, 49],
  ]);
  assert.equal(result.page, 2);
  assert.equal(result.total, 27);
  await assert.rejects(
    () => pager.readPage(async () => ({ data: [], error: null }), { page: 1, pageSize: 25 }),
    /عدد السجلات/,
  );
  await assert.rejects(
    () =>
      pager.readPage(async () => ({ data: null, count: 0, error: new Error("RLS denied") }), {
        page: 1,
        pageSize: 25,
      }),
    /RLS denied/,
  );
});

test("aggregate reads exceed the API cap without silently truncating", async () => {
  const rows = Array.from({ length: 1205 }, (_, id) => id),
    calls = [];
  const all = await pager.readAll(async (from, to) => {
    calls.push([from, to]);
    return { data: rows.slice(from, to + 1), error: null };
  });
  assert.equal(all.length, 1205);
  assert.deepEqual(calls, [
    [0, 499],
    [500, 999],
    [1000, 1499],
  ]);
  const { completeRead } = load("src/lib/supabase-read.ts");
  const ordered = [];
  const query = {
    order(column) {
      ordered.push(column);
      return this;
    },
    async range(from, to) {
      return { data: rows.slice(from, to + 1), error: null, status: 200 };
    },
  };
  const result = await completeRead(query);
  assert.equal(result.data.length, 1205);
  assert.equal(result.status, 200);
  assert.deepEqual(ordered, ["id"]);
});

test("related IDs are deduplicated and bounded before hydration", async () => {
  const { completeIds } = load("src/lib/supabase-read.ts");
  const ids = Array.from({ length: 1205 }, (_, id) => String(id)),
    batches = [];
  const result = await completeIds([...ids, ...ids], (batch) => ({
    order() {
      return this;
    },
    async range(from, to) {
      if (from === 0) batches.push(batch);
      return { data: batch.slice(from, to + 1), error: null };
    },
  }));
  assert.equal(result.data.length, 1205);
  assert.ok(batches.every((batch) => batch.length <= 100));
  assert.equal(batches.length, 13);
});

test("aggregate errors return errors, not partial totals", async () => {
  const { completeRead } = load("src/lib/supabase-read.ts");
  const error = { message: "denied" };
  const result = await completeRead({
    order() {
      return this;
    },
    async range(from) {
      return from ? { data: null, error } : { data: Array(500).fill(1), error: null };
    },
  });
  assert.equal(result.error, error);
  assert.equal(result.data, null);
});

test("search operands quote syntax and escape wildcard characters", () => {
  const term = pager.searchOperand('a%,_"\\b');
  assert.equal(term, '"%a\\%,\\_\\"\\\\b%"');
});

function coreHarness() {
  const calls = [];
  const client = {
    from(table) {
      const query = {
        then(resolve) {
          return Promise.resolve({ data: [], error: null, count: 0 }).then(resolve);
        },
      };
      for (const method of [
        "select",
        "eq",
        "filter",
        "or",
        "order",
        "range",
        "returns",
        "in",
        "ilike",
      ]) {
        query[method] = (...args) => {
          calls.push([table, method, ...args]);
          return query;
        };
      }
      return query;
    },
  };
  const core = load("src/lib/core-list-pages.ts", {
    "@/integrations/supabase/client": { supabase: client },
    "@/lib/pagination": pager,
    "@/lib/students": { ADMISSION_STATUS: { new: {}, accepted: {} } },
  });
  return { core, calls };
}

test("Students filters apply to parents before counted stable page reads", async () => {
  const { core, calls } = coreHarness();
  await core.fetchStudentPage(
    "school-a",
    { page: 2, pageSize: 25 },
    {
      search: "guardian",
      status: "active",
      gender: "female",
      stageId: "stage",
      gradeId: "grade",
      sectionId: "section",
      yearId: "year-a",
    },
    [{ id: "grade", stage_id: "stage" }],
  );
  assert.ok(
    calls.some(
      ([table, method, column, value]) =>
        table === "students" && method === "eq" && column === "school_id" && value === "school-a",
    ),
  );
  assert.ok(
    calls.some(
      ([table, method, selection, options]) =>
        table === "students" &&
        method === "select" &&
        selection.includes("scope:student_enrollments!inner") &&
        options.count === "exact",
    ),
  );
  assert.ok(
    calls.some(
      ([, method, column, value]) =>
        method === "eq" && column === "scope.academic_year_id" && value === "year-a",
    ),
  );
  assert.ok(
    calls.some(
      ([table, method, from, to]) =>
        table === "students" && method === "range" && from === 25 && to === 49,
    ),
  );
  assert.ok(
    calls.some(
      ([table, method, column]) => table === "students" && method === "order" && column === "id",
    ),
  );
  assert.ok(
    calls.some(
      ([table, method, column, value]) =>
        table === "students" &&
        method === "eq" &&
        column === "guardian_match.is_primary" &&
        value === true,
    ),
  );
});

test("Admissions and Staff use counted pages after all filters", async () => {
  const { core, calls } = coreHarness();
  await core.fetchAdmissionsPage(
    "school-a",
    { page: 3, pageSize: 50 },
    { search: "student name", status: "accepted", gradeFilter: "grade-a" },
  );
  await core.fetchStaffPage(
    "school-a",
    { page: 2, pageSize: 100 },
    {
      search: "",
      status: "inactive",
      department: "dep",
      employmentType: "part_time",
      jobTitle: "teacher",
    },
  );
  for (const table of ["employees", "admission_applications"]) {
    assert.ok(
      calls.some(
        ([t, method, , options]) =>
          t === table && method === "select" && options?.count === "exact",
      ),
    );
    assert.ok(
      calls.some(
        ([t, method, column, value]) =>
          t === table && method === "eq" && column === "school_id" && value === "school-a",
      ),
    );
  }
  assert.ok(
    calls.some(
      ([t, method, from, to]) =>
        t === "employees" && method === "range" && from === 100 && to === 199,
    ),
  );
  assert.ok(
    calls.some(
      ([t, method, column, operator, value]) =>
        t === "employees" &&
        method === "filter" &&
        column === "status" &&
        operator === "eq" &&
        value === "inactive",
    ),
  );
});

test("report paging summarizes all filtered rows and explicit export returns them all", async () => {
  const z = require("zod").z;
  let handler, usedClient;
  const api = {
    middleware() {
      return this;
    },
    validator() {
      return this;
    },
    handler(fn) {
      handler = fn;
      return fn;
    },
  };
  const rows = Array.from({ length: 67 }, (_, id) => ({
    _id: String(id),
    name: `student ${id}`,
    status: "active",
  }));
  load("src/lib/report-pages.functions.ts", {
    "@tanstack/react-start": { createServerFn: () => api },
    zod: { z },
    "@/integrations/supabase/auth-middleware": { requireSupabaseAuth: "auth" },
    "@/lib/pagination": pager,
    "@/lib/reports": {
      REPORT_OPTIONS: [{ id: "students" }],
      filterReportRows: (rows) => rows,
      async fetchReports(s, y, c, client) {
        usedClient = client;
        return {
          students: {
            id: "students",
            rows,
            columns: [{ key: "name" }],
            filters: [{ key: "status" }],
            summarize: (all) => [{ value: all.length }],
          },
        };
      },
    },
  });
  const client = { authenticated: true },
    data = {
      schoolId: "school",
      yearId: "year",
      currency: "USD",
      reportId: "students",
      search: "",
      fromDate: "",
      toDate: "",
      filters: { status: "active" },
      page: 2,
      pageSize: 25,
      exportAll: false,
    };
  const result = await handler({ data, context: { supabase: client } });
  assert.equal(usedClient, client);
  assert.equal(result.report.rows.length, 25);
  assert.equal(result.report.rows[0]._id, "25");
  assert.equal(result.total, 67);
  assert.equal(result.cards[0].value, 67);
  assert.equal(result.report.summarize, undefined);
  assert.equal(
    (await handler({ data: { ...data, exportAll: true }, context: { supabase: client } })).report
      .rows.length,
    67,
  );
});
