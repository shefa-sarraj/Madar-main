# Supabase release-gate security review

Date: 2026-10-18. Live project inspection; no grant changes applied yet.

## Scope and result

Reviewed the live definitions, effective anon/authenticated privileges, ACLs and
search paths of all 52 distinct flagged SECURITY DEFINER functions. Four are
trigger/event-trigger functions; 48 are intentional authenticated RPCs or boolean
permission helpers. No ordinary application RPC has anonymous execution rights.
No missing school/platform authorization check was identified in the reviewed
privileged callable operations. This is a scoped review, not a universal proof
against every possible application or database vulnerability.

All four trigger bindings are enabled. The platform guard covers school_members
and user_roles. Internal helpers, including recalc_student_fee,
settings_save_member_internal, settings_find_auth_user and
bootstrap_platform_super_admin, already deny anon/authenticated execution.
Neither anon nor authenticated can CREATE objects in public. Explicit search paths
are set on all flagged functions. Boolean helpers accept a user ID but do not
perform privileged mutations; mutating callers use auth.uid(), not a caller's
claimed user ID. Private helper definitions and delegated member-writer protections
were also inspected.

## Proposed exact grant changes

Approval pending. Preserve postgres/service_role and every application RPC grant.
These functions are not intended for direct application execution:

```sql
REVOKE EXECUTE ON FUNCTION public.capture_manager_signup_request() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_custom_role_deactivation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_platform_identity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
```

No blanket revocation is proposed for the 48 intentional authenticated functions.
No further grant removal from ordinary client roles was identified as necessary
by this inspection. Retain existing default-deny policies on the two internal
tables flagged as RLS-enabled without client policies.

## Function-by-function review

