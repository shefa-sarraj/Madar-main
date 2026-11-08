-- ENUMS
CREATE TYPE public.app_role AS ENUM ('super_admin','school_owner','school_manager','accountant','registrar','hr','teacher','store_keeper');
CREATE TYPE public.school_status AS ENUM ('active','suspended','archived');
CREATE TYPE public.member_status AS ENUM ('active','invited','suspended');
CREATE TYPE public.academic_year_status AS ENUM ('planned','active','closed');

-- SHARED TRIGGER FN
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- SCHOOLS
CREATE TABLE public.schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar TEXT NOT NULL,
  name_en TEXT,
  logo_url TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  timezone TEXT NOT NULL DEFAULT 'Asia/Jerusalem',
  status public.school_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schools TO authenticated;
GRANT ALL ON public.schools TO service_role;
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- SCHOOL MEMBERS
CREATE TABLE public.school_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.member_status NOT NULL DEFAULT 'active',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_members TO authenticated;
GRANT ALL ON public.school_members TO service_role;
ALTER TABLE public.school_members ENABLE ROW LEVEL SECURITY;

-- USER ROLES (roles are NEVER stored on profiles)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX user_roles_unique_scoped ON public.user_roles (user_id, school_id, role) WHERE school_id IS NOT NULL;
CREATE UNIQUE INDEX user_roles_unique_global ON public.user_roles (user_id, role) WHERE school_id IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER HELPERS
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin');
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _school_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_user_id)
      OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role AND school_id = _school_id);
$$;

CREATE OR REPLACE FUNCTION public.is_school_member(_user_id UUID, _school_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_user_id)
      OR EXISTS (SELECT 1 FROM public.school_members WHERE user_id = _user_id AND school_id = _school_id AND status = 'active');
$$;

CREATE OR REPLACE FUNCTION public.can_manage_school(_user_id UUID, _school_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_user_id)
      OR public.has_role(_user_id, _school_id, 'school_owner')
      OR public.has_role(_user_id, _school_id, 'school_manager');
$$;

CREATE OR REPLACE FUNCTION public.shares_school_with(_viewer UUID, _target UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_viewer)
      OR EXISTS (
        SELECT 1 FROM public.school_members a
        JOIN public.school_members b ON a.school_id = b.school_id
        WHERE a.user_id = _viewer AND b.user_id = _target AND a.status = 'active'
      );
$$;

-- POLICIES: schools
CREATE POLICY "Members can view their schools" ON public.schools FOR SELECT TO authenticated
  USING (public.is_school_member(auth.uid(), id));
CREATE POLICY "Super admins can create schools" ON public.schools FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "Managers can update their school" ON public.schools FOR UPDATE TO authenticated
  USING (public.can_manage_school(auth.uid(), id)) WITH CHECK (public.can_manage_school(auth.uid(), id));
CREATE POLICY "Super admins can delete schools" ON public.schools FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- POLICIES: profiles
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.shares_school_with(auth.uid(), id));
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- POLICIES: school_members
CREATE POLICY "Users can view own memberships" ON public.school_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_school_member(auth.uid(), school_id));
CREATE POLICY "Managers can add members" ON public.school_members FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_school(auth.uid(), school_id));
CREATE POLICY "Managers can update members" ON public.school_members FOR UPDATE TO authenticated
  USING (public.can_manage_school(auth.uid(), school_id)) WITH CHECK (public.can_manage_school(auth.uid(), school_id));
CREATE POLICY "Managers can remove members" ON public.school_members FOR DELETE TO authenticated
  USING (public.can_manage_school(auth.uid(), school_id));

-- POLICIES: user_roles
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_manage_school(auth.uid(), school_id));
CREATE POLICY "Managers can grant school roles" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (school_id IS NOT NULL AND role <> 'super_admin' AND public.can_manage_school(auth.uid(), school_id));
CREATE POLICY "Managers can revoke school roles" ON public.user_roles FOR DELETE TO authenticated
  USING (school_id IS NOT NULL AND role <> 'super_admin' AND public.can_manage_school(auth.uid(), school_id));

-- ACADEMIC YEARS
CREATE TABLE public.academic_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  status public.academic_year_status NOT NULL DEFAULT 'planned',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, name),
  CHECK (end_date > start_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academic_years TO authenticated;
GRANT ALL ON public.academic_years TO service_role;
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view academic years" ON public.academic_years FOR SELECT TO authenticated
  USING (public.is_school_member(auth.uid(), school_id));
CREATE POLICY "Managers can manage academic years" ON public.academic_years FOR ALL TO authenticated
  USING (public.can_manage_school(auth.uid(), school_id)) WITH CHECK (public.can_manage_school(auth.uid(), school_id));

-- SCHOOL SETTINGS
CREATE TABLE public.school_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL UNIQUE REFERENCES public.schools(id) ON DELETE CASCADE,
  default_currency TEXT NOT NULL DEFAULT 'USD',
  date_format TEXT NOT NULL DEFAULT 'dd/MM/yyyy',
  attendance_enabled BOOLEAN NOT NULL DEFAULT true,
  inventory_enabled BOOLEAN NOT NULL DEFAULT true,
  cost_centers_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_settings TO authenticated;
GRANT ALL ON public.school_settings TO service_role;
ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view settings" ON public.school_settings FOR SELECT TO authenticated
  USING (public.is_school_member(auth.uid(), school_id));
CREATE POLICY "Managers can manage settings" ON public.school_settings FOR ALL TO authenticated
  USING (public.can_manage_school(auth.uid(), school_id)) WITH CHECK (public.can_manage_school(auth.uid(), school_id));

-- NOTIFICATIONS
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'info',
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_school_user_idx ON public.notifications (school_id, user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Recipients can view notifications" ON public.notifications FOR SELECT TO authenticated
  USING (public.is_school_member(auth.uid(), school_id) AND (user_id IS NULL OR user_id = auth.uid()));
CREATE POLICY "Recipients can update notifications" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Managers can create notifications" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_school(auth.uid(), school_id));
CREATE POLICY "Managers can delete notifications" ON public.notifications FOR DELETE TO authenticated
  USING (public.can_manage_school(auth.uid(), school_id));

-- AUDIT LOGS
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_school_idx ON public.audit_logs (school_id, created_at DESC);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers can view audit logs" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.can_manage_school(auth.uid(), school_id));
CREATE POLICY "Members can write audit logs" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (public.is_school_member(auth.uid(), school_id) AND user_id = auth.uid());

-- UPDATED_AT TRIGGERS
CREATE TRIGGER schools_set_updated_at BEFORE UPDATE ON public.schools FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER academic_years_set_updated_at BEFORE UPDATE ON public.academic_years FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER school_settings_set_updated_at BEFORE UPDATE ON public.school_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- AUTO PROFILE ON SIGNUP
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.raw_user_meta_data->>'phone')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();