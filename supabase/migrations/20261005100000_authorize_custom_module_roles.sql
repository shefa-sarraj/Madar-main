BEGIN;

-- Additive policies: legacy system-role helpers deliberately remain unchanged.
DO $$
DECLARE r record; action text; command text; predicate text;
BEGIN
 FOR r IN SELECT * FROM (VALUES
  ('students','students','view,create,edit,manage'),
  ('guardians','students','view,create,edit,manage'),
  ('student_guardians','students','view,create,edit,manage'),
  ('student_enrollments','students','view,create,edit,manage'),
  ('student_documents','students','view,create,edit,manage'),
  ('admission_applications','admissions','view,create,edit,manage'),
  ('stages','classes','view,create,edit,manage'),
  ('grades','classes','view,create,edit,manage'),
  ('sections','classes','view,create,edit,manage'),
  ('fee_categories','fees','view,create,edit'),
  ('fee_structures','fees','view,create,edit'),
  ('student_fees','fees','view,create,edit'),
  ('installment_plans','fees','view'),('installments','fees','view'),
  ('discounts','fees','view'),('payments','fees','view'),('payment_allocations','fees','view'),
  ('expense_categories','expenses','view,create,edit'),
  ('cost_centers','expenses','view,create,edit'),('expenses','expenses','view,create,edit'),
  ('departments','employees','view,create,edit'),('employees','employees','view,create,edit'),
  ('student_attendance','student_attendance','view,create,edit'),
  ('staff_attendance','staff_attendance','view,create,edit'),
  ('inventory_categories','inventory','view,create,edit'),
  ('inventory_items','inventory','view,create,edit'),
  ('inventory_movements','inventory','view,create'),
  ('asset_categories','assets','view,create,edit'),('assets','assets','view,create,edit'),
  ('asset_history','assets','view'),('tasks','tasks','view,create,edit'),
  ('cases','cases','view,create,edit')
 ) AS permissions(table_name,module,actions)
 LOOP
  FOREACH action IN ARRAY string_to_array(r.actions,',') LOOP
   command:=CASE action WHEN 'view' THEN 'SELECT' WHEN 'create' THEN 'INSERT' WHEN 'edit' THEN 'UPDATE' ELSE 'DELETE' END;
   predicate:=format('public.has_custom_module_permission(auth.uid(),school_id,%L,%L)',r.module,action);
   IF r.table_name='admission_applications' AND action='manage' THEN predicate:=predicate||' AND status<>''enrolled'''; END IF;
   EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO authenticated %s',
    'Custom roles '||action,r.table_name,command,
    CASE command WHEN 'INSERT' THEN 'WITH CHECK ('||predicate||')'
     WHEN 'UPDATE' THEN 'USING ('||predicate||') WITH CHECK ('||predicate||')'
     ELSE 'USING ('||predicate||')' END);
  END LOOP;
 END LOOP;
END $$;

