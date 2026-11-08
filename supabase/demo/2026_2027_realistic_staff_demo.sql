-- Demo-only staff seed for مدرسة مدار التجريبية.
-- Run after 20260929100000_add_staff_management.sql. Safe to re-run.

BEGIN;

DO $seed$
DECLARE
  v_school_id uuid;
  v_owner_id uuid;
  v_department_id uuid;
  v_count integer;
  r record;
BEGIN
  SELECT count(*), (array_agg(id))[1] INTO v_count, v_school_id
  FROM public.schools
  WHERE name_ar = 'مدرسة مدار التجريبية';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one target school; found %', v_count;
  END IF;

  SELECT count(*), (array_agg(ur.user_id))[1] INTO v_count, v_owner_id
  FROM public.user_roles ur
  JOIN public.school_members sm
    ON sm.school_id = ur.school_id AND sm.user_id = ur.user_id AND sm.status = 'active'
  WHERE ur.school_id = v_school_id AND ur.role = 'school_owner';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one active school owner; found %', v_count;
  END IF;

  PERFORM set_config('request.jwt.claim.sub',v_owner_id::text,true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_owner_id,'role','authenticated')::text,
    true
  );

  IF EXISTS (
    SELECT 1 FROM public.employees
    WHERE school_id = v_school_id
      AND employee_number LIKE 'DEMO-STAFF-%'
      AND NOT is_demo
  ) THEN
    RAISE EXCEPTION 'A non-demo employee uses the reserved DEMO-STAFF number range';
  END IF;

  FOR r IN SELECT * FROM (VALUES
    ('الإدارة'),
    ('التدريس'),
    ('المالية'),
    ('التسجيل'),
    ('الموارد البشرية'),
    ('الصيانة')
  ) x(name) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.departments
      WHERE school_id = v_school_id AND name = r.name
    ) THEN
      INSERT INTO public.departments (school_id,name,is_active,is_demo)
      VALUES (v_school_id,r.name,true,true);
    END IF;
  END LOOP;

  FOR r IN SELECT * FROM (VALUES
    ('DEMO-STAFF-001','خالد محمود أبو عودة','900100001','0598101001','khaled.abouda@madar-demo.edu','male','1982-04-18','غزة - الرمال','مدير المدرسة','الإدارة','full_time','2021-08-15',false,'active'),
    ('DEMO-STAFF-002','سمر أحمد النجار','900100002','0598101002','samar.najjar@madar-demo.edu','female','1988-11-03','غزة - النصر','مسؤولة الموارد البشرية','الموارد البشرية','full_time','2022-01-10',false,'active'),
    ('DEMO-STAFF-003','نادر يوسف الحداد','900100003','0598101003','nader.haddad@madar-demo.edu','male','1985-06-27','غزة - تل الهوى','محاسب المدرسة','المالية','full_time','2021-09-01',false,'active'),
    ('DEMO-STAFF-004','ريم سامي المصري','900100004','0598101004','reem.masri@madar-demo.edu','female','1992-02-14','غزة - الشيخ عجلين','مسؤولة التسجيل','التسجيل','full_time','2023-02-05',false,'active'),
    ('DEMO-STAFF-005','أحمد فؤاد الخطيب','900100005','0598101005','ahmad.khatib@madar-demo.edu','male','1987-09-21','غزة - الزيتون','معلم لغة عربية','التدريس','full_time','2020-08-20',true,'active'),
    ('DEMO-STAFF-006','ميساء رائد منصور','900100006','0598101006','maysaa.mansour@madar-demo.edu','female','1990-05-09','غزة - الرمال','معلمة رياضيات','التدريس','full_time','2021-08-22',true,'active'),
    ('DEMO-STAFF-007','يوسف عادل الشوا','900100007','0598101007','yousef.shawwa@madar-demo.edu','male','1989-12-16','غزة - الشجاعية','معلم علوم','التدريس','full_time','2022-08-18',true,'active'),
    ('DEMO-STAFF-008','هبة أمين رضوان','900100008','0598101008','heba.radwan@madar-demo.edu','female','1994-07-30','غزة - الدرج','معلمة لغة إنجليزية','التدريس','full_time','2023-08-24',true,'active'),
    ('DEMO-STAFF-009','رامي حسن صيام','900100009','0598101009','rami.siam@madar-demo.edu','male','1986-03-12','غزة - الرمال','معلم دراسات اجتماعية','التدريس','part_time','2024-01-15',true,'active'),
    ('DEMO-STAFF-010','دعاء وليد زقوت','900100010','0598101010','doaa.zaqout@madar-demo.edu','female','1991-10-25','غزة - النصر','معلمة حاسوب','التدريس','contract','2024-08-25',true,'active'),
    ('DEMO-STAFF-011','محمود صبحي قدورة','900100011','0598101011','mahmoud.qaddoura@madar-demo.edu','male','1979-01-08','غزة - التفاح','فني صيانة','الصيانة','full_time','2022-03-01',false,'active'),
    ('DEMO-STAFF-012','لينا طارق شاهين','900100012','0598101012','lina.shaheen@madar-demo.edu','female','1993-08-19','غزة - الصبرة','معلمة تربية فنية','التدريس','temporary','2025-08-20',true,'inactive')
  ) x(employee_number,full_name,national_id,phone,email,gender,date_of_birth,address,job_title,department_name,employment_type,hire_date,is_teacher,status) LOOP
    SELECT id INTO v_department_id
    FROM public.departments
    WHERE school_id = v_school_id AND name = r.department_name
    ORDER BY created_at
    LIMIT 1;

    IF NOT EXISTS (
      SELECT 1 FROM public.employees
      WHERE school_id = v_school_id
        AND employee_number = r.employee_number
        AND is_demo
    ) THEN
      INSERT INTO public.employees (
        school_id,employee_number,full_name,national_id,phone,email,gender,date_of_birth,
        address,job_title,department_id,employment_type,hire_date,is_teacher,notes,status,
        created_by,is_demo
      ) VALUES (
        v_school_id,r.employee_number,r.full_name,r.national_id,r.phone,r.email,
        r.gender::public.gender,r.date_of_birth::date,r.address,r.job_title,v_department_id,
        r.employment_type::public.employment_type,r.hire_date::date,r.is_teacher,
        'بيانات موظف تجريبية للعرض والتدريب فقط',r.status::public.employee_status,
        v_owner_id,true
      );
    END IF;
  END LOOP;
END $seed$;

COMMIT;
