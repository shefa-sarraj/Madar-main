-- Demo-only attendance seed for مدرسة مدار التجريبية, 2026/2027.
-- Run after 20260929113000_add_attendance_management.sql. Safe to re-run.

BEGIN;

DO $seed$
DECLARE
  v_school_id uuid;
  v_year_id uuid;
  v_owner_id uuid;
  v_count integer;
  v_date date;
  v_code integer;
  v_student_status public.student_attendance_status;
  v_staff_status public.staff_attendance_status;
  r record;
BEGIN
  SELECT count(*), (array_agg(id))[1] INTO v_count,v_school_id
  FROM public.schools WHERE name_ar='مدرسة مدار التجريبية';
  IF v_count<>1 THEN RAISE EXCEPTION 'Expected exactly one target school; found %',v_count; END IF;

  SELECT count(*), (array_agg(id))[1] INTO v_count,v_year_id
  FROM public.academic_years
  WHERE school_id=v_school_id AND name='2026/2027' AND is_active AND status='active';
  IF v_count<>1 THEN RAISE EXCEPTION 'Expected exactly one active academic year 2026/2027; found %',v_count; END IF;

  SELECT count(*), (array_agg(ur.user_id))[1] INTO v_count,v_owner_id
  FROM public.user_roles ur
  JOIN public.school_members sm ON sm.school_id=ur.school_id AND sm.user_id=ur.user_id AND sm.status='active'
  WHERE ur.school_id=v_school_id AND ur.role='school_owner';
  IF v_count<>1 THEN RAISE EXCEPTION 'Expected exactly one active school owner; found %',v_count; END IF;

  PERFORM set_config('request.jwt.claim.sub',v_owner_id::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_owner_id,'role','authenticated')::text,true);

  FOREACH v_date IN ARRAY ARRAY[
    DATE '2026-09-14',DATE '2026-09-15',DATE '2026-09-16',DATE '2026-09-17',
    DATE '2026-09-20',DATE '2026-09-21',DATE '2026-09-22',DATE '2026-09-23',
    DATE '2026-09-24',DATE '2026-09-27',DATE '2026-09-28',DATE '2026-09-29'
  ] LOOP
    FOR r IN
      SELECT e.id AS enrollment_id,e.student_id,s.student_number
      FROM public.student_enrollments e
      JOIN public.students s ON s.id=e.student_id AND s.school_id=e.school_id
      WHERE e.school_id=v_school_id AND e.academic_year_id=v_year_id
        AND e.enrollment_status='active' AND s.status='active' AND s.is_demo
      ORDER BY s.student_number
    LOOP
      v_code := mod(abs(hashtext(r.student_number || v_date::text)),20);
      v_student_status := CASE
        WHEN v_code=0 THEN 'absent'::public.student_attendance_status
        WHEN v_code IN (1,2) THEN 'late'::public.student_attendance_status
        WHEN v_code=3 THEN 'excused'::public.student_attendance_status
        ELSE 'present'::public.student_attendance_status
      END;
      INSERT INTO public.student_attendance (
        school_id,academic_year_id,student_id,enrollment_id,attendance_date,status,notes,marked_by,is_demo
      ) VALUES (
        v_school_id,v_year_id,r.student_id,r.enrollment_id,v_date,v_student_status,
        CASE v_student_status
          WHEN 'absent' THEN 'غياب تجريبي للعرض'
          WHEN 'late' THEN 'تأخر صباحي تجريبي'
          WHEN 'excused' THEN 'غياب بعذر - بيانات تجريبية'
          ELSE NULL
        END,
        v_owner_id,true
      ) ON CONFLICT (school_id,student_id,attendance_date) DO NOTHING;
    END LOOP;

    FOR r IN
      SELECT id,employee_number
      FROM public.employees
      WHERE school_id=v_school_id AND status='active' AND hire_date<=v_date AND is_demo
      ORDER BY employee_number
    LOOP
      v_code := mod(abs(hashtext(r.employee_number || v_date::text)),24);
      v_staff_status := CASE
        WHEN v_code=0 THEN 'absent'::public.staff_attendance_status
        WHEN v_code IN (1,2) THEN 'late'::public.staff_attendance_status
        WHEN v_code=3 THEN 'leave'::public.staff_attendance_status
        ELSE 'present'::public.staff_attendance_status
      END;
      INSERT INTO public.staff_attendance (
        school_id,employee_id,attendance_date,status,check_in,check_out,notes,marked_by,is_demo
      ) VALUES (
        v_school_id,r.id,v_date,v_staff_status,
        CASE
          WHEN v_staff_status='present' THEN TIME '07:45'
          WHEN v_staff_status='late' THEN TIME '08:18'
          ELSE NULL
        END,
        CASE WHEN v_staff_status IN ('present','late') THEN TIME '15:05' ELSE NULL END,
        CASE v_staff_status
          WHEN 'absent' THEN 'غياب تجريبي'
          WHEN 'late' THEN 'تأخر مروري - بيانات تجريبية'
          WHEN 'leave' THEN 'إجازة قصيرة - بيانات تجريبية'
          ELSE NULL
        END,
        v_owner_id,true
      ) ON CONFLICT (school_id,employee_id,attendance_date) DO NOTHING;
    END LOOP;
  END LOOP;
END $seed$;

COMMIT;
