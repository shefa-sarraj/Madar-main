CREATE TYPE public.asset_status AS ENUM ('active','assigned','under_maintenance','damaged','retired');
CREATE TYPE public.asset_condition AS ENUM ('excellent','good','fair','poor');
CREATE TYPE public.asset_event_type AS ENUM ('registered','assigned','transferred','returned','maintenance','damaged','retired');

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.can_manage_assets(_school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT public.is_school_member((SELECT auth.uid()),_school_id) AND (
    public.is_super_admin((SELECT auth.uid()))
    OR public.has_role((SELECT auth.uid()),_school_id,'school_owner')
    OR public.has_role((SELECT auth.uid()),_school_id,'school_manager')
    OR public.has_role((SELECT auth.uid()),_school_id,'store_keeper')
  );
$$;

CREATE OR REPLACE FUNCTION private.can_view_assets(_school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT private.can_manage_assets(_school_id)
    OR (
      public.is_school_member((SELECT auth.uid()),_school_id)
      AND (
        public.has_role((SELECT auth.uid()),_school_id,'accountant')
        OR public.has_role((SELECT auth.uid()),_school_id,'hr')
      )
    );
$$;

REVOKE EXECUTE ON FUNCTION private.can_manage_assets(uuid), private.can_view_assets(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_manage_assets(uuid), private.can_view_assets(uuid) TO authenticated;

CREATE TABLE public.asset_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (btrim(name)<>''),
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,name),
  UNIQUE (id,school_id)
);

CREATE TABLE public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  category_id uuid NOT NULL,
  asset_code text NOT NULL CHECK (btrim(asset_code)<>''),
  name text NOT NULL CHECK (btrim(name)<>''),
  description text,
  serial_number text,
  purchase_date date,
  purchase_cost numeric(14,2) CHECK (purchase_cost IS NULL OR purchase_cost>=0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  location text NOT NULL CHECK (btrim(location)<>''),
  assigned_employee_id uuid,
  status public.asset_status NOT NULL DEFAULT 'active',
  condition public.asset_condition NOT NULL DEFAULT 'good',
  warranty_expiry date,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,asset_code),
  UNIQUE (id,school_id),
  FOREIGN KEY (category_id,school_id) REFERENCES public.asset_categories(id,school_id) ON DELETE RESTRICT,
  FOREIGN KEY (assigned_employee_id,school_id) REFERENCES public.employees(id,school_id) ON DELETE RESTRICT,
  CHECK (warranty_expiry IS NULL OR purchase_date IS NULL OR warranty_expiry>=purchase_date),
  CHECK ((status='assigned')=(assigned_employee_id IS NOT NULL)),
  CHECK ((status='retired')=(NOT is_active))
);

CREATE TABLE public.asset_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL,
  event_type public.asset_event_type NOT NULL,
  event_date date NOT NULL DEFAULT current_date,
  from_location text,
  to_location text,
  assigned_from_employee_id uuid,
  assigned_to_employee_id uuid,
  status_from public.asset_status,
  status_to public.asset_status NOT NULL,
  condition_from public.asset_condition,
  condition_to public.asset_condition NOT NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (asset_id,school_id) REFERENCES public.assets(id,school_id) ON DELETE RESTRICT,
  FOREIGN KEY (assigned_from_employee_id,school_id) REFERENCES public.employees(id,school_id) ON DELETE RESTRICT,
  FOREIGN KEY (assigned_to_employee_id,school_id) REFERENCES public.employees(id,school_id) ON DELETE RESTRICT
);

CREATE INDEX asset_categories_school_active_idx ON public.asset_categories(school_id,is_active);
CREATE INDEX assets_school_status_idx ON public.assets(school_id,status);
CREATE INDEX assets_category_idx ON public.assets(category_id);
CREATE INDEX assets_employee_idx ON public.assets(assigned_employee_id) WHERE assigned_employee_id IS NOT NULL;
CREATE INDEX asset_history_school_date_idx ON public.asset_history(school_id,event_date DESC);
CREATE INDEX asset_history_asset_date_idx ON public.asset_history(asset_id,event_date DESC,created_at DESC);

