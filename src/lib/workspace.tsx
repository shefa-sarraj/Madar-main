import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  fetchMyPermissions,
  fetchMySystemPermissions,
  hasPermission,
  type PermissionAction,
} from "@/lib/permissions";

const ACTIVE_SCHOOL_KEY = "madar.active_school";
const ACTIVE_YEAR_KEY = "madar.active_year";

export type School = {
  id: string;
  name_ar: string;
  name_en: string | null;
  logo_url: string | null;
  currency: string;
  status: string;
};

export type AcademicYear = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  status: string;
};

export type Profile = {
  id: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
};

type WorkspaceValue = {
  userId: string | null;
  email: string | null;
  profile: Profile | null;
  schools: School[];
  activeSchool: School | null;
  setActiveSchool: (schoolId: string) => void;
  academicYears: AcademicYear[];
  activeYear: AcademicYear | null;
  setActiveYear: (yearId: string) => void;
  roles: string[];
  isPlatformAdmin: boolean;
  can: (module: string, action: PermissionAction, systemAllowed?: boolean) => boolean;
  isLoading: boolean;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

function readStored(key: string) {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key);
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [activeSchoolId, setActiveSchoolId] = useState<string | null>(null);
  const [activeYearId, setActiveYearId] = useState<string | null>(null);

  useEffect(() => {
    setActiveSchoolId(readStored(ACTIVE_SCHOOL_KEY));
    setActiveYearId(readStored(ACTIVE_YEAR_KEY));
  }, []);

  const sessionQuery = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) return null;
      return data.user;
    },
  });
  const userId = sessionQuery.data?.id ?? null;

  const profileQuery = useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, phone, avatar_url")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const schoolsQuery = useQuery({
    queryKey: ["my-schools", userId],
    enabled: !!userId,
    queryFn: async (): Promise<School[]> => {
      const { data: platformAdmin, error: adminError } = await supabase.rpc("is_super_admin", {
        _user_id: userId!,
      });
      if (adminError) throw adminError;
      if (platformAdmin) {
        const { data, error } = await supabase
          .from("schools")
          .select("id, name_ar, name_en, logo_url, currency, status")
          .order("name_ar");
        if (error) throw error;
        return data ?? [];
      }
      const { data, error } = await supabase
        .from("school_members")
        .select("school:schools(id, name_ar, name_en, logo_url, currency, status)")
        .eq("user_id", userId!)
        .eq("status", "active");
      if (error) throw error;
      return (data ?? [])
        .map((row) => row.school as unknown as School)
        .filter((school): school is School => !!school && school.status === "active");
    },
  });

  const rolesQuery = useQuery({
    queryKey: ["my-roles", userId],
    enabled: !!userId,
    queryFn: async (): Promise<{ role: string; school_id: string | null }[]> => {
      const roles = await supabase
        .from("user_roles")
        .select("role, school_id")
        .eq("user_id", userId!);
      if (roles.error) throw roles.error;
      return (roles.data ?? []).map((row) => ({
        role: row.role as string,
        school_id: row.school_id,
      }));
    },
  });

  const platformQuery = useQuery({
    queryKey: ["platform-identity", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_super_admin", { _user_id: userId! });
      if (error) throw error;
      return data === true;
    },
  });

  const schools = useMemo(() => schoolsQuery.data ?? [], [schoolsQuery.data]);

  const activeSchool = useMemo(() => {
    if (!schools.length) return null;
    return (
      schools.find((school) => school.id === activeSchoolId) ??
      (schools.length === 1 ? schools[0]! : null)
    );
  }, [schools, activeSchoolId]);

  const yearsQuery = useQuery({
    queryKey: ["academic-years", activeSchool?.id],
    enabled: !!activeSchool?.id,
    queryFn: async (): Promise<AcademicYear[]> => {
      const { data, error } = await supabase
        .from("academic_years")
        .select("id, name, start_date, end_date, is_active, status")
        .eq("school_id", activeSchool!.id)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const permissionsQuery = useQuery({
    queryKey: ["my-permissions", userId, activeSchool?.id],
    enabled: !!userId && !!activeSchool,
    queryFn: () => fetchMyPermissions(activeSchool!.id, userId!),
    staleTime: 0,
  });
  const systemPermissionsQuery = useQuery({
    queryKey: ["my-system-permissions", userId, activeSchool?.id],
    enabled: !!userId && !!activeSchool,
    queryFn: () => fetchMySystemPermissions(activeSchool!.id),
    staleTime: 0,
  });
  const can = useCallback(
    (module: string, action: PermissionAction, systemAllowed = false) => {
      if (hasPermission(permissionsQuery.data ?? {}, module, action)) return true;
      if (systemPermissionsQuery.isLoading || systemPermissionsQuery.isError) return false;
      const overrides = systemPermissionsQuery.data ?? {};
      return Object.hasOwn(overrides, module)
        ? hasPermission(overrides, module, action)
        : systemAllowed;
    },
    [
      permissionsQuery.data,
      systemPermissionsQuery.data,
      systemPermissionsQuery.isLoading,
      systemPermissionsQuery.isError,
    ],
  );
  const academicYears = useMemo(() => yearsQuery.data ?? [], [yearsQuery.data]);
  const activeYear = useMemo(() => {
    if (!academicYears.length) return null;
    return (
      academicYears.find((year) => year.id === activeYearId) ??
      academicYears.find((year) => year.is_active) ??
      academicYears[0]!
    );
  }, [academicYears, activeYearId]);

  const setActiveSchool = useCallback(
    (schoolId: string) => {
      if (!schools.some((school) => school.id === schoolId)) return;
      if (activeSchoolId === schoolId) return;
      window.localStorage.setItem(ACTIVE_SCHOOL_KEY, schoolId);
      window.localStorage.removeItem(ACTIVE_YEAR_KEY);
      setActiveSchoolId(schoolId);
      setActiveYearId(null);
      queryClient.invalidateQueries();
    },
    [queryClient, schools, activeSchoolId],
  );

  const setActiveYear = useCallback(
    (yearId: string) => {
      if (!academicYears.some((year) => year.id === yearId)) return;
      window.localStorage.setItem(ACTIVE_YEAR_KEY, yearId);
      setActiveYearId(yearId);
    },
    [academicYears],
  );

  const roles = useMemo(
    () =>
      (rolesQuery.data ?? [])
        .filter((row) => row.role !== "super_admin" && row.school_id === activeSchool?.id)
        .map((row) => row.role),
    [rolesQuery.data, activeSchool?.id],
  );

  const value: WorkspaceValue = {
    userId,
    email: sessionQuery.data?.email ?? null,
    profile: profileQuery.data ?? null,
    schools,
    activeSchool,
    setActiveSchool,
    academicYears,
    activeYear,
    setActiveYear,
    roles,
    isPlatformAdmin: platformQuery.data === true,
    can,
    isLoading:
      sessionQuery.isLoading ||
      schoolsQuery.isLoading ||
      rolesQuery.isLoading ||
      platformQuery.isLoading,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return context;
}

export async function signOutAndRedirect(
  navigate: (options: { to: string; replace?: boolean }) => void,
) {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(ACTIVE_SCHOOL_KEY);
    window.localStorage.removeItem(ACTIVE_YEAR_KEY);
  }
  await supabase.auth.signOut();
  navigate({ to: "/", replace: true });
}
