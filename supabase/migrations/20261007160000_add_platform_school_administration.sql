-- Platform capabilities remain global; suspension disables school-level access.
CREATE OR REPLACE FUNCTION public.is_school_member(_user_id uuid,_school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.is_super_admin(_user_id) OR EXISTS(
  SELECT 1 FROM public.school_members m JOIN public.schools s ON s.id=m.school_id
  WHERE m.user_id=_user_id AND m.school_id=_school_id AND m.status='active' AND s.status='active');
$$;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid,_school_id uuid,_role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.is_super_admin(_user_id) OR EXISTS(
  SELECT 1 FROM public.user_roles r JOIN public.school_members m ON m.school_id=r.school_id AND m.user_id=r.user_id
  JOIN public.schools s ON s.id=r.school_id
  WHERE r.user_id=_user_id AND r.school_id=_school_id AND r.role=_role AND r.role<>'super_admin'
   AND m.status='active' AND s.status='active');
$$;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_platform_scope
 CHECK ((role='super_admin')=(school_id IS NULL)) NOT VALID;
REVOKE INSERT,UPDATE,DELETE ON public.schools FROM authenticated;

CREATE FUNCTION public.platform_save_school(_school_id uuid,_create boolean,_profile jsonb,
 _status public.school_status,_initial_user uuid DEFAULT NULL,_initial_role public.app_role DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Platform administrator required' USING ERRCODE='42501'; END IF;
 IF _school_id IS NULL OR _create IS NULL OR _status IS NULL OR coalesce(trim(_profile->>'name_ar'),'')=''
  OR length(_profile->>'name_ar')>200 OR coalesce(_profile->>'currency','')!~'^[A-Z]{3}$'
  OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=_profile->>'timezone') THEN RAISE EXCEPTION 'Invalid school profile'; END IF;
 IF _create THEN
  IF _initial_user IS NULL OR _initial_role IS NULL OR _initial_role NOT IN('school_owner','school_manager')
   OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=_initial_user) THEN RAISE EXCEPTION 'Initial owner or manager required'; END IF;
  INSERT INTO public.schools(id,name_ar,name_en,phone,email,address,logo_url,currency,timezone,status)
  VALUES(_school_id,trim(_profile->>'name_ar'),nullif(_profile->>'name_en',''),nullif(_profile->>'phone',''),nullif(_profile->>'email',''),nullif(_profile->>'address',''),nullif(_profile->>'logo_url',''),_profile->>'currency',_profile->>'timezone',_status);
  INSERT INTO public.school_settings(school_id,default_currency) VALUES(_school_id,_profile->>'currency');
  INSERT INTO public.school_members(school_id,user_id,status) VALUES(_school_id,_initial_user,'active');
  INSERT INTO public.user_roles(school_id,user_id,role) VALUES(_school_id,_initial_user,_initial_role);
 ELSE
  PERFORM 1 FROM public.schools WHERE id=_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School not found'; END IF;
  IF _initial_user IS NOT NULL OR _initial_role IS NOT NULL THEN RAISE EXCEPTION 'Initial assignment is only allowed during creation'; END IF;
  UPDATE public.schools SET name_ar=trim(_profile->>'name_ar'),name_en=nullif(_profile->>'name_en',''),phone=nullif(_profile->>'phone',''),email=nullif(_profile->>'email',''),address=nullif(_profile->>'address',''),logo_url=nullif(_profile->>'logo_url',''),currency=_profile->>'currency',timezone=_profile->>'timezone',status=_status WHERE id=_school_id;
  UPDATE public.school_settings SET default_currency=_profile->>'currency' WHERE school_id=_school_id;
 END IF;
 INSERT INTO public.audit_logs(school_id,user_id,action,entity_type,entity_id,metadata)
 VALUES(_school_id,auth.uid(),CASE WHEN _create THEN 'create' ELSE 'update' END,'school',_school_id,jsonb_build_object('status',_status,'initial_user',_initial_user,'initial_role',_initial_role));
 RETURN _school_id;
END $$;
REVOKE ALL ON FUNCTION public.platform_save_school(uuid,boolean,jsonb,public.school_status,uuid,public.app_role) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_save_school(uuid,boolean,jsonb,public.school_status,uuid,public.app_role) TO authenticated;

-- Links are optional, one-to-one per school, and reference a real membership.
CREATE TABLE public.school_user_employee_links (
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
 user_id uuid NOT NULL,
 employee_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(school_id,user_id), UNIQUE(school_id,employee_id),
 FOREIGN KEY(school_id,user_id) REFERENCES public.school_members(school_id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(employee_id,school_id) REFERENCES public.employees(id,school_id) ON DELETE CASCADE
);
ALTER TABLE public.school_user_employee_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_employee_links_read ON public.school_user_employee_links FOR SELECT TO authenticated
 USING(public.can_manage_school(auth.uid(),school_id) OR (user_id=auth.uid() AND public.is_school_member(auth.uid(),school_id)));
REVOKE ALL ON public.school_user_employee_links FROM anon,authenticated;
GRANT SELECT ON public.school_user_employee_links TO authenticated;
CREATE FUNCTION public.settings_link_employee(_school_id uuid,_user_id uuid,_employee_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM 1 FROM public.schools WHERE id=_school_id FOR UPDATE;
 IF NOT public.can_manage_school(auth.uid(),_school_id) THEN RAISE EXCEPTION 'School management permission required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.school_members WHERE school_id=_school_id AND user_id=_user_id) THEN RAISE EXCEPTION 'User is not a member of current school'; END IF;
 IF _employee_id IS NULL THEN DELETE FROM public.school_user_employee_links WHERE school_id=_school_id AND user_id=_user_id;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.employees WHERE id=_employee_id AND school_id=_school_id) THEN RAISE EXCEPTION 'Employee is not in current school'; END IF;
  INSERT INTO public.school_user_employee_links(school_id,user_id,employee_id) VALUES(_school_id,_user_id,_employee_id)
  ON CONFLICT(school_id,user_id) DO UPDATE SET employee_id=excluded.employee_id;
 END IF;
 INSERT INTO public.audit_logs(school_id,user_id,action,entity_type,entity_id,metadata)
 VALUES(_school_id,auth.uid(),'update','school_user_employee_link',_user_id,jsonb_build_object('employee_id',_employee_id));
END $$;
REVOKE ALL ON FUNCTION public.settings_link_employee(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.settings_link_employee(uuid,uuid,uuid) TO authenticated;
