-- Settings and user administration: authenticated RPCs own membership writes.
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role='super_admin' AND school_id IS NULL);
$$;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid,_school_id uuid,_role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.is_super_admin(_user_id) OR EXISTS(
 SELECT 1 FROM public.user_roles r JOIN public.school_members m
 ON m.school_id=r.school_id AND m.user_id=r.user_id
 WHERE r.user_id=_user_id AND r.school_id=_school_id AND r.role=_role AND m.status='active');
$$;
REVOKE INSERT, UPDATE, DELETE ON public.user_roles,public.school_members FROM authenticated;

CREATE OR REPLACE FUNCTION public.settings_save_member(_school_id uuid,_user_id uuid,_roles public.app_role[],_status public.member_status)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE privileged boolean; old_owner boolean;
BEGIN
 PERFORM 1 FROM public.schools WHERE id=_school_id FOR UPDATE;
 IF NOT public.can_manage_school(auth.uid(),_school_id) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
 privileged:=public.has_role(auth.uid(),_school_id,'school_owner');
 IF _user_id=auth.uid() THEN RAISE EXCEPTION 'لا يمكن تعديل عضويتك أو أدوارك'; END IF;
 IF _roles IS NULL OR array_position(_roles,NULL) IS NOT NULL OR 'super_admin'=ANY(_roles) THEN RAISE EXCEPTION 'أدوار غير صالحة'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE school_id=_school_id AND user_id=_user_id AND role='school_owner') INTO old_owner;
 IF NOT privileged AND (old_owner OR EXISTS(SELECT 1 FROM public.user_roles WHERE school_id=_school_id AND user_id=_user_id AND role='school_manager') OR _roles && ARRAY['school_owner','school_manager']::public.app_role[]) THEN
 RAISE EXCEPTION 'تعديل أدوار الإدارة متاح للمالك فقط'; END IF;
 IF old_owner AND (_status<>'active' OR NOT 'school_owner'=ANY(_roles)) AND NOT EXISTS(
 SELECT 1 FROM public.user_roles r JOIN public.school_members m ON m.school_id=r.school_id AND m.user_id=r.user_id
 WHERE r.school_id=_school_id AND r.role='school_owner' AND m.status='active' AND r.user_id<>_user_id) THEN
 RAISE EXCEPTION 'يجب إبقاء مالك نشط واحد على الأقل'; END IF;
 INSERT INTO public.school_members(school_id,user_id,status) VALUES(_school_id,_user_id,_status)
 ON CONFLICT(school_id,user_id) DO UPDATE SET status=excluded.status;
 DELETE FROM public.user_roles WHERE school_id=_school_id AND user_id=_user_id;
 INSERT INTO public.user_roles(school_id,user_id,role) SELECT _school_id,_user_id,role FROM (SELECT DISTINCT unnest(_roles) role) roles;
 INSERT INTO public.audit_logs(school_id,user_id,action,entity_type,entity_id,metadata)
 VALUES(_school_id,auth.uid(),'update','school_member',_user_id,jsonb_build_object('roles',_roles,'status',_status));
END; $$;
REVOKE ALL ON FUNCTION public.settings_save_member(uuid,uuid,public.app_role[],public.member_status) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.settings_save_member(uuid,uuid,public.app_role[],public.member_status) TO authenticated;

CREATE OR REPLACE FUNCTION public.settings_save_year(_school_id uuid,_id uuid,_name text,_start date,_end date,_status public.academic_year_status,_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM public.schools WHERE id=_school_id FOR UPDATE;
 IF NOT public.can_manage_school(auth.uid(),_school_id) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
 IF btrim(_name)='' OR _end<=_start OR _active IS DISTINCT FROM (_status='active') THEN RAISE EXCEPTION 'بيانات السنة غير صالحة'; END IF;
 IF _id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.academic_years WHERE id=_id AND school_id=_school_id) THEN RAISE EXCEPTION 'السنة غير موجودة'; END IF;
 IF _active THEN UPDATE public.academic_years SET is_active=false,status='closed' WHERE school_id=_school_id AND is_active AND id IS DISTINCT FROM _id; END IF;
 IF _id IS NULL THEN INSERT INTO public.academic_years(school_id,name,start_date,end_date,status,is_active) VALUES(_school_id,btrim(_name),_start,_end,_status,_active);
 ELSE UPDATE public.academic_years SET name=btrim(_name),start_date=_start,end_date=_end,status=_status,is_active=_active WHERE id=_id AND school_id=_school_id; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.settings_save_year(uuid,uuid,text,date,date,public.academic_year_status,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.settings_save_year(uuid,uuid,text,date,date,public.academic_year_status,boolean) TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.academic_years FROM authenticated;

CREATE OR REPLACE FUNCTION public.settings_save_school(_school_id uuid,_profile jsonb,_settings jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM public.schools WHERE id=_school_id FOR UPDATE;
 IF NOT public.can_manage_school(auth.uid(),_school_id) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
 IF coalesce(btrim(_profile->>'name_ar'),'')='' OR coalesce(_profile->>'currency','') !~ '^[A-Z]{3}$'
 OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=_profile->>'timezone')
 OR coalesce(_settings->>'date_format','') NOT IN ('dd/MM/yyyy','yyyy-MM-dd','MM/dd/yyyy') THEN RAISE EXCEPTION 'بيانات غير صالحة'; END IF;
 UPDATE public.schools SET name_ar=btrim(_profile->>'name_ar'),name_en=nullif(_profile->>'name_en',''),phone=nullif(_profile->>'phone',''),email=nullif(_profile->>'email',''),address=nullif(_profile->>'address',''),logo_url=nullif(_profile->>'logo_url',''),currency=_profile->>'currency',timezone=_profile->>'timezone' WHERE id=_school_id;
 INSERT INTO public.school_settings(school_id,default_currency,date_format,attendance_enabled,inventory_enabled,cost_centers_enabled)
 VALUES(_school_id,_profile->>'currency',_settings->>'date_format',(_settings->>'attendance_enabled')::boolean,(_settings->>'inventory_enabled')::boolean,(_settings->>'cost_centers_enabled')::boolean)
 ON CONFLICT(school_id) DO UPDATE SET default_currency=excluded.default_currency,date_format=excluded.date_format,attendance_enabled=excluded.attendance_enabled,inventory_enabled=excluded.inventory_enabled,cost_centers_enabled=excluded.cost_centers_enabled;
END; $$;
REVOKE ALL ON FUNCTION public.settings_save_school(uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.settings_save_school(uuid,jsonb,jsonb) TO authenticated;

-- Exact-email lookup stays server-only; never expose auth.users to the browser.
CREATE OR REPLACE FUNCTION public.settings_find_auth_user(_email text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT id FROM auth.users WHERE lower(email)=lower(btrim(_email)) LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.settings_find_auth_user(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.settings_find_auth_user(text) TO service_role;

-- Keep currency and preferences synchronized through the atomic settings RPC.
REVOKE UPDATE ON public.schools FROM authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.school_settings FROM authenticated;
