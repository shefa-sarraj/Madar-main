CREATE TYPE public.inventory_movement_type AS ENUM (
  'opening_balance',
  'stock_in',
  'stock_out',
  'adjustment_in',
  'adjustment_out'
);

CREATE OR REPLACE FUNCTION public.can_manage_inventory(_user_id uuid, _school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_school_member(_user_id,_school_id) AND (
    public.is_super_admin(_user_id)
    OR public.has_role(_user_id,_school_id,'school_owner')
    OR public.has_role(_user_id,_school_id,'school_manager')
    OR public.has_role(_user_id,_school_id,'store_keeper')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_inventory(_user_id uuid, _school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.can_manage_inventory(_user_id,_school_id)
    OR (
      public.is_school_member(_user_id,_school_id)
      AND public.has_role(_user_id,_school_id,'accountant')
    );
$$;

REVOKE EXECUTE ON FUNCTION public.can_manage_inventory(uuid,uuid), public.can_view_inventory(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_inventory(uuid,uuid), public.can_view_inventory(uuid,uuid) TO authenticated;

CREATE TABLE public.inventory_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (btrim(name) <> ''),
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,name),
  UNIQUE (id,school_id)
);

CREATE TABLE public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  category_id uuid NOT NULL,
  item_code text NOT NULL CHECK (btrim(item_code) <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  description text,
  unit text NOT NULL CHECK (btrim(unit) <> ''),
  minimum_stock numeric(12,3) NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
  storage_location text,
  is_active boolean NOT NULL DEFAULT true,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,item_code),
  UNIQUE (id,school_id),
  FOREIGN KEY (category_id,school_id) REFERENCES public.inventory_categories(id,school_id) ON DELETE RESTRICT
);

CREATE TABLE public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  item_id uuid NOT NULL,
  movement_type public.inventory_movement_type NOT NULL,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  movement_date date NOT NULL DEFAULT current_date,
  reference text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (item_id,school_id) REFERENCES public.inventory_items(id,school_id) ON DELETE RESTRICT
);

CREATE INDEX inventory_categories_school_active_idx ON public.inventory_categories(school_id,is_active);
CREATE INDEX inventory_items_school_active_idx ON public.inventory_items(school_id,is_active);
CREATE INDEX inventory_items_category_idx ON public.inventory_items(category_id);
CREATE INDEX inventory_movements_school_date_idx ON public.inventory_movements(school_id,movement_date DESC);
CREATE INDEX inventory_movements_item_date_idx ON public.inventory_movements(item_id,movement_date DESC,created_at DESC);

REVOKE ALL ON public.inventory_categories, public.inventory_items, public.inventory_movements FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.inventory_categories, public.inventory_items TO authenticated;
GRANT SELECT, INSERT ON public.inventory_movements TO authenticated;
GRANT ALL ON public.inventory_categories, public.inventory_items, public.inventory_movements TO service_role;

ALTER TABLE public.inventory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Inventory viewers read categories" ON public.inventory_categories
  FOR SELECT TO authenticated USING ((SELECT public.can_view_inventory(auth.uid(),school_id)));
CREATE POLICY "Inventory managers add categories" ON public.inventory_categories
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.can_manage_inventory(auth.uid(),school_id)));
CREATE POLICY "Inventory managers update categories" ON public.inventory_categories
  FOR UPDATE TO authenticated USING ((SELECT public.can_manage_inventory(auth.uid(),school_id)))
  WITH CHECK ((SELECT public.can_manage_inventory(auth.uid(),school_id)));

CREATE POLICY "Inventory viewers read items" ON public.inventory_items
  FOR SELECT TO authenticated USING ((SELECT public.can_view_inventory(auth.uid(),school_id)));
CREATE POLICY "Inventory managers add items" ON public.inventory_items
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.can_manage_inventory(auth.uid(),school_id)));
CREATE POLICY "Inventory managers update items" ON public.inventory_items
  FOR UPDATE TO authenticated USING ((SELECT public.can_manage_inventory(auth.uid(),school_id)))
  WITH CHECK ((SELECT public.can_manage_inventory(auth.uid(),school_id)));

CREATE POLICY "Inventory viewers read movements" ON public.inventory_movements
  FOR SELECT TO authenticated USING ((SELECT public.can_view_inventory(auth.uid(),school_id)));
