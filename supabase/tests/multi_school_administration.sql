BEGIN;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('b1000000-0000-0000-0000-000000000001','super.madar@gmail.com','{}'),
 ('b1000000-0000-0000-0000-000000000002','multi-owner@example.invalid','{}'),
 ('b1000000-0000-0000-0000-000000000003','multi-user@example.invalid','{}'),
 ('b1000000-0000-0000-0000-000000000004','foreign-owner@example.invalid','{}');
INSERT INTO public.platform_user_permissions(user_id,permission) VALUES ('b1000000-0000-0000-0000-000000000001','create_school'),('b1000000-0000-0000-0000-000000000001','manage_schools'),('b1000000-0000-0000-0000-000000000001','manage_platform_users');
UPDATE auth.users SET email_confirmed_at=now() WHERE id='b1000000-0000-0000-0000-000000000001';
SELECT public.bootstrap_platform_super_admin('b1000000-0000-0000-0000-000000000001');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000001',true);
DO $$ DECLARE s uuid; profile jsonb:='{"name_ar":"School A","name_en":"A","phone":"","email":"","address":"","logo_url":"","currency":"USD","timezone":"Asia/Jerusalem"}'; BEGIN
 s:=public.platform_save_school('b2000000-0000-0000-0000-000000000001',true,profile,'active','b1000000-0000-0000-0000-000000000002','school_owner');
 IF NOT EXISTS(SELECT 1 FROM public.school_settings WHERE school_id=s AND default_currency='USD') OR NOT public.has_role('b1000000-0000-0000-0000-000000000002',s,'school_owner') THEN RAISE EXCEPTION 'Atomic bootstrap failed'; END IF;
 PERFORM public.platform_save_school('b2000000-0000-0000-0000-000000000002',true,profile||'{"name_ar":"School B"}','active','b1000000-0000-0000-0000-000000000004','school_owner');
 PERFORM public.platform_save_school('b2000000-0000-0000-0000-000000000003',true,profile||'{"name_ar":"School C"}','active','b1000000-0000-0000-0000-000000000002','school_manager');
 PERFORM public.settings_save_member_roles(s,'b1000000-0000-0000-0000-000000000003',ARRAY['accountant']::public.app_role[],ARRAY[]::uuid[],'active',true);
 PERFORM public.settings_save_member_roles('b2000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000003',ARRAY['teacher']::public.app_role[],ARRAY[]::uuid[],'active',true);
END $$;
RESET ROLE;
INSERT INTO public.employees(id,school_id,employee_number,full_name,job_title) VALUES
 ('b3000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','EMP1','Employee A','Accountant'),
 ('b3000000-0000-0000-0000-000000000002','b2000000-0000-0000-0000-000000000002','EMP2','Employee B','Teacher');
