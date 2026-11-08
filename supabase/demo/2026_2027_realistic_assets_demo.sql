-- Demo-only durable assets for مدرسة مدار التجريبية.
-- Run after 20260930103532_add_assets_management.sql. Safe to re-run.

BEGIN;

DO $seed$
DECLARE
  v_school_id uuid;
  v_owner_id uuid;
  v_employees uuid[];
  v_asset_id uuid;
  v_count integer;
BEGIN
  SELECT count(*),(array_agg(id))[1] INTO v_count,v_school_id
  FROM public.schools WHERE name_ar='مدرسة مدار التجريبية';
  IF v_count<>1 THEN RAISE EXCEPTION 'Expected exactly one target school; found %',v_count; END IF;

  SELECT count(*),(array_agg(ur.user_id))[1] INTO v_count,v_owner_id
  FROM public.user_roles ur
  JOIN public.school_members sm ON sm.school_id=ur.school_id AND sm.user_id=ur.user_id AND sm.status='active'
  WHERE ur.school_id=v_school_id AND ur.role='school_owner';
  IF v_count<>1 THEN RAISE EXCEPTION 'Expected exactly one active school owner; found %',v_count; END IF;

  SELECT array_agg(id ORDER BY employee_number) INTO v_employees
  FROM public.employees WHERE school_id=v_school_id AND status='active';
  IF coalesce(array_length(v_employees,1),0)<8 THEN
    RAISE EXCEPTION 'Expected at least 8 active employees for asset assignments';
  END IF;

  PERFORM set_config('request.jwt.claim.sub',v_owner_id::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_owner_id,'role','authenticated')::text,true);

  INSERT INTO public.asset_categories(school_id,name,description)
  VALUES
    (v_school_id,'أجهزة حاسوب','الحواسيب المكتبية والمحمولة'),
    (v_school_id,'أجهزة عرض','أجهزة العرض والشاشات التعليمية'),
    (v_school_id,'طابعات','الطابعات والماسحات الضوئية'),
    (v_school_id,'أثاث','الأثاث الإداري والتعليمي الدائم'),
    (v_school_id,'تكييف','أجهزة التكييف والتهوية'),
    (v_school_id,'شبكات','معدات الشبكة والاتصال'),
    (v_school_id,'معدات كهربائية','المعدات والأجهزة الكهربائية الدائمة')
  ON CONFLICT (school_id,name) DO NOTHING;

  INSERT INTO public.assets(
    school_id,category_id,asset_code,name,description,serial_number,purchase_date,purchase_cost,
    currency,location,condition,warranty_expiry,notes,is_demo
  )
  SELECT v_school_id,c.id,v.code,v.name,v.description,v.serial,v.purchased,v.cost,'USD',
    v.location,v.condition::public.asset_condition,v.warranty,'بيانات أصل تجريبية للعرض والتدريب فقط',true
  FROM (VALUES
    ('AST-CMP-001','أجهزة حاسوب','حاسوب محمول Dell Latitude 5520','حاسوب للهيئة التدريسية','DL5520-26001',DATE '2024-08-12',920::numeric,'غرفة المعلمين','excellent',DATE '2027-08-11'),
    ('AST-CMP-002','أجهزة حاسوب','حاسوب محمول HP ProBook 450','حاسوب للهيئة التدريسية','HP450-26002',DATE '2024-08-12',875,'غرفة المعلمين','good',DATE '2027-08-11'),
    ('AST-CMP-003','أجهزة حاسوب','حاسوب محمول Lenovo ThinkPad E14','حاسوب للأنشطة الصفية','LNE14-26003',DATE '2025-01-20',890,'مختبر الحاسوب','excellent',DATE '2028-01-19'),
    ('AST-CMP-004','أجهزة حاسوب','حاسوب مكتبي للإدارة','محطة عمل لمكتب الإدارة','ADM-PC-22004',DATE '2022-07-05',740,'مكتب الإدارة','good',NULL),
    ('AST-PRJ-001','أجهزة عرض','جهاز عرض Epson EB-X06','جهاز عرض للصفوف','EPX06-23001',DATE '2023-08-18',610,'الطابق الأول','good',DATE '2026-08-17'),
    ('AST-PRJ-002','أجهزة عرض','جهاز عرض BenQ MX560','جهاز عرض لقاعة الأنشطة','BQ560-24002',DATE '2024-03-10',590,'قاعة الأنشطة','excellent',DATE '2027-03-09'),
    ('AST-PRJ-003','أجهزة عرض','شاشة تفاعلية 65 بوصة','شاشة تعليمية ذكية','IFP65-25003',DATE '2025-06-15',1280,'مختبر العلوم','excellent',DATE '2028-06-14'),
    ('AST-PRN-001','طابعات','طابعة ليزر متعددة الوظائف','طابعة الإدارة الرئيسية','HPM428-22001',DATE '2022-09-01',480,'غرفة الطباعة','fair',NULL),
    ('AST-PRN-002','طابعات','طابعة ألوان Epson EcoTank','طابعة للأنشطة والتسجيل','EPL3250-24002',DATE '2024-02-22',360,'قسم التسجيل','good',DATE '2026-02-21'),
    ('AST-FUR-001','أثاث','مكتب مدير خشبي','مكتب إداري مع وحدة أدراج',NULL,DATE '2021-08-01',520,'مكتب المدير','good',NULL),
    ('AST-FUR-002','أثاث','خزانة ملفات معدنية','خزانة حفظ السجلات',NULL,DATE '2021-08-01',280,'الأرشيف','poor',NULL),
    ('AST-FUR-003','أثاث','طاولة اجتماعات كبيرة','طاولة تتسع لاثني عشر شخصاً',NULL,DATE '2023-07-12',650,'قاعة الاجتماعات','excellent',NULL),
    ('AST-FUR-004','أثاث','مكتبة خشبية تعليمية','خزانة كتب بواجهات زجاجية',NULL,DATE '2022-08-14',310,'المكتبة','good',NULL),
    ('AST-AC-001','تكييف','مكيف جداري 18000 وحدة','مكيف قاعة الأنشطة','AC18-22001',DATE '2022-05-17',720,'قاعة الأنشطة','fair',NULL),
    ('AST-AC-002','تكييف','مكيف جداري 12000 وحدة','مكيف مكتب الإدارة','AC12-23002',DATE '2023-05-22',590,'مكتب الإدارة','good',DATE '2026-05-21'),
    ('AST-AC-003','تكييف','مكيف جداري 18000 وحدة','مكيف مختبر الحاسوب','AC18-25003',DATE '2025-04-28',760,'مختبر الحاسوب','excellent',DATE '2028-04-27'),
    ('AST-NET-001','شبكات','مبدل شبكة Cisco 24 منفذاً','مبدل الشبكة الرئيسي','CSW24-23001',DATE '2023-01-16',430,'غرفة الشبكة','good',DATE '2026-01-15'),
    ('AST-NET-002','شبكات','موجه لاسلكي مركزي','موجه شبكة قديم خارج الخدمة','RTR-19002',DATE '2019-06-09',260,'مخزن الصيانة','poor',NULL),
    ('AST-ELC-001','معدات كهربائية','مثبت جهد كهربائي','مثبت جهد لمختبر الحاسوب','AVR-24001',DATE '2024-07-08',340,'مختبر الحاسوب','good',DATE '2026-07-07'),
    ('AST-ELC-002','معدات كهربائية','مولد كهربائي محمول','مولد احتياطي للطوارئ','GEN-23002',DATE '2023-11-11',1180,'غرفة الصيانة','good',DATE '2026-11-10')
  ) AS v(code,category_name,name,description,serial,purchased,cost,location,condition,warranty)
  JOIN public.asset_categories c ON c.school_id=v_school_id AND c.name=v.category_name
  ON CONFLICT (school_id,asset_code) DO NOTHING;

  SELECT count(*) INTO v_count FROM public.assets WHERE school_id=v_school_id AND is_demo;
  IF v_count<>20 THEN RAISE EXCEPTION 'Expected 20 demo assets; found %',v_count; END IF;

  FOR v_asset_id IN
    SELECT id FROM public.assets
    WHERE school_id=v_school_id
      AND asset_code IN ('AST-CMP-001','AST-CMP-002','AST-CMP-003','AST-PRJ-001','AST-FUR-001','AST-ELC-001')
      AND status='active'
  LOOP
    PERFORM public.record_asset_event(
      v_asset_id,'assigned',DATE '2026-09-02',NULL,
      v_employees[1 + mod(abs(hashtext(v_asset_id::text)),6)],NULL,'عهدة تشغيلية تجريبية'
    );
  END LOOP;

  SELECT id INTO v_asset_id FROM public.assets WHERE school_id=v_school_id AND asset_code='AST-PRJ-001';
  IF NOT EXISTS (SELECT 1 FROM public.asset_history WHERE asset_id=v_asset_id AND event_type='transferred') THEN
    PERFORM public.record_asset_event(v_asset_id,'transferred',DATE '2026-09-12','الطابق الثاني',v_employees[8],NULL,'نقل العهدة لاستخدام الجهاز في الصفوف العليا');
  END IF;

  SELECT id INTO v_asset_id FROM public.assets WHERE school_id=v_school_id AND asset_code='AST-CMP-004';
  IF NOT EXISTS (SELECT 1 FROM public.asset_history WHERE asset_id=v_asset_id AND event_type='assigned') THEN
    PERFORM public.record_asset_event(v_asset_id,'assigned',DATE '2026-09-04',NULL,v_employees[1],NULL,'عهدة مؤقتة لأعمال القبول');
    PERFORM public.record_asset_event(v_asset_id,'returned',DATE '2026-09-20','مكتب الإدارة',NULL,NULL,'إرجاع الأصل بعد انتهاء فترة القبول');
  END IF;

  SELECT id INTO v_asset_id FROM public.assets WHERE school_id=v_school_id AND asset_code='AST-AC-001';
  IF NOT EXISTS (SELECT 1 FROM public.asset_history WHERE asset_id=v_asset_id AND event_type='maintenance') THEN
    PERFORM public.record_asset_event(v_asset_id,'maintenance',DATE '2026-09-24','ورشة الصيانة',NULL,'fair','صيانة الضاغط وتنظيف الوحدة');
  END IF;
  SELECT id INTO v_asset_id FROM public.assets WHERE school_id=v_school_id AND asset_code='AST-PRN-001';
  IF NOT EXISTS (SELECT 1 FROM public.asset_history WHERE asset_id=v_asset_id AND event_type='maintenance') THEN
    PERFORM public.record_asset_event(v_asset_id,'maintenance',DATE '2026-09-27','مركز الصيانة',NULL,'fair','استبدال وحدة سحب الورق');
  END IF;
  SELECT id INTO v_asset_id FROM public.assets WHERE school_id=v_school_id AND asset_code='AST-FUR-002';
  IF NOT EXISTS (SELECT 1 FROM public.asset_history WHERE asset_id=v_asset_id AND event_type='damaged') THEN
    PERFORM public.record_asset_event(v_asset_id,'damaged',DATE '2026-09-18',NULL,NULL,'poor','تلف في باب الخزانة يمنع الاستخدام الآمن');
  END IF;
  SELECT id INTO v_asset_id FROM public.assets WHERE school_id=v_school_id AND asset_code='AST-NET-002';
  IF NOT EXISTS (SELECT 1 FROM public.asset_history WHERE asset_id=v_asset_id AND event_type='retired') THEN
    PERFORM public.record_asset_event(v_asset_id,'retired',DATE '2026-09-08','مخزن الصيانة',NULL,'poor','تقاعد بعد استبداله بمعدات أحدث');
  END IF;

  IF (SELECT count(*) FROM public.assets WHERE school_id=v_school_id AND is_demo AND status='assigned')<>6
    OR (SELECT count(*) FROM public.assets WHERE school_id=v_school_id AND is_demo AND status='under_maintenance')<>2
    OR (SELECT count(*) FROM public.assets WHERE school_id=v_school_id AND is_demo AND status='damaged')<>1
    OR (SELECT count(*) FROM public.assets WHERE school_id=v_school_id AND is_demo AND status='retired')<>1 THEN
    RAISE EXCEPTION 'Demo asset status distribution is inconsistent';
  END IF;
END $seed$;

COMMIT;
