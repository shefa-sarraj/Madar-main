# Multi-School Administration Verification

## Setup Completed

- Configured `SUPABASE_SERVICE_ROLE_KEY` in ignored `.env.local`, using the authenticated Supabase CLI. No `VITE_` secret was added.
- The existing `.env` provides `SUPABASE_URL`. Vite now loads approved private variables into the local server process using the selected mode.
- Applied `20261008120000_complete_school_user_administration.sql`; no old migrations were edited.
- Local app: http://localhost:8080/settings. Keep the existing `localhost` browser origin to retain its signed-in session.

For another local checkout, add `SUPABASE_SERVICE_ROLE_KEY=<project service-role key>` to `.env.local`, then restart `npm run dev`. Set `SUPABASE_URL` there too if it is not already provided. Production environments must provide both variables at server runtime.

## Verified

- Focused server/UI/workspace tests and PostgreSQL migration/RLS tests.
- The new rollback-only SQL tests also passed against the linked live database.
- Live direct Auth creation using the actual provisioning handler, profile upsert, school membership and custom-role assignment.
- Real test-user sign-in, custom permission enforcement, deactivate/reactivate, and foreign-school/year read isolation.
- The authenticated owner context was exercised through the database; browser-session middleware and UI clicks were not exercised by this live runner.
- Current owner `mhmoudtariq172@gmail.com` now has active owner membership in the original school and `Madar Multi-School Verification`.
- Last-owner protection, platform-only school operations, atomic employee linking, cross-school link rejection and multi-school-safe removal passed live rollback-only DB tests.
- Named test Auth account `mhmoudtariq172+madar-role-test@gmail.com` and its temporary custom role were removed after verification. No real owner account was removed or downgraded.
- A credential-free SQL verification actor was used only inside one bootstrap transaction and deleted before commit. No permanent platform privileges were assigned.
- The actual private key was absent from generated client and server output.

## Remaining Manual Checks

1. Refresh the signed-in owner at `/settings`. Open the account menu, choose `تبديل المدرسة`, select `Madar Multi-School Verification`, then switch back to the original school. Confirm each school's students and academic years remain separate. Workspace transition behavior is covered by automated tests; browser automation is unavailable on this machine.
2. Specify the intended platform Super Admin account. The live database currently has none; school owners intentionally cannot access platform school creation/assignment. No real account was elevated automatically.

Once a platform administrator is designated, its Settings `إدارة المدارس` tab provides `إنشاء مدرسة`, `تعيين مسؤول` (existing/new account), and `فتح المدرسة` for every school.

## Files Changed In This Pass

- `vite.config.ts`
- `src/integrations/supabase/client.server.ts`
- `src/lib/administration-error.server.ts`
- `src/lib/settings.functions.ts`
- `src/lib/school-administration.functions.ts`
- `src/lib/school-administration.ts`
- `src/components/app/platform-schools.tsx`
- `src/components/app/school-administrator-modal.tsx`
- `src/components/app/school-user-administration.tsx`
- `src/routes/_authenticated/settings.tsx`
- `supabase/migrations/20261008120000_complete_school_user_administration.sql`
- `supabase/tests/complete_school_user_administration.sql`
- `tests/administration-environment.test.cjs`
- `tests/live-school-administration.cjs` (explicit opt-in only)
- `tests/settings-user-creation.test.cjs`
- `tests/school-administration.test.cjs`
- `tests/settings-authorization.test.cjs`
- `tests/temporary-password.test.cjs`
- This verification document.
- `.env.local` (ignored, private local configuration only)
