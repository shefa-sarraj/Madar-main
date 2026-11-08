const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require(process.env.MADAR_PLAYWRIGHT_MODULE || "playwright");
async function main() {
  const { loadEnv } = await import("vite");
  const env = loadEnv("development", process.cwd(), "VITE_SUPABASE_");
  const api = env.VITE_SUPABASE_URL;
  const base = process.env.MADAR_UI_URL || "http://localhost:8080";
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.MADAR_BROWSER_EXECUTABLE
      ? { executablePath: process.env.MADAR_BROWSER_EXECUTABLE }
      : {}),
  });
  try {
    const user = {
      id: "a1000000-0000-0000-0000-000000000001",
      email: "super.madar@gmail.com",
      aud: "authenticated",
      role: "authenticated",
      user_metadata: {},
      app_metadata: {},
      created_at: new Date().toISOString(),
    };
    const school = {
      id: "a2000000-0000-0000-0000-000000000001",
      name_ar: "مدرسة الاختبار",
      name_en: "Test School",
      status: "active",
      currency: "USD",
      logo_url: null,
    };
    const request = {
      id: "a3000000-0000-0000-0000-000000000001",
      user_id: "a1000000-0000-0000-0000-000000000002",
      school_name: "مدرسة جديدة",
      full_name: "مدير المدرسة",
      requested_role: "school_manager",
      status: "pending",
      review_note: "",
      created_at: new Date().toISOString(),
    };
    let platform = true;
    let multipleSchools = false;
    let reviewed = false;
    let systemMatrix = [];
    let savedMatrix = false;
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.addInitScript(
      ({ key, user }) => {
        const payload = btoa(
          JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 }),
        );
        localStorage.setItem(
          key,
          JSON.stringify({
            access_token: `e30.${payload}.fixture`,
            refresh_token: "fixture",
            token_type: "bearer",
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user,
          }),
        );
      },
      { key: `sb-${new URL(api).hostname.split(".")[0]}-auth-token`, user },
    );
    await page.route(`${api}/**`, async (route) => {
      const url = new URL(route.request().url());
      let body = [];
      if (url.pathname === "/auth/v1/user") body = user;
      else if (url.pathname.endsWith("/rpc/is_super_admin")) body = platform;
      else if (url.pathname.endsWith("/rpc/settings_my_system_permissions")) body = {};
      else if (url.pathname.endsWith("/school_system_role_permissions")) body = systemMatrix;
      else if (url.pathname.endsWith("/rpc/settings_save_system_role")) {
        const args = route.request().postDataJSON();
        assert.equal(args._school_id, school.id);
        assert.equal(args._role, "accountant");
        assert.equal(args._permissions.length, 15);
        systemMatrix = args._permissions.map((row) => ({
          ...row,
          role: args._role,
          school_id: school.id,
        }));
        savedMatrix = true;
        body = null;
      } else if (url.pathname.endsWith("/departments"))
        body = [
          {
            id: "a5000000-0000-0000-0000-000000000001",
            school_id: school.id,
            name: "الإدارة",
            is_active: true,
          },
        ];
      else if (url.pathname.endsWith("/rpc/platform_list_users"))
        body = [
          {
            user_id: user.id,
            email: user.email,
            full_name: "مسؤول مدار",
            permissions: ["create_school", "manage_schools", "manage_platform_users"],
          },
        ];
      else if (url.pathname.endsWith("/rpc/review_school_manager_request")) {
        assert.equal(route.request().postDataJSON()._approve, true);
        request.status = "approved";
        reviewed = true;
        body = school.id;
      } else if (url.pathname.endsWith("/school_manager_requests")) body = [request];
      else if (url.pathname.endsWith("/schools"))
        body = route.request().headers().accept?.includes("vnd.pgrst.object") ? school : [school];
      else if (url.pathname.endsWith("/school_members"))
        body = url.searchParams.get("select")?.includes("school:schools")
          ? [
              { school },
              ...(multipleSchools
                ? [
                    {
                      school: {
                        ...school,
                        id: "a2000000-0000-0000-0000-000000000002",
                        name_ar: "مدرسة أخرى",
                      },
                    },
                  ]
                : []),
            ]
          : [{ school_id: school.id, user_id: user.id, status: "active" }];
      else if (url.pathname.endsWith("/academic_years"))
        body = [
          {
            id: "a4000000-0000-0000-0000-000000000001",
            name: "2026 / 2027",
            start_date: "2026-09-01",
            end_date: "2027-06-30",
            is_active: true,
            status: "active",
          },
        ];
      else if (url.pathname.endsWith("/user_roles"))
        body = [{ school_id: school.id, user_id: user.id, role: "school_manager" }];
      else if (url.pathname.endsWith("/profiles"))
        body = [{ id: user.id, full_name: "مسؤول مدار", phone: null, avatar_url: null }];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });
    await page.goto(`${base}/dashboard`);
    await page.waitForURL("**/platform");
    await page.getByRole("heading", { name: "إدارة منصة مدار" }).waitFor();
    await page.getByRole("button", { name: "قبول", exact: true }).click();
    await page.getByRole("button", { name: "تأكيد", exact: true }).click();
    await page.getByText("مقبول", { exact: true }).waitFor();
    assert.equal(reviewed, true);
    for (const [width, height] of [
      [1440, 1000],
      [390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await page.screenshot({
        path: path.join(process.env.TEMP || "/tmp", `madar-platform-${width}.png`),
        fullPage: true,
      });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
        `Platform overflow at ${width}`,
      );
    }
    platform = false;
    await page.goto(`${base}/platform`);
    await page.waitForURL("**/dashboard");
    assert.equal(await page.getByRole("heading", { name: "إدارة منصة مدار" }).count(), 0);
    const routes = [
      "dashboard",
      "settings",
      "students",
      "admissions",
      "payments",
      "expenses",
      "staff",
      "student-attendance",
      "staff-attendance",
      "inventory",
      "assets",
      "tasks",
      "complaints",
      "reports",
    ];
    const failures = [];
    page.on("pageerror", (error) => failures.push(error.message));
    for (const width of (process.env.MADAR_UI_WIDTHS || "1440,768,390,320")
      .split(",")
      .map(Number)) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      for (const route of routes) {
        await page.goto(`${base}/${route}`);
        await page.locator("main h1").waitFor();
        await page.waitForTimeout(450);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
          `${route} overflow at ${width}`,
        );
        assert.equal(await page.locator("html").getAttribute("dir"), "rtl");
        await page.screenshot({
          path: path.join(process.env.TEMP || "/tmp", `madar-${route}-${width}.png`),
          fullPage: true,
        });
      }
    }
    await page.setViewportSize({ width: 320, height: 568 });
    for (const [route, label] of [
      ["staff", "إضافة موظف"],
      ["tasks", "مهمة جديدة"],
      ["inventory", "إضافة صنف"],
      ["assets", "تسجيل أصل"],
      ["expenses", "تسجيل مصروف"],
    ]) {
      await page.goto(`${base}/${route}`);
      await page.getByRole("button", { name: label, exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      await page.waitForTimeout(650);
      const bounds = await dialog.boundingBox();
      assert.ok(
        bounds &&
          bounds.x >= 0 &&
          bounds.y >= 0 &&
          bounds.x + bounds.width <= 320 &&
          bounds.y + bounds.height <= 568,
        `${route} dialog outside viewport: ${JSON.stringify(bounds)}`,
      );
      await page.screenshot({
        path: path.join(process.env.TEMP || "/tmp", `madar-${route}-dialog.png`),
      });
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
    }
    await page.goto(`${base}/staff`);
    await page.getByRole("button", { name: "إضافة موظف", exact: true }).click();
    await page.getByRole("heading", { name: "الوصول إلى النظام", exact: true }).waitFor();
    assert.equal(await page.getByLabel(/بريد الدخول/).count(), 0);
    await page.getByRole("radio", { name: "تفعيل الوصول إلى النظام", exact: true }).check();
    await page.getByLabel(/بريد الدخول/).fill("employee@example.invalid");
    await page.getByRole("button", { name: "توليد كلمة مرور", exact: true }).click();
    assert.equal((await page.getByLabel(/كلمة المرور المؤقتة/).inputValue()).length, 20);
    await page.getByLabel(/كلمة المرور المؤقتة/).fill("Manual-123!");
    await page.getByRole("checkbox", { name: "معلم", exact: true }).check();
    assert.equal(
      await page.getByRole("checkbox", { name: "مالك المدرسة", exact: true }).count(),
      0,
    );
    await page.screenshot({
      path: path.join(process.env.TEMP || "/tmp", "madar-employee-access-320.png"),
    });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.keyboard.press("Escape");
    await page.goto(`${base}/settings`);
    await page.getByRole("tab", { name: "الصلاحيات", exact: true }).click();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      "Permission matrix overflow",
    );
    await page.screenshot({
      path: path.join(process.env.TEMP || "/tmp", "madar-permissions-320.png"),
      fullPage: true,
    });
    await page.getByRole("combobox", { name: "الدور", exact: true }).click();
    await page.getByRole("option", { name: "محاسب", exact: true }).click();
    const createInventory = page.getByRole("checkbox", { name: "إنشاء المخزون", exact: true });
    await createInventory.waitFor();
    assert.equal(await createInventory.isDisabled(), false);
    await createInventory.check();
    await page.getByRole("button", { name: "حفظ الصلاحيات", exact: true }).click();
    await page.getByText("تم حفظ الصلاحيات", { exact: true }).waitFor();
    assert.equal(savedMatrix, true);
    assert.equal(await createInventory.isChecked(), true);
    assert.equal(
      await page
        .getByRole("checkbox", { name: "إدارة المستخدمون والأدوار", exact: true })
        .isDisabled(),
      true,
    );
    await page.getByRole("tab", { name: "المستخدمون", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "إنشاء مستخدم", exact: true }).count(), 0);
    assert.equal(
      await page.getByRole("columnheader", { name: "الموظف المرتبط", exact: true }).count(),
      1,
    );
    assert.deepEqual(failures, [], "Uncaught browser errors");
    await page.goto(`${base}/select-school`);
    await page.waitForURL("**/dashboard");
    multipleSchools = true;
    await page.goto(`${base}/select-school`);
    await page.getByRole("heading", { name: "اختر المدرسة", exact: true }).waitFor();
    await page.getByRole("button", { name: /مدرسة أخرى/ }).click();
    await page.waitForURL("**/dashboard");
    console.log(
      "Mocked browser checks passed: platform redirect, approval, manager denial, 14 school routes at desktop/tablet/mobile widths, single/multi-school selector.",
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
