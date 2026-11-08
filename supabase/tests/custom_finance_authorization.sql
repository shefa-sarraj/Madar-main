BEGIN;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('12000000-0000-0000-0000-000000000001','finance-custom@example.invalid','{}');
INSERT INTO public.schools(id,name_ar) VALUES ('22000000-0000-0000-0000-000000000001','Finance authorization test');
INSERT INTO public.school_members(school_id,user_id,status)
 VALUES('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001','active');
INSERT INTO public.academic_years(id,school_id,name,start_date,end_date)
 VALUES('52000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','2026','2026-01-01','2026-12-31');
INSERT INTO public.stages(id,school_id,name) VALUES('62000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','Stage');
INSERT INTO public.grades(id,school_id,stage_id,name)
 VALUES('72000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000001','Grade');
INSERT INTO public.students(id,school_id,student_number,first_name,last_name,gender)
 VALUES('82000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','TEST-1','Test','Student','male');
INSERT INTO public.student_enrollments(id,school_id,student_id,academic_year_id,grade_id)
 VALUES('92000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000001');
INSERT INTO public.fee_categories(id,school_id,name) VALUES('32000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','Tuition');
INSERT INTO public.student_fees(id,school_id,student_id,enrollment_id,academic_year_id,fee_category_id,name,original_amount)
 VALUES('a2000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','Test fee',100);
INSERT INTO public.school_roles(id,school_id,name) VALUES('42000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','Custom cashier test');
INSERT INTO public.school_role_permissions(role_id,school_id,module,can_view)
 VALUES('42000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','fees',true);
INSERT INTO public.school_user_custom_roles(school_id,user_id,role_id)
 VALUES('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000001',true);
DO $$ DECLARE denied boolean:=false; BEGIN
 PERFORM public.refresh_finance_statuses('22000000-0000-0000-0000-000000000001');
 BEGIN
  PERFORM public.record_payment('82000000-0000-0000-0000-000000000001',10,'cash',current_date,NULL,NULL,
   '[{"student_fee_id":"a2000000-0000-0000-0000-000000000001","amount":10}]');
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='غير مصرح' THEN denied:=true; ELSE RAISE; END IF; END;
 IF NOT denied THEN RAISE EXCEPTION 'View-only fee role recorded payment'; END IF;
END $$;
RESET ROLE;
UPDATE public.school_role_permissions SET can_create=true WHERE module='fees';
SET LOCAL ROLE authenticated;
DO $$ DECLARE payment_id uuid; denied boolean:=false; paid numeric; BEGIN
 payment_id:=public.record_payment('82000000-0000-0000-0000-000000000001',10,'cash',current_date,NULL,NULL,
  '[{"student_fee_id":"a2000000-0000-0000-0000-000000000001","amount":10}]');
 SELECT amount_paid INTO paid FROM public.student_fees WHERE id='a2000000-0000-0000-0000-000000000001';
 IF paid<>10 THEN RAISE EXCEPTION 'Custom cashier payment did not update fee balance'; END IF;
 BEGIN PERFORM public.cancel_payment(payment_id,'Test');
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='غير مصرح' THEN denied:=true; ELSE RAISE; END IF; END;
 IF NOT denied THEN RAISE EXCEPTION 'Payment create permission allowed cancellation'; END IF;
END $$;
RESET ROLE;
UPDATE public.school_role_permissions SET can_edit=true,can_manage=true WHERE module='fees';
SET LOCAL ROLE authenticated;
DO $$ DECLARE payment_id uuid; paid numeric; BEGIN
 SELECT id INTO payment_id FROM public.payments;
 PERFORM public.cancel_payment(payment_id,'Custom manager test');
 SELECT amount_paid INTO paid FROM public.student_fees WHERE id='a2000000-0000-0000-0000-000000000001';
 IF paid<>0 THEN RAISE EXCEPTION 'Custom manage cancellation did not restore balance'; END IF;
END $$;
RESET ROLE;
UPDATE public.school_role_permissions SET module='expenses';
SET LOCAL ROLE authenticated;
DO $$ DECLARE denied boolean:=false; BEGIN
 BEGIN PERFORM public.refresh_finance_statuses('22000000-0000-0000-0000-000000000001');
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='غير مصرح' THEN denied:=true; ELSE RAISE; END IF; END;
 IF NOT denied THEN RAISE EXCEPTION 'Expense manage permission leaked into fees'; END IF;
END $$;
ROLLBACK;
