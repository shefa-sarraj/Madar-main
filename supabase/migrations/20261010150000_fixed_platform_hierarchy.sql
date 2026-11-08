CREATE TABLE public.platform_audit_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users(id),
 action text NOT NULL, entity_id uuid, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_audit_logs FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.platform_audit_logs TO authenticated;
GRANT ALL ON public.platform_audit_logs TO service_role;
-- Fixed platform identity is separate from school memberships and roles.
CREATE TABLE public.platform_super_admin (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT
);
ALTER TABLE public.platform_super_admin ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_super_admin FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.platform_super_admin TO service_role;
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.platform_super_admin p JOIN auth.users u ON u.id=p.user_id
 WHERE p.user_id=_user_id AND lower(u.email)='super.madar@gmail.com');
$$;
CREATE FUNCTION public.bootstrap_platform_super_admin(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=_user_id AND lower(email)='super.madar@gmail.com' AND email_confirmed_at IS NOT NULL)
 THEN RAISE EXCEPTION 'Verified fixed platform account required'; END IF;
 INSERT INTO public.platform_super_admin(singleton,user_id) VALUES(true,_user_id)
 ON CONFLICT(singleton) DO UPDATE SET user_id=excluded.user_id;
 DELETE FROM public.user_roles WHERE user_id=_user_id;
 DELETE FROM public.school_members WHERE user_id=_user_id;
 INSERT INTO public.platform_user_permissions(user_id,permission)
 SELECT _user_id,p FROM unnest(ARRAY['create_school','manage_schools','manage_platform_users']) p ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.bootstrap_platform_super_admin(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_platform_super_admin(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.has_platform_permission(_user_id uuid,_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.is_super_admin(_user_id) AND EXISTS(SELECT 1 FROM public.platform_user_permissions WHERE user_id=_user_id AND permission=_permission);
$$;
CREATE FUNCTION public.guard_platform_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF public.is_super_admin(NEW.user_id) THEN RAISE EXCEPTION 'Platform account cannot be a school member'; END IF;
 IF TG_TABLE_NAME='user_roles' AND to_jsonb(NEW)->>'role'='super_admin' THEN RAISE EXCEPTION 'Platform identity is separate from school roles'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_platform_membership BEFORE INSERT OR UPDATE ON public.school_members FOR EACH ROW EXECUTE FUNCTION public.guard_platform_identity();
CREATE TRIGGER guard_platform_school_role BEFORE INSERT OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.guard_platform_identity();
CREATE TABLE public.school_manager_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id),
 school_name text NOT NULL CHECK(length(btrim(school_name)) BETWEEN 1 AND 200),
 full_name text NOT NULL CHECK(length(btrim(full_name)) BETWEEN 1 AND 200),
 requested_role public.app_role NOT NULL DEFAULT 'school_owner' CHECK(requested_role IN ('school_owner','school_manager')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 school_id uuid REFERENCES public.schools(id), reviewed_by uuid REFERENCES auth.users(id),
 review_note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz
);
CREATE UNIQUE INDEX one_pending_manager_request ON public.school_manager_requests(user_id) WHERE status='pending';
ALTER TABLE public.school_manager_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_manager_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.school_manager_requests TO authenticated;
GRANT ALL ON public.school_manager_requests TO service_role;
CREATE POLICY "Requester and platform review requests" ON public.school_manager_requests FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.is_super_admin(auth.uid()));
CREATE FUNCTION public.submit_school_manager_request(_school_name text,_full_name text,_role public.app_role)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE request_id uuid;
BEGIN
 IF auth.uid() IS NULL OR public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'School applicant required'; END IF;
 INSERT INTO public.school_manager_requests(user_id,school_name,full_name,requested_role) VALUES(auth.uid(),btrim(_school_name),btrim(_full_name),_role) RETURNING id INTO request_id;
 RETURN request_id;
END $$;
CREATE FUNCTION public.review_school_manager_request(_id uuid,_approve boolean,_note text DEFAULT '',_school_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE request public.school_manager_requests; target_school uuid;
BEGIN
 IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Platform administrator required' USING ERRCODE='42501'; END IF;
 IF _approve IS NULL THEN RAISE EXCEPTION 'Review decision required'; END IF;
 SELECT * INTO request FROM public.school_manager_requests WHERE id=_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
 IF request.status<>'pending' THEN RAISE EXCEPTION 'Request already reviewed'; END IF;
 IF _approve THEN
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=request.user_id AND email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'Applicant must verify email before approval'; END IF;
  IF public.is_super_admin(request.user_id) THEN RAISE EXCEPTION 'Platform account cannot join a school'; END IF;
  IF _school_id IS NULL THEN
   target_school:=public.platform_create_school(gen_random_uuid(),jsonb_build_object('name_ar',request.school_name,'currency','USD','timezone','Asia/Jerusalem'),'active');
  ELSE
   SELECT id INTO target_school FROM public.schools WHERE id=_school_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'School not found'; END IF;
   UPDATE public.schools SET status='active' WHERE id=target_school;
  END IF;
  PERFORM public.platform_assign_administrator(target_school,request.user_id,request.requested_role);
 END IF;
 UPDATE public.school_manager_requests SET status=CASE WHEN _approve THEN 'approved' ELSE 'rejected' END, school_id=target_school,reviewed_by=auth.uid(),reviewed_at=now(),review_note=left(coalesce(_note,''),1000) WHERE id=_id;
 INSERT INTO public.platform_audit_logs(user_id,action,entity_id,metadata) VALUES(auth.uid(),'review_school_manager_request',_id,jsonb_build_object('approved',_approve,'school_id',target_school));
 RETURN target_school;
END $$;
REVOKE ALL ON FUNCTION public.submit_school_manager_request(text,text,public.app_role),public.review_school_manager_request(uuid,boolean,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_school_manager_request(text,text,public.app_role),public.review_school_manager_request(uuid,boolean,text,uuid) TO authenticated;
-- Extend scoped checks while preserving internal owner and last-owner safeguards.
DO $$
DECLARE f record; definition text;
BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('settings_save_role','settings_save_member_roles','settings_save_member','settings_remove_school_user') LOOP
  definition:=pg_get_functiondef(f.oid);
  definition:=replace(definition,'public.has_role(auth.uid(),_school_id,''school_owner'') OR public.has_platform_permission(auth.uid(),''manage_schools'')','public.can_manage_school(auth.uid(),_school_id)');
  EXECUTE definition;
 END LOOP;
END $$;
CREATE FUNCTION public.guard_custom_role_deactivation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF OLD.is_active AND NOT NEW.is_active AND EXISTS(SELECT 1 FROM public.school_user_custom_roles a JOIN public.school_members m USING(school_id,user_id) WHERE a.school_id=NEW.school_id AND a.role_id=NEW.id AND m.status='active') THEN RAISE EXCEPTION 'Reassign active users before deactivating this role'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_custom_role_deactivation BEFORE UPDATE ON public.school_roles FOR EACH ROW EXECUTE FUNCTION public.guard_custom_role_deactivation();
CREATE FUNCTION public.settings_reassign_custom_role(_school_id uuid,_role_id uuid,_replacement_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM 1 FROM public.schools WHERE id=_school_id FOR UPDATE;
 IF NOT public.can_manage_school(auth.uid(),_school_id) THEN RAISE EXCEPTION 'School management permission required' USING ERRCODE='42501'; END IF;
 IF _role_id=_replacement_id OR NOT EXISTS(SELECT 1 FROM public.school_roles WHERE school_id=_school_id AND id=_replacement_id AND is_active) OR NOT EXISTS(SELECT 1 FROM public.school_roles WHERE school_id=_school_id AND id=_role_id) THEN RAISE EXCEPTION 'Active replacement in the same school required'; END IF;
 INSERT INTO public.school_user_custom_roles(school_id,user_id,role_id) SELECT school_id,user_id,_replacement_id FROM public.school_user_custom_roles WHERE school_id=_school_id AND role_id=_role_id ON CONFLICT DO NOTHING;
 DELETE FROM public.school_user_custom_roles WHERE school_id=_school_id AND role_id=_role_id;
 UPDATE public.school_roles SET is_active=false WHERE school_id=_school_id AND id=_role_id;
 INSERT INTO public.audit_logs(school_id,user_id,action,entity_type,entity_id,metadata) VALUES(_school_id,auth.uid(),'update','school_role',_role_id,jsonb_build_object('replacement',_replacement_id));
END $$;
REVOKE ALL ON FUNCTION public.settings_reassign_custom_role(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.settings_reassign_custom_role(uuid,uuid,uuid) TO authenticated;
-- Signup metadata can only request review, never grant any membership or privilege.
CREATE FUNCTION public.capture_manager_signup_request() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.raw_user_meta_data->>'manager_request'='true' AND lower(NEW.email)<>'super.madar@gmail.com' THEN
  INSERT INTO public.school_manager_requests(user_id,school_name,full_name,requested_role)
  VALUES(NEW.id,left(btrim(NEW.raw_user_meta_data->>'school_name'),200),left(btrim(NEW.raw_user_meta_data->>'full_name'),200),
  CASE WHEN NEW.raw_user_meta_data->>'requested_role'='school_manager' THEN 'school_manager'::public.app_role ELSE 'school_owner'::public.app_role END);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER capture_manager_signup_request AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.capture_manager_signup_request();
CREATE POLICY "Platform reads school administrators" ON public.user_roles FOR SELECT TO authenticated USING(public.is_super_admin(auth.uid()));
-- No delegated permission bundle may create another fixed platform identity.
CREATE OR REPLACE FUNCTION public.platform_save_user_permissions(_user_id uuid,_permissions text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Platform administrator required' USING ERRCODE='42501'; END IF;
 IF _user_id=auth.uid() THEN RAISE EXCEPTION 'Fixed platform permissions are protected'; END IF;
 IF coalesce(cardinality(_permissions),0)>0 THEN RAISE EXCEPTION 'Fixed platform hierarchy does not delegate platform privileges'; END IF;
 DELETE FROM public.platform_user_permissions WHERE user_id=_user_id;
END $$;
DO $$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('public.settings_save_member_internal(uuid,uuid,public.app_role[],public.member_status)'::regprocedure);
 definition:=replace(definition,'privileged:=public.has_role(auth.uid(),_school_id,''school_owner'');','privileged:=public.has_role(auth.uid(),_school_id,''school_owner'') OR public.is_super_admin(auth.uid());');
 EXECUTE definition;
END $$;

CREATE POLICY "Platform reads platform audit" ON public.platform_audit_logs FOR SELECT TO authenticated USING(public.is_super_admin(auth.uid()));
DO $$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('public.settings_remove_school_user(uuid,uuid,boolean)'::regprocedure);
 definition:=replace(definition,'PERFORM pg_advisory_xact_lock',
 'IF NOT public.is_super_admin(auth.uid()) AND NOT public.has_role(auth.uid(),_school_id,''school_owner'') AND EXISTS(SELECT 1 FROM public.user_roles WHERE school_id=_school_id AND user_id=_user_id AND role IN (''school_owner'',''school_manager'')) THEN RAISE EXCEPTION ''Only owner can remove protected school administrators''; END IF; PERFORM pg_advisory_xact_lock');
 EXECUTE definition;
END $$;
