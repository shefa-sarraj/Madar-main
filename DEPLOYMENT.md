# Production Deployment

Deploy the TanStack Start server output, not only the static assets. The app has authenticated server functions. Build with `npm run build` (Node 22+). The current Nitro preset is `cloudflare-module`: deploy the generated Worker and public assets through the existing Lovable integration or `npx nitro deploy --prebuilt`. Do not run this Worker output as a standalone Node server. Keep private settings in the deployment secret store; verify they are supplied to the Worker server runtime.

## Environment

Build-time public configuration:

- `VITE_SUPABASE_URL`: the production project's HTTPS URL.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: its public publishable/anon key. Never use a service-role key here.

Private server runtime configuration:

- `SUPABASE_URL`: same production project URL.
- `SUPABASE_PUBLISHABLE_KEY`: the public key, used by authenticated server middleware.
- `SUPABASE_SERVICE_ROLE_KEY`: private admin key, supplied only through the hosting secret store.

Only when scheduled jobs are enabled: `LOVABLE_CRON_SECRET`; optionally `LOVABLE_CRON_SECRET_PREVIOUS` during rotation. Bootstrap password variables are one-time administration inputs, not deployment settings.

Never prefix private secrets with `VITE_`. Do not commit `.env.local`, bootstrap passwords, or private keys. Rebuild when public build-time settings change. Configure Supabase Auth Site URL and allowed redirects for the production HTTPS origin (including password-reset callbacks). Keep existing RLS and private storage policies enabled.

## Release Gates

- `npx tsc --noEmit`
- `npm run lint` (existing Fast Refresh warnings are nonblocking)
- `node --test tests/*.test.cjs` (SQL authorization tests need `MADAR_PGLITE_MODULE` pointing to an installed `@electric-sql/pglite` module)
- `node tests/platform-ui.cjs` against a running app; requires Playwright and optionally `MADAR_BROWSER_EXECUTABLE`. Uses mocked API fixtures, never live school mutations.
- `npm run build`
- `node scripts/check-production-bundle.mjs`

Confirm the environment on the deployment host, TLS, and Auth redirect URLs before publishing. Smoke-test real Super Admin login, a school-manager login, and password recovery after deployment. Migrations and Auth bootstrap are already handled separately; this UI release must not rerun them.
