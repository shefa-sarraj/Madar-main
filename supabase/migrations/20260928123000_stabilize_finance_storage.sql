-- Ensure required private storage buckets exist.
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('student-documents', 'student-documents', false),
  ('finance-attachments', 'finance-attachments', false)
ON CONFLICT (id) DO UPDATE
SET public = false;

-- Installment plans must be configured before any completed payment allocation.
CREATE OR REPLACE FUNCTION public.set_installment_plan(_student_fee_id uuid, _name text, _items jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE fee public.student_fees; plan_id uuid; total numeric(12,2); it jsonb; n int := 0;
BEGIN
  SELECT * INTO fee FROM public.student_fees WHERE id=_student_fee_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الرسم غير موجود'; END IF;
  IF NOT public.can_manage_finance(auth.uid(), fee.school_id) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF fee.status IN ('cancelled','waived') THEN RAISE EXCEPTION 'الرسم ملغى'; END IF;
  IF jsonb_array_length(coalesce(_items,'[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'أضف قسطاً واحداً على الأقل'; END IF;
  SELECT sum((x->>'amount')::numeric(12,2)) INTO total FROM jsonb_array_elements(_items) x;
  IF total <> fee.final_amount THEN RAISE EXCEPTION 'مجموع الأقساط (%) لا يساوي قيمة الرسم (%)', total, fee.final_amount; END IF;
  IF EXISTS (
    SELECT 1
    FROM public.payment_allocations a
    JOIN public.payments p ON p.id=a.payment_id
    WHERE a.student_fee_id=fee.id AND p.status='completed'
  ) THEN
    RAISE EXCEPTION 'يجب إعداد خطة التقسيط قبل تخصيص أي دفعة على الرسم';
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
END $$;

-- Every allocation in one payment must share tenant, student, and academic year.
CREATE OR REPLACE FUNCTION public.record_payment(_student_id uuid, _amount numeric, _method public.payment_method, _payment_date date,
  _reference text, _notes text, _allocations jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE st public.students; pay_id uuid; al jsonb; fee public.student_fees; first_fee public.student_fees; inst public.installments;
  total numeric(12,2) := 0; a_amt numeric(12,2); n int; yr uuid; num text; fee_ids uuid[] := '{}';
BEGIN
  SELECT * INTO st FROM public.students WHERE id=_student_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'الطالب غير موجود'; END IF;
  IF NOT public.can_manage_finance(auth.uid(), st.school_id) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'مبلغ الدفعة غير صحيح'; END IF;
  IF jsonb_array_length(coalesce(_allocations,'[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'حدد الرسوم التي تُسدد بهذه الدفعة'; END IF;
  SELECT coalesce(sum((x->>'amount')::numeric(12,2)),0) INTO total FROM jsonb_array_elements(_allocations) x;
  IF total <> round(_amount,2) THEN RAISE EXCEPTION 'مجموع التوزيع (%) يجب أن يساوي مبلغ الدفعة (%)', total, _amount; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('pay_no_' || st.school_id::text));
  SELECT count(*)+1 INTO n FROM public.payments WHERE school_id=st.school_id;
  num := 'R-' || to_char(coalesce(_payment_date,current_date),'YYYY') || '-' || lpad(n::text,5,'0');
  SELECT * INTO first_fee
  FROM public.student_fees
  WHERE id=((_allocations->0)->>'student_fee_id')::uuid
  FOR UPDATE;
  IF NOT FOUND OR first_fee.school_id <> st.school_id OR first_fee.student_id <> st.id THEN
    RAISE EXCEPTION 'يجب أن تنتمي جميع توزيعات الدفعة إلى نفس المدرسة والطالب والسنة الدراسية';
  END IF;
  yr := first_fee.academic_year_id;
  INSERT INTO public.payments(school_id, student_id, academic_year_id, payment_number, amount, payment_method, payment_date, reference_number, notes, received_by, status)
  VALUES (st.school_id, st.id, yr, num, round(_amount,2), coalesce(_method,'cash'), coalesce(_payment_date,current_date), nullif(trim(_reference),''), nullif(trim(_notes),''), auth.uid(), 'completed')
  RETURNING id INTO pay_id;

  FOR al IN SELECT * FROM jsonb_array_elements(_allocations) LOOP
    a_amt := round((al->>'amount')::numeric, 2);
    IF a_amt <= 0 THEN RAISE EXCEPTION 'مبلغ التوزيع يجب أن يكون أكبر من صفر'; END IF;
    SELECT * INTO fee FROM public.student_fees WHERE id=(al->>'student_fee_id')::uuid FOR UPDATE;
    IF NOT FOUND OR fee.school_id <> st.school_id OR fee.student_id <> st.id OR fee.academic_year_id <> yr THEN
      RAISE EXCEPTION 'يجب أن تنتمي جميع توزيعات الدفعة إلى نفس المدرسة والطالب والسنة الدراسية';
    END IF;
    IF fee.status IN ('cancelled','waived') THEN RAISE EXCEPTION 'لا يمكن الدفع على رسم ملغى'; END IF;
    IF nullif(al->>'installment_id','') IS NOT NULL THEN
      SELECT * INTO inst FROM public.installments WHERE id=(al->>'installment_id')::uuid FOR UPDATE;
      IF NOT FOUND OR inst.student_fee_id <> fee.id THEN RAISE EXCEPTION 'قسط غير صالح'; END IF;
      IF a_amt > inst.amount - inst.amount_paid THEN RAISE EXCEPTION 'المبلغ يتجاوز المتبقي على القسط رقم %', inst.installment_number; END IF;
      UPDATE public.installments SET amount_paid = amount_paid + a_amt WHERE id=inst.id;
    END IF;
    IF a_amt > fee.balance THEN RAISE EXCEPTION 'المبلغ يتجاوز المتبقي على الرسم "%"', fee.name; END IF;
    INSERT INTO public.payment_allocations(school_id, payment_id, student_fee_id, installment_id, amount)
    VALUES (st.school_id, pay_id, fee.id, nullif(al->>'installment_id','')::uuid, a_amt);
    PERFORM public.recalc_student_fee(fee.id);
    fee_ids := fee_ids || fee.id;
  END LOOP;

  INSERT INTO public.audit_logs(school_id,user_id,action,entity_type,entity_id,metadata)
  VALUES (st.school_id, auth.uid(), 'payment_recorded', 'payments', pay_id, jsonb_build_object('payment_number',num,'amount',_amount,'method',_method,'student_id',st.id,'fees',to_jsonb(fee_ids)));
  RETURN pay_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.set_installment_plan(uuid,text,jsonb),
  public.record_payment(uuid,numeric,public.payment_method,date,text,text,jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_installment_plan(uuid,text,jsonb),
  public.record_payment(uuid,numeric,public.payment_method,date,text,text,jsonb)
  TO authenticated;
