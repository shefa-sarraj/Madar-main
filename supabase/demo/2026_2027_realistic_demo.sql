-- Realistic demo-only seed for مدرسة مدار التجريبية, 2026/2027.
-- Standalone seed: never add this file to the production migration chain.

BEGIN;

DO $seed$
DECLARE
  v_school_id uuid;
  v_year_id uuid;
  v_owner_id uuid;
  v_count integer;
  v_stage_id uuid;
  v_grade_id uuid;
  v_section_id uuid;
  v_student_id uuid;
  v_guardian_id uuid;
  v_category_id uuid;
  v_structure_id uuid;
  v_fee_id uuid;
  v_tuition_fee_id uuid;
  v_registration_fee_id uuid;
  v_installment_id uuid;
  v_discount_id uuid;
  v_payment_id uuid;
  v_expense_category_id uuid;
  v_cost_center_id uuid;
  v_amount numeric(12,2);
  v_total numeric(12,2);
  v_first_amount numeric(12,2);
  v_second_amount numeric(12,2);
  v_third_amount numeric(12,2);
  v_allocations jsonb;
  r record;
BEGIN
  SELECT count(*), (array_agg(id))[1] INTO v_count, v_school_id
  FROM public.schools WHERE name_ar = 'مدرسة مدار التجريبية';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one target school; found %', v_count;
  END IF;

  SELECT count(*), (array_agg(id))[1] INTO v_count, v_year_id
  FROM public.academic_years
  WHERE school_id=v_school_id AND name='2026/2027' AND is_active AND status='active';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one active academic year 2026/2027; found %', v_count;
  END IF;

  SELECT count(*), (array_agg(ur.user_id))[1] INTO v_count, v_owner_id
  FROM public.user_roles ur
  JOIN public.school_members sm
    ON sm.school_id=ur.school_id AND sm.user_id=ur.user_id AND sm.status='active'
  WHERE ur.school_id=v_school_id AND ur.role='school_owner';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one active school owner; found %', v_count;
  END IF;

  -- Transaction-local identity lets existing RPCs authorize and attribute audit rows.
  PERFORM set_config('request.jwt.claim.sub',v_owner_id::text,true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_owner_id,'role','authenticated')::text,
    true
  );

  IF EXISTS (
    SELECT 1 FROM public.students
    WHERE school_id=v_school_id AND student_number LIKE 'DEMO-2627-%' AND NOT is_demo
  ) THEN
    RAISE EXCEPTION 'A non-demo student uses the reserved DEMO-2627 number range';
  END IF;

  FOR r IN SELECT * FROM (VALUES
    ('المرحلة الأساسية الدنيا',1),
    ('المرحلة الأساسية العليا',2),
    ('المرحلة الثانوية',3)
  ) x(name,order_index) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.stages
      WHERE school_id=v_school_id AND name=r.name AND is_demo
    ) THEN
      INSERT INTO public.stages (school_id,name,order_index,status,is_demo)
      VALUES (v_school_id,r.name,r.order_index,'active',true);
    END IF;
  END LOOP;

  FOR r IN SELECT * FROM (VALUES
    ('الصف الأول','المرحلة الأساسية الدنيا',1),
    ('الصف الثاني','المرحلة الأساسية الدنيا',2),
    ('الصف الخامس','المرحلة الأساسية العليا',5),
    ('الصف السادس','المرحلة الأساسية العليا',6),
    ('الصف العاشر','المرحلة الثانوية',10),
    ('الصف الحادي عشر','المرحلة الثانوية',11)
  ) x(name,stage_name,order_index) LOOP
    SELECT id INTO v_stage_id FROM public.stages
    WHERE school_id=v_school_id AND name=r.stage_name AND is_demo
    ORDER BY created_at LIMIT 1;
    IF NOT EXISTS (
      SELECT 1 FROM public.grades
      WHERE school_id=v_school_id AND name=r.name AND is_demo
    ) THEN
      INSERT INTO public.grades (school_id,stage_id,name,order_index,status,is_demo)
      VALUES (v_school_id,v_stage_id,r.name,r.order_index,'active',true);
    END IF;
  END LOOP;

  FOR r IN SELECT * FROM (VALUES
    ('الصف الأول','شعبة أ',24),('الصف الأول','شعبة ب',24),
    ('الصف الثاني','شعبة أ',26),
    ('الصف الخامس','شعبة أ',26),('الصف الخامس','شعبة ب',26),
    ('الصف السادس','شعبة أ',28),
    ('الصف العاشر','شعبة أ',24),('الصف الحادي عشر','شعبة أ',24)
  ) x(grade_name,section_name,capacity) LOOP
    SELECT id INTO v_grade_id FROM public.grades
    WHERE school_id=v_school_id AND name=r.grade_name AND is_demo
    ORDER BY created_at LIMIT 1;
    IF NOT EXISTS (
      SELECT 1 FROM public.sections
      WHERE school_id=v_school_id AND academic_year_id=v_year_id
        AND grade_id=v_grade_id AND name=r.section_name AND is_demo
    ) THEN
      INSERT INTO public.sections
        (school_id,academic_year_id,grade_id,name,capacity,status,is_demo)
      VALUES
        (v_school_id,v_year_id,v_grade_id,r.section_name,r.capacity,'active',true);
    END IF;
  END LOOP;

  -- Twenty-two guardians; eight are shared by sibling pairs.
  FOR r IN SELECT * FROM (VALUES
    ('سامر الخطيب','والد','0599001001','مهندس','غزة - الرمال'),
    ('سناء النجار','والدة','0599001002','معلمة','غزة - النصر'),
    ('وائل أبو عيشة','والد','0599001003','صيدلي','غزة - تل الهوى'),
    ('أمل المصري','والدة','0599001004','محاسبة','غزة - الشيخ عجلين'),
    ('حسام الدحدوح','والد','0599001005','تاجر','غزة - الصبرة'),
    ('محمود الشوا','والد','0599001006','موظف','غزة - الشجاعية'),
    ('إياد الحداد','والد','0599001007','طبيب','غزة - الرمال'),
    ('علاء منصور','والد','0599001008','مهندس مدني','غزة - النصر'),
    ('أنس الغزالي','والد','0599001009','فني اتصالات','غزة - التفاح'),
    ('نهى رضوان','والدة','0599001010','ممرضة','غزة - الدرج'),
    ('نادر أبو شمالة','والد','0599001011','سائق','غزة - الزيتون'),
    ('عادل عاشور','والد','0599001012','نجار','غزة - الصبرة'),
    ('طارق صيام','والد','0599001013','محام','غزة - الرمال'),
    ('هالة حمدان','والدة','0599001014','موظفة','غزة - النصر'),
    ('جهاد عوض','والد','0599001015','مقاول','غزة - تل الهوى'),
    ('منى شاهين','والدة','0599001016','معلمة','غزة - الشجاعية'),
    ('سامي بركات','والد','0599001017','صاحب متجر','غزة - التفاح'),
    ('أمجد ياسين','والد','0599001018','مهندس','غزة - الدرج'),
    ('هاني قدورة','والد','0599001019','فني صيانة','غزة - الزيتون'),
    ('دعاء زقوت','والدة','0599001020','طبيبة أسنان','غزة - الرمال'),
    ('زياد السوسي','والد','0599001021','محاسب','غزة - النصر'),
    ('رائد الأغا','والد','0599001022','مدير مبيعات','غزة - تل الهوى')
  ) x(full_name,relationship,phone,occupation,address) LOOP
    IF EXISTS (
      SELECT 1 FROM public.guardians
      WHERE school_id=v_school_id AND phone=r.phone AND NOT is_demo
    ) THEN
      RAISE EXCEPTION 'A non-demo guardian uses reserved phone %',r.phone;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.guardians
      WHERE school_id=v_school_id AND phone=r.phone AND is_demo
    ) THEN
      INSERT INTO public.guardians
        (school_id,full_name,relationship,phone,occupation,address,notes,is_demo)
      VALUES
        (v_school_id,r.full_name,r.relationship,r.phone,r.occupation,r.address,
         'بيانات تجريبية للعرض والتدريب',true);
    END IF;
  END LOOP;

  -- Thirty students with plausible birth dates and three pending enrollments.
  FOR r IN SELECT * FROM (VALUES
    ('DEMO-2627-001','أحمد','سامر','الخطيب','male','2019-10-14','الصف الأول','شعبة أ','active'),
    ('DEMO-2627-002','ليان','سامر','الخطيب','female','2018-06-22','الصف الثاني','شعبة أ','active'),
    ('DEMO-2627-003','يوسف','خالد','النجار','male','2019-11-03','الصف الأول','شعبة أ','active'),
    ('DEMO-2627-004','مريم','خالد','النجار','female','2015-03-18','الصف الخامس','شعبة أ','active'),
    ('DEMO-2627-005','عمر','وائل','أبو عيشة','male','2019-08-27','الصف الأول','شعبة ب','active'),
    ('DEMO-2627-006','سارة','وائل','أبو عيشة','female','2015-12-09','الصف الخامس','شعبة ب','active'),
    ('DEMO-2627-007','آدم','رامي','المصري','male','2018-09-15','الصف الثاني','شعبة أ','active'),
    ('DEMO-2627-008','نور','رامي','المصري','female','2014-05-30','الصف السادس','شعبة أ','active'),
    ('DEMO-2627-009','كريم','حسام','الدحدوح','male','2019-07-11','الصف الأول','شعبة أ','active'),
    ('DEMO-2627-010','جنى','حسام','الدحدوح','female','2018-02-19','الصف الثاني','شعبة أ','active'),
    ('DEMO-2627-011','يزن','محمود','الشوا','male','2015-06-07','الصف الخامس','شعبة أ','active'),
    ('DEMO-2627-012','تالا','محمود','الشوا','female','2014-10-25','الصف السادس','شعبة أ','active'),
    ('DEMO-2627-013','محمد','إياد','الحداد','male','2010-01-17','الصف العاشر','شعبة أ','active'),
    ('DEMO-2627-014','ريتال','إياد','الحداد','female','2009-04-08','الصف الحادي عشر','شعبة أ','active'),
    ('DEMO-2627-015','زيد','علاء','منصور','male','2010-09-21','الصف العاشر','شعبة أ','active'),
    ('DEMO-2627-016','لمى','علاء','منصور','female','2009-12-13','الصف الحادي عشر','شعبة أ','active'),
    ('DEMO-2627-017','ريان','أنس','الغزالي','male','2019-05-06','الصف الأول','شعبة أ','active'),
    ('DEMO-2627-018','سلمى','فادي','رضوان','female','2019-12-01','الصف الأول','شعبة ب','active'),
    ('DEMO-2627-019','حمزة','نادر','أبو شمالة','male','2019-03-24','الصف الأول','شعبة أ','active'),
    ('DEMO-2627-020','دانا','عادل','عاشور','female','2020-01-09','الصف الأول','شعبة ب','pending'),
    ('DEMO-2627-021','أنس','طارق','صيام','male','2018-07-28','الصف الثاني','شعبة أ','active'),
    ('DEMO-2627-022','هبة','مازن','حمدان','female','2018-11-16','الصف الثاني','شعبة أ','active'),
    ('DEMO-2627-023','باسل','جهاد','عوض','male','2015-09-04','الصف الخامس','شعبة أ','active'),
    ('DEMO-2627-024','رنا','أسامة','شاهين','female','2015-01-26','الصف الخامس','شعبة ب','active'),
    ('DEMO-2627-025','معاذ','سامي','بركات','male','2015-11-12','الصف الخامس','شعبة ب','pending'),
    ('DEMO-2627-026','شهد','أمجد','ياسين','female','2014-08-19','الصف السادس','شعبة أ','active'),
    ('DEMO-2627-027','ليث','هاني','قدورة','male','2014-02-10','الصف السادس','شعبة أ','active'),
    ('DEMO-2627-028','آية','نضال','زقوت','female','2010-06-14','الصف العاشر','شعبة أ','active'),
    ('DEMO-2627-029','قيس','زياد','السوسي','male','2010-11-02','الصف العاشر','شعبة أ','active'),
    ('DEMO-2627-030','فرح','رائد','الأغا','female','2009-07-23','الصف الحادي عشر','شعبة أ','pending')
  ) x(student_number,first_name,middle_name,last_name,gender,date_of_birth,grade_name,section_name,enrollment_status) LOOP
    INSERT INTO public.students
      (school_id,student_number,first_name,middle_name,last_name,gender,date_of_birth,
       place_of_birth,nationality,address,emergency_phone,enrollment_date,status,
       administrative_notes,previous_school,is_demo)
    VALUES
      (v_school_id,r.student_number,r.first_name,r.middle_name,r.last_name,
       r.gender::public.gender,r.date_of_birth::date,'غزة','فلسطيني','غزة','0599999999',
       DATE '2026-09-01',
       CASE WHEN r.enrollment_status='pending' THEN 'new'::public.student_status
            ELSE 'active'::public.student_status END,
       'سجل تجريبي للعرض والتدريب','مدرسة سابقة - بيانات تجريبية',true)
    ON CONFLICT (school_id,student_number) DO UPDATE
    SET first_name=EXCLUDED.first_name,middle_name=EXCLUDED.middle_name,
        last_name=EXCLUDED.last_name,gender=EXCLUDED.gender,
        date_of_birth=EXCLUDED.date_of_birth,status=EXCLUDED.status
    WHERE public.students.is_demo
      AND (public.students.first_name,public.students.middle_name,
           public.students.last_name,public.students.gender,
           public.students.date_of_birth,public.students.status)
          IS DISTINCT FROM
          (EXCLUDED.first_name,EXCLUDED.middle_name,
           EXCLUDED.last_name,EXCLUDED.gender,
           EXCLUDED.date_of_birth,EXCLUDED.status);

    SELECT id INTO v_student_id FROM public.students
    WHERE school_id=v_school_id AND student_number=r.student_number AND is_demo;
    SELECT id INTO v_grade_id FROM public.grades
    WHERE school_id=v_school_id AND name=r.grade_name AND is_demo
    ORDER BY created_at LIMIT 1;
    SELECT id INTO v_section_id FROM public.sections
    WHERE school_id=v_school_id AND academic_year_id=v_year_id
      AND grade_id=v_grade_id AND name=r.section_name AND is_demo
    ORDER BY created_at LIMIT 1;

    IF v_student_id IS NULL OR v_grade_id IS NULL OR v_section_id IS NULL THEN
      RAISE EXCEPTION 'Could not resolve enrollment references for %',r.student_number;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.student_enrollments
      WHERE student_id=v_student_id AND academic_year_id=v_year_id
        AND enrollment_status IN ('active','pending')
    ) THEN
      INSERT INTO public.student_enrollments
        (school_id,student_id,academic_year_id,grade_id,section_id,
         enrollment_status,start_date,notes)
      VALUES
        (v_school_id,v_student_id,v_year_id,v_grade_id,v_section_id,
         r.enrollment_status::public.enrollment_status,DATE '2026-09-01',
         'تسجيل تجريبي للسنة 2026/2027');
    END IF;
  END LOOP;

  FOR r IN SELECT * FROM (VALUES
    ('DEMO-2627-001','0599001001','والد'),('DEMO-2627-002','0599001001','والد'),
    ('DEMO-2627-003','0599001002','والدة'),('DEMO-2627-004','0599001002','والدة'),
    ('DEMO-2627-005','0599001003','والد'),('DEMO-2627-006','0599001003','والد'),
    ('DEMO-2627-007','0599001004','والدة'),('DEMO-2627-008','0599001004','والدة'),
    ('DEMO-2627-009','0599001005','والد'),('DEMO-2627-010','0599001005','والد'),
    ('DEMO-2627-011','0599001006','والد'),('DEMO-2627-012','0599001006','والد'),
    ('DEMO-2627-013','0599001007','والد'),('DEMO-2627-014','0599001007','والد'),
    ('DEMO-2627-015','0599001008','والد'),('DEMO-2627-016','0599001008','والد'),
    ('DEMO-2627-017','0599001009','والد'),('DEMO-2627-018','0599001010','والدة'),
    ('DEMO-2627-019','0599001011','والد'),('DEMO-2627-020','0599001012','والد'),
    ('DEMO-2627-021','0599001013','والد'),('DEMO-2627-022','0599001014','والدة'),
    ('DEMO-2627-023','0599001015','والد'),('DEMO-2627-024','0599001016','والدة'),
    ('DEMO-2627-025','0599001017','والد'),('DEMO-2627-026','0599001018','والد'),
    ('DEMO-2627-027','0599001019','والد'),('DEMO-2627-028','0599001020','والدة'),
    ('DEMO-2627-029','0599001021','والد'),('DEMO-2627-030','0599001022','والد')
  ) x(student_number,guardian_phone,relationship) LOOP
    SELECT id INTO v_student_id FROM public.students
    WHERE school_id=v_school_id AND student_number=r.student_number AND is_demo;
    SELECT id INTO v_guardian_id FROM public.guardians
    WHERE school_id=v_school_id AND phone=r.guardian_phone AND is_demo
    ORDER BY created_at LIMIT 1;
    INSERT INTO public.student_guardians
      (school_id,student_id,guardian_id,relationship,is_primary,can_pickup,receives_notifications)
    VALUES
      (v_school_id,v_student_id,v_guardian_id,r.relationship,true,true,true)
    ON CONFLICT (student_id,guardian_id) DO UPDATE
    SET relationship=EXCLUDED.relationship,is_primary=true,
        can_pickup=true,receives_notifications=true
    WHERE (public.student_guardians.relationship,
           public.student_guardians.is_primary,
           public.student_guardians.can_pickup,
           public.student_guardians.receives_notifications)
          IS DISTINCT FROM
          (EXCLUDED.relationship,true,true,true);
  END LOOP;

  -- admission_status has "new" rather than "pending".
  FOR r IN SELECT * FROM (VALUES
    ('DEMO-A-2627-001','سليم','ماهر','القاضي','male','2019-09-12','الصف الأول','ماهر القاضي','0569002001','new','2026-09-10 09:00:00+03'),
    ('DEMO-A-2627-002','لينا','عصام','جرادة','female','2018-04-21','الصف الثاني','عصام جرادة','0569002002','new','2026-09-11 10:15:00+03'),
    ('DEMO-A-2627-003','أمير','وليد','البنا','male','2015-07-08','الصف الخامس','وليد البنا','0569002003','under_review','2026-09-12 11:20:00+03'),
    ('DEMO-A-2627-004','ملك','نبيل','العطار','female','2014-03-16','الصف السادس','نبيل العطار','0569002004','under_review','2026-09-13 12:00:00+03'),
    ('DEMO-A-2627-005','جواد','بسام','الريس','male','2010-10-05','الصف العاشر','بسام الريس','0569002005','accepted','2026-09-14 09:40:00+03'),
    ('DEMO-A-2627-006','يارا','حازم','حمودة','female','2009-02-27','الصف الحادي عشر','حازم حمودة','0569002006','accepted','2026-09-15 10:30:00+03'),
    ('DEMO-A-2627-007','رامي','شادي','الخزندار','male','2018-12-02','الصف الثاني','شادي الخزندار','0569002007','rejected','2026-09-16 08:50:00+03'),
    ('DEMO-A-2627-008','ميس','عوني','اليازجي','female','2015-05-19','الصف الخامس','عوني اليازجي','0569002008','rejected','2026-09-17 13:10:00+03')
  ) x(application_number,first_name,middle_name,last_name,gender,date_of_birth,grade_name,guardian_name,guardian_phone,status,submitted_at) LOOP
    SELECT id INTO v_grade_id FROM public.grades
    WHERE school_id=v_school_id AND name=r.grade_name AND is_demo
    ORDER BY created_at LIMIT 1;
    INSERT INTO public.admission_applications
      (school_id,application_number,academic_year_id,student_first_name,
       student_middle_name,student_last_name,date_of_birth,gender,requested_grade_id,
       guardian_name,guardian_phone,previous_school,notes,status,submitted_at,
       reviewed_at,reviewed_by,is_demo)
    VALUES
      (v_school_id,r.application_number,v_year_id,r.first_name,r.middle_name,r.last_name,
       r.date_of_birth::date,r.gender::public.gender,v_grade_id,r.guardian_name,r.guardian_phone,
       'مدرسة سابقة - بيانات تجريبية','طلب قبول تجريبي غير مرتبط بطالب مسجل',
       r.status::public.admission_status,r.submitted_at::timestamptz,
       CASE WHEN r.status='new' THEN NULL ELSE r.submitted_at::timestamptz+interval '2 days' END,
       CASE WHEN r.status='new' THEN NULL ELSE v_owner_id END,true)
    ON CONFLICT (school_id,application_number) DO UPDATE
    SET status=EXCLUDED.status,notes=EXCLUDED.notes,
        reviewed_at=EXCLUDED.reviewed_at,reviewed_by=EXCLUDED.reviewed_by
    WHERE public.admission_applications.is_demo;
  END LOOP;

  INSERT INTO public.fee_categories
    (school_id,name,description,is_active,is_demo)
  VALUES
    (v_school_id,'الرسوم الدراسية','الرسوم الدراسية السنوية',true,true),
    (v_school_id,'رسوم التسجيل','رسوم التسجيل السنوية',true,true),
    (v_school_id,'رسوم النقل المدرسي','خدمة نقل اختيارية',true,true)
  ON CONFLICT (school_id,name) DO UPDATE
  SET description=EXCLUDED.description,is_active=true,is_demo=true;

  -- Grade tuition: $700-$1,300; registration: $75; optional transport: $300.
  FOR r IN SELECT * FROM (VALUES
    ('الرسوم الدراسية','الصف الأول','الرسوم الدراسية - الصف الأول',700.00,'2026-10-01',true),
    ('الرسوم الدراسية','الصف الثاني','الرسوم الدراسية - الصف الثاني',760.00,'2026-10-01',true),
    ('الرسوم الدراسية','الصف الخامس','الرسوم الدراسية - الصف الخامس',900.00,'2026-10-01',true),
    ('الرسوم الدراسية','الصف السادس','الرسوم الدراسية - الصف السادس',950.00,'2026-10-01',true),
    ('الرسوم الدراسية','الصف العاشر','الرسوم الدراسية - الصف العاشر',1150.00,'2026-10-01',true),
    ('الرسوم الدراسية','الصف الحادي عشر','الرسوم الدراسية - الصف الحادي عشر',1300.00,'2026-10-01',true),
    ('رسوم التسجيل',NULL,'رسوم التسجيل السنوية',75.00,'2026-09-15',true),
    ('رسوم النقل المدرسي',NULL,'خدمة النقل المدرسي',300.00,'2026-10-10',false)
  ) x(category_name,grade_name,structure_name,amount,due_date,is_mandatory) LOOP
    SELECT id INTO v_category_id FROM public.fee_categories
    WHERE school_id=v_school_id AND name=r.category_name;
    v_grade_id := NULL;
    IF r.grade_name IS NOT NULL THEN
      SELECT id INTO v_grade_id FROM public.grades
      WHERE school_id=v_school_id AND name=r.grade_name AND is_demo
      ORDER BY created_at LIMIT 1;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.fee_structures
      WHERE school_id=v_school_id AND academic_year_id=v_year_id
        AND name=r.structure_name AND grade_id IS NOT DISTINCT FROM v_grade_id AND is_demo
    ) THEN
      INSERT INTO public.fee_structures
        (school_id,academic_year_id,grade_id,fee_category_id,name,amount,currency,
         due_date,is_mandatory,is_active,is_demo)
      VALUES
        (v_school_id,v_year_id,v_grade_id,v_category_id,r.structure_name,r.amount,'USD',
         r.due_date::date,r.is_mandatory,true,true);
    END IF;
  END LOOP;

  -- Existing RPC creates tuition and registration fee rows idempotently.
  FOR r IN SELECT id FROM public.fee_structures
    WHERE school_id=v_school_id AND academic_year_id=v_year_id
      AND is_demo AND is_active AND name<>'خدمة النقل المدرسي'
  LOOP
    PERFORM public.apply_fee_structure(r.id);
  END LOOP;

  UPDATE public.student_fees sf SET is_demo=true
  FROM public.fee_structures fs, public.students st
  WHERE sf.fee_structure_id=fs.id AND sf.student_id=st.id
    AND fs.school_id=v_school_id AND fs.academic_year_id=v_year_id
    AND fs.is_demo AND st.is_demo;

  -- Optional transportation is assigned to ten students, not the whole school.
  SELECT id,fee_category_id INTO v_structure_id,v_category_id
  FROM public.fee_structures
  WHERE school_id=v_school_id AND academic_year_id=v_year_id
    AND name='خدمة النقل المدرسي' AND is_demo
  ORDER BY created_at LIMIT 1;

  INSERT INTO public.student_fees
    (school_id,student_id,enrollment_id,academic_year_id,fee_structure_id,
     fee_category_id,name,original_amount,currency,due_date,notes,is_demo)
  SELECT v_school_id,st.id,e.id,v_year_id,v_structure_id,v_category_id,
    'خدمة النقل المدرسي',300.00,'USD',DATE '2026-10-10',
    'اشتراك نقل تجريبي اختياري',true
  FROM public.students st
  JOIN public.student_enrollments e
    ON e.student_id=st.id AND e.academic_year_id=v_year_id
   AND e.enrollment_status IN ('active','pending')
  WHERE st.school_id=v_school_id AND st.is_demo
    AND st.student_number IN (
      'DEMO-2627-001','DEMO-2627-002','DEMO-2627-005','DEMO-2627-008','DEMO-2627-011',
      'DEMO-2627-014','DEMO-2627-017','DEMO-2627-021','DEMO-2627-026','DEMO-2627-030')
    AND NOT EXISTS (
      SELECT 1 FROM public.student_fees sf
      WHERE sf.enrollment_id=e.id AND sf.fee_structure_id=v_structure_id
        AND sf.status<>'cancelled');

  -- Three discounts, created through the existing finance RPC.
  FOR r IN SELECT * FROM (VALUES
    ('DEMO-2627-003','خصم تفوق','percentage',10.00,'تفوق أكاديمي - بيانات تجريبية'),
    ('DEMO-2627-008','خصم إخوة','fixed',100.00,'وجود أخ أو أخت في المدرسة - بيانات تجريبية'),
    ('DEMO-2627-018','خصم تشجيعي','percentage',10.00,'خصم تشجيعي - بيانات تجريبية')
  ) x(student_number,discount_name,discount_type,discount_value,reason) LOOP
    SELECT sf.id INTO v_fee_id
    FROM public.student_fees sf
    JOIN public.students st ON st.id=sf.student_id
    JOIN public.fee_categories fc ON fc.id=sf.fee_category_id
    WHERE st.school_id=v_school_id AND st.student_number=r.student_number AND st.is_demo
      AND sf.academic_year_id=v_year_id AND fc.name='الرسوم الدراسية'
      AND sf.status<>'cancelled'
    ORDER BY sf.created_at LIMIT 1;
    IF NOT EXISTS (
      SELECT 1 FROM public.discounts
      WHERE student_fee_id=v_fee_id AND name=r.discount_name AND is_active
    ) THEN
      v_discount_id := public.add_discount(
        v_fee_id,r.discount_name,r.discount_type::public.discount_type,
        r.discount_value,r.reason);
      UPDATE public.discounts SET is_demo=true WHERE id=v_discount_id;
    END IF;
  END LOOP;

  -- Twelve three-part tuition plans, always before payment allocation.
  FOR r IN
    SELECT st.student_number,sf.id AS fee_id,sf.final_amount
    FROM public.students st
    JOIN public.student_fees sf ON sf.student_id=st.id
    JOIN public.fee_categories fc ON fc.id=sf.fee_category_id
    WHERE st.school_id=v_school_id AND st.is_demo
      AND st.student_number BETWEEN 'DEMO-2627-001' AND 'DEMO-2627-012'
      AND sf.academic_year_id=v_year_id AND fc.name='الرسوم الدراسية'
      AND sf.status<>'cancelled'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.installment_plans WHERE student_fee_id=r.fee_id
    ) THEN
      v_first_amount := round(r.final_amount*0.40,2);
      v_second_amount := round(r.final_amount*0.30,2);
      v_third_amount := r.final_amount-v_first_amount-v_second_amount;
      PERFORM public.set_installment_plan(
        r.fee_id,'خطة الأقساط الثلاثة 2026/2027',
        jsonb_build_array(
          jsonb_build_object('amount',v_first_amount,'due_date','2026-09-15'),
          jsonb_build_object('amount',v_second_amount,'due_date','2027-01-15'),
          jsonb_build_object('amount',v_third_amount,'due_date','2027-04-15')));
    END IF;
  END LOOP;

  -- Sixteen completed payments: eight full and eight partial.
  FOR r IN SELECT * FROM (VALUES
    ('DEMO-2627-001','full_plan','2026-09-05','bank_transfer','DEMO-2627-PAY-001'),
    ('DEMO-2627-002','full_plan','2026-09-07','cash','DEMO-2627-PAY-002'),
    ('DEMO-2627-003','full_plan','2026-09-09','card','DEMO-2627-PAY-003'),
    ('DEMO-2627-004','full_plan','2026-09-11','bank_transfer','DEMO-2627-PAY-004'),
    ('DEMO-2627-013','full_direct','2026-09-13','bank_transfer','DEMO-2627-PAY-013'),
    ('DEMO-2627-014','full_direct','2026-09-14','card','DEMO-2627-PAY-014'),
    ('DEMO-2627-015','full_direct','2026-09-15','cash','DEMO-2627-PAY-015'),
    ('DEMO-2627-016','full_direct','2026-09-16','bank_transfer','DEMO-2627-PAY-016'),
    ('DEMO-2627-005','first_plus_registration','2026-09-18','cash','DEMO-2627-PAY-005'),
    ('DEMO-2627-006','first_plus_registration','2026-09-19','bank_transfer','DEMO-2627-PAY-006'),
    ('DEMO-2627-007','first_plus_registration','2026-09-20','card','DEMO-2627-PAY-007'),
    ('DEMO-2627-008','first_plus_registration','2026-09-21','cash','DEMO-2627-PAY-008'),
    ('DEMO-2627-009','small_partial','2026-09-24','cash','DEMO-2627-PAY-009'),
    ('DEMO-2627-010','small_partial','2026-09-25','bank_transfer','DEMO-2627-PAY-010'),
    ('DEMO-2627-011','small_partial','2026-09-26','card','DEMO-2627-PAY-011'),
    ('DEMO-2627-012','small_partial','2026-09-27','cash','DEMO-2627-PAY-012')
  ) x(student_number,payment_kind,payment_date,payment_method,reference_number) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.payments
      WHERE school_id=v_school_id AND reference_number=r.reference_number
    ) THEN
      SELECT id INTO v_student_id FROM public.students
      WHERE school_id=v_school_id AND student_number=r.student_number AND is_demo;
      SELECT sf.id INTO v_tuition_fee_id
      FROM public.student_fees sf
      JOIN public.fee_categories fc ON fc.id=sf.fee_category_id
      WHERE sf.student_id=v_student_id AND sf.academic_year_id=v_year_id
        AND fc.name='الرسوم الدراسية' AND sf.status<>'cancelled'
      ORDER BY sf.created_at LIMIT 1;
      SELECT sf.id INTO v_registration_fee_id
      FROM public.student_fees sf
      JOIN public.fee_categories fc ON fc.id=sf.fee_category_id
      WHERE sf.student_id=v_student_id AND sf.academic_year_id=v_year_id
        AND fc.name='رسوم التسجيل' AND sf.status<>'cancelled'
      ORDER BY sf.created_at LIMIT 1;

      v_allocations := '[]'::jsonb;
      v_total := 0;
      IF r.payment_kind='full_plan' THEN
        SELECT jsonb_agg(jsonb_build_object(
                 'student_fee_id',student_fee_id,
                 'installment_id',id,
                 'amount',amount) ORDER BY installment_number),
               sum(amount)
        INTO v_allocations,v_total
        FROM public.installments WHERE student_fee_id=v_tuition_fee_id;
      ELSIF r.payment_kind='full_direct' THEN
        SELECT final_amount INTO v_amount
        FROM public.student_fees WHERE id=v_tuition_fee_id;
        v_allocations := jsonb_build_array(
          jsonb_build_object('student_fee_id',v_tuition_fee_id,'amount',v_amount));
        v_total := v_amount;
      ELSE
        SELECT id,amount INTO v_installment_id,v_amount
        FROM public.installments
        WHERE student_fee_id=v_tuition_fee_id AND installment_number=1;
        IF r.payment_kind='small_partial' THEN
          v_amount := LEAST(v_amount,100.00);
        END IF;
        v_allocations := jsonb_build_array(jsonb_build_object(
          'student_fee_id',v_tuition_fee_id,
          'installment_id',v_installment_id,
          'amount',v_amount));
        v_total := v_amount;
      END IF;

      SELECT final_amount INTO v_amount
      FROM public.student_fees WHERE id=v_registration_fee_id;
      v_allocations := v_allocations || jsonb_build_array(
        jsonb_build_object('student_fee_id',v_registration_fee_id,'amount',v_amount));
      v_total := v_total+v_amount;

      v_payment_id := public.record_payment(
        v_student_id,v_total,r.payment_method::public.payment_method,
        r.payment_date::date,r.reference_number,
        'دفعة تجريبية للسنة 2026/2027',v_allocations);
      UPDATE public.payments SET is_demo=true WHERE id=v_payment_id;
    END IF;
  END LOOP;

  INSERT INTO public.expense_categories (school_id,name,is_active) VALUES
    (v_school_id,'إيجار',true),(v_school_id,'كهرباء',true),
    (v_school_id,'اتصالات وإنترنت',true),(v_school_id,'صيانة',true),
    (v_school_id,'قرطاسية',true),(v_school_id,'تطوير مهني',true)
  ON CONFLICT (school_id,name) DO UPDATE SET is_active=true;

  INSERT INTO public.cost_centers (school_id,name,type,reference_id,is_active)
  VALUES (v_school_id,'المدرسة','school',v_school_id,true)
  ON CONFLICT (school_id,name) DO UPDATE SET is_active=true;
  SELECT id INTO v_cost_center_id FROM public.cost_centers
  WHERE school_id=v_school_id AND name='المدرسة';

  -- Includes teacher training, not payroll or salary data.
  FOR r IN SELECT * FROM (VALUES
    ('إيجار','إيجار مبنى المدرسة - سبتمبر',1800.00,'2026-09-01','bank_transfer','DEMO-EXP-001','إيجار شهري تجريبي'),
    ('كهرباء','فاتورة الكهرباء - سبتمبر',320.00,'2026-09-08','bank_transfer','DEMO-EXP-002','استهلاك الكهرباء الشهري'),
    ('اتصالات وإنترنت','اشتراك الإنترنت المدرسي',85.00,'2026-09-10','card','DEMO-EXP-003','اشتراك ألياف ضوئية'),
    ('صيانة','صيانة أجهزة التكييف',240.00,'2026-09-12','cash','DEMO-EXP-004','صيانة دورية قبل انتظام الدوام'),
    ('قرطاسية','دفاتر وأوراق طباعة',410.00,'2026-09-15','cash','DEMO-EXP-005','مستلزمات صفية وإدارية'),
    ('صيانة','إصلاح بوابة المدرسة',175.00,'2026-09-20','cash','DEMO-EXP-006','أعمال صيانة بسيطة'),
    ('تطوير مهني','ورشة تدريب المعلمين على التقويم الرقمي',350.00,'2026-09-24','bank_transfer','DEMO-EXP-007','تدريب مهني؛ ليس راتباً أو كشف رواتب')
  ) x(category_name,title,amount,expense_date,payment_method,reference_number,description) LOOP
    SELECT id INTO v_expense_category_id FROM public.expense_categories
    WHERE school_id=v_school_id AND name=r.category_name;
    IF NOT EXISTS (
      SELECT 1 FROM public.expenses
      WHERE school_id=v_school_id AND reference_number=r.reference_number
    ) THEN
      INSERT INTO public.expenses
        (school_id,academic_year_id,expense_category_id,cost_center_id,title,amount,
         currency,expense_date,payment_method,reference_number,description,
         created_by,status,is_demo)
      VALUES
        (v_school_id,v_year_id,v_expense_category_id,v_cost_center_id,r.title,r.amount,
         'USD',r.expense_date::date,r.payment_method::public.payment_method,
         r.reference_number,r.description,v_owner_id,'recorded',true);
    END IF;
  END LOOP;

  PERFORM public.refresh_finance_statuses(v_school_id);
