CREATE TYPE public.task_priority AS ENUM ('low','medium','high','urgent');
CREATE TYPE public.task_status AS ENUM ('open','in_progress','completed','cancelled');

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.can_manage_tasks(_school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT public.is_school_member((SELECT auth.uid()),_school_id) AND (
    public.is_super_admin((SELECT auth.uid()))
    OR public.has_role((SELECT auth.uid()),_school_id,'school_owner')
    OR public.has_role((SELECT auth.uid()),_school_id,'school_manager')
    OR public.has_role((SELECT auth.uid()),_school_id,'accountant')
    OR public.has_role((SELECT auth.uid()),_school_id,'registrar')
    OR public.has_role((SELECT auth.uid()),_school_id,'hr')
    OR public.has_role((SELECT auth.uid()),_school_id,'store_keeper')
  );
$$;

CREATE OR REPLACE FUNCTION private.can_view_task(_school_id uuid,_assigned_to_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT private.can_manage_tasks(_school_id)
    OR (
      public.is_school_member((SELECT auth.uid()),_school_id)
      AND _assigned_to_user_id=(SELECT auth.uid())
    );
$$;

REVOKE EXECUTE ON FUNCTION private.can_manage_tasks(uuid), private.can_view_task(uuid,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_manage_tasks(uuid), private.can_view_task(uuid,uuid)
  TO authenticated;

CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (btrim(title)<>''),
  description text,
  priority public.task_priority NOT NULL DEFAULT 'medium',
  status public.task_status NOT NULL DEFAULT 'open',
  due_date date,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  assigned_to_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  assigned_to_employee_id uuid,
  related_entity_type text,
  related_entity_id uuid,
  completed_at timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,school_id),
  FOREIGN KEY (assigned_to_employee_id,school_id)
    REFERENCES public.employees(id,school_id) ON DELETE RESTRICT,
  CHECK (NOT (assigned_to_user_id IS NOT NULL AND assigned_to_employee_id IS NOT NULL)),
  CHECK ((related_entity_type IS NULL)=(related_entity_id IS NULL)),
  CHECK (related_entity_type IS NULL OR related_entity_type IN ('student','employee','asset','inventory_item'))
);

CREATE TABLE public.task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  task_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  comment text NOT NULL CHECK (btrim(comment)<>''),
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (task_id,school_id) REFERENCES public.tasks(id,school_id) ON DELETE RESTRICT
);

CREATE INDEX tasks_school_status_due_idx ON public.tasks(school_id,status,due_date);
CREATE INDEX tasks_assigned_user_idx ON public.tasks(assigned_to_user_id,status)
  WHERE assigned_to_user_id IS NOT NULL;
CREATE INDEX tasks_assigned_employee_idx ON public.tasks(assigned_to_employee_id,status)
  WHERE assigned_to_employee_id IS NOT NULL;
CREATE INDEX task_comments_task_created_idx ON public.task_comments(task_id,created_at);

REVOKE ALL ON public.tasks, public.task_comments FROM anon, authenticated;
GRANT SELECT,INSERT,UPDATE ON public.tasks TO authenticated;
GRANT SELECT,INSERT ON public.task_comments TO authenticated;
GRANT ALL ON public.tasks, public.task_comments TO service_role;

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Task managers add tasks" ON public.tasks
  FOR INSERT TO authenticated WITH CHECK (private.can_manage_tasks(school_id));
CREATE POLICY "Task participants read tasks" ON public.tasks
  FOR SELECT TO authenticated USING (private.can_view_task(school_id,assigned_to_user_id));
CREATE POLICY "Task managers or assignees update tasks" ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    private.can_manage_tasks(school_id)
    OR assigned_to_user_id=(SELECT auth.uid())
  )
  WITH CHECK (
    private.can_manage_tasks(school_id)
    OR assigned_to_user_id=(SELECT auth.uid())
  );

CREATE POLICY "Task participants read comments" ON public.task_comments
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id=task_id AND t.school_id=school_id
        AND private.can_view_task(t.school_id,t.assigned_to_user_id)
    )
  );
CREATE POLICY "Task participants add comments" ON public.task_comments
  FOR INSERT TO authenticated WITH CHECK (
    user_id=(SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id=task_id AND t.school_id=school_id
        AND private.can_view_task(t.school_id,t.assigned_to_user_id)
    )
  );

