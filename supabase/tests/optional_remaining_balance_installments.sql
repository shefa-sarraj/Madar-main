-- Run after the optional_remaining_balance_installments migration. All fixtures roll back.
BEGIN;
SELECT set_config('request.jwt.claim.sub','0fb31137-90cc-4e4e-9339-9f7693bf91c3',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  enrollment public.student_enrollments;
  category_id uuid;
  full_fee uuid;
  partial_fee uuid;
  payment_id uuid;
  advance_id uuid;
  plan_id uuid;
  installment_id uuid;
  fee public.student_fees;
  denied boolean;
BEGIN
  SELECT * INTO STRICT enrollment FROM public.student_enrollments
    WHERE school_id='19112b29-155d-49c2-99df-7032a748325e'
    AND academic_year_id='72a2cba1-6ee1-44f0-8330-6dd1e431b196'
    LIMIT 1;
  SELECT id INTO STRICT category_id FROM public.fee_categories
    WHERE school_id=enrollment.school_id LIMIT 1;
  INSERT INTO public.student_fees(school_id,student_id,enrollment_id,academic_year_id,fee_category_id,name,original_amount)
    VALUES(enrollment.school_id,enrollment.student_id,enrollment.id,enrollment.academic_year_id,category_id,'Rollback full fee',100)
    RETURNING id INTO full_fee;
  INSERT INTO public.student_fees(school_id,student_id,enrollment_id,academic_year_id,fee_category_id,name,original_amount)
    VALUES(enrollment.school_id,enrollment.student_id,enrollment.id,enrollment.academic_year_id,category_id,'Rollback partial fee',100)
    RETURNING id INTO partial_fee;

  payment_id := public.record_payment(enrollment.student_id,100,'cash',current_date,NULL,NULL,
    jsonb_build_array(jsonb_build_object('student_fee_id',full_fee,'amount',100)));
  SELECT * INTO STRICT fee FROM public.student_fees WHERE id=full_fee;
  IF fee.balance<>0 OR fee.amount_paid<>100 OR fee.status<>'paid' THEN
    RAISE EXCEPTION 'Full direct payment did not settle the fee';
  END IF;
  IF EXISTS(SELECT 1 FROM public.installments WHERE student_fee_id=full_fee) THEN
    RAISE EXCEPTION 'Full direct payment created unwanted installments';
  END IF;
  denied:=false;
  BEGIN
    PERFORM public.set_installment_plan(full_fee,'Invalid paid plan','[{"amount":100,"due_date":"2026-12-01"}]');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='الرسم مسدد بالكامل؛ لا يمكن إنشاء أقساط' THEN denied:=true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Paid fee accepted installments'; END IF;

  advance_id := public.record_payment(enrollment.student_id,40,'cash',current_date,NULL,NULL,
    jsonb_build_array(jsonb_build_object('student_fee_id',partial_fee,'amount',40)));
  SELECT * INTO STRICT fee FROM public.student_fees WHERE id=partial_fee;
  IF fee.balance<>60 OR fee.amount_paid<>40 OR fee.status<>'partial' THEN
    RAISE EXCEPTION 'Partial direct payment did not preserve outstanding balance';
  END IF;
  denied:=false;
  BEGIN
    PERFORM public.set_installment_plan(partial_fee,'Invalid full plan','[{"amount":100,"due_date":"2026-12-01"}]');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'مجموع الأقساط%' THEN denied:=true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Plan exceeded outstanding balance'; END IF;
  plan_id:=public.set_installment_plan(partial_fee,'Remaining only','[{"amount":60,"due_date":"2026-12-01"}]');
  SELECT id INTO STRICT installment_id FROM public.installments WHERE installment_plan_id=plan_id;
  IF (SELECT sum(amount) FROM public.installments WHERE installment_plan_id=plan_id)<>60 THEN
    RAISE EXCEPTION 'Plan includes previously paid amount';
  END IF;
  IF (SELECT a.installment_id FROM public.payment_allocations a WHERE a.payment_id=advance_id) IS NOT NULL THEN
    RAISE EXCEPTION 'Existing direct allocation was changed';
  END IF;
  payment_id:=public.record_payment(enrollment.student_id,20,'cash',current_date,NULL,NULL,
    jsonb_build_array(jsonb_build_object('student_fee_id',partial_fee,'installment_id',installment_id,'amount',20)));
  denied:=false;
  BEGIN
    PERFORM public.set_installment_plan(partial_fee,'Unsafe replacement','[{"amount":40,"due_date":"2026-12-01"}]');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='لا يمكن تعديل أقساط مرتبطة بدفعات' THEN denied:=true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Payment-linked plan was replaced'; END IF;
  PERFORM public.cancel_payment(payment_id,'Rollback safeguard check');
  denied:=false;
  BEGIN
    PERFORM public.set_installment_plan(partial_fee,'Unsafe cancelled replacement','[{"amount":60,"due_date":"2026-12-01"}]');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='لا يمكن تعديل أقساط مرتبطة بدفعات' THEN denied:=true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Cancelled allocation history was removed'; END IF;
  denied:=false;
  BEGIN
    PERFORM public.record_payment(enrollment.student_id,61,'cash',current_date,NULL,NULL,
      jsonb_build_array(jsonb_build_object('student_fee_id',partial_fee,'installment_id',installment_id,'amount',61)));
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'المبلغ يتجاوز المتبقي على القسط%' THEN denied:=true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Payment exceeded installment balance'; END IF;
  denied:=false;
  BEGIN
    PERFORM public.record_payment(enrollment.student_id,61,'cash',current_date,NULL,NULL,
      jsonb_build_array(jsonb_build_object('student_fee_id',partial_fee,'amount',61)));
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'المبلغ يتجاوز المتبقي على الرسم%' THEN denied:=true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Direct payment exceeded remaining fee balance'; END IF;
  payment_id:=public.record_payment(enrollment.student_id,60,'cash',current_date,NULL,NULL,
    jsonb_build_array(jsonb_build_object('student_fee_id',partial_fee,'installment_id',installment_id,'amount',60)));
  SELECT * INTO STRICT fee FROM public.student_fees WHERE id=partial_fee;
  IF fee.amount_paid<>100 OR fee.balance<>0 OR fee.status<>'paid' THEN
    RAISE EXCEPTION 'Remaining-balance payment failed to settle the fee';
  END IF;
  IF (SELECT i.amount_paid FROM public.installments i WHERE i.id=installment_id)<>60 THEN
    RAISE EXCEPTION 'Installment allocation total is invalid';
  END IF;

  PERFORM public.cancel_payment(payment_id,'Rollback installment limit check');
  PERFORM public.cancel_payment(advance_id,'Rollback installment limit check');
  denied:=false;
  BEGIN
    PERFORM public.set_installment_plan(partial_fee,'Empty plan','[]');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='أضف قسطاً واحداً على الأقل' THEN denied:=true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Empty plan accepted'; END IF;
  denied:=false;
  BEGIN
    PERFORM public.set_installment_plan(partial_fee,'Underfunded plan','[{"amount":99,"due_date":"2026-12-01"}]');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'مجموع الأقساط%' THEN denied:=true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Underfunded plan accepted'; END IF;
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000000',true);
  denied:=false;
  BEGIN
    PERFORM public.set_installment_plan(partial_fee,'Unauthorized','[{"amount":60,"due_date":"2026-12-01"}]');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='غير مصرح' THEN denied:=true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Unauthorized plan creation allowed'; END IF;
END $$;
ROLLBACK;
