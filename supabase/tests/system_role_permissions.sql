-- Disposable database only. All fixtures and permission edits roll back.
BEGIN;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('12000000-0000-0000-0000-000000000001','matrix-owner@example.invalid','{}'),
 ('12000000-0000-0000-0000-000000000002','matrix-accountant@example.invalid','{}'),
 ('12000000-0000-0000-0000-000000000003','matrix-manager@example.invalid','{}'),
 ('12000000-0000-0000-0000-000000000004','matrix-teacher@example.invalid','{}');
INSERT INTO public.schools(id,name_ar) VALUES
 ('22000000-0000-0000-0000-000000000001','Matrix school'),
 ('22000000-0000-0000-0000-000000000002','Foreign matrix school');
INSERT INTO public.school_members(school_id,user_id,status)
 SELECT '22000000-0000-0000-0000-000000000001',id,'active'::public.member_status
 FROM auth.users WHERE id::text LIKE '12000000-%';
INSERT INTO public.user_roles(school_id,user_id,role) VALUES
 ('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001','school_owner'),
 ('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000002','accountant'),
 ('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000003','school_manager'),
 ('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000004','teacher');
INSERT INTO public.expense_categories(school_id,name) VALUES
 ('22000000-0000-0000-0000-000000000001','Own category'),
 ('22000000-0000-0000-0000-000000000002','Foreign category');
INSERT INTO public.inventory_categories(school_id,name) VALUES
 ('22000000-0000-0000-0000-000000000001','Own inventory'),
 ('22000000-0000-0000-0000-000000000002','Foreign inventory');
-- Default role behavior is unchanged until a school explicitly edits it.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000002',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.expense_categories)<>1 THEN RAISE EXCEPTION 'Baseline expense tenant scope failed'; END IF;
 IF public.settings_my_system_permissions('22000000-0000-0000-0000-000000000001')<>'{}'::jsonb THEN RAISE EXCEPTION 'Baseline defaults unexpectedly overridden'; END IF;
END $$;
RESET ROLE;
-- Build complete matrices using the same database defaults, then revoke finance
-- and explicitly add a previously unavailable inventory mutation.
INSERT INTO public.school_system_role_permissions(school_id,role,module,can_view,can_create,can_edit,can_manage)
 SELECT '22000000-0000-0000-0000-000000000001','accountant',module,
 private.default_role_permission('accountant',module,'view'),
 private.default_role_permission('accountant',module,'create'),
 private.default_role_permission('accountant',module,'edit'),
 private.default_role_permission('accountant',module,'manage')
 FROM unnest(ARRAY['students','admissions','classes','fees','expenses','student_attendance','staff_attendance',
 'employees','inventory','assets','tasks','cases','reports','settings','users']) module;
UPDATE public.school_system_role_permissions SET can_view=false,can_create=false,can_edit=false,can_manage=false
 WHERE module IN ('fees','expenses','reports');
UPDATE public.school_system_role_permissions SET can_view=true,can_create=true,can_edit=true,can_manage=true WHERE module='inventory';
SET LOCAL ROLE authenticated;
DO $$
DECLARE rejected boolean:=false;
BEGIN
 IF EXISTS(SELECT 1 FROM public.expense_categories) THEN RAISE EXCEPTION 'Revoked legacy finance read survived RLS'; END IF;
 IF public.can_access_reports('22000000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'Revoked definer report permission survived'; END IF;
 BEGIN INSERT INTO public.expense_categories(school_id,name) VALUES('22000000-0000-0000-0000-000000000001','Denied');
 EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Revoked finance creation survived RLS'; END IF;
 INSERT INTO public.inventory_categories(school_id,name) VALUES('22000000-0000-0000-0000-000000000001','Explicit new grant');
 IF (SELECT count(*) FROM public.inventory_categories)<>2 THEN RAISE EXCEPTION 'Explicit inventory grant or tenant isolation failed'; END IF;
 IF public.has_custom_module_permission(auth.uid(),'22000000-0000-0000-0000-000000000002','inventory','create')
 OR public.settings_my_system_permissions('22000000-0000-0000-0000-000000000002')<>'{}'::jsonb THEN RAISE EXCEPTION 'Foreign school permission leak'; END IF;
 IF (public.settings_my_system_permissions('22000000-0000-0000-0000-000000000001')->'expenses'->>'view')::boolean
 THEN RAISE EXCEPTION 'Effective matrix did not include revocation'; END IF;
 rejected:=false;
 BEGIN PERFORM public.settings_save_system_role('22000000-0000-0000-0000-000000000001','accountant','[]');
 EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Ordinary user gained permission administration'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000001',true);
