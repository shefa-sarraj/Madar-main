CREATE OR REPLACE FUNCTION public.prevent_retired_asset_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF OLD.status='retired' THEN
    RAISE EXCEPTION 'لا يمكن تعديل أصل متقاعد';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER assets_retired_immutable
  BEFORE UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.prevent_retired_asset_changes();

REVOKE EXECUTE ON FUNCTION public.prevent_retired_asset_changes()
  FROM PUBLIC, anon, authenticated;
