CREATE TYPE public.student_attendance_status AS ENUM ('present','absent','late','excused');
CREATE TYPE public.staff_attendance_status AS ENUM ('present','absent','late','leave');

CREATE OR REPLACE FUNCTION public.can_view_student_attendance(_user_id uuid, _school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.can_view_structure(_user_id,_school_id);
$$;

CREATE OR REPLACE FUNCTION public.can_mark_student_attendance(
  _user_id uuid,
  _school_id uuid,
  _enrollment_id uuid
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.can_manage_students(_user_id,_school_id)
      OR (
        public.has_role(_user_id,_school_id,'teacher')
        AND EXISTS (
          SELECT 1
          FROM public.student_enrollments e
          JOIN public.sections s
            ON s.id=e.section_id AND s.school_id=e.school_id
          WHERE e.id=_enrollment_id
            AND e.school_id=_school_id
            AND s.homeroom_teacher_id=_user_id
        )
      );
$$;

REVOKE EXECUTE ON FUNCTION public.can_view_student_attendance(uuid,uuid), public.can_mark_student_attendance(uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_student_attendance(uuid,uuid), public.can_mark_student_attendance(uuid,uuid,uuid) TO authenticated;

CREATE TABLE public.student_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  attendance_date date NOT NULL,
  status public.student_attendance_status NOT NULL,
  notes text,
  marked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,student_id,attendance_date),
  FOREIGN KEY (student_id,school_id) REFERENCES public.students(id,school_id) ON DELETE RESTRICT,
  FOREIGN KEY (enrollment_id) REFERENCES public.student_enrollments(id) ON DELETE RESTRICT
);

CREATE TABLE public.staff_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  attendance_date date NOT NULL,
  status public.staff_attendance_status NOT NULL,
  check_in time,
  check_out time,
  notes text,
  marked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,employee_id,attendance_date),
  FOREIGN KEY (employee_id,school_id) REFERENCES public.employees(id,school_id) ON DELETE RESTRICT,
  CHECK (check_in IS NULL OR check_out IS NULL OR check_out >= check_in)
);

CREATE INDEX student_attendance_school_date_idx ON public.student_attendance(school_id,attendance_date);
CREATE INDEX student_attendance_student_date_idx ON public.student_attendance(student_id,attendance_date DESC);
CREATE INDEX staff_attendance_school_date_idx ON public.staff_attendance(school_id,attendance_date);
CREATE INDEX staff_attendance_employee_date_idx ON public.staff_attendance(employee_id,attendance_date DESC);

GRANT SELECT, INSERT, UPDATE ON public.student_attendance, public.staff_attendance TO authenticated;
GRANT ALL ON public.student_attendance, public.staff_attendance TO service_role;
ALTER TABLE public.student_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized roles can view student attendance" ON public.student_attendance
  FOR SELECT TO authenticated USING (public.can_view_student_attendance(auth.uid(),school_id));
CREATE POLICY "Authorized roles can add student attendance" ON public.student_attendance
  FOR INSERT TO authenticated WITH CHECK (public.can_mark_student_attendance(auth.uid(),school_id,enrollment_id));
CREATE POLICY "Authorized roles can update student attendance" ON public.student_attendance
  FOR UPDATE TO authenticated USING (public.can_mark_student_attendance(auth.uid(),school_id,enrollment_id))
  WITH CHECK (public.can_mark_student_attendance(auth.uid(),school_id,enrollment_id));

CREATE POLICY "Authorized roles can view staff attendance" ON public.staff_attendance
  FOR SELECT TO authenticated USING (public.can_view_staff(auth.uid(),school_id));
CREATE POLICY "Staff managers can add staff attendance" ON public.staff_attendance
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_staff(auth.uid(),school_id));
CREATE POLICY "Staff managers can update staff attendance" ON public.staff_attendance
  FOR UPDATE TO authenticated USING (public.can_manage_staff(auth.uid(),school_id))
  WITH CHECK (public.can_manage_staff(auth.uid(),school_id));

