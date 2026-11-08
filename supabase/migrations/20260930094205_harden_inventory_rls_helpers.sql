CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated;

DROP POLICY "Inventory viewers read categories" ON public.inventory_categories;
DROP POLICY "Inventory managers add categories" ON public.inventory_categories;
DROP POLICY "Inventory managers update categories" ON public.inventory_categories;
DROP POLICY "Inventory viewers read items" ON public.inventory_items;
DROP POLICY "Inventory managers add items" ON public.inventory_items;
DROP POLICY "Inventory managers update items" ON public.inventory_items;
DROP POLICY "Inventory viewers read movements" ON public.inventory_movements;
DROP POLICY "Inventory managers add movements" ON public.inventory_movements;

DROP FUNCTION public.can_manage_inventory(uuid,uuid);
DROP FUNCTION public.can_view_inventory(uuid,uuid);

CREATE OR REPLACE FUNCTION private.can_manage_inventory(_school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT public.is_school_member((SELECT auth.uid()),_school_id) AND (
    public.is_super_admin((SELECT auth.uid()))
    OR public.has_role((SELECT auth.uid()),_school_id,'school_owner')
    OR public.has_role((SELECT auth.uid()),_school_id,'school_manager')
    OR public.has_role((SELECT auth.uid()),_school_id,'store_keeper')
  );
$$;

CREATE OR REPLACE FUNCTION private.can_view_inventory(_school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT private.can_manage_inventory(_school_id)
    OR (
      public.is_school_member((SELECT auth.uid()),_school_id)
      AND public.has_role((SELECT auth.uid()),_school_id,'accountant')
    );
$$;

REVOKE EXECUTE ON FUNCTION private.can_manage_inventory(uuid), private.can_view_inventory(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_manage_inventory(uuid), private.can_view_inventory(uuid) TO authenticated;

CREATE POLICY "Inventory viewers read categories" ON public.inventory_categories
  FOR SELECT TO authenticated USING (private.can_view_inventory(school_id));
CREATE POLICY "Inventory managers add categories" ON public.inventory_categories
  FOR INSERT TO authenticated WITH CHECK (private.can_manage_inventory(school_id));
CREATE POLICY "Inventory managers update categories" ON public.inventory_categories
  FOR UPDATE TO authenticated USING (private.can_manage_inventory(school_id))
  WITH CHECK (private.can_manage_inventory(school_id));

CREATE POLICY "Inventory viewers read items" ON public.inventory_items
  FOR SELECT TO authenticated USING (private.can_view_inventory(school_id));
CREATE POLICY "Inventory managers add items" ON public.inventory_items
  FOR INSERT TO authenticated WITH CHECK (private.can_manage_inventory(school_id));
CREATE POLICY "Inventory managers update items" ON public.inventory_items
  FOR UPDATE TO authenticated USING (private.can_manage_inventory(school_id))
  WITH CHECK (private.can_manage_inventory(school_id));

CREATE POLICY "Inventory viewers read movements" ON public.inventory_movements
  FOR SELECT TO authenticated USING (private.can_view_inventory(school_id));
CREATE POLICY "Inventory managers add movements" ON public.inventory_movements
  FOR INSERT TO authenticated WITH CHECK (private.can_manage_inventory(school_id));
