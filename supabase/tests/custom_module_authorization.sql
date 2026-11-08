-- Disposable database only; fixtures and all mutations are rolled back.
BEGIN;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('11000000-0000-0000-0000-000000000001','custom-owner@example.invalid','{}'),
 ('11000000-0000-0000-0000-000000000002','custom-only@example.invalid','{}');
INSERT INTO public.schools(id,name_ar) VALUES
 ('21000000-0000-0000-0000-000000000001','Custom permission test'),
 ('21000000-0000-0000-0000-000000000002','Foreign school');
INSERT INTO public.school_members(school_id,user_id,status) VALUES
 ('21000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','active'),
 ('21000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000002','active');
INSERT INTO public.user_roles(school_id,user_id,role) VALUES
 ('21000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','school_owner');
INSERT INTO public.school_settings(school_id) VALUES ('21000000-0000-0000-0000-000000000001');
INSERT INTO public.expense_categories(id,school_id,name) VALUES
 ('31000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','Visible expense'),
 ('31000000-0000-0000-0000-000000000002','21000000-0000-0000-0000-000000000002','Foreign expense');
INSERT INTO public.school_roles(id,school_id,name) VALUES
 ('41000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','Read-only custom test');
INSERT INTO public.school_role_permissions(role_id,school_id,module,can_view)
 SELECT '41000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001',module,true
 FROM unnest(ARRAY['students','admissions','fees','expenses','employees','student_attendance',
  'staff_attendance','inventory','assets','tasks','cases','reports','settings','users']) module;
INSERT INTO public.school_user_custom_roles(school_id,user_id,role_id) VALUES
 ('21000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000002','41000000-0000-0000-0000-000000000001');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000002',true);
DO $$
DECLARE rejected boolean; n integer; module text;
BEGIN
 FOREACH module IN ARRAY ARRAY['students','admissions','fees','expenses','employees',
  'student_attendance','staff_attendance','inventory','assets','tasks','cases','reports','settings','users'] LOOP
  IF NOT public.has_custom_module_permission(auth.uid(),'21000000-0000-0000-0000-000000000001',module,'view')
   OR public.has_custom_module_permission(auth.uid(),'21000000-0000-0000-0000-000000000002',module,'view')
   OR public.has_custom_module_permission(auth.uid(),'21000000-0000-0000-0000-000000000001',module,'create')
  THEN RAISE EXCEPTION 'Permission scope/action leak in %',module; END IF;
 END LOOP;
 SELECT count(*) INTO n FROM public.expense_categories;
 IF n<>1 THEN RAISE EXCEPTION 'Expense RLS did not expose exactly own-school rows'; END IF;
 SELECT count(*) INTO n FROM public.school_settings;
 IF n<>1 THEN RAISE EXCEPTION 'Custom settings view is not authorized'; END IF;
 SELECT count(*) INTO n FROM public.school_members;
 IF n<>2 THEN RAISE EXCEPTION 'Custom user viewer cannot read own-school users'; END IF;
 rejected:=false;
 BEGIN INSERT INTO public.expense_categories(school_id,name) VALUES('21000000-0000-0000-0000-000000000001','Denied');
 EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Read-only expense role inserted'; END IF;
 UPDATE public.expense_categories SET name='Denied edit' WHERE id='31000000-0000-0000-0000-000000000001';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'Read-only expense role updated'; END IF;
 rejected:=false;
 BEGIN PERFORM public.settings_save_role('21000000-0000-0000-0000-000000000001',NULL,'Escalation','',true,'[]');
 EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Custom role gained owner administration'; END IF;
 IF public.can_manage_students(auth.uid(),'21000000-0000-0000-0000-000000000001')
  OR public.can_manage_finance(auth.uid(),'21000000-0000-0000-0000-000000000001')
 THEN RAISE EXCEPTION 'Legacy system helper was broadened'; END IF;
 IF NOT public.can_access_reports('21000000-0000-0000-0000-000000000001')
  OR public.can_access_reports('21000000-0000-0000-0000-000000000002')
 THEN RAISE EXCEPTION 'Report access guard is not school/permission scoped'; END IF;