CREATE TRIGGER student_attendance_set_updated_at BEFORE UPDATE ON public.student_attendance
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER staff_attendance_set_updated_at BEFORE UPDATE ON public.staff_attendance
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.student_attendance_before_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e public.student_enrollments; y public.academic_years;
BEGIN
  IF TG_OP='UPDATE' THEN
    NEW.school_id := OLD.school_id;
    NEW.academic_year_id := OLD.academic_year_id;
    NEW.student_id := OLD.student_id;
    NEW.enrollment_id := OLD.enrollment_id;
    NEW.attendance_date := OLD.attendance_date;
  END IF;

  SELECT * INTO e FROM public.student_enrollments
  WHERE id=NEW.enrollment_id AND school_id=NEW.school_id;
  IF NOT FOUND OR e.student_id<>NEW.student_id OR e.academic_year_id<>NEW.academic_year_id THEN
    RAISE EXCEPTION 'بيانات تسجيل الطالب لا تطابق سجل الحضور';
  END IF;

  SELECT * INTO y FROM public.academic_years
  WHERE id=NEW.academic_year_id AND school_id=NEW.school_id;
  IF NOT FOUND OR NEW.attendance_date<y.start_date OR NEW.attendance_date>y.end_date THEN
    RAISE EXCEPTION 'تاريخ الحضور خارج السنة الدراسية';
  END IF;
  IF NEW.attendance_date>current_date THEN RAISE EXCEPTION 'لا يمكن تسجيل حضور بتاريخ مستقبلي'; END IF;

  NEW.notes := nullif(trim(NEW.notes),'');
  NEW.marked_by := coalesce(auth.uid(),NEW.marked_by);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.staff_attendance_before_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e public.employees;
BEGIN
  IF TG_OP='UPDATE' THEN
    NEW.school_id := OLD.school_id;
    NEW.employee_id := OLD.employee_id;
    NEW.attendance_date := OLD.attendance_date;
  END IF;

  SELECT * INTO e FROM public.employees WHERE id=NEW.employee_id AND school_id=NEW.school_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'الموظف لا يتبع المدرسة'; END IF;
  IF NEW.attendance_date<e.hire_date THEN RAISE EXCEPTION 'تاريخ الحضور يسبق تاريخ تعيين الموظف'; END IF;
  IF NEW.attendance_date>current_date THEN RAISE EXCEPTION 'لا يمكن تسجيل حضور بتاريخ مستقبلي'; END IF;

  NEW.notes := nullif(trim(NEW.notes),'');
  NEW.marked_by := coalesce(auth.uid(),NEW.marked_by);
  RETURN NEW;
END $$;

CREATE TRIGGER student_attendance_before_write BEFORE INSERT OR UPDATE ON public.student_attendance
  FOR EACH ROW EXECUTE FUNCTION public.student_attendance_before_write();
CREATE TRIGGER staff_attendance_before_write BEFORE INSERT OR UPDATE ON public.staff_attendance
  FOR EACH ROW EXECUTE FUNCTION public.staff_attendance_before_write();

CREATE OR REPLACE FUNCTION public.audit_attendance_module()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE act text; meta jsonb;
BEGIN
  IF TG_OP='UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status
      AND OLD.notes IS NOT DISTINCT FROM NEW.notes
      AND (TG_TABLE_NAME<>'staff_attendance' OR (
        to_jsonb(OLD) ->> 'check_in' IS NOT DISTINCT FROM to_jsonb(NEW) ->> 'check_in'
        AND to_jsonb(OLD) ->> 'check_out' IS NOT DISTINCT FROM to_jsonb(NEW) ->> 'check_out'
      )) THEN
    RETURN NULL;
  END IF;
  act := TG_TABLE_NAME || CASE WHEN TG_OP='INSERT' THEN '.created' ELSE '.updated' END;
  meta := jsonb_build_object(
    'attendance_date',NEW.attendance_date,
    'status',NEW.status,
    'previous_status',CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD.status) ELSE NULL END
  );
  INSERT INTO public.audit_logs(school_id,user_id,action,entity_type,entity_id,metadata)
  VALUES (NEW.school_id,auth.uid(),act,TG_TABLE_NAME,NEW.id,meta);
  RETURN NULL;
END $$;

CREATE TRIGGER audit_student_attendance AFTER INSERT OR UPDATE ON public.student_attendance
  FOR EACH ROW EXECUTE FUNCTION public.audit_attendance_module();
CREATE TRIGGER audit_staff_attendance AFTER INSERT OR UPDATE ON public.staff_attendance
  FOR EACH ROW EXECUTE FUNCTION public.audit_attendance_module();

REVOKE EXECUTE ON FUNCTION public.student_attendance_before_write(), public.staff_attendance_before_write(), public.audit_attendance_module() FROM PUBLIC, anon, authenticated;