CREATE OR REPLACE FUNCTION public.task_before_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  manager boolean;
BEGIN
  IF TG_OP='INSERT' THEN
    manager:=private.can_manage_tasks(NEW.school_id);
  ELSE
    manager:=private.can_manage_tasks(OLD.school_id);
    NEW.school_id:=OLD.school_id;
    NEW.created_by:=OLD.created_by;
    NEW.created_at:=OLD.created_at;
    NEW.is_demo:=OLD.is_demo;

    IF NOT manager THEN
      IF OLD.assigned_to_user_id IS DISTINCT FROM auth.uid()
        OR NEW.title IS DISTINCT FROM OLD.title
        OR NEW.description IS DISTINCT FROM OLD.description
        OR NEW.priority IS DISTINCT FROM OLD.priority
        OR NEW.due_date IS DISTINCT FROM OLD.due_date
        OR NEW.assigned_to_user_id IS DISTINCT FROM OLD.assigned_to_user_id
        OR NEW.assigned_to_employee_id IS DISTINCT FROM OLD.assigned_to_employee_id
        OR NEW.academic_year_id IS DISTINCT FROM OLD.academic_year_id
        OR NEW.related_entity_type IS DISTINCT FROM OLD.related_entity_type
        OR NEW.related_entity_id IS DISTINCT FROM OLD.related_entity_id
        OR NEW.status='cancelled'
      THEN
        RAISE EXCEPTION 'يمكن للمستخدم المسند إليه تغيير حالة المهمة فقط';
      END IF;
    END IF;
  END IF;

  NEW.title:=btrim(NEW.title);
  NEW.description:=nullif(btrim(NEW.description),'');
  NEW.related_entity_type:=nullif(btrim(NEW.related_entity_type),'');

  IF NEW.academic_year_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.academic_years ay
    WHERE ay.id=NEW.academic_year_id AND ay.school_id=NEW.school_id
  ) THEN
    RAISE EXCEPTION 'السنة الدراسية لا تتبع المدرسة';
  END IF;
  IF NEW.assigned_to_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.school_members sm
    WHERE sm.user_id=NEW.assigned_to_user_id AND sm.school_id=NEW.school_id AND sm.status='active'
  ) THEN
    RAISE EXCEPTION 'المستخدم المسند إليه غير عضو فعال في المدرسة';
  END IF;
  IF NEW.assigned_to_employee_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id=NEW.assigned_to_employee_id AND e.school_id=NEW.school_id AND e.status='active'
  ) THEN
    RAISE EXCEPTION 'الموظف المسند إليه غير فعال أو لا يتبع المدرسة';
  END IF;

  IF NEW.status='completed' THEN
    IF TG_OP='INSERT' THEN
      NEW.completed_at:=now();
    ELSIF OLD.status IS DISTINCT FROM 'completed' THEN
      NEW.completed_at:=now();
    ELSE
      NEW.completed_at:=OLD.completed_at;
    END IF;
  ELSE
    NEW.completed_at:=NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.task_comment_before_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  NEW.user_id:=auth.uid();
  NEW.comment:=btrim(NEW.comment);
  IF NOT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id=NEW.task_id AND t.school_id=NEW.school_id
      AND private.can_view_task(t.school_id,t.assigned_to_user_id)
  ) THEN
    RAISE EXCEPTION 'لا تملك صلاحية التعليق على المهمة';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER tasks_before_write BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.task_before_write();
CREATE TRIGGER tasks_set_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER task_comments_before_write BEFORE INSERT ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.task_comment_before_write();

CREATE OR REPLACE FUNCTION public.notify_task_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.assigned_to_user_id IS NOT NULL
    AND (
      TG_OP='INSERT'
      OR OLD.assigned_to_user_id IS DISTINCT FROM NEW.assigned_to_user_id
    )
  THEN
    INSERT INTO public.notifications(school_id,user_id,title,message,type)
    VALUES (
      NEW.school_id,
      NEW.assigned_to_user_id,
      'مهمة جديدة مسندة إليك',
      NEW.title||CASE WHEN NEW.due_date IS NULL THEN '' ELSE ' · الاستحقاق '||to_char(NEW.due_date,'YYYY-MM-DD') END,
      'task_assigned'
    );
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER task_assignment_notification AFTER INSERT OR UPDATE OF assigned_to_user_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.notify_task_assignment();

CREATE OR REPLACE FUNCTION public.audit_tasks_module()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  action_name text;
  payload jsonb;
  row_data jsonb:=to_jsonb(NEW);
  old_data jsonb:=CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
BEGIN
  IF TG_TABLE_NAME='task_comments' THEN
    action_name:='task.comment_added';
    payload:=jsonb_build_object('task_id',row_data->>'task_id');
  ELSIF TG_OP='INSERT' THEN
    action_name:='task.created';
    payload:=jsonb_build_object(
      'title',row_data->>'title','priority',row_data->>'priority','status',row_data->>'status'
    );
  ELSIF old_data->>'assigned_to_user_id' IS DISTINCT FROM row_data->>'assigned_to_user_id'
    OR old_data->>'assigned_to_employee_id' IS DISTINCT FROM row_data->>'assigned_to_employee_id'
  THEN
    action_name:=CASE
      WHEN old_data->>'assigned_to_user_id' IS NULL AND old_data->>'assigned_to_employee_id' IS NULL
      THEN 'task.assigned'
      ELSE 'task.reassigned'
    END;
    payload:=jsonb_build_object(
      'from_user',old_data->>'assigned_to_user_id','to_user',row_data->>'assigned_to_user_id',
      'from_employee',old_data->>'assigned_to_employee_id','to_employee',row_data->>'assigned_to_employee_id'
    );
  ELSIF old_data->>'status' IS DISTINCT FROM row_data->>'status' THEN
    action_name:=CASE row_data->>'status'
      WHEN 'completed' THEN 'task.completed'
      WHEN 'cancelled' THEN 'task.cancelled'
      ELSE 'task.status_changed'
    END;
    payload:=jsonb_build_object('from',old_data->>'status','to',row_data->>'status');
  ELSE
    action_name:='task.updated';
    payload:=jsonb_build_object(
      'title',row_data->>'title','priority',row_data->>'priority','due_date',row_data->>'due_date'
    );
  END IF;

  INSERT INTO public.audit_logs(school_id,user_id,action,entity_type,entity_id,metadata)
  VALUES (
    (row_data->>'school_id')::uuid,
    coalesce(
      auth.uid(),
      nullif(row_data->>'user_id','')::uuid,
      nullif(row_data->>'created_by','')::uuid
    ),
    action_name,
    TG_TABLE_NAME,
    (row_data->>'id')::uuid,
    payload
  );
  RETURN NULL;
END $$;

CREATE TRIGGER audit_tasks AFTER INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.audit_tasks_module();
CREATE TRIGGER audit_task_comments AFTER INSERT ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.audit_tasks_module();

REVOKE EXECUTE ON FUNCTION public.task_before_write(), public.task_comment_before_write(),
  public.notify_task_assignment(), public.audit_tasks_module()
  FROM PUBLIC, anon, authenticated;
