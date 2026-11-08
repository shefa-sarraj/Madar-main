
CREATE TYPE public.student_status AS ENUM ('active','new','suspended','withdrawn','transferred','graduated');
CREATE TYPE public.enrollment_status AS ENUM ('active','pending','completed','withdrawn','transferred');
CREATE TYPE public.admission_status AS ENUM ('new','under_review','accepted','rejected','waiting','enrolled');
CREATE TYPE public.structure_status AS ENUM ('active','archived');
CREATE TYPE public.gender AS ENUM ('male','female');

CREATE OR REPLACE FUNCTION public.can_manage_students(_user_id uuid, _school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.can_manage_school(_user_id,_school_id) OR public.has_role(_user_id,_school_id,'registrar');
$$;
CREATE OR REPLACE FUNCTION public.can_view_students(_user_id uuid, _school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.can_manage_students(_user_id,_school_id) OR public.has_role(_user_id,_school_id,'accountant');
$$;
CREATE OR REPLACE FUNCTION public.can_view_structure(_user_id uuid, _school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.can_view_students(_user_id,_school_id) OR public.has_role(_user_id,_school_id,'teacher');
$$;
REVOKE EXECUTE ON FUNCTION public.can_manage_students(uuid,uuid), public.can_view_students(uuid,uuid), public.can_view_structure(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_students(uuid,uuid), public.can_view_students(uuid,uuid), public.can_view_structure(uuid,uuid) TO authenticated;

-- STRUCTURE
CREATE TABLE public.stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL, order_index int NOT NULL DEFAULT 0,
  status structure_status NOT NULL DEFAULT 'active', is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, school_id)
);
CREATE TABLE public.grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL,
  name text NOT NULL, order_index int NOT NULL DEFAULT 0,
  status structure_status NOT NULL DEFAULT 'active', is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, school_id),
  FOREIGN KEY (stage_id, school_id) REFERENCES public.stages(id, school_id) ON DELETE RESTRICT
);
CREATE TABLE public.sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  grade_id uuid NOT NULL,
  name text NOT NULL, capacity int CHECK (capacity IS NULL OR capacity >= 0),
  homeroom_teacher_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status structure_status NOT NULL DEFAULT 'active', is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, school_id),
  FOREIGN KEY (grade_id, school_id) REFERENCES public.grades(id, school_id) ON DELETE RESTRICT
);

-- PEOPLE
CREATE TABLE public.guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  full_name text NOT NULL, relationship text, phone text NOT NULL,
  secondary_phone text, email text, address text, occupation text, notes text,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, school_id)
);
CREATE INDEX guardians_school_phone_idx ON public.guardians(school_id, phone);

CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_number text NOT NULL,
  first_name text NOT NULL, middle_name text, last_name text NOT NULL, full_name text NOT NULL DEFAULT '',
  gender gender NOT NULL, date_of_birth date, place_of_birth text, nationality text, address text,
  phone text, emergency_phone text, enrollment_date date NOT NULL DEFAULT current_date,
  status student_status NOT NULL DEFAULT 'new', photo_url text, medical_notes text,
  administrative_notes text, previous_school text, is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, student_number), UNIQUE (id, school_id)
);

