-- Platform administration is intentionally separate from school-scoped roles.
CREATE TABLE public.platform_user_permissions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission text NOT NULL CHECK (permission IN ('create_school','manage_schools','manage_platform_users')),
  granted_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, permission)
);

ALTER TABLE public.platform_user_permissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_user_permissions FROM anon, authenticated;
GRANT SELECT ON public.platform_user_permissions TO authenticated;
GRANT ALL ON public.platform_user_permissions TO service_role;

INSERT INTO public.platform_user_permissions(user_id, permission, granted_by)
SELECT DISTINCT ur.user_id, permission, ur.user_id
FROM public.user_roles ur
CROSS JOIN (VALUES ('create_school'), ('manage_schools'), ('manage_platform_users')) p(permission)
WHERE ur.role = 'super_admin'
ON CONFLICT DO NOTHING;

DELETE FROM public.user_roles WHERE role = 'super_admin';

CREATE OR REPLACE FUNCTION public.has_platform_permission(_user_id uuid, _permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_user_permissions p
    WHERE p.user_id = _user_id AND p.permission = _permission
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_user_permissions p
    WHERE p.user_id = _user_id
    GROUP BY p.user_id
    HAVING bool_or(p.permission = 'create_school')
       AND bool_or(p.permission = 'manage_schools')
       AND bool_or(p.permission = 'manage_platform_users')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_school_member(_user_id uuid,_school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(
  SELECT 1 FROM public.school_members m JOIN public.schools s ON s.id=m.school_id
  WHERE m.user_id=_user_id AND m.school_id=_school_id AND m.status='active' AND s.status='active');
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid,_school_id uuid,_role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(
  SELECT 1 FROM public.user_roles r JOIN public.school_members m ON m.school_id=r.school_id AND m.user_id=r.user_id
  JOIN public.schools s ON s.id=r.school_id
  WHERE r.user_id=_user_id AND r.school_id=_school_id AND r.role=_role AND r.role<>'super_admin'
   AND m.status='active' AND s.status='active');
$$;

CREATE OR REPLACE FUNCTION public.can_manage_school(_user_id uuid,_school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.has_platform_permission(_user_id,'manage_schools')
     OR public.has_role(_user_id,_school_id,'school_owner')
     OR public.has_role(_user_id,_school_id,'school_manager');
$$;

CREATE POLICY "Platform users read own permissions" ON public.platform_user_permissions
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_platform_permission(auth.uid(),'manage_platform_users'));

CREATE OR REPLACE FUNCTION public.platform_list_users()
RETURNS TABLE(user_id uuid, email text, full_name text, phone text, permissions text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT u.id,
         u.email::text,
         coalesce(p.full_name,'')::text,
         p.phone::text,
         coalesce(array_agg(pp.permission ORDER BY pp.permission) FILTER (WHERE pp.permission IS NOT NULL), ARRAY[]::text[])
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  LEFT JOIN public.platform_user_permissions pp ON pp.user_id = u.id
  WHERE public.has_platform_permission(auth.uid(),'manage_platform_users')
  GROUP BY u.id, u.email, p.full_name, p.phone
  ORDER BY coalesce(p.full_name, u.email);
$$;

CREATE OR REPLACE FUNCTION public.platform_save_user_permissions(_user_id uuid, _permissions text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.has_platform_permission(auth.uid(),'manage_platform_users') THEN
  RAISE EXCEPTION 'Platform user management permission required' USING ERRCODE='42501';
 END IF;
 IF _user_id IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=_user_id) THEN
  RAISE EXCEPTION 'Platform user not found';
 END IF;
 IF _permissions IS NULL OR array_position(_permissions,NULL) IS NOT NULL OR EXISTS(
  SELECT 1 FROM unnest(_permissions) p WHERE p NOT IN ('create_school','manage_schools','manage_platform_users')
 ) THEN
  RAISE EXCEPTION 'Invalid platform permissions';
 END IF;
 IF _user_id = auth.uid() AND NOT ('manage_platform_users' = ANY(_permissions)) THEN
  RAISE EXCEPTION 'Cannot remove your own platform user management permission';
 END IF;
 DELETE FROM public.platform_user_permissions WHERE user_id=_user_id;
 INSERT INTO public.platform_user_permissions(user_id,permission,granted_by)
 SELECT _user_id, p, auth.uid() FROM (SELECT DISTINCT unnest(_permissions) p) permissions;
 DELETE FROM public.user_roles WHERE user_id=_user_id AND role='super_admin';
 INSERT INTO public.audit_logs(school_id,user_id,action,entity_type,entity_id,metadata)
 VALUES(NULL,auth.uid(),'update','platform_user_permissions',_user_id,jsonb_build_object('permissions',_permissions));
END $$;

CREATE OR REPLACE FUNCTION public.platform_create_school(_school_id uuid, _profile jsonb, _status public.school_status)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.has_platform_permission(auth.uid(),'create_school') THEN RAISE EXCEPTION 'Platform administrator required' USING ERRCODE='42501'; END IF;
 IF _school_id IS NULL OR _status IS NULL OR coalesce(trim(_profile->>'name_ar'),'')='' OR length(_profile->>'name_ar')>200
  OR coalesce(_profile->>'currency','')!~'^[A-Z]{3}$' OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=_profile->>'timezone')
 THEN RAISE EXCEPTION 'Invalid school profile'; END IF;
 INSERT INTO public.schools(id,name_ar,name_en,phone,email,address,logo_url,currency,timezone,status)
 VALUES(_school_id,trim(_profile->>'name_ar'),nullif(_profile->>'name_en',''),nullif(_profile->>'phone',''),nullif(_profile->>'email',''),nullif(_profile->>'address',''),nullif(_profile->>'logo_url',''),_profile->>'currency',_profile->>'timezone',_status);
 INSERT INTO public.school_settings(school_id,default_currency) VALUES(_school_id,_profile->>'currency');
 INSERT INTO public.audit_logs(school_id,user_id,action,entity_type,entity_id,metadata)
 VALUES(_school_id,auth.uid(),'create','school',_school_id,jsonb_build_object('administrator_pending',true));
 RETURN _school_id;
END $$;

CREATE OR REPLACE FUNCTION public.platform_save_school(_school_id uuid,_create boolean,_profile jsonb,
 _status public.school_status,_initial_user uuid DEFAULT NULL,_initial_role public.app_role DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.has_platform_permission(auth.uid(), CASE WHEN _create THEN 'create_school' ELSE 'manage_schools' END) THEN RAISE EXCEPTION 'Platform administrator required' USING ERRCODE='42501'; END IF;
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

CREATE OR REPLACE FUNCTION public.platform_assign_administrator(_school_id uuid,_user_id uuid,_role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.has_platform_permission(auth.uid(),'manage_schools') THEN RAISE EXCEPTION 'Platform administrator required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.schools WHERE id=_school_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'School not found'; END IF;
 IF _role IS NULL OR _role NOT IN('school_owner','school_manager') OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=_user_id)
 THEN RAISE EXCEPTION 'Existing user and owner or manager role required'; END IF;
 INSERT INTO public.school_members(school_id,user_id,status) VALUES(_school_id,_user_id,'active')
 ON CONFLICT(school_id,user_id) DO UPDATE SET status='active';
 INSERT INTO public.user_roles(school_id,user_id,role) VALUES(_school_id,_user_id,_role) ON CONFLICT DO NOTHING;
 INSERT INTO public.audit_logs(school_id,user_id,action,entity_type,entity_id,metadata)
 VALUES(_school_id,auth.uid(),'update','school_administrator',_user_id,jsonb_build_object('role',_role));
END $$;

REVOKE ALL ON FUNCTION public.has_platform_permission(uuid,text),public.platform_list_users(),public.platform_save_user_permissions(uuid,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_platform_permission(uuid,text),public.platform_list_users(),public.platform_save_user_permissions(uuid,text[]) TO authenticated;
CREATE OR REPLACE FUNCTION public.settings_save_role(_school_id uuid,_id uuid,_name text,_description text,_active boolean,_permissions jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE new_role_id uuid; entry jsonb;
BEGIN
 PERFORM 1 FROM public.schools WHERE id=_school_id FOR UPDATE;
 IF NOT (public.has_role(auth.uid(),_school_id,'school_owner') OR public.has_platform_permission(auth.uid(),'manage_schools')) THEN RAISE EXCEPTION 'تعديل الأدوار متاح لمالك المدرسة فقط'; END IF;
 IF _active IS NULL OR _permissions IS NULL OR jsonb_typeof(_permissions)<>'array' OR jsonb_array_length(_permissions)>15 THEN RAISE EXCEPTION 'صلاحيات غير صالحة'; END IF;
 IF _id IS NULL THEN
 INSERT INTO public.school_roles(school_id,name,description,is_active) VALUES(_school_id,btrim(_name),coalesce(_description,''),_active) RETURNING id INTO new_role_id;
 ELSE
 UPDATE public.school_roles SET name=btrim(_name),description=coalesce(_description,''),is_active=_active WHERE id=_id AND school_id=_school_id RETURNING id INTO new_role_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'الدور لا يتبع المدرسة أو هو دور نظام محمي'; END IF;
 END IF;
 DELETE FROM public.school_role_permissions WHERE school_id=_school_id AND role_id=new_role_id;
 FOR entry IN SELECT value FROM jsonb_array_elements(_permissions) LOOP
 INSERT INTO public.school_role_permissions(role_id,school_id,module,can_view,can_create,can_edit,can_manage)
 VALUES(new_role_id,_school_id,entry->>'module',(entry->>'can_view')::boolean,(entry->>'can_create')::boolean,(entry->>'can_edit')::boolean,(entry->>'can_manage')::boolean);
 END LOOP;
 INSERT INTO public.audit_logs(school_id,user_id,action,entity_type,entity_id,metadata)
 VALUES(_school_id,auth.uid(),'update','school_role',new_role_id,jsonb_build_object('name',_name,'is_active',_active));
 RETURN new_role_id;
END; $$;

CREATE OR REPLACE FUNCTION public.settings_save_member_roles(_school_id uuid,_user_id uuid,_roles public.app_role[],_custom_roles uuid[],_status public.member_status,_create boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM public.schools WHERE id=_school_id FOR UPDATE;
 IF NOT (public.has_role(auth.uid(),_school_id,'school_owner') OR public.has_platform_permission(auth.uid(),'manage_schools')) THEN RAISE EXCEPTION 'إدارة المستخدمين متاحة لمالك المدرسة فقط'; END IF;
 IF _roles IS NULL OR array_position(_roles,NULL) IS NOT NULL OR 'super_admin' = ANY(_roles) THEN RAISE EXCEPTION 'أدوار غير صالحة'; END IF;
 IF _custom_roles IS NULL OR array_position(_custom_roles,NULL) IS NOT NULL OR _create IS NULL THEN RAISE EXCEPTION 'أدوار غير صالحة'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(_custom_roles) requested_role WHERE NOT EXISTS(SELECT 1 FROM public.school_roles r WHERE r.id=requested_role AND r.school_id=_school_id AND (r.is_active OR (NOT _create AND EXISTS(SELECT 1 FROM public.school_user_custom_roles a WHERE a.school_id=_school_id AND a.user_id=_user_id AND a.role_id=r.id))))) THEN RAISE EXCEPTION 'الدور غير فعال أو لا يتبع المدرسة'; END IF;
 IF _create AND EXISTS(SELECT 1 FROM public.school_members WHERE school_id=_school_id AND user_id=_user_id) THEN RAISE EXCEPTION 'المستخدم عضو في المدرسة بالفعل'; END IF;
 IF NOT _create AND NOT EXISTS(SELECT 1 FROM public.school_members WHERE school_id=_school_id AND user_id=_user_id) THEN RAISE EXCEPTION 'العضوية لا تتبع المدرسة'; END IF;
 IF _create AND coalesce(cardinality(_roles),0)+cardinality(_custom_roles)=0 THEN RAISE EXCEPTION 'اختر دورا واحدا على الأقل'; END IF;
 PERFORM public.settings_save_member_internal(_school_id,_user_id,_roles,_status);
 DELETE FROM public.school_user_custom_roles WHERE school_id=_school_id AND user_id=_user_id;
 INSERT INTO public.school_user_custom_roles(school_id,user_id,role_id) SELECT _school_id,_user_id,role_id FROM (SELECT DISTINCT unnest(_custom_roles) role_id) assignments;
END; $$;

CREATE OR REPLACE FUNCTION public.settings_save_member(_school_id uuid,_user_id uuid,_roles public.app_role[],_status public.member_status)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT (public.has_role(auth.uid(),_school_id,'school_owner') OR public.has_platform_permission(auth.uid(),'manage_schools')) THEN RAISE EXCEPTION 'إدارة المستخدمين متاحة لمالك المدرسة فقط'; END IF;
 IF _roles IS NULL OR array_position(_roles,NULL) IS NOT NULL OR 'super_admin' = ANY(_roles) THEN RAISE EXCEPTION 'أدوار غير صالحة'; END IF;
 PERFORM public.settings_save_member_internal(_school_id,_user_id,_roles,_status);
END; $$;

CREATE OR REPLACE FUNCTION public.settings_remove_school_user(_school_id uuid,_user_id uuid,_delete_auth boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM 1 FROM public.schools WHERE id=_school_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'School not found'; END IF;
 IF NOT (public.has_role(auth.uid(),_school_id,'school_owner') OR public.has_platform_permission(auth.uid(),'manage_schools')) THEN RAISE EXCEPTION 'School owner required' USING ERRCODE='42501'; END IF;
 IF _user_id=auth.uid() OR public.is_super_admin(_user_id) THEN RAISE EXCEPTION 'Cannot remove self or platform administrator'; END IF;
 IF _delete_auth IS NULL OR (_delete_auth AND NOT public.has_platform_permission(auth.uid(),'manage_platform_users')) THEN RAISE EXCEPTION 'Platform administrator required for Auth deletion' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text,8108));
 IF NOT EXISTS(SELECT 1 FROM public.school_members WHERE school_id=_school_id AND user_id=_user_id) THEN RAISE EXCEPTION 'User is not a member of current school'; END IF;
 IF EXISTS(SELECT 1 FROM public.user_roles WHERE school_id=_school_id AND user_id=_user_id AND role='school_owner')
 AND NOT EXISTS(SELECT 1 FROM public.user_roles r JOIN public.school_members m USING(school_id,user_id)
 WHERE r.school_id=_school_id AND r.user_id<>_user_id AND r.role='school_owner' AND m.status='active')
 THEN RAISE EXCEPTION 'Cannot remove the last school owner'; END IF;
 IF _delete_auth AND EXISTS(SELECT 1 FROM public.school_members WHERE user_id=_user_id AND school_id<>_school_id)
 THEN RAISE EXCEPTION 'Auth user belongs to another school'; END IF;
 DELETE FROM public.user_roles WHERE school_id=_school_id AND user_id=_user_id;
 DELETE FROM public.school_members WHERE school_id=_school_id AND user_id=_user_id;
 IF _delete_auth THEN INSERT INTO public.auth_user_deletion_reservations(user_id,requested_by) VALUES(_user_id,auth.uid()); END IF;
 INSERT INTO public.audit_logs(school_id,user_id,action,entity_type,entity_id,metadata)
 VALUES(_school_id,auth.uid(),'delete','school_member',_user_id,jsonb_build_object('delete_auth',_delete_auth));
 RETURN _delete_auth;
END $$;

DROP POLICY IF EXISTS "Members can view their schools" ON public.schools;
CREATE POLICY "Members and platform managers can view schools" ON public.schools FOR SELECT TO authenticated
  USING (public.is_school_member(auth.uid(), id) OR public.has_platform_permission(auth.uid(),'manage_schools'));
DROP POLICY IF EXISTS "Super admins can create schools" ON public.schools;
CREATE POLICY "Platform creators can create schools" ON public.schools FOR INSERT TO authenticated
  WITH CHECK (public.has_platform_permission(auth.uid(),'create_school'));
DROP POLICY IF EXISTS "Users can view own memberships" ON public.school_members;
CREATE POLICY "Users and platform managers can view memberships" ON public.school_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_school_member(auth.uid(), school_id) OR public.can_manage_school(auth.uid(), school_id));
DROP POLICY IF EXISTS "Members can view academic years" ON public.academic_years;
CREATE POLICY "Members and platform managers can view academic years" ON public.academic_years FOR SELECT TO authenticated
  USING (public.is_school_member(auth.uid(), school_id) OR public.can_manage_school(auth.uid(), school_id));
DROP POLICY IF EXISTS "Members can view settings" ON public.school_settings;
CREATE POLICY "Members and platform managers can view settings" ON public.school_settings FOR SELECT TO authenticated
  USING (public.is_school_member(auth.uid(), school_id) OR public.can_manage_school(auth.uid(), school_id));
DROP POLICY IF EXISTS "Members read school role catalog" ON public.school_roles;
CREATE POLICY "Members and platform managers read school role catalog" ON public.school_roles FOR SELECT TO authenticated
  USING (public.is_school_member(auth.uid(),school_id) OR public.can_manage_school(auth.uid(),school_id));
DROP POLICY IF EXISTS "Members read school permission matrix" ON public.school_role_permissions;
CREATE POLICY "Members and platform managers read school permission matrix" ON public.school_role_permissions FOR SELECT TO authenticated
  USING (public.is_school_member(auth.uid(),school_id) OR public.can_manage_school(auth.uid(),school_id));
DROP POLICY IF EXISTS "Users and managers read custom assignments" ON public.school_user_custom_roles;
CREATE POLICY "Users and managers read custom assignments" ON public.school_user_custom_roles FOR SELECT TO authenticated
  USING ((public.is_school_member(auth.uid(),school_id) OR public.can_manage_school(auth.uid(),school_id)) AND (user_id=auth.uid() OR public.can_manage_school(auth.uid(),school_id)));
DROP POLICY IF EXISTS "Super admins can delete schools" ON public.schools;