UPDATE auth.users SET email_confirmed_at=now() WHERE id='b1000000-0000-0000-0000-000000000001';
SELECT public.bootstrap_platform_super_admin('b1000000-0000-0000-0000-000000000001');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000002',true);
DO $$ DECLARE rejected boolean; count_before int; s uuid:='b2000000-0000-0000-0000-000000000001'; profile jsonb:='{"name_ar":"Forbidden","currency":"USD","timezone":"Asia/Jerusalem"}'; BEGIN
 IF public.is_super_admin(auth.uid()) OR public.can_manage_school(auth.uid(),'b2000000-0000-0000-0000-000000000002') THEN RAISE EXCEPTION 'Owner gained platform/foreign privileges'; END IF;
 IF (SELECT count(*) FROM public.schools WHERE id::text LIKE 'b2000000%')<>2 THEN RAISE EXCEPTION 'Owner sees unowned school'; END IF;
 rejected:=false;
 BEGIN PERFORM public.platform_save_school('b2000000-0000-0000-0000-000000000004',true,profile,'active',auth.uid(),'school_owner'); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Owner created school'; END IF;
 rejected:=false;
 BEGIN PERFORM public.platform_save_school(s,false,profile,'suspended'); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Owner changed platform status'; END IF;
 IF has_table_privilege('authenticated','public.schools','insert') OR has_table_privilege('authenticated','public.schools','update') OR has_function_privilege('authenticated','public.settings_find_auth_user(text)','execute') THEN RAISE EXCEPTION 'Direct platform writes/Auth lookup exposed'; END IF;
 PERFORM public.settings_save_school(s,'{"name_ar":"Owner School","name_en":"","phone":"","email":"","address":"","logo_url":"","currency":"ILS","timezone":"Asia/Jerusalem"}','{"date_format":"dd/MM/yyyy","attendance_enabled":true,"inventory_enabled":true,"cost_centers_enabled":false}');
 rejected:=false;
 BEGIN PERFORM public.settings_save_school('b2000000-0000-0000-0000-000000000002','{"name_ar":"Foreign","currency":"USD","timezone":"Asia/Jerusalem"}','{"date_format":"dd/MM/yyyy"}'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Owner edited foreign school'; END IF;
 PERFORM public.settings_link_employee(s,'b1000000-0000-0000-0000-000000000003','b3000000-0000-0000-0000-000000000001');
 IF NOT EXISTS(SELECT 1 FROM public.school_user_employee_links WHERE school_id=s AND user_id='b1000000-0000-0000-0000-000000000003') THEN RAISE EXCEPTION 'Employee link not saved'; END IF;
 rejected:=false;
 BEGIN PERFORM public.settings_link_employee(s,'b1000000-0000-0000-0000-000000000003','b3000000-0000-0000-0000-000000000002'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Foreign employee linked'; END IF;
 rejected:=false;
 BEGIN PERFORM public.settings_link_employee(s,'b1000000-0000-0000-0000-000000000004','b3000000-0000-0000-0000-000000000001'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Non-member linked'; END IF;
 rejected:=false;
 BEGIN PERFORM public.settings_link_employee(s,auth.uid(),'b3000000-0000-0000-0000-000000000001'); EXCEPTION WHEN unique_violation THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Employee linked to multiple users in same school'; END IF;
 PERFORM public.settings_link_employee(s,'b1000000-0000-0000-0000-000000000003',NULL);
 IF EXISTS(SELECT 1 FROM public.school_user_employee_links WHERE school_id=s) THEN RAISE EXCEPTION 'Unlink failed'; END IF;
 rejected:=false;
 BEGIN PERFORM public.settings_save_member_roles(s,'b1000000-0000-0000-0000-000000000003',ARRAY['super_admin']::public.app_role[],ARRAY[]::uuid[],'active'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'School owner promoted platform admin'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000003',true);
DO $$ DECLARE rejected boolean:=false; BEGIN
 IF NOT public.has_role(auth.uid(),'b2000000-0000-0000-0000-000000000001','accountant') OR public.has_role(auth.uid(),'b2000000-0000-0000-0000-000000000001','teacher') OR NOT public.has_role(auth.uid(),'b2000000-0000-0000-0000-000000000002','teacher') OR public.has_role(auth.uid(),'b2000000-0000-0000-0000-000000000002','accountant') THEN RAISE EXCEPTION 'Roles leaked between schools'; END IF;
 BEGIN PERFORM public.settings_link_employee('b2000000-0000-0000-0000-000000000001',auth.uid(),'b3000000-0000-0000-0000-000000000001'); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Unprivileged user can link employees'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000001',true);
DO $$ DECLARE rejected boolean; count_before int; profile jsonb:='{"name_ar":"Suspended A","name_en":"","phone":"","email":"","address":"","logo_url":"","currency":"USD","timezone":"Asia/Jerusalem"}'; BEGIN
 SELECT count(*) INTO count_before FROM public.schools;
 rejected:=false;
 BEGIN PERFORM public.platform_save_school('b2000000-0000-0000-0000-000000000004',true,profile,'active',NULL,'school_owner'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected OR (SELECT count(*) FROM public.schools)<>count_before THEN RAISE EXCEPTION 'Invalid bootstrap not rolled back'; END IF;
 PERFORM public.platform_save_school('b2000000-0000-0000-0000-000000000001',false,profile,'suspended');
 IF public.is_school_member('b1000000-0000-0000-0000-000000000003','b2000000-0000-0000-0000-000000000001') OR public.has_role('b1000000-0000-0000-0000-000000000002','b2000000-0000-0000-0000-000000000001','school_owner') THEN RAISE EXCEPTION 'Suspended school retains member/owner access'; END IF;
 IF NOT public.can_manage_school(auth.uid(),'b2000000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'Platform admin lost suspended school access'; END IF;
 PERFORM set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000003',true);
 IF EXISTS(SELECT 1 FROM public.schools WHERE id='b2000000-0000-0000-0000-000000000001') OR EXISTS(SELECT 1 FROM public.employees WHERE school_id='b2000000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'Suspension does not enforce RLS'; END IF;
 IF NOT public.has_role(auth.uid(),'b2000000-0000-0000-0000-000000000002','teacher') THEN RAISE EXCEPTION 'Suspension affected another membership'; END IF;
 PERFORM set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000001',true);
 PERFORM public.platform_save_school('b2000000-0000-0000-0000-000000000001',false,profile,'active');
 IF NOT public.has_role('b1000000-0000-0000-0000-000000000003','b2000000-0000-0000-0000-000000000001','accountant') THEN RAISE EXCEPTION 'Reactivation did not restore school roles'; END IF;
END $$;
RESET ROLE;
DO $$ DECLARE rejected boolean:=false; BEGIN
 BEGIN INSERT INTO public.school_user_employee_links(school_id,user_id,employee_id) VALUES('b2000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000003','b3000000-0000-0000-0000-000000000002'); EXCEPTION WHEN foreign_key_violation THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Composite employee FK does not enforce school'; END IF;
 rejected:=false;
 BEGIN INSERT INTO public.user_roles(school_id,user_id,role) VALUES('b2000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000003','super_admin'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Scoped super admin role accepted'; END IF;
END $$;
ROLLBACK;

