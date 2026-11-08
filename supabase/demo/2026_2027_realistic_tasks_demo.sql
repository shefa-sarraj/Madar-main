-- Demo-only operational tasks for مدرسة مدار التجريبية.
-- Run after 20260930125410_add_tasks_management.sql. Safe to re-run.

BEGIN;

DO $seed$
DECLARE
  v_school_id uuid;
  v_year_id uuid;
  v_owner_id uuid;
  v_employees uuid[];
  v_related_id uuid;
  v_task_id uuid;
  v_count integer;
  r record;
BEGIN
  SELECT count(*),(array_agg(id))[1] INTO v_count,v_school_id
  FROM public.schools WHERE name_ar='مدرسة مدار التجريبية';
  IF v_count<>1 THEN RAISE EXCEPTION 'Expected exactly one target school; found %',v_count; END IF;

  SELECT count(*),(array_agg(id))[1] INTO v_count,v_year_id
  FROM public.academic_years
  WHERE school_id=v_school_id AND name='2026/2027' AND is_active;
  IF v_count<>1 THEN RAISE EXCEPTION 'Expected one active 2026/2027 academic year; found %',v_count; END IF;

  SELECT count(*),(array_agg(ur.user_id))[1] INTO v_count,v_owner_id
  FROM public.user_roles ur
  JOIN public.school_members sm
    ON sm.school_id=ur.school_id AND sm.user_id=ur.user_id AND sm.status='active'
  WHERE ur.school_id=v_school_id AND ur.role='school_owner';
  IF v_count<>1 THEN RAISE EXCEPTION 'Expected exactly one active school owner; found %',v_count; END IF;

  SELECT array_agg(id ORDER BY employee_number) INTO v_employees
  FROM public.employees WHERE school_id=v_school_id AND status='active';
  IF coalesce(array_length(v_employees,1),0)<8 THEN
    RAISE EXCEPTION 'Expected at least 8 active employees for task assignments';
  END IF;

  PERFORM set_config('request.jwt.claim.sub',v_owner_id::text,true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_owner_id,'role','authenticated')::text,
    true
  );

  FOR r IN SELECT * FROM (VALUES
    ('متابعة استكمال وثائق الطالب أحمد','التواصل مع ولي الأمر لاستكمال صورة الهوية وشهادة الميلاد.','urgent','in_progress',DATE '2026-09-25','user',1,'student','DEMO-2627-001'),
    ('تحصيل القسط المتأخر للصف الرابع','مراجعة كشف الرسوم والتواصل مع ولي الأمر قبل نهاية الأسبوع.','high','open',DATE '2026-09-28','employee',3,'student','DEMO-2627-004'),
    ('صيانة مكيف قاعة الأنشطة','متابعة عرض الصيانة وتأكيد موعد إعادة التركيب.','urgent','in_progress',DATE '2026-09-29','employee',8,'asset','AST-AC-001'),
    ('جرد أحبار غرفة الطباعة','مطابقة الكميات الفعلية مع حركات المخزون المسجلة.','high','open',DATE '2026-09-30','employee',3,'inventory_item','INV-PRN-001'),
    ('تجهيز ملفات المقبولين الجدد','ترتيب ملفات الطلبات المقبولة حسب الصف والشعبة.','medium','in_progress',DATE '2026-10-01','employee',4,NULL,NULL),
    ('مراجعة عقود المعلمين المؤقتين','التأكد من اكتمال التوقيعات والوثائق المطلوبة.','high','open',DATE '2026-10-02','employee',2,'employee','DEMO-STAFF-012'),
    ('اختبار جهاز العرض في مختبر العلوم','تشغيل الجهاز وفحص الاتصال قبل الحصة العملية.','medium','open',DATE '2026-10-03','employee',7,'asset','AST-PRJ-003'),
    ('تحديث سجل مفاتيح الغرف','حصر النسخ المسلمة وتوثيق الموظفين المستلمين.','low','open',DATE '2026-10-08','employee',1,NULL,NULL),
    ('اعتماد طلب قرطاسية الإدارة','مراجعة الاحتياج واعتماد الصرف من المستودع.','medium','in_progress',DATE '2026-10-05','user',1,'inventory_item','INV-STA-001'),
    ('إغلاق ملف صيانة الطابعة','توثيق الفاتورة ونتيجة اختبار الطابعة بعد الصيانة.','medium','completed',DATE '2026-09-22','employee',3,'asset','AST-PRN-001'),
    ('توزيع دفاتر التحضير','تسليم الدفاتر للمعلمين وتسجيل الكميات المصروفة.','low','completed',DATE '2026-09-18','employee',5,'inventory_item','INV-STA-003'),
    ('مراجعة بيانات التسجيل الإلكتروني','تدقيق أرقام الهواتف والعناوين للطلبات الجديدة.','medium','completed',DATE '2026-09-15','employee',4,NULL,NULL),
    ('فحص شبكة مختبر الحاسوب','اختبار نقاط الشبكة وتوثيق المنافذ غير الفعالة.','high','completed',DATE '2026-09-20','employee',8,'asset','AST-NET-001'),
    ('طلب شراء شاشة إضافية','أُلغي الطلب بعد إعادة توزيع الشاشات المتاحة.','low','cancelled',DATE '2026-09-26','user',1,NULL,NULL)
  ) x(title,description,priority,status,due_date,assignee_kind,assignee_index,related_type,related_key)
  LOOP
    v_related_id:=NULL;
    IF r.related_type='student' THEN
      SELECT id INTO v_related_id FROM public.students
      WHERE school_id=v_school_id AND student_number=r.related_key LIMIT 1;
    ELSIF r.related_type='employee' THEN
      SELECT id INTO v_related_id FROM public.employees
      WHERE school_id=v_school_id AND employee_number=r.related_key LIMIT 1;
    ELSIF r.related_type='asset' THEN
      SELECT id INTO v_related_id FROM public.assets
      WHERE school_id=v_school_id AND asset_code=r.related_key LIMIT 1;
    ELSIF r.related_type='inventory_item' THEN
      SELECT id INTO v_related_id FROM public.inventory_items
      WHERE school_id=v_school_id AND item_code=r.related_key LIMIT 1;
    END IF;
    IF r.related_type IS NOT NULL AND v_related_id IS NULL THEN
      RAISE EXCEPTION 'Could not resolve related % %',r.related_type,r.related_key;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.tasks
      WHERE school_id=v_school_id AND title=r.title AND is_demo
    ) THEN
      INSERT INTO public.tasks(
        school_id,academic_year_id,title,description,priority,status,due_date,created_by,
        assigned_to_user_id,assigned_to_employee_id,related_entity_type,related_entity_id,is_demo
      ) VALUES (
        v_school_id,v_year_id,r.title,r.description,
        r.priority::public.task_priority,r.status::public.task_status,r.due_date,v_owner_id,
        CASE WHEN r.assignee_kind='user' THEN v_owner_id ELSE NULL END,
        CASE WHEN r.assignee_kind='employee' THEN v_employees[r.assignee_index] ELSE NULL END,
        r.related_type,v_related_id,true
      );
    END IF;
  END LOOP;

  FOR r IN SELECT * FROM (VALUES
    ('متابعة استكمال وثائق الطالب أحمد','تم التواصل مع ولي الأمر، وسيتم تسليم الشهادة صباح الغد.'),
    ('متابعة استكمال وثائق الطالب أحمد','تم استلام صورة الهوية وبقيت شهادة الميلاد.'),
    ('تحصيل القسط المتأخر للصف الرابع','تم إرسال كشف الرصيد إلى ولي الأمر.'),
    ('صيانة مكيف قاعة الأنشطة','أكد الفني توفر قطعة الغيار المطلوبة.'),
    ('صيانة مكيف قاعة الأنشطة','موعد الزيارة الفنية يوم الخميس الساعة العاشرة.'),
    ('جرد أحبار غرفة الطباعة','الكمية الفعلية مطابقة للحبر الملون وتحتاج مراجعة الحبر الأسود.'),
    ('تجهيز ملفات المقبولين الجدد','اكتمل فرز ملفات الصف الأول والثاني.'),
    ('مراجعة عقود المعلمين المؤقتين','تمت مراجعة عقدين وبقي عقد واحد.'),
    ('إغلاق ملف صيانة الطابعة','تم اختبار الطباعة والمسح الضوئي بنجاح.'),
    ('فحص شبكة مختبر الحاسوب','تم استبدال كابلين وتوثيق المنافذ.')
  ) x(task_title,comment)
  LOOP
    SELECT id INTO v_task_id FROM public.tasks
    WHERE school_id=v_school_id AND title=r.task_title AND is_demo LIMIT 1;
    IF v_task_id IS NULL THEN RAISE EXCEPTION 'Could not resolve demo task %',r.task_title; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.task_comments
      WHERE task_id=v_task_id AND comment=r.comment AND is_demo
    ) THEN
      INSERT INTO public.task_comments(school_id,task_id,user_id,comment,is_demo)
      VALUES(v_school_id,v_task_id,v_owner_id,r.comment,true);
    END IF;
  END LOOP;

  SELECT count(*) INTO v_count FROM public.tasks WHERE school_id=v_school_id AND is_demo;
  IF v_count<>14 THEN RAISE EXCEPTION 'Expected 14 demo tasks; found %',v_count; END IF;
  SELECT count(*) INTO v_count FROM public.task_comments WHERE school_id=v_school_id AND is_demo;
  IF v_count<>10 THEN RAISE EXCEPTION 'Expected 10 demo task comments; found %',v_count; END IF;
END $seed$;

COMMIT;