-- Read dependencies needed for scoped selectors/joins, never for mutations.
DO $$
DECLARE t text; module text;
BEGIN
 FOREACH t IN ARRAY ARRAY['students','student_enrollments','stages','grades','sections'] LOOP
  FOREACH module IN ARRAY ARRAY['fees','student_attendance','admissions','students'] LOOP
   EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.has_custom_module_permission(auth.uid(),school_id,%L,''view''))','Custom selector '||module,t,module);
  END LOOP;
 END LOOP;
 FOREACH t IN ARRAY ARRAY['employees','departments'] LOOP
  EXECUTE format('CREATE POLICY "Custom staff attendance selector" ON public.%I FOR SELECT TO authenticated USING (public.has_custom_module_permission(auth.uid(),school_id,''staff_attendance'',''view''))',t);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION private.has_system_school_role(_school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.is_super_admin(auth.uid()) OR (
  public.is_school_member(auth.uid(),_school_id) AND EXISTS (
   SELECT 1 FROM public.user_roles r WHERE r.user_id=auth.uid() AND r.school_id=_school_id
  )
 );
$$;
REVOKE ALL ON FUNCTION private.has_system_school_role(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.has_system_school_role(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.can_access_reports(_school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.has_system_school_role(_school_id)
  OR public.has_custom_module_permission(auth.uid(),_school_id,'reports','view');
$$;
REVOKE ALL ON FUNCTION public.can_access_reports(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_access_reports(uuid) TO authenticated;
CREATE POLICY "Custom settings read guard" ON public.school_settings AS RESTRICTIVE FOR SELECT TO authenticated
 USING (private.has_system_school_role(school_id) OR public.has_custom_module_permission(auth.uid(),school_id,'settings','view'));

CREATE POLICY "Custom user viewers read memberships" ON public.school_members FOR SELECT TO authenticated
 USING (public.has_custom_module_permission(auth.uid(),school_id,'users','view'));
CREATE POLICY "Custom user viewers read system roles" ON public.user_roles FOR SELECT TO authenticated
 USING (school_id IS NOT NULL AND public.has_custom_module_permission(auth.uid(),school_id,'users','view'));
CREATE POLICY "Custom user viewers read assignments" ON public.school_user_custom_roles FOR SELECT TO authenticated
 USING (public.has_custom_module_permission(auth.uid(),school_id,'users','view'));
CREATE POLICY "Custom user viewers read profiles" ON public.profiles FOR SELECT TO authenticated
 USING (EXISTS (SELECT 1 FROM public.school_members m WHERE m.user_id=profiles.id
  AND public.has_custom_module_permission(auth.uid(),m.school_id,'users','view')));

CREATE POLICY "Custom expense roles read attachments" ON storage.objects FOR SELECT TO authenticated
 USING (bucket_id='finance-attachments' AND public.has_custom_module_permission(auth.uid(),((storage.foldername(name))[1])::uuid,'expenses','view'));
CREATE POLICY "Custom expense roles upload attachments" ON storage.objects FOR INSERT TO authenticated
 WITH CHECK (bucket_id='finance-attachments' AND public.has_custom_module_permission(auth.uid(),((storage.foldername(name))[1])::uuid,'expenses','create'));

CREATE POLICY "Custom roles read student files" ON storage.objects FOR SELECT TO authenticated
 USING (bucket_id='student-documents' AND public.has_custom_module_permission(auth.uid(),((storage.foldername(name))[1])::uuid,'students','view'));
CREATE POLICY "Custom roles upload student files" ON storage.objects FOR INSERT TO authenticated
 WITH CHECK (bucket_id='student-documents' AND public.has_custom_module_permission(auth.uid(),((storage.foldername(name))[1])::uuid,'students','create'));
CREATE POLICY "Custom roles delete student files" ON storage.objects FOR DELETE TO authenticated
 USING (bucket_id='student-documents' AND public.has_custom_module_permission(auth.uid(),((storage.foldername(name))[1])::uuid,'students','manage'));

-- Patch only the authorization expressions of existing atomic RPCs/triggers.
-- Abort on drift rather than silently leaving an unprotected or unusable function.
DO $$
DECLARE r record; definition text; patched text;
BEGIN
 FOR r IN SELECT * FROM (VALUES
  ('refresh_finance_statuses','public.can_view_finance(auth.uid(), _school_id)','fees','view','_school_id'),
  ('set_installment_plan','public.can_manage_finance(auth.uid(), fee.school_id)','fees','edit','fee.school_id'),
  ('add_discount','public.can_manage_finance(auth.uid(), fee.school_id)','fees','create','fee.school_id'),
  ('deactivate_discount','public.can_manage_finance(auth.uid(), d.school_id)','fees','manage','d.school_id'),
  ('record_payment','public.can_manage_finance(auth.uid(), st.school_id)','fees','create','st.school_id'),
  ('cancel_payment','public.can_manage_finance(auth.uid(), p.school_id)','fees','manage','p.school_id'),
  ('apply_fee_structure','public.can_manage_finance(auth.uid(), fs.school_id)','fees','create','fs.school_id'),
  ('record_asset_event','private.can_manage_assets(current_asset.school_id)','assets','manage','current_asset.school_id'),
  ('task_before_write','private.can_manage_tasks(NEW.school_id)','tasks','create','NEW.school_id'),
  ('task_before_write','private.can_manage_tasks(OLD.school_id)','tasks','edit','OLD.school_id'),
  ('case_before_write','private.can_scope_case(NEW.school_id,NEW.student_id,NEW.guardian_id,NEW.employee_id)','cases','create','NEW.school_id'),
  ('case_before_write','private.can_scope_case(OLD.school_id,OLD.student_id,OLD.guardian_id,OLD.employee_id)','cases','edit','OLD.school_id'),
  ('task_comment_before_write','private.can_view_task(t.school_id,t.assigned_to_user_id)','tasks','create','t.school_id'),
  ('case_comment_before_write','private.can_view_case(c.school_id,c.student_id,c.guardian_id,c.employee_id,c.assigned_to_user_id)','cases','create','c.school_id')
 ) AS guards(name,old_guard,module,action,school_expression)
 LOOP
  SELECT pg_get_functiondef(p.oid) INTO STRICT definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=r.name;
  patched:=replace(definition,r.old_guard,format('(%s OR public.has_custom_module_permission(auth.uid(),%s,%L,%L))',r.old_guard,r.school_expression,r.module,r.action));
  IF patched=definition THEN RAISE EXCEPTION 'Authorization guard missing in %',r.name; END IF;
  EXECUTE patched;
 END LOOP;
 SELECT pg_get_functiondef('public.convert_admission_application(uuid,uuid)'::regprocedure) INTO definition;
 patched:=replace(definition,'public.can_manage_students(auth.uid(), app.school_id)',
  '(public.can_manage_students(auth.uid(), app.school_id) OR (public.has_custom_module_permission(auth.uid(),app.school_id,''admissions'',''manage'') AND public.has_custom_module_permission(auth.uid(),app.school_id,''students'',''create'')))');
 IF patched=definition THEN RAISE EXCEPTION 'Admission conversion authorization guard missing'; END IF;
 EXECUTE patched;
END $$;

CREATE POLICY "Custom task roles read comments" ON public.task_comments FOR SELECT TO authenticated
 USING (public.has_custom_module_permission(auth.uid(),school_id,'tasks','view'));
CREATE POLICY "Custom task roles add comments" ON public.task_comments FOR INSERT TO authenticated
 WITH CHECK (user_id=auth.uid() AND public.has_custom_module_permission(auth.uid(),school_id,'tasks','create'));
CREATE POLICY "Custom case roles read comments" ON public.case_comments FOR SELECT TO authenticated
 USING (public.has_custom_module_permission(auth.uid(),school_id,'cases','view'));
CREATE POLICY "Custom case roles add comments" ON public.case_comments FOR INSERT TO authenticated
 WITH CHECK (user_id=auth.uid() AND public.has_custom_module_permission(auth.uid(),school_id,'cases','create'));

-- Editing records does not imply cancellation/archival/stock management.
CREATE OR REPLACE FUNCTION private.custom_module_management_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE module text; system_manager boolean; requires_manage boolean;
BEGIN
 IF current_setting('role',true)='service_role' OR current_setting('request.jwt.claim.role',true)='service_role' THEN RETURN NEW; END IF;
 module:=TG_ARGV[0];
 system_manager:=CASE module
  WHEN 'inventory' THEN private.can_manage_inventory(OLD.school_id)
  WHEN 'tasks' THEN private.can_manage_tasks(OLD.school_id)
  WHEN 'employees' THEN public.can_manage_staff(auth.uid(),OLD.school_id)
  WHEN 'expenses' THEN public.can_manage_finance(auth.uid(),OLD.school_id)
  WHEN 'fees' THEN public.can_manage_finance(auth.uid(),OLD.school_id)
  ELSE public.can_manage_students(auth.uid(),OLD.school_id) END;
 requires_manage:=CASE TG_TABLE_NAME
  WHEN 'inventory_items' THEN to_jsonb(NEW)->'is_active' IS DISTINCT FROM to_jsonb(OLD)->'is_active'
  WHEN 'employees' THEN to_jsonb(NEW)->'status' IS DISTINCT FROM to_jsonb(OLD)->'status'
  WHEN 'students' THEN to_jsonb(NEW)->'status' IS DISTINCT FROM to_jsonb(OLD)->'status'
  WHEN 'expenses' THEN to_jsonb(NEW)->'status' IS DISTINCT FROM to_jsonb(OLD)->'status'
  WHEN 'tasks' THEN to_jsonb(NEW)->>'status'='cancelled' AND to_jsonb(NEW)->'status' IS DISTINCT FROM to_jsonb(OLD)->'status'
  WHEN 'fee_structures' THEN to_jsonb(NEW)->'is_active' IS DISTINCT FROM to_jsonb(OLD)->'is_active'
  WHEN 'student_fees' THEN to_jsonb(NEW)->>'status' IN ('cancelled','waived') AND to_jsonb(NEW)->'status' IS DISTINCT FROM to_jsonb(OLD)->'status'
  WHEN 'stages' THEN to_jsonb(NEW)->'status' IS DISTINCT FROM to_jsonb(OLD)->'status'
  WHEN 'grades' THEN to_jsonb(NEW)->'status' IS DISTINCT FROM to_jsonb(OLD)->'status'
  WHEN 'sections' THEN to_jsonb(NEW)->'status' IS DISTINCT FROM to_jsonb(OLD)->'status'
  ELSE false END;
 IF NOT system_manager AND requires_manage AND NOT public.has_custom_module_permission(auth.uid(),OLD.school_id,module,'manage') THEN
  RAISE EXCEPTION 'Module manage permission required' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.custom_module_management_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER custom_inventory_management BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION private.custom_module_management_guard('inventory');
CREATE TRIGGER custom_employee_management BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION private.custom_module_management_guard('employees');
CREATE TRIGGER custom_student_management BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION private.custom_module_management_guard('students');
CREATE TRIGGER custom_expense_management BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION private.custom_module_management_guard('expenses');
CREATE TRIGGER custom_task_management BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION private.custom_module_management_guard('tasks');
CREATE TRIGGER custom_fee_structure_management BEFORE UPDATE ON public.fee_structures FOR EACH ROW EXECUTE FUNCTION private.custom_module_management_guard('fees');
CREATE TRIGGER custom_student_fee_management BEFORE UPDATE ON public.student_fees FOR EACH ROW EXECUTE FUNCTION private.custom_module_management_guard('fees');
CREATE TRIGGER custom_stage_management BEFORE UPDATE ON public.stages FOR EACH ROW EXECUTE FUNCTION private.custom_module_management_guard('classes');
CREATE TRIGGER custom_grade_management BEFORE UPDATE ON public.grades FOR EACH ROW EXECUTE FUNCTION private.custom_module_management_guard('classes');
CREATE TRIGGER custom_section_management BEFORE UPDATE ON public.sections FOR EACH ROW EXECUTE FUNCTION private.custom_module_management_guard('classes');

-- Settings/user writes remain owner/system-only, even when custom roles are assigned.
-- Reports read source tables through their module RLS, never via a definer bypass.
COMMIT;
