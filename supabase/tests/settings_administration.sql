-- Run against a disposable database with Settings migrations applied.
BEGIN;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('10000000-0000-0000-0000-000000000001','owner-a@example.invalid','{}'),
 ('10000000-0000-0000-0000-000000000002','owner-b@example.invalid','{}'),
 ('10000000-0000-0000-0000-000000000003','user@example.invalid','{}'),
 ('10000000-0000-0000-0000-000000000004','super.madar@gmail.com','{}'),
 ('10000000-0000-0000-0000-000000000005','manager@example.invalid','{}');
INSERT INTO public.schools(id,name_ar) VALUES
 ('20000000-0000-0000-0000-000000000001','مدرسة الاختبار الأولى'),
 ('20000000-0000-0000-0000-000000000002','مدرسة الاختبار الثانية');
INSERT INTO public.school_members(school_id,user_id,status) VALUES
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','active'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','active'),
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000005','active');
INSERT INTO public.user_roles(school_id,user_id,role) VALUES
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','school_owner'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','school_owner'),
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000005','school_manager');
INSERT INTO public.platform_user_permissions(user_id,permission) VALUES
 ('10000000-0000-0000-0000-000000000004','create_school'),
 ('10000000-0000-0000-0000-000000000004','manage_schools'),
 ('10000000-0000-0000-0000-000000000004','manage_platform_users');
