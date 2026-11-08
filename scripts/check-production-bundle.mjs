import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadEnv } from "vite";
const env = { ...loadEnv("production", process.cwd(), ""), ...process.env };
const privateNames = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "LOVABLE_CRON_SECRET",
  "LOVABLE_CRON_SECRET_PREVIOUS",
  "MADAR_BOOTSTRAP_PASSWORD",
];
const values = privateNames.map((name) => env[name]).filter(Boolean);
const publicKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
if (!env.VITE_SUPABASE_URL || !publicKey)
  throw new Error("Missing public build-time Supabase configuration.");
if (new URL(env.VITE_SUPABASE_URL).protocol !== "https:")
  throw new Error("Production Supabase URL must use HTTPS.");
if (env.SUPABASE_URL && new URL(env.SUPABASE_URL).origin !== new URL(env.VITE_SUPABASE_URL).origin)
  throw new Error("Public and server Supabase URLs point to different projects.");
let role = "";
try {
  role = JSON.parse(Buffer.from(publicKey.split(".")[1] || "", "base64url").toString()).role;
} catch {
  /* Opaque public keys are not JWTs. */
}
if (publicKey.startsWith("sb_secret_") || role === "service_role")
  throw new Error("Private Supabase key configured as a public build variable.");
for (const [name, value] of Object.entries(env))
  if (
    name.startsWith("VITE_") &&
    value &&
    (privateNames.some((key) => name.includes(key)) || values.includes(value))
  )
    throw new Error(`Private value exposed through ${name}.`);
let files = 0;
function scan(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) scan(path);
    else {
      const text = readFileSync(path, "utf8");
      if (values.some((value) => text.includes(value)))
        throw new Error(`Private credential detected in public output: ${path}`);
      if (/sb_secret_[A-Za-z0-9_-]{20,}/.test(text))
        throw new Error(`Private Supabase key detected in ${path}`); // JWT service-role keys can also leak independently of the configured value.
      for (const token of text.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || []) {
        try {
          if (
            JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).role ===
            "service_role"
          )
            throw new Error(`Service-role token detected in ${path}`);
        } catch (error) {
          if (error.message.startsWith("Service-role")) throw error;
        }
      }
      files++;
    }
  }
}
scan(".output/public");
console.log(
  `Public bundle checked: ${files} files; no configured private credentials or service-role JWTs.`,
);
for (const name of [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
])
  console.log(`${name}: ${env[name] ? "configured locally" : "required on deployment host"}`);