END $$;
RESET ROLE;
UPDATE public.school_role_permissions SET can_view=false WHERE module IN ('reports','settings');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF public.can_access_reports('21000000-0000-0000-0000-000000000001') OR EXISTS(SELECT 1 FROM public.school_settings)
 THEN RAISE EXCEPTION 'Revoked reports/settings view retained access'; END IF;
END $$;
RESET ROLE;
UPDATE public.school_role_permissions SET can_view=true WHERE module IN ('reports','settings');
UPDATE public.school_role_permissions SET can_create=true WHERE module IN ('expenses','tasks','cases');
SET LOCAL ROLE authenticated;
DO $$
DECLARE n integer; new_task uuid; new_case uuid; rejected boolean;
BEGIN
 INSERT INTO public.expense_categories(school_id,name) VALUES('21000000-0000-0000-0000-000000000001','Created');
 UPDATE public.expense_categories SET name='Denied edit' WHERE name='Created';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'Create permission implied edit'; END IF;
 INSERT INTO public.tasks(school_id,title) VALUES('21000000-0000-0000-0000-000000000001','Custom task') RETURNING id INTO new_task;
 UPDATE public.tasks SET title='Denied edit' WHERE id=new_task;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'Task create permission implied edit'; END IF;
 INSERT INTO public.cases(school_id,type,category,title,description)
 VALUES('21000000-0000-0000-0000-000000000001','note','Test','Custom case','Custom test case') RETURNING id INTO new_case;
 INSERT INTO public.task_comments(school_id,task_id,comment)
 VALUES('21000000-0000-0000-0000-000000000001',new_task,'Custom comment');
 INSERT INTO public.case_comments(school_id,case_id,comment)
 VALUES('21000000-0000-0000-0000-000000000001',new_case,'Custom comment');
END $$;
RESET ROLE;
UPDATE public.school_role_permissions SET can_edit=true WHERE module IN ('expenses','tasks','cases');
SET LOCAL ROLE authenticated;
DO $$
DECLARE n integer; rejected boolean;
BEGIN
 UPDATE public.tasks SET title='Edited custom task' WHERE title='Custom task'; GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'Task edit permission not integrated in trigger/RLS'; END IF;
 UPDATE public.cases SET title='Edited custom case' WHERE title='Custom case'; GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'Case edit permission not integrated in trigger/RLS'; END IF;
 rejected:=false;
 BEGIN UPDATE public.tasks SET status='cancelled' WHERE title='Edited custom task';
 EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Task edit allowed cancellation without manage'; END IF;
END $$;
RESET ROLE;
UPDATE public.school_members SET status='suspended' WHERE user_id='11000000-0000-0000-0000-000000000002';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.expense_categories) OR EXISTS(SELECT 1 FROM public.tasks)
  OR EXISTS(SELECT 1 FROM public.cases) OR EXISTS(SELECT 1 FROM public.school_settings)
 THEN RAISE EXCEPTION 'Suspended custom member retained module access'; END IF;
END $$;
RESET ROLE;
UPDATE public.school_members SET status='active' WHERE user_id='11000000-0000-0000-0000-000000000002';
UPDATE public.school_role_permissions SET can_manage=true,can_create=true,can_edit=true WHERE module='tasks';
SET LOCAL ROLE authenticated;
DO $$ DECLARE n integer; BEGIN
 UPDATE public.tasks SET status='cancelled' WHERE title='Edited custom task'; GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'Reactivation/manage did not restore task cancellation'; END IF;
END $$;
RESET ROLE;
DELETE FROM public.school_user_custom_roles WHERE role_id='41000000-0000-0000-0000-000000000001';
UPDATE public.school_roles SET is_active=false WHERE id='41000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.tasks) OR EXISTS(SELECT 1 FROM public.school_settings)
 THEN RAISE EXCEPTION 'Inactive role retained access'; END IF;
END $$;
ROLLBACK;

