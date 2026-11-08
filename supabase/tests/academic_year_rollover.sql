BEGIN;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('a1000000-0000-0000-0000-000000000001','rollover-owner@example.invalid','{}'),
 ('a1000000-0000-0000-0000-000000000002','rollover-manager@example.invalid','{}'),
 ('a1000000-0000-0000-0000-000000000003','rollover-teacher@example.invalid','{}');
INSERT INTO schools(id,name_ar) VALUES
 ('a2000000-0000-0000-0000-000000000001','Rollover school'),
 ('a2000000-0000-0000-0000-000000000002','Foreign school');
INSERT INTO school_members(school_id,user_id,status)
 SELECT 'a2000000-0000-0000-0000-000000000001',id,'active'::member_status FROM auth.users WHERE id::text LIKE 'a1000000%';
INSERT INTO user_roles(school_id,user_id,role) VALUES
 ('a2000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','school_owner'),
 ('a2000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','school_manager'),
 ('a2000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','teacher');
INSERT INTO academic_years(id,school_id,name,start_date,end_date,status,is_active) VALUES
 ('a3000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','2026','2026-09-01','2027-06-30','active',true),
 ('a3000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000002','2026','2026-09-01','2027-06-30','active',true);
INSERT INTO stages(id,school_id,name) VALUES ('a4000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','Primary');
INSERT INTO grades(id,school_id,stage_id,name) VALUES
 ('a5000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001','Grade 1'),
 ('a5000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001','Grade 2');
INSERT INTO sections(id,school_id,academic_year_id,grade_id,name,capacity,homeroom_teacher_id) VALUES
 ('a6000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001','A',2,'a1000000-0000-0000-0000-000000000003'),
 ('a6000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000002','B',1,NULL);
INSERT INTO students(id,school_id,student_number,first_name,last_name,full_name,gender,status) VALUES
 ('a7000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','1','Student','One','Student One','male','active'),
 ('a7000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000001','2','Student','Two','Student Two','male','active'),
 ('a7000000-0000-0000-0000-000000000003','a2000000-0000-0000-0000-000000000001','3','Student','Three','Student Three','male','suspended');
INSERT INTO student_enrollments(id,school_id,student_id,academic_year_id,grade_id,section_id) SELECT
 ('a8000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'a2000000-0000-0000-0000-000000000001',
 ('a7000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'a3000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000001' FROM generate_series(1,3) n;
CREATE TEMP TABLE history AS SELECT jsonb_build_object(
 'years',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM academic_years t WHERE school_id='a2000000-0000-0000-0000-000000000001'),
 'students',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM students t),
 'stages',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM stages t),
 'grades',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM grades t),
 'sections',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM sections t),
 'enrollments',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM student_enrollments t)
) AS data;
CREATE TEMP TABLE operational_history(tablename text, data jsonb);
DO $$ DECLARE r record; rows jsonb; BEGIN
 FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN('student_attendance','staff_attendance','payments','expenses','cases','tasks','student_fees','installments','inventory_movements','asset_assignments') LOOP
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),''[]''::jsonb) FROM public.%I t',r.tablename) INTO rows;
  INSERT INTO operational_history VALUES(r.tablename,rows);
 END LOOP;
END $$;
GRANT SELECT ON history,operational_history TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000001',true);
DO $$
DECLARE p jsonb; placements jsonb; target uuid; rejected boolean; before_count int;
 school uuid:='a2000000-0000-0000-0000-000000000001'; source uuid:='a3000000-0000-0000-0000-000000000001';
 request uuid:='a9000000-0000-0000-0000-000000000001'; row_data record;
