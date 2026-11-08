BEGIN;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('c1000000-0000-0000-0000-000000000001','super.madar@gmail.com','{}'),
 ('c1000000-0000-0000-0000-000000000002','owner-complete@example.invalid','{}'),
 ('c1000000-0000-0000-0000-000000000003','user-complete@example.invalid','{}'),
 ('c1000000-0000-0000-0000-000000000004','delete-complete@example.invalid','{}');
INSERT INTO public.platform_user_permissions(user_id,permission) VALUES ('c1000000-0000-0000-0000-000000000001','create_school'),('c1000000-0000-0000-0000-000000000001','manage_schools'),('c1000000-0000-0000-0000-000000000001','manage_platform_users');
UPDATE auth.users SET email_confirmed_at=now() WHERE id='c1000000-0000-0000-0000-000000000001';
SELECT public.bootstrap_platform_super_admin('c1000000-0000-0000-0000-000000000001');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-000000000001',true);
SELECT public.platform_create_school('c2000000-0000-0000-0000-000000000001','{"name_ar":"Complete A","currency":"USD","timezone":"Asia/Jerusalem"}','active');
SELECT public.platform_create_school('c2000000-0000-0000-0000-000000000002','{"name_ar":"Complete B","currency":"USD","timezone":"Asia/Jerusalem"}','active');
SELECT public.platform_assign_administrator('c2000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000002','school_owner');
SELECT public.platform_assign_administrator('c2000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000002','school_manager');
-- Repeated assignment must be idempotent and must not replace other roles.
SELECT public.platform_assign_administrator('c2000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000002','school_manager');
DO $$ DECLARE rejected boolean:=false; BEGIN
 BEGIN PERFORM public.settings_remove_school_user('c2000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000002',false); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Last owner removed'; END IF;
END $$;
RESET ROLE;
INSERT INTO public.employees(id,school_id,employee_number,full_name,job_title) VALUES
 ('c3000000-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000001','CA1','Employee A','Teacher'),
 ('c3000000-0000-0000-0000-000000000002','c2000000-0000-0000-0000-000000000002','CB1','Employee B','Teacher');
UPDATE auth.users SET email_confirmed_at=now() WHERE id='c1000000-0000-0000-0000-000000000001';
SELECT public.bootstrap_platform_super_admin('c1000000-0000-0000-0000-000000000001');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-000000000002',true);
DO $$ DECLARE rejected boolean; a uuid:='c2000000-0000-0000-0000-000000000001'; b uuid:='c2000000-0000-0000-0000-000000000002'; u uuid:='c1000000-0000-0000-0000-000000000003'; BEGIN
 IF (SELECT count(*) FROM public.school_members WHERE user_id=auth.uid() AND status='active')<>2 OR NOT public.has_role(auth.uid(),a,'school_owner') OR NOT public.has_role(auth.uid(),b,'school_manager') OR public.has_role(auth.uid(),b,'school_owner') THEN RAISE EXCEPTION 'Multi-school assignments failed'; END IF;
 rejected:=false;
 BEGIN PERFORM public.platform_assign_administrator(b,u,'school_owner'); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Owner gained platform assignment'; END IF;
 rejected:=false;
 BEGIN PERFORM public.platform_create_school('c2000000-0000-0000-0000-000000000003','{"name_ar":"Forbidden","currency":"USD","timezone":"Asia/Jerusalem"}','active'); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Owner gained platform creation'; END IF;
 rejected:=false;
 BEGIN PERFORM public.settings_provision_school_user(a,u,ARRAY['teacher']::public.app_role[],ARRAY[]::uuid[],'c3000000-0000-0000-0000-000000000002'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected OR EXISTS(SELECT 1 FROM public.school_members WHERE school_id=a AND user_id=u) THEN RAISE EXCEPTION 'Cross-school linking did not roll back membership'; END IF;
 PERFORM public.settings_provision_school_user(a,u,ARRAY['teacher']::public.app_role[],ARRAY[]::uuid[],'c3000000-0000-0000-0000-000000000001');
 IF NOT EXISTS(SELECT 1 FROM public.school_user_employee_links WHERE school_id=a AND user_id=u) THEN RAISE EXCEPTION 'Atomic employee link missing'; END IF;
 PERFORM public.settings_save_member_roles(a,u,ARRAY['teacher']::public.app_role[],ARRAY[]::uuid[],'suspended');
 IF public.is_school_member(u,a) THEN RAISE EXCEPTION 'Deactivation failed'; END IF;
 PERFORM public.settings_save_member_roles(a,u,ARRAY['teacher']::public.app_role[],ARRAY[]::uuid[],'active');
 IF NOT public.is_school_member(u,a) THEN RAISE EXCEPTION 'Reactivation failed'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-000000000001',true);
SELECT public.settings_provision_school_user('c2000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000003',ARRAY['accountant']::public.app_role[],ARRAY[]::uuid[],NULL);
DO $$ DECLARE rejected boolean:=false; BEGIN
 BEGIN PERFORM public.settings_remove_school_user('c2000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000003',true); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Multi-school Auth deletion allowed'; END IF;
END $$;
SELECT public.settings_remove_school_user('c2000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000003',false);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.user_roles WHERE school_id='c2000000-0000-0000-0000-000000000001' AND user_id='c1000000-0000-0000-0000-000000000003') OR NOT public.has_role('c1000000-0000-0000-0000-000000000003','c2000000-0000-0000-0000-000000000002','accountant') THEN RAISE EXCEPTION 'Removal damaged role isolation'; END IF;
END $$;
SELECT public.settings_provision_school_user('c2000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000004',ARRAY['teacher']::public.app_role[],ARRAY[]::uuid[],NULL);
SELECT public.settings_remove_school_user('c2000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000004',true);
DO $$ DECLARE rejected boolean:=false; BEGIN
 BEGIN PERFORM public.settings_provision_school_user('c2000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000004',ARRAY['teacher']::public.app_role[],ARRAY[]::uuid[],NULL); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Deletion reservation permits new membership'; END IF;
 IF has_table_privilege('authenticated','public.auth_user_deletion_reservations','insert') OR has_function_privilege('anon','public.platform_assign_administrator(uuid,uuid,public.app_role)','execute') THEN RAISE EXCEPTION 'Unsafe grants'; END IF;
END $$;
RESET ROLE;
DO $$ DECLARE rejected boolean:=false; BEGIN
 BEGIN DELETE FROM auth.users WHERE id='c1000000-0000-0000-0000-000000000003'; EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Auth deletion cascaded another membership'; END IF;
END $$;
DELETE FROM auth.users WHERE id='c1000000-0000-0000-0000-000000000004';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.auth_user_deletion_reservations) OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id='c1000000-0000-0000-0000-000000000003') THEN RAISE EXCEPTION 'Auth deletion guard failed'; END IF;
END $$;
ROLLBACK;

