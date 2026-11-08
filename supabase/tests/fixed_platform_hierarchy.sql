BEGIN;
INSERT INTO auth.users(id,email,raw_user_meta_data,email_confirmed_at) VALUES
('a1000000-0000-0000-0000-000000000001','super.madar@gmail.com','{}',now()),
('a1000000-0000-0000-0000-000000000002','manager-a@example.invalid','{"manager_request":true,"school_name":"School A","full_name":"Manager A","requested_role":"school_manager"}',now()),
('a1000000-0000-0000-0000-000000000003','owner-b@example.invalid','{"manager_request":true,"school_name":"School B","full_name":"Owner B"}',now()),
('a1000000-0000-0000-0000-000000000004','rejected@example.invalid','{"manager_request":true,"school_name":"Rejected","full_name":"Rejected"}',now()),
('a1000000-0000-0000-0000-000000000005','staff@example.invalid','{}',now());
SELECT public.bootstrap_platform_super_admin('a1000000-0000-0000-0000-000000000001');
SELECT set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000001',true);
SELECT public.review_school_manager_request(id,true) FROM public.school_manager_requests WHERE user_id IN ('a1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000003');
SELECT public.review_school_manager_request(id,false,'Rejected') FROM public.school_manager_requests WHERE user_id='a1000000-0000-0000-0000-000000000004';
DO $$
DECLARE a uuid; b uuid; r uuid; replacement uuid; denied boolean;
BEGIN
 SELECT school_id INTO a FROM public.school_manager_requests WHERE user_id='a1000000-0000-0000-0000-000000000002';
 SELECT school_id INTO b FROM public.school_manager_requests WHERE user_id='a1000000-0000-0000-0000-000000000003';
 IF NOT public.is_super_admin('a1000000-0000-0000-0000-000000000001') OR public.is_super_admin('a1000000-0000-0000-0000-000000000002') THEN RAISE EXCEPTION 'Fixed identity failure'; END IF;
 IF EXISTS(SELECT 1 FROM public.school_members WHERE user_id='a1000000-0000-0000-0000-000000000001') OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id='a1000000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'Platform school identity leakage'; END IF;
 IF NOT public.has_role('a1000000-0000-0000-0000-000000000002',a,'school_manager') OR NOT public.has_role('a1000000-0000-0000-0000-000000000003',b,'school_owner') THEN RAISE EXCEPTION 'Approval role failure'; END IF;
 IF EXISTS(SELECT 1 FROM public.school_members WHERE user_id='a1000000-0000-0000-0000-000000000004') THEN RAISE EXCEPTION 'Rejected applicant access'; END IF;
 denied:=false; BEGIN INSERT INTO public.school_members(school_id,user_id,status) VALUES(a,'a1000000-0000-0000-0000-000000000001','active'); EXCEPTION WHEN OTHERS THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Platform membership allowed'; END IF;
 INSERT INTO public.platform_user_permissions(user_id,permission) SELECT 'a1000000-0000-0000-0000-000000000002',p FROM unnest(ARRAY['create_school','manage_schools','manage_platform_users']) p;
 IF public.is_super_admin('a1000000-0000-0000-0000-000000000002') OR public.has_platform_permission('a1000000-0000-0000-0000-000000000002','manage_platform_users') THEN RAISE EXCEPTION 'Legacy permission bundle created a second platform identity'; END IF;
 IF has_function_privilege('authenticated','public.bootstrap_platform_super_admin(uuid)','execute') OR has_table_privilege('authenticated','public.platform_super_admin','insert') THEN RAISE EXCEPTION 'Platform bootstrap is exposed'; END IF;
 PERFORM set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000002',true);
 IF public.can_manage_school(auth.uid(),b) OR public.is_school_member(auth.uid(),b) OR public.has_platform_permission(auth.uid(),'manage_schools') THEN RAISE EXCEPTION 'Tenant/privilege leakage'; END IF;
 r:=public.settings_save_role(a,NULL,'Office role','Description',true,'[{"module":"students","can_view":true,"can_create":false,"can_edit":false,"can_manage":false}]');
 PERFORM public.settings_save_role(a,r,'Edited office role','Edited description',true,'[{"module":"students","can_view":true,"can_create":true,"can_edit":true,"can_manage":true}]');
 PERFORM public.settings_provision_school_user(a,'a1000000-0000-0000-0000-000000000005',ARRAY['teacher']::public.app_role[],ARRAY[r]);
 PERFORM public.settings_save_member_roles(a,'a1000000-0000-0000-0000-000000000005',ARRAY['teacher']::public.app_role[],ARRAY[r],'suspended');
 PERFORM public.settings_save_member_roles(a,'a1000000-0000-0000-0000-000000000005',ARRAY['teacher']::public.app_role[],ARRAY[r],'active');
 denied:=false; BEGIN PERFORM public.settings_save_role(a,r,'Edited office role','',false,'[]'); EXCEPTION WHEN OTHERS THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Assigned role deactivated without reassignment'; END IF;
 replacement:=public.settings_save_role(a,NULL,'Replacement role','',true,'[]');
 PERFORM public.settings_reassign_custom_role(a,r,replacement);
 IF EXISTS(SELECT 1 FROM public.school_user_custom_roles WHERE role_id=r) OR NOT EXISTS(SELECT 1 FROM public.school_user_custom_roles WHERE role_id=replacement) THEN RAISE EXCEPTION 'Reassignment failure'; END IF;
 denied:=false; BEGIN PERFORM public.settings_save_role(b,NULL,'Intrusion','',true,'[]'); EXCEPTION WHEN OTHERS THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Cross school role write allowed'; END IF;
 denied:=false; BEGIN PERFORM public.platform_save_user_permissions(auth.uid(),ARRAY['manage_schools']); EXCEPTION WHEN OTHERS THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Manager granted platform privileges'; END IF;
 denied:=false; BEGIN PERFORM public.review_school_manager_request((SELECT id FROM public.school_manager_requests WHERE user_id='a1000000-0000-0000-0000-000000000004'),true); EXCEPTION WHEN OTHERS THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Manager approved request'; END IF;
END $$;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 IF (SELECT count(*) FROM public.schools)<>1 THEN RAISE EXCEPTION 'School RLS leakage'; END IF;
 IF EXISTS(SELECT 1 FROM public.school_manager_requests WHERE user_id<>auth.uid()) THEN RAISE EXCEPTION 'Request RLS leakage'; END IF;
 IF EXISTS(SELECT 1 FROM public.school_roles WHERE school_id<>(SELECT school_id FROM public.school_members WHERE user_id=auth.uid() LIMIT 1)) THEN RAISE EXCEPTION 'Role RLS leakage'; END IF;
END $$;
RESET ROLE;
ROLLBACK;

