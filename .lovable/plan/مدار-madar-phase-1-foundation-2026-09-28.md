# مدار | Madar — Phase 1: Foundation

Arabic-first (RTL) school operations platform. This phase builds only the base: brand design system, login, roles, multi-school data foundation, and the app shell with an empty-state dashboard. No student, finance, attendance, inventory, staff or report features yet.

## What you will get

**Login and access**
- Arabic login page and forgot-password page, with the Madar logo and brand styling.
- Sessions stay signed in; a sign-out action in the profile menu.
- No public sign-up — accounts are created by an administrator.
- After login: if the person belongs to one school they go straight in; if several, a school picker appears first.

**Application shell**
- Right-side navy sidebar with all 15 sections (الرئيسية، الطلاب، التسجيل والقبول، الصفوف والشعب، الأقساط والمدفوعات، المصروفات، الموظفون، حضور الطلاب، حضور الموظفين، المخزون، الأصول، المهام، الشكاوى والملاحظات، التقارير، الإعدادات), each with a consistent icon, collapsible on smaller screens.
- Top bar: page title, global search box (visual only for now), notifications bell with panel, academic-year selector, user profile dropdown.
- Every section except the dashboard shows a clean "coming soon / no data yet" placeholder page so navigation never breaks.

**Dashboard**
- Stat cards for إجمالي الطلاب، الحضور اليوم، التحصيل هذا الشهر، الأقساط المتأخرة، المصروفات، الموظفون، التنبيهات — all showing real empty states ("لا توجد بيانات بعد"), no invented numbers.
- Sections: نظرة مالية، الحضور اليوم، الإجراءات المطلوبة، آخر الأنشطة — all in empty state.

**Design system**
- Navy #173A5E / #2F5F8F, champagne gold #D4AF6B used only as a restrained accent, warm white and light gray surfaces, brand text and status colors as specified.
- IBM Plex Sans Arabic typography, full RTL, consistent radius/spacing/shadows.
- Buttons: navy primary, white-with-border secondary, gold reserved for key accents.
- Reusable components: AppShell, Sidebar, Topbar, PageHeader, StatCard, DataTable, EmptyState, StatusBadge, ConfirmDialog, FormField, Drawer, Modal, FilterBar.

## Data and security

Lovable Cloud will be enabled to provide the database, accounts and storage.

Tables: `schools`, `profiles`, `school_members`, `academic_years`, `school_settings`, `notifications`, `audit_logs`, plus a separate `user_roles` table using an app_role type (super_admin, school_owner, school_manager, accountant, registrar, hr, teacher, store_keeper).

Every table is protected so a person can only read or write data for schools they are a member of; super admins can reach all schools. Roles are stored separately from profiles so they cannot be tampered with from the browser. Route hiding in the interface is only cosmetic — the database rules are the real protection.

## Technical notes

- Roles live in `user_roles` (scoped by `school_id`) with a `security definer` `has_role(_user_id, _school_id, _role)` helper to avoid recursive RLS; a `is_school_member()` helper backs the tenant policies.
- Every new table gets explicit GRANTs to `authenticated` / `service_role` alongside RLS enablement.
- `profiles` auto-created on signup via an `auth.users` trigger.
- Routes: `/` (login), `/forgot-password`, `/reset-password`, `/select-school`, and the protected `_authenticated` subtree holding `/dashboard` plus the 14 module placeholder routes; each route defines its own head metadata.
- Active school and academic year kept in a lightweight React context backed by local storage, validated against `school_members` on load.
- Font loaded via `<link>` in the root route; brand tokens defined as oklch values in `src/styles.css`, `dir="rtl"` set on the html element.
- Logo added as a Lovable asset from your upload.

## Manual setup after this phase

The first super admin account must be created by hand (add the user in Cloud, then grant `super_admin`) and the first school row inserted — there is deliberately no public registration.
