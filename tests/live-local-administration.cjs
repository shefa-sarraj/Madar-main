// Opt-in live verification. Only newly-created test schools/accounts are removed.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");
const { chromium } = require(process.env.MADAR_PLAYWRIGHT_MODULE || "playwright");
async function main() {
  assert.equal(process.env.MADAR_RUN_LIVE_CHECKS, "1");
  const { loadEnv } = await import("vite");
  const env = loadEnv("development", process.cwd(), "");
  const base = "http://127.0.0.1:5175",
    email = "mhmoudtariq172+madar-test@gmail.com";
  const run = crypto.randomUUID(),
    started = Date.now();
  const schools = [crypto.randomUUID(), crypto.randomUUID()];
  const createdSchools = [],
    users = [];
  const password = crypto.randomBytes(24).toString("base64url") + "Aa1!";
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (
          env.SUPABASE_SERVICE_ROLE_KEY.startsWith("sb_secret_") &&
          headers.get("Authorization") === `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
        )
          headers.delete("Authorization");
        return fetch(input, { ...init, headers });
      },
    },
  });
  const client = () =>
    createClient(env.SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  const ok = ({ data, error }) => {
    if (error) throw new Error(error.message);
    return data;
  };
  let browser,
    stage = "preflight",
    staffAttempt = false,
    mailAccepted = false;
  async function findEmail(value) {
    for (let page = 1; ; page++) {
      const data = ok(await admin.auth.admin.listUsers({ page, perPage: 1000 }));
      const user = data.users.find((u) => u.email?.toLowerCase() === value);
      if (user || data.users.length < 1000) return user;
    }
  }
  async function makeUser(kind) {
    const value = `madar-live-${kind}-${run}@example.invalid`;
    const data = ok(
      await admin.auth.admin.createUser({
        email: value,
        password,
        email_confirm: true,
        user_metadata: { full_name: `Verification ${kind}`, verification_run: run },
      }),
    );
    users.push(data.user.id);
    return data.user;
  }
  async function login(value, secret = password) {
    const c = client();
    ok(await c.auth.signInWithPassword({ email: value, password: secret }));
    return c;
  }
  async function sessionContext(c) {
    const session = ok(await c.auth.getSession()).session;
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await ctx.addInitScript(
      ({ key, session, school }) => {
        localStorage.setItem(key, JSON.stringify(session));
        localStorage.setItem("madar.active_school", school);
      },
      {
        key: `sb-${new URL(env.SUPABASE_URL).hostname.split(".")[0]}-auth-token`,
        session,
        school: schools[0],
      },
    );
    return ctx;
  }
  try {
    assert.equal((await fetch(base)).status, 200);
    assert.equal(await findEmail(email), undefined, "Never overwrite an existing account");
    const platformBefore = ok(await admin.from("platform_super_admin").select("user_id"));
    assert.equal(platformBefore.length, 1);
    const platformId = platformBefore[0].user_id;
    assert.equal(
      ok(await admin.auth.admin.getUserById(platformId)).user.email,
      "super.madar@gmail.com",
    );
    const owner = await makeUser("owner"),
      manager = await makeUser("manager");
    for (const id of schools) {
      ok(
        await admin.from("schools").insert({
          id,
          name_ar: `Madar Live Verification ${run} ${id}`,
          currency: "USD",
          timezone: "Asia/Jerusalem",
          status: "active",
        }),
      );
      createdSchools.push(id);
      ok(await admin.from("school_settings").insert({ school_id: id, default_currency: "USD" }));
    }
    const school = schools[0],
      foreign = schools[1];
    ok(
      await admin.from("school_members").insert([
        { school_id: school, user_id: owner.id, status: "active" },
        { school_id: school, user_id: manager.id, status: "active" },
      ]),
    );
    ok(
      await admin.from("user_roles").insert([
        { school_id: school, user_id: owner.id, role: "school_owner" },
        { school_id: school, user_id: manager.id, role: "school_manager" },
      ]),
    );
    ok(
      await admin
        .from("departments")
        .insert({ school_id: school, name: "Verification Department", is_active: true }),
    );
    ok(
      await admin.from("expense_categories").insert([
        { school_id: school, name: `Own ${run}` },
        { school_id: foreign, name: `Foreign ${run}` },
      ]),
    );
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.MADAR_BROWSER_EXECUTABLE,
    });
    const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await ownerContext.newPage();
    page.setDefaultTimeout(20000);
    stage = "owner login";
    await page.goto(base);
    await page.getByLabel(/البريد الإلكتروني/).fill(owner.email);
    await page.getByLabel(/كلمة المرور/).fill(password);
    await page.getByRole("button", { name: /دخول/ }).click();
    await page.waitForURL("**/dashboard");
    await page.goto(`${base}/platform`);
    await page.waitForURL("**/dashboard");
    console.log("PASS real owner login; school owner denied Platform Admin");
    async function fillEmployee(name) {
      await page.getByRole("button", { name: "إضافة موظف", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel(/الاسم الكامل/).fill(name);
      await dialog.getByLabel(/المسمى الوظيفي/).fill("Verification Employee");
      await dialog.getByRole("combobox", { name: /القسم/ }).click();
      await page.getByRole("option", { name: "Verification Department", exact: true }).click();
      await dialog.getByRole("radio", { name: "بدون وصول إلى النظام", exact: true }).waitFor();
      return dialog;
    }
    stage = "Staff without login";
    await page.goto(`${base}/staff`);
    let dialog = await fillEmployee(`No Login ${run}`);
    await dialog.getByRole("button", { name: "حفظ", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    const noLogin = ok(
      await admin
        .from("employees")
        .select("id")
        .eq("school_id", school)
        .eq("full_name", `No Login ${run}`)
        .single(),
    );
    assert.equal(
      ok(
        await admin
          .from("school_user_employee_links")
          .select("user_id")
          .eq("school_id", school)
          .eq("employee_id", noLogin.id),
      ).length,
      0,
    );
    console.log("PASS Staff employee without system access");
    stage = "Staff account creation";
    dialog = await fillEmployee(`Login Employee ${run}`);
    await dialog.getByRole("radio", { name: "تفعيل الوصول إلى النظام", exact: true }).check();
    await dialog.getByLabel(/بريد الدخول/).fill(email);
    await dialog.getByRole("button", { name: "توليد كلمة مرور", exact: true }).click();
    const employeePassword = await dialog.getByLabel(/كلمة المرور المؤقتة/).inputValue();
    assert.equal(employeePassword.length, 20);
    await dialog.getByRole("checkbox", { name: "محاسب", exact: true }).check();
    staffAttempt = true;
    await dialog.getByRole("button", { name: "حفظ", exact: true }).click();
    await dialog.locator("code").waitFor();
    assert.equal(await dialog.locator("code").innerText(), employeePassword);
    const employeeUser = await findEmail(email);
    users.push(employeeUser.id);
    const employee = ok(
      await admin
        .from("employees")
        .select("id")
        .eq("school_id", school)
        .eq("full_name", `Login Employee ${run}`)
        .single(),
    );
    assert.equal(
      ok(
        await admin
          .from("school_user_employee_links")
          .select("user_id")
          .eq("school_id", school)
          .eq("employee_id", employee.id)
          .single(),
      ).user_id,
      employeeUser.id,
    );
    await dialog.getByRole("button", { name: "إغلاق", exact: true }).last().click();
    const employeeClient = await login(email, employeePassword);
    assert.equal(
      ok(await employeeClient.from("expense_categories").select("id").eq("school_id", school))
        .length,
      1,
    );
    assert.equal(
      ok(await employeeClient.from("expense_categories").select("id").eq("school_id", foreign))
        .length,
      0,
    );
    assert.equal(ok(await employeeClient.from("schools").select("id").eq("id", foreign)).length, 0);
    console.log(
      "PASS Staff account creation, automatic employee link, real login and accountant baseline",
    );
    stage = "system permission edit";
    await page.goto(`${base}/settings`);
    await page.getByRole("tab", { name: "الصلاحيات", exact: true }).click();
    assert.equal(
      await page.getByRole("checkbox", { name: "عرض الطلاب", exact: true }).isDisabled(),
      true,
    );
    await page.getByRole("combobox", { name: "الدور", exact: true }).click();
    await page.getByRole("option", { name: "محاسب", exact: true }).click();
    await page.getByRole("checkbox", { name: "عرض المصروفات", exact: true }).uncheck();
    await page.getByRole("checkbox", { name: "إنشاء المخزون", exact: true }).check();
    await page.getByRole("button", { name: "حفظ الصلاحيات", exact: true }).click();
    await page.getByText("تم حفظ الصلاحيات", { exact: true }).waitFor();
    const matrix = ok(
      await employeeClient.rpc("settings_my_system_permissions", { _school_id: school }),
    );
    assert.equal(matrix.expenses.view, false);
    assert.equal(matrix.inventory.create, true);
    assert.equal(
      ok(await employeeClient.from("expense_categories").select("id").eq("school_id", school))
        .length,
      0,
    );
    assert.ok(
      (
        await employeeClient
          .from("expense_categories")
          .insert({ school_id: school, name: "Denied" })
      ).error,
    );
    ok(
      await employeeClient
        .from("inventory_categories")
        .insert({ school_id: school, name: `Granted ${run}` }),
    );
    assert.ok(
      (
        await employeeClient
          .from("inventory_categories")
          .insert({ school_id: foreign, name: "Denied" })
      ).error,
    );
    const employeeContext = await sessionContext(employeeClient);
    const employeePage = await employeeContext.newPage();
    await employeePage.goto(`${base}/expenses`);
    await employeePage
      .getByText(/لا تملك صلاحية/)
      .first()
      .waitFor();
    await employeePage.goto(`${base}/inventory`);
    await employeePage.getByRole("button", { name: "إضافة صنف", exact: true }).waitFor();
    await employeePage.goto(`${base}/platform`);
    await employeePage.waitForURL("**/dashboard");
    console.log("PASS saved permission changes enforced by real RLS/API and local module controls");
    stage = "Users role edit";
    await page.getByRole("tab", { name: "المستخدمون", exact: true }).click();
    const row = page.getByRole("row").filter({ hasText: `Login Employee ${run}` });
    await row.getByRole("button", { name: "تعديل العضوية والأدوار", exact: true }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("checkbox", { name: "محاسب", exact: true }).uncheck();
    await dialog.getByRole("checkbox", { name: "الموارد البشرية", exact: true }).check();
    await dialog.getByRole("button", { name: "حفظ العضوية", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.deepEqual(
      ok(
        await admin
          .from("user_roles")
          .select("role")
          .eq("school_id", school)
          .eq("user_id", employeeUser.id),
      ).map((r) => r.role),
      ["hr"],
    );
    const managerClient = await login(manager.email),
      ownerClient = await login(owner.email);
    assert.ok(
      (
        await managerClient.rpc("settings_save_member_roles", {
          _school_id: school,
          _user_id: employeeUser.id,
          _roles: ["school_owner"],
          _custom_roles: [],
          _status: "active",
        })
      ).error,
    );
    assert.ok(
      (
        await managerClient.rpc("settings_save_member_roles", {
          _school_id: foreign,
          _user_id: employeeUser.id,
          _roles: ["teacher"],
          _custom_roles: [],
          _status: "active",
        })
      ).error,
    );
    assert.ok(
      (await managerClient.rpc("bootstrap_platform_super_admin", { _user_id: manager.id })).error,
    );
    for (const c of [managerClient, ownerClient]) {
      const id = ok(await c.auth.getUser()).user.id;
      assert.ok(
        (
          await c
            .from("platform_user_permissions")
            .insert({ user_id: id, permission: "manage_schools" })
        ).error,
      );
    }
    for (const [roles, status] of [
      [["teacher"], "active"],
      [["school_owner"], "suspended"],
    ])
      assert.ok(
        (
          await ownerClient.rpc("settings_save_member_roles", {
            _school_id: school,
            _user_id: owner.id,
            _roles: roles,
            _custom_roles: [],
            _status: status,
          })
        ).error,
      );
    console.log("PASS Users role edits, last-owner protection and privilege/tenant denials");
    stage = "password recovery";
    const recovery = ok(
      await admin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: `${base}/reset-password` },
      }),
    );
    console.log(
      `Local recovery redirect allowlisted: ${new URL(recovery.properties.action_link).searchParams.get("redirect_to") === `${base}/reset-password`}`,
    );
    const recoveryClient = client();
    ok(
      await recoveryClient.auth.verifyOtp({
        token_hash: recovery.properties.hashed_token,
        type: "recovery",
      }),
    );
    const recoveryContext = await sessionContext(recoveryClient),
      recoveryPage = await recoveryContext.newPage();
    await recoveryPage.goto(`${base}/reset-password`);
    const newPassword = crypto.randomBytes(24).toString("base64url") + "Aa1!";
    await recoveryPage.getByLabel(/كلمة المرور الجديدة/).fill(newPassword);
    await recoveryPage.getByLabel(/تأكيد كلمة المرور/).fill(newPassword);
    await recoveryPage.getByRole("button", { name: "حفظ كلمة المرور", exact: true }).click();
    await recoveryPage.waitForURL("**/dashboard");
    assert.ok(
      (await client().auth.signInWithPassword({ email, password: employeePassword })).error,
    );
    await login(email, newPassword);
    console.log(
      "PASS real recovery token, reset form, old-password rejection and new-password login",
    );
    stage = "password-reset email";
    await row
      .getByRole("button", { name: "إرسال رابط إعادة تعيين كلمة المرور", exact: true })
      .click();
    await page.getByText("تم إرسال رابط إعادة تعيين كلمة المرور", { exact: true }).waitFor();
    mailAccepted = true;
    console.log(
      "PASS Users reset-email request accepted for authorized test inbox; delivery needs inbox confirmation",
    );
    assert.deepEqual(
      ok(await admin.from("platform_super_admin").select("user_id")),
      platformBefore,
    );
    assert.equal(
      ok(await admin.from("school_members").select("user_id").eq("user_id", platformId)).length,
      0,
    );
    assert.equal(
      ok(await admin.from("user_roles").select("user_id").eq("user_id", platformId)).length,
      0,
    );
    console.log("PASS Platform Super Admin unchanged and school-level only operations verified");
  } catch (error) {
    const line = error.stack?.match(/live-local-administration\.cjs:(\d+)/)?.[1];
    console.error(`FAIL live verification at: ${stage}; line ${line ?? "unknown"}; ${error.name}`);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    if (staffAttempt) {
      const u = await findEmail(email);
      if (
        u &&
        Date.parse(u.created_at) >= started - 1000 &&
        u.user_metadata?.full_name === `Login Employee ${run}` &&
        !users.includes(u.id)
      )
        users.push(u.id);
    }
    for (const school of createdSchools) {
      ok(
        await admin
          .from("schools")
          .delete()
          .eq("id", school)
          .eq("name_ar", `Madar Live Verification ${run} ${school}`),
      );
      assert.equal(ok(await admin.from("schools").select("id").eq("id", school)).length, 0);
    }
    for (const id of users) {
      assert.equal(
        ok(await admin.from("school_members").select("school_id").eq("user_id", id)).length,
        0,
      );
      ok(await admin.auth.admin.deleteUser(id));
    }
    console.log(
      `Cleanup verified: ${createdSchools.length} temporary schools and ${users.length} temporary Auth accounts removed; real memberships untouched.`,
    );
    console.log(`Password-reset email accepted: ${mailAccepted}`);
  }
}
main().catch(() => {
  console.error("Live verification/cleanup failed; inspect test fixtures. No credentials logged.");
  process.exitCode = 1;
});
