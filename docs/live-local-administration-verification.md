# Live Local Administration Verification

Verified 2026-10-10 against `http://127.0.0.1:5175` and the linked live Supabase project.
Deployment was not performed. No migration was modified or applied by this verification.

## Passed

- Migration `20261010170000` is recorded as applied; its permission RPC exists.
- Existing owner, manager, accountant, registrar, HR, storekeeper, and teacher
  authorization remains valid. Teacher assignment limits remain intact.
- The real local login page authenticates a temporary school owner. Platform Admin
  redirects that school owner and a normal school account to the school dashboard.
- Staff saves an employee without a login. Enabled access generates a transient
  password, creates a real Auth account and accountant membership, and links the
  employee automatically. Real Auth sign-in succeeds.
- The real Permissions UI saves an accountant matrix revoking expense access and
  granting inventory creation. Real authenticated REST requests and module controls
  enforce those changes. Foreign-school reads/writes remain denied.
- Users edits the linked account from accountant to HR; the scoped stored role matches.
- Live authenticated RPC calls reject manager-to-owner escalation, unrelated-school
  edits, last-owner demotion/suspension, and platform privilege grants.
- Rollback-only live SQL checks also reject cross-school employee links and protected
  role edits, while preserving baseline registrar/HR/storekeeper operations.
- Platform identity remains exactly one fixed account, `super.madar@gmail.com`,
  with zero school memberships or school roles.
- Recovery-token verification and the local reset form succeed. The old temporary
  password is rejected and the replacement password authenticates successfully.
- The local recovery callback is allowlisted. Users' real reset-email action is
  accepted by Supabase for `mhmoudtariq172+madar-test@gmail.com`.

## Fix

Disabled Staff's Add Employee button while its query is pending/failed. Clicking
before departments loaded previously opened department setup incorrectly.

## Cleanup And Limits

Two temporary schools and three temporary Auth accounts were removed after each
completed live run. A separate live database check confirmed zero temporary schools,
Auth accounts, or rollback fixtures remained. Existing school data/memberships and
platform identity were not changed. Only verification code and the Staff loading
button guard were added/changed in this phase.

Inbox receipt remains unconfirmed. The connected Gmail account is not the specified
test inbox, so it was not searched. The test Auth account was removed after recovery
verification; its emailed link is no longer valid. Confirm receipt only.

The opt-in runner is `tests/live-local-administration.cjs`; it requires
`MADAR_RUN_LIVE_CHECKS=1`, Playwright, and the private local Supabase configuration.
It never stores/logs temporary passwords, sessions, or private keys. It refuses to
replace an existing account at the test email address. Real-data fixtures exist
only in newly-created, uniquely named verification schools and are cleaned up.