| Function signature | Class | Authorization / behavior reviewed |
| --- | --- | --- |
| `public.add_discount(uuid,text,discount_type,numeric,text)` | Application RPC | Fee's stored school; finance create permission; discount/balance/plan safeguards. |
| `public.apply_fee_structure(uuid)` | Application RPC | Structure's stored school; finance create permission; matching school/year enrollments. |
| `public.can_access_reports(uuid)` | Boolean permission helper | Current auth.uid(), school role/custom report permission and system override guard. |
| `public.can_manage_finance(uuid,uuid)` | Boolean permission helper | Boolean helper; delegates to same-school active-role checks using supplied user ID. Mutating callers bind that ID to auth.uid(). |
| `public.can_manage_school(uuid,uuid)` | Boolean permission helper | Boolean helper; delegates to same-school active-role checks using supplied user ID. Mutating callers bind that ID to auth.uid(). |
| `public.can_manage_staff(uuid,uuid)` | Boolean permission helper | Boolean helper; delegates to same-school active-role checks using supplied user ID. Mutating callers bind that ID to auth.uid(). |
| `public.can_manage_students(uuid,uuid)` | Boolean permission helper | Boolean helper; delegates to same-school active-role checks using supplied user ID. Mutating callers bind that ID to auth.uid(). |
| `public.can_mark_student_attendance(uuid,uuid,uuid)` | Boolean permission helper | Boolean helper; delegates to same-school active-role checks using supplied user ID. Mutating callers bind that ID to auth.uid(). |
| `public.can_view_finance(uuid,uuid)` | Boolean permission helper | Boolean helper; delegates to same-school active-role checks using supplied user ID. Mutating callers bind that ID to auth.uid(). |
| `public.can_view_staff(uuid,uuid)` | Boolean permission helper | Boolean helper; delegates to same-school active-role checks using supplied user ID. Mutating callers bind that ID to auth.uid(). |
| `public.can_view_structure(uuid,uuid)` | Boolean permission helper | Boolean helper; delegates to same-school active-role checks using supplied user ID. Mutating callers bind that ID to auth.uid(). |
| `public.can_view_student_attendance(uuid,uuid)` | Boolean permission helper | Boolean helper; delegates to same-school active-role checks using supplied user ID. Mutating callers bind that ID to auth.uid(). |
| `public.can_view_students(uuid,uuid)` | Boolean permission helper | Boolean helper; delegates to same-school active-role checks using supplied user ID. Mutating callers bind that ID to auth.uid(). |
| `public.cancel_payment(uuid,text)` | Application RPC | Payment's stored school; finance manage permission; existing allocations retained. |
| `public.capture_manager_signup_request()` | Trigger | Auth signup trigger; metadata creates only a pending request, not roles or membership. |
| `public.convert_admission_application(uuid,uuid)` | Application RPC | Application's stored school; admission manage + student create; accepted state; related section same school/year/grade; scoped guardian reuse. |
| `public.deactivate_discount(uuid)` | Application RPC | Discount's stored school; finance manage; plan restriction; recalculation/audit. |
| `public.guard_custom_role_deactivation()` | Trigger | School-role trigger; prevents deactivation with active assignments. |
| `public.guard_platform_identity()` | Trigger | Membership/role triggers; rejects fixed Super Admin school membership and super_admin school role. |
| `public.has_custom_module_permission(uuid,uuid,text,text)` | Boolean permission helper | Active membership; same-school assignments/roles; boolean permission lookup. |
| `public.has_platform_permission(uuid,text)` | Boolean permission helper | Fixed Super Admin identity plus explicit permission row; boolean only. |
| `public.has_role(uuid,uuid,app_role)` | Boolean permission helper | Active same-school membership and active school; excludes super_admin school role. |
| `public.has_system_module_permission(uuid,uuid,text,text)` | Boolean permission helper | Fixed Super Admin or active same-school role/override; boolean only. |
| `public.is_school_member(uuid,uuid)` | Boolean permission helper | Active membership and active school; boolean only. |
| `public.is_super_admin(uuid)` | Boolean permission helper | Protected platform identity row plus fixed Auth email; boolean only. |
| `public.platform_assign_administrator(uuid,uuid,app_role)` | Application RPC | Current auth.uid() platform manage_schools; existing target; identity trigger rejects Super Admin school role. |
| `public.platform_create_school(uuid,jsonb,school_status)` | Application RPC | Current auth.uid() platform create_school before writes. |
| `public.platform_list_users()` | Application RPC | All returned rows require current auth.uid() manage_platform_users. |
| `public.platform_save_school(uuid,boolean,jsonb,school_status,uuid,app_role)` | Application RPC | Current auth.uid() create_school/manage_schools; same-school writes; initial admin only on creation; identity trigger. |
| `public.platform_save_user_permissions(uuid,text[])` | Application RPC | Fixed Super Admin only; cannot edit self or grant delegated platform permissions. |
| `public.record_asset_event(uuid,asset_event_type,date,text,uuid,asset_condition,text)` | Application RPC | Current auth.uid(); stored asset school; manage permission; same-school active employee; guarded transition/history. |
| `public.record_payment(uuid,numeric,payment_method,date,text,text,jsonb)` | Application RPC | Student's stored school; finance create; every allocation same student/school/year; balance limits. |
| `public.refresh_finance_statuses(uuid)` | Application RPC | Current auth.uid() finance view permission; recalculates only requested authorized school. |
| `public.review_school_manager_request(uuid,boolean,text,uuid)` | Application RPC | Fixed Super Admin before request lookup/write; verified applicant; rejects Super Admin applicant; guarded platform delegates. |
| `public.rls_auto_enable()` | Event trigger | DDL event trigger; pg_catalog search path; enables RLS for public tables only. |
| `public.set_installment_plan(uuid,text,jsonb)` | Application RPC | Stored fee school; finance edit; remaining balance; immutable paid-allocation history. |
| `public.settings_cancel_auth_deletion(uuid)` | Application RPC | Fixed Super Admin; only own deletion reservation for target. |
| `public.settings_link_employee(uuid,uuid,uuid)` | Application RPC | Current auth.uid() school management; target membership and employee in same school. |
| `public.settings_my_system_permissions(uuid)` | Application RPC | Current auth.uid() roles and active membership scoped to requested school. |
| `public.settings_provision_school_user(uuid,uuid,app_role[],uuid[],uuid)` | Application RPC | Delegates to guarded member-role save and guarded employee-link RPCs atomically. |
| `public.settings_reassign_custom_role(uuid,uuid,uuid)` | Application RPC | Current auth.uid() school management; source and active replacement in same school. |
| `public.settings_remove_school_user(uuid,uuid,boolean)` | Boolean permission helper | School management; no self/platform removal; protected administrator/last-owner rules; Auth deletion platform-only. |
| `public.settings_rollover_preview(uuid,uuid)` | Application RPC | Current auth.uid() school management; source year and every returned structure/student row school-scoped. |
| `public.settings_rollover_year(uuid,uuid,uuid,text,date,date,text,jsonb)` | Application RPC | Current auth.uid() school management; locks/rechecks; guarded preview; version/idempotency/school/placement validation. |
| `public.settings_save_member(uuid,uuid,app_role[],member_status)` | Application RPC | School management; no super_admin role; guarded internal writer. |
| `public.settings_save_member_roles(uuid,uuid,app_role[],uuid[],member_status,boolean)` | Application RPC | School management; same-school roles/membership; guarded internal writer protects administrators/last owner. |
| `public.settings_save_role(uuid,uuid,text,text,boolean,jsonb)` | Application RPC | School management; role update scoped by school; protected system IDs cannot be updated as custom role. |
| `public.settings_save_school(uuid,jsonb,jsonb)` | Application RPC | School management; profile/settings updates only for authorized school. |
| `public.settings_save_system_role(uuid,app_role,jsonb)` | Application RPC | School management; owner/super_admin protected; managers cannot edit manager scope; administrative modules protected. |
| `public.settings_save_year(uuid,uuid,text,date,date,academic_year_status,boolean)` | Application RPC | School management; referenced year and activation changes scoped to authorized school. |
| `public.shares_school_with(uuid,uuid)` | Boolean permission helper | Boolean relationship lookup only; no row payload or write. |
| `public.submit_school_manager_request(text,text,app_role)` | Application RPC | Current signed-in non-platform applicant; creates request only for auth.uid(). |

## Leaked-password protection

The live security advisor reports this disabled. It is a project-level Supabase
Auth setting, not an application migration. An authorized project administrator
should enable it in Auth settings if the plan supports it (Pro and above).
No Auth settings were changed during this review.

Sources:
- [Supabase password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
- [SECURITY DEFINER anonymous grants advisor](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
- [SECURITY DEFINER authenticated grants advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- [PostgreSQL trigger privilege documentation](https://www.postgresql.org/docs/current/sql-createtrigger.html)

## Live verification status

Pending real normal-user, Super Admin and active multi-school browser handoffs.
The existing second verification school is suspended and was not changed.

