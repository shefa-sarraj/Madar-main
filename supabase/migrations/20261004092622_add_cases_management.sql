CREATE TYPE public.case_type AS ENUM ('complaint','note','incident','feedback');
CREATE TYPE public.case_priority AS ENUM ('low','medium','high','urgent');
CREATE TYPE public.case_status AS ENUM ('new','under_review','in_progress','resolved','closed','rejected');

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated;
CREATE TABLE private.case_number_counters (
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  calendar_year integer NOT NULL,
  last_value integer NOT NULL DEFAULT 0 CHECK (last_value >= 0),
  PRIMARY KEY (school_id,calendar_year)
);
REVOKE ALL ON private.case_number_counters FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.is_case_full_manager(_school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT public.is_school_member((SELECT auth.uid()),_school_id) AND (
  public.is_super_admin((SELECT auth.uid()))
  OR public.has_role((SELECT auth.uid()),_school_id,'school_owner')
  OR public.has_role((SELECT auth.uid()),_school_id,'school_manager'));
$$;
CREATE OR REPLACE FUNCTION private.teacher_can_access_student(_school_id uuid,_student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT _student_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.student_enrollments se
  JOIN public.sections s ON s.id=se.section_id AND s.school_id=se.school_id
  WHERE se.school_id=_school_id AND se.student_id=_student_id
   AND se.enrollment_status IN ('active','pending')
   AND s.homeroom_teacher_id=(SELECT auth.uid()));
$$;
CREATE OR REPLACE FUNCTION private.can_scope_case(_school_id uuid,_student_id uuid,_guardian_id uuid,_employee_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT private.is_case_full_manager(_school_id)
 OR (public.is_school_member((SELECT auth.uid()),_school_id) AND (
  (public.has_role((SELECT auth.uid()),_school_id,'hr') AND _employee_id IS NOT NULL)
  OR (public.has_role((SELECT auth.uid()),_school_id,'registrar') AND (_student_id IS NOT NULL OR _guardian_id IS NOT NULL))
  OR (public.has_role((SELECT auth.uid()),_school_id,'teacher') AND private.teacher_can_access_student(_school_id,_student_id))));
$$;
CREATE OR REPLACE FUNCTION private.can_view_case(_school_id uuid,_student_id uuid,_guardian_id uuid,_employee_id uuid,_assigned_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT private.can_scope_case(_school_id,_student_id,_guardian_id,_employee_id)
 OR (public.is_school_member((SELECT auth.uid()),_school_id) AND _assigned_user=(SELECT auth.uid()));
$$;
REVOKE EXECUTE ON FUNCTION private.is_case_full_manager(uuid),private.teacher_can_access_student(uuid,uuid),
 private.can_scope_case(uuid,uuid,uuid,uuid),private.can_view_case(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.is_case_full_manager(uuid),private.teacher_can_access_student(uuid,uuid),
 private.can_scope_case(uuid,uuid,uuid,uuid),private.can_view_case(uuid,uuid,uuid,uuid,uuid) TO authenticated;

CREATE TABLE public.cases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
 academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE RESTRICT,
 case_number text NOT NULL,
 type public.case_type NOT NULL,
 category text NOT NULL CHECK (btrim(category)<>''),
 title text NOT NULL CHECK (btrim(title)<>''),
 description text NOT NULL CHECK (btrim(description)<>''),
 priority public.case_priority NOT NULL DEFAULT 'medium',
 status public.case_status NOT NULL DEFAULT 'new',
 student_id uuid, guardian_id uuid, employee_id uuid,
 assigned_to_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
 assigned_to_employee_id uuid,
 submitted_by_name text, submitted_by_phone text,
 resolution text, resolved_at timestamptz,
 created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT DEFAULT auth.uid(),
 is_demo boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id,school_id), UNIQUE (school_id,case_number),
 FOREIGN KEY (student_id,school_id) REFERENCES public.students(id,school_id) ON DELETE RESTRICT,
 FOREIGN KEY (guardian_id,school_id) REFERENCES public.guardians(id,school_id) ON DELETE RESTRICT,
 FOREIGN KEY (employee_id,school_id) REFERENCES public.employees(id,school_id) ON DELETE RESTRICT,
 FOREIGN KEY (assigned_to_employee_id,school_id) REFERENCES public.employees(id,school_id) ON DELETE RESTRICT,
 CHECK (NOT (assigned_to_user_id IS NOT NULL AND assigned_to_employee_id IS NOT NULL)),
 CHECK (status NOT IN ('resolved','closed') OR resolved_at IS NOT NULL),
 CHECK (resolution IS NULL OR btrim(resolution)<>'')
);
CREATE TABLE public.case_comments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
 case_id uuid NOT NULL,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT DEFAULT auth.uid(),
 comment text NOT NULL CHECK (btrim(comment)<>''),
 is_demo boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (case_id,school_id) REFERENCES public.cases(id,school_id) ON DELETE RESTRICT
);
CREATE INDEX cases_school_status_created_idx ON public.cases(school_id,status,created_at DESC);
CREATE INDEX cases_school_priority_open_idx ON public.cases(school_id,priority,status) WHERE status NOT IN ('resolved','closed','rejected');
CREATE INDEX cases_assigned_user_idx ON public.cases(assigned_to_user_id,status) WHERE assigned_to_user_id IS NOT NULL;
CREATE INDEX cases_student_idx ON public.cases(student_id) WHERE student_id IS NOT NULL;
CREATE INDEX cases_guardian_idx ON public.cases(guardian_id) WHERE guardian_id IS NOT NULL;
CREATE INDEX cases_employee_idx ON public.cases(employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX case_comments_case_created_idx ON public.case_comments(case_id,created_at);
REVOKE ALL ON public.cases,public.case_comments FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.cases TO authenticated;
GRANT SELECT,INSERT ON public.case_comments TO authenticated;
GRANT ALL ON public.cases,public.case_comments TO service_role;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authorized staff add scoped cases" ON public.cases FOR INSERT TO authenticated
 WITH CHECK (private.can_scope_case(school_id,student_id,guardian_id,employee_id));
CREATE POLICY "Authorized participants read cases" ON public.cases FOR SELECT TO authenticated
 USING (private.can_view_case(school_id,student_id,guardian_id,employee_id,assigned_to_user_id));
CREATE POLICY "Authorized participants update cases" ON public.cases FOR UPDATE TO authenticated
 USING (private.can_view_case(school_id,student_id,guardian_id,employee_id,assigned_to_user_id))
 WITH CHECK (private.can_view_case(school_id,student_id,guardian_id,employee_id,assigned_to_user_id));
CREATE POLICY "Case participants read comments" ON public.case_comments FOR SELECT TO authenticated USING (
 EXISTS (SELECT 1 FROM public.cases c WHERE c.id=case_id AND c.school_id=school_id
  AND private.can_view_case(c.school_id,c.student_id,c.guardian_id,c.employee_id,c.assigned_to_user_id)));
CREATE POLICY "Case participants add comments" ON public.case_comments FOR INSERT TO authenticated WITH CHECK (
 user_id=(SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.cases c WHERE c.id=case_id AND c.school_id=school_id
  AND private.can_view_case(c.school_id,c.student_id,c.guardian_id,c.employee_id,c.assigned_to_user_id)));

CREATE OR REPLACE FUNCTION private.next_case_number(_school_id uuid,_created_at timestamptz)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE y integer:=extract(year FROM _created_at)::integer; n integer;
BEGIN
 INSERT INTO private.case_number_counters(school_id,calendar_year,last_value) VALUES (_school_id,y,1)
 ON CONFLICT (school_id,calendar_year) DO UPDATE SET last_value=private.case_number_counters.last_value+1
 RETURNING last_value INTO n;
 RETURN 'CASE-'||y||'-'||lpad(n::text,4,'0');
END $$;

CREATE OR REPLACE FUNCTION public.case_before_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE scoped_manager boolean; assigned_only boolean;
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.created_by:=auth.uid(); NEW.created_at:=coalesce(NEW.created_at,now());
  NEW.case_number:=private.next_case_number(NEW.school_id,NEW.created_at);
  scoped_manager:=private.can_scope_case(NEW.school_id,NEW.student_id,NEW.guardian_id,NEW.employee_id);
  IF NOT scoped_manager THEN RAISE EXCEPTION 'لا تملك صلاحية إنشاء هذه الحالة'; END IF;
 ELSE
  NEW.id:=OLD.id; NEW.school_id:=OLD.school_id; NEW.case_number:=OLD.case_number;
  NEW.created_by:=OLD.created_by; NEW.created_at:=OLD.created_at; NEW.is_demo:=OLD.is_demo;
  scoped_manager:=private.can_scope_case(OLD.school_id,OLD.student_id,OLD.guardian_id,OLD.employee_id);
  assigned_only:=OLD.assigned_to_user_id=(SELECT auth.uid()) AND NOT scoped_manager;
  IF assigned_only AND (
   NEW.type IS DISTINCT FROM OLD.type OR NEW.category IS DISTINCT FROM OLD.category
   OR NEW.title IS DISTINCT FROM OLD.title OR NEW.description IS DISTINCT FROM OLD.description
   OR NEW.priority IS DISTINCT FROM OLD.priority OR NEW.student_id IS DISTINCT FROM OLD.student_id
   OR NEW.guardian_id IS DISTINCT FROM OLD.guardian_id OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
   OR NEW.assigned_to_user_id IS DISTINCT FROM OLD.assigned_to_user_id
   OR NEW.assigned_to_employee_id IS DISTINCT FROM OLD.assigned_to_employee_id
   OR NEW.submitted_by_name IS DISTINCT FROM OLD.submitted_by_name
   OR NEW.submitted_by_phone IS DISTINCT FROM OLD.submitted_by_phone
   OR NEW.academic_year_id IS DISTINCT FROM OLD.academic_year_id
  ) THEN RAISE EXCEPTION 'يمكن للمستخدم المسند إليه تحديث سير الحالة فقط'; END IF;
  IF NOT scoped_manager AND NOT assigned_only THEN RAISE EXCEPTION 'لا تملك صلاحية تحديث الحالة'; END IF;
 END IF;
 NEW.category:=btrim(NEW.category); NEW.title:=btrim(NEW.title); NEW.description:=btrim(NEW.description);
 NEW.submitted_by_name:=nullif(btrim(NEW.submitted_by_name),'');
 NEW.submitted_by_phone:=nullif(btrim(NEW.submitted_by_phone),'');
 NEW.resolution:=nullif(btrim(NEW.resolution),'');
 IF NEW.academic_year_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public.academic_years ay WHERE ay.id=NEW.academic_year_id AND ay.school_id=NEW.school_id
 ) THEN RAISE EXCEPTION 'السنة الدراسية لا تتبع المدرسة'; END IF;
 IF NEW.student_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public.students s WHERE s.id=NEW.student_id AND s.school_id=NEW.school_id
 ) THEN RAISE EXCEPTION 'الطالب لا يتبع المدرسة'; END IF;
 IF NEW.guardian_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public.guardians g WHERE g.id=NEW.guardian_id AND g.school_id=NEW.school_id
 ) THEN RAISE EXCEPTION 'ولي الأمر لا يتبع المدرسة'; END IF;
 IF NEW.employee_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public.employees e WHERE e.id=NEW.employee_id AND e.school_id=NEW.school_id
 ) THEN RAISE EXCEPTION 'الموظف لا يتبع المدرسة'; END IF;
 IF NEW.assigned_to_user_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public.school_members sm WHERE sm.user_id=NEW.assigned_to_user_id
   AND sm.school_id=NEW.school_id AND sm.status='active'
 ) THEN RAISE EXCEPTION 'المستخدم المسند إليه غير عضو فعال في المدرسة'; END IF;
 IF NEW.assigned_to_employee_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public.employees e WHERE e.id=NEW.assigned_to_employee_id
   AND e.school_id=NEW.school_id AND e.status='active'
 ) THEN RAISE EXCEPTION 'الموظف المسند إليه غير فعال أو لا يتبع المدرسة'; END IF;
 IF NEW.status IN ('resolved','closed') THEN
  IF NEW.resolution IS NULL THEN RAISE EXCEPTION 'أدخل ملخص الحل قبل إنهاء الحالة'; END IF;
  IF TG_OP='INSERT' OR OLD.status NOT IN ('resolved','closed') THEN NEW.resolved_at:=now();
  ELSE NEW.resolved_at:=OLD.resolved_at; END IF;
 ELSE
  NEW.resolved_at:=NULL;
  IF TG_OP='UPDATE' AND OLD.status IN ('resolved','closed') THEN NEW.resolution:=NULL; END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.case_comment_before_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 NEW.user_id:=auth.uid(); NEW.comment:=btrim(NEW.comment);
 IF NOT EXISTS (
  SELECT 1 FROM public.cases c WHERE c.id=NEW.case_id AND c.school_id=NEW.school_id
   AND private.can_view_case(c.school_id,c.student_id,c.guardian_id,c.employee_id,c.assigned_to_user_id)
 ) THEN RAISE EXCEPTION 'لا تملك صلاحية التعليق على الحالة'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cases_before_write BEFORE INSERT OR UPDATE ON public.cases
 FOR EACH ROW EXECUTE FUNCTION public.case_before_write();