CREATE POLICY "Inventory managers add movements" ON public.inventory_movements
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.can_manage_inventory(auth.uid(),school_id)));

CREATE TRIGGER inventory_categories_set_updated_at BEFORE UPDATE ON public.inventory_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER inventory_items_set_updated_at BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.inventory_category_before_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP='UPDATE' THEN NEW.school_id := OLD.school_id; END IF;
  NEW.name := btrim(NEW.name);
  NEW.description := nullif(btrim(NEW.description),'');
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.inventory_item_before_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    NEW.school_id := OLD.school_id;
    NEW.item_code := OLD.item_code;
    IF NEW.category_id IS DISTINCT FROM OLD.category_id
       AND NOT EXISTS (
         SELECT 1 FROM public.inventory_categories
         WHERE id=NEW.category_id AND school_id=NEW.school_id AND is_active
       ) THEN
      RAISE EXCEPTION 'تصنيف المخزون غير فعال أو لا يتبع المدرسة';
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.inventory_categories
    WHERE id=NEW.category_id AND school_id=NEW.school_id AND is_active
  ) THEN
    RAISE EXCEPTION 'تصنيف المخزون غير فعال أو لا يتبع المدرسة';
  END IF;
  NEW.item_code := upper(btrim(NEW.item_code));
  NEW.name := btrim(NEW.name);
  NEW.unit := btrim(NEW.unit);
  NEW.storage_location := nullif(btrim(NEW.storage_location),'');
  NEW.description := nullif(btrim(NEW.description),'');
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.inventory_movement_before_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  item_record public.inventory_items;
  current_balance numeric(12,3);
  impact numeric(12,3);
BEGIN
  SELECT * INTO item_record
  FROM public.inventory_items
  WHERE id=NEW.item_id AND school_id=NEW.school_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'الصنف لا يتبع المدرسة'; END IF;
  IF NOT item_record.is_active THEN RAISE EXCEPTION 'أعد تفعيل الصنف قبل تسجيل حركة مخزون'; END IF;
  IF NEW.movement_date>current_date THEN RAISE EXCEPTION 'لا يمكن تسجيل حركة بتاريخ مستقبلي'; END IF;

  IF NEW.movement_type='opening_balance' AND EXISTS (
    SELECT 1 FROM public.inventory_movements WHERE item_id=NEW.item_id
  ) THEN
    RAISE EXCEPTION 'لا يمكن تسجيل رصيد افتتاحي بعد بدء حركة الصنف';
  END IF;

  SELECT coalesce(sum(CASE
    WHEN movement_type IN ('opening_balance','stock_in','adjustment_in') THEN quantity
    ELSE -quantity END),0)
  INTO current_balance
  FROM public.inventory_movements
  WHERE item_id=NEW.item_id;

  impact := CASE WHEN NEW.movement_type IN ('opening_balance','stock_in','adjustment_in')
    THEN NEW.quantity ELSE -NEW.quantity END;
  IF current_balance+impact<0 THEN RAISE EXCEPTION 'الكمية المصروفة تتجاوز الرصيد المتاح'; END IF;

  NEW.reference := nullif(btrim(NEW.reference),'');
  NEW.notes := nullif(btrim(NEW.notes),'');
  IF auth.uid() IS NOT NULL THEN NEW.created_by := auth.uid(); END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.prevent_inventory_movement_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RAISE EXCEPTION 'حركات المخزون غير قابلة للتعديل أو الحذف؛ استخدم حركة تسوية';
END $$;

CREATE TRIGGER inventory_category_before_write BEFORE INSERT OR UPDATE ON public.inventory_categories
  FOR EACH ROW EXECUTE FUNCTION public.inventory_category_before_write();
CREATE TRIGGER inventory_item_before_write BEFORE INSERT OR UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.inventory_item_before_write();
CREATE TRIGGER inventory_movement_before_insert BEFORE INSERT ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.inventory_movement_before_insert();
CREATE TRIGGER inventory_movement_immutable BEFORE UPDATE OR DELETE ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.prevent_inventory_movement_changes();

