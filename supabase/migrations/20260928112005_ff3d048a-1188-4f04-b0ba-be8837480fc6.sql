
CREATE TYPE public.student_fee_status AS ENUM ('unpaid','partial','paid','overdue','waived','cancelled');
CREATE TYPE public.installment_status AS ENUM ('upcoming','due','partial','paid','overdue');
CREATE TYPE public.discount_type AS ENUM ('percentage','fixed');
CREATE TYPE public.payment_method AS ENUM ('cash','bank_transfer','card','other');
CREATE TYPE public.payment_status AS ENUM ('completed','pending','cancelled','refunded');
CREATE TYPE public.expense_status AS ENUM ('recorded','cancelled');
CREATE TYPE public.cost_center_type AS ENUM ('school','stage','department','custom');

CREATE OR REPLACE FUNCTION public.can_manage_finance(_user_id uuid, _school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.can_manage_school(_user_id,_school_id) OR public.has_role(_user_id,_school_id,'accountant');
$$;
CREATE OR REPLACE FUNCTION public.can_view_finance(_user_id uuid, _school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.can_manage_finance(_user_id,_school_id) OR public.has_role(_user_id,_school_id,'registrar');
$$;
REVOKE EXECUTE ON FUNCTION public.can_manage_finance(uuid,uuid), public.can_view_finance(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_finance(uuid,uuid), public.can_view_finance(uuid,uuid) TO authenticated;

-- ===== Tables =====
CREATE TABLE public.fee_categories(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL, description text, is_active boolean NOT NULL DEFAULT true,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(school_id,name), UNIQUE(id,school_id));

CREATE TABLE public.fee_structures(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  grade_id uuid REFERENCES public.grades(id) ON DELETE RESTRICT,
  fee_category_id uuid NOT NULL,
  name text NOT NULL, amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'USD', due_date date,
  is_mandatory boolean NOT NULL DEFAULT true, is_active boolean NOT NULL DEFAULT true,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (fee_category_id, school_id) REFERENCES public.fee_categories(id, school_id) ON DELETE RESTRICT);

CREATE TABLE public.student_fees(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  enrollment_id uuid NOT NULL REFERENCES public.student_enrollments(id) ON DELETE RESTRICT,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  fee_structure_id uuid REFERENCES public.fee_structures(id) ON DELETE SET NULL,
  fee_category_id uuid NOT NULL,
  name text NOT NULL,
  original_amount numeric(12,2) NOT NULL CHECK (original_amount >= 0),
  discount_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  final_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (final_amount >= 0),
  amount_paid numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  balance numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  due_date date, status public.student_fee_status NOT NULL DEFAULT 'unpaid', notes text,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (fee_category_id, school_id) REFERENCES public.fee_categories(id, school_id) ON DELETE RESTRICT);
CREATE INDEX ON public.student_fees(school_id, student_id);
CREATE UNIQUE INDEX student_fees_one_per_structure ON public.student_fees(enrollment_id, fee_structure_id) WHERE fee_structure_id IS NOT NULL AND status <> 'cancelled';

CREATE TABLE public.installment_plans(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_fee_id uuid NOT NULL UNIQUE REFERENCES public.student_fees(id) ON DELETE CASCADE,
  name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.installments(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  installment_plan_id uuid NOT NULL REFERENCES public.installment_plans(id) ON DELETE CASCADE,
  student_fee_id uuid NOT NULL REFERENCES public.student_fees(id) ON DELETE CASCADE,
  installment_number int NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  due_date date NOT NULL,
  amount_paid numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  status public.installment_status NOT NULL DEFAULT 'upcoming',
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(installment_plan_id, installment_number));
CREATE INDEX ON public.installments(school_id, due_date);

CREATE TABLE public.discounts(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  student_fee_id uuid REFERENCES public.student_fees(id) ON DELETE RESTRICT,
  name text NOT NULL, type public.discount_type NOT NULL,
  value numeric(12,2) NOT NULL CHECK (value > 0),
  calculated_amount numeric(12,2) NOT NULL CHECK (calculated_amount >= 0),
  reason text, approved_by uuid REFERENCES auth.users(id), created_by uuid REFERENCES auth.users(id),
  is_active boolean NOT NULL DEFAULT true, is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.payments(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  payment_number text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'USD',
  payment_method public.payment_method NOT NULL DEFAULT 'cash',
  payment_date date NOT NULL DEFAULT current_date,
  reference_number text, notes text,
  received_by uuid REFERENCES auth.users(id),
  status public.payment_status NOT NULL DEFAULT 'completed',
  cancel_reason text, is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(school_id, payment_number));
CREATE INDEX ON public.payments(school_id, payment_date);

CREATE TABLE public.payment_allocations(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  student_fee_id uuid NOT NULL REFERENCES public.student_fees(id) ON DELETE RESTRICT,
  installment_id uuid REFERENCES public.installments(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ON public.payment_allocations(student_fee_id);
CREATE INDEX ON public.payment_allocations(payment_id);

CREATE TABLE public.expense_categories(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(school_id,name), UNIQUE(id,school_id));

CREATE TABLE public.cost_centers(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL, type public.cost_center_type NOT NULL DEFAULT 'custom',
  reference_id uuid, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(school_id,name), UNIQUE(id,school_id));

CREATE TABLE public.expenses(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  expense_number text NOT NULL DEFAULT '',
  expense_category_id uuid NOT NULL,
  cost_center_id uuid,
  title text NOT NULL, amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'USD', expense_date date NOT NULL DEFAULT current_date,
  payment_method public.payment_method, reference_number text, description text, attachment_url text,
  created_by uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  status public.expense_status NOT NULL DEFAULT 'recorded', is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (expense_category_id, school_id) REFERENCES public.expense_categories(id, school_id) ON DELETE RESTRICT,
  FOREIGN KEY (cost_center_id, school_id) REFERENCES public.cost_centers(id, school_id) ON DELETE RESTRICT);
CREATE INDEX ON public.expenses(school_id, expense_date);

-- ===== Grants =====
GRANT SELECT, INSERT, UPDATE ON public.fee_categories, public.fee_structures, public.expense_categories, public.cost_centers, public.expenses TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.student_fees TO authenticated;
GRANT SELECT ON public.installment_plans, public.installments, public.discounts, public.payments, public.payment_allocations TO authenticated;
GRANT ALL ON public.fee_categories, public.fee_structures, public.student_fees, public.installment_plans, public.installments, public.discounts, public.payments, public.payment_allocations, public.expense_categories, public.cost_centers, public.expenses TO service_role;

ALTER TABLE public.fee_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Viewable by finance viewers (incl. registrar)
CREATE POLICY "Finance viewers read" ON public.fee_categories FOR SELECT TO authenticated USING (public.can_view_finance(auth.uid(), school_id));
CREATE POLICY "Finance viewers read" ON public.fee_structures FOR SELECT TO authenticated USING (public.can_view_finance(auth.uid(), school_id));
CREATE POLICY "Finance viewers read" ON public.student_fees FOR SELECT TO authenticated USING (public.can_view_finance(auth.uid(), school_id));
CREATE POLICY "Finance viewers read" ON public.installment_plans FOR SELECT TO authenticated USING (public.can_view_finance(auth.uid(), school_id));
CREATE POLICY "Finance viewers read" ON public.installments FOR SELECT TO authenticated USING (public.can_view_finance(auth.uid(), school_id));
CREATE POLICY "Finance viewers read" ON public.discounts FOR SELECT TO authenticated USING (public.can_view_finance(auth.uid(), school_id));
CREATE POLICY "Finance viewers read" ON public.payments FOR SELECT TO authenticated USING (public.can_view_finance(auth.uid(), school_id));
CREATE POLICY "Finance viewers read" ON public.payment_allocations FOR SELECT TO authenticated USING (public.can_view_finance(auth.uid(), school_id));
-- Managers write
CREATE POLICY "Finance managers insert" ON public.fee_categories FOR INSERT TO authenticated WITH CHECK (public.can_manage_finance(auth.uid(), school_id));
CREATE POLICY "Finance managers update" ON public.fee_categories FOR UPDATE TO authenticated USING (public.can_manage_finance(auth.uid(), school_id)) WITH CHECK (public.can_manage_finance(auth.uid(), school_id));
CREATE POLICY "Finance managers insert" ON public.fee_structures FOR INSERT TO authenticated WITH CHECK (public.can_manage_finance(auth.uid(), school_id));
CREATE POLICY "Finance managers update" ON public.fee_structures FOR UPDATE TO authenticated USING (public.can_manage_finance(auth.uid(), school_id)) WITH CHECK (public.can_manage_finance(auth.uid(), school_id));
CREATE POLICY "Finance managers insert" ON public.student_fees FOR INSERT TO authenticated WITH CHECK (public.can_manage_finance(auth.uid(), school_id));
CREATE POLICY "Finance managers update" ON public.student_fees FOR UPDATE TO authenticated USING (public.can_manage_finance(auth.uid(), school_id)) WITH CHECK (public.can_manage_finance(auth.uid(), school_id));
-- Expense side: managers only
CREATE POLICY "Finance managers read" ON public.expense_categories FOR SELECT TO authenticated USING (public.can_manage_finance(auth.uid(), school_id));
CREATE POLICY "Finance managers insert" ON public.expense_categories FOR INSERT TO authenticated WITH CHECK (public.can_manage_finance(auth.uid(), school_id));
CREATE POLICY "Finance managers update" ON public.expense_categories FOR UPDATE TO authenticated USING (public.can_manage_finance(auth.uid(), school_id)) WITH CHECK (public.can_manage_finance(auth.uid(), school_id));
CREATE POLICY "Finance managers read" ON public.cost_centers FOR SELECT TO authenticated USING (public.can_manage_finance(auth.uid(), school_id));
CREATE POLICY "Finance managers insert" ON public.cost_centers FOR INSERT TO authenticated WITH CHECK (public.can_manage_finance(auth.uid(), school_id));
CREATE POLICY "Finance managers update" ON public.cost_centers FOR UPDATE TO authenticated USING (public.can_manage_finance(auth.uid(), school_id)) WITH CHECK (public.can_manage_finance(auth.uid(), school_id));
CREATE POLICY "Finance managers read" ON public.expenses FOR SELECT TO authenticated USING (public.can_manage_finance(auth.uid(), school_id));
CREATE POLICY "Finance managers insert" ON public.expenses FOR INSERT TO authenticated WITH CHECK (public.can_manage_finance(auth.uid(), school_id));
CREATE POLICY "Finance managers update" ON public.expenses FOR UPDATE TO authenticated USING (public.can_manage_finance(auth.uid(), school_id)) WITH CHECK (public.can_manage_finance(auth.uid(), school_id));

-- ===== Triggers: timestamps =====
CREATE TRIGGER fee_categories_set_updated_at BEFORE UPDATE ON public.fee_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER fee_structures_set_updated_at BEFORE UPDATE ON public.fee_structures FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER student_fees_set_updated_at BEFORE UPDATE ON public.student_fees FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER installments_set_updated_at BEFORE UPDATE ON public.installments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER payments_set_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER expenses_set_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== Student fee integrity: derived columns only set by server =====
CREATE OR REPLACE FUNCTION public.student_fees_before_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE internal boolean := coalesce(current_setting('madar.fin_internal', true),'') = '1';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.student_enrollments e WHERE e.id=NEW.enrollment_id AND e.student_id=NEW.student_id AND e.school_id=NEW.school_id AND e.academic_year_id=NEW.academic_year_id) THEN
    RAISE EXCEPTION 'التسجيل لا يطابق الطالب أو السنة';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NOT internal THEN NEW.discount_amount := 0; NEW.amount_paid := 0; END IF;
  ELSE
    IF NOT internal THEN
      NEW.discount_amount := OLD.discount_amount; NEW.amount_paid := OLD.amount_paid;
      NEW.student_id := OLD.student_id; NEW.enrollment_id := OLD.enrollment_id; NEW.school_id := OLD.school_id;
      IF NEW.original_amount <> OLD.original_amount AND EXISTS (SELECT 1 FROM public.installment_plans WHERE student_fee_id=NEW.id) THEN
        RAISE EXCEPTION 'لا يمكن تعديل مبلغ رسم له خطة تقسيط';
      END IF;
    END IF;
  END IF;
  IF NEW.discount_amount > NEW.original_amount THEN RAISE EXCEPTION 'الخصم أكبر من قيمة الرسم'; END IF;
  NEW.final_amount := NEW.original_amount - NEW.discount_amount;
  IF NEW.amount_paid > NEW.final_amount THEN RAISE EXCEPTION 'المبلغ المدفوع يتجاوز قيمة الرسم'; END IF;
  NEW.balance := NEW.final_amount - NEW.amount_paid;
  IF NEW.status NOT IN ('cancelled','waived') THEN
    NEW.status := CASE
      WHEN NEW.balance = 0 THEN 'paid'
      WHEN NEW.due_date IS NOT NULL AND NEW.due_date < current_date THEN 'overdue'
      WHEN NEW.amount_paid > 0 THEN 'partial'
      ELSE 'unpaid' END;
  END IF;
  IF NEW.status='cancelled' AND TG_OP='UPDATE' AND OLD.status<>'cancelled' AND NEW.amount_paid > 0 THEN
    RAISE EXCEPTION 'لا يمكن إلغاء رسم عليه دفعات. ألغِ الدفعات أولاً';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER student_fees_before_write BEFORE INSERT OR UPDATE ON public.student_fees FOR EACH ROW EXECUTE FUNCTION public.student_fees_before_write();

-- Recalculate fee + installments from allocations/discounts
CREATE OR REPLACE FUNCTION public.recalc_student_fee(_fee_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE paid numeric(12,2); disc numeric(12,2);
BEGIN
  PERFORM set_config('madar.fin_internal','1',true);
  SELECT coalesce(sum(a.amount),0) INTO paid FROM public.payment_allocations a JOIN public.payments p ON p.id=a.payment_id
    WHERE a.student_fee_id=_fee_id AND p.status='completed';
  SELECT coalesce(sum(calculated_amount),0) INTO disc FROM public.discounts WHERE student_fee_id=_fee_id AND is_active;
  UPDATE public.student_fees SET amount_paid=paid, discount_amount=disc WHERE id=_fee_id;
  UPDATE public.installments i SET amount_paid = x.paid,
    status = CASE WHEN x.paid >= i.amount THEN 'paid'::installment_status
                  WHEN i.due_date < current_date THEN 'overdue'
                  WHEN x.paid > 0 THEN 'partial'
                  WHEN i.due_date <= current_date + 7 THEN 'due'
                  ELSE 'upcoming' END,
    paid_at = CASE WHEN x.paid >= i.amount THEN coalesce(i.paid_at, now()) ELSE NULL END
  FROM (SELECT i2.id, coalesce((SELECT sum(a.amount) FROM public.payment_allocations a JOIN public.payments p ON p.id=a.payment_id
          WHERE a.installment_id=i2.id AND p.status='completed'),0) AS paid
        FROM public.installments i2 WHERE i2.student_fee_id=_fee_id) x
  WHERE i.id=x.id;
  PERFORM set_config('madar.fin_internal','0',true);
END $$;
REVOKE EXECUTE ON FUNCTION public.recalc_student_fee(uuid) FROM PUBLIC, anon, authenticated;

-- Refresh time-based statuses for a school (idempotent)
CREATE OR REPLACE FUNCTION public.refresh_finance_statuses(_school_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE f record;
BEGIN
  IF NOT public.can_view_finance(auth.uid(), _school_id) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  FOR f IN SELECT DISTINCT sf.id FROM public.student_fees sf LEFT JOIN public.installments i ON i.student_fee_id=sf.id
    WHERE sf.school_id=_school_id AND sf.status NOT IN ('paid','cancelled','waived')
      AND ((sf.status<>'overdue' AND sf.due_date < current_date) OR (i.status IN ('upcoming','due','partial') AND i.due_date <= current_date + 7))
  LOOP PERFORM public.recalc_student_fee(f.id); END LOOP;
END $$;

-- ===== RPC: installment plan =====
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
  IF EXISTS (SELECT 1 FROM public.payment_allocations a JOIN public.installments i ON i.id=a.installment_id WHERE i.student_fee_id=fee.id) THEN
    RAISE EXCEPTION 'لا يمكن تعديل خطة عليها دفعات';
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

-- ===== RPC: discount =====
CREATE OR REPLACE FUNCTION public.add_discount(_student_fee_id uuid, _name text, _type public.discount_type, _value numeric, _reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE fee public.student_fees; amt numeric(12,2); d_id uuid;
BEGIN
  SELECT * INTO fee FROM public.student_fees WHERE id=_student_fee_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الرسم غير موجود'; END IF;
  IF NOT public.can_manage_finance(auth.uid(), fee.school_id) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF _value IS NULL OR _value <= 0 THEN RAISE EXCEPTION 'قيمة الخصم غير صحيحة'; END IF;
  IF _type='percentage' AND _value > 100 THEN RAISE EXCEPTION 'النسبة لا تتجاوز 100%%'; END IF;
  IF EXISTS (SELECT 1 FROM public.installment_plans WHERE student_fee_id=fee.id) THEN
    RAISE EXCEPTION 'أضف الخصم قبل إنشاء خطة التقسيط';
  END IF;
  amt := CASE WHEN _type='percentage' THEN round(fee.original_amount * _value / 100, 2) ELSE round(_value,2) END;
  IF amt > fee.balance THEN RAISE EXCEPTION 'الخصم (%) يتجاوز المتبقي على الرسم (%)', amt, fee.balance; END IF;
  INSERT INTO public.discounts(school_id, student_id, academic_year_id, student_fee_id, name, type, value, calculated_amount, reason, approved_by, created_by)
  VALUES (fee.school_id, fee.student_id, fee.academic_year_id, fee.id, _name, _type, _value, amt, _reason, auth.uid(), auth.uid()) RETURNING id INTO d_id;
  PERFORM public.recalc_student_fee(fee.id);
  INSERT INTO public.audit_logs(school_id,user_id,action,entity_type,entity_id,metadata)
  VALUES (fee.school_id, auth.uid(), 'discount_added', 'discounts', d_id, jsonb_build_object('student_fee_id',fee.id,'type',_type,'value',_value,'amount',amt));
  RETURN d_id;
END $$;

CREATE OR REPLACE FUNCTION public.deactivate_discount(_discount_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.discounts;
BEGIN
  SELECT * INTO d FROM public.discounts WHERE id=_discount_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الخصم غير موجود'; END IF;
  IF NOT public.can_manage_finance(auth.uid(), d.school_id) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF NOT d.is_active THEN RETURN; END IF;
  IF d.student_fee_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.installment_plans WHERE student_fee_id=d.student_fee_id) THEN
    RAISE EXCEPTION 'لا يمكن إلغاء خصم على رسم له خطة تقسيط';
  END IF;
  UPDATE public.discounts SET is_active=false WHERE id=d.id;
  IF d.student_fee_id IS NOT NULL THEN PERFORM public.recalc_student_fee(d.student_fee_id); END IF;
  INSERT INTO public.audit_logs(school_id,user_id,action,entity_type,entity_id,metadata)
  VALUES (d.school_id, auth.uid(), 'discount_updated', 'discounts', d.id, jsonb_build_object('is_active',false,'amount',d.calculated_amount));
END $$;

-- ===== RPC: record payment =====
CREATE OR REPLACE FUNCTION public.record_payment(_student_id uuid, _amount numeric, _method public.payment_method, _payment_date date,
  _reference text, _notes text, _allocations jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE st public.students; pay_id uuid; al jsonb; fee public.student_fees; inst public.installments;
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
  -- year from first allocated fee
  SELECT academic_year_id INTO yr FROM public.student_fees WHERE id=((_allocations->0)->>'student_fee_id')::uuid;
  INSERT INTO public.payments(school_id, student_id, academic_year_id, payment_number, amount, payment_method, payment_date, reference_number, notes, received_by, status)
  VALUES (st.school_id, st.id, yr, num, round(_amount,2), coalesce(_method,'cash'), coalesce(_payment_date,current_date), nullif(trim(_reference),''), nullif(trim(_notes),''), auth.uid(), 'completed')
  RETURNING id INTO pay_id;

  FOR al IN SELECT * FROM jsonb_array_elements(_allocations) LOOP
    a_amt := round((al->>'amount')::numeric, 2);
    IF a_amt <= 0 THEN RAISE EXCEPTION 'مبلغ التوزيع يجب أن يكون أكبر من صفر'; END IF;
    SELECT * INTO fee FROM public.student_fees WHERE id=(al->>'student_fee_id')::uuid FOR UPDATE;
    IF NOT FOUND OR fee.student_id <> st.id THEN RAISE EXCEPTION 'رسم غير صالح لهذا الطالب'; END IF;
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

CREATE OR REPLACE FUNCTION public.cancel_payment(_payment_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.payments; f uuid;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id=_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الدفعة غير موجودة'; END IF;
  IF NOT public.can_manage_finance(auth.uid(), p.school_id) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF p.status = 'cancelled' THEN RAISE EXCEPTION 'الدفعة ملغاة مسبقاً'; END IF;
  IF coalesce(trim(_reason),'') = '' THEN RAISE EXCEPTION 'سبب الإلغاء مطلوب'; END IF;
  UPDATE public.payments SET status='cancelled', cancel_reason=_reason WHERE id=p.id;
  FOR f IN SELECT DISTINCT student_fee_id FROM public.payment_allocations WHERE payment_id=p.id LOOP
    PERFORM public.recalc_student_fee(f);
  END LOOP;
  INSERT INTO public.audit_logs(school_id,user_id,action,entity_type,entity_id,metadata)
  VALUES (p.school_id, auth.uid(), 'payment_cancelled', 'payments', p.id, jsonb_build_object('payment_number',p.payment_number,'amount',p.amount,'previous_status',p.status,'reason',_reason));
END $$;

-- ===== RPC: apply fee structure to enrolled students =====
CREATE OR REPLACE FUNCTION public.apply_fee_structure(_structure_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE fs public.fee_structures; n int;
BEGIN
  SELECT * INTO fs FROM public.fee_structures WHERE id=_structure_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'هيكل الرسوم غير موجود'; END IF;
  IF NOT public.can_manage_finance(auth.uid(), fs.school_id) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF NOT fs.is_active THEN RAISE EXCEPTION 'هيكل الرسوم غير فعال'; END IF;
  INSERT INTO public.student_fees(school_id, student_id, enrollment_id, academic_year_id, fee_structure_id, fee_category_id, name, original_amount, currency, due_date)
  SELECT fs.school_id, e.student_id, e.id, fs.academic_year_id, fs.id, fs.fee_category_id, fs.name, fs.amount, fs.currency, fs.due_date
  FROM public.student_enrollments e
  WHERE e.school_id=fs.school_id AND e.academic_year_id=fs.academic_year_id AND e.enrollment_status IN ('active','pending')
    AND (fs.grade_id IS NULL OR e.grade_id=fs.grade_id)
    AND NOT EXISTS (SELECT 1 FROM public.student_fees sf WHERE sf.enrollment_id=e.id AND sf.fee_structure_id=fs.id AND sf.status<>'cancelled');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION public.set_installment_plan(uuid,text,jsonb), public.add_discount(uuid,text,public.discount_type,numeric,text),
  public.deactivate_discount(uuid), public.record_payment(uuid,numeric,public.payment_method,date,text,text,jsonb),
  public.cancel_payment(uuid,text), public.apply_fee_structure(uuid), public.refresh_finance_statuses(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_installment_plan(uuid,text,jsonb), public.add_discount(uuid,text,public.discount_type,numeric,text),
  public.deactivate_discount(uuid), public.record_payment(uuid,numeric,public.payment_method,date,text,text,jsonb),
  public.cancel_payment(uuid,text), public.apply_fee_structure(uuid), public.refresh_finance_statuses(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.student_fees_before_write() FROM PUBLIC, anon, authenticated;

-- ===== Expenses: number + audit =====
CREATE OR REPLACE FUNCTION public.expenses_before_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n int;
BEGIN
  IF TG_OP='INSERT' THEN
    PERFORM pg_advisory_xact_lock(hashtext('exp_no_' || NEW.school_id::text));
    SELECT count(*)+1 INTO n FROM public.expenses WHERE school_id=NEW.school_id;
    NEW.expense_number := 'E-' || to_char(NEW.expense_date,'YYYY') || '-' || lpad(n::text,4,'0');
    NEW.created_by := coalesce(auth.uid(), NEW.created_by);
  ELSE
    NEW.expense_number := OLD.expense_number; NEW.created_by := OLD.created_by; NEW.school_id := OLD.school_id;
    IF OLD.status='cancelled' THEN RAISE EXCEPTION 'لا يمكن تعديل مصروف ملغى'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER expenses_before_write BEFORE INSERT OR UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.expenses_before_write();

CREATE OR REPLACE FUNCTION public.audit_finance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE act text; meta jsonb;
BEGIN
  IF TG_TABLE_NAME='expenses' THEN
    act := CASE WHEN TG_OP='INSERT' THEN 'expense_created'
                WHEN NEW.status='cancelled' AND OLD.status<>'cancelled' THEN 'expense_cancelled'
                ELSE 'expense_updated' END;
    meta := CASE WHEN TG_OP='INSERT' THEN jsonb_build_object('amount',NEW.amount,'title',NEW.title)
                 ELSE jsonb_build_object('old',jsonb_build_object('amount',OLD.amount,'title',OLD.title,'status',OLD.status,'expense_date',OLD.expense_date),
                                         'new',jsonb_build_object('amount',NEW.amount,'title',NEW.title,'status',NEW.status,'expense_date',NEW.expense_date)) END;
  ELSIF TG_TABLE_NAME='student_fees' THEN
    IF TG_OP='INSERT' THEN act := 'fee_created'; meta := jsonb_build_object('student_id',NEW.student_id,'name',NEW.name,'amount',NEW.original_amount);
    ELSIF OLD.original_amount IS DISTINCT FROM NEW.original_amount OR OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('cancelled','waived')
       OR OLD.due_date IS DISTINCT FROM NEW.due_date OR OLD.name IS DISTINCT FROM NEW.name THEN
      act := 'fee_updated';
      meta := jsonb_build_object('old',jsonb_build_object('amount',OLD.original_amount,'status',OLD.status,'due_date',OLD.due_date,'name',OLD.name),
                                 'new',jsonb_build_object('amount',NEW.original_amount,'status',NEW.status,'due_date',NEW.due_date,'name',NEW.name));
    ELSE RETURN NULL; END IF;
  END IF;
  INSERT INTO public.audit_logs(school_id,user_id,action,entity_type,entity_id,metadata)
  VALUES (NEW.school_id, auth.uid(), act, TG_TABLE_NAME, NEW.id, meta);
  RETURN NULL;
END $$;
CREATE TRIGGER audit_expenses AFTER INSERT OR UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.audit_finance();
CREATE TRIGGER audit_student_fees AFTER INSERT OR UPDATE ON public.student_fees FOR EACH ROW EXECUTE FUNCTION public.audit_finance();
REVOKE EXECUTE ON FUNCTION public.audit_finance(), public.expenses_before_write() FROM PUBLIC, anon, authenticated;
