export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_goals: {
        Row: {
          agent_id: string
          created_at: string | null
          current_value: number | null
          ended_at: string
          id: string
          metric: Database["public"]["Enums"]["goal_metric"]
          period: Database["public"]["Enums"]["goal_period"]
          started_at: string
          status: Database["public"]["Enums"]["goal_status"]
          target_value: number
          tenant_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string | null
          current_value?: number | null
          ended_at: string
          id?: string
          metric: Database["public"]["Enums"]["goal_metric"]
          period?: Database["public"]["Enums"]["goal_period"]
          started_at: string
          status?: Database["public"]["Enums"]["goal_status"]
          target_value: number
          tenant_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string | null
          current_value?: number | null
          ended_at?: string
          id?: string
          metric?: Database["public"]["Enums"]["goal_metric"]
          period?: Database["public"]["Enums"]["goal_period"]
          started_at?: string
          status?: Database["public"]["Enums"]["goal_status"]
          target_value?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_goals_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_goals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      call_responses: {
        Row: {
          agent_id: string
          ai_suggestion: string | null
          ai_summary: string | null
          client_id: string
          created_at: string | null
          duration_seconds: number | null
          id: string
          responses: Json | null
          result: string | null
          script_id: string | null
          tenant_id: string
        }
        Insert: {
          agent_id: string
          ai_suggestion?: string | null
          ai_summary?: string | null
          client_id: string
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          responses?: Json | null
          result?: string | null
          script_id?: string | null
          tenant_id: string
        }
        Update: {
          agent_id?: string
          ai_suggestion?: string | null
          ai_summary?: string | null
          client_id?: string
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          responses?: Json | null
          result?: string | null
          script_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_responses_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_responses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_responses_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "call_scripts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_responses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      call_scripts: {
        Row: {
          created_at: string | null
          id: string
          intro_text: string | null
          is_active: boolean | null
          outro_text: string | null
          pipeline_stage: string
          questions: Json | null
          tenant_id: string
          title: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          intro_text?: string | null
          is_active?: boolean | null
          outro_text?: string | null
          pipeline_stage: string
          questions?: Json | null
          tenant_id: string
          title: string
        }
        Update: {
          created_at?: string | null
          id?: string
          intro_text?: string | null
          is_active?: boolean | null
          outro_text?: string | null
          pipeline_stage?: string
          questions?: Json | null
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_scripts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      charges: {
        Row: {
          amount: number
          charge_date: string | null
          client_id: string
          created_at: string | null
          doc_url: string | null
          id: string
          label: string
          sale_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
          tenant_id: string
          type: Database["public"]["Enums"]["charge_type"]
        }
        Insert: {
          amount: number
          charge_date?: string | null
          client_id: string
          created_at?: string | null
          doc_url?: string | null
          id?: string
          label: string
          sale_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          tenant_id: string
          type?: Database["public"]["Enums"]["charge_type"]
        }
        Update: {
          amount?: number
          charge_date?: string | null
          client_id?: string
          created_at?: string | null
          doc_url?: string | null
          id?: string
          label?: string
          sale_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          tenant_id?: string
          type?: Database["public"]["Enums"]["charge_type"]
        }
        Relationships: [
          {
            foreignKeyName: "charges_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          agent_id: string | null
          birth_date: string | null
          cin_doc_url: string | null
          cin_verified: boolean | null
          client_type: Database["public"]["Enums"]["client_type"] | null
          confirmed_budget: number | null
          created_at: string | null
          desired_unit_types: string[] | null
          email: string | null
          full_name: string
          id: string
          interest_level: Database["public"]["Enums"]["interest_level"] | null
          interested_projects: string[] | null
          is_priority: boolean | null
          last_contact_at: string | null
          nationality: string | null
          nin_cin: string | null
          notes: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          phone: string
          pipeline_stage: Database["public"]["Enums"]["pipeline_stage"]
          profession: string | null
          source: Database["public"]["Enums"]["client_source"]
          tenant_id: string
          visit_feedback: string | null
          visit_note: number | null
        }
        Insert: {
          address?: string | null
          agent_id?: string | null
          birth_date?: string | null
          cin_doc_url?: string | null
          cin_verified?: boolean | null
          client_type?: Database["public"]["Enums"]["client_type"] | null
          confirmed_budget?: number | null
          created_at?: string | null
          desired_unit_types?: string[] | null
          email?: string | null
          full_name: string
          id?: string
          interest_level?: Database["public"]["Enums"]["interest_level"] | null
          interested_projects?: string[] | null
          is_priority?: boolean | null
          last_contact_at?: string | null
          nationality?: string | null
          nin_cin?: string | null
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          phone: string
          pipeline_stage?: Database["public"]["Enums"]["pipeline_stage"]
          profession?: string | null
          source: Database["public"]["Enums"]["client_source"]
          tenant_id: string
          visit_feedback?: string | null
          visit_note?: number | null
        }
        Update: {
          address?: string | null
          agent_id?: string | null
          birth_date?: string | null
          cin_doc_url?: string | null
          cin_verified?: boolean | null
          client_type?: Database["public"]["Enums"]["client_type"] | null
          confirmed_budget?: number | null
          created_at?: string | null
          desired_unit_types?: string[] | null
          email?: string | null
          full_name?: string
          id?: string
          interest_level?: Database["public"]["Enums"]["interest_level"] | null
          interested_projects?: string[] | null
          is_priority?: boolean | null
          last_contact_at?: string | null
          nationality?: string | null
          nin_cin?: string | null
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          phone?: string
          pipeline_stage?: Database["public"]["Enums"]["pipeline_stage"]
          profession?: string | null
          source?: Database["public"]["Enums"]["client_source"]
          tenant_id?: string
          visit_feedback?: string | null
          visit_note?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_templates: {
        Row: {
          content: string
          id: string
          tenant_id: string
          type: Database["public"]["Enums"]["doc_type"]
          updated_at: string | null
        }
        Insert: {
          content?: string
          id?: string
          tenant_id: string
          type: Database["public"]["Enums"]["doc_type"]
          updated_at?: string | null
        }
        Update: {
          content?: string
          id?: string
          tenant_id?: string
          type?: Database["public"]["Enums"]["doc_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          client_id: string
          created_at: string | null
          generated_at: string | null
          id: string
          name: string
          sale_id: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["doc_type"]
          url: string
        }
        Insert: {
          client_id: string
          created_at?: string | null
          generated_at?: string | null
          id?: string
          name: string
          sale_id?: string | null
          tenant_id: string
          type?: Database["public"]["Enums"]["doc_type"]
          url: string
        }
        Update: {
          client_id?: string
          created_at?: string | null
          generated_at?: string | null
          id?: string
          name?: string
          sale_id?: string | null
          tenant_id?: string
          type?: Database["public"]["Enums"]["doc_type"]
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      history: {
        Row: {
          agent_id: string | null
          client_id: string
          created_at: string | null
          description: string | null
          id: string
          metadata: Json | null
          tenant_id: string
          title: string
          type: Database["public"]["Enums"]["history_type"]
        }
        Insert: {
          agent_id?: string | null
          client_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          tenant_id: string
          title: string
          type: Database["public"]["Enums"]["history_type"]
        }
        Update: {
          agent_id?: string | null
          client_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          tenant_id?: string
          title?: string
          type?: Database["public"]["Enums"]["history_type"]
        }
        Relationships: [
          {
            foreignKeyName: "history_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_page_sections: {
        Row: {
          content: Json | null
          created_at: string | null
          id: string
          is_visible: boolean | null
          page_id: string
          sort_order: number | null
          title: string | null
          type: string
        }
        Insert: {
          content?: Json | null
          created_at?: string | null
          id?: string
          is_visible?: boolean | null
          page_id: string
          sort_order?: number | null
          title?: string | null
          type: string
        }
        Update: {
          content?: Json | null
          created_at?: string | null
          id?: string
          is_visible?: boolean | null
          page_id?: string
          sort_order?: number | null
          title?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "landing_page_sections_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "landing_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_pages: {
        Row: {
          ab_test_group: string | null
          accent_color: string | null
          cover_image_url: string | null
          created_at: string | null
          custom_head_scripts: string | null
          default_agent_id: string | null
          default_source: string | null
          description: string | null
          distribution_mode: string | null
          form_fields: Json | null
          google_api_secret: string | null
          google_measurement_id: string | null
          google_tag_id: string | null
          id: string
          is_active: boolean | null
          language: string | null
          last_assigned_agent_idx: number | null
          meta_access_token: string | null
          meta_pixel_id: string | null
          meta_test_event_code: string | null
          og_image_url: string | null
          project_id: string | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          submissions_count: number | null
          tenant_id: string
          tiktok_access_token: string | null
          tiktok_pixel_id: string | null
          title: string
          updated_at: string | null
          variant: string | null
          views_count: number | null
        }
        Insert: {
          ab_test_group?: string | null
          accent_color?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          custom_head_scripts?: string | null
          default_agent_id?: string | null
          default_source?: string | null
          description?: string | null
          distribution_mode?: string | null
          form_fields?: Json | null
          google_api_secret?: string | null
          google_measurement_id?: string | null
          google_tag_id?: string | null
          id?: string
          is_active?: boolean | null
          language?: string | null
          last_assigned_agent_idx?: number | null
          meta_access_token?: string | null
          meta_pixel_id?: string | null
          meta_test_event_code?: string | null
          og_image_url?: string | null
          project_id?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          submissions_count?: number | null
          tenant_id: string
          tiktok_access_token?: string | null
          tiktok_pixel_id?: string | null
          title: string
          updated_at?: string | null
          variant?: string | null
          views_count?: number | null
        }
        Update: {
          ab_test_group?: string | null
          accent_color?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          custom_head_scripts?: string | null
          default_agent_id?: string | null
          default_source?: string | null
          description?: string | null
          distribution_mode?: string | null
          form_fields?: Json | null
          google_api_secret?: string | null
          google_measurement_id?: string | null
          google_tag_id?: string | null
          id?: string
          is_active?: boolean | null
          language?: string | null
          last_assigned_agent_idx?: number | null
          meta_access_token?: string | null
          meta_pixel_id?: string | null
          meta_test_event_code?: string | null
          og_image_url?: string | null
          project_id?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          submissions_count?: number | null
          tenant_id?: string
          tiktok_access_token?: string | null
          tiktok_pixel_id?: string | null
          title?: string
          updated_at?: string | null
          variant?: string | null
          views_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "landing_pages_default_agent_id_fkey"
            columns: ["default_agent_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landing_pages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landing_pages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          message: string | null
          metadata: Json | null
          read: boolean | null
          tenant_id: string
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          message?: string | null
          metadata?: Json | null
          read?: boolean | null
          tenant_id: string
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string | null
          metadata?: Json | null
          read?: boolean | null
          tenant_id?: string
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_schedules: {
        Row: {
          amount: number
          created_at: string | null
          description: string | null
          due_date: string
          id: string
          installment_number: number
          paid_at: string | null
          sale_id: string
          status: Database["public"]["Enums"]["payment_status"]
          tenant_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          description?: string | null
          due_date: string
          id?: string
          installment_number: number
          paid_at?: string | null
          sale_id: string
          status?: Database["public"]["Enums"]["payment_status"]
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          description?: string | null
          due_date?: string
          id?: string
          installment_number?: number
          paid_at?: string | null
          sale_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_schedules_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_schedules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          id: string
          maintenance_mode: boolean | null
          platform_name: string | null
          support_email: string | null
          updated_at: string | null
          version: string | null
        }
        Insert: {
          id?: string
          maintenance_mode?: boolean | null
          platform_name?: string | null
          support_email?: string | null
          updated_at?: string | null
          version?: string | null
        }
        Update: {
          id?: string
          maintenance_mode?: boolean | null
          platform_name?: string | null
          support_email?: string | null
          updated_at?: string | null
          version?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          avg_price_per_unit: number | null
          code: string
          cover_url: string | null
          created_at: string | null
          delivery_date: string | null
          description: string | null
          gallery_urls: string[] | null
          id: string
          location: string | null
          name: string
          status: Database["public"]["Enums"]["project_status"]
          tenant_id: string
        }
        Insert: {
          avg_price_per_unit?: number | null
          code: string
          cover_url?: string | null
          created_at?: string | null
          delivery_date?: string | null
          description?: string | null
          gallery_urls?: string[] | null
          id?: string
          location?: string | null
          name: string
          status?: Database["public"]["Enums"]["project_status"]
          tenant_id: string
        }
        Update: {
          avg_price_per_unit?: number | null
          code?: string
          cover_url?: string | null
          created_at?: string | null
          delivery_date?: string | null
          description?: string | null
          gallery_urls?: string[] | null
          id?: string
          location?: string | null
          name?: string
          status?: Database["public"]["Enums"]["project_status"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          agent_id: string
          client_id: string
          created_at: string | null
          deposit_amount: number | null
          deposit_method: Database["public"]["Enums"]["deposit_method"] | null
          deposit_reference: string | null
          duration_days: number
          expires_at: string
          id: string
          nin_cin: string
          project_id: string
          status: Database["public"]["Enums"]["reservation_status"]
          tenant_id: string
          unit_id: string
        }
        Insert: {
          agent_id: string
          client_id: string
          created_at?: string | null
          deposit_amount?: number | null
          deposit_method?: Database["public"]["Enums"]["deposit_method"] | null
          deposit_reference?: string | null
          duration_days?: number
          expires_at: string
          id?: string
          nin_cin: string
          project_id: string
          status?: Database["public"]["Enums"]["reservation_status"]
          tenant_id: string
          unit_id: string
        }
        Update: {
          agent_id?: string
          client_id?: string
          created_at?: string | null
          deposit_amount?: number | null
          deposit_method?: Database["public"]["Enums"]["deposit_method"] | null
          deposit_reference?: string | null
          duration_days?: number
          expires_at?: string
          id?: string
          nin_cin?: string
          project_id?: string
          status?: Database["public"]["Enums"]["reservation_status"]
          tenant_id?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_amenities: {
        Row: {
          created_at: string | null
          description: string
          id: string
          price: number
          sale_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          description: string
          id?: string
          price?: number
          sale_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          description?: string
          id?: string
          price?: number
          sale_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_amenities_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_amenities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          agent_id: string
          client_id: string
          created_at: string | null
          delivery_date: string | null
          discount_type: Database["public"]["Enums"]["discount_type"] | null
          discount_value: number | null
          final_price: number
          financing_mode: Database["public"]["Enums"]["financing_mode"]
          id: string
          internal_notes: string | null
          project_id: string
          reservation_id: string | null
          status: Database["public"]["Enums"]["sale_status"]
          tenant_id: string
          total_price: number
          unit_id: string
        }
        Insert: {
          agent_id: string
          client_id: string
          created_at?: string | null
          delivery_date?: string | null
          discount_type?: Database["public"]["Enums"]["discount_type"] | null
          discount_value?: number | null
          final_price: number
          financing_mode?: Database["public"]["Enums"]["financing_mode"]
          id?: string
          internal_notes?: string | null
          project_id: string
          reservation_id?: string | null
          status?: Database["public"]["Enums"]["sale_status"]
          tenant_id: string
          total_price: number
          unit_id: string
        }
        Update: {
          agent_id?: string
          client_id?: string
          created_at?: string | null
          delivery_date?: string | null
          discount_type?: Database["public"]["Enums"]["discount_type"] | null
          discount_value?: number | null
          final_price?: number
          financing_mode?: Database["public"]["Enums"]["financing_mode"]
          id?: string
          internal_notes?: string | null
          project_id?: string
          reservation_id?: string | null
          status?: Database["public"]["Enums"]["sale_status"]
          tenant_id?: string
          total_price?: number
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admin_logs: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          super_admin_id: string
          tenant_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          super_admin_id: string
          tenant_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          super_admin_id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "super_admin_logs_super_admin_id_fkey"
            columns: ["super_admin_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "super_admin_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          agent_id: string | null
          client_id: string
          created_at: string | null
          due_at: string | null
          id: string
          status: Database["public"]["Enums"]["task_status"]
          tenant_id: string
          title: string
          type: Database["public"]["Enums"]["task_type"]
        }
        Insert: {
          agent_id?: string | null
          client_id: string
          created_at?: string | null
          due_at?: string | null
          id?: string
          status?: Database["public"]["Enums"]["task_status"]
          tenant_id: string
          title: string
          type?: Database["public"]["Enums"]["task_type"]
        }
        Update: {
          agent_id?: string | null
          client_id?: string
          created_at?: string | null
          due_at?: string | null
          id?: string
          status?: Database["public"]["Enums"]["task_status"]
          tenant_id?: string
          title?: string
          type?: Database["public"]["Enums"]["task_type"]
        }
        Relationships: [
          {
            foreignKeyName: "tasks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_settings: {
        Row: {
          id: string
          language: string | null
          min_deposit_amount: number | null
          notif_agent_inactive: boolean | null
          notif_goal_achieved: boolean | null
          notif_new_client: boolean | null
          notif_new_sale: boolean | null
          notif_payment_late: boolean | null
          notif_reservation_expired: boolean | null
          relaunch_alert_days: number | null
          reservation_duration_days: number | null
          tenant_id: string
          updated_at: string | null
          urgent_alert_days: number | null
        }
        Insert: {
          id?: string
          language?: string | null
          min_deposit_amount?: number | null
          notif_agent_inactive?: boolean | null
          notif_goal_achieved?: boolean | null
          notif_new_client?: boolean | null
          notif_new_sale?: boolean | null
          notif_payment_late?: boolean | null
          notif_reservation_expired?: boolean | null
          relaunch_alert_days?: number | null
          reservation_duration_days?: number | null
          tenant_id: string
          updated_at?: string | null
          urgent_alert_days?: number | null
        }
        Update: {
          id?: string
          language?: string | null
          min_deposit_amount?: number | null
          notif_agent_inactive?: boolean | null
          notif_goal_achieved?: boolean | null
          notif_new_client?: boolean | null
          notif_new_sale?: boolean | null
          notif_payment_late?: boolean | null
          notif_reservation_expired?: boolean | null
          relaunch_alert_days?: number | null
          reservation_duration_days?: number | null
          tenant_id?: string
          updated_at?: string | null
          urgent_alert_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          address: string | null
          created_at: string | null
          email: string | null
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          website: string | null
          wilaya: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          website?: string | null
          wilaya?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          website?: string | null
          wilaya?: string | null
        }
        Relationships: []
      }
      units: {
        Row: {
          agent_id: string | null
          building: string | null
          client_id: string | null
          code: string
          created_at: string | null
          delivery_date: string | null
          floor: number | null
          id: string
          plan_2d_url: string | null
          price: number | null
          project_id: string
          status: Database["public"]["Enums"]["unit_status"]
          subtype: Database["public"]["Enums"]["unit_subtype"] | null
          surface: number | null
          tenant_id: string
          type: Database["public"]["Enums"]["unit_type"]
        }
        Insert: {
          agent_id?: string | null
          building?: string | null
          client_id?: string | null
          code: string
          created_at?: string | null
          delivery_date?: string | null
          floor?: number | null
          id?: string
          plan_2d_url?: string | null
          price?: number | null
          project_id: string
          status?: Database["public"]["Enums"]["unit_status"]
          subtype?: Database["public"]["Enums"]["unit_subtype"] | null
          surface?: number | null
          tenant_id: string
          type?: Database["public"]["Enums"]["unit_type"]
        }
        Update: {
          agent_id?: string | null
          building?: string | null
          client_id?: string | null
          code?: string
          created_at?: string | null
          delivery_date?: string | null
          floor?: number | null
          id?: string
          plan_2d_url?: string | null
          price?: number | null
          project_id?: string
          status?: Database["public"]["Enums"]["unit_status"]
          subtype?: Database["public"]["Enums"]["unit_subtype"] | null
          surface?: number | null
          tenant_id?: string
          type?: Database["public"]["Enums"]["unit_type"]
        }
        Relationships: [
          {
            foreignKeyName: "fk_units_client"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string | null
          email: string
          first_name: string
          id: string
          last_activity: string | null
          last_name: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["user_status"]
          tenant_id: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          first_name: string
          id: string
          last_activity?: string | null
          last_name: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          tenant_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          first_name?: string
          id?: string
          last_activity?: string | null
          last_name?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          agent_id: string
          client_id: string
          created_at: string | null
          id: string
          notes: string | null
          project_id: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["visit_status"]
          tenant_id: string
          visit_type: Database["public"]["Enums"]["visit_type"]
        }
        Insert: {
          agent_id: string
          client_id: string
          created_at?: string | null
          id?: string
          notes?: string | null
          project_id?: string | null
          scheduled_at: string
          status?: Database["public"]["Enums"]["visit_status"]
          tenant_id: string
          visit_type?: Database["public"]["Enums"]["visit_type"]
        }
        Update: {
          agent_id?: string
          client_id?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          project_id?: string | null
          scheduled_at?: string
          status?: Database["public"]["Enums"]["visit_status"]
          tenant_id?: string
          visit_type?: Database["public"]["Enums"]["visit_type"]
        }
        Relationships: [
          {
            foreignKeyName: "visits_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_my_tenant_id: { Args: never; Returns: string }
      get_user_role: { Args: never; Returns: string }
      get_user_tenant_id: { Args: never; Returns: string }
      is_super_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      charge_type:
        | "notaire"
        | "agence"
        | "promotion"
        | "enregistrement"
        | "autre"
      client_source:
        | "facebook_ads"
        | "google_ads"
        | "instagram_ads"
        | "appel_entrant"
        | "reception"
        | "bouche_a_oreille"
        | "reference_client"
        | "site_web"
        | "portail_immobilier"
        | "autre"
      client_type: "individual" | "company"
      deposit_method: "cash" | "bank_transfer" | "cheque"
      discount_type: "percentage" | "fixed"
      doc_type:
        | "contrat_vente"
        | "echeancier"
        | "bon_reservation"
        | "cin"
        | "autre"
      financing_mode: "comptant" | "credit" | "mixte"
      goal_metric:
        | "sales_count"
        | "reservations_count"
        | "visits_count"
        | "revenue"
        | "new_clients"
        | "conversion_rate"
      goal_period: "monthly" | "quarterly" | "yearly"
      goal_status: "in_progress" | "achieved" | "exceeded" | "not_achieved"
      history_type:
        | "stage_change"
        | "visit_planned"
        | "visit_confirmed"
        | "visit_completed"
        | "call"
        | "whatsapp_call"
        | "whatsapp_message"
        | "sms"
        | "email"
        | "reservation"
        | "sale"
        | "payment"
        | "document"
        | "note"
        | "ai_task"
      interest_level: "low" | "medium" | "high"
      payment_method: "comptant" | "credit" | "lpp" | "aadl" | "mixte"
      payment_status: "pending" | "paid" | "late"
      pipeline_stage:
        | "accueil"
        | "visite_a_gerer"
        | "visite_confirmee"
        | "visite_terminee"
        | "negociation"
        | "reservation"
        | "vente"
        | "relancement"
        | "perdue"
      project_status: "active" | "inactive" | "archived"
      reservation_status: "active" | "expired" | "cancelled" | "converted"
      sale_status: "active" | "cancelled"
      task_status: "pending" | "done" | "ignored"
      task_type: "ai_generated" | "manual"
      unit_status: "available" | "reserved" | "sold" | "blocked"
      unit_subtype: "F2" | "F3" | "F4" | "F5" | "F6"
      unit_type: "apartment" | "local" | "villa" | "parking"
      user_role: "super_admin" | "admin" | "agent"
      user_status: "active" | "inactive"
      visit_status:
        | "planned"
        | "confirmed"
        | "completed"
        | "cancelled"
        | "rescheduled"
      visit_type: "on_site" | "office" | "virtual"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      charge_type: [
        "notaire",
        "agence",
        "promotion",
        "enregistrement",
        "autre",
      ],
      client_source: [
        "facebook_ads",
        "google_ads",
        "instagram_ads",
        "appel_entrant",
        "reception",
        "bouche_a_oreille",
        "reference_client",
        "site_web",
        "portail_immobilier",
        "autre",
      ],
      client_type: ["individual", "company"],
      deposit_method: ["cash", "bank_transfer", "cheque"],
      discount_type: ["percentage", "fixed"],
      doc_type: [
        "contrat_vente",
        "echeancier",
        "bon_reservation",
        "cin",
        "autre",
      ],
      financing_mode: ["comptant", "credit", "mixte"],
      goal_metric: [
        "sales_count",
        "reservations_count",
        "visits_count",
        "revenue",
        "new_clients",
        "conversion_rate",
      ],
      goal_period: ["monthly", "quarterly", "yearly"],
      goal_status: ["in_progress", "achieved", "exceeded", "not_achieved"],
      history_type: [
        "stage_change",
        "visit_planned",
        "visit_confirmed",
        "visit_completed",
        "call",
        "whatsapp_call",
        "whatsapp_message",
        "sms",
        "email",
        "reservation",
        "sale",
        "payment",
        "document",
        "note",
        "ai_task",
      ],
      interest_level: ["low", "medium", "high"],
      payment_method: ["comptant", "credit", "lpp", "aadl", "mixte"],
      payment_status: ["pending", "paid", "late"],
      pipeline_stage: [
        "accueil",
        "visite_a_gerer",
        "visite_confirmee",
        "visite_terminee",
        "negociation",
        "reservation",
        "vente",
        "relancement",
        "perdue",
      ],
      project_status: ["active", "inactive", "archived"],
      reservation_status: ["active", "expired", "cancelled", "converted"],
      sale_status: ["active", "cancelled"],
      task_status: ["pending", "done", "ignored"],
      task_type: ["ai_generated", "manual"],
      unit_status: ["available", "reserved", "sold", "blocked"],
      unit_subtype: ["F2", "F3", "F4", "F5", "F6"],
      unit_type: ["apartment", "local", "villa", "parking"],
      user_role: ["super_admin", "admin", "agent"],
      user_status: ["active", "inactive"],
      visit_status: [
        "planned",
        "confirmed",
        "completed",
        "cancelled",
        "rescheduled",
      ],
      visit_type: ["on_site", "office", "virtual"],
    },
  },
} as const