CREATE OR REPLACE FUNCTION public.create_inventory_item(
  _school_id uuid,
  _category_id uuid,
  _item_code text,
  _name text,
  _unit text,
  _minimum_stock numeric,
  _opening_balance numeric DEFAULT 0,
  _storage_location text DEFAULT NULL,
  _description text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE new_id uuid;
BEGIN
  IF _opening_balance<0 THEN RAISE EXCEPTION 'الرصيد الافتتاحي لا يمكن أن يكون سالباً'; END IF;
  INSERT INTO public.inventory_items(
    school_id,category_id,item_code,name,unit,minimum_stock,storage_location,description
  ) VALUES (
    _school_id,_category_id,_item_code,_name,_unit,_minimum_stock,_storage_location,_description
  ) RETURNING id INTO new_id;
  IF _opening_balance>0 THEN
    INSERT INTO public.inventory_movements(
      school_id,item_id,movement_type,quantity,movement_date,reference,notes
    ) VALUES (
      _school_id,new_id,'opening_balance',_opening_balance,current_date,'OPENING','الرصيد الافتتاحي'
    );
  END IF;
  RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION public.record_inventory_movement(
  _school_id uuid,
  _item_id uuid,
  _movement_type public.inventory_movement_type,
  _quantity numeric,
  _movement_date date,
  _reference text DEFAULT NULL,
  _notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE new_id uuid;
BEGIN
  IF _movement_type='opening_balance' THEN RAISE EXCEPTION 'الرصيد الافتتاحي يسجل عند إنشاء الصنف فقط'; END IF;
  INSERT INTO public.inventory_movements(
    school_id,item_id,movement_type,quantity,movement_date,reference,notes
  ) VALUES (
    _school_id,_item_id,_movement_type,_quantity,_movement_date,_reference,_notes
  ) RETURNING id INTO new_id;
  RETURN new_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.create_inventory_item(uuid,uuid,text,text,text,numeric,numeric,text,text),
  public.record_inventory_movement(uuid,uuid,public.inventory_movement_type,numeric,date,text,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_inventory_item(uuid,uuid,text,text,text,numeric,numeric,text,text),
  public.record_inventory_movement(uuid,uuid,public.inventory_movement_type,numeric,date,text,text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.audit_inventory_module()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE action_name text; payload jsonb; row_data jsonb;
BEGIN
  row_data := to_jsonb(NEW);
  IF TG_TABLE_NAME='inventory_movements' THEN
    action_name := 'inventory.' || NEW.movement_type::text;
    payload := jsonb_build_object(
      'item_id',NEW.item_id,'quantity',NEW.quantity,'movement_date',NEW.movement_date,'reference',NEW.reference
    );
  ELSIF TG_OP='INSERT' THEN
    action_name := replace(TG_TABLE_NAME,'inventory_','inventory.') || '.created';
    payload := jsonb_build_object('name',row_data->>'name');
  ELSIF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
    action_name := replace(TG_TABLE_NAME,'inventory_','inventory.') || CASE WHEN NEW.is_active THEN '.reactivated' ELSE '.archived' END;
    payload := jsonb_build_object('name',row_data->>'name');
  ELSE
    action_name := replace(TG_TABLE_NAME,'inventory_','inventory.') || '.updated';
    payload := jsonb_build_object('name',row_data->>'name');
  END IF;
  INSERT INTO public.audit_logs(school_id,user_id,action,entity_type,entity_id,metadata)
  VALUES (
    NEW.school_id,
    coalesce(auth.uid(),nullif(row_data->>'created_by','')::uuid),
    action_name,TG_TABLE_NAME,NEW.id,payload
  );
  RETURN NULL;
END $$;

CREATE TRIGGER audit_inventory_categories AFTER INSERT OR UPDATE ON public.inventory_categories
  FOR EACH ROW EXECUTE FUNCTION public.audit_inventory_module();
CREATE TRIGGER audit_inventory_items AFTER INSERT OR UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_inventory_module();
CREATE TRIGGER audit_inventory_movements AFTER INSERT ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.audit_inventory_module();

REVOKE EXECUTE ON FUNCTION public.inventory_category_before_write(), public.inventory_item_before_write(),
  public.inventory_movement_before_insert(), public.prevent_inventory_movement_changes(),
  public.audit_inventory_module() FROM PUBLIC, anon, authenticated;
