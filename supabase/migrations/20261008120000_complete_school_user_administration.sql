-- Schools may be created before administrator assignment. Platform-only RPCs keep
-- this bootstrap state explicit without weakening school-level permissions.
CREATE FUNCTION public.platform_create_school(_school_id uuid, _profile jsonb, _status public.school_status)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Platform administrator required' USING ERRCODE='42501'; END IF;
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

CREATE FUNCTION public.platform_assign_administrator(_school_id uuid,_user_id uuid,_role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Platform administrator required' USING ERRCODE='42501'; END IF;
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

CREATE FUNCTION public.settings_provision_school_user(_school_id uuid,_user_id uuid,_roles public.app_role[],_custom_roles uuid[],_employee_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.settings_save_member_roles(_school_id,_user_id,_roles,_custom_roles,'active',true);
 IF _employee_id IS NOT NULL THEN PERFORM public.settings_link_employee(_school_id,_user_id,_employee_id); END IF;
END $$;

-- Reserve explicit Auth deletions and block new memberships until deletion finishes.
CREATE TABLE public.auth_user_deletion_reservations(
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 requested_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.auth_user_deletion_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_user_deletion_reservations FROM anon,authenticated;
CREATE FUNCTION public.guard_pending_user_deletion() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,8108));
 IF EXISTS(SELECT 1 FROM public.auth_user_deletion_reservations WHERE user_id=NEW.user_id) THEN RAISE EXCEPTION 'Auth user deletion is pending'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_pending_user_deletion BEFORE INSERT OR UPDATE OF user_id ON public.school_members FOR EACH ROW EXECUTE FUNCTION public.guard_pending_user_deletion();
CREATE FUNCTION public.guard_auth_user_memberships() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(OLD.id::text,8108));
 IF public.is_super_admin(OLD.id) OR EXISTS(SELECT 1 FROM public.school_members WHERE user_id=OLD.id)
 THEN RAISE EXCEPTION 'Remove all school memberships before deleting Auth user'; END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER guard_auth_user_memberships BEFORE DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION public.guard_auth_user_memberships();

CREATE FUNCTION public.settings_remove_school_user(_school_id uuid,_user_id uuid,_delete_auth boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM 1 FROM public.schools WHERE id=_school_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'School not found'; END IF;
 IF NOT public.has_role(auth.uid(),_school_id,'school_owner') THEN RAISE EXCEPTION 'School owner required' USING ERRCODE='42501'; END IF;
 IF _user_id=auth.uid() OR public.is_super_admin(_user_id) THEN RAISE EXCEPTION 'Cannot remove self or platform administrator'; END IF;
 IF _delete_auth IS NULL OR (_delete_auth AND NOT public.is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'Platform administrator required for Auth deletion' USING ERRCODE='42501'; END IF;
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
CREATE FUNCTION public.settings_cancel_auth_deletion(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Platform administrator required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text,8108));
 DELETE FROM public.auth_user_deletion_reservations WHERE user_id=_user_id AND requested_by=auth.uid();
END $$;
REVOKE ALL ON FUNCTION public.guard_pending_user_deletion(),public.guard_auth_user_memberships() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.platform_create_school(uuid,jsonb,public.school_status),public.platform_assign_administrator(uuid,uuid,public.app_role),public.settings_provision_school_user(uuid,uuid,public.app_role[],uuid[],uuid),public.settings_remove_school_user(uuid,uuid,boolean),public.settings_cancel_auth_deletion(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_create_school(uuid,jsonb,public.school_status),public.platform_assign_administrator(uuid,uuid,public.app_role),public.settings_provision_school_user(uuid,uuid,public.app_role[],uuid[],uuid),public.settings_remove_school_user(uuid,uuid,boolean),public.settings_cancel_auth_deletion(uuid) TO authenticated;