CREATE TABLE public.student_guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL, guardian_id uuid NOT NULL,
  relationship text NOT NULL DEFAULT 'ولي أمر', is_primary boolean NOT NULL DEFAULT false,
  can_pickup boolean NOT NULL DEFAULT true, receives_notifications boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, guardian_id),
  FOREIGN KEY (student_id, school_id) REFERENCES public.students(id, school_id) ON DELETE CASCADE,
  FOREIGN KEY (guardian_id, school_id) REFERENCES public.guardians(id, school_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX student_guardians_one_primary ON public.student_guardians(student_id) WHERE is_primary;

CREATE TABLE public.student_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  grade_id uuid NOT NULL, section_id uuid,
  enrollment_status enrollment_status NOT NULL DEFAULT 'active',
  start_date date NOT NULL DEFAULT current_date, end_date date, notes text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (student_id, school_id) REFERENCES public.students(id, school_id) ON DELETE CASCADE,
  FOREIGN KEY (grade_id, school_id) REFERENCES public.grades(id, school_id) ON DELETE RESTRICT,
  FOREIGN KEY (section_id, school_id) REFERENCES public.sections(id, school_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX student_enrollments_one_active_per_year ON public.student_enrollments(student_id, academic_year_id) WHERE enrollment_status IN ('active','pending');

CREATE TABLE public.admission_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  application_number text NOT NULL,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  student_first_name text NOT NULL, student_middle_name text, student_last_name text NOT NULL,
  date_of_birth date, gender gender, requested_grade_id uuid NOT NULL,
  guardian_name text NOT NULL, guardian_phone text NOT NULL, guardian_email text,
  previous_school text, notes text, status admission_status NOT NULL DEFAULT 'new',
  submitted_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  converted_student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, application_number),
  FOREIGN KEY (requested_grade_id, school_id) REFERENCES public.grades(id, school_id) ON DELETE RESTRICT
);

CREATE TABLE public.student_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  document_type text NOT NULL, file_url text NOT NULL, file_name text NOT NULL,
  expiry_date date, notes text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (student_id, school_id) REFERENCES public.students(id, school_id) ON DELETE CASCADE
);

