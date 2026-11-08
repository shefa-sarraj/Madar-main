-- Custom roles supplement protected system roles; all assignments remain school-scoped.
CREATE TABLE public.school_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  description text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,school_id),
  CHECK (lower(btrim(name)) NOT IN ('super_admin','school_owner','school_manager','accountant','registrar','hr','teacher','store_keeper',
    'مشرف النظام','مالك المدرسة','مدير المدرسة','محاسب','مسؤول تسجيل','الموارد البشرية','معلم','أمين مستودع'))
);
CREATE UNIQUE INDEX school_roles_name_unique ON public.school_roles(school_id,lower(btrim(name)));
CREATE TABLE public.school_role_permissions (
  role_id uuid NOT NULL,
  school_id uuid NOT NULL,
  module text NOT NULL CHECK (module IN ('students','admissions','classes','fees','expenses','student_attendance','staff_attendance','employees','inventory','assets','tasks','cases','reports','settings','users')),
  can_view boolean NOT NULL DEFAULT false,
  can_create boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_manage boolean NOT NULL DEFAULT false,
  PRIMARY KEY(role_id,module),
  FOREIGN KEY(role_id,school_id) REFERENCES public.school_roles(id,school_id) ON DELETE CASCADE,
  CHECK (can_view OR NOT (can_create OR can_edit OR can_manage)),
  CHECK (NOT can_manage OR (can_create AND can_edit)),
  CHECK (module NOT IN ('settings','users') OR NOT (can_create OR can_edit OR can_manage))
);
CREATE TABLE public.school_user_custom_roles (
  school_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role_id uuid NOT NULL,
  PRIMARY KEY(school_id,user_id,role_id),
  FOREIGN KEY(school_id,user_id) REFERENCES public.school_members(school_id,user_id) ON DELETE CASCADE,
  FOREIGN KEY(role_id,school_id) REFERENCES public.school_roles(id,school_id) ON DELETE CASCADE
);
CREATE INDEX school_custom_roles_by_role ON public.school_user_custom_roles(role_id,school_id);
ALTER TABLE public.school_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_user_custom_roles ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.school_roles,public.school_role_permissions,public.school_user_custom_roles TO authenticated;
GRANT ALL ON public.school_roles,public.school_role_permissions,public.school_user_custom_roles TO service_role;
REVOKE INSERT,UPDATE,DELETE ON public.school_roles,public.school_role_permissions,public.school_user_custom_roles FROM anon,authenticated;
CREATE POLICY "Members read school role catalog" ON public.school_roles FOR SELECT TO authenticated USING (public.is_school_member(auth.uid(),school_id));
CREATE POLICY "Members read school permission matrix" ON public.school_role_permissions FOR SELECT TO authenticated USING (public.is_school_member(auth.uid(),school_id));
CREATE POLICY "Users and managers read custom assignments" ON public.school_user_custom_roles FOR SELECT TO authenticated
  USING (public.is_school_member(auth.uid(),school_id) AND (user_id=auth.uid() OR public.can_manage_school(auth.uid(),school_id)));

