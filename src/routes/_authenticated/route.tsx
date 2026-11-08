import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { WorkspaceProvider } from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/" });
    const { data: platform, error: platformError } = await supabase.rpc("is_super_admin", {
      _user_id: data.user.id,
    });
    if (platformError) throw platformError;
    // Start a fresh document when redirecting between platform and school workspaces.
    if (platform && !["/platform", "/settings"].includes(location.pathname))
      throw redirect({ to: "/platform", reloadDocument: true });
    if (!platform && location.pathname === "/platform")
      throw redirect({ to: "/dashboard", reloadDocument: true });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <WorkspaceProvider>
      <Outlet />
    </WorkspaceProvider>
  );
}