CREATE TRIGGER cases_set_updated_at BEFORE UPDATE ON public.cases
 FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER case_comments_before_write BEFORE INSERT ON public.case_comments
 FOR EACH ROW EXECUTE FUNCTION public.case_comment_before_write();

CREATE OR REPLACE FUNCTION public.notify_case_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 IF NEW.assigned_to_user_id IS NOT NULL
  AND (TG_OP='INSERT' OR OLD.assigned_to_user_id IS DISTINCT FROM NEW.assigned_to_user_id) THEN
  INSERT INTO public.notifications(school_id,user_id,title,message,type)
  VALUES (NEW.school_id,NEW.assigned_to_user_id,'حالة جديدة مسندة إليك',
   NEW.case_number||' · '||NEW.title,'case_assigned');
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER case_assignment_notification AFTER INSERT OR UPDATE OF assigned_to_user_id ON public.cases
 FOR EACH ROW EXECUTE FUNCTION public.notify_case_assignment();

CREATE OR REPLACE FUNCTION public.audit_cases_module()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
 action_name text; payload jsonb; row_data jsonb:=to_jsonb(NEW);
 old_data jsonb:=CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
BEGIN
 IF TG_TABLE_NAME='case_comments' THEN
  action_name:='case.comment_added'; payload:=jsonb_build_object('case_id',row_data->>'case_id');
 ELSIF TG_OP='INSERT' THEN
  action_name:='case.created'; payload:=jsonb_build_object('case_number',row_data->>'case_number','type',row_data->>'type','priority',row_data->>'priority');
 ELSIF old_data->>'assigned_to_user_id' IS DISTINCT FROM row_data->>'assigned_to_user_id'
  OR old_data->>'assigned_to_employee_id' IS DISTINCT FROM row_data->>'assigned_to_employee_id' THEN
  action_name:=CASE WHEN old_data->>'assigned_to_user_id' IS NULL AND old_data->>'assigned_to_employee_id' IS NULL
   THEN 'case.assigned' ELSE 'case.reassigned' END;
  payload:=jsonb_build_object('from_user',old_data->>'assigned_to_user_id','to_user',row_data->>'assigned_to_user_id',
   'from_employee',old_data->>'assigned_to_employee_id','to_employee',row_data->>'assigned_to_employee_id');
 ELSIF old_data->>'status' IS DISTINCT FROM row_data->>'status' THEN
  action_name:=CASE WHEN row_data->>'status'='resolved' THEN 'case.resolved'
   WHEN row_data->>'status'='closed' THEN 'case.closed'
   WHEN old_data->>'status' IN ('resolved','closed') THEN 'case.reopened'
   ELSE 'case.status_changed' END;
  payload:=jsonb_build_object('from',old_data->>'status','to',row_data->>'status');
 ELSE
  action_name:='case.updated';
  payload:=jsonb_build_object('case_number',row_data->>'case_number','priority',row_data->>'priority');
 END IF;
 INSERT INTO public.audit_logs(school_id,user_id,action,entity_type,entity_id,metadata)
 VALUES ((row_data->>'school_id')::uuid,
  coalesce(auth.uid(),nullif(row_data->>'user_id','')::uuid,nullif(row_data->>'created_by','')::uuid),
  action_name,TG_TABLE_NAME,(row_data->>'id')::uuid,payload);
 RETURN NULL;
END $$;
CREATE TRIGGER audit_cases AFTER INSERT OR UPDATE ON public.cases
 FOR EACH ROW EXECUTE FUNCTION public.audit_cases_module();
CREATE TRIGGER audit_case_comments AFTER INSERT ON public.case_comments
 FOR EACH ROW EXECUTE FUNCTION public.audit_cases_module();

REVOKE EXECUTE ON FUNCTION private.next_case_number(uuid,timestamptz),public.case_before_write(),
 public.case_comment_before_write(),public.notify_case_assignment(),public.audit_cases_module()
 FROM PUBLIC,anon,authenticated;