-- GRANTS + RLS
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['stages','grades','sections','guardians','students','student_guardians','student_enrollments','admission_applications','student_documents'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['stages','grades','sections'] LOOP
    EXECUTE format('CREATE POLICY "Staff can view %1$s" ON public.%1$I FOR SELECT TO authenticated USING (public.can_view_structure(auth.uid(), school_id))', t);
    EXECUTE format('CREATE POLICY "Registrars can add %1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (public.can_manage_students(auth.uid(), school_id))', t);
    EXECUTE format('CREATE POLICY "Registrars can edit %1$s" ON public.%1$I FOR UPDATE TO authenticated USING (public.can_manage_students(auth.uid(), school_id)) WITH CHECK (public.can_manage_students(auth.uid(), school_id))', t);
    EXECUTE format('CREATE POLICY "Managers can delete %1$s" ON public.%1$I FOR DELETE TO authenticated USING (public.can_manage_school(auth.uid(), school_id))', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['guardians','students','student_guardians','student_enrollments','student_documents'] LOOP
    EXECUTE format('CREATE POLICY "Authorized staff can view %1$s" ON public.%1$I FOR SELECT TO authenticated USING (public.can_view_students(auth.uid(), school_id))', t);
    EXECUTE format('CREATE POLICY "Registrars can add %1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (public.can_manage_students(auth.uid(), school_id))', t);
    EXECUTE format('CREATE POLICY "Registrars can edit %1$s" ON public.%1$I FOR UPDATE TO authenticated USING (public.can_manage_students(auth.uid(), school_id)) WITH CHECK (public.can_manage_students(auth.uid(), school_id))', t);
    EXECUTE format('CREATE POLICY "Registrars can delete %1$s" ON public.%1$I FOR DELETE TO authenticated USING (public.can_manage_students(auth.uid(), school_id))', t);
  END LOOP;
END $$;
CREATE POLICY "Registrars can view applications" ON public.admission_applications FOR SELECT TO authenticated USING (public.can_manage_students(auth.uid(), school_id));
CREATE POLICY "Registrars can add applications" ON public.admission_applications FOR INSERT TO authenticated WITH CHECK (public.can_manage_students(auth.uid(), school_id));
CREATE POLICY "Registrars can edit applications" ON public.admission_applications FOR UPDATE TO authenticated USING (public.can_manage_students(auth.uid(), school_id)) WITH CHECK (public.can_manage_students(auth.uid(), school_id));
CREATE POLICY "Managers can delete applications" ON public.admission_applications FOR DELETE TO authenticated USING (public.can_manage_school(auth.uid(), school_id) AND status <> 'enrolled');

-- updated_at
CREATE TRIGGER stages_set_updated_at BEFORE UPDATE ON public.stages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER grades_set_updated_at BEFORE UPDATE ON public.grades FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER sections_set_updated_at BEFORE UPDATE ON public.sections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER guardians_set_updated_at BEFORE UPDATE ON public.guardians FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER students_set_updated_at BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER student_enrollments_set_updated_at BEFORE UPDATE ON public.student_enrollments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER admission_applications_set_updated_at BEFORE UPDATE ON public.admission_applications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- numbering + full name
CREATE OR REPLACE FUNCTION public.students_before_write() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n int;
BEGIN
  NEW.full_name := trim(regexp_replace(concat_ws(' ', NEW.first_name, NULLIF(NEW.middle_name,''), NEW.last_name), '\s+', ' ', 'g'));
  IF TG_OP = 'INSERT' AND (NEW.student_number IS NULL OR trim(NEW.student_number) = '') THEN
    PERFORM pg_advisory_xact_lock(hashtext('student_no_' || NEW.school_id::text));
    SELECT COALESCE(MAX(NULLIF(regexp_replace(student_number, '\D', '', 'g'), '')::bigint), 1000) + 1 INTO n
      FROM public.students WHERE school_id = NEW.school_id AND student_number ~ '^S-\d+$';
    NEW.student_number := 'S-' || n;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER students_before_write BEFORE INSERT OR UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.students_before_write();

CREATE OR REPLACE FUNCTION public.applications_before_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n int;
BEGIN
  IF NEW.application_number IS NULL OR trim(NEW.application_number) = '' THEN
    PERFORM pg_advisory_xact_lock(hashtext('app_no_' || NEW.school_id::text));
    SELECT COUNT(*) + 1 INTO n FROM public.admission_applications WHERE school_id = NEW.school_id;
    NEW.application_number := 'A-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER applications_before_insert BEFORE INSERT ON public.admission_applications FOR EACH ROW EXECUTE FUNCTION public.applications_before_insert();

-- AUDIT
CREATE OR REPLACE FUNCTION public.audit_student_module() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE act text; rec record; meta jsonb := '{}'::jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN rec := OLD; ELSE rec := NEW; END IF;
  IF TG_TABLE_NAME = 'students' THEN
    IF TG_OP = 'INSERT' THEN act := 'student.created';
    ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN act := 'student.status_changed'; meta := jsonb_build_object('from', OLD.status, 'to', NEW.status);
    ELSIF TG_OP = 'UPDATE' THEN act := 'student.updated';
    ELSE act := 'student.deleted'; END IF;
  ELSIF TG_TABLE_NAME = 'guardians' THEN act := 'guardian.' || lower(TG_OP);
  ELSIF TG_TABLE_NAME = 'student_guardians' THEN act := 'guardian_link.' || lower(TG_OP);
  ELSIF TG_TABLE_NAME = 'student_enrollments' THEN act := 'enrollment.' || lower(TG_OP);
  ELSIF TG_TABLE_NAME = 'student_documents' THEN act := CASE TG_OP WHEN 'INSERT' THEN 'document.uploaded' ELSE 'document.deleted' END;
  ELSIF TG_TABLE_NAME = 'admission_applications' THEN
    IF TG_OP = 'INSERT' THEN act := 'admission.created';
    ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
      act := CASE NEW.status WHEN 'accepted' THEN 'admission.accepted' WHEN 'rejected' THEN 'admission.rejected' WHEN 'enrolled' THEN 'admission.converted' ELSE 'admission.status_changed' END;
      meta := jsonb_build_object('from', OLD.status, 'to', NEW.status);
    ELSE RETURN NULL; END IF;
  END IF;
  INSERT INTO public.audit_logs(school_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (rec.school_id, auth.uid(), act, TG_TABLE_NAME, rec.id, meta);
  RETURN NULL;
END $$;
CREATE TRIGGER audit_students AFTER INSERT OR UPDATE OR DELETE ON public.students FOR EACH ROW EXECUTE FUNCTION public.audit_student_module();
CREATE TRIGGER audit_guardians AFTER INSERT OR UPDATE OR DELETE ON public.guardians FOR EACH ROW EXECUTE FUNCTION public.audit_student_module();
CREATE TRIGGER audit_student_guardians AFTER INSERT OR UPDATE OR DELETE ON public.student_guardians FOR EACH ROW EXECUTE FUNCTION public.audit_student_module();
CREATE TRIGGER audit_enrollments AFTER INSERT OR UPDATE OR DELETE ON public.student_enrollments FOR EACH ROW EXECUTE FUNCTION public.audit_student_module();
CREATE TRIGGER audit_documents AFTER INSERT OR DELETE ON public.student_documents FOR EACH ROW EXECUTE FUNCTION public.audit_student_module();
CREATE TRIGGER audit_applications AFTER INSERT OR UPDATE ON public.admission_applications FOR EACH ROW EXECUTE FUNCTION public.audit_student_module();

-- CONVERSION (atomic, idempotent)
CREATE OR REPLACE FUNCTION public.convert_admission_application(_application_id uuid, _section_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE app public.admission_applications; g_id uuid; s_id uuid;
BEGIN
  SELECT * INTO app FROM public.admission_applications WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;
  IF NOT public.can_manage_students(auth.uid(), app.school_id) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF app.status = 'enrolled' OR app.converted_student_id IS NOT NULL THEN RAISE EXCEPTION 'تم تحويل هذا الطلب مسبقاً'; END IF;
  IF app.status <> 'accepted' THEN RAISE EXCEPTION 'يجب قبول الطلب قبل التسجيل'; END IF;
  IF _section_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.sections WHERE id=_section_id AND school_id=app.school_id AND grade_id=app.requested_grade_id AND academic_year_id=app.academic_year_id) THEN
    RAISE EXCEPTION 'الشعبة لا تطابق الصف أو السنة'; END IF;

  SELECT id INTO g_id FROM public.guardians WHERE school_id = app.school_id
    AND (phone = app.guardian_phone OR (app.guardian_email IS NOT NULL AND lower(email) = lower(app.guardian_email))) LIMIT 1;
  IF g_id IS NULL THEN
    INSERT INTO public.guardians(school_id, full_name, phone, email, is_demo)
    VALUES (app.school_id, app.guardian_name, app.guardian_phone, app.guardian_email, app.is_demo) RETURNING id INTO g_id;
  END IF;
  INSERT INTO public.students(school_id, student_number, first_name, middle_name, last_name, gender, date_of_birth, previous_school, status, administrative_notes, is_demo)
  VALUES (app.school_id, NULL, app.student_first_name, app.student_middle_name, app.student_last_name, COALESCE(app.gender,'male'), app.date_of_birth, app.previous_school, 'new',
          'مُسجل من طلب القبول ' || app.application_number, app.is_demo) RETURNING id INTO s_id;
  INSERT INTO public.student_guardians(school_id, student_id, guardian_id, relationship, is_primary)
  VALUES (app.school_id, s_id, g_id, 'ولي أمر', true);
  INSERT INTO public.student_enrollments(school_id, student_id, academic_year_id, grade_id, section_id, enrollment_status)
  VALUES (app.school_id, s_id, app.academic_year_id, app.requested_grade_id, _section_id, 'active');
  UPDATE public.admission_applications SET status='enrolled', converted_student_id=s_id, reviewed_at=now(), reviewed_by=auth.uid() WHERE id=app.id;
  RETURN s_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.convert_admission_application(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_admission_application(uuid,uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.students_before_write(), public.applications_before_insert(), public.audit_student_module() FROM PUBLIC, anon, authenticated;

-- STORAGE policies (bucket created separately; path = school_id/student_id/file)
CREATE POLICY "Staff can read student documents" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'student-documents' AND public.can_view_students(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY "Registrars can upload student documents" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'student-documents' AND public.can_manage_students(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY "Registrars can delete student documents" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'student-documents' AND public.can_manage_students(auth.uid(), ((storage.foldername(name))[1])::uuid));