CREATE OR REPLACE FUNCTION public.has_custom_module_permission(_user_id uuid,_school_id uuid,_module text,_action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.is_school_member(_user_id,_school_id) AND EXISTS (
 SELECT 1 FROM public.school_user_custom_roles a
 JOIN public.school_roles r ON r.id=a.role_id AND r.school_id=a.school_id AND r.is_active
 JOIN public.school_role_permissions p ON p.role_id=r.id AND p.school_id=r.school_id
 WHERE a.user_id=_user_id AND a.school_id=_school_id AND p.module=_module AND
 CASE _action WHEN 'view' THEN p.can_view WHEN 'create' THEN p.can_create WHEN 'edit' THEN p.can_edit WHEN 'manage' THEN p.can_manage ELSE false END);
$$;
REVOKE ALL ON FUNCTION public.has_custom_module_permission(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_custom_module_permission(uuid,uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.settings_save_role(_school_id uuid,_id uuid,_name text,_description text,_active boolean,_permissions jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE new_role_id uuid; entry jsonb;
BEGIN
 PERFORM 1 FROM public.schools WHERE id=_school_id FOR UPDATE;
 IF NOT public.has_role(auth.uid(),_school_id,'school_owner') THEN RAISE EXCEPTION 'تعديل الأدوار متاح لمالك المدرسة فقط'; END IF;
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
REVOKE ALL ON FUNCTION public.settings_save_role(uuid,uuid,text,text,boolean,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.settings_save_role(uuid,uuid,text,text,boolean,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.settings_save_member_roles(_school_id uuid,_user_id uuid,_roles public.app_role[],_custom_roles uuid[],_status public.member_status,_create boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM public.schools WHERE id=_school_id FOR UPDATE;
 IF NOT public.has_role(auth.uid(),_school_id,'school_owner') THEN RAISE EXCEPTION 'إدارة المستخدمين متاحة لمالك المدرسة فقط'; END IF;
 IF _custom_roles IS NULL OR array_position(_custom_roles,NULL) IS NOT NULL OR _create IS NULL THEN RAISE EXCEPTION 'أدوار غير صالحة'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(_custom_roles) requested_role WHERE NOT EXISTS(SELECT 1 FROM public.school_roles r WHERE r.id=requested_role AND r.school_id=_school_id AND (r.is_active OR (NOT _create AND EXISTS(SELECT 1 FROM public.school_user_custom_roles a WHERE a.school_id=_school_id AND a.user_id=_user_id AND a.role_id=r.id))))) THEN RAISE EXCEPTION 'الدور غير فعال أو لا يتبع المدرسة'; END IF;
 IF _create AND EXISTS(SELECT 1 FROM public.school_members WHERE school_id=_school_id AND user_id=_user_id) THEN RAISE EXCEPTION 'المستخدم عضو في المدرسة بالفعل'; END IF;
 IF NOT _create AND NOT EXISTS(SELECT 1 FROM public.school_members WHERE school_id=_school_id AND user_id=_user_id) THEN RAISE EXCEPTION 'العضوية لا تتبع المدرسة'; END IF;
 IF _create AND coalesce(cardinality(_roles),0)+cardinality(_custom_roles)=0 THEN RAISE EXCEPTION 'اختر دورا واحدا على الأقل'; END IF;
 PERFORM public.settings_save_member(_school_id,_user_id,_roles,_status);
 DELETE FROM public.school_user_custom_roles WHERE school_id=_school_id AND user_id=_user_id;
 INSERT INTO public.school_user_custom_roles(school_id,user_id,role_id) SELECT _school_id,_user_id,role_id FROM (SELECT DISTINCT unnest(_custom_roles) role_id) assignments;
END; $$;
REVOKE ALL ON FUNCTION public.settings_save_member_roles(uuid,uuid,public.app_role[],uuid[],public.member_status,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.settings_save_member_roles(uuid,uuid,public.app_role[],uuid[],public.member_status,boolean) TO authenticated;

-- A legacy RPC must not provide an alternative route around owner-only user administration.
ALTER FUNCTION public.settings_save_member(uuid,uuid,public.app_role[],public.member_status) RENAME TO settings_save_member_internal;
REVOKE ALL ON FUNCTION public.settings_save_member_internal(uuid,uuid,public.app_role[],public.member_status) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.settings_save_member(_school_id uuid,_user_id uuid,_roles public.app_role[],_status public.member_status)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),_school_id,'school_owner') THEN RAISE EXCEPTION 'إدارة المستخدمين متاحة لمالك المدرسة فقط'; END IF;
 PERFORM public.settings_save_member_internal(_school_id,_user_id,_roles,_status);
END; $$;
REVOKE ALL ON FUNCTION public.settings_save_member(uuid,uuid,public.app_role[],public.member_status) FROM PUBLIC,anon;
-- Only the new assignment RPC is browser-callable; it validates every custom role.

ALTER TABLE public.academic_years ADD CONSTRAINT academic_years_active_status_matches CHECK(is_active=(status='active')) NOT VALID;
CREATE UNIQUE INDEX academic_years_one_active_per_school ON public.academic_years(school_id) WHERE is_active OR status='active';
CREATE OR REPLACE FUNCTION public.settings_year_identity_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.school_id IS DISTINCT FROM OLD.school_id OR NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'لا يمكن نقل السنة إلى مدرسة أخرى'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER settings_year_identity_guard BEFORE UPDATE ON public.academic_years FOR EACH ROW EXECUTE FUNCTION public.settings_year_identity_guard();
