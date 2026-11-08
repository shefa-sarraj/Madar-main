import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ManagerRequest = {
  id: string;
  user_id: string;
  school_name: string;
  full_name: string;
  requested_role: "school_owner" | "school_manager";
  status: "pending" | "approved" | "rejected";
  school_id: string | null;
  review_note: string;
  created_at: string;
};
type RequestDatabase = {
  public: {
    Tables: {
      school_manager_requests: {
        Row: ManagerRequest;
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      submit_school_manager_request: {
        Args: {
          _school_name: string;
          _full_name: string;
          _role: "school_owner" | "school_manager";
        };
        Returns: string;
      };
      review_school_manager_request: {
        Args: { _id: string; _approve: boolean; _note: string; _school_id: string | null };
        Returns: string | null;
      };
      settings_reassign_custom_role: {
        Args: { _school_id: string; _role_id: string; _replacement_id: string };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
export const platformRequestsClient = () => supabase as unknown as SupabaseClient<RequestDatabase>;
