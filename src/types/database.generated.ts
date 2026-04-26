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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_goals_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
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
      ai_tasks: {
        Row: {
          accepted_at: string | null
          assigned_to: string | null
          auto_execute: boolean | null
          channel: string | null
          client_file_id: string | null
          client_id: string | null
          created_at: string
          executed_at: string | null
          expires_at: string | null
          id: string
          message_draft: string | null
          message_final: string | null
          metadata: Json | null
          previewed_at: string | null
          priority: string
          rejected_at: string | null
          rejection_reason: string | null
          scheduled_for: string | null
          status: string
          task_type: string
          tenant_id: string
          title: string
          trigger_event: string | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          assigned_to?: string | null
          auto_execute?: boolean | null
          channel?: string | null
          client_file_id?: string | null
          client_id?: string | null
          created_at?: string
          executed_at?: string | null
          expires_at?: string | null
          id?: string
          message_draft?: string | null
          message_final?: string | null
          metadata?: Json | null
          previewed_at?: string | null
          priority?: string
          rejected_at?: string | null
          rejection_reason?: string | null
          scheduled_for?: string | null
          status?: string
          task_type: string
          tenant_id: string
          title: string
          trigger_event?: string | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          assigned_to?: string | null
          auto_execute?: boolean | null
          channel?: string | null
          client_file_id?: string | null
          client_id?: string | null
          created_at?: string
          executed_at?: string | null
          expires_at?: string | null
          id?: string
          message_draft?: string | null
          message_final?: string | null
          metadata?: Json | null
          previewed_at?: string | null
          priority?: string
          rejected_at?: string | null
          rejection_reason?: string | null
          scheduled_for?: string | null
          status?: string
          task_type?: string
          tenant_id?: string
          title?: string
          trigger_event?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ai_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_tasks_client_file_id_fkey"
            columns: ["client_file_id"]
            isOneToOne: false
            referencedRelation: "client_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      amenagement_categories: {
        Row: {
          created_at: string
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          name: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "amenagement_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      amenagement_options: {
        Row: {
          category_id: string | null
          created_at: string
          default_unit_price: number | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          tenant_id: string
          unit_of_measure: string | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          default_unit_price?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          tenant_id: string
          unit_of_measure?: string | null
        }
        Update: {
          category_id?: string | null
          created_at?: string
          default_unit_price?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          tenant_id?: string
          unit_of_measure?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "amenagement_options_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "amenagement_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amenagement_options_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          key_hash: string
          last_used_at: string | null
          name: string
          prefix: string
          revoked_at: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash: string
          last_used_at?: string | null
          name: string
          prefix: string
          revoked_at?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash?: string
          last_used_at?: string | null
          name?: string
          prefix?: string
          revoked_at?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "api_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_trail: {
        Row: {
          action: string
          created_at: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string
          table_name: string
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id: string
          table_name: string
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string
          table_name?: string
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_trail_tenant_id_fkey"
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_responses_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
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
          conditions: Json | null
          created_at: string | null
          field_mapping: Json | null
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
          conditions?: Json | null
          created_at?: string | null
          field_mapping?: Json | null
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
          conditions?: Json | null
          created_at?: string | null
          field_mapping?: Json | null
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
      changelogs: {
        Row: {
          body: string
          id: string
          published_at: string | null
          title: string
          version: string
        }
        Insert: {
          body: string
          id?: string
          published_at?: string | null
          title: string
          version: string
        }
        Update: {
          body?: string
          id?: string
          published_at?: string | null
          title?: string
          version?: string
        }
        Relationships: []
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
      client_files: {
        Row: {
          assigned_to: string | null
          client_id: string
          created_at: string
          created_by: string | null
          current_stage: Database["public"]["Enums"]["pipeline_stage"]
          id: string
          notes: string | null
          project_id: string | null
          stage_changed_at: string | null
          status: Database["public"]["Enums"]["client_file_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          current_stage?: Database["public"]["Enums"]["pipeline_stage"]
          id?: string
          notes?: string | null
          project_id?: string | null
          stage_changed_at?: string | null
          status?: Database["public"]["Enums"]["client_file_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          current_stage?: Database["public"]["Enums"]["pipeline_stage"]
          id?: string
          notes?: string | null
          project_id?: string | null
          stage_changed_at?: string | null
          status?: Database["public"]["Enums"]["client_file_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_files_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_files_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "client_files_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_files_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_files_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_files_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "client_files_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_files_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      client_interactions: {
        Row: {
          client_file_id: string | null
          client_id: string | null
          content: string | null
          created_at: string
          created_by: string | null
          id: string
          interaction_type: Database["public"]["Enums"]["interaction_type"]
          metadata: Json | null
          subject: string | null
          tenant_id: string
        }
        Insert: {
          client_file_id?: string | null
          client_id?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          interaction_type: Database["public"]["Enums"]["interaction_type"]
          metadata?: Json | null
          subject?: string | null
          tenant_id: string
        }
        Update: {
          client_file_id?: string | null
          client_id?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          interaction_type?: Database["public"]["Enums"]["interaction_type"]
          metadata?: Json | null
          subject?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_interactions_client_file_id_fkey"
            columns: ["client_file_id"]
            isOneToOne: false
            referencedRelation: "client_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_interactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_interactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_interactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "client_interactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_interactions_tenant_id_fkey"
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
          cin_nin: string | null
          cin_verified: boolean | null
          city: string | null
          client_type: Database["public"]["Enums"]["client_type"] | null
          confirmed_budget: number | null
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          desired_unit_types: string[] | null
          email: string | null
          full_name: string
          id: string
          id_card_url: string | null
          id_card_verified: boolean | null
          interest_level: Database["public"]["Enums"]["interest_level"] | null
          interested_projects: string[] | null
          is_priority: boolean | null
          last_contact_at: string | null
          name: string | null
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
          cin_nin?: string | null
          cin_verified?: boolean | null
          city?: string | null
          client_type?: Database["public"]["Enums"]["client_type"] | null
          confirmed_budget?: number | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          desired_unit_types?: string[] | null
          email?: string | null
          full_name: string
          id?: string
          id_card_url?: string | null
          id_card_verified?: boolean | null
          interest_level?: Database["public"]["Enums"]["interest_level"] | null
          interested_projects?: string[] | null
          is_priority?: boolean | null
          last_contact_at?: string | null
          name?: string | null
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
          cin_nin?: string | null
          cin_verified?: boolean | null
          city?: string | null
          client_type?: Database["public"]["Enums"]["client_type"] | null
          confirmed_budget?: number | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          desired_unit_types?: string[] | null
          email?: string | null
          full_name?: string
          id?: string
          id_card_url?: string | null
          id_card_verified?: boolean | null
          interest_level?: Database["public"]["Enums"]["interest_level"] | null
          interested_projects?: string[] | null
          is_priority?: boolean | null
          last_contact_at?: string | null
          name?: string | null
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
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
          deleted_at: string | null
          deleted_by: string | null
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
          deleted_at?: string | null
          deleted_by?: string | null
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
          deleted_at?: string | null
          deleted_by?: string | null
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
      email_campaign_recipients: {
        Row: {
          campaign_id: string
          clicked_at: string | null
          client_id: string | null
          email: string
          full_name: string | null
          id: string
          opened_at: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          campaign_id: string
          clicked_at?: string | null
          client_id?: string | null
          email: string
          full_name?: string | null
          id?: string
          opened_at?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string
          clicked_at?: string | null
          client_id?: string | null
          email?: string
          full_name?: string | null
          id?: string
          opened_at?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaign_recipients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaigns: {
        Row: {
          created_at: string
          id: string
          name: string
          scheduled_at: string | null
          segment_rules: Json
          sent_at: string | null
          status: string
          subject: string
          template_id: string | null
          tenant_id: string
          total_clicked: number
          total_opened: number
          total_recipients: number
          total_sent: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          scheduled_at?: string | null
          segment_rules?: Json
          sent_at?: string | null
          status?: string
          subject: string
          template_id?: string | null
          tenant_id: string
          total_clicked?: number
          total_opened?: number
          total_recipients?: number
          total_sent?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          scheduled_at?: string | null
          segment_rules?: Json
          sent_at?: string | null
          status?: string
          subject?: string
          template_id?: string | null
          tenant_id?: string
          total_clicked?: number
          total_opened?: number
          total_recipients?: number
          total_sent?: number
        }
        Relationships: [
          {
            foreignKeyName: "email_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_marketing_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaigns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_events: {
        Row: {
          campaign_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          recipient_id: string | null
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          recipient_id?: string | null
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          recipient_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_events_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "email_campaign_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: string
          metadata: Json | null
          resend_id: string | null
          status: string | null
          subject: string
          template_slug: string | null
          tenant_id: string | null
          to_email: string
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          resend_id?: string | null
          status?: string | null
          subject: string
          template_slug?: string | null
          tenant_id?: string | null
          to_email: string
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          resend_id?: string | null
          status?: string | null
          subject?: string
          template_slug?: string | null
          tenant_id?: string | null
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_marketing_templates: {
        Row: {
          blocks: Json
          created_at: string
          html_cache: string | null
          id: string
          name: string
          subject: string
          tenant_id: string
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          blocks?: Json
          created_at?: string
          html_cache?: string | null
          id?: string
          name: string
          subject?: string
          tenant_id: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          blocks?: Json
          created_at?: string
          html_cache?: string | null
          id?: string
          name?: string
          subject?: string
          tenant_id?: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_marketing_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sequence_steps: {
        Row: {
          delay_days: number | null
          id: string
          sequence_id: string
          sort_order: number | null
          template_id: string
        }
        Insert: {
          delay_days?: number | null
          id?: string
          sequence_id: string
          sort_order?: number | null
          template_id: string
        }
        Update: {
          delay_days?: number | null
          id?: string
          sequence_id?: string
          sort_order?: number | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_sequence_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "email_sequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sequence_steps_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sequences: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          trigger_event: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          trigger_event: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          trigger_event?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          body_html: string
          category: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          slug: string
          subject: string
          updated_at: string | null
          variables: string[] | null
        }
        Insert: {
          body_html: string
          category?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          slug: string
          subject: string
          updated_at?: string | null
          variables?: string[] | null
        }
        Update: {
          body_html?: string
          category?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          slug?: string
          subject?: string
          updated_at?: string | null
          variables?: string[] | null
        }
        Relationships: []
      }
      history: {
        Row: {
          agent_id: string | null
          client_id: string
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
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
          deleted_at?: string | null
          deleted_by?: string | null
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
          deleted_at?: string | null
          deleted_by?: string | null
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "history_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
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
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          first_name: string | null
          id: string
          invited_by: string | null
          last_name: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          tenant_id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          first_name?: string | null
          id?: string
          invited_by?: string | null
          last_name?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          tenant_id: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          first_name?: string | null
          id?: string
          invited_by?: string | null
          last_name?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          tenant_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          created_at: string | null
          due_date: string | null
          id: string
          paid_at: string | null
          pdf_url: string | null
          period: string
          status: string | null
          tenant_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          due_date?: string | null
          id?: string
          paid_at?: string | null
          pdf_url?: string | null
          period: string
          status?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          due_date?: string | null
          id?: string
          paid_at?: string | null
          pdf_url?: string | null
          period?: string
          status?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_tenant_id_fkey"
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
          custom_questions: Json | null
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
          custom_questions?: Json | null
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
          custom_questions?: Json | null
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landing_pages_default_agent_id_fkey"
            columns: ["default_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
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
      login_attempts: {
        Row: {
          attempted_at: string
          email: string
          id: string
          ip_address: string | null
          success: boolean
          user_agent: string | null
        }
        Insert: {
          attempted_at?: string
          email: string
          id?: string
          ip_address?: string | null
          success?: boolean
          user_agent?: string | null
        }
        Update: {
          attempted_at?: string
          email?: string
          id?: string
          ip_address?: string | null
          success?: boolean
          user_agent?: string | null
        }
        Relationships: []
      }
      marketing_budgets: {
        Row: {
          category: string | null
          created_at: string | null
          id: string
          period: string
          planned_amount: number | null
          tenant_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string
          period: string
          planned_amount?: number | null
          tenant_id: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string
          period?: string
          planned_amount?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_budgets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaigns: {
        Row: {
          created_at: string | null
          end_date: string | null
          id: string
          name: string
          notes: string | null
          planned_budget: number | null
          project_id: string | null
          source: string
          start_date: string
          status: string | null
          target_leads: number | null
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          end_date?: string | null
          id?: string
          name: string
          notes?: string | null
          planned_budget?: number | null
          project_id?: string | null
          source?: string
          start_date: string
          status?: string | null
          target_leads?: number | null
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          end_date?: string | null
          id?: string
          name?: string
          notes?: string | null
          planned_budget?: number | null
          project_id?: string | null
          source?: string
          start_date?: string
          status?: string | null
          target_leads?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaigns_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaigns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_expenses: {
        Row: {
          amount: number
          campaign_id: string | null
          category: string
          created_at: string | null
          expense_date: string
          id: string
          is_recurring: boolean | null
          notes: string | null
          project_id: string | null
          receipt_url: string | null
          recurrence_type: string | null
          subcategory: string | null
          tenant_id: string
        }
        Insert: {
          amount?: number
          campaign_id?: string | null
          category: string
          created_at?: string | null
          expense_date: string
          id?: string
          is_recurring?: boolean | null
          notes?: string | null
          project_id?: string | null
          receipt_url?: string | null
          recurrence_type?: string | null
          subcategory?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          campaign_id?: string | null
          category?: string
          created_at?: string | null
          expense_date?: string
          id?: string
          is_recurring?: boolean | null
          notes?: string | null
          project_id?: string | null
          receipt_url?: string | null
          recurrence_type?: string | null
          subcategory?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_expenses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_expenses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_leads: {
        Row: {
          acquisition_channels: string[] | null
          activity_type: string | null
          agents_count: string | null
          assigned_to: string | null
          campaign: string | null
          company_name: string | null
          created_at: string
          current_tools: string | null
          decision_maker: string | null
          decision_maker_names: string | null
          drip_sent_at: string | null
          email: string
          frustration_score: number | null
          full_name: string
          id: string
          leads_per_month: string | null
          marketing_budget_monthly: string | null
          medium: string | null
          message: string | null
          notes: string | null
          phone: string
          referrer: string | null
          source: string | null
          status: string
          step_completed: number
          timeline: string | null
          updated_at: string
          user_agent: string | null
          wilayas: string[] | null
        }
        Insert: {
          acquisition_channels?: string[] | null
          activity_type?: string | null
          agents_count?: string | null
          assigned_to?: string | null
          campaign?: string | null
          company_name?: string | null
          created_at?: string
          current_tools?: string | null
          decision_maker?: string | null
          decision_maker_names?: string | null
          drip_sent_at?: string | null
          email: string
          frustration_score?: number | null
          full_name: string
          id?: string
          leads_per_month?: string | null
          marketing_budget_monthly?: string | null
          medium?: string | null
          message?: string | null
          notes?: string | null
          phone: string
          referrer?: string | null
          source?: string | null
          status?: string
          step_completed?: number
          timeline?: string | null
          updated_at?: string
          user_agent?: string | null
          wilayas?: string[] | null
        }
        Update: {
          acquisition_channels?: string[] | null
          activity_type?: string | null
          agents_count?: string | null
          assigned_to?: string | null
          campaign?: string | null
          company_name?: string | null
          created_at?: string
          current_tools?: string | null
          decision_maker?: string | null
          decision_maker_names?: string | null
          drip_sent_at?: string | null
          email?: string
          frustration_score?: number | null
          full_name?: string
          id?: string
          leads_per_month?: string | null
          marketing_budget_monthly?: string | null
          medium?: string | null
          message?: string | null
          notes?: string | null
          phone?: string
          referrer?: string | null
          source?: string | null
          status?: string
          step_completed?: number
          timeline?: string | null
          updated_at?: string
          user_agent?: string | null
          wilayas?: string[] | null
        }
        Relationships: []
      }
      message_templates: {
        Row: {
          ai_prompt: string | null
          attached_file_types: string[] | null
          body: string
          channel: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          mode: string | null
          project_id: string | null
          sort_order: number | null
          stage: string
          subject: string | null
          tenant_id: string
          trigger_type: string
          updated_at: string | null
          variables_used: string[] | null
        }
        Insert: {
          ai_prompt?: string | null
          attached_file_types?: string[] | null
          body: string
          channel?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          mode?: string | null
          project_id?: string | null
          sort_order?: number | null
          stage: string
          subject?: string | null
          tenant_id: string
          trigger_type: string
          updated_at?: string | null
          variables_used?: string[] | null
        }
        Update: {
          ai_prompt?: string | null
          attached_file_types?: string[] | null
          body?: string
          channel?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          mode?: string | null
          project_id?: string | null
          sort_order?: number | null
          stage?: string
          subject?: string | null
          tenant_id?: string
          trigger_type?: string
          updated_at?: string | null
          variables_used?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_templates_tenant_id_fkey"
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
          entity_id: string | null
          entity_type: string | null
          expires_at: string | null
          id: string
          is_read: boolean | null
          link: string | null
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
          entity_id?: string | null
          entity_type?: string | null
          expires_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
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
          entity_id?: string | null
          entity_type?: string | null
          expires_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
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
      payment_requests: {
        Row: {
          admin_notes: string | null
          amount_da: number
          billing_cycle: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          expires_at: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          plan: string
          proof_url: string | null
          reference: string | null
          rejected_at: string | null
          rejection_reason: string | null
          requested_by: string | null
          status: Database["public"]["Enums"]["payment_request_status"]
          tenant_id: string
          whatsapp_message_sent: boolean | null
        }
        Insert: {
          admin_notes?: string | null
          amount_da: number
          billing_cycle?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          plan: string
          proof_url?: string | null
          reference?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          requested_by?: string | null
          status?: Database["public"]["Enums"]["payment_request_status"]
          tenant_id: string
          whatsapp_message_sent?: boolean | null
        }
        Update: {
          admin_notes?: string | null
          amount_da?: number
          billing_cycle?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          plan?: string
          proof_url?: string | null
          reference?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          requested_by?: string | null
          status?: Database["public"]["Enums"]["payment_request_status"]
          tenant_id?: string
          whatsapp_message_sent?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_requests_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payment_requests_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payment_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_schedules: {
        Row: {
          amount: number
          amount_declared: number | null
          amount_undeclared: number | null
          created_at: string | null
          description: string | null
          due_date: string
          id: string
          installment_number: number
          modified_by: string | null
          paid_amount: number | null
          paid_at: string | null
          paid_declared: number | null
          paid_undeclared: number | null
          payment_method: string | null
          sale_id: string
          schedule_number: number | null
          status: Database["public"]["Enums"]["payment_status"]
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          amount_declared?: number | null
          amount_undeclared?: number | null
          created_at?: string | null
          description?: string | null
          due_date: string
          id?: string
          installment_number: number
          modified_by?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          paid_declared?: number | null
          paid_undeclared?: number | null
          payment_method?: string | null
          sale_id: string
          schedule_number?: number | null
          status?: Database["public"]["Enums"]["payment_status"]
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          amount_declared?: number | null
          amount_undeclared?: number | null
          created_at?: string | null
          description?: string | null
          due_date?: string
          id?: string
          installment_number?: number
          modified_by?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          paid_declared?: number | null
          paid_undeclared?: number | null
          payment_method?: string | null
          sale_id?: string
          schedule_number?: number | null
          status?: Database["public"]["Enums"]["payment_status"]
          tenant_id?: string
          updated_at?: string | null
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
      permission_profiles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          name: string
          permissions: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          permissions?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          permissions?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_limits: {
        Row: {
          created_at: string | null
          features: Json | null
          max_agents: number
          max_ai_tokens_monthly: number | null
          max_clients: number
          max_projects: number
          max_storage_mb: number
          max_units: number
          max_whatsapp_messages: number
          plan: string
          price_monthly: number | null
          price_yearly: number | null
        }
        Insert: {
          created_at?: string | null
          features?: Json | null
          max_agents: number
          max_ai_tokens_monthly?: number | null
          max_clients: number
          max_projects: number
          max_storage_mb: number
          max_units: number
          max_whatsapp_messages?: number
          plan: string
          price_monthly?: number | null
          price_yearly?: number | null
        }
        Update: {
          created_at?: string | null
          features?: Json | null
          max_agents?: number
          max_ai_tokens_monthly?: number | null
          max_clients?: number
          max_projects?: number
          max_storage_mb?: number
          max_units?: number
          max_whatsapp_messages?: number
          plan?: string
          price_monthly?: number | null
          price_yearly?: number | null
        }
        Relationships: []
      }
      plan_prices: {
        Row: {
          active: boolean | null
          display_order: number | null
          features: Json | null
          label: string
          plan: string
          price_monthly_da: number
          price_yearly_da: number
        }
        Insert: {
          active?: boolean | null
          display_order?: number | null
          features?: Json | null
          label: string
          plan: string
          price_monthly_da?: number
          price_yearly_da?: number
        }
        Update: {
          active?: boolean | null
          display_order?: number | null
          features?: Json | null
          label?: string
          plan?: string
          price_monthly_da?: number
          price_yearly_da?: number
        }
        Relationships: []
      }
      platform_alerts: {
        Row: {
          channel: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          threshold: number | null
          type: string
          webhook_url: string | null
        }
        Insert: {
          channel?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          threshold?: number | null
          type: string
          webhook_url?: string | null
        }
        Update: {
          channel?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          threshold?: number | null
          type?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
      platform_messages: {
        Row: {
          body: string
          created_at: string | null
          from_admin_id: string
          id: string
          read: boolean | null
          subject: string
          to_tenant_id: string | null
        }
        Insert: {
          body: string
          created_at?: string | null
          from_admin_id: string
          id?: string
          read?: boolean | null
          subject: string
          to_tenant_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string | null
          from_admin_id?: string
          id?: string
          read?: boolean | null
          subject?: string
          to_tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_messages_from_admin_id_fkey"
            columns: ["from_admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_messages_from_admin_id_fkey"
            columns: ["from_admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "platform_messages_from_admin_id_fkey"
            columns: ["from_admin_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_messages_to_tenant_id_fkey"
            columns: ["to_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          announcement_banner: string | null
          announcement_type: string | null
          anthropic_api_key: string | null
          bank_account_holder: string | null
          bank_iban: string | null
          bank_name: string | null
          bank_rib: string | null
          bank_swift: string | null
          billing_instructions: string | null
          billing_whatsapp: string | null
          brevo_api_key: string | null
          ccp_account: string | null
          default_ai_provider: string | null
          email_from_address: string | null
          email_from_name: string | null
          email_provider: string | null
          id: string
          maintenance_mode: boolean | null
          openai_api_key: string | null
          platform_name: string | null
          resend_api_key: string | null
          smtp_host: string | null
          smtp_password: string | null
          smtp_port: number | null
          smtp_user: string | null
          support_email: string | null
          updated_at: string | null
          version: string | null
        }
        Insert: {
          announcement_banner?: string | null
          announcement_type?: string | null
          anthropic_api_key?: string | null
          bank_account_holder?: string | null
          bank_iban?: string | null
          bank_name?: string | null
          bank_rib?: string | null
          bank_swift?: string | null
          billing_instructions?: string | null
          billing_whatsapp?: string | null
          brevo_api_key?: string | null
          ccp_account?: string | null
          default_ai_provider?: string | null
          email_from_address?: string | null
          email_from_name?: string | null
          email_provider?: string | null
          id?: string
          maintenance_mode?: boolean | null
          openai_api_key?: string | null
          platform_name?: string | null
          resend_api_key?: string | null
          smtp_host?: string | null
          smtp_password?: string | null
          smtp_port?: number | null
          smtp_user?: string | null
          support_email?: string | null
          updated_at?: string | null
          version?: string | null
        }
        Update: {
          announcement_banner?: string | null
          announcement_type?: string | null
          anthropic_api_key?: string | null
          bank_account_holder?: string | null
          bank_iban?: string | null
          bank_name?: string | null
          bank_rib?: string | null
          bank_swift?: string | null
          billing_instructions?: string | null
          billing_whatsapp?: string | null
          brevo_api_key?: string | null
          ccp_account?: string | null
          default_ai_provider?: string | null
          email_from_address?: string | null
          email_from_name?: string | null
          email_provider?: string | null
          id?: string
          maintenance_mode?: boolean | null
          openai_api_key?: string | null
          platform_name?: string | null
          resend_api_key?: string | null
          smtp_host?: string | null
          smtp_password?: string | null
          smtp_port?: number | null
          smtp_user?: string | null
          support_email?: string | null
          updated_at?: string | null
          version?: string | null
        }
        Relationships: []
      }
      project_files: {
        Row: {
          created_at: string | null
          file_name: string
          file_size: number | null
          file_type: string
          file_url: string
          id: string
          project_id: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          file_name: string
          file_size?: number | null
          file_type: string
          file_url: string
          id?: string
          project_id?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string
          file_url?: string
          id?: string
          project_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_files_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          address: string | null
          avg_price_per_unit: number | null
          budget: number | null
          code: string
          cover_url: string | null
          created_at: string | null
          delivery_date: string | null
          description: string | null
          end_date: string | null
          gallery_urls: string[] | null
          id: string
          image_url: string | null
          is_active: boolean | null
          location: string | null
          name: string
          project_type: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          subsidiary_id: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          avg_price_per_unit?: number | null
          budget?: number | null
          code: string
          cover_url?: string | null
          created_at?: string | null
          delivery_date?: string | null
          description?: string | null
          end_date?: string | null
          gallery_urls?: string[] | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          location?: string | null
          name: string
          project_type?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          subsidiary_id?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          avg_price_per_unit?: number | null
          budget?: number | null
          code?: string
          cover_url?: string | null
          created_at?: string | null
          delivery_date?: string | null
          description?: string | null
          end_date?: string | null
          gallery_urls?: string[] | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          location?: string | null
          name?: string
          project_type?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          subsidiary_id?: string | null
          tenant_id?: string
          updated_at?: string | null
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
      prospects: {
        Row: {
          agent_id: string | null
          converted_client_id: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          name: string
          nin_cin: string | null
          notes: string | null
          phone: string | null
          source: string | null
          status: Database["public"]["Enums"]["prospect_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          converted_client_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          nin_cin?: string | null
          notes?: string | null
          phone?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["prospect_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          converted_client_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          nin_cin?: string | null
          notes?: string | null
          phone?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["prospect_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospects_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospects_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "prospects_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospects_converted_client_id_fkey"
            columns: ["converted_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "prospects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_items: {
        Row: {
          amenagement_option_id: string | null
          created_at: string
          id: string
          item_type: Database["public"]["Enums"]["sale_item_type"]
          parking_id: string | null
          reservation_id: string
          snapshot_declared: number
          snapshot_price: number
          snapshot_undeclared: number
          tenant_id: string
          unit_id: string | null
        }
        Insert: {
          amenagement_option_id?: string | null
          created_at?: string
          id?: string
          item_type: Database["public"]["Enums"]["sale_item_type"]
          parking_id?: string | null
          reservation_id: string
          snapshot_declared?: number
          snapshot_price?: number
          snapshot_undeclared?: number
          tenant_id: string
          unit_id?: string | null
        }
        Update: {
          amenagement_option_id?: string | null
          created_at?: string
          id?: string
          item_type?: Database["public"]["Enums"]["sale_item_type"]
          parking_id?: string | null
          reservation_id?: string
          snapshot_declared?: number
          snapshot_price?: number
          snapshot_undeclared?: number
          tenant_id?: string
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservation_items_amenagement_option_fk"
            columns: ["amenagement_option_id"]
            isOneToOne: false
            referencedRelation: "amenagement_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_items_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          agent_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          client_file_id: string | null
          client_id: string
          converted_at: string | null
          converted_to_sale_id: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          deposit_amount: number | null
          deposit_method: Database["public"]["Enums"]["deposit_method"] | null
          deposit_paid: boolean | null
          deposit_reference: string | null
          duration_days: number
          expires_at: string
          expiry_date: string | null
          id: string
          nin_cin: string
          notes: string | null
          project_id: string
          start_date: string | null
          status: Database["public"]["Enums"]["reservation_status"]
          tenant_id: string
          unit_id: string
          updated_at: string | null
        }
        Insert: {
          agent_id: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          client_file_id?: string | null
          client_id: string
          converted_at?: string | null
          converted_to_sale_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deposit_amount?: number | null
          deposit_method?: Database["public"]["Enums"]["deposit_method"] | null
          deposit_paid?: boolean | null
          deposit_reference?: string | null
          duration_days?: number
          expires_at: string
          expiry_date?: string | null
          id?: string
          nin_cin: string
          notes?: string | null
          project_id: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["reservation_status"]
          tenant_id: string
          unit_id: string
          updated_at?: string | null
        }
        Update: {
          agent_id?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          client_file_id?: string | null
          client_id?: string
          converted_at?: string | null
          converted_to_sale_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deposit_amount?: number | null
          deposit_method?: Database["public"]["Enums"]["deposit_method"] | null
          deposit_paid?: boolean | null
          deposit_reference?: string | null
          duration_days?: number
          expires_at?: string
          expiry_date?: string | null
          id?: string
          nin_cin?: string
          notes?: string | null
          project_id?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["reservation_status"]
          tenant_id?: string
          unit_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
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
      sale_charges: {
        Row: {
          amount: number
          charge_type: Database["public"]["Enums"]["charge_type"]
          created_at: string | null
          id: string
          label: string
          paid: boolean | null
          paid_at: string | null
          sale_id: string
          tenant_id: string
        }
        Insert: {
          amount?: number
          charge_type: Database["public"]["Enums"]["charge_type"]
          created_at?: string | null
          id?: string
          label: string
          paid?: boolean | null
          paid_at?: string | null
          sale_id: string
          tenant_id: string
        }
        Update: {
          amount?: number
          charge_type?: Database["public"]["Enums"]["charge_type"]
          created_at?: string | null
          id?: string
          label?: string
          paid?: boolean | null
          paid_at?: string | null
          sale_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_charges_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_charges_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_deletion_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          reason: string | null
          requested_by: string | null
          sale_id: string
          status: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          reason?: string | null
          requested_by?: string | null
          sale_id: string
          status?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          reason?: string | null
          requested_by?: string | null
          sale_id?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_deletion_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_deletion_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "sale_deletion_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_deletion_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_deletion_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "sale_deletion_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_deletion_requests_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_deletion_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          amenagement_option_id: string | null
          created_at: string
          id: string
          item_type: Database["public"]["Enums"]["sale_item_type"]
          parking_id: string | null
          price_declared: number
          price_undeclared: number
          quantity: number
          sale_id: string
          snapshot_declared: number | null
          snapshot_price: number | null
          snapshot_undeclared: number | null
          tenant_id: string
          unit_id: string | null
          unit_price: number
        }
        Insert: {
          amenagement_option_id?: string | null
          created_at?: string
          id?: string
          item_type: Database["public"]["Enums"]["sale_item_type"]
          parking_id?: string | null
          price_declared?: number
          price_undeclared?: number
          quantity?: number
          sale_id: string
          snapshot_declared?: number | null
          snapshot_price?: number | null
          snapshot_undeclared?: number | null
          tenant_id: string
          unit_id?: string | null
          unit_price?: number
        }
        Update: {
          amenagement_option_id?: string | null
          created_at?: string
          id?: string
          item_type?: Database["public"]["Enums"]["sale_item_type"]
          parking_id?: string | null
          price_declared?: number
          price_undeclared?: number
          quantity?: number
          sale_id?: string
          snapshot_declared?: number | null
          snapshot_price?: number | null
          snapshot_undeclared?: number | null
          tenant_id?: string
          unit_id?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_amenagement_option_fk"
            columns: ["amenagement_option_id"]
            isOneToOne: false
            referencedRelation: "amenagement_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_payments: {
        Row: {
          amount: number
          amount_declared: number | null
          amount_undeclared: number | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          payment_date: string | null
          payment_method: string | null
          reference: string | null
          sale_id: string
          schedule_id: string | null
          tenant_id: string
        }
        Insert: {
          amount: number
          amount_declared?: number | null
          amount_undeclared?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          reference?: string | null
          sale_id: string
          schedule_id?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          amount_declared?: number | null
          amount_undeclared?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          reference?: string | null
          sale_id?: string
          schedule_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "sale_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_payments_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "payment_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      global_playbook: {
        Row: {
          id: string
          system_prompt: string
          singleton: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          system_prompt?: string
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          system_prompt?: string
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      sales: {
        Row: {
          agent_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          client_file_id: string | null
          client_id: string
          converted_at: string | null
          created_at: string | null
          created_by: string | null
          delivery_date: string | null
          discount_amount: number | null
          discount_percent: number | null
          discount_type: Database["public"]["Enums"]["discount_type"] | null
          discount_value: number | null
          final_price: number
          financing_mode: Database["public"]["Enums"]["financing_mode"]
          id: string
          internal_notes: string | null
          notes: string | null
          project_id: string
          reservation_id: string | null
          sale_number: string | null
          status: Database["public"]["Enums"]["sale_status"]
          tenant_id: string
          total_amount: number | null
          total_price: number
          unit_id: string
          updated_at: string | null
        }
        Insert: {
          agent_id: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          client_file_id?: string | null
          client_id: string
          converted_at?: string | null
          created_at?: string | null
          created_by?: string | null
          delivery_date?: string | null
          discount_amount?: number | null
          discount_percent?: number | null
          discount_type?: Database["public"]["Enums"]["discount_type"] | null
          discount_value?: number | null
          final_price: number
          financing_mode?: Database["public"]["Enums"]["financing_mode"]
          id?: string
          internal_notes?: string | null
          notes?: string | null
          project_id: string
          reservation_id?: string | null
          sale_number?: string | null
          status?: Database["public"]["Enums"]["sale_status"]
          tenant_id: string
          total_amount?: number | null
          total_price: number
          unit_id: string
          updated_at?: string | null
        }
        Update: {
          agent_id?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          client_file_id?: string | null
          client_id?: string
          converted_at?: string | null
          created_at?: string | null
          created_by?: string | null
          delivery_date?: string | null
          discount_amount?: number | null
          discount_percent?: number | null
          discount_type?: Database["public"]["Enums"]["discount_type"] | null
          discount_value?: number | null
          final_price?: number
          financing_mode?: Database["public"]["Enums"]["financing_mode"]
          id?: string
          internal_notes?: string | null
          notes?: string | null
          project_id?: string
          reservation_id?: string | null
          sale_number?: string | null
          status?: Database["public"]["Enums"]["sale_status"]
          tenant_id?: string
          total_amount?: number | null
          total_price?: number
          unit_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
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
      sales_objectives: {
        Row: {
          achieved_revenue: number | null
          achieved_sales_count: number | null
          agent_id: string | null
          created_at: string
          created_by: string | null
          id: string
          period_end: string
          period_start: string
          target_revenue: number | null
          target_sales_count: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          achieved_revenue?: number | null
          achieved_sales_count?: number | null
          agent_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          period_end: string
          period_start: string
          target_revenue?: number | null
          target_sales_count?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          achieved_revenue?: number | null
          achieved_sales_count?: number | null
          agent_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          period_end?: string
          period_start?: string
          target_revenue?: number | null
          target_sales_count?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_objectives_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_objectives_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "sales_objectives_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_objectives_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_objectives_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "sales_objectives_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_objectives_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      security_audit: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json
          target_id: string | null
          target_preview: string | null
          target_type: string
          tenant_id: string
          user_id: string | null
          user_role: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_preview?: string | null
          target_type: string
          tenant_id: string
          user_id?: string | null
          user_role?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_preview?: string | null
          target_type?: string
          tenant_id?: string
          user_id?: string | null
          user_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "security_audit_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sent_messages_log: {
        Row: {
          agent_id: string | null
          channel: string
          client_id: string | null
          id: string
          message: string
          sent_at: string | null
          task_id: string | null
          tenant_id: string
        }
        Insert: {
          agent_id?: string | null
          channel: string
          client_id?: string | null
          id?: string
          message: string
          sent_at?: string | null
          task_id?: string | null
          tenant_id: string
        }
        Update: {
          agent_id?: string | null
          channel?: string
          client_id?: string | null
          id?: string
          message?: string
          sent_at?: string | null
          task_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sent_messages_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sent_messages_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_history: {
        Row: {
          amount_da: number
          billing_cycle: string
          created_at: string
          id: string
          payment_request_id: string | null
          period_end: string
          period_start: string
          plan: string
          tenant_id: string
        }
        Insert: {
          amount_da: number
          billing_cycle: string
          created_at?: string
          id?: string
          payment_request_id?: string | null
          period_end: string
          period_start: string
          plan: string
          tenant_id: string
        }
        Update: {
          amount_da?: number
          billing_cycle?: string
          created_at?: string
          id?: string
          payment_request_id?: string | null
          period_end?: string
          period_start?: string
          plan?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_history_payment_request_id_fkey"
            columns: ["payment_request_id"]
            isOneToOne: false
            referencedRelation: "payment_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "super_admin_logs_super_admin_id_fkey"
            columns: ["super_admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
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
      supervisor_action_requests: {
        Row: {
          action: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          payload: Json | null
          requested_by: string | null
          status: string
          target_id: string | null
          target_type: string
          tenant_id: string
        }
        Insert: {
          action: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          payload?: Json | null
          requested_by?: string | null
          status?: string
          target_id?: string | null
          target_type: string
          tenant_id: string
        }
        Update: {
          action?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          payload?: Json | null
          requested_by?: string | null
          status?: string
          target_id?: string | null
          target_type?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supervisor_action_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supervisor_action_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "supervisor_action_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supervisor_action_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supervisor_action_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "supervisor_action_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supervisor_action_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          created_at: string | null
          id: string
          priority: string | null
          status: string | null
          subject: string
          tenant_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          priority?: string | null
          status?: string | null
          subject: string
          tenant_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          priority?: string | null
          status?: string | null
          subject?: string
          tenant_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      task_bundles: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
          stage: string
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
          stage: string
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
          stage?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_bundles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      task_templates: {
        Row: {
          attached_file_types: string[] | null
          auto_trigger: string | null
          bundle_id: string | null
          channel: string | null
          created_at: string | null
          delay_minutes: number | null
          description: string | null
          id: string
          is_active: boolean | null
          maps_to_field: string | null
          message_mode: string | null
          message_template: string | null
          next_task_on_failure: string | null
          next_task_on_success: string | null
          priority: string | null
          sort_order: number | null
          stage: string
          tenant_id: string
          title: string
        }
        Insert: {
          attached_file_types?: string[] | null
          auto_trigger?: string | null
          bundle_id?: string | null
          channel?: string | null
          created_at?: string | null
          delay_minutes?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          maps_to_field?: string | null
          message_mode?: string | null
          message_template?: string | null
          next_task_on_failure?: string | null
          next_task_on_success?: string | null
          priority?: string | null
          sort_order?: number | null
          stage: string
          tenant_id: string
          title: string
        }
        Update: {
          attached_file_types?: string[] | null
          auto_trigger?: string | null
          bundle_id?: string | null
          channel?: string | null
          created_at?: string | null
          delay_minutes?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          maps_to_field?: string | null
          message_mode?: string | null
          message_template?: string | null
          next_task_on_failure?: string | null
          next_task_on_success?: string | null
          priority?: string | null
          sort_order?: number | null
          stage?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_templates_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "task_bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_templates_tenant_id_fkey"
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
          assigned_to: string | null
          auto_cancelled: boolean
          automation_metadata: Json
          automation_type: string | null
          bundle_id: string | null
          channel: string | null
          channel_used: string | null
          client_id: string
          client_response: string | null
          completed_at: string | null
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          due_at: string | null
          due_date: string | null
          executed_at: string | null
          id: string
          is_recurring: boolean
          message_sent: string | null
          priority: string | null
          recurrence_days: number | null
          reminder_at: string | null
          response: string | null
          scheduled_at: string | null
          stage: string | null
          status: Database["public"]["Enums"]["task_status"]
          task_type: string | null
          template_id: string | null
          template_name: string | null
          template_params: Json | null
          tenant_id: string
          title: string
          type: Database["public"]["Enums"]["task_type"]
          updated_at: string | null
        }
        Insert: {
          agent_id?: string | null
          assigned_to?: string | null
          auto_cancelled?: boolean
          automation_metadata?: Json
          automation_type?: string | null
          bundle_id?: string | null
          channel?: string | null
          channel_used?: string | null
          client_id: string
          client_response?: string | null
          completed_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          due_at?: string | null
          due_date?: string | null
          executed_at?: string | null
          id?: string
          is_recurring?: boolean
          message_sent?: string | null
          priority?: string | null
          recurrence_days?: number | null
          reminder_at?: string | null
          response?: string | null
          scheduled_at?: string | null
          stage?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          task_type?: string | null
          template_id?: string | null
          template_name?: string | null
          template_params?: Json | null
          tenant_id: string
          title: string
          type?: Database["public"]["Enums"]["task_type"]
          updated_at?: string | null
        }
        Update: {
          agent_id?: string | null
          assigned_to?: string | null
          auto_cancelled?: boolean
          automation_metadata?: Json
          automation_type?: string | null
          bundle_id?: string | null
          channel?: string | null
          channel_used?: string | null
          client_id?: string
          client_response?: string | null
          completed_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          due_at?: string | null
          due_date?: string | null
          executed_at?: string | null
          id?: string
          is_recurring?: boolean
          message_sent?: string | null
          priority?: string | null
          recurrence_days?: number | null
          reminder_at?: string | null
          response?: string | null
          scheduled_at?: string | null
          stage?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          task_type?: string | null
          template_id?: string | null
          template_name?: string | null
          template_params?: Json | null
          tenant_id?: string
          title?: string
          type?: Database["public"]["Enums"]["task_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tasks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "task_bundles"
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
            foreignKeyName: "tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "task_templates"
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
          ai_tokens_reset_at: string | null
          ai_tokens_used: number | null
          api_calls_count: number | null
          custom_app_name: string | null
          custom_logo_url: string | null
          custom_primary_color: string | null
          feature_ai_custom: boolean
          feature_ai_documents: boolean
          feature_ai_scripts: boolean | null
          feature_ai_suggestions: boolean
          feature_api_access: boolean
          feature_auto_tasks: boolean | null
          feature_charges: boolean | null
          feature_custom_branding: boolean
          feature_documents: boolean | null
          feature_export_csv: boolean
          feature_goals: boolean | null
          feature_landing_pages: boolean | null
          feature_payment_tracking: boolean | null
          feature_roi_marketing: boolean
          feature_whatsapp: boolean | null
          id: string
          language: string | null
          last_reset_at: string | null
          last_usage_reset: string | null
          lunch_break_end: number | null
          lunch_break_start: number | null
          min_deposit_amount: number | null
          notif_agent_inactive: boolean | null
          notif_goal_achieved: boolean | null
          notif_new_client: boolean | null
          notif_new_sale: boolean | null
          notif_payment_late: boolean | null
          notif_reservation_expired: boolean | null
          relaunch_alert_days: number | null
          reservation_duration_days: number | null
          storage_used_mb: number | null
          tenant_id: string
          updated_at: string | null
          urgent_alert_days: number | null
          visit_duration_minutes: number | null
          visit_slots: string[] | null
          work_days: number[] | null
          work_end_hour: number | null
          work_start_hour: number | null
        }
        Insert: {
          ai_tokens_reset_at?: string | null
          ai_tokens_used?: number | null
          api_calls_count?: number | null
          custom_app_name?: string | null
          custom_logo_url?: string | null
          custom_primary_color?: string | null
          feature_ai_custom?: boolean
          feature_ai_documents?: boolean
          feature_ai_scripts?: boolean | null
          feature_ai_suggestions?: boolean
          feature_api_access?: boolean
          feature_auto_tasks?: boolean | null
          feature_charges?: boolean | null
          feature_custom_branding?: boolean
          feature_documents?: boolean | null
          feature_export_csv?: boolean
          feature_goals?: boolean | null
          feature_landing_pages?: boolean | null
          feature_payment_tracking?: boolean | null
          feature_roi_marketing?: boolean
          feature_whatsapp?: boolean | null
          id?: string
          language?: string | null
          last_reset_at?: string | null
          last_usage_reset?: string | null
          lunch_break_end?: number | null
          lunch_break_start?: number | null
          min_deposit_amount?: number | null
          notif_agent_inactive?: boolean | null
          notif_goal_achieved?: boolean | null
          notif_new_client?: boolean | null
          notif_new_sale?: boolean | null
          notif_payment_late?: boolean | null
          notif_reservation_expired?: boolean | null
          relaunch_alert_days?: number | null
          reservation_duration_days?: number | null
          storage_used_mb?: number | null
          tenant_id: string
          updated_at?: string | null
          urgent_alert_days?: number | null
          visit_duration_minutes?: number | null
          visit_slots?: string[] | null
          work_days?: number[] | null
          work_end_hour?: number | null
          work_start_hour?: number | null
        }
        Update: {
          ai_tokens_reset_at?: string | null
          ai_tokens_used?: number | null
          api_calls_count?: number | null
          custom_app_name?: string | null
          custom_logo_url?: string | null
          custom_primary_color?: string | null
          feature_ai_custom?: boolean
          feature_ai_documents?: boolean
          feature_ai_scripts?: boolean | null
          feature_ai_suggestions?: boolean
          feature_api_access?: boolean
          feature_auto_tasks?: boolean | null
          feature_charges?: boolean | null
          feature_custom_branding?: boolean
          feature_documents?: boolean | null
          feature_export_csv?: boolean
          feature_goals?: boolean | null
          feature_landing_pages?: boolean | null
          feature_payment_tracking?: boolean | null
          feature_roi_marketing?: boolean
          feature_whatsapp?: boolean | null
          id?: string
          language?: string | null
          last_reset_at?: string | null
          last_usage_reset?: string | null
          lunch_break_end?: number | null
          lunch_break_start?: number | null
          min_deposit_amount?: number | null
          notif_agent_inactive?: boolean | null
          notif_goal_achieved?: boolean | null
          notif_new_client?: boolean | null
          notif_new_sale?: boolean | null
          notif_payment_late?: boolean | null
          notif_reservation_expired?: boolean | null
          relaunch_alert_days?: number | null
          reservation_duration_days?: number | null
          storage_used_mb?: number | null
          tenant_id?: string
          updated_at?: string | null
          urgent_alert_days?: number | null
          visit_duration_minutes?: number | null
          visit_slots?: string[] | null
          work_days?: number[] | null
          work_end_hour?: number | null
          work_start_hour?: number | null
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
          custom_domain: string | null
          email: string | null
          id: string
          logo_url: string | null
          name: string
          onboarding_completed: boolean | null
          phone: string | null
          plan: string | null
          suspended_at: string | null
          trial_ends_at: string | null
          website: string | null
          welcome_modal_seen_at: string | null
          wilaya: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          custom_domain?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name: string
          onboarding_completed?: boolean | null
          phone?: string | null
          plan?: string | null
          suspended_at?: string | null
          trial_ends_at?: string | null
          website?: string | null
          welcome_modal_seen_at?: string | null
          wilaya?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          custom_domain?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          onboarding_completed?: boolean | null
          phone?: string | null
          plan?: string | null
          suspended_at?: string | null
          trial_ends_at?: string | null
          website?: string | null
          welcome_modal_seen_at?: string | null
          wilaya?: string | null
        }
        Relationships: []
      }
      ticket_messages: {
        Row: {
          body: string
          created_at: string | null
          id: string
          sender_id: string
          ticket_id: string
        }
        Insert: {
          body: string
          created_at?: string | null
          id?: string
          sender_id: string
          ticket_id: string
        }
        Update: {
          body?: string
          created_at?: string | null
          id?: string
          sender_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ticket_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          agent_id: string | null
          blocked_at: string | null
          blocked_by: string | null
          building: string | null
          client_id: string | null
          code: string
          created_at: string | null
          delivery_date: string | null
          description: string | null
          expected_delivery_date: string | null
          features: Json | null
          floor: number | null
          id: string
          name: string | null
          plan_2d_url: string | null
          price: number | null
          price_declared: number | null
          price_undeclared: number | null
          project_id: string
          status: Database["public"]["Enums"]["unit_status"]
          subtype: Database["public"]["Enums"]["unit_subtype"] | null
          surface: number | null
          surface_area: number | null
          tenant_id: string
          terrace_area: number | null
          total_price: number | null
          type: Database["public"]["Enums"]["unit_type"]
          unit_subtype: string | null
          unit_type: string | null
          updated_at: string | null
        }
        Insert: {
          agent_id?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          building?: string | null
          client_id?: string | null
          code: string
          created_at?: string | null
          delivery_date?: string | null
          description?: string | null
          expected_delivery_date?: string | null
          features?: Json | null
          floor?: number | null
          id?: string
          name?: string | null
          plan_2d_url?: string | null
          price?: number | null
          price_declared?: number | null
          price_undeclared?: number | null
          project_id: string
          status?: Database["public"]["Enums"]["unit_status"]
          subtype?: Database["public"]["Enums"]["unit_subtype"] | null
          surface?: number | null
          surface_area?: number | null
          tenant_id: string
          terrace_area?: number | null
          total_price?: number | null
          type?: Database["public"]["Enums"]["unit_type"]
          unit_subtype?: string | null
          unit_type?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_id?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          building?: string | null
          client_id?: string | null
          code?: string
          created_at?: string | null
          delivery_date?: string | null
          description?: string | null
          expected_delivery_date?: string | null
          features?: Json | null
          floor?: number | null
          id?: string
          name?: string | null
          plan_2d_url?: string | null
          price?: number | null
          price_declared?: number | null
          price_undeclared?: number | null
          project_id?: string
          status?: Database["public"]["Enums"]["unit_status"]
          subtype?: Database["public"]["Enums"]["unit_subtype"] | null
          surface?: number | null
          surface_area?: number | null
          tenant_id?: string
          terrace_area?: number | null
          total_price?: number | null
          type?: Database["public"]["Enums"]["unit_type"]
          unit_subtype?: string | null
          unit_type?: string | null
          updated_at?: string | null
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
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
          avatar_url: string | null
          created_at: string | null
          deletion_requested_at: string | null
          email: string
          first_name: string
          id: string
          last_activity: string | null
          last_name: string
          permission_profile_id: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["user_status"]
          tenant_id: string | null
          terms_accepted_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          deletion_requested_at?: string | null
          email: string
          first_name: string
          id: string
          last_activity?: string | null
          last_name: string
          permission_profile_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          tenant_id?: string | null
          terms_accepted_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          deletion_requested_at?: string | null
          email?: string
          first_name?: string
          id?: string
          last_activity?: string | null
          last_name?: string
          permission_profile_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          tenant_id?: string | null
          terms_accepted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_permission_profile_id_fkey"
            columns: ["permission_profile_id"]
            isOneToOne: false
            referencedRelation: "permission_profiles"
            referencedColumns: ["id"]
          },
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
          assigned_to: string | null
          client_file_id: string | null
          client_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          feedback: string | null
          id: string
          notes: string | null
          outcome: string | null
          project_id: string | null
          prospect_id: string | null
          rating: number | null
          scheduled_at: string
          status: Database["public"]["Enums"]["visit_status"]
          tenant_id: string
          units_visited: Json | null
          updated_at: string | null
          visit_type: Database["public"]["Enums"]["visit_type"]
        }
        Insert: {
          agent_id: string
          assigned_to?: string | null
          client_file_id?: string | null
          client_id: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          feedback?: string | null
          id?: string
          notes?: string | null
          outcome?: string | null
          project_id?: string | null
          prospect_id?: string | null
          rating?: number | null
          scheduled_at: string
          status?: Database["public"]["Enums"]["visit_status"]
          tenant_id: string
          units_visited?: Json | null
          updated_at?: string | null
          visit_type?: Database["public"]["Enums"]["visit_type"]
        }
        Update: {
          agent_id?: string
          assigned_to?: string | null
          client_file_id?: string | null
          client_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          feedback?: string | null
          id?: string
          notes?: string | null
          outcome?: string | null
          project_id?: string | null
          prospect_id?: string | null
          rating?: number | null
          scheduled_at?: string
          status?: Database["public"]["Enums"]["visit_status"]
          tenant_id?: string
          units_visited?: Json | null
          updated_at?: string | null
          visit_type?: Database["public"]["Enums"]["visit_type"]
        }
        Relationships: [
          {
            foreignKeyName: "visits_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
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
      webhook_deliveries: {
        Row: {
          attempted_at: string
          event_type: string
          id: string
          payload: Json
          response_body: string | null
          response_status: number | null
          success: boolean
          webhook_id: string
        }
        Insert: {
          attempted_at?: string
          event_type: string
          id?: string
          payload: Json
          response_body?: string | null
          response_status?: number | null
          success?: boolean
          webhook_id: string
        }
        Update: {
          attempted_at?: string
          event_type?: string
          id?: string
          payload?: Json
          response_body?: string | null
          response_status?: number | null
          success?: boolean
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          active: boolean
          created_at: string
          events: string[]
          id: string
          secret: string
          tenant_id: string
          url: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          events?: string[]
          id?: string
          secret: string
          tenant_id: string
          url: string
        }
        Update: {
          active?: boolean
          created_at?: string
          events?: string[]
          id?: string
          secret?: string
          tenant_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhooks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_accounts: {
        Row: {
          access_token: string | null
          created_at: string | null
          display_phone: string | null
          id: string
          is_active: boolean | null
          last_reset_at: string | null
          messages_sent: number | null
          monthly_quota: number | null
          phone_number: string | null
          phone_number_id: string | null
          plan: string | null
          tenant_id: string
          waba_id: string | null
          waba_sub_id: string | null
        }
        Insert: {
          access_token?: string | null
          created_at?: string | null
          display_phone?: string | null
          id?: string
          is_active?: boolean | null
          last_reset_at?: string | null
          messages_sent?: number | null
          monthly_quota?: number | null
          phone_number?: string | null
          phone_number_id?: string | null
          plan?: string | null
          tenant_id: string
          waba_id?: string | null
          waba_sub_id?: string | null
        }
        Update: {
          access_token?: string | null
          created_at?: string | null
          display_phone?: string | null
          id?: string
          is_active?: boolean | null
          last_reset_at?: string | null
          messages_sent?: number | null
          monthly_quota?: number | null
          phone_number?: string | null
          phone_number_id?: string | null
          plan?: string | null
          tenant_id?: string
          waba_id?: string | null
          waba_sub_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_config: {
        Row: {
          access_token: string
          activation_fee_da: number | null
          business_name: string | null
          created_at: string | null
          display_phone: string | null
          id: string
          is_active: boolean | null
          meta_app_id: string | null
          meta_app_secret: string | null
          phone_number_id: string
          updated_at: string | null
          waba_id: string
        }
        Insert: {
          access_token: string
          activation_fee_da?: number | null
          business_name?: string | null
          created_at?: string | null
          display_phone?: string | null
          id?: string
          is_active?: boolean | null
          meta_app_id?: string | null
          meta_app_secret?: string | null
          phone_number_id: string
          updated_at?: string | null
          waba_id: string
        }
        Update: {
          access_token?: string
          activation_fee_da?: number | null
          business_name?: string | null
          created_at?: string | null
          display_phone?: string | null
          id?: string
          is_active?: boolean | null
          meta_app_id?: string | null
          meta_app_secret?: string | null
          phone_number_id?: string
          updated_at?: string | null
          waba_id?: string
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          agent_id: string | null
          client_id: string | null
          cost_usd: number | null
          created_at: string | null
          error_message: string | null
          id: string
          status: string | null
          template_name: string
          tenant_id: string
          to_phone: string
          variables: Json | null
          wa_message_id: string | null
        }
        Insert: {
          agent_id?: string | null
          client_id?: string | null
          cost_usd?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          status?: string | null
          template_name: string
          tenant_id: string
          to_phone: string
          variables?: Json | null
          wa_message_id?: string | null
        }
        Update: {
          agent_id?: string | null
          client_id?: string | null
          cost_usd?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          status?: string | null
          template_name?: string
          tenant_id?: string
          to_phone?: string
          variables?: Json | null
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "whatsapp_messages_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_plans: {
        Row: {
          cost_usd: number
          features: Json | null
          id: string
          is_active: boolean | null
          label: string
          monthly_quota: number
          name: string
          price_da: number
          sort_order: number | null
        }
        Insert: {
          cost_usd?: number
          features?: Json | null
          id?: string
          is_active?: boolean | null
          label: string
          monthly_quota: number
          name: string
          price_da: number
          sort_order?: number | null
        }
        Update: {
          cost_usd?: number
          features?: Json | null
          id?: string
          is_active?: boolean | null
          label?: string
          monthly_quota?: number
          name?: string
          price_da?: number
          sort_order?: number | null
        }
        Relationships: []
      }
      whatsapp_templates: {
        Row: {
          body_text: string
          category: string | null
          created_at: string | null
          id: string
          language: string | null
          meta_template_id: string | null
          name: string
          status: string | null
          variables_count: number | null
        }
        Insert: {
          body_text: string
          category?: string | null
          created_at?: string | null
          id?: string
          language?: string | null
          meta_template_id?: string | null
          name: string
          status?: string | null
          variables_count?: number | null
        }
        Update: {
          body_text?: string
          category?: string | null
          created_at?: string | null
          id?: string
          language?: string | null
          meta_template_id?: string | null
          name?: string
          status?: string | null
          variables_count?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      client_documents: {
        Row: {
          client_file_id: string | null
          client_id: string | null
          created_at: string | null
          file_url: string | null
          generated_at: string | null
          id: string | null
          name: string | null
          sale_id: string | null
          tenant_id: string | null
          type: Database["public"]["Enums"]["doc_type"] | null
          updated_at: string | null
          url: string | null
        }
        Insert: {
          client_file_id?: never
          client_id?: string | null
          created_at?: string | null
          file_url?: string | null
          generated_at?: string | null
          id?: string | null
          name?: string | null
          sale_id?: string | null
          tenant_id?: string | null
          type?: Database["public"]["Enums"]["doc_type"] | null
          updated_at?: string | null
          url?: string | null
        }
        Update: {
          client_file_id?: never
          client_id?: string | null
          created_at?: string | null
          file_url?: string | null
          generated_at?: string | null
          id?: string | null
          name?: string | null
          sale_id?: string | null
          tenant_id?: string | null
          type?: Database["public"]["Enums"]["doc_type"] | null
          updated_at?: string | null
          url?: string | null
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
      profiles: {
        Row: {
          created_at: string | null
          email: string | null
          first_name: string | null
          full_name: string | null
          id: string | null
          last_activity: string | null
          last_name: string | null
          permission_profile_id: string | null
          phone: string | null
          role: string | null
          status: string | null
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          full_name?: never
          id?: string | null
          last_activity?: string | null
          last_name?: string | null
          permission_profile_id?: string | null
          phone?: string | null
          role?: never
          status?: never
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          full_name?: never
          id?: string | null
          last_activity?: string | null
          last_name?: string | null
          permission_profile_id?: string | null
          phone?: string | null
          role?: never
          status?: never
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_permission_profile_id_fkey"
            columns: ["permission_profile_id"]
            isOneToOne: false
            referencedRelation: "permission_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_platform_health: {
        Row: {
          active_tenants: number | null
          cancel_sale_errors_24h: number | null
          create_sale_errors_24h: number | null
          payment_schedules_orphaned: number | null
          rpc_errors_24h: number | null
          sales_cancelled_24h: number | null
          sales_created_24h: number | null
          sales_with_invalid_unit: number | null
          snapshot_at: string | null
          users_without_tenant: number | null
        }
        Relationships: []
      }
      v_recent_rpc_errors: {
        Row: {
          created_at: string | null
          error_message: string | null
          payload: Json | null
          rpc_name: string | null
          tenant_id: string | null
          tenant_name: string | null
          user_email: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_trail_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      call_edge_function: {
        Args: { function_name: string }
        Returns: undefined
      }
      can_see_agent_row: { Args: { row_agent_id: string }; Returns: boolean }
      cancel_reservation_atomic: {
        Args: { p_reason?: string; p_reservation_id: string }
        Returns: Json
      }
      cancel_sale_atomic: {
        Args: { p_reason?: string; p_sale_id: string }
        Returns: Json
      }
      convert_prospect_to_client: {
        Args: { p_project_id?: string; p_prospect_id: string }
        Returns: Json
      }
      convert_reservation_to_sale_atomic: {
        Args: {
          p_discount_amount?: number
          p_discount_percent?: number
          p_notes?: string
          p_reservation_id: string
          p_schedules?: Json
        }
        Returns: Json
      }
      create_client_atomic: {
        Args: {
          p_client_type?: string
          p_email?: string
          p_full_name: string
          p_nin_cin?: string
          p_notes?: string
          p_phone?: string
          p_project_id?: string
          p_source?: string
        }
        Returns: Json
      }
      create_default_permission_profiles: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      create_reservation_atomic: {
        Args: {
          p_client_file_id: string
          p_client_id: string
          p_deposit_amount: number
          p_deposit_method?: string
          p_duration_days?: number
          p_items?: Json
          p_nin_cin?: string
          p_notes?: string
          p_project_id: string
          p_unit_id: string
        }
        Returns: Json
      }
      create_sale_atomic: {
        Args: {
          p_client_file_id: string
          p_client_id: string
          p_discount_amount?: number
          p_discount_percent?: number
          p_items?: Json
          p_notes?: string
          p_project_id: string
          p_reservation_id?: string
          p_schedules?: Json
        }
        Returns: Json
      }
      get_my_tenant_id: { Args: never; Returns: string }
      get_user_role: { Args: never; Returns: string }
      get_user_tenant_id: { Args: never; Returns: string }
      increment_api_calls: { Args: { tid: string }; Returns: undefined }
      is_super_admin: { Args: never; Returns: boolean }
      log_rpc_error: {
        Args: { p_error: string; p_payload?: Json; p_rpc_name: string }
        Returns: undefined
      }
      purge_old_login_attempts: { Args: never; Returns: undefined }
      sync_whatsapp_quota_from_plan: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
    }
    Enums: {
      charge_type:
        | "notaire"
        | "agence"
        | "promotion"
        | "enregistrement"
        | "autre"
      client_file_status: "draft" | "active" | "on_hold" | "closed"
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
      interaction_type:
        | "call"
        | "whatsapp"
        | "email"
        | "meeting"
        | "visit"
        | "note"
        | "task"
      interest_level: "low" | "medium" | "high"
      payment_method: "comptant" | "credit" | "lpp" | "aadl" | "mixte"
      payment_request_status:
        | "pending"
        | "awaiting_proof"
        | "confirmed"
        | "rejected"
        | "cancelled"
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
      prospect_status: "new" | "contacted" | "qualified" | "converted" | "lost"
      reservation_status: "active" | "expired" | "cancelled" | "converted"
      sale_item_type: "unit" | "parking" | "amenagement"
      sale_status: "active" | "cancelled" | "sale" | "reservation"
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
      client_file_status: ["draft", "active", "on_hold", "closed"],
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
      interaction_type: [
        "call",
        "whatsapp",
        "email",
        "meeting",
        "visit",
        "note",
        "task",
      ],
      interest_level: ["low", "medium", "high"],
      payment_method: ["comptant", "credit", "lpp", "aadl", "mixte"],
      payment_request_status: [
        "pending",
        "awaiting_proof",
        "confirmed",
        "rejected",
        "cancelled",
      ],
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
      prospect_status: ["new", "contacted", "qualified", "converted", "lost"],
      reservation_status: ["active", "expired", "cancelled", "converted"],
      sale_item_type: ["unit", "parking", "amenagement"],
      sale_status: ["active", "cancelled", "sale", "reservation"],
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