BEGIN
 p:=settings_rollover_preview(school,source);
 IF jsonb_array_length(p->'students')<>2 OR jsonb_array_length(p->'sections')<>2 THEN RAISE EXCEPTION 'Preview eligibility failed'; END IF;
 IF has_table_privilege('authenticated','academic_year_rollovers','insert') OR has_function_privilege('anon','settings_rollover_year(uuid,uuid,uuid,text,date,date,text,jsonb)','execute') THEN RAISE EXCEPTION 'Unprotected rollover'; END IF;
 SELECT count(*) INTO before_count FROM academic_years;
 placements:='[{"enrollment_id":"a8000000-0000-0000-0000-000000000001","grade_id":"a5000000-0000-0000-0000-000000000002","section_id":"a6000000-0000-0000-0000-000000000002"}]';
 rejected:=false;
 BEGIN PERFORM settings_rollover_preview(school,'a3000000-0000-0000-0000-000000000002'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Foreign year accepted'; END IF;
 rejected:=false;
 BEGIN PERFORM settings_rollover_year('a2000000-0000-0000-0000-000000000002','a3000000-0000-0000-0000-000000000002',request,'2027','2027-09-01','2028-06-30',p->>'version',placements); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Foreign school accepted'; END IF;
 rejected:=false;
 BEGIN PERFORM settings_rollover_year(school,source,request,'2026','2027-09-01','2028-06-30',p->>'version',placements); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Existing year name accepted'; END IF;
 rejected:=false;
 BEGIN PERFORM settings_rollover_year(school,source,request,'2027','2027-01-01','2028-06-30',p->>'version',placements); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Overlapping dates accepted'; END IF;
 rejected:=false;
 BEGIN PERFORM settings_rollover_year(school,source,request,'2027','2027-09-01','2028-06-30','stale',placements); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Stale preview accepted'; END IF;
 rejected:=false;
 BEGIN PERFORM settings_rollover_year(school,source,request,'2027','2027-09-01','2028-06-30',p->>'version',placements||placements); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Duplicate selection accepted'; END IF;
 rejected:=false;
 BEGIN PERFORM settings_rollover_year(school,source,request,'2027','2027-09-01','2028-06-30',p->>'version',placements||jsonb_build_array(jsonb_build_object('enrollment_id','a8000000-0000-0000-0000-000000000002','grade_id','a5000000-0000-0000-0000-000000000002','section_id','a6000000-0000-0000-0000-000000000002'))); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Capacity overflow accepted'; END IF;
 rejected:=false;
 BEGIN PERFORM settings_rollover_year(school,source,request,'2027','2027-09-01','2028-06-30',p->>'version',replace(placements::text,'a8000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000003')::jsonb); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Suspended student accepted'; END IF;
 rejected:=false;
 BEGIN PERFORM settings_rollover_year(school,source,request,'2027','2027-09-01','2028-06-30',p->>'version',replace(placements::text,'a6000000-0000-0000-0000-000000000002','a6000000-0000-0000-0000-000000000001')::jsonb); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected OR (SELECT count(*) FROM academic_years)<>before_count THEN RAISE EXCEPTION 'Validation rollback failed'; END IF;
 PERFORM set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000003',true);
 rejected:=false;
 BEGIN PERFORM settings_rollover_year(school,source,request,'2027','2027-09-01','2028-06-30',p->>'version',placements); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Teacher can rollover'; END IF;
 PERFORM set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000002',true);
 target:=settings_rollover_year(school,source,request,'2027','2027-09-01','2028-06-30',p->>'version',placements);
 IF settings_rollover_year(school,source,request,'2027','2027-09-01','2028-06-30',p->>'version',placements)<>target THEN RAISE EXCEPTION 'Retry not idempotent'; END IF;
 rejected:=false;
 BEGIN PERFORM settings_rollover_year(school,source,request,'Changed','2027-09-01','2028-06-30',p->>'version',placements); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Changed retry accepted'; END IF;
 rejected:=false;
 BEGIN PERFORM settings_rollover_year(school,source,gen_random_uuid(),'Another','2028-09-01','2029-06-30',p->>'version',placements); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Duplicate rollover accepted'; END IF;
 IF (SELECT count(*) FROM academic_years WHERE school_id=school AND is_active)<>1 OR NOT EXISTS(SELECT 1 FROM academic_years WHERE id=target AND school_id=school AND status='planned' AND NOT is_active) THEN RAISE EXCEPTION 'Year activity invariant failed'; END IF;
 IF (SELECT count(*) FROM sections WHERE academic_year_id=target)<>2 OR EXISTS(SELECT 1 FROM sections WHERE academic_year_id=target AND homeroom_teacher_id IS NOT NULL) THEN RAISE EXCEPTION 'Section copy failed'; END IF;
 IF (SELECT count(*) FROM student_enrollments WHERE academic_year_id=target)<>1 OR NOT EXISTS(SELECT 1 FROM student_enrollments e JOIN sections s ON s.id=e.section_id WHERE e.academic_year_id=target AND e.student_id='a7000000-0000-0000-0000-000000000001' AND e.grade_id='a5000000-0000-0000-0000-000000000002' AND e.enrollment_status='pending' AND s.academic_year_id=target AND s.name='B') THEN RAISE EXCEPTION 'Selected promotion failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM academic_year_rollovers WHERE target_year_id=target AND structure_snapshot=p AND created_by=auth.uid()) THEN RAISE EXCEPTION 'Snapshot/audit failed'; END IF;
 IF (SELECT data FROM history)<>jsonb_build_object(
 'years',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM academic_years t WHERE id<>target),
 'students',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM students t),
 'stages',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM stages t),
 'grades',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM grades t),
 'sections',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM sections t WHERE academic_year_id<>target),
 'enrollments',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM student_enrollments t WHERE academic_year_id<>target)) THEN RAISE EXCEPTION 'Historical rows changed'; END IF;
 PERFORM set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000003',true);
 IF EXISTS(SELECT 1 FROM academic_year_rollovers WHERE school_id=school) THEN RAISE EXCEPTION 'Teacher can read rollover snapshots'; END IF;
END $$;
RESET ROLE;
DO $$ DECLARE r record; actual jsonb; BEGIN
 FOR r IN SELECT * FROM operational_history LOOP
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),''[]''::jsonb) FROM public.%I t',r.tablename) INTO actual;
  IF actual<>r.data THEN RAISE EXCEPTION 'Operational data changed: %',r.tablename; END IF;
 END LOOP;
END $$;
ROLLBACK;
