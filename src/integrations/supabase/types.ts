export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      academic_years: {
        Row: {
          created_at: string;
          end_date: string;
          id: string;
          is_active: boolean;
          name: string;
          school_id: string;
          start_date: string;
          status: Database["public"]["Enums"]["academic_year_status"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          end_date: string;
          id?: string;
          is_active?: boolean;
          name: string;
          school_id: string;
          start_date: string;
          status?: Database["public"]["Enums"]["academic_year_status"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          end_date?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          school_id?: string;
          start_date?: string;
          status?: Database["public"]["Enums"]["academic_year_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "academic_years_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      admission_applications: {
        Row: {
          academic_year_id: string;
          application_number: string;
          converted_student_id: string | null;
          created_at: string;
          date_of_birth: string | null;
          gender: Database["public"]["Enums"]["gender"] | null;
          guardian_email: string | null;
          guardian_name: string;
          guardian_phone: string;
          id: string;
          is_demo: boolean;
          notes: string | null;
          previous_school: string | null;
          requested_grade_id: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          school_id: string;
          status: Database["public"]["Enums"]["admission_status"];
          student_first_name: string;
          student_last_name: string;
          student_middle_name: string | null;
          submitted_at: string;
          updated_at: string;
        };
        Insert: {
          academic_year_id: string;
          application_number: string;
          converted_student_id?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          gender?: Database["public"]["Enums"]["gender"] | null;
          guardian_email?: string | null;
          guardian_name: string;
          guardian_phone: string;
          id?: string;
          is_demo?: boolean;
          notes?: string | null;
          previous_school?: string | null;
          requested_grade_id: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          school_id: string;
          status?: Database["public"]["Enums"]["admission_status"];
          student_first_name: string;
          student_last_name: string;
          student_middle_name?: string | null;
          submitted_at?: string;
          updated_at?: string;
        };
        Update: {
          academic_year_id?: string;
          application_number?: string;
          converted_student_id?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          gender?: Database["public"]["Enums"]["gender"] | null;
          guardian_email?: string | null;
          guardian_name?: string;
          guardian_phone?: string;
          id?: string;
          is_demo?: boolean;
          notes?: string | null;
          previous_school?: string | null;
          requested_grade_id?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          school_id?: string;
          status?: Database["public"]["Enums"]["admission_status"];
          student_first_name?: string;
          student_last_name?: string;
          student_middle_name?: string | null;
          submitted_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admission_applications_academic_year_id_fkey";
            columns: ["academic_year_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admission_applications_converted_student_id_fkey";
            columns: ["converted_student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admission_applications_requested_grade_id_school_id_fkey";
            columns: ["requested_grade_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "grades";
            referencedColumns: ["id", "school_id"];
          },
          {
            foreignKeyName: "admission_applications_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      asset_categories: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          name: string;
          school_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          school_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          school_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "asset_categories_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      asset_history: {
        Row: {
          asset_id: string;
          assigned_from_employee_id: string | null;
          assigned_to_employee_id: string | null;
          condition_from: Database["public"]["Enums"]["asset_condition"] | null;
          condition_to: Database["public"]["Enums"]["asset_condition"];
          created_at: string;
          created_by: string | null;
          event_date: string;
          event_type: Database["public"]["Enums"]["asset_event_type"];
          from_location: string | null;
          id: string;
          is_demo: boolean;
          notes: string | null;
          school_id: string;
          status_from: Database["public"]["Enums"]["asset_status"] | null;
          status_to: Database["public"]["Enums"]["asset_status"];
          to_location: string | null;
        };
        Insert: {
          asset_id: string;
          assigned_from_employee_id?: string | null;
          assigned_to_employee_id?: string | null;
          condition_from?: Database["public"]["Enums"]["asset_condition"] | null;
          condition_to: Database["public"]["Enums"]["asset_condition"];
          created_at?: string;
          created_by?: string | null;
          event_date?: string;
          event_type: Database["public"]["Enums"]["asset_event_type"];
          from_location?: string | null;
          id?: string;
          is_demo?: boolean;
          notes?: string | null;
          school_id: string;
          status_from?: Database["public"]["Enums"]["asset_status"] | null;
          status_to: Database["public"]["Enums"]["asset_status"];
          to_location?: string | null;
        };
        Update: {
          asset_id?: string;
          assigned_from_employee_id?: string | null;
          assigned_to_employee_id?: string | null;
          condition_from?: Database["public"]["Enums"]["asset_condition"] | null;
          condition_to?: Database["public"]["Enums"]["asset_condition"];
          created_at?: string;
          created_by?: string | null;
          event_date?: string;
          event_type?: Database["public"]["Enums"]["asset_event_type"];
          from_location?: string | null;
          id?: string;
          is_demo?: boolean;
          notes?: string | null;
          school_id?: string;
          status_from?: Database["public"]["Enums"]["asset_status"] | null;
          status_to?: Database["public"]["Enums"]["asset_status"];
          to_location?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "asset_history_asset_id_school_id_fkey";
            columns: ["asset_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["id", "school_id"];
          },
          {
            foreignKeyName: "asset_history_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      assets: {
        Row: {
          asset_code: string;
          assigned_employee_id: string | null;
          category_id: string;
          condition: Database["public"]["Enums"]["asset_condition"];
          created_at: string;
          currency: string;
          description: string | null;
          id: string;
          is_active: boolean;
          is_demo: boolean;
          location: string;
          name: string;
          notes: string | null;
          purchase_cost: number | null;
          purchase_date: string | null;
          school_id: string;
          serial_number: string | null;
          status: Database["public"]["Enums"]["asset_status"];
          updated_at: string;
          warranty_expiry: string | null;
        };
        Insert: {
          asset_code: string;
          assigned_employee_id?: string | null;
          category_id: string;
          condition?: Database["public"]["Enums"]["asset_condition"];
          created_at?: string;
          currency?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          is_demo?: boolean;
          location: string;
          name: string;
          notes?: string | null;
          purchase_cost?: number | null;
          purchase_date?: string | null;
          school_id: string;
          serial_number?: string | null;
          status?: Database["public"]["Enums"]["asset_status"];
          updated_at?: string;
          warranty_expiry?: string | null;
        };
        Update: {
          asset_code?: string;
          assigned_employee_id?: string | null;
          category_id?: string;
          condition?: Database["public"]["Enums"]["asset_condition"];
          created_at?: string;
          currency?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          is_demo?: boolean;
          location?: string;
          name?: string;
          notes?: string | null;
          purchase_cost?: number | null;
          purchase_date?: string | null;
          school_id?: string;
          serial_number?: string | null;
          status?: Database["public"]["Enums"]["asset_status"];
          updated_at?: string;
          warranty_expiry?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "assets_assigned_employee_id_school_id_fkey";
            columns: ["assigned_employee_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id", "school_id"];
          },
          {
            foreignKeyName: "assets_category_id_school_id_fkey";
            columns: ["category_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "asset_categories";
            referencedColumns: ["id", "school_id"];
          },
          {
            foreignKeyName: "assets_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          metadata: Json;
          school_id: string;
          user_id: string | null;
        };
        Insert: {
          action: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          metadata?: Json;
          school_id: string;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          metadata?: Json;
          school_id?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      cost_centers: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          reference_id: string | null;
          school_id: string;
          type: Database["public"]["Enums"]["cost_center_type"];
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          reference_id?: string | null;
          school_id: string;
          type?: Database["public"]["Enums"]["cost_center_type"];
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          reference_id?: string | null;
          school_id?: string;
          type?: Database["public"]["Enums"]["cost_center_type"];
        };
        Relationships: [
          {
            foreignKeyName: "cost_centers_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      departments: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          is_demo: boolean;
          name: string;
          school_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          is_demo?: boolean;
          name: string;
          school_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          is_demo?: boolean;
          name?: string;
          school_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "departments_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      employees: {
        Row: {
          address: string | null;
          created_at: string;
          created_by: string | null;
          date_of_birth: string | null;
          department_id: string | null;
          email: string | null;
          employee_number: string;
          employment_type: Database["public"]["Enums"]["employment_type"];
          full_name: string;
          gender: Database["public"]["Enums"]["gender"] | null;
          hire_date: string;
          id: string;
          is_demo: boolean;
          is_teacher: boolean;
          job_title: string;
          national_id: string | null;
          notes: string | null;
          phone: string | null;
          school_id: string;
          status: Database["public"]["Enums"]["employee_status"];
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          created_at?: string;
          created_by?: string | null;
          date_of_birth?: string | null;
          department_id?: string | null;
          email?: string | null;
          employee_number?: string;
          employment_type?: Database["public"]["Enums"]["employment_type"];
          full_name: string;
          gender?: Database["public"]["Enums"]["gender"] | null;
          hire_date?: string;
          id?: string;
          is_demo?: boolean;
          is_teacher?: boolean;
          job_title: string;
          national_id?: string | null;
          notes?: string | null;
          phone?: string | null;
          school_id: string;
          status?: Database["public"]["Enums"]["employee_status"];
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          created_at?: string;
          created_by?: string | null;
          date_of_birth?: string | null;
          department_id?: string | null;
          email?: string | null;
          employee_number?: string;
          employment_type?: Database["public"]["Enums"]["employment_type"];
          full_name?: string;
          gender?: Database["public"]["Enums"]["gender"] | null;
          hire_date?: string;
          id?: string;
          is_demo?: boolean;
          is_teacher?: boolean;
          job_title?: string;
          national_id?: string | null;
          notes?: string | null;
          phone?: string | null;
          school_id?: string;
          status?: Database["public"]["Enums"]["employee_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "employees_department_id_school_id_fkey";
            columns: ["department_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id", "school_id"];
          },
          {
            foreignKeyName: "employees_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      discounts: {
        Row: {
          academic_year_id: string;
          approved_by: string | null;
          calculated_amount: number;
          created_at: string;
          created_by: string | null;
          id: string;
          is_active: boolean;
          is_demo: boolean;
          name: string;
          reason: string | null;
          school_id: string;
          student_fee_id: string | null;
          student_id: string;
          type: Database["public"]["Enums"]["discount_type"];
          value: number;
        };
        Insert: {
          academic_year_id: string;
          approved_by?: string | null;
          calculated_amount: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          is_demo?: boolean;
          name: string;
          reason?: string | null;
          school_id: string;
          student_fee_id?: string | null;
          student_id: string;
          type: Database["public"]["Enums"]["discount_type"];
          value: number;
        };
        Update: {
          academic_year_id?: string;
          approved_by?: string | null;
          calculated_amount?: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          is_demo?: boolean;
          name?: string;
          reason?: string | null;
          school_id?: string;
          student_fee_id?: string | null;
          student_id?: string;
          type?: Database["public"]["Enums"]["discount_type"];
          value?: number;
        };
        Relationships: [
          {
            foreignKeyName: "discounts_academic_year_id_fkey";
            columns: ["academic_year_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "discounts_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "discounts_student_fee_id_fkey";
            columns: ["student_fee_id"];
            isOneToOne: false;
            referencedRelation: "student_fees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "discounts_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      expense_categories: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          school_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          school_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          school_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expense_categories_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      expenses: {
        Row: {
          academic_year_id: string;
          amount: number;
          attachment_url: string | null;
          cost_center_id: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          description: string | null;
          expense_category_id: string;
          expense_date: string;
          expense_number: string;
          id: string;
          is_demo: boolean;
          payment_method: Database["public"]["Enums"]["payment_method"] | null;
          reference_number: string | null;
          school_id: string;
          status: Database["public"]["Enums"]["expense_status"];
          title: string;
          updated_at: string;
        };
        Insert: {
          academic_year_id: string;
          amount: number;
          attachment_url?: string | null;
          cost_center_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          description?: string | null;
          expense_category_id: string;
          expense_date?: string;
          expense_number?: string;
          id?: string;
          is_demo?: boolean;
          payment_method?: Database["public"]["Enums"]["payment_method"] | null;
          reference_number?: string | null;
          school_id: string;
          status?: Database["public"]["Enums"]["expense_status"];
          title: string;
          updated_at?: string;
        };
        Update: {
          academic_year_id?: string;
          amount?: number;
          attachment_url?: string | null;
          cost_center_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          description?: string | null;
          expense_category_id?: string;
          expense_date?: string;
          expense_number?: string;
          id?: string;
          is_demo?: boolean;
          payment_method?: Database["public"]["Enums"]["payment_method"] | null;
          reference_number?: string | null;
          school_id?: string;
          status?: Database["public"]["Enums"]["expense_status"];
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expenses_academic_year_id_fkey";
            columns: ["academic_year_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_cost_center_id_school_id_fkey";
            columns: ["cost_center_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "cost_centers";
            referencedColumns: ["id", "school_id"];
          },
          {
            foreignKeyName: "expenses_expense_category_id_school_id_fkey";
            columns: ["expense_category_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "expense_categories";
            referencedColumns: ["id", "school_id"];
          },
          {
            foreignKeyName: "expenses_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      fee_categories: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          is_demo: boolean;
          name: string;
          school_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          is_demo?: boolean;
          name: string;
          school_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          is_demo?: boolean;
          name?: string;
          school_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fee_categories_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      fee_structures: {
        Row: {
          academic_year_id: string;
          amount: number;
          created_at: string;
          currency: string;
          due_date: string | null;
          fee_category_id: string;
          grade_id: string | null;
          id: string;
          is_active: boolean;
          is_demo: boolean;
          is_mandatory: boolean;
          name: string;
          school_id: string;
          updated_at: string;
        };
        Insert: {
          academic_year_id: string;
          amount: number;
          created_at?: string;
          currency?: string;
          due_date?: string | null;
          fee_category_id: string;
          grade_id?: string | null;
          id?: string;
          is_active?: boolean;
          is_demo?: boolean;
          is_mandatory?: boolean;
          name: string;
          school_id: string;
          updated_at?: string;
        };
        Update: {
          academic_year_id?: string;
          amount?: number;
          created_at?: string;
          currency?: string;
          due_date?: string | null;
          fee_category_id?: string;
          grade_id?: string | null;
          id?: string;
          is_active?: boolean;
          is_demo?: boolean;
          is_mandatory?: boolean;
          name?: string;
          school_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fee_structures_academic_year_id_fkey";
            columns: ["academic_year_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fee_structures_fee_category_id_school_id_fkey";
            columns: ["fee_category_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "fee_categories";
            referencedColumns: ["id", "school_id"];
          },
          {
            foreignKeyName: "fee_structures_grade_id_fkey";
            columns: ["grade_id"];
            isOneToOne: false;
            referencedRelation: "grades";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fee_structures_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      grades: {
        Row: {
          created_at: string;
          id: string;
          is_demo: boolean;
          name: string;
          order_index: number;
          school_id: string;
          stage_id: string;
          status: Database["public"]["Enums"]["structure_status"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_demo?: boolean;
          name: string;
          order_index?: number;
          school_id: string;
          stage_id: string;
          status?: Database["public"]["Enums"]["structure_status"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_demo?: boolean;
          name?: string;
          order_index?: number;
          school_id?: string;
          stage_id?: string;
          status?: Database["public"]["Enums"]["structure_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "grades_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "grades_stage_id_school_id_fkey";
            columns: ["stage_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "stages";
            referencedColumns: ["id", "school_id"];
          },
        ];
      };
      guardians: {
        Row: {
          address: string | null;
          created_at: string;
          email: string | null;
          full_name: string;
          id: string;
          is_demo: boolean;
          notes: string | null;
          occupation: string | null;
          phone: string;
          relationship: string | null;
          school_id: string;
          secondary_phone: string | null;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          created_at?: string;
          email?: string | null;
          full_name: string;
          id?: string;
          is_demo?: boolean;
          notes?: string | null;
          occupation?: string | null;
          phone: string;
          relationship?: string | null;
          school_id: string;
          secondary_phone?: string | null;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          is_demo?: boolean;
          notes?: string | null;
          occupation?: string | null;
          phone?: string;
          relationship?: string | null;
          school_id?: string;
          secondary_phone?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "guardians_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      installment_plans: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          school_id: string;
          student_fee_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          school_id: string;
          student_fee_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          school_id?: string;
          student_fee_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "installment_plans_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "installment_plans_student_fee_id_fkey";
            columns: ["student_fee_id"];
            isOneToOne: true;
            referencedRelation: "student_fees";
            referencedColumns: ["id"];
          },
        ];
      };
      installments: {
        Row: {
          amount: number;
          amount_paid: number;
          created_at: string;
          due_date: string;
          id: string;
          installment_number: number;
          installment_plan_id: string;
          paid_at: string | null;
          school_id: string;
          status: Database["public"]["Enums"]["installment_status"];
          student_fee_id: string;
          updated_at: string;
        };
        Insert: {
          amount: number;
          amount_paid?: number;
          created_at?: string;
          due_date: string;
          id?: string;
          installment_number: number;
          installment_plan_id: string;
          paid_at?: string | null;
          school_id: string;
          status?: Database["public"]["Enums"]["installment_status"];
          student_fee_id: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          amount_paid?: number;
          created_at?: string;
          due_date?: string;
          id?: string;
          installment_number?: number;
          installment_plan_id?: string;
          paid_at?: string | null;
          school_id?: string;
          status?: Database["public"]["Enums"]["installment_status"];
          student_fee_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "installments_installment_plan_id_fkey";
            columns: ["installment_plan_id"];
            isOneToOne: false;
            referencedRelation: "installment_plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "installments_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "installments_student_fee_id_fkey";
            columns: ["student_fee_id"];
            isOneToOne: false;
            referencedRelation: "student_fees";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_categories: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          name: string;
          school_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          school_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          school_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_categories_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_items: {
        Row: {
          category_id: string;
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          is_demo: boolean;
          item_code: string;
          minimum_stock: number;
          name: string;
          school_id: string;
          storage_location: string | null;
          unit: string;
          updated_at: string;
        };
        Insert: {
          category_id: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          is_demo?: boolean;
          item_code: string;
          minimum_stock?: number;
          name: string;
          school_id: string;
          storage_location?: string | null;
          unit: string;
          updated_at?: string;
        };
        Update: {
          category_id?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          is_demo?: boolean;
          item_code?: string;
          minimum_stock?: number;
          name?: string;
          school_id?: string;
          storage_location?: string | null;
          unit?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_items_category_id_school_id_fkey";
            columns: ["category_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "inventory_categories";
            referencedColumns: ["id", "school_id"];
          },
          {
            foreignKeyName: "inventory_items_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_movements: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          is_demo: boolean;
          item_id: string;
          movement_date: string;
          movement_type: Database["public"]["Enums"]["inventory_movement_type"];
          notes: string | null;
          quantity: number;
          reference: string | null;
          school_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_demo?: boolean;
          item_id: string;
          movement_date?: string;
          movement_type: Database["public"]["Enums"]["inventory_movement_type"];
          notes?: string | null;
          quantity: number;
          reference?: string | null;
          school_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_demo?: boolean;
          item_id?: string;
          movement_date?: string;
          movement_type?: Database["public"]["Enums"]["inventory_movement_type"];
          notes?: string | null;
          quantity?: number;
          reference?: string | null;
          school_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_movements_item_id_school_id_fkey";
            columns: ["item_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "inventory_items";
            referencedColumns: ["id", "school_id"];
          },
          {
            foreignKeyName: "inventory_movements_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          created_at: string;
          id: string;
          is_read: boolean;
          message: string;
          school_id: string;
          title: string;
          type: string;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_read?: boolean;
          message?: string;
          school_id: string;
          title: string;
          type?: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_read?: boolean;
          message?: string;
          school_id?: string;
          title?: string;
          type?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_allocations: {
        Row: {
          amount: number;
          created_at: string;
          id: string;
          installment_id: string | null;
          payment_id: string;
          school_id: string;
          student_fee_id: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          id?: string;
          installment_id?: string | null;
          payment_id: string;
          school_id: string;
          student_fee_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          id?: string;
          installment_id?: string | null;
          payment_id?: string;
          school_id?: string;
          student_fee_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_allocations_installment_id_fkey";
            columns: ["installment_id"];
            isOneToOne: false;
            referencedRelation: "installments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_allocations_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_allocations_student_fee_id_fkey";
            columns: ["student_fee_id"];
            isOneToOne: false;
            referencedRelation: "student_fees";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          academic_year_id: string;
          amount: number;
          cancel_reason: string | null;
          created_at: string;
          currency: string;
          id: string;
          is_demo: boolean;
          notes: string | null;
          payment_date: string;
          payment_method: Database["public"]["Enums"]["payment_method"];
          payment_number: string;
          received_by: string | null;
          reference_number: string | null;
          school_id: string;
          status: Database["public"]["Enums"]["payment_status"];
          student_id: string;
          updated_at: string;
        };
        Insert: {
          academic_year_id: string;
          amount: number;
          cancel_reason?: string | null;
          created_at?: string;
          currency?: string;
          id?: string;
          is_demo?: boolean;
          notes?: string | null;
          payment_date?: string;
          payment_method?: Database["public"]["Enums"]["payment_method"];
          payment_number: string;
          received_by?: string | null;
          reference_number?: string | null;
          school_id: string;
          status?: Database["public"]["Enums"]["payment_status"];
          student_id: string;
          updated_at?: string;
        };
        Update: {
          academic_year_id?: string;
          amount?: number;
          cancel_reason?: string | null;
          created_at?: string;
          currency?: string;
          id?: string;
          is_demo?: boolean;
          notes?: string | null;
          payment_date?: string;
          payment_method?: Database["public"]["Enums"]["payment_method"];
          payment_number?: string;
          received_by?: string | null;
          reference_number?: string | null;
          school_id?: string;
          status?: Database["public"]["Enums"]["payment_status"];
          student_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_academic_year_id_fkey";
            columns: ["academic_year_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          full_name: string;
          id: string;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          full_name?: string;
          id: string;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          full_name?: string;
          id?: string;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      school_members: {
        Row: {
          id: string;
          joined_at: string;
          school_id: string;
          status: Database["public"]["Enums"]["member_status"];
          user_id: string;
        };
        Insert: {
          id?: string;
          joined_at?: string;
          school_id: string;
          status?: Database["public"]["Enums"]["member_status"];
          user_id: string;
        };
        Update: {
          id?: string;
          joined_at?: string;
          school_id?: string;
          status?: Database["public"]["Enums"]["member_status"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "school_members_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      school_settings: {
        Row: {
          attendance_enabled: boolean;
          cost_centers_enabled: boolean;
          created_at: string;
          date_format: string;
          default_currency: string;
          id: string;
          inventory_enabled: boolean;
          school_id: string;
          updated_at: string;
        };
        Insert: {
          attendance_enabled?: boolean;
          cost_centers_enabled?: boolean;
          created_at?: string;
          date_format?: string;
          default_currency?: string;
          id?: string;
          inventory_enabled?: boolean;
          school_id: string;
          updated_at?: string;
        };
        Update: {
          attendance_enabled?: boolean;
          cost_centers_enabled?: boolean;
          created_at?: string;
          date_format?: string;
          default_currency?: string;
          id?: string;
          inventory_enabled?: boolean;
          school_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "school_settings_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: true;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      schools: {
        Row: {
          address: string | null;
          created_at: string;
          currency: string;
          email: string | null;
          id: string;
          logo_url: string | null;
          name_ar: string;
          name_en: string | null;
          phone: string | null;
          status: Database["public"]["Enums"]["school_status"];
          timezone: string;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          created_at?: string;
          currency?: string;
          email?: string | null;
          id?: string;
          logo_url?: string | null;
          name_ar: string;
          name_en?: string | null;
          phone?: string | null;
          status?: Database["public"]["Enums"]["school_status"];
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          created_at?: string;
          currency?: string;
          email?: string | null;
          id?: string;
          logo_url?: string | null;
          name_ar?: string;
          name_en?: string | null;
          phone?: string | null;
          status?: Database["public"]["Enums"]["school_status"];
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      sections: {
        Row: {
          academic_year_id: string;
          capacity: number | null;
          created_at: string;
          grade_id: string;
          homeroom_teacher_id: string | null;
          id: string;
          is_demo: boolean;
          name: string;
          school_id: string;
          status: Database["public"]["Enums"]["structure_status"];
          updated_at: string;
        };
        Insert: {
          academic_year_id: string;
          capacity?: number | null;
          created_at?: string;
          grade_id: string;
          homeroom_teacher_id?: string | null;
          id?: string;
          is_demo?: boolean;
          name: string;
          school_id: string;
          status?: Database["public"]["Enums"]["structure_status"];
          updated_at?: string;
        };
        Update: {
          academic_year_id?: string;
          capacity?: number | null;
          created_at?: string;
          grade_id?: string;
          homeroom_teacher_id?: string | null;
          id?: string;
          is_demo?: boolean;
          name?: string;
          school_id?: string;
          status?: Database["public"]["Enums"]["structure_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sections_academic_year_id_fkey";
            columns: ["academic_year_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sections_grade_id_school_id_fkey";
            columns: ["grade_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "grades";
            referencedColumns: ["id", "school_id"];
          },
          {
            foreignKeyName: "sections_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_attendance: {
        Row: {
          attendance_date: string;
          check_in: string | null;
          check_out: string | null;
          created_at: string;
          employee_id: string;
          id: string;
          is_demo: boolean;
          marked_by: string | null;
          notes: string | null;
          school_id: string;
          status: Database["public"]["Enums"]["staff_attendance_status"];
          updated_at: string;
        };
        Insert: {
          attendance_date: string;
          check_in?: string | null;
          check_out?: string | null;
          created_at?: string;
          employee_id: string;
          id?: string;
          is_demo?: boolean;
          marked_by?: string | null;
          notes?: string | null;
          school_id: string;
          status: Database["public"]["Enums"]["staff_attendance_status"];
          updated_at?: string;
        };
        Update: {
          attendance_date?: string;
          check_in?: string | null;
          check_out?: string | null;
          created_at?: string;
          employee_id?: string;
          id?: string;
          is_demo?: boolean;
          marked_by?: string | null;
          notes?: string | null;
          school_id?: string;
          status?: Database["public"]["Enums"]["staff_attendance_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_attendance_employee_id_school_id_fkey";
            columns: ["employee_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id", "school_id"];
          },
          {
            foreignKeyName: "staff_attendance_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      stages: {
        Row: {
          created_at: string;
          id: string;
          is_demo: boolean;
          name: string;
          order_index: number;
          school_id: string;
          status: Database["public"]["Enums"]["structure_status"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_demo?: boolean;
          name: string;
          order_index?: number;
          school_id: string;
          status?: Database["public"]["Enums"]["structure_status"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_demo?: boolean;
          name?: string;
          order_index?: number;
          school_id?: string;
          status?: Database["public"]["Enums"]["structure_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stages_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      student_attendance: {
        Row: {
          academic_year_id: string;
          attendance_date: string;
          created_at: string;
          enrollment_id: string;
          id: string;
          is_demo: boolean;
          marked_by: string | null;
          notes: string | null;
          school_id: string;
          status: Database["public"]["Enums"]["student_attendance_status"];
          student_id: string;
          updated_at: string;
        };
        Insert: {
          academic_year_id: string;
          attendance_date: string;
          created_at?: string;
          enrollment_id: string;
          id?: string;
          is_demo?: boolean;
          marked_by?: string | null;
          notes?: string | null;
          school_id: string;
          status: Database["public"]["Enums"]["student_attendance_status"];
          student_id: string;
          updated_at?: string;
        };
        Update: {
          academic_year_id?: string;
          attendance_date?: string;
          created_at?: string;
          enrollment_id?: string;
          id?: string;
          is_demo?: boolean;
          marked_by?: string | null;
          notes?: string | null;
          school_id?: string;
          status?: Database["public"]["Enums"]["student_attendance_status"];
          student_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_attendance_academic_year_id_fkey";
            columns: ["academic_year_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_attendance_enrollment_id_school_id_fkey";
            columns: ["enrollment_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "student_enrollments";
            referencedColumns: ["id", "school_id"];
          },
          {
            foreignKeyName: "student_attendance_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_attendance_student_id_school_id_fkey";
            columns: ["student_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id", "school_id"];
          },
        ];
      };
      student_documents: {
        Row: {
          created_at: string;
          document_type: string;
          expiry_date: string | null;
          file_name: string;
          file_url: string;
          id: string;
          notes: string | null;
          school_id: string;
          student_id: string;
          uploaded_by: string | null;
        };
        Insert: {
          created_at?: string;
          document_type: string;
          expiry_date?: string | null;
          file_name: string;
          file_url: string;
          id?: string;
          notes?: string | null;
          school_id: string;
          student_id: string;
          uploaded_by?: string | null;
        };
        Update: {
          created_at?: string;
          document_type?: string;
          expiry_date?: string | null;
          file_name?: string;
          file_url?: string;
          id?: string;
          notes?: string | null;
          school_id?: string;
          student_id?: string;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "student_documents_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_documents_student_id_school_id_fkey";
            columns: ["student_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id", "school_id"];
          },
        ];
      };
      student_enrollments: {
        Row: {
          academic_year_id: string;
          created_at: string;
          end_date: string | null;
          enrollment_status: Database["public"]["Enums"]["enrollment_status"];
          grade_id: string;
          id: string;
          notes: string | null;
          school_id: string;
          section_id: string | null;
          start_date: string;
          student_id: string;
          updated_at: string;
        };
        Insert: {
          academic_year_id: string;
          created_at?: string;
          end_date?: string | null;
          enrollment_status?: Database["public"]["Enums"]["enrollment_status"];
          grade_id: string;
          id?: string;
          notes?: string | null;
          school_id: string;
          section_id?: string | null;
          start_date?: string;
          student_id: string;
          updated_at?: string;
        };
        Update: {
          academic_year_id?: string;
          created_at?: string;
          end_date?: string | null;
          enrollment_status?: Database["public"]["Enums"]["enrollment_status"];
          grade_id?: string;
          id?: string;
          notes?: string | null;
          school_id?: string;
          section_id?: string | null;
          start_date?: string;
          student_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_enrollments_academic_year_id_fkey";
            columns: ["academic_year_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_enrollments_grade_id_school_id_fkey";
            columns: ["grade_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "grades";
            referencedColumns: ["id", "school_id"];
          },
          {
            foreignKeyName: "student_enrollments_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_enrollments_section_id_school_id_fkey";
            columns: ["section_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "sections";
            referencedColumns: ["id", "school_id"];
          },
          {
            foreignKeyName: "student_enrollments_student_id_school_id_fkey";
            columns: ["student_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id", "school_id"];
          },
        ];
      };
      student_fees: {
        Row: {
          academic_year_id: string;
          amount_paid: number;
          balance: number;
          created_at: string;
          currency: string;
          discount_amount: number;
          due_date: string | null;
          enrollment_id: string;
          fee_category_id: string;
          fee_structure_id: string | null;
          final_amount: number;
          id: string;
          is_demo: boolean;
          name: string;
          notes: string | null;
          original_amount: number;
          school_id: string;
          status: Database["public"]["Enums"]["student_fee_status"];
          student_id: string;
          updated_at: string;
        };
        Insert: {
          academic_year_id: string;
          amount_paid?: number;
          balance?: number;
          created_at?: string;
          currency?: string;
          discount_amount?: number;
          due_date?: string | null;
          enrollment_id: string;
          fee_category_id: string;
          fee_structure_id?: string | null;
          final_amount?: number;
          id?: string;
          is_demo?: boolean;
          name: string;
          notes?: string | null;
          original_amount: number;
          school_id: string;
          status?: Database["public"]["Enums"]["student_fee_status"];
          student_id: string;
          updated_at?: string;
        };
        Update: {
          academic_year_id?: string;
          amount_paid?: number;
          balance?: number;
          created_at?: string;
          currency?: string;
          discount_amount?: number;
          due_date?: string | null;
          enrollment_id?: string;
          fee_category_id?: string;
          fee_structure_id?: string | null;
          final_amount?: number;
          id?: string;
          is_demo?: boolean;
          name?: string;
          notes?: string | null;
          original_amount?: number;
          school_id?: string;
          status?: Database["public"]["Enums"]["student_fee_status"];
          student_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_fees_academic_year_id_fkey";
            columns: ["academic_year_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_fees_enrollment_id_fkey";
            columns: ["enrollment_id"];
            isOneToOne: false;
            referencedRelation: "student_enrollments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_fees_fee_category_id_school_id_fkey";
            columns: ["fee_category_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "fee_categories";
            referencedColumns: ["id", "school_id"];
          },
          {
            foreignKeyName: "student_fees_fee_structure_id_fkey";
            columns: ["fee_structure_id"];
            isOneToOne: false;
            referencedRelation: "fee_structures";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_fees_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_fees_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      student_guardians: {
        Row: {
          can_pickup: boolean;
          created_at: string;
          guardian_id: string;
          id: string;
          is_primary: boolean;
          receives_notifications: boolean;
          relationship: string;
          school_id: string;
          student_id: string;
        };
        Insert: {
          can_pickup?: boolean;
          created_at?: string;
          guardian_id: string;
          id?: string;
          is_primary?: boolean;
          receives_notifications?: boolean;
          relationship?: string;
          school_id: string;
          student_id: string;
        };
        Update: {
          can_pickup?: boolean;
          created_at?: string;
          guardian_id?: string;
          id?: string;
          is_primary?: boolean;
          receives_notifications?: boolean;
          relationship?: string;
          school_id?: string;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_guardians_guardian_id_school_id_fkey";
            columns: ["guardian_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "guardians";
            referencedColumns: ["id", "school_id"];
          },
          {
            foreignKeyName: "student_guardians_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_guardians_student_id_school_id_fkey";
            columns: ["student_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id", "school_id"];
          },
        ];
      };
      students: {
        Row: {
          address: string | null;
          administrative_notes: string | null;
          created_at: string;
          date_of_birth: string | null;
          emergency_phone: string | null;
          enrollment_date: string;
          first_name: string;
          full_name: string;
          gender: Database["public"]["Enums"]["gender"];
          id: string;
          is_demo: boolean;
          last_name: string;
          medical_notes: string | null;
          middle_name: string | null;
          nationality: string | null;
          phone: string | null;
          photo_url: string | null;
          place_of_birth: string | null;
          previous_school: string | null;
          school_id: string;
          status: Database["public"]["Enums"]["student_status"];
          student_number: string;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          administrative_notes?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          emergency_phone?: string | null;
          enrollment_date?: string;
          first_name: string;
          full_name?: string;
          gender: Database["public"]["Enums"]["gender"];
          id?: string;
          is_demo?: boolean;
          last_name: string;
          medical_notes?: string | null;
          middle_name?: string | null;
          nationality?: string | null;
          phone?: string | null;
          photo_url?: string | null;
          place_of_birth?: string | null;
          previous_school?: string | null;
          school_id: string;
          status?: Database["public"]["Enums"]["student_status"];
          student_number: string;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          administrative_notes?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          emergency_phone?: string | null;
          enrollment_date?: string;
          first_name?: string;
          full_name?: string;
          gender?: Database["public"]["Enums"]["gender"];
          id?: string;
          is_demo?: boolean;
          last_name?: string;
          medical_notes?: string | null;
          middle_name?: string | null;
          nationality?: string | null;
          phone?: string | null;
          photo_url?: string | null;
          place_of_birth?: string | null;
          previous_school?: string | null;
          school_id?: string;
          status?: Database["public"]["Enums"]["student_status"];
          student_number?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "students_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      case_comments: {
        Row: {
          case_id: string;
          comment: string;
          created_at: string;
          id: string;
          is_demo: boolean;
          school_id: string;
          user_id: string;
        };
        Insert: {
          case_id: string;
          comment: string;
          created_at?: string;
          id?: string;
          is_demo?: boolean;
          school_id: string;
          user_id?: string;
        };
        Update: {
          case_id?: string;
          comment?: string;
          created_at?: string;
          id?: string;
          is_demo?: boolean;
          school_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "case_comments_case_id_school_id_fkey";
            columns: ["case_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "cases";
            referencedColumns: ["id", "school_id"];
          },
          {
            foreignKeyName: "case_comments_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      cases: {
        Row: {
          academic_year_id: string | null;
          assigned_to_employee_id: string | null;
          assigned_to_user_id: string | null;
          case_number: string;
          category: string;
          created_at: string;
          created_by: string;
          description: string;
          employee_id: string | null;
          guardian_id: string | null;
          id: string;
          is_demo: boolean;
          priority: Database["public"]["Enums"]["case_priority"];
          resolution: string | null;
          resolved_at: string | null;
          school_id: string;
          status: Database["public"]["Enums"]["case_status"];
          student_id: string | null;
          submitted_by_name: string | null;
          submitted_by_phone: string | null;
          title: string;
          type: Database["public"]["Enums"]["case_type"];
          updated_at: string;
        };
        Insert: {
          academic_year_id?: string | null;
          assigned_to_employee_id?: string | null;
          assigned_to_user_id?: string | null;
          case_number?: string;
          category: string;
          created_at?: string;
          created_by?: string;
          description: string;
          employee_id?: string | null;
          guardian_id?: string | null;
          id?: string;
          is_demo?: boolean;
          priority?: Database["public"]["Enums"]["case_priority"];
          resolution?: string | null;
          resolved_at?: string | null;
          school_id: string;
          status?: Database["public"]["Enums"]["case_status"];
          student_id?: string | null;
          submitted_by_name?: string | null;
          submitted_by_phone?: string | null;
          title: string;
          type: Database["public"]["Enums"]["case_type"];
          updated_at?: string;
        };
        Update: {
          academic_year_id?: string | null;
          assigned_to_employee_id?: string | null;
          assigned_to_user_id?: string | null;
          case_number?: string;
          category?: string;
          created_at?: string;
          created_by?: string;
          description?: string;
          employee_id?: string | null;
          guardian_id?: string | null;
          id?: string;
          is_demo?: boolean;
          priority?: Database["public"]["Enums"]["case_priority"];
          resolution?: string | null;
          resolved_at?: string | null;
          school_id?: string;
          status?: Database["public"]["Enums"]["case_status"];
          student_id?: string | null;
          submitted_by_name?: string | null;
          submitted_by_phone?: string | null;
          title?: string;
          type?: Database["public"]["Enums"]["case_type"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cases_academic_year_id_fkey";
            columns: ["academic_year_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cases_assigned_to_employee_id_school_id_fkey";
            columns: ["assigned_to_employee_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id", "school_id"];
          },
          {
            foreignKeyName: "cases_employee_id_school_id_fkey";
            columns: ["employee_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id", "school_id"];
          },
          {
            foreignKeyName: "cases_guardian_id_school_id_fkey";
            columns: ["guardian_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "guardians";
            referencedColumns: ["id", "school_id"];
          },
          {
            foreignKeyName: "cases_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cases_student_id_school_id_fkey";
            columns: ["student_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id", "school_id"];
          },
        ];
      };
      task_comments: {
        Row: {
          comment: string;
          created_at: string;
          id: string;
          is_demo: boolean;
          school_id: string;
          task_id: string;
          user_id: string;
        };
        Insert: {
          comment: string;
          created_at?: string;
          id?: string;
          is_demo?: boolean;
          school_id: string;
          task_id: string;
          user_id?: string;
        };
        Update: {
          comment?: string;
          created_at?: string;
          id?: string;
          is_demo?: boolean;
          school_id?: string;
          task_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_comments_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_comments_task_id_school_id_fkey";
            columns: ["task_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id", "school_id"];
          },
        ];
      };
      tasks: {
        Row: {
          academic_year_id: string | null;
          assigned_to_employee_id: string | null;
          assigned_to_user_id: string | null;
          completed_at: string | null;
          created_at: string;
          created_by: string;
          description: string | null;
          due_date: string | null;
          id: string;
          is_demo: boolean;
          priority: Database["public"]["Enums"]["task_priority"];
          related_entity_id: string | null;
          related_entity_type: string | null;
          school_id: string;
          status: Database["public"]["Enums"]["task_status"];
          title: string;
          updated_at: string;
        };
        Insert: {
          academic_year_id?: string | null;
          assigned_to_employee_id?: string | null;
          assigned_to_user_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          due_date?: string | null;
          id?: string;
          is_demo?: boolean;
          priority?: Database["public"]["Enums"]["task_priority"];
          related_entity_id?: string | null;
          related_entity_type?: string | null;
          school_id: string;
          status?: Database["public"]["Enums"]["task_status"];
          title: string;
          updated_at?: string;
        };
        Update: {
          academic_year_id?: string | null;
          assigned_to_employee_id?: string | null;
          assigned_to_user_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          due_date?: string | null;
          id?: string;
          is_demo?: boolean;
          priority?: Database["public"]["Enums"]["task_priority"];
          related_entity_id?: string | null;
          related_entity_type?: string | null;
          school_id?: string;
          status?: Database["public"]["Enums"]["task_status"];
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_academic_year_id_fkey";
            columns: ["academic_year_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_assigned_to_employee_id_school_id_fkey";
            columns: ["assigned_to_employee_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id", "school_id"];
          },
          {
            foreignKeyName: "tasks_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          school_id: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          school_id?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          school_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_roles_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      add_discount: {
        Args: {
          _name: string;
          _reason?: string;
          _student_fee_id: string;
          _type: Database["public"]["Enums"]["discount_type"];
          _value: number;
        };
        Returns: string;
      };
      apply_fee_structure: { Args: { _structure_id: string }; Returns: number };
      can_manage_finance: {
        Args: { _school_id: string; _user_id: string };
        Returns: boolean;
      };
      can_manage_school: {
        Args: { _school_id: string; _user_id: string };
        Returns: boolean;
      };
      can_manage_staff: {
        Args: { _school_id: string; _user_id: string };
        Returns: boolean;
      };
      can_mark_student_attendance: {
        Args: { _enrollment_id: string; _school_id: string; _user_id: string };
        Returns: boolean;
      };
      can_manage_students: {
        Args: { _school_id: string; _user_id: string };
        Returns: boolean;
      };
      can_view_finance: {
        Args: { _school_id: string; _user_id: string };
        Returns: boolean;
      };
      can_view_staff: {
        Args: { _school_id: string; _user_id: string };
        Returns: boolean;
      };
      can_view_student_attendance: {
        Args: { _school_id: string; _user_id: string };
        Returns: boolean;
      };
      can_view_structure: {
        Args: { _school_id: string; _user_id: string };
        Returns: boolean;
      };
      can_view_students: {
        Args: { _school_id: string; _user_id: string };
        Returns: boolean;
      };
      cancel_payment: {
        Args: { _payment_id: string; _reason: string };
        Returns: undefined;
      };
      convert_admission_application: {
        Args: { _application_id: string; _section_id?: string };
        Returns: string;
      };
      create_inventory_item: {
        Args: {
          _category_id: string;
          _description?: string;
          _item_code: string;
          _minimum_stock: number;
          _name: string;
          _opening_balance?: number;
          _school_id: string;
          _storage_location?: string;
          _unit: string;
        };
        Returns: string;
      };
      deactivate_discount: {
        Args: { _discount_id: string };
        Returns: undefined;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _school_id: string;
          _user_id: string;
        };
        Returns: boolean;
      };
      is_school_member: {
        Args: { _school_id: string; _user_id: string };
        Returns: boolean;
      };
      is_super_admin: { Args: { _user_id: string }; Returns: boolean };
      recalc_student_fee: { Args: { _fee_id: string }; Returns: undefined };
      record_payment: {
        Args: {
          _allocations: Json;
          _amount: number;
          _method: Database["public"]["Enums"]["payment_method"];
          _notes: string;
          _payment_date: string;
          _reference: string;
          _student_id: string;
        };
        Returns: string;
      };
      record_inventory_movement: {
        Args: {
          _item_id: string;
          _movement_date: string;
          _movement_type: Database["public"]["Enums"]["inventory_movement_type"];
          _notes?: string;
          _quantity: number;
          _reference?: string;
          _school_id: string;
        };
        Returns: string;
      };
      record_asset_event: {
        Args: {
          _asset_id: string;
          _condition?: Database["public"]["Enums"]["asset_condition"];
          _event_date: string;
          _event_type: Database["public"]["Enums"]["asset_event_type"];
          _notes?: string;
          _to_employee_id?: string;
          _to_location?: string;
        };
        Returns: string;
      };
      refresh_finance_statuses: {
        Args: { _school_id: string };
        Returns: undefined;
      };
      set_installment_plan: {
        Args: { _items: Json; _name: string; _student_fee_id: string };
        Returns: string;
      };
      shares_school_with: {
        Args: { _target: string; _viewer: string };
        Returns: boolean;
      };
    };
    Enums: {
      academic_year_status: "planned" | "active" | "closed";
      admission_status: "new" | "under_review" | "accepted" | "rejected" | "waiting" | "enrolled";
      case_priority: "low" | "medium" | "high" | "urgent";
      case_status: "new" | "under_review" | "in_progress" | "resolved" | "closed" | "rejected";
      case_type: "complaint" | "note" | "incident" | "feedback";
      app_role:
        | "super_admin"
        | "school_owner"
        | "school_manager"
        | "accountant"
        | "registrar"
        | "hr"
        | "teacher"
        | "store_keeper";
      asset_condition: "excellent" | "good" | "fair" | "poor";
      asset_event_type:
        | "registered"
        | "assigned"
        | "transferred"
        | "returned"
        | "maintenance"
        | "damaged"
        | "retired";
      asset_status: "active" | "assigned" | "under_maintenance" | "damaged" | "retired";
      cost_center_type: "school" | "stage" | "department" | "custom";
      discount_type: "percentage" | "fixed";
      employee_status: "active" | "inactive" | "on_leave" | "terminated";
      employment_type: "full_time" | "part_time" | "contract" | "temporary";
      enrollment_status: "active" | "pending" | "completed" | "withdrawn" | "transferred";
      expense_status: "recorded" | "cancelled";
      gender: "male" | "female";
      installment_status: "upcoming" | "due" | "partial" | "paid" | "overdue";
      inventory_movement_type:
        "opening_balance" | "stock_in" | "stock_out" | "adjustment_in" | "adjustment_out";
      member_status: "active" | "invited" | "suspended";
      payment_method: "cash" | "bank_transfer" | "card" | "other";
      payment_status: "completed" | "pending" | "cancelled" | "refunded";
      school_status: "active" | "suspended" | "archived";
      staff_attendance_status: "present" | "absent" | "late" | "leave";
      structure_status: "active" | "archived";
      student_attendance_status: "present" | "absent" | "late" | "excused";
      student_fee_status: "unpaid" | "partial" | "paid" | "overdue" | "waived" | "cancelled";
      student_status: "active" | "new" | "suspended" | "withdrawn" | "transferred" | "graduated";
      task_priority: "low" | "medium" | "high" | "urgent";
      task_status: "open" | "in_progress" | "completed" | "cancelled";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      academic_year_status: ["planned", "active", "closed"],
      admission_status: ["new", "under_review", "accepted", "rejected", "waiting", "enrolled"],
      case_priority: ["low", "medium", "high", "urgent"],
      case_status: ["new", "under_review", "in_progress", "resolved", "closed", "rejected"],
      case_type: ["complaint", "note", "incident", "feedback"],
      app_role: [
        "super_admin",
        "school_owner",
        "school_manager",
        "accountant",
        "registrar",
        "hr",
        "teacher",
        "store_keeper",
      ],
      asset_condition: ["excellent", "good", "fair", "poor"],
      asset_event_type: [
        "registered",
        "assigned",
        "transferred",
        "returned",
        "maintenance",
        "damaged",
        "retired",
      ],
      asset_status: ["active", "assigned", "under_maintenance", "damaged", "retired"],
      cost_center_type: ["school", "stage", "department", "custom"],
      discount_type: ["percentage", "fixed"],
      employee_status: ["active", "inactive", "on_leave", "terminated"],
      employment_type: ["full_time", "part_time", "contract", "temporary"],
      enrollment_status: ["active", "pending", "completed", "withdrawn", "transferred"],
      expense_status: ["recorded", "cancelled"],
      gender: ["male", "female"],
      installment_status: ["upcoming", "due", "partial", "paid", "overdue"],
      inventory_movement_type: [
        "opening_balance",
        "stock_in",
        "stock_out",
        "adjustment_in",
        "adjustment_out",
      ],
      member_status: ["active", "invited", "suspended"],
      payment_method: ["cash", "bank_transfer", "card", "other"],
      payment_status: ["completed", "pending", "cancelled", "refunded"],
      school_status: ["active", "suspended", "archived"],
      staff_attendance_status: ["present", "absent", "late", "leave"],
      structure_status: ["active", "archived"],
      student_attendance_status: ["present", "absent", "late", "excused"],
      student_fee_status: ["unpaid", "partial", "paid", "overdue", "waived", "cancelled"],
      student_status: ["active", "new", "suspended", "withdrawn", "transferred", "graduated"],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: ["open", "in_progress", "completed", "cancelled"],
    },
  },
} as const;
