GRANT EXECUTE ON FUNCTION public.is_super_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_school_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_school(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shares_school_with(UUID, UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_super_admin(UUID) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, UUID, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_school_member(UUID, UUID) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_manage_school(UUID, UUID) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.shares_school_with(UUID, UUID) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated, public;