UPDATE auth.users SET email_confirmed_at=now() WHERE id='10000000-0000-0000-0000-000000000004';
SELECT public.bootstrap_platform_super_admin('10000000-0000-0000-0000-000000000004');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
DO $$
DECLARE custom_id uuid; foreign_id uuid; foreign_year uuid; before_count integer; rejected boolean;
BEGIN
 IF public.can_manage_school(auth.uid(),'20000000-0000-0000-0000-000000000002') THEN RAISE EXCEPTION 'Cross-school ownership leaked'; END IF;
 IF has_function_privilege('authenticated','public.settings_save_member_internal(uuid,uuid,public.app_role[],public.member_status)','execute') THEN RAISE EXCEPTION 'Internal mutation RPC is exposed'; END IF;
 IF has_table_privilege('authenticated','public.school_members','insert') OR has_table_privilege('authenticated','public.user_roles','insert') THEN RAISE EXCEPTION 'Direct membership or role writes are exposed'; END IF;
 PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
 foreign_id:=public.settings_save_role('20000000-0000-0000-0000-000000000002',NULL,'دور المدرسة الثانية','',true,'[]');
 PERFORM public.settings_save_year('20000000-0000-0000-0000-000000000002',NULL,'2026','2026-09-01','2027-06-30','active',true);
 SELECT id INTO foreign_year FROM public.academic_years WHERE school_id='20000000-0000-0000-0000-000000000002';
 PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
 IF EXISTS(SELECT 1 FROM public.academic_years WHERE school_id='20000000-0000-0000-0000-000000000002') THEN RAISE EXCEPTION 'Foreign academic year exposed'; END IF;
 rejected:=false;
 BEGIN PERFORM public.settings_save_year('20000000-0000-0000-0000-000000000001',foreign_year,'Other','2026-09-01','2027-06-30','closed',false); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Foreign academic year edited'; END IF;
 custom_id:=public.settings_save_role('20000000-0000-0000-0000-000000000001',NULL,'دور اختبار','',true,
 '[{"module":"employees","can_view":true,"can_create":true,"can_edit":false,"can_manage":false}]');
 PERFORM public.settings_save_member_roles('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003',ARRAY['teacher']::public.app_role[],ARRAY[custom_id],'active',true);
 IF NOT EXISTS(SELECT 1 FROM public.school_members WHERE user_id='10000000-0000-0000-0000-000000000003' AND status='active')
 OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id='10000000-0000-0000-0000-000000000003' AND role='teacher')
 OR NOT EXISTS(SELECT 1 FROM public.school_user_custom_roles WHERE user_id='10000000-0000-0000-0000-000000000003' AND role_id=custom_id) THEN RAISE EXCEPTION 'Provisioning did not create membership and both role types'; END IF;
 IF NOT public.has_custom_module_permission('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','employees','create')
 OR public.has_custom_module_permission('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','employees','edit')
 OR public.has_custom_module_permission('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000002','employees','create') THEN RAISE EXCEPTION 'Permission matrix or school boundary failed'; END IF;
 PERFORM public.settings_save_member_roles('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003',ARRAY['teacher']::public.app_role[],ARRAY[custom_id],'suspended');
 IF public.has_role('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','teacher') OR public.has_custom_module_permission('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','employees','view') THEN RAISE EXCEPTION 'Suspension retained permissions'; END IF;
 PERFORM public.settings_save_member_roles('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003',ARRAY['teacher']::public.app_role[],ARRAY[custom_id],'active');
 IF NOT public.has_role('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','teacher') THEN RAISE EXCEPTION 'Reactivation did not restore permissions'; END IF;
 rejected:=false;
 BEGIN PERFORM public.settings_save_member_roles('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003',ARRAY['teacher']::public.app_role[],ARRAY[custom_id],'active',true); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Cross-school assignment accepted'; END IF;
 rejected:=false;
 BEGIN PERFORM public.settings_save_member_roles('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003',ARRAY['teacher']::public.app_role[],ARRAY[foreign_id],'active'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Foreign role assigned to current-school member'; END IF;
 rejected:=false;
 BEGIN PERFORM public.settings_save_member_roles('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003',ARRAY['teacher']::public.app_role[],ARRAY[custom_id],'active',true); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Duplicate creation silently overwrote roles'; END IF;
 SELECT count(*) INTO before_count FROM public.school_roles;
 rejected:=false;
 BEGIN PERFORM public.settings_save_role('20000000-0000-0000-0000-000000000001',NULL,'دور غير صالح','',true,'[{"module":"users","can_view":true,"can_create":true,"can_edit":true,"can_manage":true}]'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected OR (SELECT count(*) FROM public.school_roles)<>before_count THEN RAISE EXCEPTION 'Failed role save did not roll back atomically'; END IF;
 rejected:=false;
 BEGIN PERFORM public.settings_save_role('20000000-0000-0000-0000-000000000001',NULL,'school_owner','',true,'[]'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Protected role name accepted'; END IF;
 PERFORM public.settings_save_year('20000000-0000-0000-0000-000000000001',NULL,'2026','2026-09-01','2027-06-30','active',true);
 PERFORM public.settings_save_year('20000000-0000-0000-0000-000000000001',NULL,'2027','2027-09-01','2028-06-30','active',true);
 IF (SELECT count(*) FROM public.academic_years WHERE school_id='20000000-0000-0000-0000-000000000001' AND is_active)<>1 THEN RAISE EXCEPTION 'Multiple active years'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',true);
DO $$ DECLARE rejected boolean:=false; BEGIN
 BEGIN PERFORM public.settings_save_member_roles('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003',ARRAY['school_owner']::public.app_role[],ARRAY[]::uuid[],'active'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Manager escalated privileges'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
DO $$ DECLARE rejected boolean:=false; BEGIN
 IF NOT public.is_super_admin(auth.uid()) OR (SELECT count(*) FROM public.schools)<>2 THEN RAISE EXCEPTION 'Platform admin is not platform-wide'; END IF;
 BEGIN PERFORM public.settings_save_member_roles('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',ARRAY['school_manager']::public.app_role[],ARRAY[]::uuid[],'active'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Last owner downgraded'; END IF;
 rejected:=false;
 BEGIN PERFORM public.settings_save_member_roles('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',ARRAY['school_owner']::public.app_role[],ARRAY[]::uuid[],'suspended'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Last owner suspended'; END IF;
 PERFORM public.settings_save_member_roles('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003',ARRAY['school_owner']::public.app_role[],ARRAY[]::uuid[],'active');
 PERFORM public.settings_save_member_roles('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',ARRAY['school_manager']::public.app_role[],ARRAY[]::uuid[],'active');
 IF public.has_role('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','school_owner') THEN RAISE EXCEPTION 'Safe owner transfer failed'; END IF;
END $$;
RESET ROLE;
DO $$ DECLARE rejected boolean:=false; BEGIN
 BEGIN INSERT INTO public.academic_years(school_id,name,start_date,end_date,status,is_active) VALUES('20000000-0000-0000-0000-000000000001','duplicate active','2028-09-01','2029-06-30','active',true); EXCEPTION WHEN unique_violation THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Unique active-year index failed'; END IF;
 rejected:=false;
 BEGIN UPDATE public.academic_years SET school_id='20000000-0000-0000-0000-000000000002' WHERE school_id='20000000-0000-0000-0000-000000000001' AND name='2026'; EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Academic year transferred between schools'; END IF;
END $$;
ROLLBACK;

