// src/types/supabase.ts
// AUTO-GENERATED from live Supabase schema. Do not edit by hand.
//
// Regenerate after every migration with the MCP tool `generate_typescript_types`
// or via the Supabase CLI: `supabase gen types typescript --project-id mvvadmlivrpyawmlaqye > src/types/supabase.ts`
//
// Last regenerated: 2026-05-12 (after migrations 004-008 applied to live).

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bookkeepers: {
        Row: {
          account_type: string
          business_name: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          notify_on_any_upload: boolean
          notify_on_complete: boolean
          notify_on_late: boolean
          plan: string
          practice_name: string
          reminder_tone: string
          reply_to_email: string
          self_client_id: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
        }
        Insert: {
          account_type?: string
          business_name?: string | null
          created_at?: string
          email: string
          full_name?: string
          id: string
          notify_on_any_upload?: boolean
          notify_on_complete?: boolean
          notify_on_late?: boolean
          plan?: string
          practice_name?: string
          reminder_tone?: string
          reply_to_email?: string
          self_client_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
        }
        Update: Partial<Database['public']['Tables']['bookkeepers']['Insert']>
        Relationships: []
      }
      categorization_corrections: {
        Row: {
          applied_at: string
          bookkeeper_id: string
          client_id: string
          corrected_category: string
          corrected_subcategory: string | null
          description_raw: string | null
          id: string
          original_category: string | null
          original_confidence: string | null
          original_subcategory: string | null
          reason: string | null
          status: string
          transaction_amount_cents: number | null
          transaction_date: string | null
          upload_id: string | null
          vendor_normalized: string | null
        }
        Insert: Omit<Database['public']['Tables']['categorization_corrections']['Row'], 'id' | 'applied_at'> & {
          id?: string
          applied_at?: string
        }
        Update: Partial<Database['public']['Tables']['categorization_corrections']['Insert']>
        Relationships: []
      }
      clients: {
        Row: {
          bookkeeper_id: string
          business_name: string
          contact_email: string
          contact_name: string | null
          created_at: string
          id: string
          is_active: boolean
          notes_for_client: string | null
          notes_private: string | null
          portal_token: string
        }
        Insert: Omit<Database['public']['Tables']['clients']['Row'], 'id' | 'created_at' | 'is_active'> & {
          id?: string
          created_at?: string
          is_active?: boolean
        }
        Update: Partial<Database['public']['Tables']['clients']['Insert']>
        Relationships: []
      }
      close_cycle_outcomes: {
        Row: {
          accuracy_pct: number | null
          bookkeeper_id: string
          client_id: string
          hours_saved_minutes: number | null
          id: string
          notes: string | null
          period_month: number
          period_year: number
          reconciliation_match_pct: number | null
          signed_off_at: string
          total_anomalies_flagged: number | null
          total_anomalies_real: number | null
          total_categorized: number | null
          total_corrected: number | null
          worth_it: boolean | null
        }
        Insert: Omit<Database['public']['Tables']['close_cycle_outcomes']['Row'], 'id' | 'signed_off_at'> & {
          id?: string
          signed_off_at?: string
        }
        Update: Partial<Database['public']['Tables']['close_cycle_outcomes']['Insert']>
        Relationships: []
      }
      document_requirements: {
        Row: {
          client_id: string
          doc_type: string
          id: string
          label: string
          required: boolean
          sort_order: number
        }
        Insert: Omit<Database['public']['Tables']['document_requirements']['Row'], 'id' | 'required' | 'sort_order' | 'doc_type'> & {
          id?: string
          required?: boolean
          sort_order?: number
          doc_type?: string
        }
        Update: Partial<Database['public']['Tables']['document_requirements']['Insert']>
        Relationships: []
      }
      document_uploads: {
        Row: {
          auto_categorization_confidence: string | null
          auto_categorized_at: string | null
          bookkeeper_id: string
          categorization_summary: Json | null
          client_confirmed_at: string | null
          client_id: string
          file_size_bytes: number
          filename_original: string
          id: string
          parsed_summary: Json | null
          period_month: number
          period_year: number
          requirement_id: string
          storage_path: string
          uploaded_at: string
        }
        Insert: Omit<Database['public']['Tables']['document_uploads']['Row'], 'id' | 'uploaded_at' | 'file_size_bytes'> & {
          id?: string
          uploaded_at?: string
          file_size_bytes?: number
        }
        Update: Partial<Database['public']['Tables']['document_uploads']['Insert']>
        Relationships: []
      }
      engagement_letter_signatories: {
        Row: {
          bookkeeper_id: string
          created_at: string
          engagement_letter_id: string
          id: string
          invite_email_id: string | null
          invite_sent_at: string | null
          placement: Json
          previous_attempt_id: string | null
          required_pages: Json
          signature_id: string | null
          signed_at: string | null
          signer_email: string
          signer_name: string
          signer_portal_token: string
          signer_role: string
          status: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['engagement_letter_signatories']['Row'], 'id' | 'created_at' | 'updated_at' | 'placement' | 'required_pages' | 'status'> & {
          id?: string
          created_at?: string
          updated_at?: string
          placement?: Json
          required_pages?: Json
          status?: string
        }
        Update: Partial<Database['public']['Tables']['engagement_letter_signatories']['Insert']>
        Relationships: []
      }
      engagement_letters: {
        Row: {
          bookkeeper_id: string
          client_id: string
          created_at: string
          file_size_bytes: number
          filename: string
          fully_signed_at: string | null
          id: string
          is_active: boolean
          label: string
          storage_path: string
          total_signatories_required: number | null
        }
        Insert: Omit<Database['public']['Tables']['engagement_letters']['Row'], 'id' | 'created_at' | 'is_active' | 'file_size_bytes'> & {
          id?: string
          created_at?: string
          is_active?: boolean
          file_size_bytes?: number
        }
        Update: Partial<Database['public']['Tables']['engagement_letters']['Insert']>
        Relationships: []
      }
      reminder_log: {
        Row: {
          bookkeeper_id: string
          client_id: string
          id: string
          period_month: number
          period_year: number
          reminder_number: number
          resend_email_id: string | null
          sent_at: string
          triggered_by: string
        }
        Insert: Omit<Database['public']['Tables']['reminder_log']['Row'], 'id' | 'sent_at' | 'triggered_by'> & {
          id?: string
          sent_at?: string
          triggered_by?: string
        }
        Update: Partial<Database['public']['Tables']['reminder_log']['Insert']>
        Relationships: []
      }
      reminder_schedules: {
        Row: {
          client_id: string
          day_of_month: number
          id: string
          is_active: boolean
          reminder_number: number
        }
        Insert: Omit<Database['public']['Tables']['reminder_schedules']['Row'], 'id' | 'is_active'> & {
          id?: string
          is_active?: boolean
        }
        Update: Partial<Database['public']['Tables']['reminder_schedules']['Insert']>
        Relationships: []
      }
      signature_attempts: {
        Row: {
          attempted_at: string
          id: string
          ip_address: string | null
          outcome: string
          portal_token: string
          user_agent: string | null
        }
        Insert: Omit<Database['public']['Tables']['signature_attempts']['Row'], 'id' | 'attempted_at'> & {
          id?: string
          attempted_at?: string
        }
        Update: Partial<Database['public']['Tables']['signature_attempts']['Insert']>
        Relationships: []
      }
      signature_email_log: {
        Row: {
          bookkeeper_id: string
          created_at: string
          error_message: string | null
          id: string
          recipient_email: string
          recipient_role: string
          resend_email_id: string | null
          sent_at: string | null
          signature_id: string
          status: string
        }
        Insert: Omit<Database['public']['Tables']['signature_email_log']['Row'], 'id' | 'created_at' | 'status'> & {
          id?: string
          created_at?: string
          status?: string
        }
        Update: Partial<Database['public']['Tables']['signature_email_log']['Insert']>
        Relationships: []
      }
      signatures: {
        Row: {
          attempt_id: string | null
          bookkeeper_id: string
          client_id: string
          consent_disclosure_agreed_at: string | null
          consent_disclosure_version: string | null
          engagement_letter_id: string
          filled_form_fields: Json | null
          id: string
          initials_image_data: string | null
          ip_address: string | null
          portal_token_used: string
          signatory_id: string | null
          signature_image_data: string
          signed_at: string
          signed_pdf_path: string | null
          signer_email: string
          signer_name: string
          user_agent: string | null
        }
        Insert: Omit<Database['public']['Tables']['signatures']['Row'], 'id' | 'signed_at'> & {
          id?: string
          signed_at?: string
        }
        Update: Partial<Database['public']['Tables']['signatures']['Insert']>
        Relationships: []
      }
    }
    Views: {
      signature_audit_view: {
        Row: {
          attempt_id: string | null
          bookkeeper_id: string | null
          client_id: string | null
          confirmation_emails_sent: number | null
          consent_disclosure_agreed_at: string | null
          consent_disclosure_version: string | null
          document_label: string | null
          engagement_letter_id: string | null
          filled_form_fields: Json | null
          has_initials: boolean | null
          invite_sent_at: string | null
          ip_address: string | null
          letter_fully_signed_at: string | null
          signatory_placement: Json | null
          signatory_required_pages: Json | null
          signatory_token: string | null
          signature_id: string | null
          signed_at: string | null
          signed_pdf_path: string | null
          signer_email: string | null
          signer_name: string | null
          signer_role: string | null
          user_agent: string | null
        }
        Relationships: []
      }
      vendor_correction_stats: {
        Row: {
          bookkeeper_id: string | null
          corrected_category: string | null
          correction_count: number | null
          last_corrected_at: string | null
          vendor_normalized: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      cleanup_old_signature_attempts: {
        Args: { retention_days?: number }
        Returns: number
      }
      count_letter_signatures: {
        Args: { letter_id: string }
        Returns: { total_required: number; total_signed: number }[]
      }
      refresh_vendor_correction_stats: { Args: never; Returns: undefined }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