DO $$
DECLARE matrix jsonb; rejected boolean; protected_role public.app_role;
BEGIN
 SELECT jsonb_agg(jsonb_build_object('module',module,'can_view',can_view,'can_create',can_create,'can_edit',can_edit,'can_manage',can_manage))
 INTO matrix FROM public.school_system_role_permissions WHERE role='accountant';
 PERFORM public.settings_save_system_role('22000000-0000-0000-0000-000000000001','accountant',matrix);
 FOREACH protected_role IN ARRAY ARRAY['school_owner','super_admin']::public.app_role[] LOOP
  rejected:=false;
  BEGIN PERFORM public.settings_save_system_role('22000000-0000-0000-0000-000000000001',protected_role,matrix);
  EXCEPTION WHEN OTHERS THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Protected role % was editable',protected_role; END IF;
 END LOOP;
 rejected:=false;
 BEGIN PERFORM public.settings_save_system_role('22000000-0000-0000-0000-000000000002','accountant',matrix);
 EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Owner edited unrelated school'; END IF;
 SELECT jsonb_agg(CASE WHEN entry->>'module'='users' THEN entry||'{"can_view":true,"can_create":true,"can_edit":true,"can_manage":true}'::jsonb ELSE entry END)
 INTO matrix FROM jsonb_array_elements(matrix) entry;
 rejected:=false;
 BEGIN PERFORM public.settings_save_system_role('22000000-0000-0000-0000-000000000001','accountant',matrix);
 EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Administrative scope escalation succeeded'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.school_system_role_permissions WHERE module='inventory' AND can_create)
 THEN RAISE EXCEPTION 'Rejected matrix did not roll back atomically'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000003',true);
DO $$ DECLARE rejected boolean:=false; BEGIN
 BEGIN PERFORM public.settings_save_system_role('22000000-0000-0000-0000-000000000001','school_manager','[]');
 EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Manager changed own protected authority'; END IF;
 IF public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Manager gained platform identity'; END IF;
END $$;
RESET ROLE;
-- Saving a teacher's default matrix must not broaden assignment-scoped permissions.
INSERT INTO public.school_system_role_permissions(school_id,role,module,can_view,can_create,can_edit,can_manage)
 SELECT '22000000-0000-0000-0000-000000000001','teacher',module,
 private.default_role_permission('teacher',module,'view'),private.default_role_permission('teacher',module,'create'),
 private.default_role_permission('teacher',module,'edit'),private.default_role_permission('teacher',module,'manage')
 FROM unnest(ARRAY['students','admissions','classes','fees','expenses','student_attendance','staff_attendance',
 'employees','inventory','assets','tasks','cases','reports','settings','users']) module;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000004',true);
DO $$ BEGIN
 IF public.has_custom_module_permission(auth.uid(),'22000000-0000-0000-0000-000000000001','student_attendance','create')
 OR public.has_custom_module_permission(auth.uid(),'22000000-0000-0000-0000-000000000001','cases','view')
 THEN RAISE EXCEPTION 'Default teacher matrix broadened row scope'; END IF;
END $$;
RESET ROLE;
UPDATE public.school_members SET status='suspended' WHERE user_id='12000000-0000-0000-0000-000000000002';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000002',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.inventory_categories) THEN RAISE EXCEPTION 'Suspended member retained explicit grants'; END IF;
END $$;
ROLLBACK;