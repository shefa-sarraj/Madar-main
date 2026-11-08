const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

test("Settings and custom module authorization against PostgreSQL", async () => {
  const modulePath = process.env.MADAR_PGLITE_MODULE;
  assert.ok(modulePath, "Set MADAR_PGLITE_MODULE to the installed PGlite module path");
  const { PGlite } = await import(pathToFileURL(modulePath).href);
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE SCHEMA storage;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb,email_confirmed_at timestamptz);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      $$;
      GRANT USAGE ON SCHEMA auth TO authenticated,anon;
      CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,
        file_size_limit bigint,allowed_mime_types text[]);
      CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA storage TO authenticated;
      GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
      CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
        SELECT string_to_array($1,'/')
      $$;
    `);
    const directory = path.join(__dirname, "../supabase/migrations");
    for (const file of fs
      .readdirSync(directory)
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      try {
        await db.exec(fs.readFileSync(path.join(directory, file), "utf8"));
      } catch (error) {
        throw new Error(`Migration ${file}: ${error.message}`, { cause: error });
      }
    }
    for (const file of [
      "settings_administration.sql",
      "custom_module_authorization.sql",
      "custom_finance_authorization.sql",
      "academic_year_rollover.sql",
      "multi_school_administration.sql",
      "complete_school_user_administration.sql",
      "system_role_permissions.sql",
    ]) {
      await db.exec(fs.readFileSync(path.join(__dirname, "../supabase/tests", file), "utf8"));
    }

    await db.exec(
      fs.readFileSync(
        path.join(__dirname, "../supabase/tests/fixed_platform_hierarchy.sql"),
        "utf8",
      ),
    );
  } finally {
    await db.close();
  }
});
