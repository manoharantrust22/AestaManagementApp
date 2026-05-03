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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      advances: {
        Row: {
          amount: number
          created_at: string
          date: string
          deducted_amount: number
          deducted_date: string | null
          deducted_in_period_id: string | null
          deduction_status: Database["public"]["Enums"]["deduction_status"]
          deleted_at: string | null
          deleted_by: string | null
          given_by: string | null
          id: string
          is_deleted: boolean
          laborer_id: string
          payment_mode: Database["public"]["Enums"]["payment_mode"] | null
          reason: string | null
          reference_number: string | null
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          date: string
          deducted_amount?: number
          deducted_date?: string | null
          deducted_in_period_id?: string | null
          deduction_status?: Database["public"]["Enums"]["deduction_status"]
          deleted_at?: string | null
          deleted_by?: string | null
          given_by?: string | null
          id?: string
          is_deleted?: boolean
          laborer_id: string
          payment_mode?: Database["public"]["Enums"]["payment_mode"] | null
          reason?: string | null
          reference_number?: string | null
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          date?: string
          deducted_amount?: number
          deducted_date?: string | null
          deducted_in_period_id?: string | null
          deduction_status?: Database["public"]["Enums"]["deduction_status"]
          deleted_at?: string | null
          deleted_by?: string | null
          given_by?: string | null
          id?: string
          is_deleted?: boolean
          laborer_id?: string
          payment_mode?: Database["public"]["Enums"]["payment_mode"] | null
          reason?: string | null
          reference_number?: string | null
          transaction_type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "advances_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advances_given_by_fkey"
            columns: ["given_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advances_laborer_id_fkey"
            columns: ["laborer_id"]
            isOneToOne: false
            referencedRelation: "laborers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advances_laborer_id_fkey"
            columns: ["laborer_id"]
            isOneToOne: false
            referencedRelation: "v_laborer_advance_summary"
            referencedColumns: ["laborer_id"]
          },
        ]
      }
      attendance_expense_sync: {
        Row: {
          attendance_date: string
          expense_id: string | null
          id: string
          site_id: string
          synced_at: string | null
          synced_by: string
          synced_by_user_id: string | null
          total_amount: number
          total_laborers: number
          total_work_days: number
        }
        Insert: {
          attendance_date: string
          expense_id?: string | null
          id?: string
          site_id: string
          synced_at?: string | null
          synced_by: string
          synced_by_user_id?: string | null
          total_amount: number
          total_laborers: number
          total_work_days: number
        }
        Update: {
          attendance_date?: string
          expense_id?: string | null
          id?: string
          site_id?: string
          synced_at?: string | null
          synced_by?: string
          synced_by_user_id?: string | null
          total_amount?: number
          total_laborers?: number
          total_work_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "attendance_expense_sync_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_expense_sync_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_expense_sync_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "attendance_expense_sync_synced_by_user_id_fkey"
            columns: ["synced_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          changed_at: string
          changed_by: string | null
          id: string
          ip_address: string | null
          new_data: Json | null
          notes: string | null
          old_data: Json | null
          record_id: string
          table_name: string
          user_agent: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          changed_at?: string
          changed_by?: string | null
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          notes?: string | null
          old_data?: Json | null
          record_id: string
          table_name: string
          user_agent?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          changed_at?: string
          changed_by?: string | null
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          notes?: string | null
          old_data?: Json | null
          record_id?: string
          table_name?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_usage_records: {
        Row: {
          batch_ref_code: string
          brand_id: string | null
          created_at: string | null
          created_by: string | null
          group_stock_transaction_id: string | null
          id: string
          is_self_use: boolean | null
          material_id: string
          quantity: number
          settlement_id: string | null
          settlement_status: string | null
          site_group_id: string | null
          total_cost: number | null
          unit: string
          unit_cost: number
          updated_at: string | null
          usage_date: string
          usage_group_id: string | null
          usage_site_id: string
          work_description: string | null
        }
        Insert: {
          batch_ref_code: string
          brand_id?: string | null
          created_at?: string | null
          created_by?: string | null
          group_stock_transaction_id?: string | null
          id?: string
          is_self_use?: boolean | null
          material_id: string
          quantity: number
          settlement_id?: string | null
          settlement_status?: string | null
          site_group_id?: string | null
          total_cost?: number | null
          unit: string
          unit_cost: number
          updated_at?: string | null
          usage_date: string
          usage_group_id?: string | null
          usage_site_id: string
          work_description?: string | null
        }
        Update: {
          batch_ref_code?: string
          brand_id?: string | null
          created_at?: string | null
          created_by?: string | null
          group_stock_transaction_id?: string | null
          id?: string
          is_self_use?: boolean | null
          material_id?: string
          quantity?: number
          settlement_id?: string | null
          settlement_status?: string | null
          site_group_id?: string | null
          total_cost?: number | null
          unit?: string
          unit_cost?: number
          updated_at?: string | null
          usage_date?: string
          usage_group_id?: string | null
          usage_site_id?: string
          work_description?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batch_usage_records_batch_ref_code_fkey"
            columns: ["batch_ref_code"]
            isOneToOne: false
            referencedRelation: "material_purchase_expenses"
            referencedColumns: ["ref_code"]
          },
          {
            foreignKeyName: "batch_usage_records_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "material_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_usage_records_group_stock_transaction_id_fkey"
            columns: ["group_stock_transaction_id"]
            isOneToOne: false
            referencedRelation: "group_stock_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_usage_records_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_usage_records_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_group_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "batch_usage_records_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock_alerts"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "batch_usage_records_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_materials_with_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_usage_records_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_site_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "batch_usage_records_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "inter_site_material_settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_usage_records_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "v_pending_inter_site_settlements"
            referencedColumns: ["settlement_id"]
          },
          {
            foreignKeyName: "batch_usage_records_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "v_settlement_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_usage_records_site_group_id_fkey"
            columns: ["site_group_id"]
            isOneToOne: false
            referencedRelation: "site_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_usage_records_usage_site_id_fkey"
            columns: ["usage_site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_usage_records_usage_site_id_fkey"
            columns: ["usage_site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
        ]
      }
      building_sections: {
        Row: {
          actual_end_date: string | null
          actual_start_date: string | null
          area_sqft: number | null
          construction_phase_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          notes: string | null
          planned_end_date: string | null
          planned_start_date: string | null
          sequence_order: number
          site_id: string
          status: Database["public"]["Enums"]["section_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          area_sqft?: number | null
          construction_phase_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          notes?: string | null
          planned_end_date?: string | null
          planned_start_date?: string | null
          sequence_order?: number
          site_id: string
          status?: Database["public"]["Enums"]["section_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          area_sqft?: number | null
          construction_phase_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          notes?: string | null
          planned_end_date?: string | null
          planned_start_date?: string | null
          sequence_order?: number
          site_id?: string
          status?: Database["public"]["Enums"]["section_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "building_sections_construction_phase_id_fkey"
            columns: ["construction_phase_id"]
            isOneToOne: false
            referencedRelation: "construction_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "building_sections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "building_sections_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "building_sections_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "building_sections_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      client_payment_plans: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          notes: string | null
          plan_name: string
          site_id: string
          total_contract_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          plan_name: string
          site_id: string
          total_contract_amount: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          plan_name?: string
          site_id?: string
          total_contract_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_payment_plans_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_payment_plans_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
        ]
      }
      client_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          is_verified: boolean
          notes: string | null
          payment_date: string
          payment_mode: string
          payment_phase_id: string | null
          receipt_url: string | null
          site_id: string
          tagged_additional_work_id: string | null
          transaction_reference: string | null
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          is_verified?: boolean
          notes?: string | null
          payment_date: string
          payment_mode: string
          payment_phase_id?: string | null
          receipt_url?: string | null
          site_id: string
          tagged_additional_work_id?: string | null
          transaction_reference?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          is_verified?: boolean
          notes?: string | null
          payment_date?: string
          payment_mode?: string
          payment_phase_id?: string | null
          receipt_url?: string | null
          site_id?: string
          tagged_additional_work_id?: string | null
          transaction_reference?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_payments_payment_phase_id_fkey"
            columns: ["payment_phase_id"]
            isOneToOne: false
            referencedRelation: "payment_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_payments_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_payments_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "client_payments_tagged_additional_work_id_fkey"
            columns: ["tagged_additional_work_id"]
            isOneToOne: false
            referencedRelation: "site_additional_works"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          address: string | null
          city: string | null
          code: string
          created_at: string | null
          email: string | null
          gst_number: string | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          name: string
          pan_number: string | null
          phone: string | null
          settings: Json | null
          state: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          code: string
          created_at?: string | null
          email?: string | null
          gst_number?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          pan_number?: string | null
          phone?: string | null
          settings?: Json | null
          state?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          code?: string
          created_at?: string | null
          email?: string | null
          gst_number?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          pan_number?: string | null
          phone?: string | null
          settings?: Json | null
          state?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      company_invites: {
        Row: {
          company_id: string
          created_at: string | null
          email: string | null
          expires_at: string | null
          id: string
          invited_by: string
          phone: string | null
          role: string | null
          status: string | null
          token: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string
          invited_by: string
          phone?: string | null
          role?: string | null
          status?: string | null
          token: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string
          invited_by?: string
          phone?: string | null
          role?: string | null
          status?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_invites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      company_members: {
        Row: {
          company_id: string
          id: string
          is_primary: boolean | null
          joined_at: string | null
          role: string | null
          user_id: string
        }
        Insert: {
          company_id: string
          id?: string
          is_primary?: boolean | null
          joined_at?: string | null
          role?: string | null
          user_id: string
        }
        Update: {
          company_id?: string
          id?: string
          is_primary?: boolean | null
          joined_at?: string | null
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      company_vendor_prices: {
        Row: {
          brand_id: string | null
          company_id: string
          created_at: string | null
          gst_rate: number | null
          id: string
          loading_cost: number | null
          location: string
          material_id: string | null
          negotiated_date: string | null
          negotiated_price: number
          notes: string | null
          price_includes_gst: boolean | null
          pricing_mode: string | null
          recorded_by: string | null
          reference_inventory_id: string | null
          transport_cost: number | null
          unit: string | null
          unloading_cost: number | null
          updated_at: string | null
          valid_until: string | null
          vendor_id: string
        }
        Insert: {
          brand_id?: string | null
          company_id: string
          created_at?: string | null
          gst_rate?: number | null
          id?: string
          loading_cost?: number | null
          location: string
          material_id?: string | null
          negotiated_date?: string | null
          negotiated_price: number
          notes?: string | null
          price_includes_gst?: boolean | null
          pricing_mode?: string | null
          recorded_by?: string | null
          reference_inventory_id?: string | null
          transport_cost?: number | null
          unit?: string | null
          unloading_cost?: number | null
          updated_at?: string | null
          valid_until?: string | null
          vendor_id: string
        }
        Update: {
          brand_id?: string | null
          company_id?: string
          created_at?: string | null
          gst_rate?: number | null
          id?: string
          loading_cost?: number | null
          location?: string
          material_id?: string | null
          negotiated_date?: string | null
          negotiated_price?: number
          notes?: string | null
          price_includes_gst?: boolean | null
          pricing_mode?: string | null
          recorded_by?: string | null
          reference_inventory_id?: string | null
          transport_cost?: number | null
          unit?: string | null
          unloading_cost?: number | null
          updated_at?: string | null
          valid_until?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_vendor_prices_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "material_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_vendor_prices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_vendor_prices_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_vendor_prices_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_group_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "company_vendor_prices_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock_alerts"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "company_vendor_prices_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_materials_with_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_vendor_prices_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_site_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "company_vendor_prices_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_vendor_prices_reference_inventory_id_fkey"
            columns: ["reference_inventory_id"]
            isOneToOne: false
            referencedRelation: "v_vendor_inventory_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_vendor_prices_reference_inventory_id_fkey"
            columns: ["reference_inventory_id"]
            isOneToOne: false
            referencedRelation: "vendor_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_vendor_prices_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      construction_phases: {
        Row: {
          created_at: string
          default_payment_percentage: number | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          sequence_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_payment_percentage?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sequence_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_payment_percentage?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sequence_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      construction_subphases: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          phase_id: string
          sequence_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          phase_id: string
          sequence_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phase_id?: string
          sequence_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "construction_subphases_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "construction_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_attendance: {
        Row: {
          attendance_status: string | null
          break_hours: number | null
          confirmed_at: string | null
          created_at: string
          daily_earnings: number
          daily_log_id: string | null
          daily_rate_applied: number
          date: string
          day_units: number | null
          deleted_at: string | null
          deleted_by: string | null
          end_time: string | null
          engineer_transaction_id: string | null
          entered_by: string | null
          expense_id: string | null
          hours_worked: number | null
          id: string
          in_time: string | null
          is_deleted: boolean
          is_paid: boolean | null
          is_verified: boolean
          laborer_id: string
          lunch_in: string | null
          lunch_out: string | null
          morning_entry_at: string | null
          out_time: string | null
          paid_via: string | null
          payer_name: string | null
          payer_source: string | null
          payment_date: string | null
          payment_id: string | null
          payment_mode: string | null
          payment_notes: string | null
          payment_proof_url: string | null
          recorded_by: string | null
          recorded_by_user_id: string | null
          salary_override: number | null
          salary_override_reason: string | null
          section_id: string | null
          settlement_group_id: string | null
          site_id: string
          snacks_amount: number | null
          start_time: string | null
          subcontract_id: string | null
          synced_to_expense: boolean | null
          task_completed: string | null
          team_id: string | null
          total_hours: number | null
          updated_at: string
          updated_by: string | null
          updated_by_user_id: string | null
          verified_by: string | null
          work_days: number
          work_description: string | null
          work_hours: number | null
          work_progress_percent: number | null
          work_variance: Database["public"]["Enums"]["work_variance"] | null
        }
        Insert: {
          attendance_status?: string | null
          break_hours?: number | null
          confirmed_at?: string | null
          created_at?: string
          daily_earnings: number
          daily_log_id?: string | null
          daily_rate_applied: number
          date: string
          day_units?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          end_time?: string | null
          engineer_transaction_id?: string | null
          entered_by?: string | null
          expense_id?: string | null
          hours_worked?: number | null
          id?: string
          in_time?: string | null
          is_deleted?: boolean
          is_paid?: boolean | null
          is_verified?: boolean
          laborer_id: string
          lunch_in?: string | null
          lunch_out?: string | null
          morning_entry_at?: string | null
          out_time?: string | null
          paid_via?: string | null
          payer_name?: string | null
          payer_source?: string | null
          payment_date?: string | null
          payment_id?: string | null
          payment_mode?: string | null
          payment_notes?: string | null
          payment_proof_url?: string | null
          recorded_by?: string | null
          recorded_by_user_id?: string | null
          salary_override?: number | null
          salary_override_reason?: string | null
          section_id?: string | null
          settlement_group_id?: string | null
          site_id: string
          snacks_amount?: number | null
          start_time?: string | null
          subcontract_id?: string | null
          synced_to_expense?: boolean | null
          task_completed?: string | null
          team_id?: string | null
          total_hours?: number | null
          updated_at?: string
          updated_by?: string | null
          updated_by_user_id?: string | null
          verified_by?: string | null
          work_days?: number
          work_description?: string | null
          work_hours?: number | null
          work_progress_percent?: number | null
          work_variance?: Database["public"]["Enums"]["work_variance"] | null
        }
        Update: {
          attendance_status?: string | null
          break_hours?: number | null
          confirmed_at?: string | null
          created_at?: string
          daily_earnings?: number
          daily_log_id?: string | null
          daily_rate_applied?: number
          date?: string
          day_units?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          end_time?: string | null
          engineer_transaction_id?: string | null
          entered_by?: string | null
          expense_id?: string | null
          hours_worked?: number | null
          id?: string
          in_time?: string | null
          is_deleted?: boolean
          is_paid?: boolean | null
          is_verified?: boolean
          laborer_id?: string
          lunch_in?: string | null
          lunch_out?: string | null
          morning_entry_at?: string | null
          out_time?: string | null
          paid_via?: string | null
          payer_name?: string | null
          payer_source?: string | null
          payment_date?: string | null
          payment_id?: string | null
          payment_mode?: string | null
          payment_notes?: string | null
          payment_proof_url?: string | null
          recorded_by?: string | null
          recorded_by_user_id?: string | null
          salary_override?: number | null
          salary_override_reason?: string | null
          section_id?: string | null
          settlement_group_id?: string | null
          site_id?: string
          snacks_amount?: number | null
          start_time?: string | null
          subcontract_id?: string | null
          synced_to_expense?: boolean | null
          task_completed?: string | null
          team_id?: string | null
          total_hours?: number | null
          updated_at?: string
          updated_by?: string | null
          updated_by_user_id?: string | null
          verified_by?: string | null
          work_days?: number
          work_description?: string | null
          work_hours?: number | null
          work_progress_percent?: number | null
          work_variance?: Database["public"]["Enums"]["work_variance"] | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_attendance_contract_id_fkey"
            columns: ["subcontract_id"]
            isOneToOne: false
            referencedRelation: "subcontracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_contract_id_fkey"
            columns: ["subcontract_id"]
            isOneToOne: false
            referencedRelation: "v_subcontract_reconciliation"
            referencedColumns: ["subcontract_id"]
          },
          {
            foreignKeyName: "daily_attendance_daily_log_id_fkey"
            columns: ["daily_log_id"]
            isOneToOne: false
            referencedRelation: "daily_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_engineer_transaction_id_fkey"
            columns: ["engineer_transaction_id"]
            isOneToOne: false
            referencedRelation: "site_engineer_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_laborer_id_fkey"
            columns: ["laborer_id"]
            isOneToOne: false
            referencedRelation: "laborers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_laborer_id_fkey"
            columns: ["laborer_id"]
            isOneToOne: false
            referencedRelation: "v_laborer_advance_summary"
            referencedColumns: ["laborer_id"]
          },
          {
            foreignKeyName: "daily_attendance_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "labor_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_recorded_by_user_id_fkey"
            columns: ["recorded_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "building_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "v_section_cost_summary"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "daily_attendance_settlement_group_id_fkey"
            columns: ["settlement_group_id"]
            isOneToOne: false
            referencedRelation: "settlement_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "daily_attendance_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_weekly_summary"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "daily_attendance_updated_by_user_id_fkey"
            columns: ["updated_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_logs: {
        Row: {
          created_at: string
          date: string
          general_notes: string | null
          holiday_reason: string | null
          id: string
          is_holiday: boolean
          logged_by: string | null
          site_id: string
          updated_at: string
          weather: string | null
          work_summary: string | null
        }
        Insert: {
          created_at?: string
          date: string
          general_notes?: string | null
          holiday_reason?: string | null
          id?: string
          is_holiday?: boolean
          logged_by?: string | null
          site_id: string
          updated_at?: string
          weather?: string | null
          work_summary?: string | null
        }
        Update: {
          created_at?: string
          date?: string
          general_notes?: string | null
          holiday_reason?: string | null
          id?: string
          is_holiday?: boolean
          logged_by?: string | null
          site_id?: string
          updated_at?: string
          weather?: string | null
          work_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_logs_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_logs_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_logs_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
        ]
      }
      daily_material_usage: {
        Row: {
          brand_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          inventory_id: string | null
          is_group_stock: boolean | null
          is_verified: boolean | null
          material_id: string
          notes: string | null
          quantity: number
          section_id: string | null
          site_group_id: string | null
          site_id: string
          total_cost: number | null
          unit_cost: number | null
          updated_at: string | null
          usage_date: string
          usage_group_id: string | null
          used_by: string | null
          verified_at: string | null
          verified_by: string | null
          work_area: string | null
          work_description: string | null
        }
        Insert: {
          brand_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          inventory_id?: string | null
          is_group_stock?: boolean | null
          is_verified?: boolean | null
          material_id: string
          notes?: string | null
          quantity: number
          section_id?: string | null
          site_group_id?: string | null
          site_id: string
          total_cost?: number | null
          unit_cost?: number | null
          updated_at?: string | null
          usage_date?: string
          usage_group_id?: string | null
          used_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
          work_area?: string | null
          work_description?: string | null
        }
        Update: {
          brand_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          inventory_id?: string | null
          is_group_stock?: boolean | null
          is_verified?: boolean | null
          material_id?: string
          notes?: string | null
          quantity?: number
          section_id?: string | null
          site_group_id?: string | null
          site_id?: string
          total_cost?: number | null
          unit_cost?: number | null
          updated_at?: string | null
          usage_date?: string
          usage_group_id?: string | null
          used_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
          work_area?: string | null
          work_description?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_material_usage_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "material_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_material_usage_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_material_usage_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "stock_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_material_usage_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_material_usage_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_material_usage_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_group_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "daily_material_usage_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock_alerts"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "daily_material_usage_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_materials_with_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_material_usage_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_site_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "daily_material_usage_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "building_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_material_usage_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "v_section_cost_summary"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "daily_material_usage_site_group_id_fkey"
            columns: ["site_group_id"]
            isOneToOne: false
            referencedRelation: "site_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_material_usage_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_material_usage_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "daily_material_usage_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_work_summary: {
        Row: {
          comments: string | null
          contract_laborer_count: number | null
          created_at: string | null
          daily_laborer_count: number | null
          date: string
          default_snacks_per_person: number | null
          entered_by: string | null
          entered_by_user_id: string | null
          first_in_time: string | null
          id: string
          last_out_time: string | null
          market_laborer_count: number | null
          site_id: string
          total_expense: number | null
          total_laborer_count: number | null
          total_salary: number | null
          total_snacks: number | null
          updated_at: string | null
          updated_by: string | null
          updated_by_user_id: string | null
          work_description: string | null
          work_progress_percent: number | null
          work_status: string | null
          work_updates: Json | null
        }
        Insert: {
          comments?: string | null
          contract_laborer_count?: number | null
          created_at?: string | null
          daily_laborer_count?: number | null
          date: string
          default_snacks_per_person?: number | null
          entered_by?: string | null
          entered_by_user_id?: string | null
          first_in_time?: string | null
          id?: string
          last_out_time?: string | null
          market_laborer_count?: number | null
          site_id: string
          total_expense?: number | null
          total_laborer_count?: number | null
          total_salary?: number | null
          total_snacks?: number | null
          updated_at?: string | null
          updated_by?: string | null
          updated_by_user_id?: string | null
          work_description?: string | null
          work_progress_percent?: number | null
          work_status?: string | null
          work_updates?: Json | null
        }
        Update: {
          comments?: string | null
          contract_laborer_count?: number | null
          created_at?: string | null
          daily_laborer_count?: number | null
          date?: string
          default_snacks_per_person?: number | null
          entered_by?: string | null
          entered_by_user_id?: string | null
          first_in_time?: string | null
          id?: string
          last_out_time?: string | null
          market_laborer_count?: number | null
          site_id?: string
          total_expense?: number | null
          total_laborer_count?: number | null
          total_salary?: number | null
          total_snacks?: number | null
          updated_at?: string | null
          updated_by?: string | null
          updated_by_user_id?: string | null
          work_description?: string | null
          work_progress_percent?: number | null
          work_status?: string | null
          work_updates?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_work_summary_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_work_summary_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "daily_work_summary_updated_by_user_id_fkey"
            columns: ["updated_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      default_building_sections: {
        Row: {
          description: string | null
          id: string
          is_active: boolean
          name: string
          sequence_order: number
        }
        Insert: {
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sequence_order?: number
        }
        Update: {
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sequence_order?: number
        }
        Relationships: []
      }
      deletion_requests: {
        Row: {
          created_at: string
          executed_at: string | null
          id: string
          reason: string | null
          record_id: string
          record_summary: string | null
          requested_at: string
          requested_by: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["deletion_request_status"]
          table_name: string
        }
        Insert: {
          created_at?: string
          executed_at?: string | null
          id?: string
          reason?: string | null
          record_id: string
          record_summary?: string | null
          requested_at?: string
          requested_by: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["deletion_request_status"]
          table_name: string
        }
        Update: {
          created_at?: string
          executed_at?: string | null
          id?: string
          reason?: string | null
          record_id?: string
          record_summary?: string | null
          requested_at?: string
          requested_by?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["deletion_request_status"]
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "deletion_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deletion_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      deliveries: {
        Row: {
          challan_date: string | null
          challan_number: string | null
          challan_url: string | null
          created_at: string | null
          created_by: string | null
          delivery_date: string
          delivery_photos: Json | null
          delivery_status: Database["public"]["Enums"]["delivery_status"] | null
          discrepancies: Json | null
          driver_name: string | null
          driver_phone: string | null
          engineer_verified_at: string | null
          engineer_verified_by: string | null
          grn_number: string
          id: string
          inspection_notes: string | null
          invoice_amount: number | null
          invoice_date: string | null
          invoice_number: string | null
          invoice_url: string | null
          location_id: string | null
          notes: string | null
          po_id: string | null
          received_by: string | null
          recorded_at: string | null
          recorded_by: string | null
          requires_verification: boolean | null
          site_id: string
          updated_at: string | null
          vehicle_number: string | null
          vendor_id: string
          verification_notes: string | null
          verification_photos: string[] | null
          verification_status: string | null
          verified: boolean | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          challan_date?: string | null
          challan_number?: string | null
          challan_url?: string | null
          created_at?: string | null
          created_by?: string | null
          delivery_date?: string
          delivery_photos?: Json | null
          delivery_status?:
            | Database["public"]["Enums"]["delivery_status"]
            | null
          discrepancies?: Json | null
          driver_name?: string | null
          driver_phone?: string | null
          engineer_verified_at?: string | null
          engineer_verified_by?: string | null
          grn_number: string
          id?: string
          inspection_notes?: string | null
          invoice_amount?: number | null
          invoice_date?: string | null
          invoice_number?: string | null
          invoice_url?: string | null
          location_id?: string | null
          notes?: string | null
          po_id?: string | null
          received_by?: string | null
          recorded_at?: string | null
          recorded_by?: string | null
          requires_verification?: boolean | null
          site_id: string
          updated_at?: string | null
          vehicle_number?: string | null
          vendor_id: string
          verification_notes?: string | null
          verification_photos?: string[] | null
          verification_status?: string | null
          verified?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          challan_date?: string | null
          challan_number?: string | null
          challan_url?: string | null
          created_at?: string | null
          created_by?: string | null
          delivery_date?: string
          delivery_photos?: Json | null
          delivery_status?:
            | Database["public"]["Enums"]["delivery_status"]
            | null
          discrepancies?: Json | null
          driver_name?: string | null
          driver_phone?: string | null
          engineer_verified_at?: string | null
          engineer_verified_by?: string | null
          grn_number?: string
          id?: string
          inspection_notes?: string | null
          invoice_amount?: number | null
          invoice_date?: string | null
          invoice_number?: string | null
          invoice_url?: string | null
          location_id?: string | null
          notes?: string | null
          po_id?: string | null
          received_by?: string | null
          recorded_at?: string | null
          recorded_by?: string | null
          requires_verification?: boolean | null
          site_id?: string
          updated_at?: string | null
          vehicle_number?: string | null
          vendor_id?: string
          verification_notes?: string | null
          verification_photos?: string[] | null
          verification_status?: string | null
          verified?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_engineer_verified_by_fkey"
            columns: ["engineer_verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "v_pending_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "deliveries_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_items: {
        Row: {
          accepted_qty: number | null
          batch_number: string | null
          brand_id: string | null
          created_at: string | null
          delivery_id: string
          expiry_date: string | null
          id: string
          material_id: string
          notes: string | null
          ordered_qty: number | null
          po_item_id: string | null
          received_qty: number
          rejected_qty: number | null
          rejection_reason: string | null
          unit_price: number | null
        }
        Insert: {
          accepted_qty?: number | null
          batch_number?: string | null
          brand_id?: string | null
          created_at?: string | null
          delivery_id: string
          expiry_date?: string | null
          id?: string
          material_id: string
          notes?: string | null
          ordered_qty?: number | null
          po_item_id?: string | null
          received_qty: number
          rejected_qty?: number | null
          rejection_reason?: string | null
          unit_price?: number | null
        }
        Update: {
          accepted_qty?: number | null
          batch_number?: string | null
          brand_id?: string | null
          created_at?: string | null
          delivery_id?: string
          expiry_date?: string | null
          id?: string
          material_id?: string
          notes?: string | null
          ordered_qty?: number | null
          po_item_id?: string | null
          received_qty?: number
          rejected_qty?: number | null
          rejection_reason?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_items_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "material_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_items_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_items_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "v_delivery_verification_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_items_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "v_pending_delivery_verifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_group_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "delivery_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock_alerts"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "delivery_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_materials_with_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_site_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "delivery_items_po_item_id_fkey"
            columns: ["po_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      engineer_reimbursements: {
        Row: {
          amount: number
          created_at: string | null
          engineer_id: string
          expense_transaction_id: string
          id: string
          notes: string | null
          payer_name: string | null
          payer_source: string
          payment_mode: string
          proof_url: string | null
          settled_by_name: string | null
          settled_by_user_id: string | null
          settled_date: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          engineer_id: string
          expense_transaction_id: string
          id?: string
          notes?: string | null
          payer_name?: string | null
          payer_source: string
          payment_mode: string
          proof_url?: string | null
          settled_by_name?: string | null
          settled_by_user_id?: string | null
          settled_date?: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          engineer_id?: string
          expense_transaction_id?: string
          id?: string
          notes?: string | null
          payer_name?: string | null
          payer_source?: string
          payment_mode?: string
          proof_url?: string | null
          settled_by_name?: string | null
          settled_by_user_id?: string | null
          settled_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "engineer_reimbursements_engineer_id_fkey"
            columns: ["engineer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engineer_reimbursements_expense_transaction_id_fkey"
            columns: ["expense_transaction_id"]
            isOneToOne: false
            referencedRelation: "site_engineer_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engineer_reimbursements_settled_by_user_id_fkey"
            columns: ["settled_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      engineer_wallet_batch_usage: {
        Row: {
          amount_used: number
          batch_transaction_id: string
          created_at: string | null
          id: string
          transaction_id: string
        }
        Insert: {
          amount_used: number
          batch_transaction_id: string
          created_at?: string | null
          id?: string
          transaction_id: string
        }
        Update: {
          amount_used?: number
          batch_transaction_id?: string
          created_at?: string | null
          id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "engineer_wallet_batch_usage_batch_transaction_id_fkey"
            columns: ["batch_transaction_id"]
            isOneToOne: false
            referencedRelation: "site_engineer_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engineer_wallet_batch_usage_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "site_engineer_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment: {
        Row: {
          brand: string | null
          camera_details: Json | null
          category_id: string | null
          company_id: string
          condition: Database["public"]["Enums"]["equipment_condition"] | null
          created_at: string | null
          created_by: string | null
          current_location_type:
            | Database["public"]["Enums"]["equipment_location_type"]
            | null
          current_site_id: string | null
          deployed_at: string | null
          description: string | null
          equipment_code: string
          id: string
          is_active: boolean | null
          last_maintenance_date: string | null
          maintenance_interval_days: number | null
          manufacturer: string | null
          model_number: string | null
          name: string
          next_maintenance_date: string | null
          notes: string | null
          parent_equipment_id: string | null
          payment_source: string | null
          photos: string[] | null
          primary_photo_url: string | null
          purchase_cost: number | null
          purchase_date: string | null
          purchase_source:
            | Database["public"]["Enums"]["equipment_purchase_source"]
            | null
          purchase_vendor_id: string | null
          responsible_laborer_id: string | null
          responsible_user_id: string | null
          serial_number: string | null
          specifications: Json | null
          status: Database["public"]["Enums"]["equipment_status"]
          updated_at: string | null
          updated_by: string | null
          warehouse_location: string | null
          warranty_expiry_date: string | null
        }
        Insert: {
          brand?: string | null
          camera_details?: Json | null
          category_id?: string | null
          company_id: string
          condition?: Database["public"]["Enums"]["equipment_condition"] | null
          created_at?: string | null
          created_by?: string | null
          current_location_type?:
            | Database["public"]["Enums"]["equipment_location_type"]
            | null
          current_site_id?: string | null
          deployed_at?: string | null
          description?: string | null
          equipment_code: string
          id?: string
          is_active?: boolean | null
          last_maintenance_date?: string | null
          maintenance_interval_days?: number | null
          manufacturer?: string | null
          model_number?: string | null
          name: string
          next_maintenance_date?: string | null
          notes?: string | null
          parent_equipment_id?: string | null
          payment_source?: string | null
          photos?: string[] | null
          primary_photo_url?: string | null
          purchase_cost?: number | null
          purchase_date?: string | null
          purchase_source?:
            | Database["public"]["Enums"]["equipment_purchase_source"]
            | null
          purchase_vendor_id?: string | null
          responsible_laborer_id?: string | null
          responsible_user_id?: string | null
          serial_number?: string | null
          specifications?: Json | null
          status?: Database["public"]["Enums"]["equipment_status"]
          updated_at?: string | null
          updated_by?: string | null
          warehouse_location?: string | null
          warranty_expiry_date?: string | null
        }
        Update: {
          brand?: string | null
          camera_details?: Json | null
          category_id?: string | null
          company_id?: string
          condition?: Database["public"]["Enums"]["equipment_condition"] | null
          created_at?: string | null
          created_by?: string | null
          current_location_type?:
            | Database["public"]["Enums"]["equipment_location_type"]
            | null
          current_site_id?: string | null
          deployed_at?: string | null
          description?: string | null
          equipment_code?: string
          id?: string
          is_active?: boolean | null
          last_maintenance_date?: string | null
          maintenance_interval_days?: number | null
          manufacturer?: string | null
          model_number?: string | null
          name?: string
          next_maintenance_date?: string | null
          notes?: string | null
          parent_equipment_id?: string | null
          payment_source?: string | null
          photos?: string[] | null
          primary_photo_url?: string | null
          purchase_cost?: number | null
          purchase_date?: string | null
          purchase_source?:
            | Database["public"]["Enums"]["equipment_purchase_source"]
            | null
          purchase_vendor_id?: string | null
          responsible_laborer_id?: string | null
          responsible_user_id?: string | null
          serial_number?: string | null
          specifications?: Json | null
          status?: Database["public"]["Enums"]["equipment_status"]
          updated_at?: string | null
          updated_by?: string | null
          warehouse_location?: string | null
          warranty_expiry_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "equipment_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_current_site_id_fkey"
            columns: ["current_site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_current_site_id_fkey"
            columns: ["current_site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "equipment_parent_equipment_id_fkey"
            columns: ["parent_equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_purchase_vendor_id_fkey"
            columns: ["purchase_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_responsible_laborer_id_fkey"
            columns: ["responsible_laborer_id"]
            isOneToOne: false
            referencedRelation: "laborers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_responsible_laborer_id_fkey"
            columns: ["responsible_laborer_id"]
            isOneToOne: false
            referencedRelation: "v_laborer_advance_summary"
            referencedColumns: ["laborer_id"]
          },
        ]
      }
      equipment_categories: {
        Row: {
          code: string
          code_prefix: string
          company_id: string
          created_at: string | null
          default_maintenance_interval_days: number | null
          description: string | null
          display_order: number | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          parent_id: string | null
          updated_at: string | null
        }
        Insert: {
          code: string
          code_prefix: string
          company_id: string
          created_at?: string | null
          default_maintenance_interval_days?: number | null
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          parent_id?: string | null
          updated_at?: string | null
        }
        Update: {
          code?: string
          code_prefix?: string
          company_id?: string
          created_at?: string | null
          default_maintenance_interval_days?: number | null
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          parent_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "equipment_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_maintenance: {
        Row: {
          condition_after:
            | Database["public"]["Enums"]["equipment_condition"]
            | null
          condition_before:
            | Database["public"]["Enums"]["equipment_condition"]
            | null
          cost: number | null
          created_at: string | null
          created_by: string | null
          description: string | null
          equipment_id: string
          id: string
          maintenance_date: string
          maintenance_type: Database["public"]["Enums"]["maintenance_type"]
          next_maintenance_date: string | null
          notes: string | null
          performed_by: string | null
          receipt_url: string | null
          vendor_id: string | null
        }
        Insert: {
          condition_after?:
            | Database["public"]["Enums"]["equipment_condition"]
            | null
          condition_before?:
            | Database["public"]["Enums"]["equipment_condition"]
            | null
          cost?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          equipment_id: string
          id?: string
          maintenance_date?: string
          maintenance_type: Database["public"]["Enums"]["maintenance_type"]
          next_maintenance_date?: string | null
          notes?: string | null
          performed_by?: string | null
          receipt_url?: string | null
          vendor_id?: string | null
        }
        Update: {
          condition_after?:
            | Database["public"]["Enums"]["equipment_condition"]
            | null
          condition_before?:
            | Database["public"]["Enums"]["equipment_condition"]
            | null
          cost?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          equipment_id?: string
          id?: string
          maintenance_date?: string
          maintenance_type?: Database["public"]["Enums"]["maintenance_type"]
          next_maintenance_date?: string | null
          notes?: string | null
          performed_by?: string | null
          receipt_url?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_maintenance_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_maintenance_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_memory_cards: {
        Row: {
          assigned_at: string | null
          assigned_equipment_id: string | null
          brand: string | null
          capacity_gb: number
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          model: string | null
          notes: string | null
          serial_number: string | null
          speed_class: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_equipment_id?: string | null
          brand?: string | null
          capacity_gb: number
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          model?: string | null
          notes?: string | null
          serial_number?: string | null
          speed_class?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_equipment_id?: string | null
          brand?: string | null
          capacity_gb?: number
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          model?: string | null
          notes?: string | null
          serial_number?: string | null
          speed_class?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_memory_cards_assigned_equipment_id_fkey"
            columns: ["assigned_equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_sim_assignment_history: {
        Row: {
          assigned_at: string
          created_by: string | null
          equipment_id: string | null
          id: string
          notes: string | null
          sim_card_id: string
          unassigned_at: string | null
        }
        Insert: {
          assigned_at: string
          created_by?: string | null
          equipment_id?: string | null
          id?: string
          notes?: string | null
          sim_card_id: string
          unassigned_at?: string | null
        }
        Update: {
          assigned_at?: string
          created_by?: string | null
          equipment_id?: string | null
          id?: string
          notes?: string | null
          sim_card_id?: string
          unassigned_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_sim_assignment_history_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_sim_assignment_history_sim_card_id_fkey"
            columns: ["sim_card_id"]
            isOneToOne: false
            referencedRelation: "equipment_sim_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_sim_cards: {
        Row: {
          assigned_at: string | null
          assigned_equipment_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          is_data_sim: boolean | null
          monthly_plan: string | null
          notes: string | null
          operator: Database["public"]["Enums"]["sim_operator"]
          phone_number: string
          purchase_date: string | null
          sim_serial_number: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_equipment_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          is_data_sim?: boolean | null
          monthly_plan?: string | null
          notes?: string | null
          operator: Database["public"]["Enums"]["sim_operator"]
          phone_number: string
          purchase_date?: string | null
          sim_serial_number?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_equipment_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          is_data_sim?: boolean | null
          monthly_plan?: string | null
          notes?: string | null
          operator?: Database["public"]["Enums"]["sim_operator"]
          phone_number?: string
          purchase_date?: string | null
          sim_serial_number?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_sim_cards_assigned_equipment_id_fkey"
            columns: ["assigned_equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_sim_recharges: {
        Row: {
          amount: number
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          payment_mode: string | null
          payment_reference: string | null
          plan_description: string | null
          receipt_url: string | null
          recharge_date: string
          sim_card_id: string
          validity_days: number | null
          validity_end_date: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_mode?: string | null
          payment_reference?: string | null
          plan_description?: string | null
          receipt_url?: string | null
          recharge_date?: string
          sim_card_id: string
          validity_days?: number | null
          validity_end_date?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_mode?: string | null
          payment_reference?: string | null
          plan_description?: string | null
          receipt_url?: string | null
          recharge_date?: string
          sim_card_id?: string
          validity_days?: number | null
          validity_end_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_sim_recharges_sim_card_id_fkey"
            columns: ["sim_card_id"]
            isOneToOne: false
            referencedRelation: "equipment_sim_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_transfers: {
        Row: {
          condition_at_handover:
            | Database["public"]["Enums"]["equipment_condition"]
            | null
          condition_at_receipt:
            | Database["public"]["Enums"]["equipment_condition"]
            | null
          condition_notes: string | null
          created_at: string | null
          equipment_id: string
          from_location_type: Database["public"]["Enums"]["equipment_location_type"]
          from_responsible_laborer_id: string | null
          from_responsible_user_id: string | null
          from_site_id: string | null
          from_warehouse_location: string | null
          handover_photos: string[] | null
          id: string
          initiated_at: string | null
          initiated_by: string | null
          is_working: boolean | null
          notes: string | null
          reason: string | null
          received_at: string | null
          received_by: string | null
          received_date: string | null
          receiving_photos: string[] | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["equipment_transfer_status"]
          to_location_type: Database["public"]["Enums"]["equipment_location_type"]
          to_responsible_laborer_id: string | null
          to_responsible_user_id: string | null
          to_site_id: string | null
          to_warehouse_location: string | null
          transfer_date: string
          transfer_number: string | null
          updated_at: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          condition_at_handover?:
            | Database["public"]["Enums"]["equipment_condition"]
            | null
          condition_at_receipt?:
            | Database["public"]["Enums"]["equipment_condition"]
            | null
          condition_notes?: string | null
          created_at?: string | null
          equipment_id: string
          from_location_type: Database["public"]["Enums"]["equipment_location_type"]
          from_responsible_laborer_id?: string | null
          from_responsible_user_id?: string | null
          from_site_id?: string | null
          from_warehouse_location?: string | null
          handover_photos?: string[] | null
          id?: string
          initiated_at?: string | null
          initiated_by?: string | null
          is_working?: boolean | null
          notes?: string | null
          reason?: string | null
          received_at?: string | null
          received_by?: string | null
          received_date?: string | null
          receiving_photos?: string[] | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["equipment_transfer_status"]
          to_location_type: Database["public"]["Enums"]["equipment_location_type"]
          to_responsible_laborer_id?: string | null
          to_responsible_user_id?: string | null
          to_site_id?: string | null
          to_warehouse_location?: string | null
          transfer_date?: string
          transfer_number?: string | null
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          condition_at_handover?:
            | Database["public"]["Enums"]["equipment_condition"]
            | null
          condition_at_receipt?:
            | Database["public"]["Enums"]["equipment_condition"]
            | null
          condition_notes?: string | null
          created_at?: string | null
          equipment_id?: string
          from_location_type?: Database["public"]["Enums"]["equipment_location_type"]
          from_responsible_laborer_id?: string | null
          from_responsible_user_id?: string | null
          from_site_id?: string | null
          from_warehouse_location?: string | null
          handover_photos?: string[] | null
          id?: string
          initiated_at?: string | null
          initiated_by?: string | null
          is_working?: boolean | null
          notes?: string | null
          reason?: string | null
          received_at?: string | null
          received_by?: string | null
          received_date?: string | null
          receiving_photos?: string[] | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["equipment_transfer_status"]
          to_location_type?: Database["public"]["Enums"]["equipment_location_type"]
          to_responsible_laborer_id?: string | null
          to_responsible_user_id?: string | null
          to_site_id?: string | null
          to_warehouse_location?: string | null
          transfer_date?: string
          transfer_number?: string | null
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_transfers_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_transfers_from_responsible_laborer_id_fkey"
            columns: ["from_responsible_laborer_id"]
            isOneToOne: false
            referencedRelation: "laborers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_transfers_from_responsible_laborer_id_fkey"
            columns: ["from_responsible_laborer_id"]
            isOneToOne: false
            referencedRelation: "v_laborer_advance_summary"
            referencedColumns: ["laborer_id"]
          },
          {
            foreignKeyName: "equipment_transfers_from_site_id_fkey"
            columns: ["from_site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_transfers_from_site_id_fkey"
            columns: ["from_site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "equipment_transfers_to_responsible_laborer_id_fkey"
            columns: ["to_responsible_laborer_id"]
            isOneToOne: false
            referencedRelation: "laborers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_transfers_to_responsible_laborer_id_fkey"
            columns: ["to_responsible_laborer_id"]
            isOneToOne: false
            referencedRelation: "v_laborer_advance_summary"
            referencedColumns: ["laborer_id"]
          },
          {
            foreignKeyName: "equipment_transfers_to_site_id_fkey"
            columns: ["to_site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_transfers_to_site_id_fkey"
            columns: ["to_site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          is_recurring: boolean
          module: Database["public"]["Enums"]["expense_module"]
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          is_recurring?: boolean
          module?: Database["public"]["Enums"]["expense_module"]
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          is_recurring?: boolean
          module?: Database["public"]["Enums"]["expense_module"]
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category_id: string
          cleared_date: string | null
          contract_id: string | null
          created_at: string
          date: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          engineer_transaction_id: string | null
          entered_by: string | null
          entered_by_user_id: string | null
          id: string
          is_cleared: boolean
          is_deleted: boolean
          is_recurring: boolean
          laborer_id: string | null
          module: Database["public"]["Enums"]["expense_module"]
          notes: string | null
          paid_by: string | null
          payment_mode: Database["public"]["Enums"]["payment_mode"] | null
          receipt_url: string | null
          reference_number: string | null
          section_id: string | null
          site_id: string | null
          site_payer_id: string | null
          team_id: string | null
          updated_at: string
          vendor_contact: string | null
          vendor_name: string | null
          week_ending: string | null
        }
        Insert: {
          amount: number
          category_id: string
          cleared_date?: string | null
          contract_id?: string | null
          created_at?: string
          date: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          engineer_transaction_id?: string | null
          entered_by?: string | null
          entered_by_user_id?: string | null
          id?: string
          is_cleared?: boolean
          is_deleted?: boolean
          is_recurring?: boolean
          laborer_id?: string | null
          module?: Database["public"]["Enums"]["expense_module"]
          notes?: string | null
          paid_by?: string | null
          payment_mode?: Database["public"]["Enums"]["payment_mode"] | null
          receipt_url?: string | null
          reference_number?: string | null
          section_id?: string | null
          site_id?: string | null
          site_payer_id?: string | null
          team_id?: string | null
          updated_at?: string
          vendor_contact?: string | null
          vendor_name?: string | null
          week_ending?: string | null
        }
        Update: {
          amount?: number
          category_id?: string
          cleared_date?: string | null
          contract_id?: string | null
          created_at?: string
          date?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          engineer_transaction_id?: string | null
          entered_by?: string | null
          entered_by_user_id?: string | null
          id?: string
          is_cleared?: boolean
          is_deleted?: boolean
          is_recurring?: boolean
          laborer_id?: string | null
          module?: Database["public"]["Enums"]["expense_module"]
          notes?: string | null
          paid_by?: string | null
          payment_mode?: Database["public"]["Enums"]["payment_mode"] | null
          receipt_url?: string | null
          reference_number?: string | null
          section_id?: string | null
          site_id?: string | null
          site_payer_id?: string | null
          team_id?: string | null
          updated_at?: string
          vendor_contact?: string | null
          vendor_name?: string | null
          week_ending?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "subcontracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_subcontract_reconciliation"
            referencedColumns: ["subcontract_id"]
          },
          {
            foreignKeyName: "expenses_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_engineer_transaction_id_fkey"
            columns: ["engineer_transaction_id"]
            isOneToOne: false
            referencedRelation: "site_engineer_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_entered_by_user_id_fkey"
            columns: ["entered_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_laborer_id_fkey"
            columns: ["laborer_id"]
            isOneToOne: false
            referencedRelation: "laborers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_laborer_id_fkey"
            columns: ["laborer_id"]
            isOneToOne: false
            referencedRelation: "v_laborer_advance_summary"
            referencedColumns: ["laborer_id"]
          },
          {
            foreignKeyName: "expenses_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "building_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "v_section_cost_summary"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "expenses_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "expenses_site_payer_id_fkey"
            columns: ["site_payer_id"]
            isOneToOne: false
            referencedRelation: "payer_expense_summary"
            referencedColumns: ["payer_id"]
          },
          {
            foreignKeyName: "expenses_site_payer_id_fkey"
            columns: ["site_payer_id"]
            isOneToOne: false
            referencedRelation: "site_payers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_weekly_summary"
            referencedColumns: ["team_id"]
          },
        ]
      }
      group_stock_inventory: {
        Row: {
          available_qty: number | null
          avg_unit_cost: number | null
          batch_code: string | null
          batch_status: string | null
          brand_id: string | null
          can_be_shared: boolean | null
          created_at: string | null
          current_qty: number
          dedicated_site_id: string | null
          id: string
          is_dedicated: boolean | null
          last_received_date: string | null
          last_used_date: string | null
          location_id: string | null
          material_id: string
          original_quantity: number | null
          remaining_quantity: number | null
          reorder_level: number | null
          reorder_qty: number | null
          reserved_qty: number
          site_group_id: string
          total_value: number | null
          updated_at: string | null
        }
        Insert: {
          available_qty?: number | null
          avg_unit_cost?: number | null
          batch_code?: string | null
          batch_status?: string | null
          brand_id?: string | null
          can_be_shared?: boolean | null
          created_at?: string | null
          current_qty?: number
          dedicated_site_id?: string | null
          id?: string
          is_dedicated?: boolean | null
          last_received_date?: string | null
          last_used_date?: string | null
          location_id?: string | null
          material_id: string
          original_quantity?: number | null
          remaining_quantity?: number | null
          reorder_level?: number | null
          reorder_qty?: number | null
          reserved_qty?: number
          site_group_id: string
          total_value?: number | null
          updated_at?: string | null
        }
        Update: {
          available_qty?: number | null
          avg_unit_cost?: number | null
          batch_code?: string | null
          batch_status?: string | null
          brand_id?: string | null
          can_be_shared?: boolean | null
          created_at?: string | null
          current_qty?: number
          dedicated_site_id?: string | null
          id?: string
          is_dedicated?: boolean | null
          last_received_date?: string | null
          last_used_date?: string | null
          location_id?: string | null
          material_id?: string
          original_quantity?: number | null
          remaining_quantity?: number | null
          reorder_level?: number | null
          reorder_qty?: number | null
          reserved_qty?: number
          site_group_id?: string
          total_value?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_stock_inventory_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "material_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_inventory_dedicated_site_id_fkey"
            columns: ["dedicated_site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_inventory_dedicated_site_id_fkey"
            columns: ["dedicated_site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "group_stock_inventory_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_group_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "group_stock_inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock_alerts"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "group_stock_inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_materials_with_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_site_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "group_stock_inventory_site_group_id_fkey"
            columns: ["site_group_id"]
            isOneToOne: false
            referencedRelation: "site_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_stock_transactions: {
        Row: {
          batch_ref_code: string | null
          batch_status: string | null
          bill_url: string | null
          brand_id: string | null
          created_at: string | null
          created_by: string | null
          expense_id: string | null
          id: string
          inventory_id: string
          material_id: string
          notes: string | null
          payment_mode: string | null
          payment_reference: string | null
          payment_screenshot_url: string | null
          payment_source: string | null
          payment_source_site_id: string | null
          quantity: number
          ref_code: string | null
          reference_id: string | null
          reference_type: string | null
          settlement_id: string | null
          site_group_id: string
          total_cost: number | null
          transaction_date: string
          transaction_type: Database["public"]["Enums"]["stock_transaction_type"]
          unit_cost: number | null
          updated_at: string
          usage_site_id: string | null
          vendor_id: string | null
          vendor_name: string | null
          work_description: string | null
        }
        Insert: {
          batch_ref_code?: string | null
          batch_status?: string | null
          bill_url?: string | null
          brand_id?: string | null
          created_at?: string | null
          created_by?: string | null
          expense_id?: string | null
          id?: string
          inventory_id: string
          material_id: string
          notes?: string | null
          payment_mode?: string | null
          payment_reference?: string | null
          payment_screenshot_url?: string | null
          payment_source?: string | null
          payment_source_site_id?: string | null
          quantity: number
          ref_code?: string | null
          reference_id?: string | null
          reference_type?: string | null
          settlement_id?: string | null
          site_group_id: string
          total_cost?: number | null
          transaction_date?: string
          transaction_type: Database["public"]["Enums"]["stock_transaction_type"]
          unit_cost?: number | null
          updated_at?: string
          usage_site_id?: string | null
          vendor_id?: string | null
          vendor_name?: string | null
          work_description?: string | null
        }
        Update: {
          batch_ref_code?: string | null
          batch_status?: string | null
          bill_url?: string | null
          brand_id?: string | null
          created_at?: string | null
          created_by?: string | null
          expense_id?: string | null
          id?: string
          inventory_id?: string
          material_id?: string
          notes?: string | null
          payment_mode?: string | null
          payment_reference?: string | null
          payment_screenshot_url?: string | null
          payment_source?: string | null
          payment_source_site_id?: string | null
          quantity?: number
          ref_code?: string | null
          reference_id?: string | null
          reference_type?: string | null
          settlement_id?: string | null
          site_group_id?: string
          total_cost?: number | null
          transaction_date?: string
          transaction_type?: Database["public"]["Enums"]["stock_transaction_type"]
          unit_cost?: number | null
          updated_at?: string
          usage_site_id?: string | null
          vendor_id?: string | null
          vendor_name?: string | null
          work_description?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_stock_transactions_batch_ref_code_fkey"
            columns: ["batch_ref_code"]
            isOneToOne: false
            referencedRelation: "material_purchase_expenses"
            referencedColumns: ["ref_code"]
          },
          {
            foreignKeyName: "group_stock_transactions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "material_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_transactions_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "group_stock_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_transactions_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["inventory_id"]
          },
          {
            foreignKeyName: "group_stock_transactions_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "v_stock_by_batch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_transactions_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_transactions_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_group_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "group_stock_transactions_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock_alerts"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "group_stock_transactions_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_materials_with_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_transactions_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_site_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "group_stock_transactions_payment_source_site_id_fkey"
            columns: ["payment_source_site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_transactions_payment_source_site_id_fkey"
            columns: ["payment_source_site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "group_stock_transactions_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "inter_site_material_settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_transactions_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "v_pending_inter_site_settlements"
            referencedColumns: ["settlement_id"]
          },
          {
            foreignKeyName: "group_stock_transactions_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "v_settlement_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_transactions_site_group_id_fkey"
            columns: ["site_group_id"]
            isOneToOne: false
            referencedRelation: "site_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_transactions_usage_site_id_fkey"
            columns: ["usage_site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_transactions_usage_site_id_fkey"
            columns: ["usage_site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
        ]
      }
      import_logs: {
        Row: {
          created_at: string
          error_details: Json | null
          error_rows: number
          file_name: string | null
          file_size: number | null
          id: string
          import_type: string
          imported_by: string | null
          skipped_rows: number
          status: string
          success_rows: number
          total_rows: number
        }
        Insert: {
          created_at?: string
          error_details?: Json | null
          error_rows?: number
          file_name?: string | null
          file_size?: number | null
          id?: string
          import_type: string
          imported_by?: string | null
          skipped_rows?: number
          status?: string
          success_rows?: number
          total_rows?: number
        }
        Update: {
          created_at?: string
          error_details?: Json | null
          error_rows?: number
          file_name?: string | null
          file_size?: number | null
          id?: string
          import_type?: string
          imported_by?: string | null
          skipped_rows?: number
          status?: string
          success_rows?: number
          total_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_logs_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      inter_site_material_settlements: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          batch_ref_code: string | null
          bill_url: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string | null
          created_by: string | null
          final_settlement_amount: number | null
          from_site_id: string
          id: string
          notes: string | null
          original_calculated_amount: number | null
          paid_amount: number | null
          pending_amount: number | null
          period_end: string
          period_start: string
          settled_at: string | null
          settled_by: string | null
          settlement_code: string
          site_group_id: string
          status:
            | Database["public"]["Enums"]["inter_site_settlement_status"]
            | null
          to_site_id: string
          total_amount: number
          updated_at: string | null
          week_number: number
          year: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          batch_ref_code?: string | null
          bill_url?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string | null
          created_by?: string | null
          final_settlement_amount?: number | null
          from_site_id: string
          id?: string
          notes?: string | null
          original_calculated_amount?: number | null
          paid_amount?: number | null
          pending_amount?: number | null
          period_end: string
          period_start: string
          settled_at?: string | null
          settled_by?: string | null
          settlement_code: string
          site_group_id: string
          status?:
            | Database["public"]["Enums"]["inter_site_settlement_status"]
            | null
          to_site_id: string
          total_amount: number
          updated_at?: string | null
          week_number: number
          year: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          batch_ref_code?: string | null
          bill_url?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string | null
          created_by?: string | null
          final_settlement_amount?: number | null
          from_site_id?: string
          id?: string
          notes?: string | null
          original_calculated_amount?: number | null
          paid_amount?: number | null
          pending_amount?: number | null
          period_end?: string
          period_start?: string
          settled_at?: string | null
          settled_by?: string | null
          settlement_code?: string
          site_group_id?: string
          status?:
            | Database["public"]["Enums"]["inter_site_settlement_status"]
            | null
          to_site_id?: string
          total_amount?: number
          updated_at?: string | null
          week_number?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_inter_site_settlements_batch"
            columns: ["batch_ref_code"]
            isOneToOne: false
            referencedRelation: "material_purchase_expenses"
            referencedColumns: ["ref_code"]
          },
          {
            foreignKeyName: "inter_site_material_settlements_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_site_material_settlements_batch_ref_code_fkey"
            columns: ["batch_ref_code"]
            isOneToOne: false
            referencedRelation: "material_purchase_expenses"
            referencedColumns: ["ref_code"]
          },
          {
            foreignKeyName: "inter_site_material_settlements_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_site_material_settlements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_site_material_settlements_from_site_id_fkey"
            columns: ["from_site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_site_material_settlements_from_site_id_fkey"
            columns: ["from_site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "inter_site_material_settlements_settled_by_fkey"
            columns: ["settled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_site_material_settlements_site_group_id_fkey"
            columns: ["site_group_id"]
            isOneToOne: false
            referencedRelation: "site_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_site_material_settlements_to_site_id_fkey"
            columns: ["to_site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_site_material_settlements_to_site_id_fkey"
            columns: ["to_site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
        ]
      }
      inter_site_settlement_items: {
        Row: {
          batch_code: string | null
          brand_id: string | null
          created_at: string | null
          id: string
          material_id: string
          notes: string | null
          quantity_used: number
          settlement_id: string
          total_cost: number
          transaction_id: string | null
          unit: string
          unit_cost: number
          usage_date: string
        }
        Insert: {
          batch_code?: string | null
          brand_id?: string | null
          created_at?: string | null
          id?: string
          material_id: string
          notes?: string | null
          quantity_used: number
          settlement_id: string
          total_cost: number
          transaction_id?: string | null
          unit: string
          unit_cost: number
          usage_date: string
        }
        Update: {
          batch_code?: string | null
          brand_id?: string | null
          created_at?: string | null
          id?: string
          material_id?: string
          notes?: string | null
          quantity_used?: number
          settlement_id?: string
          total_cost?: number
          transaction_id?: string | null
          unit?: string
          unit_cost?: number
          usage_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "inter_site_settlement_items_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "material_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_site_settlement_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_site_settlement_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_group_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "inter_site_settlement_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock_alerts"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "inter_site_settlement_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_materials_with_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_site_settlement_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_site_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "inter_site_settlement_items_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "inter_site_material_settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_site_settlement_items_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "v_pending_inter_site_settlements"
            referencedColumns: ["settlement_id"]
          },
          {
            foreignKeyName: "inter_site_settlement_items_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "v_settlement_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_site_settlement_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "group_stock_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      inter_site_settlement_payments: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          notes: string | null
          payment_date: string
          payment_mode: string | null
          payment_source: string | null
          recorded_by: string | null
          reference_number: string | null
          settlement_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_mode?: string | null
          payment_source?: string | null
          recorded_by?: string | null
          reference_number?: string | null
          settlement_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_mode?: string | null
          payment_source?: string | null
          recorded_by?: string | null
          reference_number?: string | null
          settlement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inter_site_settlement_payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_site_settlement_payments_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "inter_site_material_settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_site_settlement_payments_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "v_pending_inter_site_settlements"
            referencedColumns: ["settlement_id"]
          },
          {
            foreignKeyName: "inter_site_settlement_payments_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "v_settlement_details"
            referencedColumns: ["id"]
          },
        ]
      }
      labor_categories: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          is_system_seed: boolean
          name: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          is_system_seed?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          is_system_seed?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "labor_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      labor_payments: {
        Row: {
          actual_payment_date: string | null
          advance_deduction_from_payment_id: string | null
          amount: number
          attendance_id: string | null
          created_at: string | null
          id: string
          is_advance_deduction: boolean | null
          is_under_contract: boolean | null
          laborer_id: string
          notes: string | null
          paid_by: string
          paid_by_user_id: string | null
          payment_channel: string
          payment_date: string
          payment_for_date: string
          payment_mode: string
          payment_reference: string | null
          payment_type: string | null
          proof_url: string | null
          recorded_by: string
          recorded_by_user_id: string | null
          settlement_group_id: string | null
          site_engineer_transaction_id: string | null
          site_id: string
          subcontract_id: string | null
        }
        Insert: {
          actual_payment_date?: string | null
          advance_deduction_from_payment_id?: string | null
          amount: number
          attendance_id?: string | null
          created_at?: string | null
          id?: string
          is_advance_deduction?: boolean | null
          is_under_contract?: boolean | null
          laborer_id: string
          notes?: string | null
          paid_by: string
          paid_by_user_id?: string | null
          payment_channel: string
          payment_date?: string
          payment_for_date: string
          payment_mode: string
          payment_reference?: string | null
          payment_type?: string | null
          proof_url?: string | null
          recorded_by: string
          recorded_by_user_id?: string | null
          settlement_group_id?: string | null
          site_engineer_transaction_id?: string | null
          site_id: string
          subcontract_id?: string | null
        }
        Update: {
          actual_payment_date?: string | null
          advance_deduction_from_payment_id?: string | null
          amount?: number
          attendance_id?: string | null
          created_at?: string | null
          id?: string
          is_advance_deduction?: boolean | null
          is_under_contract?: boolean | null
          laborer_id?: string
          notes?: string | null
          paid_by?: string
          paid_by_user_id?: string | null
          payment_channel?: string
          payment_date?: string
          payment_for_date?: string
          payment_mode?: string
          payment_reference?: string | null
          payment_type?: string | null
          proof_url?: string | null
          recorded_by?: string
          recorded_by_user_id?: string | null
          settlement_group_id?: string | null
          site_engineer_transaction_id?: string | null
          site_id?: string
          subcontract_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "labor_payments_advance_deduction_from_payment_id_fkey"
            columns: ["advance_deduction_from_payment_id"]
            isOneToOne: false
            referencedRelation: "labor_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labor_payments_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "daily_attendance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labor_payments_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "v_active_attendance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labor_payments_laborer_id_fkey"
            columns: ["laborer_id"]
            isOneToOne: false
            referencedRelation: "laborers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labor_payments_laborer_id_fkey"
            columns: ["laborer_id"]
            isOneToOne: false
            referencedRelation: "v_laborer_advance_summary"
            referencedColumns: ["laborer_id"]
          },
          {
            foreignKeyName: "labor_payments_paid_by_user_id_fkey"
            columns: ["paid_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labor_payments_recorded_by_user_id_fkey"
            columns: ["recorded_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labor_payments_settlement_group_id_fkey"
            columns: ["settlement_group_id"]
            isOneToOne: false
            referencedRelation: "settlement_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labor_payments_site_engineer_transaction_id_fkey"
            columns: ["site_engineer_transaction_id"]
            isOneToOne: false
            referencedRelation: "site_engineer_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labor_payments_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labor_payments_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "labor_payments_subcontract_id_fkey"
            columns: ["subcontract_id"]
            isOneToOne: false
            referencedRelation: "subcontracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labor_payments_subcontract_id_fkey"
            columns: ["subcontract_id"]
            isOneToOne: false
            referencedRelation: "v_subcontract_reconciliation"
            referencedColumns: ["subcontract_id"]
          },
        ]
      }
      labor_roles: {
        Row: {
          category_id: string
          company_id: string
          created_at: string
          default_daily_rate: number
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          is_market_role: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          category_id: string
          company_id: string
          created_at?: string
          default_daily_rate?: number
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          is_market_role?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          company_id?: string
          created_at?: string
          default_daily_rate?: number
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          is_market_role?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "labor_roles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "labor_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labor_roles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_site_daily_by_category"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "labor_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      laborer_site_assignments: {
        Row: {
          assigned_date: string
          created_at: string
          id: string
          is_active: boolean
          laborer_id: string
          notes: string | null
          site_id: string
          unassigned_date: string | null
        }
        Insert: {
          assigned_date?: string
          created_at?: string
          id?: string
          is_active?: boolean
          laborer_id: string
          notes?: string | null
          site_id: string
          unassigned_date?: string | null
        }
        Update: {
          assigned_date?: string
          created_at?: string
          id?: string
          is_active?: boolean
          laborer_id?: string
          notes?: string | null
          site_id?: string
          unassigned_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "laborer_site_assignments_laborer_id_fkey"
            columns: ["laborer_id"]
            isOneToOne: false
            referencedRelation: "laborers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "laborer_site_assignments_laborer_id_fkey"
            columns: ["laborer_id"]
            isOneToOne: false
            referencedRelation: "v_laborer_advance_summary"
            referencedColumns: ["laborer_id"]
          },
          {
            foreignKeyName: "laborer_site_assignments_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "laborer_site_assignments_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
        ]
      }
      laborers: {
        Row: {
          address: string | null
          age: number | null
          alternate_phone: string | null
          associated_team_id: string | null
          category_id: string
          company_id: string
          created_at: string
          daily_rate: number
          deactivation_date: string | null
          deactivation_reason: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          employment_type: Database["public"]["Enums"]["employment_type"]
          id: string
          id_proof_number: string | null
          id_proof_type: string | null
          joining_date: string | null
          laborer_type: string | null
          language: string | null
          name: string
          notes: string | null
          phone: string | null
          photo_url: string | null
          role_id: string
          status: Database["public"]["Enums"]["laborer_status"]
          team_id: string | null
          total_advance_deducted: number | null
          total_advance_given: number | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          age?: number | null
          alternate_phone?: string | null
          associated_team_id?: string | null
          category_id: string
          company_id: string
          created_at?: string
          daily_rate?: number
          deactivation_date?: string | null
          deactivation_reason?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employment_type?: Database["public"]["Enums"]["employment_type"]
          id?: string
          id_proof_number?: string | null
          id_proof_type?: string | null
          joining_date?: string | null
          laborer_type?: string | null
          language?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          role_id: string
          status?: Database["public"]["Enums"]["laborer_status"]
          team_id?: string | null
          total_advance_deducted?: number | null
          total_advance_given?: number | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          age?: number | null
          alternate_phone?: string | null
          associated_team_id?: string | null
          category_id?: string
          company_id?: string
          created_at?: string
          daily_rate?: number
          deactivation_date?: string | null
          deactivation_reason?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employment_type?: Database["public"]["Enums"]["employment_type"]
          id?: string
          id_proof_number?: string | null
          id_proof_type?: string | null
          joining_date?: string | null
          laborer_type?: string | null
          language?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          role_id?: string
          status?: Database["public"]["Enums"]["laborer_status"]
          team_id?: string | null
          total_advance_deducted?: number | null
          total_advance_given?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "laborers_associated_team_id_fkey"
            columns: ["associated_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "laborers_associated_team_id_fkey"
            columns: ["associated_team_id"]
            isOneToOne: false
            referencedRelation: "v_team_weekly_summary"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "laborers_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "labor_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "laborers_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_site_daily_by_category"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "laborers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "laborers_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "labor_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "laborers_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "v_section_cost_by_role"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "laborers_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "v_team_weekly_by_role"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "laborers_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "laborers_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_weekly_summary"
            referencedColumns: ["team_id"]
          },
        ]
      }
      market_laborer_attendance: {
        Row: {
          attendance_status: string | null
          break_hours: number | null
          confirmed_at: string | null
          count: number
          created_at: string | null
          date: string
          day_units: number | null
          engineer_transaction_id: string | null
          entered_by: string
          entered_by_user_id: string | null
          expense_id: string | null
          id: string
          in_time: string | null
          is_paid: boolean | null
          lunch_in: string | null
          lunch_out: string | null
          morning_entry_at: string | null
          notes: string | null
          out_time: string | null
          paid_via: string | null
          payer_name: string | null
          payer_source: string | null
          payment_date: string | null
          payment_mode: string | null
          payment_notes: string | null
          payment_proof_url: string | null
          rate_per_person: number
          role_id: string
          salary_override_per_person: number | null
          salary_override_reason: string | null
          section_id: string | null
          settlement_group_id: string | null
          site_id: string
          snacks_per_person: number | null
          subcontract_id: string | null
          total_cost: number
          total_hours: number | null
          total_snacks: number | null
          updated_at: string | null
          updated_by: string | null
          updated_by_user_id: string | null
          work_days: number
          work_hours: number | null
          worker_index: number
        }
        Insert: {
          attendance_status?: string | null
          break_hours?: number | null
          confirmed_at?: string | null
          count?: number
          created_at?: string | null
          date: string
          day_units?: number | null
          engineer_transaction_id?: string | null
          entered_by: string
          entered_by_user_id?: string | null
          expense_id?: string | null
          id?: string
          in_time?: string | null
          is_paid?: boolean | null
          lunch_in?: string | null
          lunch_out?: string | null
          morning_entry_at?: string | null
          notes?: string | null
          out_time?: string | null
          paid_via?: string | null
          payer_name?: string | null
          payer_source?: string | null
          payment_date?: string | null
          payment_mode?: string | null
          payment_notes?: string | null
          payment_proof_url?: string | null
          rate_per_person: number
          role_id: string
          salary_override_per_person?: number | null
          salary_override_reason?: string | null
          section_id?: string | null
          settlement_group_id?: string | null
          site_id: string
          snacks_per_person?: number | null
          subcontract_id?: string | null
          total_cost: number
          total_hours?: number | null
          total_snacks?: number | null
          updated_at?: string | null
          updated_by?: string | null
          updated_by_user_id?: string | null
          work_days?: number
          work_hours?: number | null
          worker_index?: number
        }
        Update: {
          attendance_status?: string | null
          break_hours?: number | null
          confirmed_at?: string | null
          count?: number
          created_at?: string | null
          date?: string
          day_units?: number | null
          engineer_transaction_id?: string | null
          entered_by?: string
          entered_by_user_id?: string | null
          expense_id?: string | null
          id?: string
          in_time?: string | null
          is_paid?: boolean | null
          lunch_in?: string | null
          lunch_out?: string | null
          morning_entry_at?: string | null
          notes?: string | null
          out_time?: string | null
          paid_via?: string | null
          payer_name?: string | null
          payer_source?: string | null
          payment_date?: string | null
          payment_mode?: string | null
          payment_notes?: string | null
          payment_proof_url?: string | null
          rate_per_person?: number
          role_id?: string
          salary_override_per_person?: number | null
          salary_override_reason?: string | null
          section_id?: string | null
          settlement_group_id?: string | null
          site_id?: string
          snacks_per_person?: number | null
          subcontract_id?: string | null
          total_cost?: number
          total_hours?: number | null
          total_snacks?: number | null
          updated_at?: string | null
          updated_by?: string | null
          updated_by_user_id?: string | null
          work_days?: number
          work_hours?: number | null
          worker_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "market_laborer_attendance_engineer_transaction_id_fkey"
            columns: ["engineer_transaction_id"]
            isOneToOne: false
            referencedRelation: "site_engineer_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_laborer_attendance_entered_by_user_id_fkey"
            columns: ["entered_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_laborer_attendance_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_laborer_attendance_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "labor_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_laborer_attendance_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "v_section_cost_by_role"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "market_laborer_attendance_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "v_team_weekly_by_role"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "market_laborer_attendance_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "building_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_laborer_attendance_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "v_section_cost_summary"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "market_laborer_attendance_settlement_group_id_fkey"
            columns: ["settlement_group_id"]
            isOneToOne: false
            referencedRelation: "settlement_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_laborer_attendance_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_laborer_attendance_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "market_laborer_attendance_subcontract_id_fkey"
            columns: ["subcontract_id"]
            isOneToOne: false
            referencedRelation: "subcontracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_laborer_attendance_subcontract_id_fkey"
            columns: ["subcontract_id"]
            isOneToOne: false
            referencedRelation: "v_subcontract_reconciliation"
            referencedColumns: ["subcontract_id"]
          },
          {
            foreignKeyName: "market_laborer_attendance_updated_by_user_id_fkey"
            columns: ["updated_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      material_brands: {
        Row: {
          brand_name: string
          created_at: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          is_preferred: boolean | null
          material_id: string
          notes: string | null
          quality_rating: number | null
          variant_name: string | null
        }
        Insert: {
          brand_name: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_preferred?: boolean | null
          material_id: string
          notes?: string | null
          quality_rating?: number | null
          variant_name?: string | null
        }
        Update: {
          brand_name?: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_preferred?: boolean | null
          material_id?: string
          notes?: string | null
          quality_rating?: number | null
          variant_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_brands_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_brands_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_group_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "material_brands_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock_alerts"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "material_brands_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_materials_with_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_brands_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_site_stock_summary"
            referencedColumns: ["material_id"]
          },
        ]
      }
      material_categories: {
        Row: {
          code: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          parent_id: string | null
          updated_at: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          parent_id?: string | null
          updated_at?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          parent_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "material_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      material_purchase_expense_items: {
        Row: {
          brand_id: string | null
          created_at: string | null
          id: string
          material_id: string
          notes: string | null
          purchase_expense_id: string
          quantity: number
          total_price: number | null
          unit_price: number
        }
        Insert: {
          brand_id?: string | null
          created_at?: string | null
          id?: string
          material_id: string
          notes?: string | null
          purchase_expense_id: string
          quantity: number
          total_price?: number | null
          unit_price: number
        }
        Update: {
          brand_id?: string | null
          created_at?: string | null
          id?: string
          material_id?: string
          notes?: string | null
          purchase_expense_id?: string
          quantity?: number
          total_price?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "material_purchase_expense_items_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "material_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_purchase_expense_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_purchase_expense_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_group_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "material_purchase_expense_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock_alerts"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "material_purchase_expense_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_materials_with_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_purchase_expense_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_site_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "material_purchase_expense_items_purchase_expense_id_fkey"
            columns: ["purchase_expense_id"]
            isOneToOne: false
            referencedRelation: "material_purchase_expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      material_purchase_expenses: {
        Row: {
          amount_paid: number | null
          bill_url: string | null
          converted_from_group: boolean | null
          created_at: string | null
          created_by: string | null
          group_stock_transaction_id: string | null
          id: string
          is_paid: boolean | null
          local_purchase_id: string | null
          notes: string | null
          original_batch_code: string | null
          original_qty: number | null
          paid_date: string | null
          paying_site_id: string | null
          payment_mode: string | null
          payment_reference: string | null
          payment_screenshot_url: string | null
          purchase_date: string
          purchase_order_id: string | null
          purchase_type: string
          ref_code: string
          remaining_qty: number | null
          self_used_amount: number | null
          self_used_qty: number | null
          settlement_date: string | null
          settlement_payer_name: string | null
          settlement_payer_source: string | null
          settlement_reference: string | null
          site_group_id: string | null
          site_id: string
          status: string | null
          total_amount: number
          transport_cost: number | null
          updated_at: string | null
          used_qty: number | null
          vendor_id: string | null
          vendor_name: string | null
        }
        Insert: {
          amount_paid?: number | null
          bill_url?: string | null
          converted_from_group?: boolean | null
          created_at?: string | null
          created_by?: string | null
          group_stock_transaction_id?: string | null
          id?: string
          is_paid?: boolean | null
          local_purchase_id?: string | null
          notes?: string | null
          original_batch_code?: string | null
          original_qty?: number | null
          paid_date?: string | null
          paying_site_id?: string | null
          payment_mode?: string | null
          payment_reference?: string | null
          payment_screenshot_url?: string | null
          purchase_date: string
          purchase_order_id?: string | null
          purchase_type: string
          ref_code: string
          remaining_qty?: number | null
          self_used_amount?: number | null
          self_used_qty?: number | null
          settlement_date?: string | null
          settlement_payer_name?: string | null
          settlement_payer_source?: string | null
          settlement_reference?: string | null
          site_group_id?: string | null
          site_id: string
          status?: string | null
          total_amount: number
          transport_cost?: number | null
          updated_at?: string | null
          used_qty?: number | null
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Update: {
          amount_paid?: number | null
          bill_url?: string | null
          converted_from_group?: boolean | null
          created_at?: string | null
          created_by?: string | null
          group_stock_transaction_id?: string | null
          id?: string
          is_paid?: boolean | null
          local_purchase_id?: string | null
          notes?: string | null
          original_batch_code?: string | null
          original_qty?: number | null
          paid_date?: string | null
          paying_site_id?: string | null
          payment_mode?: string | null
          payment_reference?: string | null
          payment_screenshot_url?: string | null
          purchase_date?: string
          purchase_order_id?: string | null
          purchase_type?: string
          ref_code?: string
          remaining_qty?: number | null
          self_used_amount?: number | null
          self_used_qty?: number | null
          settlement_date?: string | null
          settlement_payer_name?: string | null
          settlement_payer_source?: string | null
          settlement_reference?: string | null
          site_group_id?: string | null
          site_id?: string
          status?: string | null
          total_amount?: number
          transport_cost?: number | null
          updated_at?: string | null
          used_qty?: number | null
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_purchase_expenses_group_stock_transaction_id_fkey"
            columns: ["group_stock_transaction_id"]
            isOneToOne: false
            referencedRelation: "group_stock_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_purchase_expenses_paying_site_id_fkey"
            columns: ["paying_site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_purchase_expenses_paying_site_id_fkey"
            columns: ["paying_site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "material_purchase_expenses_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_purchase_expenses_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "v_pending_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_purchase_expenses_site_group_id_fkey"
            columns: ["site_group_id"]
            isOneToOne: false
            referencedRelation: "site_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_purchase_expenses_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_purchase_expenses_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "material_purchase_expenses_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      material_request_items: {
        Row: {
          approved_qty: number | null
          brand_id: string | null
          created_at: string | null
          estimated_cost: number | null
          fulfilled_qty: number | null
          id: string
          material_id: string
          notes: string | null
          request_id: string
          requested_qty: number
        }
        Insert: {
          approved_qty?: number | null
          brand_id?: string | null
          created_at?: string | null
          estimated_cost?: number | null
          fulfilled_qty?: number | null
          id?: string
          material_id: string
          notes?: string | null
          request_id: string
          requested_qty: number
        }
        Update: {
          approved_qty?: number | null
          brand_id?: string | null
          created_at?: string | null
          estimated_cost?: number | null
          fulfilled_qty?: number | null
          id?: string
          material_id?: string
          notes?: string | null
          request_id?: string
          requested_qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "material_request_items_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "material_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_request_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_request_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_group_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "material_request_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock_alerts"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "material_request_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_materials_with_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_request_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_site_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "material_request_items_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "material_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      material_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          converted_to_po_id: string | null
          created_at: string | null
          id: string
          notes: string | null
          priority: string | null
          rejection_reason: string | null
          request_date: string
          request_number: string
          requested_by: string
          required_by_date: string | null
          section_id: string | null
          site_id: string
          status: Database["public"]["Enums"]["material_request_status"] | null
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          converted_to_po_id?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          priority?: string | null
          rejection_reason?: string | null
          request_date?: string
          request_number: string
          requested_by: string
          required_by_date?: string | null
          section_id?: string | null
          site_id: string
          status?: Database["public"]["Enums"]["material_request_status"] | null
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          converted_to_po_id?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          priority?: string | null
          rejection_reason?: string | null
          request_date?: string
          request_number?: string
          requested_by?: string
          required_by_date?: string | null
          section_id?: string | null
          site_id?: string
          status?: Database["public"]["Enums"]["material_request_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requests_converted_to_po_id_fkey"
            columns: ["converted_to_po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requests_converted_to_po_id_fkey"
            columns: ["converted_to_po_id"]
            isOneToOne: false
            referencedRelation: "v_pending_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requests_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "building_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requests_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "v_section_cost_summary"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "material_requests_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requests_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
        ]
      }
      material_vendors: {
        Row: {
          brand_id: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          is_preferred: boolean | null
          last_price_update: string | null
          lead_time_days: number | null
          material_id: string
          min_order_qty: number | null
          notes: string | null
          unit_price: number
          updated_at: string | null
          vendor_id: string
        }
        Insert: {
          brand_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_preferred?: boolean | null
          last_price_update?: string | null
          lead_time_days?: number | null
          material_id: string
          min_order_qty?: number | null
          notes?: string | null
          unit_price: number
          updated_at?: string | null
          vendor_id: string
        }
        Update: {
          brand_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_preferred?: boolean | null
          last_price_update?: string | null
          lead_time_days?: number | null
          material_id?: string
          min_order_qty?: number | null
          notes?: string | null
          unit_price?: number
          updated_at?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_vendors_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "material_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_vendors_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_vendors_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_group_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "material_vendors_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock_alerts"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "material_vendors_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_materials_with_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_vendors_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_site_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "material_vendors_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          category_id: string | null
          code: string | null
          conversion_factor: number | null
          created_at: string | null
          created_by: string | null
          description: string | null
          gst_rate: number | null
          hsn_code: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          length_per_piece: number | null
          length_unit: string | null
          local_name: string | null
          min_order_qty: number | null
          name: string
          parent_id: string | null
          reorder_level: number | null
          rods_per_bundle: number | null
          secondary_unit: Database["public"]["Enums"]["material_unit"] | null
          specifications: Json | null
          unit: Database["public"]["Enums"]["material_unit"]
          updated_at: string | null
          weight_per_unit: number | null
          weight_unit: string | null
        }
        Insert: {
          category_id?: string | null
          code?: string | null
          conversion_factor?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          gst_rate?: number | null
          hsn_code?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          length_per_piece?: number | null
          length_unit?: string | null
          local_name?: string | null
          min_order_qty?: number | null
          name: string
          parent_id?: string | null
          reorder_level?: number | null
          rods_per_bundle?: number | null
          secondary_unit?: Database["public"]["Enums"]["material_unit"] | null
          specifications?: Json | null
          unit?: Database["public"]["Enums"]["material_unit"]
          updated_at?: string | null
          weight_per_unit?: number | null
          weight_unit?: string | null
        }
        Update: {
          category_id?: string | null
          code?: string | null
          conversion_factor?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          gst_rate?: number | null
          hsn_code?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          length_per_piece?: number | null
          length_unit?: string | null
          local_name?: string | null
          min_order_qty?: number | null
          name?: string
          parent_id?: string | null
          reorder_level?: number | null
          rods_per_bundle?: number | null
          secondary_unit?: Database["public"]["Enums"]["material_unit"] | null
          specifications?: Json | null
          unit?: Database["public"]["Enums"]["material_unit"]
          updated_at?: string | null
          weight_per_unit?: number | null
          weight_unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "materials_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "material_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_group_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "materials_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock_alerts"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "materials_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_materials_with_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_site_stock_summary"
            referencedColumns: ["material_id"]
          },
        ]
      }
      misc_expenses: {
        Row: {
          amount: number
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by_user_id: string | null
          category_id: string | null
          created_at: string | null
          created_by: string | null
          created_by_name: string | null
          date: string
          description: string | null
          engineer_transaction_id: string | null
          id: string
          is_cancelled: boolean | null
          is_cleared: boolean | null
          notes: string | null
          payer_name: string | null
          payer_source: string | null
          payer_type: string | null
          payment_mode: string | null
          proof_url: string | null
          reference_number: string
          site_engineer_id: string | null
          site_id: string
          subcontract_id: string | null
          updated_at: string | null
          vendor_name: string | null
        }
        Insert: {
          amount: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_user_id?: string | null
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          created_by_name?: string | null
          date: string
          description?: string | null
          engineer_transaction_id?: string | null
          id?: string
          is_cancelled?: boolean | null
          is_cleared?: boolean | null
          notes?: string | null
          payer_name?: string | null
          payer_source?: string | null
          payer_type?: string | null
          payment_mode?: string | null
          proof_url?: string | null
          reference_number: string
          site_engineer_id?: string | null
          site_id: string
          subcontract_id?: string | null
          updated_at?: string | null
          vendor_name?: string | null
        }
        Update: {
          amount?: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_user_id?: string | null
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          created_by_name?: string | null
          date?: string
          description?: string | null
          engineer_transaction_id?: string | null
          id?: string
          is_cancelled?: boolean | null
          is_cleared?: boolean | null
          notes?: string | null
          payer_name?: string | null
          payer_source?: string | null
          payer_type?: string | null
          payment_mode?: string | null
          proof_url?: string | null
          reference_number?: string
          site_engineer_id?: string | null
          site_id?: string
          subcontract_id?: string | null
          updated_at?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "misc_expenses_cancelled_by_user_id_fkey"
            columns: ["cancelled_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "misc_expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "misc_expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "misc_expenses_engineer_transaction_id_fkey"
            columns: ["engineer_transaction_id"]
            isOneToOne: false
            referencedRelation: "site_engineer_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "misc_expenses_site_engineer_id_fkey"
            columns: ["site_engineer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "misc_expenses_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "misc_expenses_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "misc_expenses_subcontract_id_fkey"
            columns: ["subcontract_id"]
            isOneToOne: false
            referencedRelation: "subcontracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "misc_expenses_subcontract_id_fkey"
            columns: ["subcontract_id"]
            isOneToOne: false
            referencedRelation: "v_subcontract_reconciliation"
            referencedColumns: ["subcontract_id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          created_at: string
          expires_at: string | null
          id: string
          is_read: boolean
          message: string
          notification_type: string
          read_at: string | null
          related_id: string | null
          related_table: string | null
          site_id: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          action_url?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_read?: boolean
          message: string
          notification_type: string
          read_at?: string | null
          related_id?: string | null
          related_table?: string | null
          site_id?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          action_url?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_read?: boolean
          message?: string
          notification_type?: string
          read_at?: string | null
          related_id?: string | null
          related_table?: string | null
          site_id?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
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
      payment_phases: {
        Row: {
          amount: number
          construction_phase_id: string | null
          created_at: string
          description: string | null
          expected_date: string | null
          id: string
          is_milestone: boolean
          notes: string | null
          payment_plan_id: string
          percentage: number
          phase_name: string
          sequence_order: number
          updated_at: string
        }
        Insert: {
          amount: number
          construction_phase_id?: string | null
          created_at?: string
          description?: string | null
          expected_date?: string | null
          id?: string
          is_milestone?: boolean
          notes?: string | null
          payment_plan_id: string
          percentage: number
          phase_name: string
          sequence_order?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          construction_phase_id?: string | null
          created_at?: string
          description?: string | null
          expected_date?: string | null
          id?: string
          is_milestone?: boolean
          notes?: string | null
          payment_plan_id?: string
          percentage?: number
          phase_name?: string
          sequence_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_phases_payment_plan_id_fkey"
            columns: ["payment_plan_id"]
            isOneToOne: false
            referencedRelation: "client_payment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_week_allocations: {
        Row: {
          allocated_amount: number
          created_at: string
          id: string
          labor_payment_id: string
          laborer_id: string
          site_id: string
          week_end: string
          week_start: string
        }
        Insert: {
          allocated_amount: number
          created_at?: string
          id?: string
          labor_payment_id: string
          laborer_id: string
          site_id: string
          week_end: string
          week_start: string
        }
        Update: {
          allocated_amount?: number
          created_at?: string
          id?: string
          labor_payment_id?: string
          laborer_id?: string
          site_id?: string
          week_end?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_week_allocations_labor_payment_id_fkey"
            columns: ["labor_payment_id"]
            isOneToOne: false
            referencedRelation: "labor_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_week_allocations_laborer_id_fkey"
            columns: ["laborer_id"]
            isOneToOne: false
            referencedRelation: "laborers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_week_allocations_laborer_id_fkey"
            columns: ["laborer_id"]
            isOneToOne: false
            referencedRelation: "v_laborer_advance_summary"
            referencedColumns: ["laborer_id"]
          },
          {
            foreignKeyName: "payment_week_allocations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_week_allocations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
        ]
      }
      price_alerts: {
        Row: {
          alert_type: string
          brand_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          last_triggered_at: string | null
          material_id: string
          threshold_percent: number | null
          threshold_value: number | null
          trigger_count: number | null
          updated_at: string | null
        }
        Insert: {
          alert_type: string
          brand_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          material_id: string
          threshold_percent?: number | null
          threshold_value?: number | null
          trigger_count?: number | null
          updated_at?: string | null
        }
        Update: {
          alert_type?: string
          brand_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          material_id?: string
          threshold_percent?: number | null
          threshold_value?: number | null
          trigger_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_alerts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "material_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_alerts_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_alerts_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_group_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "price_alerts_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock_alerts"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "price_alerts_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_materials_with_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_alerts_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_site_stock_summary"
            referencedColumns: ["material_id"]
          },
        ]
      }
      price_alerts_triggered: {
        Row: {
          acknowledged: boolean | null
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_id: string
          change_percent: number
          id: string
          new_price: number
          old_price: number
          source_reference: string | null
          triggered_at: string | null
          vendor_id: string | null
        }
        Insert: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_id: string
          change_percent: number
          id?: string
          new_price: number
          old_price: number
          source_reference?: string | null
          triggered_at?: string | null
          vendor_id?: string | null
        }
        Update: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_id?: string
          change_percent?: number
          id?: string
          new_price?: number
          old_price?: number
          source_reference?: string | null
          triggered_at?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_alerts_triggered_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "price_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_alerts_triggered_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      price_change_reasons: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_increase: boolean | null
          reason: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_increase?: boolean | null
          reason: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_increase?: boolean | null
          reason?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      price_history: {
        Row: {
          bill_date: string | null
          bill_number: string | null
          bill_url: string | null
          brand_id: string | null
          change_percentage: number | null
          change_reason_id: string | null
          change_reason_text: string | null
          created_at: string | null
          gst_rate: number | null
          id: string
          loading_cost: number | null
          material_id: string
          notes: string | null
          price: number
          price_includes_gst: boolean | null
          quantity: number | null
          recorded_by: string | null
          recorded_date: string
          source: string
          source_reference: string | null
          total_landed_cost: number | null
          transport_cost: number | null
          unit: string | null
          unloading_cost: number | null
          vendor_id: string
        }
        Insert: {
          bill_date?: string | null
          bill_number?: string | null
          bill_url?: string | null
          brand_id?: string | null
          change_percentage?: number | null
          change_reason_id?: string | null
          change_reason_text?: string | null
          created_at?: string | null
          gst_rate?: number | null
          id?: string
          loading_cost?: number | null
          material_id: string
          notes?: string | null
          price: number
          price_includes_gst?: boolean | null
          quantity?: number | null
          recorded_by?: string | null
          recorded_date: string
          source: string
          source_reference?: string | null
          total_landed_cost?: number | null
          transport_cost?: number | null
          unit?: string | null
          unloading_cost?: number | null
          vendor_id: string
        }
        Update: {
          bill_date?: string | null
          bill_number?: string | null
          bill_url?: string | null
          brand_id?: string | null
          change_percentage?: number | null
          change_reason_id?: string | null
          change_reason_text?: string | null
          created_at?: string | null
          gst_rate?: number | null
          id?: string
          loading_cost?: number | null
          material_id?: string
          notes?: string | null
          price?: number
          price_includes_gst?: boolean | null
          quantity?: number | null
          recorded_by?: string | null
          recorded_date?: string
          source?: string
          source_reference?: string | null
          total_landed_cost?: number | null
          transport_cost?: number | null
          unit?: string | null
          unloading_cost?: number | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_history_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "material_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_change_reason_id_fkey"
            columns: ["change_reason_id"]
            isOneToOne: false
            referencedRelation: "price_change_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_group_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "price_history_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock_alerts"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "price_history_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_materials_with_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_site_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "price_history_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          actual_weight: number | null
          actual_weight_per_piece: number | null
          brand_id: string | null
          calculated_weight: number | null
          created_at: string | null
          description: string | null
          discount_amount: number | null
          discount_percent: number | null
          id: string
          material_id: string
          notes: string | null
          pending_qty: number | null
          po_id: string
          pricing_mode: string | null
          quantity: number
          received_qty: number | null
          tax_amount: number | null
          tax_rate: number | null
          total_amount: number
          unit_price: number
        }
        Insert: {
          actual_weight?: number | null
          actual_weight_per_piece?: number | null
          brand_id?: string | null
          calculated_weight?: number | null
          created_at?: string | null
          description?: string | null
          discount_amount?: number | null
          discount_percent?: number | null
          id?: string
          material_id: string
          notes?: string | null
          pending_qty?: number | null
          po_id: string
          pricing_mode?: string | null
          quantity: number
          received_qty?: number | null
          tax_amount?: number | null
          tax_rate?: number | null
          total_amount: number
          unit_price: number
        }
        Update: {
          actual_weight?: number | null
          actual_weight_per_piece?: number | null
          brand_id?: string | null
          calculated_weight?: number | null
          created_at?: string | null
          description?: string | null
          discount_amount?: number | null
          discount_percent?: number | null
          id?: string
          material_id?: string
          notes?: string | null
          pending_qty?: number | null
          po_id?: string
          pricing_mode?: string | null
          quantity?: number
          received_qty?: number | null
          tax_amount?: number | null
          tax_rate?: number | null
          total_amount?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "material_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_group_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "purchase_order_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock_alerts"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "purchase_order_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_materials_with_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_site_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "purchase_order_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "v_pending_purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_request_items: {
        Row: {
          created_at: string | null
          id: string
          po_item_id: string
          quantity_allocated: number
          request_item_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          po_item_id: string
          quantity_allocated: number
          request_item_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          po_item_id?: string
          quantity_allocated?: number
          request_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_request_items_po_item_id_fkey"
            columns: ["po_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_request_items_request_item_id_fkey"
            columns: ["request_item_id"]
            isOneToOne: false
            referencedRelation: "material_request_items"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          advance_paid: number | null
          approved_at: string | null
          approved_by: string | null
          bill_verification_notes: string | null
          bill_verified: boolean | null
          bill_verified_at: string | null
          bill_verified_by: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string | null
          created_by: string | null
          delivery_address: string | null
          delivery_location_id: string | null
          discount_amount: number | null
          expected_delivery_date: string | null
          id: string
          internal_notes: string | null
          notes: string | null
          order_date: string
          other_charges: number | null
          payment_terms: string | null
          payment_timing: string | null
          po_document_url: string | null
          po_number: string
          quotation_url: string | null
          site_id: string
          source_request_id: string | null
          status: Database["public"]["Enums"]["po_status"] | null
          subtotal: number | null
          tax_amount: number | null
          total_amount: number | null
          transport_cost: number | null
          updated_at: string | null
          vendor_bill_url: string | null
          vendor_id: string
        }
        Insert: {
          advance_paid?: number | null
          approved_at?: string | null
          approved_by?: string | null
          bill_verification_notes?: string | null
          bill_verified?: boolean | null
          bill_verified_at?: string | null
          bill_verified_by?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string | null
          created_by?: string | null
          delivery_address?: string | null
          delivery_location_id?: string | null
          discount_amount?: number | null
          expected_delivery_date?: string | null
          id?: string
          internal_notes?: string | null
          notes?: string | null
          order_date?: string
          other_charges?: number | null
          payment_terms?: string | null
          payment_timing?: string | null
          po_document_url?: string | null
          po_number: string
          quotation_url?: string | null
          site_id: string
          source_request_id?: string | null
          status?: Database["public"]["Enums"]["po_status"] | null
          subtotal?: number | null
          tax_amount?: number | null
          total_amount?: number | null
          transport_cost?: number | null
          updated_at?: string | null
          vendor_bill_url?: string | null
          vendor_id: string
        }
        Update: {
          advance_paid?: number | null
          approved_at?: string | null
          approved_by?: string | null
          bill_verification_notes?: string | null
          bill_verified?: boolean | null
          bill_verified_at?: string | null
          bill_verified_by?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string | null
          created_by?: string | null
          delivery_address?: string | null
          delivery_location_id?: string | null
          discount_amount?: number | null
          expected_delivery_date?: string | null
          id?: string
          internal_notes?: string | null
          notes?: string | null
          order_date?: string
          other_charges?: number | null
          payment_terms?: string | null
          payment_timing?: string | null
          po_document_url?: string | null
          po_number?: string
          quotation_url?: string | null
          site_id?: string
          source_request_id?: string | null
          status?: Database["public"]["Enums"]["po_status"] | null
          subtotal?: number | null
          tax_amount?: number | null
          total_amount?: number | null
          transport_cost?: number | null
          updated_at?: string | null
          vendor_bill_url?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_delivery_location_id_fkey"
            columns: ["delivery_location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "purchase_orders_source_request_id_fkey"
            columns: ["source_request_id"]
            isOneToOne: false
            referencedRelation: "material_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_payment_allocations: {
        Row: {
          amount: number
          created_at: string | null
          delivery_id: string | null
          id: string
          payment_id: string
          po_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          delivery_id?: string | null
          id?: string
          payment_id: string
          po_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          delivery_id?: string | null
          id?: string
          payment_id?: string
          po_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_payment_allocations_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_payment_allocations_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "v_delivery_verification_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_payment_allocations_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "v_pending_delivery_verifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "purchase_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_payment_allocations_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_payment_allocations_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "v_pending_purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_payments: {
        Row: {
          amount: number
          bank_name: string | null
          created_at: string | null
          created_by: string | null
          id: string
          is_advance: boolean | null
          notes: string | null
          payment_date: string
          payment_mode: string
          receipt_url: string | null
          reference_number: string | null
          site_id: string | null
          vendor_id: string
        }
        Insert: {
          amount: number
          bank_name?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_advance?: boolean | null
          notes?: string | null
          payment_date?: string
          payment_mode: string
          receipt_url?: string | null
          reference_number?: string | null
          site_id?: string | null
          vendor_id: string
        }
        Update: {
          amount?: number
          bank_name?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_advance?: boolean | null
          notes?: string | null
          payment_date?: string
          payment_mode?: string
          receipt_url?: string | null
          reference_number?: string | null
          site_id?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_payments_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_payments_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "purchase_payments_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          endpoint: string
          id: string
          is_active: boolean
          last_used_at: string | null
          p256dh_key: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          endpoint: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          p256dh_key: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          endpoint?: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          p256dh_key?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_advances: {
        Row: {
          advance_date: string
          amount: number
          created_at: string | null
          created_by: string | null
          engineer_transaction_id: string | null
          id: string
          notes: string | null
          payer_name: string | null
          payer_source: string | null
          payment_channel: string | null
          payment_mode: string | null
          proof_url: string | null
          rental_order_id: string
          settlement_group_id: string | null
        }
        Insert: {
          advance_date?: string
          amount: number
          created_at?: string | null
          created_by?: string | null
          engineer_transaction_id?: string | null
          id?: string
          notes?: string | null
          payer_name?: string | null
          payer_source?: string | null
          payment_channel?: string | null
          payment_mode?: string | null
          proof_url?: string | null
          rental_order_id: string
          settlement_group_id?: string | null
        }
        Update: {
          advance_date?: string
          amount?: number
          created_at?: string | null
          created_by?: string | null
          engineer_transaction_id?: string | null
          id?: string
          notes?: string | null
          payer_name?: string | null
          payer_source?: string | null
          payment_channel?: string | null
          payment_mode?: string | null
          proof_url?: string | null
          rental_order_id?: string
          settlement_group_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rental_advances_engineer_transaction_id_fkey"
            columns: ["engineer_transaction_id"]
            isOneToOne: false
            referencedRelation: "site_engineer_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_advances_rental_order_id_fkey"
            columns: ["rental_order_id"]
            isOneToOne: false
            referencedRelation: "rental_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_advances_settlement_group_id_fkey"
            columns: ["settlement_group_id"]
            isOneToOne: false
            referencedRelation: "settlement_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_item_categories: {
        Row: {
          code: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          parent_id: string | null
          updated_at: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          parent_id?: string | null
          updated_at?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          parent_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rental_item_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "rental_item_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_items: {
        Row: {
          category_id: string | null
          code: string | null
          created_at: string | null
          created_by: string | null
          default_daily_rate: number | null
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          local_name: string | null
          name: string
          rate_type: Database["public"]["Enums"]["rental_rate_type"] | null
          rental_type: Database["public"]["Enums"]["rental_type"]
          source_type: Database["public"]["Enums"]["rental_source_type"] | null
          specifications: Json | null
          unit: string
          updated_at: string | null
        }
        Insert: {
          category_id?: string | null
          code?: string | null
          created_at?: string | null
          created_by?: string | null
          default_daily_rate?: number | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          local_name?: string | null
          name: string
          rate_type?: Database["public"]["Enums"]["rental_rate_type"] | null
          rental_type: Database["public"]["Enums"]["rental_type"]
          source_type?: Database["public"]["Enums"]["rental_source_type"] | null
          specifications?: Json | null
          unit?: string
          updated_at?: string | null
        }
        Update: {
          category_id?: string | null
          code?: string | null
          created_at?: string | null
          created_by?: string | null
          default_daily_rate?: number | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          local_name?: string | null
          name?: string
          rate_type?: Database["public"]["Enums"]["rental_rate_type"] | null
          rental_type?: Database["public"]["Enums"]["rental_type"]
          source_type?: Database["public"]["Enums"]["rental_source_type"] | null
          specifications?: Json | null
          unit?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rental_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "rental_item_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_order_items: {
        Row: {
          created_at: string | null
          daily_rate_actual: number
          daily_rate_default: number
          hours_used: number | null
          id: string
          item_expected_return_date: string | null
          item_start_date: string | null
          notes: string | null
          quantity: number
          quantity_outstanding: number | null
          quantity_returned: number | null
          rate_type: Database["public"]["Enums"]["rental_rate_type"] | null
          rental_item_id: string
          rental_order_id: string
          specifications: string | null
          status: Database["public"]["Enums"]["rental_item_status"] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          daily_rate_actual: number
          daily_rate_default: number
          hours_used?: number | null
          id?: string
          item_expected_return_date?: string | null
          item_start_date?: string | null
          notes?: string | null
          quantity: number
          quantity_outstanding?: number | null
          quantity_returned?: number | null
          rate_type?: Database["public"]["Enums"]["rental_rate_type"] | null
          rental_item_id: string
          rental_order_id: string
          specifications?: string | null
          status?: Database["public"]["Enums"]["rental_item_status"] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          daily_rate_actual?: number
          daily_rate_default?: number
          hours_used?: number | null
          id?: string
          item_expected_return_date?: string | null
          item_start_date?: string | null
          notes?: string | null
          quantity?: number
          quantity_outstanding?: number | null
          quantity_returned?: number | null
          rate_type?: Database["public"]["Enums"]["rental_rate_type"] | null
          rental_item_id?: string
          rental_order_id?: string
          specifications?: string | null
          status?: Database["public"]["Enums"]["rental_item_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rental_order_items_rental_item_id_fkey"
            columns: ["rental_item_id"]
            isOneToOne: false
            referencedRelation: "rental_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_order_items_rental_order_id_fkey"
            columns: ["rental_order_id"]
            isOneToOne: false
            referencedRelation: "rental_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_orders: {
        Row: {
          actual_return_date: string | null
          actual_total: number | null
          approved_at: string | null
          approved_by: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string | null
          created_by: string | null
          estimated_total: number | null
          expected_return_date: string | null
          id: string
          internal_notes: string | null
          loading_cost_outward: number | null
          loading_cost_return: number | null
          negotiated_discount_amount: number | null
          negotiated_discount_percentage: number | null
          notes: string | null
          order_date: string
          outward_by: Database["public"]["Enums"]["transport_handler"] | null
          rental_order_number: string
          return_by: Database["public"]["Enums"]["transport_handler"] | null
          return_receipt_url: string | null
          site_id: string
          start_date: string
          status: Database["public"]["Enums"]["rental_order_status"]
          transport_cost_outward: number | null
          transport_cost_return: number | null
          unloading_cost_outward: number | null
          unloading_cost_return: number | null
          updated_at: string | null
          vendor_id: string
          vendor_slip_url: string | null
        }
        Insert: {
          actual_return_date?: string | null
          actual_total?: number | null
          approved_at?: string | null
          approved_by?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string | null
          created_by?: string | null
          estimated_total?: number | null
          expected_return_date?: string | null
          id?: string
          internal_notes?: string | null
          loading_cost_outward?: number | null
          loading_cost_return?: number | null
          negotiated_discount_amount?: number | null
          negotiated_discount_percentage?: number | null
          notes?: string | null
          order_date?: string
          outward_by?: Database["public"]["Enums"]["transport_handler"] | null
          rental_order_number: string
          return_by?: Database["public"]["Enums"]["transport_handler"] | null
          return_receipt_url?: string | null
          site_id: string
          start_date: string
          status?: Database["public"]["Enums"]["rental_order_status"]
          transport_cost_outward?: number | null
          transport_cost_return?: number | null
          unloading_cost_outward?: number | null
          unloading_cost_return?: number | null
          updated_at?: string | null
          vendor_id: string
          vendor_slip_url?: string | null
        }
        Update: {
          actual_return_date?: string | null
          actual_total?: number | null
          approved_at?: string | null
          approved_by?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string | null
          created_by?: string | null
          estimated_total?: number | null
          expected_return_date?: string | null
          id?: string
          internal_notes?: string | null
          loading_cost_outward?: number | null
          loading_cost_return?: number | null
          negotiated_discount_amount?: number | null
          negotiated_discount_percentage?: number | null
          notes?: string | null
          order_date?: string
          outward_by?: Database["public"]["Enums"]["transport_handler"] | null
          rental_order_number?: string
          return_by?: Database["public"]["Enums"]["transport_handler"] | null
          return_receipt_url?: string | null
          site_id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["rental_order_status"]
          transport_cost_outward?: number | null
          transport_cost_return?: number | null
          unloading_cost_outward?: number | null
          unloading_cost_return?: number | null
          updated_at?: string | null
          vendor_id?: string
          vendor_slip_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rental_orders_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_orders_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "rental_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_price_history: {
        Row: {
          created_at: string | null
          daily_rate: number
          id: string
          notes: string | null
          recorded_by: string | null
          recorded_date: string
          rental_item_id: string
          source: Database["public"]["Enums"]["rental_price_source"] | null
          source_reference: string | null
          vendor_id: string
        }
        Insert: {
          created_at?: string | null
          daily_rate: number
          id?: string
          notes?: string | null
          recorded_by?: string | null
          recorded_date?: string
          rental_item_id: string
          source?: Database["public"]["Enums"]["rental_price_source"] | null
          source_reference?: string | null
          vendor_id: string
        }
        Update: {
          created_at?: string | null
          daily_rate?: number
          id?: string
          notes?: string | null
          recorded_by?: string | null
          recorded_date?: string
          rental_item_id?: string
          source?: Database["public"]["Enums"]["rental_price_source"] | null
          source_reference?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_price_history_rental_item_id_fkey"
            columns: ["rental_item_id"]
            isOneToOne: false
            referencedRelation: "rental_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_price_history_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_returns: {
        Row: {
          condition: Database["public"]["Enums"]["return_condition"] | null
          created_at: string | null
          created_by: string | null
          damage_cost: number | null
          damage_description: string | null
          id: string
          notes: string | null
          quantity_returned: number
          receipt_url: string | null
          rental_order_id: string
          rental_order_item_id: string
          return_date: string
        }
        Insert: {
          condition?: Database["public"]["Enums"]["return_condition"] | null
          created_at?: string | null
          created_by?: string | null
          damage_cost?: number | null
          damage_description?: string | null
          id?: string
          notes?: string | null
          quantity_returned: number
          receipt_url?: string | null
          rental_order_id: string
          rental_order_item_id: string
          return_date?: string
        }
        Update: {
          condition?: Database["public"]["Enums"]["return_condition"] | null
          created_at?: string | null
          created_by?: string | null
          damage_cost?: number | null
          damage_description?: string | null
          id?: string
          notes?: string | null
          quantity_returned?: number
          receipt_url?: string | null
          rental_order_id?: string
          rental_order_item_id?: string
          return_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_returns_rental_order_id_fkey"
            columns: ["rental_order_id"]
            isOneToOne: false
            referencedRelation: "rental_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_returns_rental_order_item_id_fkey"
            columns: ["rental_order_item_id"]
            isOneToOne: false
            referencedRelation: "rental_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_settlements: {
        Row: {
          balance_amount: number
          created_at: string | null
          engineer_transaction_id: string | null
          final_receipt_url: string | null
          id: string
          negotiated_final_amount: number | null
          notes: string | null
          payer_name: string | null
          payer_source: string | null
          payment_channel: string | null
          payment_mode: string | null
          rental_order_id: string
          settled_by: string | null
          settled_by_name: string | null
          settlement_date: string
          settlement_group_id: string | null
          settlement_reference: string | null
          subcontract_id: string | null
          total_advance_paid: number | null
          total_damage_amount: number | null
          total_rental_amount: number
          total_transport_amount: number | null
          updated_at: string | null
          upi_screenshot_url: string | null
          vendor_bill_url: string | null
        }
        Insert: {
          balance_amount: number
          created_at?: string | null
          engineer_transaction_id?: string | null
          final_receipt_url?: string | null
          id?: string
          negotiated_final_amount?: number | null
          notes?: string | null
          payer_name?: string | null
          payer_source?: string | null
          payment_channel?: string | null
          payment_mode?: string | null
          rental_order_id: string
          settled_by?: string | null
          settled_by_name?: string | null
          settlement_date?: string
          settlement_group_id?: string | null
          settlement_reference?: string | null
          subcontract_id?: string | null
          total_advance_paid?: number | null
          total_damage_amount?: number | null
          total_rental_amount: number
          total_transport_amount?: number | null
          updated_at?: string | null
          upi_screenshot_url?: string | null
          vendor_bill_url?: string | null
        }
        Update: {
          balance_amount?: number
          created_at?: string | null
          engineer_transaction_id?: string | null
          final_receipt_url?: string | null
          id?: string
          negotiated_final_amount?: number | null
          notes?: string | null
          payer_name?: string | null
          payer_source?: string | null
          payment_channel?: string | null
          payment_mode?: string | null
          rental_order_id?: string
          settled_by?: string | null
          settled_by_name?: string | null
          settlement_date?: string
          settlement_group_id?: string | null
          settlement_reference?: string | null
          subcontract_id?: string | null
          total_advance_paid?: number | null
          total_damage_amount?: number | null
          total_rental_amount?: number
          total_transport_amount?: number | null
          updated_at?: string | null
          upi_screenshot_url?: string | null
          vendor_bill_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rental_settlements_engineer_transaction_id_fkey"
            columns: ["engineer_transaction_id"]
            isOneToOne: false
            referencedRelation: "site_engineer_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_settlements_rental_order_id_fkey"
            columns: ["rental_order_id"]
            isOneToOne: true
            referencedRelation: "rental_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_settlements_settlement_group_id_fkey"
            columns: ["settlement_group_id"]
            isOneToOne: false
            referencedRelation: "settlement_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_settlements_subcontract_id_fkey"
            columns: ["subcontract_id"]
            isOneToOne: false
            referencedRelation: "subcontracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_settlements_subcontract_id_fkey"
            columns: ["subcontract_id"]
            isOneToOne: false
            referencedRelation: "v_subcontract_reconciliation"
            referencedColumns: ["subcontract_id"]
          },
        ]
      }
      rental_store_inventory: {
        Row: {
          created_at: string | null
          daily_rate: number
          id: string
          last_price_update: string | null
          loading_cost: number | null
          long_term_discount_percentage: number | null
          long_term_threshold_days: number | null
          min_rental_days: number | null
          monthly_rate: number | null
          notes: string | null
          rental_item_id: string
          transport_cost: number | null
          unloading_cost: number | null
          updated_at: string | null
          vendor_id: string
          weekly_rate: number | null
        }
        Insert: {
          created_at?: string | null
          daily_rate: number
          id?: string
          last_price_update?: string | null
          loading_cost?: number | null
          long_term_discount_percentage?: number | null
          long_term_threshold_days?: number | null
          min_rental_days?: number | null
          monthly_rate?: number | null
          notes?: string | null
          rental_item_id: string
          transport_cost?: number | null
          unloading_cost?: number | null
          updated_at?: string | null
          vendor_id: string
          weekly_rate?: number | null
        }
        Update: {
          created_at?: string | null
          daily_rate?: number
          id?: string
          last_price_update?: string | null
          loading_cost?: number | null
          long_term_discount_percentage?: number | null
          long_term_threshold_days?: number | null
          min_rental_days?: number | null
          monthly_rate?: number | null
          notes?: string | null
          rental_item_id?: string
          transport_cost?: number | null
          unloading_cost?: number | null
          updated_at?: string | null
          vendor_id?: string
          weekly_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rental_store_inventory_rental_item_id_fkey"
            columns: ["rental_item_id"]
            isOneToOne: false
            referencedRelation: "rental_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_store_inventory_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_payments: {
        Row: {
          amount: number
          comments: string | null
          created_at: string
          id: string
          is_team_payment: boolean
          paid_by: string | null
          paid_to: string | null
          payment_date: string
          payment_mode: Database["public"]["Enums"]["payment_mode"]
          receipt_url: string | null
          reference_number: string | null
          salary_period_id: string
          team_id: string | null
        }
        Insert: {
          amount: number
          comments?: string | null
          created_at?: string
          id?: string
          is_team_payment?: boolean
          paid_by?: string | null
          paid_to?: string | null
          payment_date: string
          payment_mode: Database["public"]["Enums"]["payment_mode"]
          receipt_url?: string | null
          reference_number?: string | null
          salary_period_id: string
          team_id?: string | null
        }
        Update: {
          amount?: number
          comments?: string | null
          created_at?: string
          id?: string
          is_team_payment?: boolean
          paid_by?: string | null
          paid_to?: string | null
          payment_date?: string
          payment_mode?: Database["public"]["Enums"]["payment_mode"]
          receipt_url?: string | null
          reference_number?: string | null
          salary_period_id?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salary_payments_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_payments_salary_period_id_fkey"
            columns: ["salary_period_id"]
            isOneToOne: false
            referencedRelation: "salary_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_payments_salary_period_id_fkey"
            columns: ["salary_period_id"]
            isOneToOne: false
            referencedRelation: "v_salary_periods_detailed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_payments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_payments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_weekly_summary"
            referencedColumns: ["team_id"]
          },
        ]
      }
      salary_periods: {
        Row: {
          advance_deductions: number
          amount_paid: number
          balance_due: number
          calculated_at: string | null
          calculated_by: string | null
          created_at: string
          extras: number
          gross_earnings: number
          id: string
          laborer_id: string
          net_payable: number
          notes: string | null
          other_additions: number
          other_deductions: number
          site_breakdown: Json | null
          status: Database["public"]["Enums"]["salary_status"]
          total_additions: number
          total_days_worked: number
          total_deductions: number
          total_hours_worked: number | null
          updated_at: string
          week_ending: string
          week_start: string
        }
        Insert: {
          advance_deductions?: number
          amount_paid?: number
          balance_due?: number
          calculated_at?: string | null
          calculated_by?: string | null
          created_at?: string
          extras?: number
          gross_earnings?: number
          id?: string
          laborer_id: string
          net_payable?: number
          notes?: string | null
          other_additions?: number
          other_deductions?: number
          site_breakdown?: Json | null
          status?: Database["public"]["Enums"]["salary_status"]
          total_additions?: number
          total_days_worked?: number
          total_deductions?: number
          total_hours_worked?: number | null
          updated_at?: string
          week_ending: string
          week_start: string
        }
        Update: {
          advance_deductions?: number
          amount_paid?: number
          balance_due?: number
          calculated_at?: string | null
          calculated_by?: string | null
          created_at?: string
          extras?: number
          gross_earnings?: number
          id?: string
          laborer_id?: string
          net_payable?: number
          notes?: string | null
          other_additions?: number
          other_deductions?: number
          site_breakdown?: Json | null
          status?: Database["public"]["Enums"]["salary_status"]
          total_additions?: number
          total_days_worked?: number
          total_deductions?: number
          total_hours_worked?: number | null
          updated_at?: string
          week_ending?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "salary_periods_calculated_by_fkey"
            columns: ["calculated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_periods_laborer_id_fkey"
            columns: ["laborer_id"]
            isOneToOne: false
            referencedRelation: "laborers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_periods_laborer_id_fkey"
            columns: ["laborer_id"]
            isOneToOne: false
            referencedRelation: "v_laborer_advance_summary"
            referencedColumns: ["laborer_id"]
          },
        ]
      }
      settlement_creation_audit: {
        Row: {
          attempted_reference: string | null
          created_at: string | null
          error_context: Json | null
          error_message: string | null
          id: string
          retry_count: number | null
          settlement_date: string
          site_id: string
        }
        Insert: {
          attempted_reference?: string | null
          created_at?: string | null
          error_context?: Json | null
          error_message?: string | null
          id?: string
          retry_count?: number | null
          settlement_date: string
          site_id: string
        }
        Update: {
          attempted_reference?: string | null
          created_at?: string | null
          error_context?: Json | null
          error_message?: string | null
          id?: string
          retry_count?: number | null
          settlement_date?: string
          site_id?: string
        }
        Relationships: []
      }
      settlement_expense_allocations: {
        Row: {
          batch_ref_code: string
          created_at: string | null
          creditor_expense_id: string | null
          creditor_original_amount: number | null
          creditor_self_use_amount: number | null
          creditor_site_id: string
          debtor_expense_id: string | null
          debtor_settled_amount: number | null
          debtor_site_id: string
          id: string
          settlement_id: string
        }
        Insert: {
          batch_ref_code: string
          created_at?: string | null
          creditor_expense_id?: string | null
          creditor_original_amount?: number | null
          creditor_self_use_amount?: number | null
          creditor_site_id: string
          debtor_expense_id?: string | null
          debtor_settled_amount?: number | null
          debtor_site_id: string
          id?: string
          settlement_id: string
        }
        Update: {
          batch_ref_code?: string
          created_at?: string | null
          creditor_expense_id?: string | null
          creditor_original_amount?: number | null
          creditor_self_use_amount?: number | null
          creditor_site_id?: string
          debtor_expense_id?: string | null
          debtor_settled_amount?: number | null
          debtor_site_id?: string
          id?: string
          settlement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_expense_allocations_creditor_expense_id_fkey"
            columns: ["creditor_expense_id"]
            isOneToOne: false
            referencedRelation: "material_purchase_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_expense_allocations_creditor_site_id_fkey"
            columns: ["creditor_site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_expense_allocations_creditor_site_id_fkey"
            columns: ["creditor_site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "settlement_expense_allocations_debtor_expense_id_fkey"
            columns: ["debtor_expense_id"]
            isOneToOne: false
            referencedRelation: "material_purchase_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_expense_allocations_debtor_site_id_fkey"
            columns: ["debtor_site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_expense_allocations_debtor_site_id_fkey"
            columns: ["debtor_site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "settlement_expense_allocations_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "inter_site_material_settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_expense_allocations_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "v_pending_inter_site_settlements"
            referencedColumns: ["settlement_id"]
          },
          {
            foreignKeyName: "settlement_expense_allocations_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "v_settlement_details"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_groups: {
        Row: {
          actual_payment_date: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_by_user_id: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          engineer_transaction_id: string | null
          id: string
          is_cancelled: boolean
          laborer_count: number
          notes: string | null
          payer_name: string | null
          payer_source: string | null
          payment_channel: string
          payment_mode: string | null
          payment_type: string | null
          proof_url: string | null
          proof_urls: string[] | null
          settlement_date: string
          settlement_reference: string
          settlement_type: string | null
          site_id: string
          subcontract_id: string | null
          total_amount: number
          updated_at: string
          week_allocations: Json | null
        }
        Insert: {
          actual_payment_date?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_by_user_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          engineer_transaction_id?: string | null
          id?: string
          is_cancelled?: boolean
          laborer_count?: number
          notes?: string | null
          payer_name?: string | null
          payer_source?: string | null
          payment_channel: string
          payment_mode?: string | null
          payment_type?: string | null
          proof_url?: string | null
          proof_urls?: string[] | null
          settlement_date: string
          settlement_reference: string
          settlement_type?: string | null
          site_id: string
          subcontract_id?: string | null
          total_amount: number
          updated_at?: string
          week_allocations?: Json | null
        }
        Update: {
          actual_payment_date?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_by_user_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          engineer_transaction_id?: string | null
          id?: string
          is_cancelled?: boolean
          laborer_count?: number
          notes?: string | null
          payer_name?: string | null
          payer_source?: string | null
          payment_channel?: string
          payment_mode?: string | null
          payment_type?: string | null
          proof_url?: string | null
          proof_urls?: string[] | null
          settlement_date?: string
          settlement_reference?: string
          settlement_type?: string | null
          site_id?: string
          subcontract_id?: string | null
          total_amount?: number
          updated_at?: string
          week_allocations?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "settlement_groups_cancelled_by_user_id_fkey"
            columns: ["cancelled_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_groups_engineer_transaction_id_fkey"
            columns: ["engineer_transaction_id"]
            isOneToOne: false
            referencedRelation: "site_engineer_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_groups_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_groups_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "settlement_groups_subcontract_id_fkey"
            columns: ["subcontract_id"]
            isOneToOne: false
            referencedRelation: "subcontracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_groups_subcontract_id_fkey"
            columns: ["subcontract_id"]
            isOneToOne: false
            referencedRelation: "v_subcontract_reconciliation"
            referencedColumns: ["subcontract_id"]
          },
        ]
      }
      site_additional_works: {
        Row: {
          client_approved_by: string | null
          confirmation_date: string | null
          confirmed_amount: number | null
          created_at: string
          created_by: string | null
          description: string | null
          estimated_amount: number
          expected_payment_date: string | null
          id: string
          notes: string | null
          quote_document_url: string | null
          site_id: string
          status: Database["public"]["Enums"]["additional_work_status"]
          title: string
          updated_at: string
        }
        Insert: {
          client_approved_by?: string | null
          confirmation_date?: string | null
          confirmed_amount?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          estimated_amount: number
          expected_payment_date?: string | null
          id?: string
          notes?: string | null
          quote_document_url?: string | null
          site_id: string
          status?: Database["public"]["Enums"]["additional_work_status"]
          title: string
          updated_at?: string
        }
        Update: {
          client_approved_by?: string | null
          confirmation_date?: string | null
          confirmed_amount?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          estimated_amount?: number
          expected_payment_date?: string | null
          id?: string
          notes?: string | null
          quote_document_url?: string | null
          site_id?: string
          status?: Database["public"]["Enums"]["additional_work_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_additional_works_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_additional_works_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
        ]
      }
      site_clients: {
        Row: {
          client_id: string
          contract_value: number | null
          created_at: string
          id: string
          is_primary_client: boolean | null
          notes: string | null
          ownership_percentage: number | null
          site_id: string
          updated_at: string
        }
        Insert: {
          client_id: string
          contract_value?: number | null
          created_at?: string
          id?: string
          is_primary_client?: boolean | null
          notes?: string | null
          ownership_percentage?: number | null
          site_id: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          contract_value?: number | null
          created_at?: string
          id?: string
          is_primary_client?: boolean | null
          notes?: string | null
          ownership_percentage?: number | null
          site_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_clients_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_clients_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
        ]
      }
      site_engineer_settlements: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          notes: string | null
          payment_mode: string
          proof_url: string | null
          recorded_by: string
          recorded_by_user_id: string | null
          settlement_date: string
          settlement_type: string
          site_engineer_id: string
          transactions_covered: string[] | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          notes?: string | null
          payment_mode: string
          proof_url?: string | null
          recorded_by: string
          recorded_by_user_id?: string | null
          settlement_date?: string
          settlement_type: string
          site_engineer_id: string
          transactions_covered?: string[] | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          notes?: string | null
          payment_mode?: string
          proof_url?: string | null
          recorded_by?: string
          recorded_by_user_id?: string | null
          settlement_date?: string
          settlement_type?: string
          site_engineer_id?: string
          transactions_covered?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "site_engineer_settlements_recorded_by_user_id_fkey"
            columns: ["recorded_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_engineer_settlements_site_engineer_id_fkey"
            columns: ["site_engineer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      site_engineer_transactions: {
        Row: {
          amount: number
          batch_code: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_by_user_id: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          confirmed_by_user_id: string | null
          created_at: string | null
          description: string | null
          dispute_notes: string | null
          id: string
          is_settled: boolean | null
          money_source: string | null
          money_source_name: string | null
          notes: string | null
          payer_name: string | null
          payer_source: string | null
          payment_mode: string
          proof_url: string | null
          recipient_id: string | null
          recipient_type: string | null
          recorded_by: string
          recorded_by_user_id: string | null
          related_attendance_id: string | null
          related_subcontract_id: string | null
          remaining_balance: number | null
          settled_by: string | null
          settled_date: string | null
          settlement_group_id: string | null
          settlement_mode: string | null
          settlement_proof_url: string | null
          settlement_reason: string | null
          settlement_reference: string | null
          settlement_status: string | null
          site_id: string | null
          site_restricted: boolean | null
          transaction_date: string
          transaction_type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          batch_code?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_by_user_id?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_by_user_id?: string | null
          created_at?: string | null
          description?: string | null
          dispute_notes?: string | null
          id?: string
          is_settled?: boolean | null
          money_source?: string | null
          money_source_name?: string | null
          notes?: string | null
          payer_name?: string | null
          payer_source?: string | null
          payment_mode: string
          proof_url?: string | null
          recipient_id?: string | null
          recipient_type?: string | null
          recorded_by: string
          recorded_by_user_id?: string | null
          related_attendance_id?: string | null
          related_subcontract_id?: string | null
          remaining_balance?: number | null
          settled_by?: string | null
          settled_date?: string | null
          settlement_group_id?: string | null
          settlement_mode?: string | null
          settlement_proof_url?: string | null
          settlement_reason?: string | null
          settlement_reference?: string | null
          settlement_status?: string | null
          site_id?: string | null
          site_restricted?: boolean | null
          transaction_date?: string
          transaction_type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          batch_code?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_by_user_id?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_by_user_id?: string | null
          created_at?: string | null
          description?: string | null
          dispute_notes?: string | null
          id?: string
          is_settled?: boolean | null
          money_source?: string | null
          money_source_name?: string | null
          notes?: string | null
          payer_name?: string | null
          payer_source?: string | null
          payment_mode?: string
          proof_url?: string | null
          recipient_id?: string | null
          recipient_type?: string | null
          recorded_by?: string
          recorded_by_user_id?: string | null
          related_attendance_id?: string | null
          related_subcontract_id?: string | null
          remaining_balance?: number | null
          settled_by?: string | null
          settled_date?: string | null
          settlement_group_id?: string | null
          settlement_mode?: string | null
          settlement_proof_url?: string | null
          settlement_reason?: string | null
          settlement_reference?: string | null
          settlement_status?: string | null
          site_id?: string | null
          site_restricted?: boolean | null
          transaction_date?: string
          transaction_type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_engineer_transactions_cancelled_by_user_id_fkey"
            columns: ["cancelled_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_engineer_transactions_confirmed_by_user_id_fkey"
            columns: ["confirmed_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_engineer_transactions_recorded_by_user_id_fkey"
            columns: ["recorded_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_engineer_transactions_related_attendance_id_fkey"
            columns: ["related_attendance_id"]
            isOneToOne: false
            referencedRelation: "daily_attendance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_engineer_transactions_related_attendance_id_fkey"
            columns: ["related_attendance_id"]
            isOneToOne: false
            referencedRelation: "v_active_attendance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_engineer_transactions_related_subcontract_id_fkey"
            columns: ["related_subcontract_id"]
            isOneToOne: false
            referencedRelation: "subcontracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_engineer_transactions_related_subcontract_id_fkey"
            columns: ["related_subcontract_id"]
            isOneToOne: false
            referencedRelation: "v_subcontract_reconciliation"
            referencedColumns: ["subcontract_id"]
          },
          {
            foreignKeyName: "site_engineer_transactions_settled_by_fkey"
            columns: ["settled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_engineer_transactions_settlement_group_id_fkey"
            columns: ["settlement_group_id"]
            isOneToOne: false
            referencedRelation: "settlement_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_engineer_transactions_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_engineer_transactions_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "site_engineer_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      site_groups: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_groups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      site_holidays: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          id: string
          is_paid_holiday: boolean | null
          reason: string | null
          site_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date: string
          id?: string
          is_paid_holiday?: boolean | null
          reason?: string | null
          site_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          is_paid_holiday?: boolean | null
          reason?: string | null
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_holidays_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_holidays_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_holidays_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
        ]
      }
      site_material_budgets: {
        Row: {
          budget_amount: number
          category_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          period_end: string
          period_start: string
          site_id: string
          updated_at: string | null
        }
        Insert: {
          budget_amount: number
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          period_end: string
          period_start: string
          site_id: string
          updated_at?: string | null
        }
        Update: {
          budget_amount?: number
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          period_end?: string
          period_start?: string
          site_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_material_budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "material_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_material_budgets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_material_budgets_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_material_budgets_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
        ]
      }
      site_payers: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          phone: string | null
          site_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          phone?: string | null
          site_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          phone?: string | null
          site_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_payers_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_payers_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
        ]
      }
      site_payment_milestones: {
        Row: {
          actual_payment_date: string | null
          amount: number
          created_at: string
          expected_date: string | null
          id: string
          milestone_description: string | null
          milestone_name: string
          notes: string | null
          percentage: number
          sequence_order: number
          site_id: string
          status: string
          updated_at: string
        }
        Insert: {
          actual_payment_date?: string | null
          amount: number
          created_at?: string
          expected_date?: string | null
          id?: string
          milestone_description?: string | null
          milestone_name: string
          notes?: string | null
          percentage: number
          sequence_order?: number
          site_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          actual_payment_date?: string | null
          amount?: number
          created_at?: string
          expected_date?: string | null
          id?: string
          milestone_description?: string | null
          milestone_name?: string
          notes?: string | null
          percentage?: number
          sequence_order?: number
          site_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_payment_milestones_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_payment_milestones_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
        ]
      }
      sites: {
        Row: {
          actual_completion_date: string | null
          address: string | null
          city: string | null
          client_contact: string | null
          client_email: string | null
          client_name: string | null
          company_id: string
          construction_phase: string | null
          construction_phase_id: string | null
          contract_document_url: string | null
          created_at: string
          created_by: string | null
          default_section_id: string | null
          default_work_end: string | null
          default_work_start: string | null
          has_multiple_payers: boolean | null
          id: string
          last_payment_amount: number | null
          last_payment_date: string | null
          location_google_maps_url: string | null
          location_lat: number | null
          location_lng: number | null
          name: string
          nearby_tea_shop_contact: string | null
          nearby_tea_shop_name: string | null
          notes: string | null
          payment_plan_json: Json | null
          payment_segments: number | null
          project_contract_value: number | null
          site_group_id: string | null
          site_type: Database["public"]["Enums"]["site_type"]
          start_date: string | null
          status: Database["public"]["Enums"]["site_status"]
          target_completion_date: string | null
          total_amount_received: number | null
          updated_at: string
        }
        Insert: {
          actual_completion_date?: string | null
          address?: string | null
          city?: string | null
          client_contact?: string | null
          client_email?: string | null
          client_name?: string | null
          company_id: string
          construction_phase?: string | null
          construction_phase_id?: string | null
          contract_document_url?: string | null
          created_at?: string
          created_by?: string | null
          default_section_id?: string | null
          default_work_end?: string | null
          default_work_start?: string | null
          has_multiple_payers?: boolean | null
          id?: string
          last_payment_amount?: number | null
          last_payment_date?: string | null
          location_google_maps_url?: string | null
          location_lat?: number | null
          location_lng?: number | null
          name: string
          nearby_tea_shop_contact?: string | null
          nearby_tea_shop_name?: string | null
          notes?: string | null
          payment_plan_json?: Json | null
          payment_segments?: number | null
          project_contract_value?: number | null
          site_group_id?: string | null
          site_type?: Database["public"]["Enums"]["site_type"]
          start_date?: string | null
          status?: Database["public"]["Enums"]["site_status"]
          target_completion_date?: string | null
          total_amount_received?: number | null
          updated_at?: string
        }
        Update: {
          actual_completion_date?: string | null
          address?: string | null
          city?: string | null
          client_contact?: string | null
          client_email?: string | null
          client_name?: string | null
          company_id?: string
          construction_phase?: string | null
          construction_phase_id?: string | null
          contract_document_url?: string | null
          created_at?: string
          created_by?: string | null
          default_section_id?: string | null
          default_work_end?: string | null
          default_work_start?: string | null
          has_multiple_payers?: boolean | null
          id?: string
          last_payment_amount?: number | null
          last_payment_date?: string | null
          location_google_maps_url?: string | null
          location_lat?: number | null
          location_lng?: number | null
          name?: string
          nearby_tea_shop_contact?: string | null
          nearby_tea_shop_name?: string | null
          notes?: string | null
          payment_plan_json?: Json | null
          payment_segments?: number | null
          project_contract_value?: number | null
          site_group_id?: string | null
          site_type?: Database["public"]["Enums"]["site_type"]
          start_date?: string | null
          status?: Database["public"]["Enums"]["site_status"]
          target_completion_date?: string | null
          total_amount_received?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_construction_phase_id_fkey"
            columns: ["construction_phase_id"]
            isOneToOne: false
            referencedRelation: "construction_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_default_section_id_fkey"
            columns: ["default_section_id"]
            isOneToOne: false
            referencedRelation: "building_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_default_section_id_fkey"
            columns: ["default_section_id"]
            isOneToOne: false
            referencedRelation: "v_section_cost_summary"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "sites_site_group_id_fkey"
            columns: ["site_group_id"]
            isOneToOne: false
            referencedRelation: "site_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_inventory: {
        Row: {
          available_qty: number | null
          avg_unit_cost: number | null
          batch_code: string | null
          brand_id: string | null
          created_at: string | null
          current_qty: number
          id: string
          last_issued_date: string | null
          last_received_date: string | null
          location_id: string | null
          material_id: string
          pricing_mode: string | null
          reorder_level: number | null
          reorder_qty: number | null
          reserved_qty: number
          site_id: string
          total_weight: number | null
          updated_at: string | null
        }
        Insert: {
          available_qty?: number | null
          avg_unit_cost?: number | null
          batch_code?: string | null
          brand_id?: string | null
          created_at?: string | null
          current_qty?: number
          id?: string
          last_issued_date?: string | null
          last_received_date?: string | null
          location_id?: string | null
          material_id: string
          pricing_mode?: string | null
          reorder_level?: number | null
          reorder_qty?: number | null
          reserved_qty?: number
          site_id: string
          total_weight?: number | null
          updated_at?: string | null
        }
        Update: {
          available_qty?: number | null
          avg_unit_cost?: number | null
          batch_code?: string | null
          brand_id?: string | null
          created_at?: string | null
          current_qty?: number
          id?: string
          last_issued_date?: string | null
          last_received_date?: string | null
          location_id?: string | null
          material_id?: string
          pricing_mode?: string | null
          reorder_level?: number | null
          reorder_qty?: number | null
          reserved_qty?: number
          site_id?: string
          total_weight?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_inventory_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "material_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_inventory_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_group_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "stock_inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock_alerts"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "stock_inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_materials_with_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_site_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "stock_inventory_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_inventory_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
        ]
      }
      stock_locations: {
        Row: {
          code: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          location_type: string | null
          name: string
          site_id: string
          updated_at: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          location_type?: string | null
          name: string
          site_id: string
          updated_at?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          location_type?: string | null
          name?: string
          site_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_locations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_locations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
        ]
      }
      stock_transactions: {
        Row: {
          batch_code: string | null
          created_at: string | null
          created_by: string | null
          id: string
          inventory_id: string
          notes: string | null
          quantity: number
          reference_id: string | null
          reference_type: string | null
          section_id: string | null
          site_id: string
          total_cost: number | null
          transaction_date: string
          transaction_type: Database["public"]["Enums"]["stock_transaction_type"]
          unit_cost: number | null
        }
        Insert: {
          batch_code?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          inventory_id: string
          notes?: string | null
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
          section_id?: string | null
          site_id: string
          total_cost?: number | null
          transaction_date?: string
          transaction_type: Database["public"]["Enums"]["stock_transaction_type"]
          unit_cost?: number | null
        }
        Update: {
          batch_code?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          inventory_id?: string
          notes?: string | null
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
          section_id?: string | null
          site_id?: string
          total_cost?: number | null
          transaction_date?: string
          transaction_type?: Database["public"]["Enums"]["stock_transaction_type"]
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transactions_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "stock_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transactions_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transactions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "building_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transactions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "v_section_cost_summary"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "stock_transactions_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transactions_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
        ]
      }
      stock_transfer_items: {
        Row: {
          brand_id: string | null
          created_at: string | null
          id: string
          material_id: string
          notes: string | null
          quantity_received: number | null
          quantity_sent: number
          transfer_id: string
          unit_cost: number | null
        }
        Insert: {
          brand_id?: string | null
          created_at?: string | null
          id?: string
          material_id: string
          notes?: string | null
          quantity_received?: number | null
          quantity_sent: number
          transfer_id: string
          unit_cost?: number | null
        }
        Update: {
          brand_id?: string | null
          created_at?: string | null
          id?: string
          material_id?: string
          notes?: string | null
          quantity_received?: number | null
          quantity_sent?: number
          transfer_id?: string
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfer_items_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "material_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_group_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "stock_transfer_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock_alerts"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "stock_transfer_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_materials_with_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_site_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "stock_transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "stock_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfers: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          from_location_id: string | null
          from_site_id: string
          id: string
          initiated_at: string | null
          initiated_by: string | null
          notes: string | null
          received_at: string | null
          received_by: string | null
          status: string | null
          to_location_id: string | null
          to_site_id: string
          transfer_date: string
          transfer_number: string | null
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          from_location_id?: string | null
          from_site_id: string
          id?: string
          initiated_at?: string | null
          initiated_by?: string | null
          notes?: string | null
          received_at?: string | null
          received_by?: string | null
          status?: string | null
          to_location_id?: string | null
          to_site_id: string
          transfer_date?: string
          transfer_number?: string | null
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          from_location_id?: string | null
          from_site_id?: string
          id?: string
          initiated_at?: string | null
          initiated_by?: string | null
          notes?: string | null
          received_at?: string | null
          received_by?: string | null
          status?: string | null
          to_location_id?: string | null
          to_site_id?: string
          transfer_date?: string
          transfer_number?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfers_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_from_site_id_fkey"
            columns: ["from_site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_from_site_id_fkey"
            columns: ["from_site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "stock_transfers_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_to_site_id_fkey"
            columns: ["to_site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_to_site_id_fkey"
            columns: ["to_site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
        ]
      }
      subcontract_headcount_attendance: {
        Row: {
          attendance_date: string
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          role_id: string
          subcontract_id: string
          units: number
        }
        Insert: {
          attendance_date: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          role_id: string
          subcontract_id: string
          units: number
        }
        Update: {
          attendance_date?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          role_id?: string
          subcontract_id?: string
          units?: number
        }
        Relationships: [
          {
            foreignKeyName: "subcontract_headcount_attendance_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontract_headcount_attendance_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "labor_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontract_headcount_attendance_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "v_section_cost_by_role"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "subcontract_headcount_attendance_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "v_team_weekly_by_role"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "subcontract_headcount_attendance_subcontract_id_fkey"
            columns: ["subcontract_id"]
            isOneToOne: false
            referencedRelation: "subcontracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontract_headcount_attendance_subcontract_id_fkey"
            columns: ["subcontract_id"]
            isOneToOne: false
            referencedRelation: "v_subcontract_reconciliation"
            referencedColumns: ["subcontract_id"]
          },
        ]
      }
      subcontract_milestones: {
        Row: {
          amount: number | null
          completion_date: string | null
          contract_id: string
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          name: string
          notes: string | null
          percentage: number | null
          sequence_order: number
          status: Database["public"]["Enums"]["milestone_status"]
          updated_at: string
        }
        Insert: {
          amount?: number | null
          completion_date?: string | null
          contract_id: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          name: string
          notes?: string | null
          percentage?: number | null
          sequence_order?: number
          status?: Database["public"]["Enums"]["milestone_status"]
          updated_at?: string
        }
        Update: {
          amount?: number | null
          completion_date?: string | null
          contract_id?: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          name?: string
          notes?: string | null
          percentage?: number | null
          sequence_order?: number
          status?: Database["public"]["Enums"]["milestone_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_milestones_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "subcontracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_milestones_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_subcontract_reconciliation"
            referencedColumns: ["subcontract_id"]
          },
        ]
      }
      subcontract_payments: {
        Row: {
          amount: number
          balance_after_payment: number | null
          comments: string | null
          contract_id: string
          created_at: string
          id: string
          is_deleted: boolean
          milestone_id: string | null
          paid_by: string | null
          paid_by_user_id: string | null
          payment_channel: string | null
          payment_date: string
          payment_mode: Database["public"]["Enums"]["payment_mode"]
          payment_type: Database["public"]["Enums"]["contract_payment_type"]
          period_from_date: string | null
          period_to_date: string | null
          receipt_url: string | null
          recorded_by: string | null
          recorded_by_user_id: string | null
          reference_number: string | null
          site_engineer_transaction_id: string | null
          total_salary_for_period: number | null
        }
        Insert: {
          amount: number
          balance_after_payment?: number | null
          comments?: string | null
          contract_id: string
          created_at?: string
          id?: string
          is_deleted?: boolean
          milestone_id?: string | null
          paid_by?: string | null
          paid_by_user_id?: string | null
          payment_channel?: string | null
          payment_date: string
          payment_mode: Database["public"]["Enums"]["payment_mode"]
          payment_type: Database["public"]["Enums"]["contract_payment_type"]
          period_from_date?: string | null
          period_to_date?: string | null
          receipt_url?: string | null
          recorded_by?: string | null
          recorded_by_user_id?: string | null
          reference_number?: string | null
          site_engineer_transaction_id?: string | null
          total_salary_for_period?: number | null
        }
        Update: {
          amount?: number
          balance_after_payment?: number | null
          comments?: string | null
          contract_id?: string
          created_at?: string
          id?: string
          is_deleted?: boolean
          milestone_id?: string | null
          paid_by?: string | null
          paid_by_user_id?: string | null
          payment_channel?: string | null
          payment_date?: string
          payment_mode?: Database["public"]["Enums"]["payment_mode"]
          payment_type?: Database["public"]["Enums"]["contract_payment_type"]
          period_from_date?: string | null
          period_to_date?: string | null
          receipt_url?: string | null
          recorded_by?: string | null
          recorded_by_user_id?: string | null
          reference_number?: string | null
          site_engineer_transaction_id?: string | null
          total_salary_for_period?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_payments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "subcontracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_payments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_subcontract_reconciliation"
            referencedColumns: ["subcontract_id"]
          },
          {
            foreignKeyName: "contract_payments_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "subcontract_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_payments_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_subcontract_payments_site_eng_trans"
            columns: ["site_engineer_transaction_id"]
            isOneToOne: false
            referencedRelation: "site_engineer_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontract_payments_paid_by_user_id_fkey"
            columns: ["paid_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontract_payments_recorded_by_user_id_fkey"
            columns: ["recorded_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      subcontract_role_rates: {
        Row: {
          created_at: string
          daily_rate: number
          id: string
          role_id: string
          subcontract_id: string
        }
        Insert: {
          created_at?: string
          daily_rate: number
          id?: string
          role_id: string
          subcontract_id: string
        }
        Update: {
          created_at?: string
          daily_rate?: number
          id?: string
          role_id?: string
          subcontract_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcontract_role_rates_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "labor_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontract_role_rates_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "v_section_cost_by_role"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "subcontract_role_rates_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "v_team_weekly_by_role"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "subcontract_role_rates_subcontract_id_fkey"
            columns: ["subcontract_id"]
            isOneToOne: false
            referencedRelation: "subcontracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontract_role_rates_subcontract_id_fkey"
            columns: ["subcontract_id"]
            isOneToOne: false
            referencedRelation: "v_subcontract_reconciliation"
            referencedColumns: ["subcontract_id"]
          },
        ]
      }
      subcontract_sections: {
        Row: {
          contract_id: string
          created_at: string
          estimated_value: number | null
          id: string
          scope_notes: string | null
          section_id: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          estimated_value?: number | null
          id?: string
          scope_notes?: string | null
          section_id: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          estimated_value?: number | null
          id?: string
          scope_notes?: string | null
          section_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_sections_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "subcontracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_sections_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_subcontract_reconciliation"
            referencedColumns: ["subcontract_id"]
          },
          {
            foreignKeyName: "contract_sections_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "building_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_sections_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "v_section_cost_summary"
            referencedColumns: ["section_id"]
          },
        ]
      }
      subcontracts: {
        Row: {
          actual_end_date: string | null
          assigned_sections: string[] | null
          contract_number: string | null
          contract_type: Database["public"]["Enums"]["contract_type"]
          created_at: string
          created_by: string | null
          description: string | null
          expected_end_date: string | null
          id: string
          is_in_house: boolean
          is_rate_based: boolean
          labor_tracking_mode: string | null
          laborer_id: string | null
          maestri_margin_per_day: number | null
          measurement_unit:
            | Database["public"]["Enums"]["measurement_unit"]
            | null
          notes: string | null
          rate_per_unit: number | null
          scope_of_work: string | null
          site_id: string
          start_date: string | null
          status: Database["public"]["Enums"]["contract_status"]
          team_id: string | null
          terms_and_conditions: string | null
          title: string
          total_units: number | null
          total_value: number
          trade_category_id: string | null
          updated_at: string
          weekly_advance_rate: number | null
        }
        Insert: {
          actual_end_date?: string | null
          assigned_sections?: string[] | null
          contract_number?: string | null
          contract_type: Database["public"]["Enums"]["contract_type"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          expected_end_date?: string | null
          id?: string
          is_in_house?: boolean
          is_rate_based?: boolean
          labor_tracking_mode?: string | null
          laborer_id?: string | null
          maestri_margin_per_day?: number | null
          measurement_unit?:
            | Database["public"]["Enums"]["measurement_unit"]
            | null
          notes?: string | null
          rate_per_unit?: number | null
          scope_of_work?: string | null
          site_id: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          team_id?: string | null
          terms_and_conditions?: string | null
          title: string
          total_units?: number | null
          total_value?: number
          trade_category_id?: string | null
          updated_at?: string
          weekly_advance_rate?: number | null
        }
        Update: {
          actual_end_date?: string | null
          assigned_sections?: string[] | null
          contract_number?: string | null
          contract_type?: Database["public"]["Enums"]["contract_type"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          expected_end_date?: string | null
          id?: string
          is_in_house?: boolean
          is_rate_based?: boolean
          labor_tracking_mode?: string | null
          laborer_id?: string | null
          maestri_margin_per_day?: number | null
          measurement_unit?:
            | Database["public"]["Enums"]["measurement_unit"]
            | null
          notes?: string | null
          rate_per_unit?: number | null
          scope_of_work?: string | null
          site_id?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          team_id?: string | null
          terms_and_conditions?: string | null
          title?: string
          total_units?: number | null
          total_value?: number
          trade_category_id?: string | null
          updated_at?: string
          weekly_advance_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_laborer_id_fkey"
            columns: ["laborer_id"]
            isOneToOne: false
            referencedRelation: "laborers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_laborer_id_fkey"
            columns: ["laborer_id"]
            isOneToOne: false
            referencedRelation: "v_laborer_advance_summary"
            referencedColumns: ["laborer_id"]
          },
          {
            foreignKeyName: "contracts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "contracts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_weekly_summary"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "subcontracts_trade_category_id_fkey"
            columns: ["trade_category_id"]
            isOneToOne: false
            referencedRelation: "labor_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontracts_trade_category_id_fkey"
            columns: ["trade_category_id"]
            isOneToOne: false
            referencedRelation: "v_site_daily_by_category"
            referencedColumns: ["category_id"]
          },
        ]
      }
      tea_shop_accounts: {
        Row: {
          address: string | null
          contact_phone: string | null
          created_at: string
          id: string
          is_active: boolean
          is_group_shop: boolean
          notes: string | null
          owner_name: string | null
          qr_code_url: string | null
          shop_name: string
          site_group_id: string | null
          site_id: string | null
          updated_at: string
          upi_id: string | null
        }
        Insert: {
          address?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_group_shop?: boolean
          notes?: string | null
          owner_name?: string | null
          qr_code_url?: string | null
          shop_name: string
          site_group_id?: string | null
          site_id?: string | null
          updated_at?: string
          upi_id?: string | null
        }
        Update: {
          address?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_group_shop?: boolean
          notes?: string | null
          owner_name?: string | null
          qr_code_url?: string | null
          shop_name?: string
          site_group_id?: string | null
          site_id?: string | null
          updated_at?: string
          upi_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tea_shop_accounts_site_group_id_fkey"
            columns: ["site_group_id"]
            isOneToOne: false
            referencedRelation: "site_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_accounts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_accounts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
        ]
      }
      tea_shop_clearances: {
        Row: {
          amount_paid: number
          balance: number
          created_at: string
          expense_id: string | null
          id: string
          notes: string | null
          paid_by: string | null
          payment_date: string
          payment_mode: Database["public"]["Enums"]["payment_mode"] | null
          tea_shop_id: string
          total_amount: number
          week_end: string
          week_start: string
        }
        Insert: {
          amount_paid: number
          balance?: number
          created_at?: string
          expense_id?: string | null
          id?: string
          notes?: string | null
          paid_by?: string | null
          payment_date: string
          payment_mode?: Database["public"]["Enums"]["payment_mode"] | null
          tea_shop_id: string
          total_amount: number
          week_end: string
          week_start: string
        }
        Update: {
          amount_paid?: number
          balance?: number
          created_at?: string
          expense_id?: string | null
          id?: string
          notes?: string | null
          paid_by?: string | null
          payment_date?: string
          payment_mode?: Database["public"]["Enums"]["payment_mode"] | null
          tea_shop_id?: string
          total_amount?: number
          week_end?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "tea_shop_clearances_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_clearances_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_clearances_tea_shop_id_fkey"
            columns: ["tea_shop_id"]
            isOneToOne: false
            referencedRelation: "tea_shop_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_clearances_tea_shop_id_fkey"
            columns: ["tea_shop_id"]
            isOneToOne: false
            referencedRelation: "v_tea_shop_weekly"
            referencedColumns: ["tea_shop_id"]
          },
        ]
      }
      tea_shop_consumption_details: {
        Row: {
          created_at: string | null
          entry_id: string
          id: string
          is_working: boolean | null
          laborer_id: string | null
          laborer_name: string | null
          laborer_type: string | null
          snacks_amount: number | null
          snacks_items: Json | null
          tea_amount: number | null
          tea_rounds: number | null
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          entry_id: string
          id?: string
          is_working?: boolean | null
          laborer_id?: string | null
          laborer_name?: string | null
          laborer_type?: string | null
          snacks_amount?: number | null
          snacks_items?: Json | null
          tea_amount?: number | null
          tea_rounds?: number | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          entry_id?: string
          id?: string
          is_working?: boolean | null
          laborer_id?: string | null
          laborer_name?: string | null
          laborer_type?: string | null
          snacks_amount?: number | null
          snacks_items?: Json | null
          tea_amount?: number | null
          tea_rounds?: number | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tea_shop_consumption_details_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "tea_shop_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_consumption_details_laborer_id_fkey"
            columns: ["laborer_id"]
            isOneToOne: false
            referencedRelation: "laborers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_consumption_details_laborer_id_fkey"
            columns: ["laborer_id"]
            isOneToOne: false
            referencedRelation: "v_laborer_advance_summary"
            referencedColumns: ["laborer_id"]
          },
        ]
      }
      tea_shop_entries: {
        Row: {
          amount: number
          amount_paid: number | null
          company_tea_shop_id: string | null
          created_at: string
          date: string
          entered_by: string | null
          entered_by_user_id: string | null
          entry_mode: string | null
          id: string
          is_fully_paid: boolean | null
          is_group_entry: boolean
          is_split_entry: boolean | null
          items_detail: string | null
          market_laborer_count: number | null
          market_laborer_snacks_amount: number | null
          market_laborer_tea_amount: number | null
          market_laborer_total: number | null
          nonworking_laborer_count: number | null
          nonworking_laborer_total: number | null
          notes: string | null
          num_people: number | null
          num_rounds: number | null
          percentage_split: Json | null
          simple_total_cost: number | null
          site_group_id: string | null
          site_id: string | null
          snacks_items: Json | null
          snacks_total: number | null
          split_percentage: number | null
          split_source_entry_id: string | null
          split_target_site_id: string | null
          tea_people_count: number | null
          tea_rate_per_round: number | null
          tea_rounds: number | null
          tea_shop_id: string
          tea_total: number | null
          team_id: string | null
          total_amount: number | null
          total_day_units: number | null
          updated_at: string | null
          updated_by: string | null
          updated_by_user_id: string | null
          working_laborer_count: number | null
          working_laborer_total: number | null
        }
        Insert: {
          amount: number
          amount_paid?: number | null
          company_tea_shop_id?: string | null
          created_at?: string
          date: string
          entered_by?: string | null
          entered_by_user_id?: string | null
          entry_mode?: string | null
          id?: string
          is_fully_paid?: boolean | null
          is_group_entry?: boolean
          is_split_entry?: boolean | null
          items_detail?: string | null
          market_laborer_count?: number | null
          market_laborer_snacks_amount?: number | null
          market_laborer_tea_amount?: number | null
          market_laborer_total?: number | null
          nonworking_laborer_count?: number | null
          nonworking_laborer_total?: number | null
          notes?: string | null
          num_people?: number | null
          num_rounds?: number | null
          percentage_split?: Json | null
          simple_total_cost?: number | null
          site_group_id?: string | null
          site_id?: string | null
          snacks_items?: Json | null
          snacks_total?: number | null
          split_percentage?: number | null
          split_source_entry_id?: string | null
          split_target_site_id?: string | null
          tea_people_count?: number | null
          tea_rate_per_round?: number | null
          tea_rounds?: number | null
          tea_shop_id: string
          tea_total?: number | null
          team_id?: string | null
          total_amount?: number | null
          total_day_units?: number | null
          updated_at?: string | null
          updated_by?: string | null
          updated_by_user_id?: string | null
          working_laborer_count?: number | null
          working_laborer_total?: number | null
        }
        Update: {
          amount?: number
          amount_paid?: number | null
          company_tea_shop_id?: string | null
          created_at?: string
          date?: string
          entered_by?: string | null
          entered_by_user_id?: string | null
          entry_mode?: string | null
          id?: string
          is_fully_paid?: boolean | null
          is_group_entry?: boolean
          is_split_entry?: boolean | null
          items_detail?: string | null
          market_laborer_count?: number | null
          market_laborer_snacks_amount?: number | null
          market_laborer_tea_amount?: number | null
          market_laborer_total?: number | null
          nonworking_laborer_count?: number | null
          nonworking_laborer_total?: number | null
          notes?: string | null
          num_people?: number | null
          num_rounds?: number | null
          percentage_split?: Json | null
          simple_total_cost?: number | null
          site_group_id?: string | null
          site_id?: string | null
          snacks_items?: Json | null
          snacks_total?: number | null
          split_percentage?: number | null
          split_source_entry_id?: string | null
          split_target_site_id?: string | null
          tea_people_count?: number | null
          tea_rate_per_round?: number | null
          tea_rounds?: number | null
          tea_shop_id?: string
          tea_total?: number | null
          team_id?: string | null
          total_amount?: number | null
          total_day_units?: number | null
          updated_at?: string | null
          updated_by?: string | null
          updated_by_user_id?: string | null
          working_laborer_count?: number | null
          working_laborer_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tea_shop_entries_company_tea_shop_id_fkey"
            columns: ["company_tea_shop_id"]
            isOneToOne: false
            referencedRelation: "tea_shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_entries_entered_by_user_id_fkey"
            columns: ["entered_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_entries_site_group_id_fkey"
            columns: ["site_group_id"]
            isOneToOne: false
            referencedRelation: "site_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_entries_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_entries_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "tea_shop_entries_split_source_entry_id_fkey"
            columns: ["split_source_entry_id"]
            isOneToOne: false
            referencedRelation: "tea_shop_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_entries_split_target_site_id_fkey"
            columns: ["split_target_site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_entries_split_target_site_id_fkey"
            columns: ["split_target_site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "tea_shop_entries_tea_shop_id_fkey"
            columns: ["tea_shop_id"]
            isOneToOne: false
            referencedRelation: "tea_shop_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_entries_tea_shop_id_fkey"
            columns: ["tea_shop_id"]
            isOneToOne: false
            referencedRelation: "v_tea_shop_weekly"
            referencedColumns: ["tea_shop_id"]
          },
          {
            foreignKeyName: "tea_shop_entries_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_entries_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_weekly_summary"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "tea_shop_entries_updated_by_user_id_fkey"
            columns: ["updated_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tea_shop_entry_allocations: {
        Row: {
          allocated_amount: number
          allocation_percentage: number
          amount_paid: number | null
          created_at: string
          day_units_sum: number
          entry_id: string
          id: string
          is_fully_paid: boolean | null
          is_manual_override: boolean
          site_id: string
          worker_count: number
        }
        Insert: {
          allocated_amount: number
          allocation_percentage: number
          amount_paid?: number | null
          created_at?: string
          day_units_sum?: number
          entry_id: string
          id?: string
          is_fully_paid?: boolean | null
          is_manual_override?: boolean
          site_id: string
          worker_count?: number
        }
        Update: {
          allocated_amount?: number
          allocation_percentage?: number
          amount_paid?: number | null
          created_at?: string
          day_units_sum?: number
          entry_id?: string
          id?: string
          is_fully_paid?: boolean | null
          is_manual_override?: boolean
          site_id?: string
          worker_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "tea_shop_entry_allocations_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "tea_shop_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_entry_allocations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_entry_allocations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
        ]
      }
      tea_shop_group_allocations: {
        Row: {
          allocated_amount: number
          allocation_percentage: number
          attendance_count: number
          created_at: string
          group_entry_id: string
          id: string
          market_laborer_count: number
          named_laborer_count: number
          site_id: string
        }
        Insert: {
          allocated_amount: number
          allocation_percentage: number
          attendance_count?: number
          created_at?: string
          group_entry_id: string
          id?: string
          market_laborer_count?: number
          named_laborer_count?: number
          site_id: string
        }
        Update: {
          allocated_amount?: number
          allocation_percentage?: number
          attendance_count?: number
          created_at?: string
          group_entry_id?: string
          id?: string
          market_laborer_count?: number
          named_laborer_count?: number
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tea_shop_group_allocations_group_entry_id_fkey"
            columns: ["group_entry_id"]
            isOneToOne: false
            referencedRelation: "tea_shop_group_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_group_allocations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_group_allocations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
        ]
      }
      tea_shop_group_entries: {
        Row: {
          amount_paid: number
          created_at: string
          date: string
          entered_by: string | null
          entered_by_user_id: string | null
          id: string
          is_fully_paid: boolean
          is_percentage_override: boolean
          notes: string | null
          percentage_split: Json | null
          site_group_id: string
          tea_shop_id: string
          total_amount: number
          updated_at: string
          updated_by: string | null
          updated_by_user_id: string | null
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          date: string
          entered_by?: string | null
          entered_by_user_id?: string | null
          id?: string
          is_fully_paid?: boolean
          is_percentage_override?: boolean
          notes?: string | null
          percentage_split?: Json | null
          site_group_id: string
          tea_shop_id: string
          total_amount: number
          updated_at?: string
          updated_by?: string | null
          updated_by_user_id?: string | null
        }
        Update: {
          amount_paid?: number
          created_at?: string
          date?: string
          entered_by?: string | null
          entered_by_user_id?: string | null
          id?: string
          is_fully_paid?: boolean
          is_percentage_override?: boolean
          notes?: string | null
          percentage_split?: Json | null
          site_group_id?: string
          tea_shop_id?: string
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
          updated_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tea_shop_group_entries_entered_by_user_id_fkey"
            columns: ["entered_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_group_entries_site_group_id_fkey"
            columns: ["site_group_id"]
            isOneToOne: false
            referencedRelation: "site_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_group_entries_tea_shop_id_fkey"
            columns: ["tea_shop_id"]
            isOneToOne: false
            referencedRelation: "tea_shop_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_group_entries_tea_shop_id_fkey"
            columns: ["tea_shop_id"]
            isOneToOne: false
            referencedRelation: "v_tea_shop_weekly"
            referencedColumns: ["tea_shop_id"]
          },
          {
            foreignKeyName: "tea_shop_group_entries_updated_by_user_id_fkey"
            columns: ["updated_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tea_shop_group_settlement_allocations: {
        Row: {
          allocated_amount: number
          created_at: string
          group_entry_id: string
          id: string
          settlement_id: string
        }
        Insert: {
          allocated_amount: number
          created_at?: string
          group_entry_id: string
          id?: string
          settlement_id: string
        }
        Update: {
          allocated_amount?: number
          created_at?: string
          group_entry_id?: string
          id?: string
          settlement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tea_shop_group_settlement_allocations_group_entry_id_fkey"
            columns: ["group_entry_id"]
            isOneToOne: false
            referencedRelation: "tea_shop_group_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_group_settlement_allocations_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "tea_shop_group_settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      tea_shop_group_settlements: {
        Row: {
          amount_paid: number
          balance_remaining: number | null
          created_at: string
          entries_total: number
          id: string
          is_cancelled: boolean | null
          is_engineer_settled: boolean | null
          notes: string | null
          payer_name: string | null
          payer_source: string | null
          payer_type: string
          payment_date: string
          payment_mode: string
          period_end: string
          period_start: string
          previous_balance: number | null
          proof_url: string | null
          recorded_by: string | null
          recorded_by_user_id: string | null
          settlement_reference: string | null
          site_engineer_id: string | null
          site_engineer_transaction_id: string | null
          site_group_id: string
          status: string | null
          subcontract_id: string | null
          tea_shop_id: string
          total_due: number
          updated_at: string
        }
        Insert: {
          amount_paid: number
          balance_remaining?: number | null
          created_at?: string
          entries_total: number
          id?: string
          is_cancelled?: boolean | null
          is_engineer_settled?: boolean | null
          notes?: string | null
          payer_name?: string | null
          payer_source?: string | null
          payer_type: string
          payment_date: string
          payment_mode: string
          period_end: string
          period_start: string
          previous_balance?: number | null
          proof_url?: string | null
          recorded_by?: string | null
          recorded_by_user_id?: string | null
          settlement_reference?: string | null
          site_engineer_id?: string | null
          site_engineer_transaction_id?: string | null
          site_group_id: string
          status?: string | null
          subcontract_id?: string | null
          tea_shop_id: string
          total_due: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          balance_remaining?: number | null
          created_at?: string
          entries_total?: number
          id?: string
          is_cancelled?: boolean | null
          is_engineer_settled?: boolean | null
          notes?: string | null
          payer_name?: string | null
          payer_source?: string | null
          payer_type?: string
          payment_date?: string
          payment_mode?: string
          period_end?: string
          period_start?: string
          previous_balance?: number | null
          proof_url?: string | null
          recorded_by?: string | null
          recorded_by_user_id?: string | null
          settlement_reference?: string | null
          site_engineer_id?: string | null
          site_engineer_transaction_id?: string | null
          site_group_id?: string
          status?: string | null
          subcontract_id?: string | null
          tea_shop_id?: string
          total_due?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tea_shop_group_settlements_recorded_by_user_id_fkey"
            columns: ["recorded_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_group_settlements_site_engineer_id_fkey"
            columns: ["site_engineer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_group_settlements_site_group_id_fkey"
            columns: ["site_group_id"]
            isOneToOne: false
            referencedRelation: "site_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_group_settlements_subcontract_id_fkey"
            columns: ["subcontract_id"]
            isOneToOne: false
            referencedRelation: "subcontracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_group_settlements_subcontract_id_fkey"
            columns: ["subcontract_id"]
            isOneToOne: false
            referencedRelation: "v_subcontract_reconciliation"
            referencedColumns: ["subcontract_id"]
          },
          {
            foreignKeyName: "tea_shop_group_settlements_tea_shop_id_fkey"
            columns: ["tea_shop_id"]
            isOneToOne: false
            referencedRelation: "tea_shop_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_group_settlements_tea_shop_id_fkey"
            columns: ["tea_shop_id"]
            isOneToOne: false
            referencedRelation: "v_tea_shop_weekly"
            referencedColumns: ["tea_shop_id"]
          },
        ]
      }
      tea_shop_settlement_allocations: {
        Row: {
          allocated_amount: number
          created_at: string | null
          entry_id: string
          id: string
          settlement_id: string
        }
        Insert: {
          allocated_amount: number
          created_at?: string | null
          entry_id: string
          id?: string
          settlement_id: string
        }
        Update: {
          allocated_amount?: number
          created_at?: string | null
          entry_id?: string
          id?: string
          settlement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tea_shop_settlement_allocations_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "tea_shop_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_settlement_allocations_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "tea_shop_settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      tea_shop_settlement_site_allocations: {
        Row: {
          created_at: string
          entries_amount: number
          id: string
          paid_amount: number
          settlement_id: string
          site_id: string
        }
        Insert: {
          created_at?: string
          entries_amount?: number
          id?: string
          paid_amount?: number
          settlement_id: string
          site_id: string
        }
        Update: {
          created_at?: string
          entries_amount?: number
          id?: string
          paid_amount?: number
          settlement_id?: string
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tea_shop_settlement_site_allocations_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "tea_shop_settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_settlement_site_allocations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_settlement_site_allocations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
        ]
      }
      tea_shop_settlements: {
        Row: {
          amount_paid: number
          balance_remaining: number | null
          company_tea_shop_id: string | null
          created_at: string | null
          entries_total: number
          id: string
          is_cancelled: boolean | null
          is_engineer_settled: boolean | null
          is_group_settlement: boolean
          is_standalone: boolean
          notes: string | null
          payer_name: string | null
          payer_source: string | null
          payer_type: string
          payment_date: string
          payment_mode: string
          period_end: string
          period_start: string
          previous_balance: number | null
          proof_url: string | null
          recorded_by: string | null
          recorded_by_user_id: string | null
          settlement_reference: string | null
          site_engineer_id: string | null
          site_engineer_transaction_id: string | null
          site_group_id: string | null
          site_id: string | null
          status: string | null
          subcontract_id: string | null
          tea_shop_id: string
          total_due: number
          updated_at: string | null
        }
        Insert: {
          amount_paid: number
          balance_remaining?: number | null
          company_tea_shop_id?: string | null
          created_at?: string | null
          entries_total: number
          id?: string
          is_cancelled?: boolean | null
          is_engineer_settled?: boolean | null
          is_group_settlement?: boolean
          is_standalone?: boolean
          notes?: string | null
          payer_name?: string | null
          payer_source?: string | null
          payer_type: string
          payment_date: string
          payment_mode: string
          period_end: string
          period_start: string
          previous_balance?: number | null
          proof_url?: string | null
          recorded_by?: string | null
          recorded_by_user_id?: string | null
          settlement_reference?: string | null
          site_engineer_id?: string | null
          site_engineer_transaction_id?: string | null
          site_group_id?: string | null
          site_id?: string | null
          status?: string | null
          subcontract_id?: string | null
          tea_shop_id: string
          total_due: number
          updated_at?: string | null
        }
        Update: {
          amount_paid?: number
          balance_remaining?: number | null
          company_tea_shop_id?: string | null
          created_at?: string | null
          entries_total?: number
          id?: string
          is_cancelled?: boolean | null
          is_engineer_settled?: boolean | null
          is_group_settlement?: boolean
          is_standalone?: boolean
          notes?: string | null
          payer_name?: string | null
          payer_source?: string | null
          payer_type?: string
          payment_date?: string
          payment_mode?: string
          period_end?: string
          period_start?: string
          previous_balance?: number | null
          proof_url?: string | null
          recorded_by?: string | null
          recorded_by_user_id?: string | null
          settlement_reference?: string | null
          site_engineer_id?: string | null
          site_engineer_transaction_id?: string | null
          site_group_id?: string | null
          site_id?: string | null
          status?: string | null
          subcontract_id?: string | null
          tea_shop_id?: string
          total_due?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tea_shop_settlements_company_tea_shop_id_fkey"
            columns: ["company_tea_shop_id"]
            isOneToOne: false
            referencedRelation: "tea_shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_settlements_site_engineer_id_fkey"
            columns: ["site_engineer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_settlements_site_group_id_fkey"
            columns: ["site_group_id"]
            isOneToOne: false
            referencedRelation: "site_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_settlements_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_settlements_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "tea_shop_settlements_subcontract_id_fkey"
            columns: ["subcontract_id"]
            isOneToOne: false
            referencedRelation: "subcontracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_settlements_subcontract_id_fkey"
            columns: ["subcontract_id"]
            isOneToOne: false
            referencedRelation: "v_subcontract_reconciliation"
            referencedColumns: ["subcontract_id"]
          },
          {
            foreignKeyName: "tea_shop_settlements_tea_shop_id_fkey"
            columns: ["tea_shop_id"]
            isOneToOne: false
            referencedRelation: "tea_shop_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_settlements_tea_shop_id_fkey"
            columns: ["tea_shop_id"]
            isOneToOne: false
            referencedRelation: "v_tea_shop_weekly"
            referencedColumns: ["tea_shop_id"]
          },
        ]
      }
      tea_shop_site_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          id: string
          is_active: boolean
          site_group_id: string | null
          site_id: string | null
          tea_shop_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          is_active?: boolean
          site_group_id?: string | null
          site_id?: string | null
          tea_shop_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          is_active?: boolean
          site_group_id?: string | null
          site_id?: string | null
          tea_shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tea_shop_site_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_site_assignments_site_group_id_fkey"
            columns: ["site_group_id"]
            isOneToOne: false
            referencedRelation: "site_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_site_assignments_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_site_assignments_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "tea_shop_site_assignments_tea_shop_id_fkey"
            columns: ["tea_shop_id"]
            isOneToOne: false
            referencedRelation: "tea_shops"
            referencedColumns: ["id"]
          },
        ]
      }
      tea_shops: {
        Row: {
          address: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          owner_name: string | null
          qr_code_url: string | null
          updated_at: string
          updated_by: string | null
          upi_id: string | null
        }
        Insert: {
          address?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          owner_name?: string | null
          qr_code_url?: string | null
          updated_at?: string
          updated_by?: string | null
          upi_id?: string | null
        }
        Update: {
          address?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          owner_name?: string | null
          qr_code_url?: string | null
          updated_at?: string
          updated_by?: string | null
          upi_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tea_shops_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shops_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      team_salary_summaries: {
        Row: {
          balance_due: number
          created_at: string
          grand_total: number
          id: string
          role_breakdown: Json | null
          status: Database["public"]["Enums"]["salary_status"]
          team_id: string
          total_additions: number
          total_days_worked: number
          total_deductions: number
          total_expenses: number
          total_gross_earnings: number
          total_laborers: number
          total_net_payable: number
          total_paid: number
          updated_at: string
          week_ending: string
        }
        Insert: {
          balance_due?: number
          created_at?: string
          grand_total?: number
          id?: string
          role_breakdown?: Json | null
          status?: Database["public"]["Enums"]["salary_status"]
          team_id: string
          total_additions?: number
          total_days_worked?: number
          total_deductions?: number
          total_expenses?: number
          total_gross_earnings?: number
          total_laborers?: number
          total_net_payable?: number
          total_paid?: number
          updated_at?: string
          week_ending: string
        }
        Update: {
          balance_due?: number
          created_at?: string
          grand_total?: number
          id?: string
          role_breakdown?: Json | null
          status?: Database["public"]["Enums"]["salary_status"]
          team_id?: string
          total_additions?: number
          total_days_worked?: number
          total_deductions?: number
          total_expenses?: number
          total_gross_earnings?: number
          total_laborers?: number
          total_net_payable?: number
          total_paid?: number
          updated_at?: string
          week_ending?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_salary_summaries_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_salary_summaries_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_weekly_summary"
            referencedColumns: ["team_id"]
          },
        ]
      }
      teams: {
        Row: {
          company_id: string
          created_at: string
          id: string
          leader_address: string | null
          leader_name: string
          leader_phone: string | null
          name: string
          notes: string | null
          status: Database["public"]["Enums"]["team_status"]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          leader_address?: string | null
          leader_name: string
          leader_phone?: string | null
          name: string
          notes?: string | null
          status?: Database["public"]["Enums"]["team_status"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          leader_address?: string | null
          leader_name?: string
          leader_phone?: string | null
          name?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["team_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      tmt_weight_history: {
        Row: {
          actual_weight_per_piece: number
          brand_id: string | null
          created_at: string | null
          deviation_percent: number | null
          id: string
          material_id: string
          quantity_in_sample: number
          recorded_date: string
          source_po_id: string | null
          source_po_item_id: string | null
          standard_weight_per_piece: number | null
          total_weight: number
          vendor_id: string
        }
        Insert: {
          actual_weight_per_piece: number
          brand_id?: string | null
          created_at?: string | null
          deviation_percent?: number | null
          id?: string
          material_id: string
          quantity_in_sample: number
          recorded_date?: string
          source_po_id?: string | null
          source_po_item_id?: string | null
          standard_weight_per_piece?: number | null
          total_weight: number
          vendor_id: string
        }
        Update: {
          actual_weight_per_piece?: number
          brand_id?: string | null
          created_at?: string | null
          deviation_percent?: number | null
          id?: string
          material_id?: string
          quantity_in_sample?: number
          recorded_date?: string
          source_po_id?: string | null
          source_po_item_id?: string | null
          standard_weight_per_piece?: number | null
          total_weight?: number
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tmt_weight_history_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "material_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tmt_weight_history_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tmt_weight_history_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_group_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "tmt_weight_history_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock_alerts"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "tmt_weight_history_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_materials_with_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tmt_weight_history_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_site_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "tmt_weight_history_source_po_id_fkey"
            columns: ["source_po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tmt_weight_history_source_po_id_fkey"
            columns: ["source_po_id"]
            isOneToOne: false
            referencedRelation: "v_pending_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tmt_weight_history_source_po_item_id_fkey"
            columns: ["source_po_item_id"]
            isOneToOne: true
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tmt_weight_history_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          assigned_sites: string[] | null
          auth_id: string | null
          avatar_url: string | null
          created_at: string
          date_format: string | null
          display_name: string | null
          email: string
          email_notifications: boolean | null
          id: string
          job_title: string | null
          last_login_at: string | null
          name: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["user_status"]
          theme_preference: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          assigned_sites?: string[] | null
          auth_id?: string | null
          avatar_url?: string | null
          created_at?: string
          date_format?: string | null
          display_name?: string | null
          email: string
          email_notifications?: boolean | null
          id?: string
          job_title?: string | null
          last_login_at?: string | null
          name: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          theme_preference?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          assigned_sites?: string[] | null
          auth_id?: string | null
          avatar_url?: string | null
          created_at?: string
          date_format?: string | null
          display_name?: string | null
          email?: string
          email_notifications?: boolean | null
          id?: string
          job_title?: string | null
          last_login_at?: string | null
          name?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          theme_preference?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      vendor_inventory: {
        Row: {
          brand_id: string | null
          created_at: string | null
          current_price: number | null
          custom_material_name: string | null
          gst_rate: number | null
          id: string
          inquiry_location: string | null
          is_available: boolean | null
          is_reference_price: boolean | null
          last_price_update: string | null
          lead_time_days: number | null
          loading_cost: number | null
          material_id: string | null
          min_order_qty: number | null
          notes: string | null
          price_includes_gst: boolean | null
          price_includes_transport: boolean | null
          price_source: string | null
          pricing_mode: string | null
          source_company_id: string | null
          transport_cost: number | null
          unit: string | null
          unloading_cost: number | null
          updated_at: string | null
          vendor_id: string
        }
        Insert: {
          brand_id?: string | null
          created_at?: string | null
          current_price?: number | null
          custom_material_name?: string | null
          gst_rate?: number | null
          id?: string
          inquiry_location?: string | null
          is_available?: boolean | null
          is_reference_price?: boolean | null
          last_price_update?: string | null
          lead_time_days?: number | null
          loading_cost?: number | null
          material_id?: string | null
          min_order_qty?: number | null
          notes?: string | null
          price_includes_gst?: boolean | null
          price_includes_transport?: boolean | null
          price_source?: string | null
          pricing_mode?: string | null
          source_company_id?: string | null
          transport_cost?: number | null
          unit?: string | null
          unloading_cost?: number | null
          updated_at?: string | null
          vendor_id: string
        }
        Update: {
          brand_id?: string | null
          created_at?: string | null
          current_price?: number | null
          custom_material_name?: string | null
          gst_rate?: number | null
          id?: string
          inquiry_location?: string | null
          is_available?: boolean | null
          is_reference_price?: boolean | null
          last_price_update?: string | null
          lead_time_days?: number | null
          loading_cost?: number | null
          material_id?: string | null
          min_order_qty?: number | null
          notes?: string | null
          price_includes_gst?: boolean | null
          price_includes_transport?: boolean | null
          price_source?: string | null
          pricing_mode?: string | null
          source_company_id?: string | null
          transport_cost?: number | null
          unit?: string | null
          unloading_cost?: number | null
          updated_at?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_inventory_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "material_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_group_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "vendor_inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock_alerts"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "vendor_inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_materials_with_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_site_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "vendor_inventory_source_company_id_fkey"
            columns: ["source_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_inventory_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_material_categories: {
        Row: {
          category_id: string
          created_at: string | null
          id: string
          is_primary: boolean | null
          vendor_id: string
        }
        Insert: {
          category_id: string
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          vendor_id: string
        }
        Update: {
          category_id?: string
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_material_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "material_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_material_categories_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_price_history: {
        Row: {
          created_at: string | null
          effective_date: string
          id: string
          material_vendor_id: string
          new_price: number
          old_price: number
          reason: string | null
          recorded_by: string | null
        }
        Insert: {
          created_at?: string | null
          effective_date?: string
          id?: string
          material_vendor_id: string
          new_price: number
          old_price: number
          reason?: string | null
          recorded_by?: string | null
        }
        Update: {
          created_at?: string | null
          effective_date?: string
          id?: string
          material_vendor_id?: string
          new_price?: number
          old_price?: number
          reason?: string | null
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_price_history_material_vendor_id_fkey"
            columns: ["material_vendor_id"]
            isOneToOne: false
            referencedRelation: "material_vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_price_history_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          accepts_cash: boolean | null
          accepts_credit: boolean | null
          accepts_upi: boolean | null
          address: string | null
          alternate_phone: string | null
          bank_account_number: string | null
          bank_ifsc: string | null
          bank_name: string | null
          city: string | null
          code: string | null
          contact_person: string | null
          created_at: string | null
          created_by: string | null
          credit_days: number | null
          credit_limit: number | null
          delivery_radius_km: number | null
          email: string | null
          gst_number: string | null
          has_physical_store: boolean | null
          id: string
          is_active: boolean | null
          latitude: number | null
          longitude: number | null
          min_order_amount: number | null
          name: string
          notes: string | null
          pan_number: string | null
          payment_terms_days: number | null
          phone: string | null
          pincode: string | null
          provides_loading: boolean | null
          provides_transport: boolean | null
          provides_unloading: boolean | null
          qr_code_url: string | null
          rating: number | null
          serving_locations: string[] | null
          shop_name: string | null
          shop_photo_url: string | null
          specializations: string[] | null
          state: string | null
          store_address: string | null
          store_city: string | null
          store_pincode: string | null
          updated_at: string | null
          updated_by: string | null
          upi_id: string | null
          vendor_type: Database["public"]["Enums"]["vendor_type"] | null
          whatsapp_number: string | null
        }
        Insert: {
          accepts_cash?: boolean | null
          accepts_credit?: boolean | null
          accepts_upi?: boolean | null
          address?: string | null
          alternate_phone?: string | null
          bank_account_number?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          city?: string | null
          code?: string | null
          contact_person?: string | null
          created_at?: string | null
          created_by?: string | null
          credit_days?: number | null
          credit_limit?: number | null
          delivery_radius_km?: number | null
          email?: string | null
          gst_number?: string | null
          has_physical_store?: boolean | null
          id?: string
          is_active?: boolean | null
          latitude?: number | null
          longitude?: number | null
          min_order_amount?: number | null
          name: string
          notes?: string | null
          pan_number?: string | null
          payment_terms_days?: number | null
          phone?: string | null
          pincode?: string | null
          provides_loading?: boolean | null
          provides_transport?: boolean | null
          provides_unloading?: boolean | null
          qr_code_url?: string | null
          rating?: number | null
          serving_locations?: string[] | null
          shop_name?: string | null
          shop_photo_url?: string | null
          specializations?: string[] | null
          state?: string | null
          store_address?: string | null
          store_city?: string | null
          store_pincode?: string | null
          updated_at?: string | null
          updated_by?: string | null
          upi_id?: string | null
          vendor_type?: Database["public"]["Enums"]["vendor_type"] | null
          whatsapp_number?: string | null
        }
        Update: {
          accepts_cash?: boolean | null
          accepts_credit?: boolean | null
          accepts_upi?: boolean | null
          address?: string | null
          alternate_phone?: string | null
          bank_account_number?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          city?: string | null
          code?: string | null
          contact_person?: string | null
          created_at?: string | null
          created_by?: string | null
          credit_days?: number | null
          credit_limit?: number | null
          delivery_radius_km?: number | null
          email?: string | null
          gst_number?: string | null
          has_physical_store?: boolean | null
          id?: string
          is_active?: boolean | null
          latitude?: number | null
          longitude?: number | null
          min_order_amount?: number | null
          name?: string
          notes?: string | null
          pan_number?: string | null
          payment_terms_days?: number | null
          phone?: string | null
          pincode?: string | null
          provides_loading?: boolean | null
          provides_transport?: boolean | null
          provides_unloading?: boolean | null
          qr_code_url?: string | null
          rating?: number | null
          serving_locations?: string[] | null
          shop_name?: string | null
          shop_photo_url?: string | null
          specializations?: string[] | null
          state?: string | null
          store_address?: string | null
          store_city?: string | null
          store_pincode?: string | null
          updated_at?: string | null
          updated_by?: string | null
          upi_id?: string | null
          vendor_type?: Database["public"]["Enums"]["vendor_type"] | null
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      mv_settlement_failures_daily: {
        Row: {
          error_types: string[] | null
          failure_date: string | null
          max_retries_seen: number | null
          site_id: string | null
          total_failures: number | null
          unique_dates_affected: number | null
          unique_references_attempted: number | null
        }
        Relationships: []
      }
      payer_expense_summary: {
        Row: {
          expense_count: number | null
          first_expense_date: string | null
          is_active: boolean | null
          last_expense_date: string | null
          payer_id: string | null
          payer_name: string | null
          phone: string | null
          site_id: string | null
          total_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "site_payers_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_payers_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
        ]
      }
      v_active_attendance: {
        Row: {
          category_name: string | null
          contract_id: string | null
          created_at: string | null
          daily_earnings: number | null
          daily_log_id: string | null
          daily_rate_applied: number | null
          date: string | null
          deleted_at: string | null
          deleted_by: string | null
          end_time: string | null
          entered_by: string | null
          hours_worked: number | null
          id: string | null
          is_deleted: boolean | null
          is_verified: boolean | null
          laborer_id: string | null
          laborer_name: string | null
          laborer_phone: string | null
          role_name: string | null
          section_id: string | null
          section_name: string | null
          site_id: string | null
          site_name: string | null
          start_time: string | null
          task_completed: string | null
          team_id: string | null
          team_leader: string | null
          team_name: string | null
          updated_at: string | null
          verified_by: string | null
          work_days: number | null
          work_description: string | null
          work_variance: Database["public"]["Enums"]["work_variance"] | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_attendance_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "subcontracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_subcontract_reconciliation"
            referencedColumns: ["subcontract_id"]
          },
          {
            foreignKeyName: "daily_attendance_daily_log_id_fkey"
            columns: ["daily_log_id"]
            isOneToOne: false
            referencedRelation: "daily_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_laborer_id_fkey"
            columns: ["laborer_id"]
            isOneToOne: false
            referencedRelation: "laborers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_laborer_id_fkey"
            columns: ["laborer_id"]
            isOneToOne: false
            referencedRelation: "v_laborer_advance_summary"
            referencedColumns: ["laborer_id"]
          },
          {
            foreignKeyName: "daily_attendance_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "building_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "v_section_cost_summary"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "daily_attendance_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "daily_attendance_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_weekly_summary"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "daily_attendance_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      v_all_expenses: {
        Row: {
          amount: number | null
          category_id: string | null
          category_name: string | null
          cleared_date: string | null
          contract_id: string | null
          created_at: string | null
          date: string | null
          description: string | null
          engineer_transaction_id: string | null
          entered_by: string | null
          entered_by_user_id: string | null
          expense_type: string | null
          id: string | null
          is_cleared: boolean | null
          is_deleted: boolean | null
          module: string | null
          paid_by: string | null
          payer_name: string | null
          payment_mode: string | null
          receipt_url: string | null
          recorded_date: string | null
          settlement_group_id: string | null
          settlement_reference: string | null
          site_id: string | null
          site_payer_id: string | null
          source_id: string | null
          source_type: string | null
          subcontract_title: string | null
          vendor_name: string | null
        }
        Relationships: []
      }
      v_batch_allocation_summary: {
        Row: {
          batch_code: string | null
          cost_used: number | null
          group_name: string | null
          material_id: string | null
          material_name: string | null
          paid_by_site_id: string | null
          paid_by_site_name: string | null
          quantity_used: number | null
          site_group_id: string | null
          total_purchase_cost: number | null
          unit: Database["public"]["Enums"]["material_unit"] | null
          usage_site_id: string | null
          usage_site_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_stock_transactions_batch_ref_code_fkey"
            columns: ["batch_code"]
            isOneToOne: false
            referencedRelation: "material_purchase_expenses"
            referencedColumns: ["ref_code"]
          },
          {
            foreignKeyName: "group_stock_transactions_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_transactions_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_group_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "group_stock_transactions_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock_alerts"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "group_stock_transactions_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_materials_with_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_transactions_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_site_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "group_stock_transactions_site_group_id_fkey"
            columns: ["site_group_id"]
            isOneToOne: false
            referencedRelation: "site_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_transactions_usage_site_id_fkey"
            columns: ["usage_site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_transactions_usage_site_id_fkey"
            columns: ["usage_site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
        ]
      }
      v_delivery_verification_details: {
        Row: {
          challan_number: string | null
          challan_url: string | null
          created_at: string | null
          delivery_date: string | null
          delivery_status: Database["public"]["Enums"]["delivery_status"] | null
          discrepancies: Json | null
          driver_name: string | null
          driver_phone: string | null
          engineer_verified_at: string | null
          engineer_verified_by: string | null
          grn_number: string | null
          id: string | null
          po_id: string | null
          po_number: string | null
          requires_verification: boolean | null
          site_id: string | null
          site_name: string | null
          vehicle_number: string | null
          vendor_id: string | null
          vendor_name: string | null
          vendor_phone: string | null
          verification_notes: string | null
          verification_photos: string[] | null
          verification_status: string | null
          verified_by_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_engineer_verified_by_fkey"
            columns: ["engineer_verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "v_pending_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "deliveries_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      v_group_stock_summary: {
        Row: {
          avg_cost: number | null
          brand_name: string | null
          category_name: string | null
          group_name: string | null
          last_received_date: string | null
          last_used_date: string | null
          material_code: string | null
          material_id: string | null
          material_name: string | null
          site_group_id: string | null
          total_available: number | null
          total_qty: number | null
          total_reserved: number | null
          total_value: number | null
          unit: Database["public"]["Enums"]["material_unit"] | null
        }
        Relationships: [
          {
            foreignKeyName: "group_stock_inventory_site_group_id_fkey"
            columns: ["site_group_id"]
            isOneToOne: false
            referencedRelation: "site_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      v_group_usage_by_site: {
        Row: {
          group_name: string | null
          material_id: string | null
          material_name: string | null
          site_group_id: string | null
          site_name: string | null
          total_cost: number | null
          total_quantity: number | null
          unit: Database["public"]["Enums"]["material_unit"] | null
          usage_month: string | null
          usage_site_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_stock_transactions_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_transactions_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_group_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "group_stock_transactions_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock_alerts"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "group_stock_transactions_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_materials_with_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_transactions_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_site_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "group_stock_transactions_site_group_id_fkey"
            columns: ["site_group_id"]
            isOneToOne: false
            referencedRelation: "site_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_transactions_usage_site_id_fkey"
            columns: ["usage_site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_transactions_usage_site_id_fkey"
            columns: ["usage_site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
        ]
      }
      v_inter_site_balance: {
        Row: {
          creditor_site_id: string | null
          creditor_site_name: string | null
          debtor_site_id: string | null
          debtor_site_name: string | null
          group_name: string | null
          material_count: number | null
          site_group_id: string | null
          total_amount_owed: number | null
          total_quantity: number | null
          transaction_count: number | null
          week_end: string | null
          week_number: number | null
          week_start: string | null
          year: number | null
        }
        Relationships: [
          {
            foreignKeyName: "group_stock_transactions_payment_source_site_id_fkey"
            columns: ["creditor_site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_transactions_payment_source_site_id_fkey"
            columns: ["creditor_site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "group_stock_transactions_site_group_id_fkey"
            columns: ["site_group_id"]
            isOneToOne: false
            referencedRelation: "site_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_transactions_usage_site_id_fkey"
            columns: ["debtor_site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_transactions_usage_site_id_fkey"
            columns: ["debtor_site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
        ]
      }
      v_laborer_advance_summary: {
        Row: {
          calculated_advance_deducted: number | null
          calculated_advance_given: number | null
          laborer_id: string | null
          laborer_name: string | null
          pending_advance: number | null
          total_advance_deducted: number | null
          total_advance_given: number | null
        }
        Insert: {
          calculated_advance_deducted?: never
          calculated_advance_given?: never
          laborer_id?: string | null
          laborer_name?: string | null
          pending_advance?: never
          total_advance_deducted?: number | null
          total_advance_given?: number | null
        }
        Update: {
          calculated_advance_deducted?: never
          calculated_advance_given?: never
          laborer_id?: string | null
          laborer_name?: string | null
          pending_advance?: never
          total_advance_deducted?: number | null
          total_advance_given?: number | null
        }
        Relationships: []
      }
      v_low_stock_alerts: {
        Row: {
          avg_unit_cost: number | null
          current_qty: number | null
          id: string | null
          material_code: string | null
          material_id: string | null
          material_name: string | null
          reorder_level: number | null
          shortage_qty: number | null
          site_id: string | null
          site_name: string | null
          unit: Database["public"]["Enums"]["material_unit"] | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_inventory_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_inventory_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
        ]
      }
      v_material_usage_by_section: {
        Row: {
          first_usage: string | null
          last_usage: string | null
          material_id: string | null
          material_name: string | null
          section_id: string | null
          section_name: string | null
          site_id: string | null
          total_cost: number | null
          total_quantity: number | null
          unit: Database["public"]["Enums"]["material_unit"] | null
          usage_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_material_usage_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_material_usage_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_group_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "daily_material_usage_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock_alerts"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "daily_material_usage_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_materials_with_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_material_usage_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_site_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "daily_material_usage_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "building_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_material_usage_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "v_section_cost_summary"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "daily_material_usage_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_material_usage_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
        ]
      }
      v_material_vendor_prices: {
        Row: {
          brand_id: string | null
          brand_name: string | null
          category_name: string | null
          current_price: number | null
          is_available: boolean | null
          last_price_update: string | null
          lead_time_days: number | null
          loading_cost: number | null
          material_code: string | null
          material_id: string | null
          material_name: string | null
          min_order_amount: number | null
          min_order_qty: number | null
          previous_price: number | null
          price_includes_gst: boolean | null
          provides_loading: boolean | null
          provides_transport: boolean | null
          shop_name: string | null
          store_city: string | null
          total_landed_cost: number | null
          transport_cost: number | null
          unit: Database["public"]["Enums"]["material_unit"] | null
          unloading_cost: number | null
          vendor_id: string | null
          vendor_name: string | null
          vendor_type: Database["public"]["Enums"]["vendor_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_inventory_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "material_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_group_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "vendor_inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock_alerts"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "vendor_inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_materials_with_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_site_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "vendor_inventory_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      v_materials_with_variants: {
        Row: {
          category_code: string | null
          category_id: string | null
          category_name: string | null
          code: string | null
          conversion_factor: number | null
          created_at: string | null
          created_by: string | null
          description: string | null
          gst_rate: number | null
          hsn_code: string | null
          id: string | null
          image_url: string | null
          is_active: boolean | null
          is_variant: boolean | null
          local_name: string | null
          min_order_qty: number | null
          name: string | null
          parent_code: string | null
          parent_id: string | null
          parent_name: string | null
          reorder_level: number | null
          secondary_unit: Database["public"]["Enums"]["material_unit"] | null
          specifications: Json | null
          unit: Database["public"]["Enums"]["material_unit"] | null
          updated_at: string | null
          variant_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "materials_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "material_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_group_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "materials_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock_alerts"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "materials_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_materials_with_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_site_stock_summary"
            referencedColumns: ["material_id"]
          },
        ]
      }
      v_pending_advances: {
        Row: {
          laborer_id: string | null
          pending_amount: number | null
          pending_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "advances_laborer_id_fkey"
            columns: ["laborer_id"]
            isOneToOne: false
            referencedRelation: "laborers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advances_laborer_id_fkey"
            columns: ["laborer_id"]
            isOneToOne: false
            referencedRelation: "v_laborer_advance_summary"
            referencedColumns: ["laborer_id"]
          },
        ]
      }
      v_pending_deletions: {
        Row: {
          created_at: string | null
          executed_at: string | null
          id: string | null
          reason: string | null
          record_id: string | null
          record_summary: string | null
          requested_at: string | null
          requested_by: string | null
          requested_by_name: string | null
          requested_by_role: Database["public"]["Enums"]["user_role"] | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["deletion_request_status"] | null
          table_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deletion_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deletion_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      v_pending_delivery_verifications: {
        Row: {
          challan_number: string | null
          created_at: string | null
          delivery_date: string | null
          delivery_status: Database["public"]["Enums"]["delivery_status"] | null
          driver_name: string | null
          driver_phone: string | null
          grn_number: string | null
          id: string | null
          item_count: number | null
          po_id: string | null
          po_number: string | null
          site_id: string | null
          site_name: string | null
          total_value: number | null
          vehicle_number: string | null
          vendor_id: string | null
          vendor_name: string | null
          verification_status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "v_pending_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "deliveries_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      v_pending_inter_site_settlements: {
        Row: {
          creditor_site_id: string | null
          creditor_site_name: string | null
          debtor_site_id: string | null
          debtor_site_name: string | null
          group_name: string | null
          material_count: number | null
          settled_amount: number | null
          settlement_id: string | null
          settlement_state: string | null
          settlement_status:
            | Database["public"]["Enums"]["inter_site_settlement_status"]
            | null
          site_group_id: string | null
          total_amount_owed: number | null
          total_quantity: number | null
          transaction_count: number | null
          week_end: string | null
          week_number: number | null
          week_start: string | null
          year: number | null
        }
        Relationships: [
          {
            foreignKeyName: "group_stock_transactions_payment_source_site_id_fkey"
            columns: ["creditor_site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_transactions_payment_source_site_id_fkey"
            columns: ["creditor_site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "group_stock_transactions_site_group_id_fkey"
            columns: ["site_group_id"]
            isOneToOne: false
            referencedRelation: "site_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_transactions_usage_site_id_fkey"
            columns: ["debtor_site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_transactions_usage_site_id_fkey"
            columns: ["debtor_site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
        ]
      }
      v_pending_purchase_orders: {
        Row: {
          created_by: string | null
          created_by_name: string | null
          expected_delivery_date: string | null
          id: string | null
          order_date: string | null
          po_number: string | null
          site_id: string | null
          site_name: string | null
          status: Database["public"]["Enums"]["po_status"] | null
          total_amount: number | null
          vendor_id: string | null
          vendor_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      v_price_history_details: {
        Row: {
          bill_date: string | null
          bill_number: string | null
          bill_url: string | null
          brand_id: string | null
          brand_name: string | null
          change_percentage: number | null
          change_reason: string | null
          change_reason_id: string | null
          change_reason_text: string | null
          created_at: string | null
          id: string | null
          material_code: string | null
          material_id: string | null
          material_name: string | null
          material_unit: Database["public"]["Enums"]["material_unit"] | null
          notes: string | null
          previous_price: number | null
          price: number | null
          price_change: number | null
          reason_is_increase: boolean | null
          recorded_date: string | null
          vendor_id: string | null
          vendor_name: string | null
          vendor_shop_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_history_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "material_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_change_reason_id_fkey"
            columns: ["change_reason_id"]
            isOneToOne: false
            referencedRelation: "price_change_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_group_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "price_history_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock_alerts"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "price_history_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_materials_with_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_site_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "price_history_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      v_price_trends: {
        Row: {
          brand_id: string | null
          brand_name: string | null
          change_percentage: number | null
          material_id: string | null
          material_name: string | null
          max_price_90d: number | null
          min_price_90d: number | null
          moving_avg_30d: number | null
          price: number | null
          recorded_date: string | null
          vendor_id: string | null
          vendor_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_history_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "material_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_group_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "price_history_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock_alerts"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "price_history_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_materials_with_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_site_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "price_history_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      v_salary_periods_detailed: {
        Row: {
          advance_deductions: number | null
          amount_paid: number | null
          balance_due: number | null
          calculated_at: string | null
          calculated_by: string | null
          category_name: string | null
          created_at: string | null
          extras: number | null
          gross_earnings: number | null
          id: string | null
          laborer_id: string | null
          laborer_name: string | null
          laborer_phone: string | null
          net_payable: number | null
          notes: string | null
          other_additions: number | null
          other_deductions: number | null
          role_name: string | null
          site_breakdown: Json | null
          status: Database["public"]["Enums"]["salary_status"] | null
          team_leader: string | null
          team_name: string | null
          total_additions: number | null
          total_days_worked: number | null
          total_deductions: number | null
          total_hours_worked: number | null
          updated_at: string | null
          week_ending: string | null
          week_start: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salary_periods_calculated_by_fkey"
            columns: ["calculated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_periods_laborer_id_fkey"
            columns: ["laborer_id"]
            isOneToOne: false
            referencedRelation: "laborers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_periods_laborer_id_fkey"
            columns: ["laborer_id"]
            isOneToOne: false
            referencedRelation: "v_laborer_advance_summary"
            referencedColumns: ["laborer_id"]
          },
        ]
      }
      v_section_cost_by_role: {
        Row: {
          category_name: string | null
          laborer_count: number | null
          role_id: string | null
          role_name: string | null
          section_id: string | null
          section_name: string | null
          site_id: string | null
          total_amount: number | null
          total_days: number | null
        }
        Relationships: [
          {
            foreignKeyName: "building_sections_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "building_sections_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "daily_attendance_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "building_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "v_section_cost_summary"
            referencedColumns: ["section_id"]
          },
        ]
      }
      v_section_cost_summary: {
        Row: {
          expense_cost: number | null
          labor_cost: number | null
          section_id: string | null
          section_name: string | null
          sequence_order: number | null
          site_id: string | null
          site_name: string | null
          status: Database["public"]["Enums"]["section_status"] | null
          total_cost: number | null
          total_work_days: number | null
          unique_laborers: number | null
        }
        Relationships: [
          {
            foreignKeyName: "building_sections_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "building_sections_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
        ]
      }
      v_settlement_creation_failures: {
        Row: {
          attempted_references: string[] | null
          error_types: string[] | null
          failure_count: number | null
          failure_hour: string | null
          first_failure: string | null
          last_failure: string | null
          max_retries: number | null
          settlement_date: string | null
          site_id: string | null
        }
        Relationships: []
      }
      v_settlement_details: {
        Row: {
          approved_at: string | null
          created_at: string | null
          from_site_id: string | null
          from_site_name: string | null
          group_name: string | null
          id: string | null
          item_count: number | null
          materials_summary: string | null
          notes: string | null
          paid_amount: number | null
          pending_amount: number | null
          period_end: string | null
          period_start: string | null
          settled_at: string | null
          settlement_code: string | null
          site_group_id: string | null
          status:
            | Database["public"]["Enums"]["inter_site_settlement_status"]
            | null
          to_site_id: string | null
          to_site_name: string | null
          total_amount: number | null
          week_number: number | null
          year: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inter_site_material_settlements_from_site_id_fkey"
            columns: ["from_site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_site_material_settlements_from_site_id_fkey"
            columns: ["from_site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "inter_site_material_settlements_site_group_id_fkey"
            columns: ["site_group_id"]
            isOneToOne: false
            referencedRelation: "site_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_site_material_settlements_to_site_id_fkey"
            columns: ["to_site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_site_material_settlements_to_site_id_fkey"
            columns: ["to_site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
        ]
      }
      v_site_daily_by_category: {
        Row: {
          category_id: string | null
          category_name: string | null
          date: string | null
          laborer_count: number | null
          site_id: string | null
          total_amount: number | null
          total_days: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_attendance_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
        ]
      }
      v_site_daily_summary: {
        Row: {
          date: string | null
          site_id: string | null
          site_name: string | null
          total_earnings: number | null
          total_laborers: number | null
          total_work_days: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_attendance_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
        ]
      }
      v_site_eligible_batches: {
        Row: {
          allocation_type: string | null
          available_qty: number | null
          avg_unit_cost: number | null
          batch_code: string | null
          brand_id: string | null
          brand_name: string | null
          can_use: boolean | null
          dedicated_site_id: string | null
          group_name: string | null
          inventory_id: string | null
          is_dedicated: boolean | null
          material_code: string | null
          material_id: string | null
          material_name: string | null
          site_group_id: string | null
          site_id: string | null
          site_name: string | null
          unit: Database["public"]["Enums"]["material_unit"] | null
        }
        Relationships: [
          {
            foreignKeyName: "group_stock_inventory_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "material_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_inventory_dedicated_site_id_fkey"
            columns: ["dedicated_site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_inventory_dedicated_site_id_fkey"
            columns: ["dedicated_site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "group_stock_inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_group_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "group_stock_inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock_alerts"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "group_stock_inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_materials_with_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_site_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "group_stock_inventory_site_group_id_fkey"
            columns: ["site_group_id"]
            isOneToOne: false
            referencedRelation: "site_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      v_site_stock_summary: {
        Row: {
          avg_cost: number | null
          category_name: string | null
          material_code: string | null
          material_id: string | null
          material_name: string | null
          site_id: string | null
          site_name: string | null
          total_available: number | null
          total_qty: number | null
          total_reserved: number | null
          total_value: number | null
          unit: Database["public"]["Enums"]["material_unit"] | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_inventory_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_inventory_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
        ]
      }
      v_stock_by_batch: {
        Row: {
          available_qty: number | null
          avg_unit_cost: number | null
          batch_code: string | null
          brand_id: string | null
          brand_name: string | null
          can_be_shared: boolean | null
          category_name: string | null
          current_qty: number | null
          dedicated_site_id: string | null
          dedicated_site_name: string | null
          group_name: string | null
          id: string | null
          is_dedicated: boolean | null
          last_received_date: string | null
          last_used_date: string | null
          material_code: string | null
          material_id: string | null
          material_name: string | null
          paid_by_site_id: string | null
          paid_by_site_name: string | null
          reserved_qty: number | null
          site_group_id: string | null
          total_value: number | null
          unit: Database["public"]["Enums"]["material_unit"] | null
        }
        Relationships: [
          {
            foreignKeyName: "group_stock_inventory_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "material_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_inventory_dedicated_site_id_fkey"
            columns: ["dedicated_site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_inventory_dedicated_site_id_fkey"
            columns: ["dedicated_site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "group_stock_inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_group_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "group_stock_inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock_alerts"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "group_stock_inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_materials_with_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_stock_inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_site_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "group_stock_inventory_site_group_id_fkey"
            columns: ["site_group_id"]
            isOneToOne: false
            referencedRelation: "site_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      v_subcontract_reconciliation: {
        Row: {
          amount_paid: number | null
          amount_paid_settlements: number | null
          amount_paid_subcontract_payments: number | null
          implied_labor_value_detailed: number | null
          implied_labor_value_headcount: number | null
          labor_tracking_mode: string | null
          quoted_amount: number | null
          site_id: string | null
          subcontract_id: string | null
          trade_category_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "subcontracts_trade_category_id_fkey"
            columns: ["trade_category_id"]
            isOneToOne: false
            referencedRelation: "labor_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontracts_trade_category_id_fkey"
            columns: ["trade_category_id"]
            isOneToOne: false
            referencedRelation: "v_site_daily_by_category"
            referencedColumns: ["category_id"]
          },
        ]
      }
      v_tea_shop_weekly: {
        Row: {
          num_days: number | null
          shop_name: string | null
          site_id: string | null
          tea_shop_id: string | null
          total_amount: number | null
          total_people: number | null
          week_end: string | null
          week_start: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tea_shop_accounts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tea_shop_accounts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_eligible_batches"
            referencedColumns: ["site_id"]
          },
        ]
      }
      v_team_weekly_by_role: {
        Row: {
          laborer_count: number | null
          role_id: string | null
          role_name: string | null
          team_id: string | null
          team_name: string | null
          total_amount: number | null
          total_days: number | null
          week_ending: string | null
        }
        Relationships: [
          {
            foreignKeyName: "laborers_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "laborers_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_weekly_summary"
            referencedColumns: ["team_id"]
          },
        ]
      }
      v_team_weekly_summary: {
        Row: {
          active_members: number | null
          leader_name: string | null
          team_id: string | null
          team_name: string | null
          total_advances: number | null
          total_earnings: number | null
          total_expenses: number | null
          total_work_days: number | null
          week_ending: string | null
        }
        Relationships: []
      }
      v_unread_notifications: {
        Row: {
          unread_count: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      v_vendor_inventory_details: {
        Row: {
          brand_id: string | null
          brand_name: string | null
          category_name: string | null
          current_price: number | null
          gst_rate: number | null
          id: string | null
          is_available: boolean | null
          last_price_update: string | null
          lead_time_days: number | null
          loading_cost: number | null
          material_code: string | null
          material_id: string | null
          material_name: string | null
          min_order_qty: number | null
          price_includes_gst: boolean | null
          price_includes_transport: boolean | null
          price_source: string | null
          provides_loading: boolean | null
          provides_transport: boolean | null
          shop_name: string | null
          store_city: string | null
          total_landed_cost: number | null
          transport_cost: number | null
          unit: string | null
          unloading_cost: number | null
          vendor_id: string | null
          vendor_name: string | null
          vendor_type: Database["public"]["Enums"]["vendor_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_inventory_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "material_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_group_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "vendor_inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock_alerts"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "vendor_inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_materials_with_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_site_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "vendor_inventory_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      v_weight_prediction_stats: {
        Row: {
          avg_deviation_percent: number | null
          avg_weight_per_piece: number | null
          brand_id: string | null
          last_recorded_date: string | null
          material_id: string | null
          max_weight: number | null
          min_weight: number | null
          sample_count: number | null
          total_pieces_sampled: number | null
          vendor_id: string | null
          weight_stddev: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tmt_weight_history_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "material_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tmt_weight_history_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tmt_weight_history_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_group_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "tmt_weight_history_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock_alerts"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "tmt_weight_history_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_materials_with_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tmt_weight_history_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "v_site_stock_summary"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "tmt_weight_history_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      adjust_batch_costs_manual: {
        Args: { p_amount_paid: number; p_batch_ref_code: string }
        Returns: {
          adjustment_ratio: number
          updated_transactions: number
          updated_usage_records: number
        }[]
      }
      approve_deletion: {
        Args: {
          p_request_id: string
          p_review_notes?: string
          p_reviewed_by: string
        }
        Returns: boolean
      }
      approve_settlement: {
        Args: { p_approved_by: string; p_settlement_id: string }
        Returns: boolean
      }
      calculate_material_weight: {
        Args: { p_material_id: string; p_quantity: number }
        Returns: {
          total_weight: number
          weight_per_unit: number
          weight_unit: string
        }[]
      }
      calculate_rental_cost: {
        Args: { p_as_of_date?: string; p_order_id: string }
        Returns: {
          accrued_cost: number
          expected_total: number
          items_count: number
          total_days: number
          total_rental_cost: number
        }[]
      }
      calculate_salary_period: {
        Args: {
          p_calculated_by?: string
          p_laborer_id: string
          p_week_ending: string
        }
        Returns: string
      }
      can_access_site: { Args: { p_site_id: string }; Returns: boolean }
      can_site_use_batch: {
        Args: { p_inventory_id: string; p_site_id: string }
        Returns: boolean
      }
      cancel_allocated_expense: {
        Args: { p_expense_id: string; p_settlement_reference: string }
        Returns: {
          deleted_expense: boolean
          deleted_settlement_id: string
          reset_usage_records: number
        }[]
      }
      cancel_settlement: {
        Args: {
          p_cancelled_by: string
          p_reason: string
          p_settlement_id: string
        }
        Returns: boolean
      }
      cascade_delete_material_request: {
        Args: { p_request_id: string; p_site_id: string }
        Returns: Json
      }
      cascade_delete_purchase_order: {
        Args: { p_po_id: string; p_site_id: string }
        Returns: Json
      }
      check_settlement_failure_alerts: {
        Args: never
        Returns: {
          alert_level: string
          alert_message: string
          details: Json
          site_id: string
        }[]
      }
      check_settlement_reference_integrity: {
        Args: { p_site_id?: string }
        Returns: {
          details: string
          issue_type: string
          settlement_date: string
          settlement_id: string
          settlement_reference: string
        }[]
      }
      cleanup_old_settlement_audit_records: {
        Args: { p_days_to_keep?: number }
        Returns: number
      }
      complete_group_stock_batch: {
        Args: { p_batch_code: string; p_site_allocations: Json }
        Returns: {
          child_ref_codes: string[]
        }[]
      }
      convert_group_to_own_site: {
        Args: { p_batch_code: string; p_target_site_id: string }
        Returns: string
      }
      copy_default_sections_to_site: {
        Args: { p_site_id: string }
        Returns: number
      }
      create_audit_log: {
        Args: {
          p_action: Database["public"]["Enums"]["audit_action"]
          p_changed_by?: string
          p_new_data?: Json
          p_notes?: string
          p_old_data?: Json
          p_record_id: string
          p_table_name: string
        }
        Returns: string
      }
      create_local_purchase_reimbursement: {
        Args: { p_purchase_id: string; p_user_id: string }
        Returns: string
      }
      create_self_use_expense_if_needed: {
        Args: { p_batch_ref_code: string }
        Returns: undefined
      }
      create_settlement_group: {
        Args: {
          p_actual_payment_date?: string
          p_created_by?: string
          p_created_by_name?: string
          p_engineer_transaction_id?: string
          p_laborer_count: number
          p_notes?: string
          p_payer_name?: string
          p_payer_source?: string
          p_payment_channel: string
          p_payment_mode?: string
          p_payment_type?: string
          p_proof_url?: string
          p_proof_urls?: string[]
          p_settlement_date: string
          p_settlement_type?: string
          p_site_id: string
          p_subcontract_id?: string
          p_total_amount: number
          p_week_allocations?: Json
        }
        Returns: {
          id: string
          settlement_reference: string
        }[]
      }
      create_weekly_settlement: {
        Args: {
          p_created_by?: string
          p_from_site_id: string
          p_site_group_id: string
          p_to_site_id: string
          p_week: number
          p_year: number
        }
        Returns: string
      }
      dedicate_batch_to_site: {
        Args: { p_inventory_id: string; p_site_id: string }
        Returns: boolean
      }
      delete_batch_cascade: {
        Args: { p_batch_ref_code: string }
        Returns: {
          deleted_allocated_expenses: number
          deleted_batch: boolean
          deleted_expense_items: number
          deleted_settlement_items: number
          deleted_settlements: number
          deleted_transactions: number
          deleted_usage_records: number
        }[]
      }
      delete_engineer_transaction: {
        Args: { p_transaction_id: string }
        Returns: boolean
      }
      fix_duplicate_settlement_reference: {
        Args: { p_new_suffix?: string; p_settlement_id: string }
        Returns: string
      }
      generate_batch_code:
        | { Args: never; Returns: string }
        | { Args: { p_payer_source: string }; Returns: string }
      generate_equipment_code: {
        Args: { p_category_id: string }
        Returns: string
      }
      generate_grn_number: { Args: never; Returns: string }
      generate_group_stock_purchase_reference: {
        Args: { p_site_id?: string }
        Returns: string
      }
      generate_group_tea_shop_settlement_reference: {
        Args: never
        Returns: string
      }
      generate_material_purchase_reference: {
        Args: { p_site_id?: string }
        Returns: string
      }
      generate_misc_expense_reference: {
        Args: { p_site_id: string }
        Returns: string
      }
      generate_mr_number: { Args: never; Returns: string }
      generate_payment_reference: {
        Args: { p_site_id: string }
        Returns: string
      }
      generate_po_number: { Args: never; Returns: string }
      generate_rental_order_number: {
        Args: { p_site_id: string }
        Returns: string
      }
      generate_rental_settlement_reference: {
        Args: { p_site_id: string }
        Returns: string
      }
      generate_settlement_code: {
        Args: { p_week: number; p_year: number }
        Returns: string
      }
      generate_settlement_reference: {
        Args: { p_site_id: string }
        Returns: string
      }
      generate_tea_shop_settlement_reference: { Args: never; Returns: string }
      generate_transfer_number: { Args: never; Returns: string }
      generate_weekly_notifications: { Args: never; Returns: number }
      get_active_company: { Args: never; Returns: string }
      get_attendance_for_date: {
        Args: { p_date: string; p_site_id: string }
        Returns: Json
      }
      get_attendance_summary: {
        Args: { p_date_from?: string; p_date_to?: string; p_site_id: string }
        Returns: Json
      }
      get_batch_settlement_summary:
        | {
            Args: { batch_id: string }
            Returns: {
              amount_used: number
              laborer_count: number
              payment_channel: string
              settlement_date: string
              settlement_reference: string
              site_name: string
            }[]
          }
        | {
            Args: { p_batch_ref_code: string }
            Returns: {
              batch_ref_code: string
              original_qty: number
              paying_site_id: string
              paying_site_name: string
              remaining_qty: number
              site_allocations: Json
              total_amount: number
              used_qty: number
            }[]
          }
      get_current_user_id: { Args: never; Returns: string }
      get_expense_summary: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_module?: string
          p_site_id: string
        }
        Returns: Json
      }
      get_laborer_week_breakdown: {
        Args: {
          p_laborer_id: string
          p_site_id: string
          p_week_end: string
          p_week_start: string
        }
        Returns: Json
      }
      get_material_count_for_vendor: {
        Args: { p_vendor_id: string }
        Returns: number
      }
      get_materials_with_variants: {
        Args: { p_category_id?: string; p_include_inactive?: boolean }
        Returns: {
          category_id: string
          category_name: string
          code: string
          id: string
          is_active: boolean
          is_variant: boolean
          name: string
          parent_id: string
          parent_name: string
          unit: string
          variant_count: number
        }[]
      }
      get_monthly_report: {
        Args: { p_month: number; p_site_id: string; p_year: number }
        Returns: Json
      }
      get_payment_summary: {
        Args: { p_date_from?: string; p_date_to?: string; p_site_id: string }
        Returns: {
          daily_market_amount: number
          daily_market_count: number
          paid_amount: number
          paid_count: number
          pending_amount: number
          pending_dates_count: number
          weekly_amount: number
          weekly_count: number
        }[]
      }
      get_payments_ledger: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_site_id: string
          p_status?: string
          p_type?: string
        }
        Returns: {
          amount: number
          date_or_week_start: string
          for_label: string
          id: string
          is_paid: boolean
          is_pending: boolean
          laborer_id: string
          row_type: string
          settlement_ref: string
          subtype: string
          week_end: string
        }[]
      }
      get_recent_settlement_failures: {
        Args: { p_hours_back?: number; p_site_id?: string }
        Returns: {
          common_error_patterns: string[]
          failure_count: number
          most_recent_failure: string
          site_id: string
          unique_dates: number
        }[]
      }
      get_request_item_remaining_qty: {
        Args: { p_request_item_id: string }
        Returns: number
      }
      get_salary_slice_summary: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_site_id: string
          p_subcontract_id?: string
        }
        Returns: {
          advance_count: number
          advances_total: number
          future_credit: number
          mestri_owed: number
          paid_to_weeks: number
          settlement_count: number
          settlements_total: number
          wages_due: number
          weeks_count: number
        }[]
      }
      get_salary_waterfall: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_site_id: string
          p_subcontract_id?: string
        }
        Returns: {
          days_worked: number
          filled_by: Json
          laborer_count: number
          paid: number
          status: string
          wages_due: number
          week_end: string
          week_start: string
        }[]
      }
      get_settlement_batch_sources: {
        Args: { p_settlement_group_id: string }
        Returns: {
          amount_used: number
          batch_code: string
          batch_date: string
          batch_transaction_id: string
          payer_name: string
          payer_source: string
        }[]
      }
      get_settlement_laborers: {
        Args: { p_settlement_group_id: string }
        Returns: {
          amount: number
          attendance_type: string
          laborer_id: string
          laborer_name: string
          work_date: string
        }[]
      }
      get_settlement_reference_stats: {
        Args: { p_days_back?: number; p_site_id: string }
        Returns: {
          duplicate_references: string[]
          has_duplicates: boolean
          has_gaps: boolean
          max_sequence: number
          min_sequence: number
          settlement_date: string
          total_settlements: number
        }[]
      }
      get_site_dashboard: {
        Args: { p_date?: string; p_site_id: string }
        Returns: Json
      }
      get_site_dashboard_detailed: {
        Args: { p_date?: string; p_site_id: string }
        Returns: Json
      }
      get_site_supervisor_cost: { Args: { p_site_id: string }; Returns: number }
      get_site_unsettled_entries: {
        Args: { p_site_id: string; p_tea_shop_id: string }
        Returns: {
          entry_date: string
          entry_id: string
          entry_total_amount: number
          is_group_entry: boolean
          site_allocated_amount: number
          site_amount_paid: number
          site_is_fully_paid: boolean
          site_remaining: number
        }[]
      }
      get_tea_shop_for_site: { Args: { p_site_id: string }; Returns: string }
      get_team_weekly_summary: {
        Args: { p_team_id: string; p_week_ending: string }
        Returns: Json
      }
      get_unsettled_balance: {
        Args: {
          p_from_site_id: string
          p_site_group_id: string
          p_to_site_id: string
        }
        Returns: number
      }
      get_user_companies: { Args: never; Returns: string[] }
      get_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_vendor_count_for_material: {
        Args: { p_material_id: string }
        Returns: number
      }
      get_week_attendance_summary: {
        Args: { p_site_id: string; p_week_ending: string }
        Returns: {
          category_name: string
          extras: number
          laborer_id: string
          laborer_name: string
          laborer_phone: string
          net_payable: number
          pending_advances: number
          role_name: string
          team_id: string
          team_name: string
          total_days: number
          total_earnings: number
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_company_member: {
        Args: { check_company_id: string }
        Returns: boolean
      }
      is_settlement_reference_available: {
        Args: { p_settlement_reference: string }
        Returns: boolean
      }
      preview_laborer_rate_cascade: {
        Args: { p_laborer_id: string; p_new_rate: number }
        Returns: Json
      }
      process_batch_settlement: {
        Args: {
          p_batch_ref_code: string
          p_created_by?: string
          p_debtor_site_id: string
          p_payment_date: string
          p_payment_mode: string
          p_payment_reference?: string
          p_settlement_amount?: number
        }
        Returns: {
          debtor_expense_id: string
          settlement_code: string
          settlement_id: string
        }[]
      }
      process_local_purchase_stock: {
        Args: { p_purchase_id: string }
        Returns: boolean
      }
      rebuild_tea_shop_waterfall:
        | { Args: { p_tea_shop_id: string }; Returns: undefined }
        | {
            Args: { p_site_id?: string; p_tea_shop_id: string }
            Returns: undefined
          }
      recalculate_tea_shop_allocations_for_date: {
        Args: { p_date: string; p_site_id: string }
        Returns: undefined
      }
      record_batch_usage: {
        Args: {
          p_batch_ref_code: string
          p_created_by?: string
          p_quantity: number
          p_usage_date: string
          p_usage_site_id: string
          p_work_description?: string
        }
        Returns: string
      }
      record_price_entry: {
        Args: {
          p_brand_id: string
          p_gst_rate: number
          p_loading_cost: number
          p_material_id: string
          p_notes?: string
          p_price: number
          p_price_includes_gst: boolean
          p_quantity: number
          p_source: string
          p_source_reference: string
          p_transport_cost: number
          p_unit: string
          p_unloading_cost: number
          p_user_id: string
          p_vendor_id: string
        }
        Returns: string
      }
      record_price_with_reason: {
        Args: {
          p_bill_date?: string
          p_bill_number?: string
          p_bill_url?: string
          p_brand_id: string
          p_change_reason_id?: string
          p_change_reason_text?: string
          p_material_id: string
          p_notes?: string
          p_price: number
          p_recorded_date: string
          p_source?: string
          p_vendor_id: string
        }
        Returns: string
      }
      record_settlement_payment: {
        Args: {
          p_amount: number
          p_notes?: string
          p_payment_mode: string
          p_recorded_by?: string
          p_reference_number?: string
          p_settlement_id: string
        }
        Returns: string
      }
      reject_deletion: {
        Args: {
          p_request_id: string
          p_review_notes?: string
          p_reviewed_by: string
        }
        Returns: boolean
      }
      reopen_batch: { Args: { p_batch_ref_code: string }; Returns: undefined }
      request_deletion: {
        Args: {
          p_reason?: string
          p_record_id: string
          p_requested_by: string
          p_table_name: string
        }
        Returns: string
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      unlock_batch_for_sharing: {
        Args: { p_inventory_id: string }
        Returns: boolean
      }
      update_group_stock_on_purchase:
        | {
            Args: {
              p_brand_id: string
              p_group_id: string
              p_material_id: string
              p_payment_site_id: string
              p_payment_source: string
              p_quantity: number
              p_reference_id: string
              p_reference_type: string
              p_unit_cost: number
              p_user_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_brand_id: string
              p_dedicated_site_id?: string
              p_is_dedicated?: boolean
              p_location_id: string
              p_material_id: string
              p_notes?: string
              p_payment_source: string
              p_payment_source_site_id: string
              p_quantity: number
              p_reference_id: string
              p_reference_type: string
              p_site_group_id: string
              p_unit_cost: number
            }
            Returns: string
          }
      update_group_stock_on_usage:
        | {
            Args: {
              p_brand_id: string
              p_group_id: string
              p_material_id: string
              p_quantity: number
              p_reference_id: string
              p_reference_type: string
              p_usage_site_id: string
              p_user_id: string
              p_work_description: string
            }
            Returns: string
          }
        | {
            Args: {
              p_inventory_id: string
              p_notes?: string
              p_quantity: number
              p_site_group_id: string
              p_usage_site_id: string
              p_work_description?: string
            }
            Returns: string
          }
      update_laborer_rate_cascade: {
        Args: { p_laborer_id: string; p_new_rate: number }
        Returns: Json
      }
      verify_delivery: {
        Args: {
          p_delivery_id: string
          p_discrepancies?: Json
          p_user_id: string
          p_verification_notes: string
          p_verification_photos: string[]
          p_verification_status?: string
        }
        Returns: boolean
      }
    }
    Enums: {
      additional_work_status: "quoted" | "confirmed" | "paid" | "cancelled"
      audit_action: "create" | "update" | "delete" | "soft_delete" | "restore"
      contract_payment_type:
        | "weekly_advance"
        | "milestone"
        | "part_payment"
        | "final_settlement"
      contract_status:
        | "draft"
        | "active"
        | "on_hold"
        | "completed"
        | "cancelled"
      contract_type: "mesthri" | "specialist"
      deduction_status: "pending" | "partial" | "deducted" | "written_off"
      deletion_request_status: "pending" | "approved" | "rejected"
      delivery_status:
        | "pending"
        | "in_transit"
        | "partial"
        | "delivered"
        | "rejected"
      delivery_verification_status:
        | "pending"
        | "verified"
        | "disputed"
        | "rejected"
      employment_type: "daily_wage" | "contract" | "specialist"
      equipment_condition:
        | "excellent"
        | "good"
        | "fair"
        | "needs_repair"
        | "damaged"
      equipment_location_type: "warehouse" | "site"
      equipment_purchase_source: "online" | "store" | "other"
      equipment_status:
        | "available"
        | "deployed"
        | "under_repair"
        | "lost"
        | "disposed"
      equipment_transfer_status:
        | "pending"
        | "in_transit"
        | "received"
        | "rejected"
        | "cancelled"
      expense_module:
        | "labor"
        | "material"
        | "machinery"
        | "general"
        | "miscellaneous"
      inter_site_settlement_status:
        | "draft"
        | "pending"
        | "approved"
        | "settled"
        | "cancelled"
      laborer_status: "active" | "inactive"
      maintenance_type: "routine" | "repair" | "overhaul"
      material_request_status:
        | "draft"
        | "pending"
        | "approved"
        | "rejected"
        | "ordered"
        | "partial_fulfilled"
        | "fulfilled"
        | "cancelled"
      material_unit:
        | "kg"
        | "g"
        | "ton"
        | "liter"
        | "ml"
        | "piece"
        | "bag"
        | "bundle"
        | "sqft"
        | "sqm"
        | "cft"
        | "cum"
        | "nos"
        | "rmt"
        | "box"
        | "set"
      measurement_unit: "sqft" | "rft" | "nos" | "lumpsum" | "per_point"
      milestone_status: "pending" | "in_progress" | "completed" | "paid"
      payment_mode: "cash" | "upi" | "bank_transfer" | "cheque" | "other"
      po_status:
        | "draft"
        | "pending_approval"
        | "approved"
        | "ordered"
        | "partial_delivered"
        | "delivered"
        | "cancelled"
      rental_item_status:
        | "pending"
        | "active"
        | "partially_returned"
        | "returned"
        | "damaged"
      rental_order_status:
        | "draft"
        | "confirmed"
        | "active"
        | "partially_returned"
        | "completed"
        | "cancelled"
      rental_price_source: "rental" | "quotation" | "manual"
      rental_rate_type: "hourly" | "daily"
      rental_source_type: "store" | "contractor"
      rental_type: "equipment" | "scaffolding" | "shuttering" | "other"
      return_condition: "good" | "damaged" | "lost"
      salary_status: "draft" | "calculated" | "partial" | "paid"
      section_status: "not_started" | "in_progress" | "completed"
      sim_operator: "airtel" | "jio" | "vi" | "bsnl" | "other"
      site_status: "planning" | "active" | "on_hold" | "completed"
      site_type: "single_client" | "multi_client" | "personal"
      stock_transaction_type:
        | "purchase"
        | "usage"
        | "transfer_in"
        | "transfer_out"
        | "adjustment"
        | "return"
        | "wastage"
        | "initial"
      team_status: "active" | "inactive" | "completed"
      transaction_type: "advance" | "extra"
      transport_handler: "vendor" | "company" | "laborer"
      user_role: "admin" | "office" | "site_engineer"
      user_status: "active" | "inactive" | "suspended"
      vendor_type:
        | "shop"
        | "dealer"
        | "manufacturer"
        | "individual"
        | "rental_store"
      work_days_value: "0.5" | "1" | "1.5" | "2" | "2.5"
      work_variance: "overtime" | "standard" | "undertime"
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
      additional_work_status: ["quoted", "confirmed", "paid", "cancelled"],
      audit_action: ["create", "update", "delete", "soft_delete", "restore"],
      contract_payment_type: [
        "weekly_advance",
        "milestone",
        "part_payment",
        "final_settlement",
      ],
      contract_status: ["draft", "active", "on_hold", "completed", "cancelled"],
      contract_type: ["mesthri", "specialist"],
      deduction_status: ["pending", "partial", "deducted", "written_off"],
      deletion_request_status: ["pending", "approved", "rejected"],
      delivery_status: [
        "pending",
        "in_transit",
        "partial",
        "delivered",
        "rejected",
      ],
      delivery_verification_status: [
        "pending",
        "verified",
        "disputed",
        "rejected",
      ],
      employment_type: ["daily_wage", "contract", "specialist"],
      equipment_condition: [
        "excellent",
        "good",
        "fair",
        "needs_repair",
        "damaged",
      ],
      equipment_location_type: ["warehouse", "site"],
      equipment_purchase_source: ["online", "store", "other"],
      equipment_status: [
        "available",
        "deployed",
        "under_repair",
        "lost",
        "disposed",
      ],
      equipment_transfer_status: [
        "pending",
        "in_transit",
        "received",
        "rejected",
        "cancelled",
      ],
      expense_module: [
        "labor",
        "material",
        "machinery",
        "general",
        "miscellaneous",
      ],
      inter_site_settlement_status: [
        "draft",
        "pending",
        "approved",
        "settled",
        "cancelled",
      ],
      laborer_status: ["active", "inactive"],
      maintenance_type: ["routine", "repair", "overhaul"],
      material_request_status: [
        "draft",
        "pending",
        "approved",
        "rejected",
        "ordered",
        "partial_fulfilled",
        "fulfilled",
        "cancelled",
      ],
      material_unit: [
        "kg",
        "g",
        "ton",
        "liter",
        "ml",
        "piece",
        "bag",
        "bundle",
        "sqft",
        "sqm",
        "cft",
        "cum",
        "nos",
        "rmt",
        "box",
        "set",
      ],
      measurement_unit: ["sqft", "rft", "nos", "lumpsum", "per_point"],
      milestone_status: ["pending", "in_progress", "completed", "paid"],
      payment_mode: ["cash", "upi", "bank_transfer", "cheque", "other"],
      po_status: [
        "draft",
        "pending_approval",
        "approved",
        "ordered",
        "partial_delivered",
        "delivered",
        "cancelled",
      ],
      rental_item_status: [
        "pending",
        "active",
        "partially_returned",
        "returned",
        "damaged",
      ],
      rental_order_status: [
        "draft",
        "confirmed",
        "active",
        "partially_returned",
        "completed",
        "cancelled",
      ],
      rental_price_source: ["rental", "quotation", "manual"],
      rental_rate_type: ["hourly", "daily"],
      rental_source_type: ["store", "contractor"],
      rental_type: ["equipment", "scaffolding", "shuttering", "other"],
      return_condition: ["good", "damaged", "lost"],
      salary_status: ["draft", "calculated", "partial", "paid"],
      section_status: ["not_started", "in_progress", "completed"],
      sim_operator: ["airtel", "jio", "vi", "bsnl", "other"],
      site_status: ["planning", "active", "on_hold", "completed"],
      site_type: ["single_client", "multi_client", "personal"],
      stock_transaction_type: [
        "purchase",
        "usage",
        "transfer_in",
        "transfer_out",
        "adjustment",
        "return",
        "wastage",
        "initial",
      ],
      team_status: ["active", "inactive", "completed"],
      transaction_type: ["advance", "extra"],
      transport_handler: ["vendor", "company", "laborer"],
      user_role: ["admin", "office", "site_engineer"],
      user_status: ["active", "inactive", "suspended"],
      vendor_type: [
        "shop",
        "dealer",
        "manufacturer",
        "individual",
        "rental_store",
      ],
      work_days_value: ["0.5", "1", "1.5", "2", "2.5"],
      work_variance: ["overtime", "standard", "undertime"],
    },
  },
} as const