END
$seed$;

COMMIT;

-- Read-only result summary returned after a successful seed.
SELECT jsonb_pretty(jsonb_build_object(
  'stages',(SELECT count(*) FROM public.stages WHERE school_id=s.id AND is_demo),
  'grades',(SELECT count(*) FROM public.grades WHERE school_id=s.id AND is_demo),
  'sections',(SELECT count(*) FROM public.sections WHERE school_id=s.id AND academic_year_id=y.id AND is_demo),
  'students',(SELECT count(*) FROM public.students WHERE school_id=s.id AND is_demo),
  'guardians',(SELECT count(*) FROM public.guardians WHERE school_id=s.id AND is_demo),
  'enrollments',(SELECT count(*) FROM public.student_enrollments e JOIN public.students st ON st.id=e.student_id WHERE e.school_id=s.id AND e.academic_year_id=y.id AND st.is_demo),
  'admissions',(SELECT count(*) FROM public.admission_applications WHERE school_id=s.id AND academic_year_id=y.id AND is_demo),
  'fee_categories',(SELECT count(*) FROM public.fee_categories WHERE school_id=s.id AND is_demo),
  'fee_structures',(SELECT count(*) FROM public.fee_structures WHERE school_id=s.id AND academic_year_id=y.id AND is_demo),
  'student_fees',(SELECT count(*) FROM public.student_fees WHERE school_id=s.id AND academic_year_id=y.id AND is_demo),
  'installment_plans',(SELECT count(*) FROM public.installment_plans ip JOIN public.student_fees sf ON sf.id=ip.student_fee_id WHERE sf.school_id=s.id AND sf.academic_year_id=y.id AND sf.is_demo),
  'payments',(SELECT count(*) FROM public.payments WHERE school_id=s.id AND academic_year_id=y.id AND is_demo),
  'discounts',(SELECT count(*) FROM public.discounts WHERE school_id=s.id AND academic_year_id=y.id AND is_demo),
  'expenses',(SELECT count(*) FROM public.expenses WHERE school_id=s.id AND academic_year_id=y.id AND is_demo),
  'fee_statuses',(SELECT jsonb_object_agg(status,total) FROM (
    SELECT status::text,count(*) AS total FROM public.student_fees
    WHERE school_id=s.id AND academic_year_id=y.id AND is_demo
    GROUP BY status ORDER BY status) q)
)) AS demo_seed_summary
FROM public.schools s
JOIN public.academic_years y ON y.school_id=s.id
WHERE s.name_ar='مدرسة مدار التجريبية' AND y.name='2026/2027';
