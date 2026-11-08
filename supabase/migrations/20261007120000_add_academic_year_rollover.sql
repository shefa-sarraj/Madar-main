-- School-wide stages/grades are retained; year-specific sections are copied.
-- The target is planned, so rollover never changes historical year records.
CREATE TABLE public.academic_year_rollovers (
 id uuid PRIMARY KEY,
 school_id uuid NOT NULL REFERENCES public.schools(id),
 source_year_id uuid NOT NULL REFERENCES public.academic_years(id),
 target_year_id uuid NOT NULL REFERENCES public.academic_years(id),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 structure_snapshot jsonb NOT NULL,
 request_payload jsonb NOT NULL,
 UNIQUE(school_id, source_year_id), UNIQUE(target_year_id)
);
ALTER TABLE public.academic_year_rollovers ENABLE ROW LEVEL SECURITY;
CREATE POLICY rollover_managers_read ON public.academic_year_rollovers
 FOR SELECT TO authenticated USING(public.can_manage_school(auth.uid(),school_id));
REVOKE ALL ON public.academic_year_rollovers FROM anon, authenticated;
GRANT SELECT ON public.academic_year_rollovers TO authenticated;

CREATE FUNCTION public.settings_rollover_preview(_school_id uuid,_source_year_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.can_manage_school(auth.uid(),_school_id) THEN
  RAISE EXCEPTION 'Rollover requires school owner or manager' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM academic_years WHERE id=_source_year_id AND school_id=_school_id) THEN
  RAISE EXCEPTION 'Source year not in current school';
 END IF;
 SELECT jsonb_build_object(
  'year',(SELECT to_jsonb(y) FROM academic_years y WHERE id=_source_year_id AND school_id=_school_id),
  'stages',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.order_index,s.id) FROM stages s WHERE school_id=_school_id AND status='active'),'[]'::jsonb),
  'grades',coalesce((SELECT jsonb_agg(to_jsonb(g) ORDER BY g.order_index,g.id) FROM grades g JOIN stages s ON s.id=g.stage_id AND s.school_id=g.school_id WHERE g.school_id=_school_id AND g.status='active' AND s.status='active'),'[]'::jsonb),
  'sections',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM sections c JOIN grades g ON g.id=c.grade_id AND g.school_id=c.school_id JOIN stages s ON s.id=g.stage_id AND s.school_id=g.school_id WHERE c.school_id=_school_id AND c.academic_year_id=_source_year_id AND c.status='active' AND g.status='active' AND s.status='active'),'[]'::jsonb),
  'students',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'student_id',e.student_id,'full_name',s.full_name,'student_number',s.student_number,'grade_id',e.grade_id,'section_id',e.section_id,'updated_at',e.updated_at,'student_updated_at',s.updated_at) ORDER BY e.id) FROM student_enrollments e JOIN students s ON s.id=e.student_id AND s.school_id=e.school_id WHERE e.school_id=_school_id AND e.academic_year_id=_source_year_id AND e.enrollment_status='active' AND s.status='active'),'[]'::jsonb)
 ) INTO result;
 RETURN result || jsonb_build_object('version',md5(result::text),
  'completed_year_id',(SELECT target_year_id FROM academic_year_rollovers WHERE school_id=_school_id AND source_year_id=_source_year_id));
END $$;

