CREATE TYPE public.employment_type AS ENUM ('full_time','part_time','contract','temporary');
CREATE TYPE public.employee_status AS ENUM ('active','inactive','on_leave','terminated');

CREATE OR REPLACE FUNCTION public.can_manage_staff(_user_id uuid, _school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.can_manage_school(_user_id,_school_id)
      OR public.has_role(_user_id,_school_id,'hr');
$$;

CREATE OR REPLACE FUNCTION public.can_view_staff(_user_id uuid, _school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.can_manage_staff(_user_id,_school_id)
      OR public.has_role(_user_id,_school_id,'accountant')
      OR public.has_role(_user_id,_school_id,'registrar');
$$;

REVOKE EXECUTE ON FUNCTION public.can_manage_staff(uuid,uuid), public.can_view_staff(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_staff(uuid,uuid), public.can_view_staff(uuid,uuid) TO authenticated;

CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  is_active boolean NOT NULL DEFAULT true,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,name),
  UNIQUE (id,school_id)
);

CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  employee_number text NOT NULL DEFAULT '',
  full_name text NOT NULL CHECK (length(trim(full_name)) > 0),
  national_id text,
  phone text,
  email text,
  gender public.gender,
  date_of_birth date,
  address text,
  job_title text NOT NULL CHECK (length(trim(job_title)) > 0),
  department_id uuid,
  employment_type public.employment_type NOT NULL DEFAULT 'full_time',
  hire_date date NOT NULL DEFAULT current_date,
  is_teacher boolean NOT NULL DEFAULT false,
  notes text,
  status public.employee_status NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,employee_number),
  UNIQUE (id,school_id),
  FOREIGN KEY (department_id,school_id) REFERENCES public.departments(id,school_id) ON DELETE RESTRICT,
  CHECK (date_of_birth IS NULL OR date_of_birth < hire_date)
);

CREATE UNIQUE INDEX employees_school_national_id_idx
  ON public.employees(school_id,national_id)
  WHERE national_id IS NOT NULL AND trim(national_id) <> '';
CREATE INDEX employees_school_status_idx ON public.employees(school_id,status);
CREATE INDEX employees_school_department_idx ON public.employees(school_id,department_id);

GRANT SELECT, INSERT, UPDATE ON public.departments, public.employees TO authenticated;
GRANT ALL ON public.departments, public.employees TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized staff can view departments" ON public.departments
  FOR SELECT TO authenticated USING (public.can_view_staff(auth.uid(),school_id));
CREATE POLICY "Staff managers can add departments" ON public.departments
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_staff(auth.uid(),school_id));
CREATE POLICY "Staff managers can edit departments" ON public.departments
  FOR UPDATE TO authenticated USING (public.can_manage_staff(auth.uid(),school_id))
  WITH CHECK (public.can_manage_staff(auth.uid(),school_id));

CREATE POLICY "Authorized staff can view employees" ON public.employees
  FOR SELECT TO authenticated USING (public.can_view_staff(auth.uid(),school_id));
CREATE POLICY "Staff managers can add employees" ON public.employees
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_staff(auth.uid(),school_id));
CREATE POLICY "Staff managers can edit employees" ON public.employees
  FOR UPDATE TO authenticated USING (public.can_manage_staff(auth.uid(),school_id))
  WITH CHECK (public.can_manage_staff(auth.uid(),school_id));

CREATE TRIGGER departments_set_updated_at BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER employees_set_updated_at BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.employees_before_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF trim(NEW.employee_number) = '' THEN
      PERFORM pg_advisory_xact_lock(hashtext('employee_no_' || NEW.school_id::text));
      SELECT count(*) + 1 INTO n FROM public.employees WHERE school_id = NEW.school_id;
      NEW.employee_number := 'EMP-' || to_char(NEW.hire_date,'YYYY') || '-' || lpad(n::text,4,'0');
    ELSE
      NEW.employee_number := trim(NEW.employee_number);
    END IF;
    NEW.created_by := coalesce(auth.uid(),NEW.created_by);
  ELSE
    NEW.school_id := OLD.school_id;
    NEW.created_by := OLD.created_by;
    NEW.employee_number := trim(NEW.employee_number);
  END IF;
  NEW.full_name := trim(NEW.full_name);
  NEW.job_title := trim(NEW.job_title);
  NEW.national_id := nullif(trim(NEW.national_id),'');
  NEW.email := nullif(lower(trim(NEW.email)),'');
  RETURN NEW;
END $$;

CREATE TRIGGER employees_before_write BEFORE INSERT OR UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.employees_before_write();

CREATE OR REPLACE FUNCTION public.audit_staff_module()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE act text; meta jsonb := '{}'::jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    act := 'employee.created';
    meta := jsonb_build_object('employee_number',NEW.employee_number,'full_name',NEW.full_name);
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    act := CASE
      WHEN NEW.status = 'inactive' THEN 'employee.deactivated'
      WHEN OLD.status = 'inactive' AND NEW.status = 'active' THEN 'employee.reactivated'
      ELSE 'employee.status_changed'
    END;
    meta := jsonb_build_object('from',OLD.status,'to',NEW.status);
  ELSE
    act := 'employee.updated';
    meta := jsonb_build_object(
      'old',jsonb_build_object('full_name',OLD.full_name,'job_title',OLD.job_title,'department_id',OLD.department_id),
      'new',jsonb_build_object('full_name',NEW.full_name,'job_title',NEW.job_title,'department_id',NEW.department_id)
    );
  END IF;
  INSERT INTO public.audit_logs(school_id,user_id,action,entity_type,entity_id,metadata)
  VALUES (NEW.school_id,auth.uid(),act,'employees',NEW.id,meta);
  RETURN NULL;
END $$;

CREATE TRIGGER audit_employees AFTER INSERT OR UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.audit_staff_module();

REVOKE EXECUTE ON FUNCTION public.employees_before_write(), public.audit_staff_module() FROM PUBLIC, anon, authenticated;
