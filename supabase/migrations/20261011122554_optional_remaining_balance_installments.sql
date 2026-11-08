-- Plans are optional and cover only the unpaid balance. Preserve allocation history.
CREATE OR REPLACE FUNCTION public.set_installment_plan(_student_fee_id uuid, _name text, _items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE fee public.student_fees; plan_id uuid; total numeric(12,2); it jsonb; n int := 0;
BEGIN
  SELECT * INTO fee FROM public.student_fees WHERE id=_student_fee_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الرسم غير موجود'; END IF;
  IF NOT ((public.can_manage_finance(auth.uid(), fee.school_id) AND private.system_override_guard(auth.uid(),fee.school_id,'fees','edit')) OR public.has_custom_module_permission(auth.uid(),fee.school_id,'fees','edit')) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF fee.status IN ('cancelled','waived') THEN RAISE EXCEPTION 'الرسم ملغى'; END IF;
  IF fee.balance <= 0 THEN RAISE EXCEPTION 'الرسم مسدد بالكامل؛ لا يمكن إنشاء أقساط'; END IF;
  IF jsonb_array_length(coalesce(_items,'[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'أضف قسطاً واحداً على الأقل'; END IF;
  SELECT sum((x->>'amount')::numeric(12,2)) INTO total FROM jsonb_array_elements(_items) x;
  IF total IS NULL OR total <> fee.balance THEN RAISE EXCEPTION 'مجموع الأقساط (%) لا يساوي الرصيد المتبقي (%)', total, fee.balance; END IF;
  IF EXISTS (
    SELECT 1
    FROM public.payment_allocations a
    WHERE a.student_fee_id=fee.id AND a.installment_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'لا يمكن تعديل أقساط مرتبطة بدفعات';
  END IF;
  DELETE FROM public.installment_plans WHERE student_fee_id=fee.id;
  INSERT INTO public.installment_plans(school_id, student_fee_id, name) VALUES (fee.school_id, fee.id, coalesce(nullif(trim(_name),''),'خطة تقسيط')) RETURNING id INTO plan_id;
  FOR it IN SELECT * FROM jsonb_array_elements(_items) ORDER BY (value->>'due_date')::date LOOP
    n := n + 1;
    IF (it->>'amount')::numeric <= 0 THEN RAISE EXCEPTION 'مبلغ القسط يجب أن يكون أكبر من صفر'; END IF;
    INSERT INTO public.installments(school_id, installment_plan_id, student_fee_id, installment_number, amount, due_date)
    VALUES (fee.school_id, plan_id, fee.id, n, (it->>'amount')::numeric(12,2), (it->>'due_date')::date);
  END LOOP;
  PERFORM public.recalc_student_fee(fee.id);
  INSERT INTO public.audit_logs(school_id,user_id,action,entity_type,entity_id,metadata)
  VALUES (fee.school_id, auth.uid(), 'installment_created', 'installment_plans', plan_id, jsonb_build_object('student_fee_id',fee.id,'count',n,'total',total));
  RETURN plan_id;
END $function$
;