CREATE FUNCTION public.settings_rollover_year(
 _school_id uuid,_source_year_id uuid,_request_id uuid,_name text,
 _start date,_end date,_version text,_placements jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE snapshot jsonb; payload jsonb; prior academic_year_rollovers%ROWTYPE;
 target uuid; item jsonb; section_record record; new_section uuid; section_map jsonb:='{}';
 enrollment uuid; target_grade uuid; source_section uuid; selected_student uuid;
BEGIN
 IF NOT public.can_manage_school(auth.uid(),_school_id) THEN
  RAISE EXCEPTION 'Rollover requires school owner or manager' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM schools WHERE id=_school_id FOR UPDATE;
 IF NOT public.can_manage_school(auth.uid(),_school_id) THEN
  RAISE EXCEPTION 'Rollover requires school owner or manager' USING ERRCODE='42501';
 END IF;
 IF _request_id IS NULL OR _name IS NULL OR trim(_name)='' OR _start IS NULL OR _end IS NULL OR _end<=_start
  OR _placements IS NULL OR jsonb_typeof(_placements)<>'array' THEN RAISE EXCEPTION 'Invalid rollover request'; END IF;
 payload:=jsonb_build_object('source',_source_year_id,'name',trim(_name),'start',_start,'end',_end,'version',_version,'placements',_placements);
 SELECT * INTO prior FROM academic_year_rollovers WHERE id=_request_id;
 IF FOUND THEN
  IF prior.school_id<>_school_id OR prior.request_payload<>payload THEN RAISE EXCEPTION 'Request identifier already used'; END IF;
  RETURN prior.target_year_id;
 END IF;
 IF EXISTS(SELECT 1 FROM academic_year_rollovers WHERE school_id=_school_id AND source_year_id=_source_year_id) THEN
  RAISE EXCEPTION 'This year has already been rolled over';
 END IF;
 -- Freeze the preview inputs during validation and insertion.
 PERFORM 1 FROM academic_years WHERE school_id=_school_id FOR SHARE;
 PERFORM 1 FROM stages WHERE school_id=_school_id FOR SHARE;
 PERFORM 1 FROM grades WHERE school_id=_school_id FOR SHARE;
 PERFORM 1 FROM sections WHERE school_id=_school_id AND academic_year_id=_source_year_id FOR SHARE;
 PERFORM 1 FROM students WHERE school_id=_school_id FOR SHARE;
 PERFORM 1 FROM student_enrollments WHERE school_id=_school_id AND academic_year_id=_source_year_id FOR SHARE;
 snapshot:=public.settings_rollover_preview(_school_id,_source_year_id);
 IF _version IS NULL OR snapshot->>'version'<>_version THEN RAISE EXCEPTION 'Preview changed; reload before confirming'; END IF;
 IF _start<=(snapshot->'year'->>'end_date')::date THEN RAISE EXCEPTION 'New year must start after source year ends'; END IF;
 IF EXISTS(SELECT 1 FROM academic_years WHERE school_id=_school_id AND (lower(trim(name))=lower(trim(_name)) OR (start_date<=_end AND end_date>=_start))) THEN
  RAISE EXCEPTION 'Year name or dates already exist';
 END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(_placements))<>(SELECT count(DISTINCT x->>'enrollment_id') FROM jsonb_array_elements(_placements) x) THEN RAISE EXCEPTION 'Duplicate student selection'; END IF;
 -- Validate all assignments before creating the year. Source section IDs map to copies.
 FOR item IN SELECT value FROM jsonb_array_elements(_placements) LOOP
  enrollment:=(item->>'enrollment_id')::uuid; target_grade:=(item->>'grade_id')::uuid; source_section:=nullif(item->>'section_id','')::uuid;
  IF enrollment IS NULL OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'students') x WHERE (x->>'id')::uuid=enrollment) THEN RAISE EXCEPTION 'Student is not active in source school/year'; END IF;
  IF target_grade IS NULL OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'grades') x WHERE (x->>'id')::uuid=target_grade) THEN RAISE EXCEPTION 'Target grade is not active in current school'; END IF;
  IF source_section IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'sections') x WHERE (x->>'id')::uuid=source_section AND (x->>'grade_id')::uuid=target_grade) THEN RAISE EXCEPTION 'Target section does not belong to target grade/year'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'sections') c WHERE c->>'capacity' IS NOT NULL AND
  (SELECT count(*) FROM jsonb_array_elements(_placements) p WHERE p->>'section_id'=c->>'id')>(c->>'capacity')::integer) THEN RAISE EXCEPTION 'Section capacity exceeded'; END IF;
 INSERT INTO academic_years(school_id,name,start_date,end_date,status,is_active)
 VALUES(_school_id,trim(_name),_start,_end,'planned',false) RETURNING id INTO target;
 FOR section_record IN SELECT * FROM sections WHERE id IN(SELECT (x->>'id')::uuid FROM jsonb_array_elements(snapshot->'sections') x) LOOP
  INSERT INTO sections(school_id,academic_year_id,grade_id,name,capacity,status)
  VALUES(_school_id,target,section_record.grade_id,section_record.name,section_record.capacity,'active') RETURNING id INTO new_section;
  section_map:=section_map || jsonb_build_object(section_record.id::text,new_section);
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(_placements) LOOP
  SELECT student_id INTO selected_student FROM student_enrollments WHERE id=(item->>'enrollment_id')::uuid AND school_id=_school_id;
  INSERT INTO student_enrollments(school_id,student_id,academic_year_id,grade_id,section_id,enrollment_status,start_date)
  VALUES(_school_id,selected_student,target,(item->>'grade_id')::uuid,(section_map->>(item->>'section_id'))::uuid,'pending',_start);
 END LOOP;
 INSERT INTO academic_year_rollovers(id,school_id,source_year_id,target_year_id,created_by,structure_snapshot,request_payload)
 VALUES(_request_id,_school_id,_source_year_id,target,auth.uid(),snapshot,payload);
 RETURN target;
END $$;
REVOKE ALL ON FUNCTION public.settings_rollover_preview(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.settings_rollover_year(uuid,uuid,uuid,text,date,date,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.settings_rollover_preview(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.settings_rollover_year(uuid,uuid,uuid,text,date,date,text,jsonb) TO authenticated;
