CREATE OR REPLACE FUNCTION public.audit_assets_module()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  action_name text;
  payload jsonb;
  row_data jsonb:=to_jsonb(NEW);
  old_data jsonb:=CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
BEGIN
  IF TG_TABLE_NAME='asset_history' THEN
    action_name:='asset.'||row_data->>'event_type';
    payload:=jsonb_build_object(
      'asset_id',row_data->>'asset_id',
      'event_date',row_data->>'event_date',
      'status',row_data->>'status_to'
    );
  ELSIF TG_TABLE_NAME='assets' THEN
    IF TG_OP='UPDATE' AND (
      old_data->>'status' IS DISTINCT FROM row_data->>'status'
      OR old_data->>'location' IS DISTINCT FROM row_data->>'location'
      OR old_data->>'assigned_employee_id' IS DISTINCT FROM row_data->>'assigned_employee_id'
    ) THEN
      RETURN NULL;
    END IF;
    action_name:=CASE WHEN TG_OP='INSERT' THEN 'asset.created' ELSE 'asset.updated' END;
    payload:=jsonb_build_object('asset_code',row_data->>'asset_code','name',row_data->>'name');
  ELSIF TG_OP='INSERT' THEN
    action_name:='asset.category.created';
    payload:=jsonb_build_object('name',row_data->>'name');
  ELSIF old_data->>'is_active' IS DISTINCT FROM row_data->>'is_active' THEN
    action_name:=CASE
      WHEN (row_data->>'is_active')::boolean
      THEN 'asset.category.reactivated'
      ELSE 'asset.category.archived'
    END;
    payload:=jsonb_build_object('name',row_data->>'name');
  ELSE
    action_name:='asset.category.updated';
    payload:=jsonb_build_object('name',row_data->>'name');
  END IF;

  INSERT INTO public.audit_logs(school_id,user_id,action,entity_type,entity_id,metadata)
  VALUES (
    (row_data->>'school_id')::uuid,
    coalesce(auth.uid(),nullif(row_data->>'created_by','')::uuid),
    action_name,
    TG_TABLE_NAME,
    (row_data->>'id')::uuid,
    payload
  );
  RETURN NULL;
END $$;

REVOKE EXECUTE ON FUNCTION public.audit_assets_module() FROM PUBLIC, anon, authenticated;
