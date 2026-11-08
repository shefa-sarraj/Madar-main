DO $$
DECLARE
  s_id uuid; y_id uuid; owner_id uuid;
  st uuid[]; gu uuid[]; em uuid[];
BEGIN
  SELECT id INTO s_id FROM public.schools WHERE name_ar='مدرسة مدار التجريبية' LIMIT 1;
  IF s_id IS NULL THEN RAISE EXCEPTION 'لم يتم العثور على مدرسة مدار التجريبية'; END IF;
  SELECT id INTO y_id FROM public.academic_years WHERE school_id=s_id AND name='2026/2027' LIMIT 1;
  IF y_id IS NULL THEN RAISE EXCEPTION 'لم يتم العثور على السنة الدراسية 2026/2027'; END IF;
  SELECT ur.user_id INTO owner_id FROM public.user_roles ur
   WHERE ur.school_id=s_id AND ur.role='school_owner' LIMIT 1;
  IF owner_id IS NULL THEN RAISE EXCEPTION 'لم يتم العثور على مالك المدرسة'; END IF;
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);

  SELECT array_agg(id ORDER BY full_name) INTO st FROM (SELECT id,full_name FROM public.students WHERE school_id=s_id ORDER BY full_name LIMIT 8) q;
  SELECT array_agg(id ORDER BY full_name) INTO gu FROM (SELECT id,full_name FROM public.guardians WHERE school_id=s_id ORDER BY full_name LIMIT 6) q;
  SELECT array_agg(id ORDER BY full_name) INTO em FROM (SELECT id,full_name FROM public.employees WHERE school_id=s_id ORDER BY full_name LIMIT 6) q;
  IF coalesce(array_length(st,1),0)<4 OR coalesce(array_length(gu,1),0)<3 OR coalesce(array_length(em,1),0)<3
    THEN RAISE EXCEPTION 'البيانات التجريبية الأساسية غير كافية'; END IF;

  INSERT INTO public.cases(school_id,academic_year_id,type,category,title,description,priority,status,student_id,guardian_id,employee_id,assigned_to_user_id,submitted_by_name,submitted_by_phone,resolution,created_by,is_demo,created_at)
  SELECT s_id,y_id,v.type::public.case_type,v.category,v.title,v.description,v.priority::public.case_priority,
    v.status::public.case_status,
    CASE WHEN v.student_pos>0 THEN st[v.student_pos] END,
    CASE WHEN v.guardian_pos>0 THEN gu[v.guardian_pos] END,
    CASE WHEN v.employee_pos>0 THEN em[v.employee_pos] END,
    CASE WHEN v.assign_owner THEN owner_id END,v.submitter,v.phone,v.resolution,owner_id,true,v.created_at
  FROM (VALUES
    ('complaint','خدمة أولياء الأمور','تأخر الرد على استفسار ولي أمر','أفاد ولي الأمر بتأخر الرد على استفساره المتعلق بجدول الاختبارات.','medium','under_review',1,1,0,true,'خالد محمود','0599123401',NULL,now()-interval '18 days'),
    ('note','سلوك طلابي','ملاحظة تكرار التأخر الصباحي','تم رصد تأخر الطالب عن الاصطفاف الصباحي عدة مرات خلال الأسبوع.','high','in_progress',2,2,0,true,NULL,NULL,NULL,now()-interval '12 days'),
    ('incident','سلوك طلابي','مشادة بين طالبين أثناء الفسحة','وقعت مشادة لفظية وتم الفصل بين الطالبين وإبلاغ المرشد.','urgent','under_review',3,0,0,true,NULL,NULL,NULL,now()-interval '7 days'),
    ('feedback','تعليم وأكاديميات','إشادة بطريقة متابعة الواجبات','قدم ولي الأمر إشادة بوضوح متابعة الواجبات والتواصل مع الأسرة.','low','closed',4,3,0,false,'سمر حسن','0568123402','تم توثيق الملاحظة وشكر ولي الأمر ومشاركة الإشادة مع المعلمة.',now()-interval '35 days'),
    ('complaint','مرافق وصيانة','تعطل جهاز التكييف في أحد الصفوف','درجة حرارة الصف مرتفعة بسبب توقف جهاز التكييف عن العمل.','high','in_progress',0,0,0,true,'لجنة السلامة',NULL,NULL,now()-interval '5 days'),
    ('note','شؤون موظفين','متابعة الالتزام بموعد الإشراف','ملاحظة إدارية داخلية بشأن الالتزام بجدول الإشراف الصباحي.','medium','new',0,0,1,true,NULL,NULL,NULL,now()-interval '3 days'),
    ('feedback','خدمة أولياء الأمور','اقتراح تحسين رسائل الرحلات','اقترح ولي أمر توضيح مواعيد الانطلاق والعودة في رسالة واحدة.','low','resolved',5,4,0,false,'أحمد سمير','0598456123','تم اعتماد قالب موحد يتضمن جميع مواعيد الرحلة.',now()-interval '28 days'),
    ('incident','مرافق وصيانة','تسرب مياه قرب دورة المياه','لوحظ تسرب محدود وتم عزل المنطقة لحين إتمام الصيانة.','urgent','resolved',0,0,3,false,NULL,NULL,'تم استبدال الوصلة التالفة وفحص المنطقة بعد الإصلاح.',now()-interval '21 days'),
    ('complaint','نقل مدرسي','تأخر الحافلة في خط العودة','ورد بلاغ عن تأخر الحافلة في الوصول إلى نقطة التجمع.','medium','new',6,5,0,true,'منى عادل','0569345678',NULL,now()-interval '2 days'),
    ('note','تسجيل وقبول','وثيقة هوية تحتاج تحديثاً','نسخة الهوية المرفقة غير واضحة وتحتاج إلى نسخة بديلة.','medium','in_progress',7,6,0,true,NULL,NULL,NULL,now()-interval '9 days'),
    ('incident','سلوك طلابي','إصابة بسيطة في ساحة المدرسة','تعرض الطالب لخدش بسيط أثناء اللعب وتم تقديم الإسعاف الأولي.','medium','closed',8,0,0,false,NULL,NULL,'تم تقديم الإسعاف الأولي وإبلاغ الأسرة ومراجعة إجراءات السلامة.',now()-interval '40 days'),
    ('feedback','أخرى','مقترح تخصيص صندوق للملاحظات','اقتراح وضع صندوق داخلي لاستقبال الملاحظات التشغيلية من الموظفين.','low','rejected',0,0,2,false,NULL,NULL,NULL,now()-interval '15 days')
  ) AS v(type,category,title,description,priority,status,student_pos,guardian_pos,employee_pos,assign_owner,submitter,phone,resolution,created_at)
  WHERE NOT EXISTS (SELECT 1 FROM public.cases c WHERE c.school_id=s_id AND c.is_demo AND c.title=v.title);

  INSERT INTO public.case_comments(school_id,case_id,user_id,comment,is_demo,created_at)
  SELECT s_id,c.id,owner_id,v.comment,true,c.created_at+v.offset_time
  FROM public.cases c
  JOIN (VALUES
    ('تأخر الرد على استفسار ولي أمر','تم التواصل مع مسؤول المرحلة وجمع تفاصيل الاستفسار.',interval '1 day'),
    ('تأخر الرد على استفسار ولي أمر','تم تحديد موعد للرد النهائي على ولي الأمر.',interval '2 days'),
    ('ملاحظة تكرار التأخر الصباحي','تم التواصل مع الأسرة والاتفاق على متابعة أسبوعية.',interval '1 day'),
    ('مشادة بين طالبين أثناء الفسحة','استمع المرشد إلى الطالبين كل على حدة.',interval '3 hours'),
    ('تعطل جهاز التكييف في أحد الصفوف','تم فتح طلب صيانة ونقل الحصة مؤقتاً.',interval '4 hours'),
    ('متابعة الالتزام بموعد الإشراف','تمت جدولة جلسة متابعة إدارية قصيرة.',interval '1 day'),
    ('تأخر الحافلة في خط العودة','جارٍ مراجعة مسار الحافلة مع المشرف.',interval '6 hours'),
    ('وثيقة هوية تحتاج تحديثاً','أُرسلت رسالة إلى ولي الأمر لطلب نسخة أوضح.',interval '1 day')
  ) AS v(title,comment,offset_time) ON c.school_id=s_id AND c.is_demo AND c.title=v.title
  WHERE NOT EXISTS (
    SELECT 1 FROM public.case_comments cc WHERE cc.case_id=c.id AND cc.is_demo AND cc.comment=v.comment
  );
END $$;