REVOKE ALL ON public.asset_categories, public.assets, public.asset_history FROM anon, authenticated;
GRANT SELECT,INSERT,UPDATE ON public.asset_categories TO authenticated;
GRANT SELECT,INSERT ON public.assets TO authenticated;
GRANT UPDATE(category_id,name,description,serial_number,purchase_date,purchase_cost,currency,condition,warranty_expiry,notes)
  ON public.assets TO authenticated;
GRANT SELECT ON public.asset_history TO authenticated;
GRANT ALL ON public.asset_categories, public.assets, public.asset_history TO service_role;

ALTER TABLE public.asset_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Asset viewers read categories" ON public.asset_categories
  FOR SELECT TO authenticated USING (private.can_view_assets(school_id));
CREATE POLICY "Asset managers add categories" ON public.asset_categories
  FOR INSERT TO authenticated WITH CHECK (private.can_manage_assets(school_id));
CREATE POLICY "Asset managers update categories" ON public.asset_categories
  FOR UPDATE TO authenticated USING (private.can_manage_assets(school_id))
  WITH CHECK (private.can_manage_assets(school_id));

CREATE POLICY "Asset viewers read assets" ON public.assets
  FOR SELECT TO authenticated USING (private.can_view_assets(school_id));
CREATE POLICY "Asset managers add assets" ON public.assets
  FOR INSERT TO authenticated WITH CHECK (private.can_manage_assets(school_id));
CREATE POLICY "Asset managers update assets" ON public.assets
  FOR UPDATE TO authenticated USING (private.can_manage_assets(school_id))
  WITH CHECK (private.can_manage_assets(school_id));

CREATE POLICY "Asset viewers read history" ON public.asset_history
  FOR SELECT TO authenticated USING (private.can_view_assets(school_id));

CREATE TRIGGER asset_categories_set_updated_at BEFORE UPDATE ON public.asset_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER assets_set_updated_at BEFORE UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.asset_category_before_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP='UPDATE' THEN NEW.school_id:=OLD.school_id; END IF;
  NEW.name:=btrim(NEW.name);
  NEW.description:=nullif(btrim(NEW.description),'');
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.asset_before_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    NEW.school_id:=OLD.school_id;
    NEW.asset_code:=OLD.asset_code;
    IF coalesce(current_setting('app.asset_transition',true),'0')<>'1' THEN
      NEW.location:=OLD.location;
      NEW.assigned_employee_id:=OLD.assigned_employee_id;
      NEW.status:=OLD.status;
      NEW.is_active:=OLD.is_active;
    END IF;
    IF NEW.category_id IS DISTINCT FROM OLD.category_id AND NOT EXISTS (
      SELECT 1 FROM public.asset_categories WHERE id=NEW.category_id AND school_id=NEW.school_id AND is_active
    ) THEN RAISE EXCEPTION 'تصنيف الأصل غير فعال أو لا يتبع المدرسة'; END IF;
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.asset_categories WHERE id=NEW.category_id AND school_id=NEW.school_id AND is_active
  ) THEN RAISE EXCEPTION 'تصنيف الأصل غير فعال أو لا يتبع المدرسة';
  END IF;

  IF NEW.purchase_date>current_date THEN RAISE EXCEPTION 'تاريخ شراء الأصل لا يمكن أن يكون مستقبلياً'; END IF;
  NEW.asset_code:=upper(btrim(NEW.asset_code));
  NEW.name:=btrim(NEW.name);
  NEW.serial_number:=nullif(btrim(NEW.serial_number),'');
  NEW.currency:=upper(btrim(NEW.currency));
  NEW.location:=btrim(NEW.location);
  NEW.description:=nullif(btrim(NEW.description),'');
  NEW.notes:=nullif(btrim(NEW.notes),'');
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.asset_registered_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.asset_history(
    school_id,asset_id,event_type,event_date,to_location,status_to,condition_to,notes,created_by,is_demo
  ) VALUES (
    NEW.school_id,NEW.id,'registered',coalesce(NEW.purchase_date,current_date),NEW.location,
    NEW.status,NEW.condition,'تسجيل الأصل',auth.uid(),NEW.is_demo
  );
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.prevent_asset_history_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RAISE EXCEPTION 'سجل حركة الأصل غير قابل للتعديل أو الحذف';
END $$;

