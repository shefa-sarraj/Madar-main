-- Demo-only consumable inventory for مدرسة مدار التجريبية.
-- Run after 20260930092051_add_inventory_management.sql. Safe to re-run.

BEGIN;

DO $seed$
DECLARE
  v_school_id uuid;
  v_owner_id uuid;
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

  PERFORM set_config('request.jwt.claim.sub',v_owner_id::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_owner_id,'role','authenticated')::text,true);

  INSERT INTO public.inventory_categories(school_id,name,description)
  VALUES
    (v_school_id,'قرطاسية','الأدوات المكتبية والورقية'),
    (v_school_id,'مواد تنظيف','مواد النظافة والاستهلاك اليومي'),
    (v_school_id,'مستلزمات طباعة','الأحبار والورق الخاص بالطباعة'),
    (v_school_id,'مستلزمات صفية','مواد الأنشطة والاستخدام داخل الصفوف'),
    (v_school_id,'صيانة','مواد الصيانة التشغيلية البسيطة')
  ON CONFLICT (school_id,name) DO NOTHING;

  INSERT INTO public.inventory_items(
    school_id,category_id,item_code,name,unit,minimum_stock,storage_location,description,is_demo
  )
  SELECT v_school_id,c.id,v.item_code,v.name,v.unit,v.minimum_stock,v.location,v.description,true
  FROM (VALUES
    ('INV-STA-001','قرطاسية','ورق تصوير A4','رزمة',10::numeric,'المستودع الرئيسي - رف A1','رزم ورق 80 غراماً'),
    ('INV-STA-002','قرطاسية','أقلام حبر أزرق','علبة',5::numeric,'المستودع الرئيسي - رف A2','علبة تحتوي 50 قلماً'),
    ('INV-STA-003','قرطاسية','دفاتر تحضير','دفتر',5::numeric,'المستودع الرئيسي - رف A2','دفاتر تحضير المعلمين'),
    ('INV-PRN-001','مستلزمات طباعة','حبر طابعة أسود','عبوة',2::numeric,'غرفة الطباعة - خزانة 1','حبر للطابعات الإدارية'),
    ('INV-PRN-002','مستلزمات طباعة','حبر طابعة ملون','عبوة',2::numeric,'غرفة الطباعة - خزانة 1','طقم حبر ملون'),
    ('INV-PRN-003','مستلزمات طباعة','ورق تصوير A3','رزمة',4::numeric,'غرفة الطباعة - رف 2','رزم ورق للملصقات والأنشطة'),
    ('INV-CLN-001','مواد تنظيف','سائل تنظيف أرضيات','عبوة',5::numeric,'مستودع النظافة - رف C1','عبوة سعة 4 لترات'),
    ('INV-CLN-002','مواد تنظيف','مناديل ورقية','كرتونة',4::numeric,'مستودع النظافة - رف C2','كرتونة مناديل للاستخدام المدرسي'),
    ('INV-CLN-003','مواد تنظيف','أكياس نفايات','لفة',6::numeric,'مستودع النظافة - رف C2','لفات أكياس كبيرة'),
    ('INV-CLS-001','مستلزمات صفية','أقلام سبورة','علبة',8::numeric,'المستودع الرئيسي - رف B1','أقلام سبورة متعددة الألوان'),
    ('INV-CLS-002','مستلزمات صفية','ممحاة سبورة','قطعة',5::numeric,'المستودع الرئيسي - رف B1','ممحاة سبورة بيضاء'),
    ('INV-CLS-003','مستلزمات صفية','أوراق أنشطة','رزمة',5::numeric,'المستودع الرئيسي - رف B2','أوراق ملونة للأنشطة الصفية'),
    ('INV-MNT-001','صيانة','مصابيح LED','قطعة',4::numeric,'غرفة الصيانة - رف M1','مصابيح موفرة للطاقة'),
    ('INV-MNT-002','صيانة','شريط عازل','لفة',3::numeric,'غرفة الصيانة - رف M1','شريط عزل كهربائي'),
    ('INV-MNT-003','صيانة','براغي متنوعة','علبة',2::numeric,'غرفة الصيانة - رف M2','علبة براغي بأحجام مختلفة')
  ) AS v(item_code,category_name,name,unit,minimum_stock,location,description)
  JOIN public.inventory_categories c ON c.school_id=v_school_id AND c.name=v.category_name
  ON CONFLICT (school_id,item_code) DO NOTHING;

  SELECT count(*) INTO v_count FROM public.inventory_items WHERE school_id=v_school_id AND is_demo;
  IF v_count<>15 THEN RAISE EXCEPTION 'Expected 15 demo inventory items; found %',v_count; END IF;

  INSERT INTO public.inventory_movements(
    school_id,item_id,movement_type,quantity,movement_date,reference,notes,created_by,is_demo
  )
  SELECT v_school_id,i.id,'opening_balance',v.quantity,DATE '2026-09-01','DEMO-OPEN-'||i.item_code,'رصيد افتتاحي تجريبي',v_owner_id,true
  FROM (VALUES
    ('INV-STA-001',20::numeric),('INV-STA-002',20),('INV-STA-003',12),
    ('INV-PRN-002',4),('INV-PRN-003',8),
    ('INV-CLN-001',15),('INV-CLN-002',10),('INV-CLN-003',14),
    ('INV-CLS-001',12),('INV-CLS-002',10),('INV-CLS-003',12),
    ('INV-MNT-001',10),('INV-MNT-002',8),('INV-MNT-003',6)
  ) AS v(item_code,quantity)
  JOIN public.inventory_items i ON i.school_id=v_school_id AND i.item_code=v.item_code AND i.is_demo
  WHERE NOT EXISTS (
    SELECT 1 FROM public.inventory_movements m
    WHERE m.item_id=i.id AND m.reference='DEMO-OPEN-'||i.item_code AND m.is_demo
  );

  INSERT INTO public.inventory_movements(
    school_id,item_id,movement_type,quantity,movement_date,reference,notes,created_by,is_demo
  )
  SELECT v_school_id,i.id,v.movement_type::public.inventory_movement_type,v.quantity,v.movement_date,v.reference,v.notes,v_owner_id,true
  FROM (VALUES
    ('INV-PRN-001','stock_in',5::numeric,DATE '2026-09-05','DEMO-PO-1001','توريد أحبار الطباعة'),
    ('INV-PRN-002','stock_in',3,DATE '2026-09-08','DEMO-PO-1002','توريد حبر ملون'),
    ('INV-CLN-002','stock_in',5,DATE '2026-09-10','DEMO-PO-1003','توريد مواد النظافة'),
    ('INV-CLS-003','stock_in',8,DATE '2026-09-12','DEMO-PO-1004','توريد مواد الأنشطة')
  ) AS v(item_code,movement_type,quantity,movement_date,reference,notes)
  JOIN public.inventory_items i ON i.school_id=v_school_id AND i.item_code=v.item_code AND i.is_demo
  WHERE NOT EXISTS (
    SELECT 1 FROM public.inventory_movements m WHERE m.item_id=i.id AND m.reference=v.reference AND m.is_demo
  );

  INSERT INTO public.inventory_movements(
    school_id,item_id,movement_type,quantity,movement_date,reference,notes,created_by,is_demo
  )
  SELECT v_school_id,i.id,'stock_out',v.quantity,v.movement_date,v.reference,v.notes,v_owner_id,true
  FROM (VALUES
    ('INV-STA-001',17::numeric,DATE '2026-09-15','DEMO-REQ-2001','صرف للإدارة والصفوف'),
    ('INV-PRN-001',5,DATE '2026-09-18','DEMO-REQ-2002','استهلاك غرفة الطباعة'),
    ('INV-CLN-001',13,DATE '2026-09-20','DEMO-REQ-2003','صرف لفريق النظافة'),
    ('INV-CLN-002',6,DATE '2026-09-22','DEMO-REQ-2004','توزيع على مرافق المدرسة'),
    ('INV-CLS-001',7,DATE '2026-09-24','DEMO-REQ-2005','توزيع على المعلمين'),
    ('INV-MNT-001',3,DATE '2026-09-26','DEMO-REQ-2006','استبدال مصابيح تالفة'),
    ('INV-MNT-003',2,DATE '2026-09-28','DEMO-REQ-2007','أعمال صيانة صفية')
  ) AS v(item_code,quantity,movement_date,reference,notes)
  JOIN public.inventory_items i ON i.school_id=v_school_id AND i.item_code=v.item_code AND i.is_demo
  WHERE NOT EXISTS (
    SELECT 1 FROM public.inventory_movements m WHERE m.item_id=i.id AND m.reference=v.reference AND m.is_demo
  );
END $seed$;

COMMIT;
