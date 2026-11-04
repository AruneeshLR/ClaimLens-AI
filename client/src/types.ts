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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      admin_decisions: {
        Row: {
          admin_id: string
          ai_overridden: boolean
          approved_amount: number | null
          claim_id: string
          created_at: string
          decision: string
          id: string
          reason: string | null
          remarks: string | null
          requested_items: string | null
        }
        Insert: {
          admin_id: string
          ai_overridden?: boolean
          approved_amount?: number | null
          claim_id: string
          created_at?: string
          decision: string
          id?: string
          reason?: string | null
          remarks?: string | null
          requested_items?: string | null
        }
        Update: {
          admin_id?: string
          ai_overridden?: boolean
          approved_amount?: number | null
          claim_id?: string
          created_at?: string
          decision?: string
          id?: string
          reason?: string | null
          remarks?: string | null
          requested_items?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_decisions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notes: {
        Row: {
          admin_id: string
          claim_id: string
          created_at: string
          id: string
          note: string
        }
        Insert: {
          admin_id?: string
          claim_id: string
          created_at?: string
          id?: string
          note: string
        }
        Update: {
          admin_id?: string
          claim_id?: string
          created_at?: string
          id?: string
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_notes_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_reports: {
        Row: {
          claim_id: string
          created_at: string
          id: string
          model: string
          report: Json
          system_checks: Json
          triggered_by: string | null
        }
        Insert: {
          claim_id: string
          created_at?: string
          id?: string
          model: string
          report: Json
          system_checks?: Json
          triggered_by?: string | null
        }
        Update: {
          claim_id?: string
          created_at?: string
          id?: string
          model?: string
          report?: Json
          system_checks?: Json
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_reports_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          claim_id: string | null
          created_at: string
          details: Json
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          claim_id?: string | null
          created_at?: string
          details?: Json
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          claim_id?: string | null
          created_at?: string
          details?: Json
          id?: string
        }
        Relationships: []
      }
      claims: {
        Row: {
          accident_at: string
          accident_description: string
          accident_location: string
          accident_type: string
          ai_error: string | null
          ai_status: string
          approved_amount: number | null
          claim_number: string
          claimant_name: string
          claimed_amount: number | null
          created_at: string
          damage_description: string
          decided_at: string | null
          decision_remarks: string | null
          evidence_request: string | null
          id: string
          insurance_claim_number: string | null
          owner_check_report: Json | null
          owner_check_status: string
          policy_number: string
          status: Database["public"]["Enums"]["claim_status"]
          submitted_at: string | null
          updated_at: string
          user_id: string
          vehicle_registration: string
        }
        Insert: {
          accident_at: string
          accident_description: string
          accident_location: string
          accident_type: string
          ai_error?: string | null
          ai_status?: string
          approved_amount?: number | null
          claim_number?: string
          claimant_name: string
          claimed_amount?: number | null
          created_at?: string
          damage_description: string
          decided_at?: string | null
          decision_remarks?: string | null
          evidence_request?: string | null
          id?: string
          insurance_claim_number?: string | null
          owner_check_report?: Json | null
          owner_check_status?: string
          policy_number: string
          status?: Database["public"]["Enums"]["claim_status"]
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
          vehicle_registration: string
        }
        Update: {
          accident_at?: string
          accident_description?: string
          accident_location?: string
          accident_type?: string
          ai_error?: string | null
          ai_status?: string
          approved_amount?: number | null
          claim_number?: string
          claimant_name?: string
          claimed_amount?: number | null
          created_at?: string
          damage_description?: string
          decided_at?: string | null
          decision_remarks?: string | null
          evidence_request?: string | null
          id?: string
          insurance_claim_number?: string | null
          owner_check_report?: Json | null
          owner_check_status?: string
          policy_number?: string
          status?: Database["public"]["Enums"]["claim_status"]
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
          vehicle_registration?: string
        }
        Relationships: []
      }
      evidence: {
        Row: {
          additional_explanation: string | null
          angle: string | null
          captured_live: boolean
          claim_id: string
          consistency_report: Json | null
          consistency_status: string
          created_at: string
          damage_description: string | null
          damaged_part: string | null
          file_name: string | null
          id: string
          incident_date: string | null
          incident_location: string | null
          is_additional: boolean
          kind: string
          mime_type: string
          quality_report: Json | null
          quality_status: string
          sha256: string | null
          size_bytes: number
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          additional_explanation?: string | null
          angle?: string | null
          captured_live?: boolean
          claim_id: string
          consistency_report?: Json | null
          consistency_status?: string
          created_at?: string
          damage_description?: string | null
          damaged_part?: string | null
          file_name?: string | null
          id?: string
          incident_date?: string | null
          incident_location?: string | null
          is_additional?: boolean
          kind: string
          mime_type: string
          quality_report?: Json | null
          quality_status?: string
          sha256?: string | null
          size_bytes: number
          storage_path: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          additional_explanation?: string | null
          angle?: string | null
          captured_live?: boolean
          claim_id?: string
          consistency_report?: Json | null
          consistency_status?: string
          created_at?: string
          damage_description?: string | null
          damaged_part?: string | null
          file_name?: string | null
          id?: string
          incident_date?: string | null
          incident_location?: string | null
          is_additional?: boolean
          kind?: string
          mime_type?: string
          quality_report?: Json | null
          quality_status?: string
          sha256?: string | null
          size_bytes?: number
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          claim_id: string | null
          created_at: string
          id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          claim_id?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          claim_id?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string
          full_name?: string
          id: string
          phone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_decide: {
        Args: {
          _ai_overridden: boolean
          _amount: number
          _claim_id: string
          _decision: string
          _reason: string
          _remarks: string
          _requested_items: string
        }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      owns_editable_claim: { Args: { _claim_id: string }; Returns: boolean }
      submit_claim: { Args: { _claim_id: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "user"
      claim_status:
        | "draft"
        | "submitted"
        | "under_ai_analysis"
        | "under_human_review"
        | "evidence_required"
        | "approved"
        | "rejected"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "user"],
      claim_status: [
        "draft",
        "submitted",
        "under_ai_analysis",
        "under_human_review",
        "evidence_required",
        "approved",
        "rejected",
      ],
    },
  },
} as const