CREATE TRIGGER asset_category_before_write BEFORE INSERT OR UPDATE ON public.asset_categories
  FOR EACH ROW EXECUTE FUNCTION public.asset_category_before_write();
CREATE TRIGGER asset_before_write BEFORE INSERT OR UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.asset_before_write();
CREATE TRIGGER asset_registered_history AFTER INSERT ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.asset_registered_history();
CREATE TRIGGER asset_history_immutable BEFORE UPDATE OR DELETE ON public.asset_history
  FOR EACH ROW EXECUTE FUNCTION public.prevent_asset_history_changes();

CREATE OR REPLACE FUNCTION public.record_asset_event(
  _asset_id uuid,
  _event_type public.asset_event_type,
  _event_date date,
  _to_location text DEFAULT NULL,
  _to_employee_id uuid DEFAULT NULL,
  _condition public.asset_condition DEFAULT NULL,
  _notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  current_asset public.assets;
  employee_record public.employees;
  next_status public.asset_status;
  next_condition public.asset_condition;
  next_location text;
  next_employee uuid;
  history_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  SELECT * INTO current_asset FROM public.assets WHERE id=_asset_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الأصل غير موجود'; END IF;
  IF NOT private.can_manage_assets(current_asset.school_id) THEN RAISE EXCEPTION 'لا تملك صلاحية إدارة الأصول'; END IF;
  IF _event_type='registered' THEN RAISE EXCEPTION 'حدث التسجيل ينشأ تلقائياً'; END IF;
  IF current_asset.status='retired' THEN RAISE EXCEPTION 'لا يمكن تغيير أصل متقاعد'; END IF;
  IF _event_date>current_date THEN RAISE EXCEPTION 'تاريخ الحركة لا يمكن أن يكون مستقبلياً'; END IF;
  IF current_asset.purchase_date IS NOT NULL AND _event_date<current_asset.purchase_date THEN
    RAISE EXCEPTION 'تاريخ الحركة يسبق تاريخ شراء الأصل';
  END IF;

  next_status:=current_asset.status;
  next_condition:=coalesce(_condition,current_asset.condition);
  next_location:=coalesce(nullif(btrim(_to_location),''),current_asset.location);
  next_employee:=current_asset.assigned_employee_id;

  IF _event_type='assigned' THEN
    IF current_asset.status<>'active' OR _to_employee_id IS NULL THEN RAISE EXCEPTION 'الأصل غير متاح للتعيين'; END IF;
    next_employee:=_to_employee_id;
    next_status:='assigned';
  ELSIF _event_type='transferred' THEN
    IF current_asset.status NOT IN ('active','assigned') THEN RAISE EXCEPTION 'الأصل غير متاح للنقل'; END IF;
    IF _to_employee_id IS NULL AND nullif(btrim(_to_location),'') IS NULL THEN RAISE EXCEPTION 'حدد موظفاً أو موقعاً جديداً'; END IF;
    next_employee:=coalesce(_to_employee_id,current_asset.assigned_employee_id);
    next_status:=CASE WHEN next_employee IS NULL THEN 'active' ELSE 'assigned' END;
  ELSIF _event_type='returned' THEN
    IF current_asset.status NOT IN ('assigned','under_maintenance','damaged') THEN RAISE EXCEPTION 'الأصل ليس في حالة قابلة للإرجاع'; END IF;
    next_employee:=NULL;
    next_status:='active';
  ELSIF _event_type='maintenance' THEN
    next_employee:=NULL;
    next_status:='under_maintenance';
  ELSIF _event_type='damaged' THEN
    next_employee:=NULL;
    next_status:='damaged';
    next_condition:=coalesce(_condition,'poor');
  ELSIF _event_type='retired' THEN
    next_employee:=NULL;
    next_status:='retired';
  END IF;

  IF next_employee IS NOT NULL THEN
    SELECT * INTO employee_record FROM public.employees
    WHERE id=next_employee AND school_id=current_asset.school_id AND status='active';
    IF NOT FOUND THEN RAISE EXCEPTION 'لا يمكن تعيين الأصل لموظف غير فعال أو من مدرسة أخرى'; END IF;
  END IF;

  PERFORM set_config('app.asset_transition','1',true);
  UPDATE public.assets SET
    location=next_location,
    assigned_employee_id=next_employee,
    status=next_status,
    condition=next_condition,
    is_active=(next_status<>'retired')
  WHERE id=current_asset.id;
  PERFORM set_config('app.asset_transition','0',true);

  INSERT INTO public.asset_history(
    school_id,asset_id,event_type,event_date,from_location,to_location,
    assigned_from_employee_id,assigned_to_employee_id,status_from,status_to,
    condition_from,condition_to,notes,created_by,is_demo
  ) VALUES (
    current_asset.school_id,current_asset.id,_event_type,_event_date,current_asset.location,next_location,
    current_asset.assigned_employee_id,next_employee,current_asset.status,next_status,
    current_asset.condition,next_condition,nullif(btrim(_notes),''),auth.uid(),current_asset.is_demo
  ) RETURNING id INTO history_id;
  RETURN history_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.record_asset_event(uuid,public.asset_event_type,date,text,uuid,public.asset_condition,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_asset_event(uuid,public.asset_event_type,date,text,uuid,public.asset_condition,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.audit_assets_module()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE action_name text; payload jsonb; row_data jsonb;
BEGIN
  row_data:=to_jsonb(NEW);
  IF TG_TABLE_NAME='asset_history' THEN
    action_name:='asset.'||NEW.event_type::text;
    payload:=jsonb_build_object('asset_id',NEW.asset_id,'event_date',NEW.event_date,'status',NEW.status_to);
  ELSIF TG_TABLE_NAME='assets' AND TG_OP='UPDATE' AND (
    OLD.status IS DISTINCT FROM NEW.status OR OLD.location IS DISTINCT FROM NEW.location
    OR OLD.assigned_employee_id IS DISTINCT FROM NEW.assigned_employee_id
  ) THEN RETURN NULL;
  ELSIF TG_TABLE_NAME='assets' THEN
    action_name:=CASE WHEN TG_OP='INSERT' THEN 'asset.created' ELSE 'asset.updated' END;
    payload:=jsonb_build_object('asset_code',NEW.asset_code,'name',NEW.name);
  ELSIF TG_OP='INSERT' THEN
    action_name:='asset.category.created';
    payload:=jsonb_build_object('name',NEW.name);
  ELSIF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
    action_name:=CASE WHEN NEW.is_active THEN 'asset.category.reactivated' ELSE 'asset.category.archived' END;
    payload:=jsonb_build_object('name',NEW.name);
  ELSE
    action_name:='asset.category.updated';
    payload:=jsonb_build_object('name',NEW.name);
  END IF;
  INSERT INTO public.audit_logs(school_id,user_id,action,entity_type,entity_id,metadata)
  VALUES (NEW.school_id,coalesce(auth.uid(),nullif(row_data->>'created_by','')::uuid),action_name,TG_TABLE_NAME,NEW.id,payload);
  RETURN NULL;
END $$;

CREATE TRIGGER audit_asset_categories AFTER INSERT OR UPDATE ON public.asset_categories
  FOR EACH ROW EXECUTE FUNCTION public.audit_assets_module();
CREATE TRIGGER audit_assets AFTER INSERT OR UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.audit_assets_module();
CREATE TRIGGER audit_asset_history AFTER INSERT ON public.asset_history
  FOR EACH ROW EXECUTE FUNCTION public.audit_assets_module();

REVOKE EXECUTE ON FUNCTION public.asset_category_before_write(), public.asset_before_write(),
  public.asset_registered_history(), public.prevent_asset_history_changes(), public.audit_assets_module()
  FROM PUBLIC, anon, authenticated;
