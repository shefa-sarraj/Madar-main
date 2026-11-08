import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";

const env = { ...loadEnv("development", process.cwd(), "SUPABASE_"), ...process.env };
const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key)
  throw new Error("Configure private SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.");
const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (key.startsWith("sb_secret_") && headers.get("Authorization") === `Bearer ${key}`)
        headers.delete("Authorization");
      return fetch(input, { ...init, headers });
    },
  },
});
const email = "super.madar@gmail.com";
const initialPassword = process.env.MADAR_BOOTSTRAP_PASSWORD;
async function bootstrap() {
  const { data: identity, error: ready } = await admin
    .from("platform_super_admin")
    .select("user_id")
    .limit(1);
  if (ready)
    throw new Error("Apply 20261010150000_fixed_platform_hierarchy.sql before running bootstrap.");
  let user;
  for (let page = 1; !user; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    user = data.users.find((u) => u.email?.toLowerCase() === email);
    if (data.users.length < 1000) break;
  }
  if (!user) {
    const password = initialPassword;
    if (!password || password.length < 8)
      throw new Error(
        "Run scripts/bootstrap-platform-admin.ps1 to enter the initial password securely.",
      );
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Madar Platform Super Admin" },
    });
    delete process.env.MADAR_BOOTSTRAP_PASSWORD;
    if (error) throw error;
    user = data.user;
  } else {
    // Never silently adopt or reset an existing account.
    if (identity?.[0]?.user_id !== user.id && process.env.MADAR_ADOPT_FIXED_ACCOUNT !== "1")
      throw new Error(
        "Fixed account exists. Verify its ownership, then set MADAR_ADOPT_FIXED_ACCOUNT=1 to adopt it without resetting its password.",
      );
  }
  if (!user?.email_confirmed_at) throw new Error("Fixed account must have a verified email.");
  const { error } = await admin.rpc("bootstrap_platform_super_admin", { _user_id: user.id });
  if (error) throw error;
  console.log("Fixed Platform Super Admin bootstrapped; no school membership or school role.");
}
bootstrap().catch((error) => {
  console.error(
    error.message
      ?.replaceAll(key, "[redacted]")
      .replaceAll(initialPassword || "__unset__", "[redacted]"),
  );
  process.exitCode = 1;
});
