# Employee System Access

Employee creation and editing in Staff is the only new-account workflow. An employee
can have no login, a newly provisioned login, or an existing same-school account.
Users manages existing memberships, roles, status, password-reset emails, and the
read-only employee link. Passwords remain transient and are cleared on dismissal.

## Deployment Order

1. Review and apply `20261010170000_school_system_role_permissions.sql` before
   deploying the frontend/server bundle. No existing migrations were changed.
2. Deploy the tested bundle. The permission fetch fails closed if the new RPC is
   unavailable, so deploying the bundle first can hide school module controls.
3. Smoke-test Staff account creation/linking, Users password reset, and role edits
   with school-scoped accounts. Isolated/mock verification does not create real
   Auth accounts or prove email delivery.

The migration is transactional, preserves existing rows and memberships, and only
changes effective system-role behavior after a complete matrix is explicitly saved.
School owner and platform roles cannot be customized. Administrative authority is
not a configurable module grant; a manager cannot customize school-manager authority.
Legacy teacher assignment scopes remain in place. Independent custom-role grants
still combine with system-role permissions. Platform Super Admin behavior is unchanged.

## Isolated Verification

Set `MADAR_PGLITE_MODULE` to the installed PGlite module, then run:

```sh
node --test tests/*.test.cjs
npx tsc --noEmit
npm run lint
npm run build
node scripts/check-production-bundle.mjs
```

The PostgreSQL tests apply migrations to a disposable in-memory database. Each SQL
fixture rolls back. No production database migration has been applied by this phase.
