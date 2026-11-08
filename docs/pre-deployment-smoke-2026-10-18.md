# Pre-deployment smoke test: 2026-10-18

Environment: local app on localhost:8080, connected live Supabase project.
No deployment, migrations, school-status changes, permission grants, or saved
student/attendance/financial records were performed during this smoke test.
The approved password-recovery test email was submitted once.

## Automated checks

- Full TypeScript, ESLint, production build and 66 Node tests passed again after
  the redirect fix (zero skipped tests).
- ESLint reported 12 existing Fast Refresh warnings and zero errors.
- The PostgreSQL authorization suite ran against local PGlite, not the live DB.
- Additional local rollback SQL passed for full/partial payments, optional plans,
  remaining-balance limits, overpayment rejection, allocation/cancellation history
  and unauthorized finance operations.
- Source secret scan: 249 tracked/unignored text files, zero detected private keys.
- Production bundle scan: 110 public files, no configured private credentials or
  service-role JWTs. Local environment configuration checks passed.
- All 19 required routes exist and are registered in the generated route tree.
- The standalone mocked Playwright script was not run; live checks used the
  supported Codex browser tool. Automated checks are not a complete live UAT pass.

## Live browser checks

- Existing Super Admin session: dashboard, create-school wizard, school actions,
  administrator-assignment dialog, and platform access to school settings opened.
  No request was pending, so approve/reject was not exercised.
- Restored owner session: school dashboard loaded with active year and data.
- Students: 32 results, second page 26-32, search returned the two retained UX1410
  test students and reset to page one. No student was saved.
- Mobile student wizard: all four steps, existing guardian selection, enrollment
  selection, review, Arabic upload buttons, and multiple document rows rendered.
  No document upload or student creation was submitted.
- Admissions: existing new/review/accepted/enrolled/rejected records displayed.
  Retained converted UX1410 students appeared in Students. Conversion was not
  performed again during this run.
- Classes, Finance, Expenses, Staff, both Attendance pages, Inventory, Assets,
  Tasks, Cases, Reports and Settings route shells opened on desktop.
- Finance tabs opened. A fully paid fee showed total 75, paid 75, remaining 0,
  planning maximum 0, and an explicit installment restriction.
- Employee and asset wizards, case wizard and task form opened without saves.
- Inventory stock-issue dialog and asset history opened with existing data.
- Task details displayed the linked student and existing comment history.
- Staff attendance Save was initially disabled; bulk Present produced 11 unsaved
  changes and an enabled Save. The draft was discarded without saving.
- Reports displayed student rows, CSV/print controls, grouped report selection,
  and pagination. Actual download/print output was not verified.
- Settled mobile Admissions displayed 11 applications; Finance displayed 16
  payments and five student/fee-targeted discounts. Settings and its protected
  owner permission matrix rendered without document overflow; its header is sticky.
- Owner has one available school: selector correctly returned to its dashboard.
  An account with multiple active memberships exists in DB, but interactive
  switching was not verified in this session.
- At 390px, sampled rendered pages and the student wizard had no document-level
  horizontal overflow. The full mobile route sweep included loading states and
  is not a settled-data pass for every module.
- Recovery request displayed the generic email-confirmation screen. Inbox
  delivery, link opening and password replacement were not verified.
- Owner logout returned both open app tabs to the login page.

## Blocking issue fixed

Opening /platform as the owner redirected to /dashboard but reproducibly left a
blank page with a React MatchInnerImpl error. Platform/school boundary redirects
now use reloadDocument while preserving their authorization checks/destinations.
Two owner denial retests rendered the dashboard without a new console error.
Routing regression tests now assert the document redirect. The opposite direction
is unit-tested but still needs a post-fix live Super Admin retest.

## Live database integrity and security

Read-only aggregate queries returned:

- Public tables without RLS: 0.
- Invalid fee balances: 0; paid fees with nonzero balance: 0.
- Payment/allocation total mismatches: 0.
- Cross-school or wrong-student allocation links: 0.
- Cross-school admission-to-student links: 0.
- Duplicate active/pending enrollment per student/year: 0.

These checks do not replace restricted-user RLS probes across every module.
Supabase security advisors reported warnings, not a clean security sign-off:

- [Leaked-password protection is disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- [Anonymous SECURITY DEFINER execute grants](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
  were flagged for four trigger/event-trigger functions. Catalog inspection
  confirmed those return types; these are not ordinary callable RPC functions.
  Grant hardening remains a separate review item.
- [Authenticated SECURITY DEFINER functions](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
  are also flagged, including deliberately permission-checked application RPCs.
  Do not revoke all grants indiscriminately. Authorization tests passed locally.
- Two internal tables have RLS with no client policies (default-deny).

## Remaining release gates

- Normal school-user login, restricted-module access and platform denial.
- Post-fix Super Admin redirect; real multi-school switching/isolation session.
- Controlled live writes for platform requests/status/administrator provisioning,
  admission/guardian/conversion workflows, attendance and operational workflows.
- Settled-data mobile checks on every module and actual CSV/print output.
- Recovery email delivery and human-completed password reset.
- Security-advisor disposition, production host secrets, HTTPS, Auth Site URL and
  allowed redirects. Production URL checks are intentionally postponed.

Ready to deploy: No. No deployment was attempted.
