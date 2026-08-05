export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          key: string
          name: string
          rule: Json
          tenant_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          key: string
          name: string
          rule: Json
          tenant_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          name?: string
          rule?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "achievements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip: unknown
          metadata: Json
          summary: string | null
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip?: unknown
          metadata?: Json
          summary?: string | null
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip?: unknown
          metadata?: Json
          summary?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bracket_rounds: {
        Row: {
          competition_id: string
          created_at: string
          id: string
          name: string
          round_number: number
          size: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          competition_id: string
          created_at?: string
          id?: string
          name: string
          round_number: number
          size: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          competition_id?: string
          created_at?: string
          id?: string
          name?: string
          round_number?: number
          size?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bracket_rounds_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bracket_rounds_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bracket_slots: {
        Row: {
          bye_competitor_id: string | null
          competition_id: string
          competitor_a_id: string | null
          competitor_b_id: string | null
          created_at: string
          event_id: string | null
          id: string
          is_bye: boolean
          match_index: number
          position: number
          round_id: string
          source_a_id: string | null
          source_b_id: string | null
          status: string
          tenant_id: string
          updated_at: string
          winner_competitor_id: string | null
        }
        Insert: {
          bye_competitor_id?: string | null
          competition_id: string
          competitor_a_id?: string | null
          competitor_b_id?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          is_bye?: boolean
          match_index: number
          position: number
          round_id: string
          source_a_id?: string | null
          source_b_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          winner_competitor_id?: string | null
        }
        Update: {
          bye_competitor_id?: string | null
          competition_id?: string
          competitor_a_id?: string | null
          competitor_b_id?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          is_bye?: boolean
          match_index?: number
          position?: number
          round_id?: string
          source_a_id?: string | null
          source_b_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          winner_competitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bracket_slots_bye_competitor_id_fkey"
            columns: ["bye_competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bracket_slots_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bracket_slots_competitor_a_id_fkey"
            columns: ["competitor_a_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bracket_slots_competitor_b_id_fkey"
            columns: ["competitor_b_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bracket_slots_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bracket_slots_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "bracket_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bracket_slots_source_a_id_fkey"
            columns: ["source_a_id"]
            isOneToOne: false
            referencedRelation: "bracket_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bracket_slots_source_b_id_fkey"
            columns: ["source_b_id"]
            isOneToOne: false
            referencedRelation: "bracket_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bracket_slots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bracket_slots_winner_competitor_id_fkey"
            columns: ["winner_competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_draft_settings: {
        Row: {
          access_type: Database["public"]["Enums"]["draft_access_type"]
          allow_changes_before_close: boolean
          closes_at: string | null
          competition_id: string
          created_at: string
          created_by: string
          currency_code: string | null
          draft_fee_minor_units: number | null
          id: string
          is_enabled: boolean
          max_assignments_per_user: number
          mode: Database["public"]["Enums"]["draft_mode"]
          opens_at: string | null
          status: Database["public"]["Enums"]["draft_status"]
          tenant_id: string
          updated_at: string
          visibility: Database["public"]["Enums"]["draft_visibility"]
        }
        Insert: {
          access_type?: Database["public"]["Enums"]["draft_access_type"]
          allow_changes_before_close?: boolean
          closes_at?: string | null
          competition_id: string
          created_at?: string
          created_by: string
          currency_code?: string | null
          draft_fee_minor_units?: number | null
          id?: string
          is_enabled?: boolean
          max_assignments_per_user?: number
          mode?: Database["public"]["Enums"]["draft_mode"]
          opens_at?: string | null
          status?: Database["public"]["Enums"]["draft_status"]
          tenant_id: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["draft_visibility"]
        }
        Update: {
          access_type?: Database["public"]["Enums"]["draft_access_type"]
          allow_changes_before_close?: boolean
          closes_at?: string | null
          competition_id?: string
          created_at?: string
          created_by?: string
          currency_code?: string | null
          draft_fee_minor_units?: number | null
          id?: string
          is_enabled?: boolean
          max_assignments_per_user?: number
          mode?: Database["public"]["Enums"]["draft_mode"]
          opens_at?: string | null
          status?: Database["public"]["Enums"]["draft_status"]
          tenant_id?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["draft_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "competition_draft_settings_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: true
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_draft_settings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_draft_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_prizes: {
        Row: {
          age_restrictions: Json
          category: Database["public"]["Enums"]["prize_category"]
          competition_id: string
          created_at: string
          description: string | null
          draft_settings_id: string | null
          eligibility_rule: Json
          fulfillment_notes: string | null
          fulfillment_owner_id: string | null
          fulfillment_owner_type: Database["public"]["Enums"]["fulfillment_owner_type"]
          fulfillment_status: Database["public"]["Enums"]["fulfillment_status"]
          geographic_restrictions: Json
          id: string
          image_url: string | null
          placement_from: number | null
          placement_to: number | null
          requires_shipping: boolean
          sponsor_id: string | null
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          age_restrictions?: Json
          category: Database["public"]["Enums"]["prize_category"]
          competition_id: string
          created_at?: string
          description?: string | null
          draft_settings_id?: string | null
          eligibility_rule?: Json
          fulfillment_notes?: string | null
          fulfillment_owner_id?: string | null
          fulfillment_owner_type?: Database["public"]["Enums"]["fulfillment_owner_type"]
          fulfillment_status?: Database["public"]["Enums"]["fulfillment_status"]
          geographic_restrictions?: Json
          id?: string
          image_url?: string | null
          placement_from?: number | null
          placement_to?: number | null
          requires_shipping?: boolean
          sponsor_id?: string | null
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          age_restrictions?: Json
          category?: Database["public"]["Enums"]["prize_category"]
          competition_id?: string
          created_at?: string
          description?: string | null
          draft_settings_id?: string | null
          eligibility_rule?: Json
          fulfillment_notes?: string | null
          fulfillment_owner_id?: string | null
          fulfillment_owner_type?: Database["public"]["Enums"]["fulfillment_owner_type"]
          fulfillment_status?: Database["public"]["Enums"]["fulfillment_status"]
          geographic_restrictions?: Json
          id?: string
          image_url?: string | null
          placement_from?: number | null
          placement_to?: number | null
          requires_shipping?: boolean
          sponsor_id?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "competition_prizes_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_prizes_draft_settings_id_fkey"
            columns: ["draft_settings_id"]
            isOneToOne: false
            referencedRelation: "competition_draft_settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_prizes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_stages: {
        Row: {
          competition_id: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["stage_kind"]
          metadata: Json
          name: string
          sequence: number
          status: Database["public"]["Enums"]["competition_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          competition_id: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["stage_kind"]
          metadata?: Json
          name: string
          sequence?: number
          status?: Database["public"]["Enums"]["competition_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          competition_id?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["stage_kind"]
          metadata?: Json
          name?: string
          sequence?: number
          status?: Database["public"]["Enums"]["competition_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "competition_stages_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_stages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_statistics: {
        Row: {
          competition_id: string
          correct_predictions: number
          first_graded_at: string | null
          incorrect_predictions: number
          tenant_id: string
          total_points: number
          updated_at: string
          user_id: string
        }
        Insert: {
          competition_id: string
          correct_predictions?: number
          first_graded_at?: string | null
          incorrect_predictions?: number
          tenant_id: string
          total_points?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          competition_id?: string
          correct_predictions?: number
          first_graded_at?: string | null
          incorrect_predictions?: number
          tenant_id?: string
          total_points?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competition_statistics_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_statistics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_statistics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      competitions: {
        Row: {
          cover_image_url: string | null
          created_at: string
          creator_id: string
          description: string | null
          ends_at: string | null
          id: string
          metadata: Json
          scoring_rule_id: string | null
          slug: string
          starts_at: string | null
          status: Database["public"]["Enums"]["competition_status"]
          tenant_id: string
          title: string
          type: Database["public"]["Enums"]["competition_type"]
          updated_at: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          creator_id: string
          description?: string | null
          ends_at?: string | null
          id?: string
          metadata?: Json
          scoring_rule_id?: string | null
          slug: string
          starts_at?: string | null
          status?: Database["public"]["Enums"]["competition_status"]
          tenant_id: string
          title: string
          type: Database["public"]["Enums"]["competition_type"]
          updated_at?: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          creator_id?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          metadata?: Json
          scoring_rule_id?: string | null
          slug?: string
          starts_at?: string | null
          status?: Database["public"]["Enums"]["competition_status"]
          tenant_id?: string
          title?: string
          type?: Database["public"]["Enums"]["competition_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitions_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitions_scoring_rule_id_fkey"
            columns: ["scoring_rule_id"]
            isOneToOne: false
            referencedRelation: "scoring_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_competition_stats: {
        Row: {
          best_position: number | null
          competition_id: string
          competitor_id: string
          events_completed: number
          podiums: number
          tenant_id: string
          top_finishes: number
          total_points: number
          updated_at: string
          wins: number
        }
        Insert: {
          best_position?: number | null
          competition_id: string
          competitor_id: string
          events_completed?: number
          podiums?: number
          tenant_id: string
          top_finishes?: number
          total_points?: number
          updated_at?: string
          wins?: number
        }
        Update: {
          best_position?: number | null
          competition_id?: string
          competitor_id?: string
          events_completed?: number
          podiums?: number
          tenant_id?: string
          top_finishes?: number
          total_points?: number
          updated_at?: string
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "competitor_competition_stats_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_competition_stats_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_competition_stats_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_draft_assignments: {
        Row: {
          activated_at: string | null
          assignment_source: Database["public"]["Enums"]["draft_assignment_source"]
          canceled_at: string | null
          cancellation_reason: string | null
          competition_id: string
          competitor_id: string
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          exclusive_slot: boolean
          id: string
          idempotency_key: string
          metadata: Json
          payment_reference_id: string | null
          payment_status: Database["public"]["Enums"]["draft_payment_status"]
          reservation_expires_at: string | null
          reserved_at: string | null
          status: Database["public"]["Enums"]["draft_assignment_status"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          activated_at?: string | null
          assignment_source?: Database["public"]["Enums"]["draft_assignment_source"]
          canceled_at?: string | null
          cancellation_reason?: string | null
          competition_id: string
          competitor_id: string
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          exclusive_slot?: boolean
          id?: string
          idempotency_key: string
          metadata?: Json
          payment_reference_id?: string | null
          payment_status?: Database["public"]["Enums"]["draft_payment_status"]
          reservation_expires_at?: string | null
          reserved_at?: string | null
          status: Database["public"]["Enums"]["draft_assignment_status"]
          tenant_id: string
          user_id: string
        }
        Update: {
          activated_at?: string | null
          assignment_source?: Database["public"]["Enums"]["draft_assignment_source"]
          canceled_at?: string | null
          cancellation_reason?: string | null
          competition_id?: string
          competitor_id?: string
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          exclusive_slot?: boolean
          id?: string
          idempotency_key?: string
          metadata?: Json
          payment_reference_id?: string | null
          payment_status?: Database["public"]["Enums"]["draft_payment_status"]
          reservation_expires_at?: string | null
          reserved_at?: string | null
          status?: Database["public"]["Enums"]["draft_assignment_status"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitor_draft_assignments_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_draft_assignments_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_draft_assignments_payment_reference_id_fkey"
            columns: ["payment_reference_id"]
            isOneToOne: false
            referencedRelation: "draft_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_draft_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_draft_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      competitors: {
        Row: {
          color: string | null
          created_at: string
          creator_id: string | null
          id: string
          image_url: string | null
          metadata: Json
          name: string
          slug: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          creator_id?: string | null
          id?: string
          image_url?: string | null
          metadata?: Json
          name: string
          slug?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          creator_id?: string | null
          id?: string
          image_url?: string | null
          metadata?: Json
          name?: string
          slug?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitors_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitors_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_channels: {
        Row: {
          created_at: string
          creator_id: string
          id: string
          name: string
          tenant_id: string
          thumbnail_url: string | null
          updated_at: string
          youtube_channel_id: string | null
          youtube_channel_url: string | null
        }
        Insert: {
          created_at?: string
          creator_id: string
          id?: string
          name: string
          tenant_id: string
          thumbnail_url?: string | null
          updated_at?: string
          youtube_channel_id?: string | null
          youtube_channel_url?: string | null
        }
        Update: {
          created_at?: string
          creator_id?: string
          id?: string
          name?: string
          tenant_id?: string
          thumbnail_url?: string | null
          updated_at?: string
          youtube_channel_id?: string | null
          youtube_channel_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_channels_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_channels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      creators: {
        Row: {
          avatar_url: string | null
          banner_url: string | null
          created_at: string
          description: string | null
          display_name: string
          id: string
          owner_user_id: string
          settlement_enabled: boolean
          slug: string
          supporter_subscriptions_enabled: boolean
          tenant_id: string
          updated_at: string
          verification_status: Database["public"]["Enums"]["creator_verification_status"]
        }
        Insert: {
          avatar_url?: string | null
          banner_url?: string | null
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          owner_user_id: string
          settlement_enabled?: boolean
          slug: string
          supporter_subscriptions_enabled?: boolean
          tenant_id: string
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["creator_verification_status"]
        }
        Update: {
          avatar_url?: string | null
          banner_url?: string | null
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          owner_user_id?: string
          settlement_enabled?: boolean
          slug?: string
          supporter_subscriptions_enabled?: boolean
          tenant_id?: string
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["creator_verification_status"]
        }
        Relationships: [
          {
            foreignKeyName: "creators_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creators_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_leaderboard_snapshots: {
        Row: {
          assignment_id: string
          competition_id: string
          competition_points: number
          competitor_id: string
          computed_at: string
          confirmed_at: string | null
          events_completed: number
          id: string
          podiums: number
          rank: number | null
          tenant_id: string
          user_id: string
          wins: number
        }
        Insert: {
          assignment_id: string
          competition_id: string
          competition_points?: number
          competitor_id: string
          computed_at?: string
          confirmed_at?: string | null
          events_completed?: number
          id?: string
          podiums?: number
          rank?: number | null
          tenant_id: string
          user_id: string
          wins?: number
        }
        Update: {
          assignment_id?: string
          competition_id?: string
          competition_points?: number
          competitor_id?: string
          computed_at?: string
          confirmed_at?: string | null
          events_completed?: number
          id?: string
          podiums?: number
          rank?: number | null
          tenant_id?: string
          user_id?: string
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "draft_leaderboard_snapshots_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "competitor_draft_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_leaderboard_snapshots_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_leaderboard_snapshots_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_leaderboard_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_leaderboard_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_payments: {
        Row: {
          amount_minor_units: number
          competition_id: string
          confirmed_at: string | null
          created_at: string
          currency_code: string
          id: string
          provider: string
          provider_reference: string
          status: Database["public"]["Enums"]["draft_payment_status"]
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_minor_units: number
          competition_id: string
          confirmed_at?: string | null
          created_at?: string
          currency_code: string
          id?: string
          provider?: string
          provider_reference: string
          status?: Database["public"]["Enums"]["draft_payment_status"]
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_minor_units?: number
          competition_id?: string
          confirmed_at?: string | null
          created_at?: string
          currency_code?: string
          id?: string
          provider?: string
          provider_reference?: string
          status?: Database["public"]["Enums"]["draft_payment_status"]
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_payments_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_scoring_rules: {
        Row: {
          competition_id: string
          config: Json
          created_at: string
          id: string
          scoring_type: Database["public"]["Enums"]["draft_scoring_type"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          competition_id: string
          config?: Json
          created_at?: string
          id?: string
          scoring_type?: Database["public"]["Enums"]["draft_scoring_type"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          competition_id?: string
          config?: Json
          created_at?: string
          id?: string
          scoring_type?: Database["public"]["Enums"]["draft_scoring_type"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_scoring_rules_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: true
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_scoring_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      event_competitor_results: {
        Row: {
          competitor_id: string
          created_at: string
          event_id: string
          finishing_position: number | null
          grading_version: number
          id: string
          points: number
          tenant_id: string
        }
        Insert: {
          competitor_id: string
          created_at?: string
          event_id: string
          finishing_position?: number | null
          grading_version: number
          id?: string
          points?: number
          tenant_id: string
        }
        Update: {
          competitor_id?: string
          created_at?: string
          event_id?: string
          finishing_position?: number | null
          grading_version?: number
          id?: string
          points?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_competitor_results_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_competitor_results_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_competitor_results_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      event_competitors: {
        Row: {
          competitor_id: string
          created_at: string
          event_id: string
          id: string
          metadata: Json
          seed: number | null
          tenant_id: string
        }
        Insert: {
          competitor_id: string
          created_at?: string
          event_id: string
          id?: string
          metadata?: Json
          seed?: number | null
          tenant_id: string
        }
        Update: {
          competitor_id?: string
          created_at?: string
          event_id?: string
          id?: string
          metadata?: Json
          seed?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_competitors_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_competitors_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_competitors_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      event_results: {
        Row: {
          created_at: string
          event_id: string
          grading_version: number
          id: string
          notes: string | null
          resolution: string
          result_url: string | null
          source: Database["public"]["Enums"]["result_source_type"]
          submitted_by: string | null
          tenant_id: string
          winning_competitor_id: string | null
        }
        Insert: {
          created_at?: string
          event_id: string
          grading_version: number
          id?: string
          notes?: string | null
          resolution: string
          result_url?: string | null
          source?: Database["public"]["Enums"]["result_source_type"]
          submitted_by?: string | null
          tenant_id: string
          winning_competitor_id?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string
          grading_version?: number
          id?: string
          notes?: string | null
          resolution?: string
          result_url?: string | null
          source?: Database["public"]["Enums"]["result_source_type"]
          submitted_by?: string | null
          tenant_id?: string
          winning_competitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_results_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_results_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_results_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_results_winning_competitor_id_fkey"
            columns: ["winning_competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          competition_id: string | null
          cover_image_url: string | null
          created_at: string
          creator_id: string
          description: string | null
          external_url: string | null
          id: string
          locks_at: string | null
          metadata: Json
          result_source: Database["public"]["Enums"]["result_source_type"]
          settlement_status:
            | Database["public"]["Enums"]["settlement_status"]
            | null
          slug: string
          stage_id: string | null
          starts_at: string | null
          status: Database["public"]["Enums"]["event_status"]
          tenant_id: string
          title: string
          updated_at: string
          youtube_url: string | null
        }
        Insert: {
          competition_id?: string | null
          cover_image_url?: string | null
          created_at?: string
          creator_id: string
          description?: string | null
          external_url?: string | null
          id?: string
          locks_at?: string | null
          metadata?: Json
          result_source?: Database["public"]["Enums"]["result_source_type"]
          settlement_status?:
            | Database["public"]["Enums"]["settlement_status"]
            | null
          slug: string
          stage_id?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          tenant_id: string
          title: string
          updated_at?: string
          youtube_url?: string | null
        }
        Update: {
          competition_id?: string | null
          cover_image_url?: string | null
          created_at?: string
          creator_id?: string
          description?: string | null
          external_url?: string | null
          id?: string
          locks_at?: string | null
          metadata?: Json
          result_source?: Database["public"]["Enums"]["result_source_type"]
          settlement_status?:
            | Database["public"]["Enums"]["settlement_status"]
            | null
          slug?: string
          stage_id?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          tenant_id?: string
          title?: string
          updated_at?: string
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "competition_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      idempotency_records: {
        Row: {
          created_at: string
          id: string
          idempotency_key: string
          request_hash: string | null
          response: Json | null
          scope: string
          status: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          idempotency_key: string
          request_hash?: string | null
          response?: Json | null
          scope: string
          status?: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          idempotency_key?: string
          request_hash?: string | null
          response?: Json | null
          scope?: string
          status?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "idempotency_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_snapshots: {
        Row: {
          accuracy: number
          computed_at: string
          correct_predictions: number
          id: string
          period: string
          rank: number | null
          ranked: boolean
          scope: Database["public"]["Enums"]["leaderboard_scope"]
          scope_id: string | null
          tenant_id: string
          total_points: number
          user_id: string
        }
        Insert: {
          accuracy?: number
          computed_at?: string
          correct_predictions?: number
          id?: string
          period?: string
          rank?: number | null
          ranked?: boolean
          scope: Database["public"]["Enums"]["leaderboard_scope"]
          scope_id?: string | null
          tenant_id: string
          total_points?: number
          user_id: string
        }
        Update: {
          accuracy?: number
          computed_at?: string
          correct_predictions?: number
          id?: string
          period?: string
          rank?: number | null
          ranked?: boolean
          scope?: Database["public"]["Enums"]["leaderboard_scope"]
          scope_id?: string | null
          tenant_id?: string
          total_points?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaderboard_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      market_options: {
        Row: {
          color: string | null
          competitor_id: string | null
          created_at: string
          display_order: number
          id: string
          image_url: string | null
          label: string
          market_id: string
          metadata: Json
          status: Database["public"]["Enums"]["option_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          competitor_id?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          label: string
          market_id: string
          metadata?: Json
          status?: Database["public"]["Enums"]["option_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          competitor_id?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          label?: string
          market_id?: string
          metadata?: Json
          status?: Database["public"]["Enums"]["option_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_options_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_options_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_options_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      markets: {
        Row: {
          created_at: string
          event_id: string
          id: string
          locks_at: string | null
          question: string
          sentiment_visibility: Database["public"]["Enums"]["sentiment_visibility"]
          status: Database["public"]["Enums"]["market_status"]
          tenant_id: string
          type: Database["public"]["Enums"]["market_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          locks_at?: string | null
          question: string
          sentiment_visibility?: Database["public"]["Enums"]["sentiment_visibility"]
          status?: Database["public"]["Enums"]["market_status"]
          tenant_id: string
          type?: Database["public"]["Enums"]["market_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          locks_at?: string | null
          question?: string
          sentiment_visibility?: Database["public"]["Enums"]["sentiment_visibility"]
          status?: Database["public"]["Enums"]["market_status"]
          tenant_id?: string
          type?: Database["public"]["Enums"]["market_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "markets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "markets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: string
          reporter_user_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          subject_id: string | null
          subject_type: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reporter_user_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          subject_id?: string | null
          subject_type: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reporter_user_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          subject_id?: string | null
          subject_type?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_reports_reporter_user_id_fkey"
            columns: ["reporter_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      prediction_revisions: {
        Row: {
          created_at: string
          id: string
          market_id: string
          option_id: string
          prediction_id: string
          source: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          market_id: string
          option_id: string
          prediction_id: string
          source?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          market_id?: string
          option_id?: string
          prediction_id?: string
          source?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prediction_revisions_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prediction_revisions_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "market_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prediction_revisions_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "predictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prediction_revisions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prediction_revisions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      predictions: {
        Row: {
          id: string
          idempotency_key: string
          last_changed_at: string
          locked_at: string | null
          market_id: string
          metadata: Json
          option_id: string
          original_option_id: string
          source: string
          status: Database["public"]["Enums"]["prediction_status"]
          submitted_at: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          id?: string
          idempotency_key: string
          last_changed_at?: string
          locked_at?: string | null
          market_id: string
          metadata?: Json
          option_id: string
          original_option_id: string
          source?: string
          status?: Database["public"]["Enums"]["prediction_status"]
          submitted_at?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          id?: string
          idempotency_key?: string
          last_changed_at?: string
          locked_at?: string | null
          market_id?: string
          metadata?: Json
          option_id?: string
          original_option_id?: string
          source?: string
          status?: Database["public"]["Enums"]["prediction_status"]
          submitted_at?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "predictions_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "market_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_original_option_id_fkey"
            columns: ["original_option_id"]
            isOneToOne: false
            referencedRelation: "market_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      prize_awards: {
        Row: {
          awarded_at: string
          competition_prize_id: string
          created_at: string
          draft_assignment_id: string
          fulfilled_at: string | null
          fulfillment_reference: string | null
          id: string
          idempotency_key: string
          notes: string | null
          status: Database["public"]["Enums"]["prize_award_status"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          awarded_at?: string
          competition_prize_id: string
          created_at?: string
          draft_assignment_id: string
          fulfilled_at?: string | null
          fulfillment_reference?: string | null
          id?: string
          idempotency_key: string
          notes?: string | null
          status?: Database["public"]["Enums"]["prize_award_status"]
          tenant_id: string
          user_id: string
        }
        Update: {
          awarded_at?: string
          competition_prize_id?: string
          created_at?: string
          draft_assignment_id?: string
          fulfilled_at?: string | null
          fulfillment_reference?: string | null
          id?: string
          idempotency_key?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["prize_award_status"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prize_awards_competition_prize_id_fkey"
            columns: ["competition_prize_id"]
            isOneToOne: false
            referencedRelation: "competition_prizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prize_awards_draft_assignment_id_fkey"
            columns: ["draft_assignment_id"]
            isOneToOne: false
            referencedRelation: "competitor_draft_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prize_awards_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prize_awards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string
          handle: string
          id: string
          is_public: boolean
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name: string
          handle: string
          id?: string
          is_public?: boolean
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string
          handle?: string
          id?: string
          is_public?: boolean
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      scoring_rules: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_default: boolean
          key: string
          name: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_default?: boolean
          key: string
          name: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_default?: boolean
          key?: string
          name?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scoring_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_grades: {
        Row: {
          created_at: string
          event_id: string
          grading_version: number
          id: string
          market_id: string
          option_id: string
          outcome: string
          points: number
          prediction_id: string
          settlement_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          grading_version: number
          id?: string
          market_id: string
          option_id: string
          outcome: string
          points?: number
          prediction_id: string
          settlement_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          grading_version?: number
          id?: string
          market_id?: string
          option_id?: string
          outcome?: string
          points?: number
          prediction_id?: string
          settlement_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_grades_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_grades_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_grades_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "market_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_grades_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "predictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_grades_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_grades_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_grades_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      settlements: {
        Row: {
          activated_at: string | null
          created_at: string
          event_id: string
          grading_version: number
          id: string
          initiated_by: string | null
          reason: string | null
          result_id: string | null
          reversed_at: string | null
          status: Database["public"]["Enums"]["settlement_status"]
          tenant_id: string
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          event_id: string
          grading_version: number
          id?: string
          initiated_by?: string | null
          reason?: string | null
          result_id?: string | null
          reversed_at?: string | null
          status?: Database["public"]["Enums"]["settlement_status"]
          tenant_id: string
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          event_id?: string
          grading_version?: number
          id?: string
          initiated_by?: string | null
          reason?: string | null
          result_id?: string | null
          reversed_at?: string | null
          status?: Database["public"]["Enums"]["settlement_status"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlements_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "event_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      system_jobs: {
        Row: {
          attempts: number
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          job_type: string
          payload: Json
          run_at: string
          started_at: string | null
          status: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          job_type: string
          payload?: Json
          run_at?: string
          started_at?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          job_type?: string
          payload?: Json
          run_at?: string
          started_at?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_domains: {
        Row: {
          created_at: string
          domain: string
          id: string
          is_primary: boolean
          tenant_id: string
          verified: boolean
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          is_primary?: boolean
          tenant_id: string
          verified?: boolean
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          is_primary?: boolean
          tenant_id?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "tenant_domains_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_feature_flags: {
        Row: {
          created_at: string
          enabled: boolean
          flag: string
          id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          flag: string
          id?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          flag?: string
          id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_feature_flags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_memberships: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["membership_role"]
          status: Database["public"]["Enums"]["membership_status"]
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["membership_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["membership_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_settings: {
        Row: {
          created_at: string
          creator_share_bps: number
          enabled_competition_types: Database["public"]["Enums"]["competition_type"][]
          footer_links: Json
          legal_links: Json
          minimum_ranked_predictions: number
          platform_share_bps: number
          sentiment_visibility: Database["public"]["Enums"]["sentiment_visibility"]
          settings: Json
          small_participation_display: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          creator_share_bps?: number
          enabled_competition_types?: Database["public"]["Enums"]["competition_type"][]
          footer_links?: Json
          legal_links?: Json
          minimum_ranked_predictions?: number
          platform_share_bps?: number
          sentiment_visibility?: Database["public"]["Enums"]["sentiment_visibility"]
          settings?: Json
          small_participation_display?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          creator_share_bps?: number
          enabled_competition_types?: Database["public"]["Enums"]["competition_type"][]
          footer_links?: Json
          legal_links?: Json
          minimum_ranked_predictions?: number
          platform_share_bps?: number
          sentiment_visibility?: Database["public"]["Enums"]["sentiment_visibility"]
          settings?: Json
          small_participation_display?: boolean
          tenant_id?: string
          updated_at?: string
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
          created_at: string
          default_locale: string
          default_timezone: string
          description: string | null
          display_name: string
          icon_url: string | null
          id: string
          logo_url: string | null
          slug: string
          status: Database["public"]["Enums"]["tenant_status"]
          tagline: string | null
          theme: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_locale?: string
          default_timezone?: string
          description?: string | null
          display_name: string
          icon_url?: string | null
          id?: string
          logo_url?: string | null
          slug: string
          status?: Database["public"]["Enums"]["tenant_status"]
          tagline?: string | null
          theme?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_locale?: string
          default_timezone?: string
          description?: string | null
          display_name?: string
          icon_url?: string | null
          id?: string
          logo_url?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          tagline?: string | null
          theme?: Json
          updated_at?: string
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          achievement_id: string
          context: Json
          granted_at: string
          id: string
          revoked_at: string | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          achievement_id: string
          context?: Json
          granted_at?: string
          id?: string
          revoked_at?: string | null
          tenant_id: string
          user_id: string
        }
        Update: {
          achievement_id?: string
          context?: Json
          granted_at?: string
          id?: string
          revoked_at?: string | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_achievements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["global_role"]
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["global_role"]
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["global_role"]
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_statistics: {
        Row: {
          best_streak: number
          correct_predictions: number
          current_streak: number
          first_graded_at: string | null
          incorrect_predictions: number
          last_graded_at: string | null
          tenant_id: string
          total_points: number
          total_predictions: number
          updated_at: string
          user_id: string
        }
        Insert: {
          best_streak?: number
          correct_predictions?: number
          current_streak?: number
          first_graded_at?: string | null
          incorrect_predictions?: number
          last_graded_at?: string | null
          tenant_id: string
          total_points?: number
          total_predictions?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          best_streak?: number
          correct_predictions?: number
          current_streak?: number
          first_graded_at?: string | null
          incorrect_predictions?: number
          last_graded_at?: string | null
          tenant_id?: string
          total_points?: number
          total_predictions?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_statistics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_statistics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          deleted_at: string | null
          email: string | null
          id: string
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id: string
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      advance_bracket: {
        Args: { p_event_id: string; p_winner_competitor_id: string }
        Returns: undefined
      }
      award_competition_prizes: {
        Args: { p_competition_id: string }
        Returns: number
      }
      cancel_draft_assignment: {
        Args: { p_assignment_id: string; p_reason: string }
        Returns: Json
      }
      confirm_draft_payment: {
        Args: { p_provider_reference: string }
        Returns: Json
      }
      create_bracket: {
        Args: { p_competition_id: string; p_structure: Json }
        Returns: undefined
      }
      draft_competitor: {
        Args: {
          p_competition_id: string
          p_competitor_id: string
          p_idempotency_key: string
        }
        Returns: Json
      }
      draft_roster: {
        Args: { p_competition_id: string }
        Returns: {
          color: string
          competitor_id: string
          drafters: number
          image_url: string
          name: string
          taken: boolean
        }[]
      }
      expire_draft_reservations: { Args: never; Returns: number }
      lock_due_markets: { Args: never; Returns: number }
      market_sentiment: {
        Args: { p_market_id: string }
        Returns: {
          display_order: number
          label: string
          option_id: string
          total: number
          votes: number
        }[]
      }
      record_event_positions: {
        Args: { p_event_id: string; p_positions: Json }
        Returns: Json
      }
      regrade_event: {
        Args: {
          p_event_id: string
          p_idempotency_key: string
          p_reason: string
          p_resolution: string
          p_winning_competitor_id: string
        }
        Returns: Json
      }
      settle_event: {
        Args: {
          p_event_id: string
          p_idempotency_key: string
          p_notes: string
          p_resolution: string
          p_result_url: string
          p_winning_competitor_id: string
        }
        Returns: Json
      }
      submit_prediction: {
        Args: {
          p_idempotency_key: string
          p_market_id: string
          p_option_id: string
          p_source?: string
        }
        Returns: Json
      }
    }
    Enums: {
      competition_status:
        | "draft"
        | "scheduled"
        | "active"
        | "completed"
        | "canceled"
        | "archived"
      competition_type: "STANDALONE_EVENT" | "SEASON" | "TOURNAMENT" | "BRACKET"
      creator_verification_status:
        | "unsubmitted"
        | "pending"
        | "verified"
        | "rejected"
        | "suspended"
      draft_access_type: "free" | "paid" | "invite_only" | "admin_assigned"
      draft_assignment_source:
        | "user_selected"
        | "creator_assigned"
        | "super_admin_assigned"
        | "random_assignment"
      draft_assignment_status:
        | "reserved"
        | "pending_payment"
        | "confirmed"
        | "active"
        | "completed"
        | "canceled"
        | "expired"
      draft_mode: "open" | "exclusive"
      draft_payment_status:
        | "not_required"
        | "pending"
        | "paid"
        | "failed"
        | "refunded"
        | "canceled"
      draft_scoring_type: "competition_points"
      draft_status:
        | "draft"
        | "scheduled"
        | "open"
        | "closed"
        | "active"
        | "completed"
        | "canceled"
      draft_visibility: "public" | "followers_only" | "invite_only"
      event_status:
        | "draft"
        | "scheduled"
        | "published"
        | "open"
        | "locked"
        | "live"
        | "waiting_result"
        | "settlement_pending"
        | "settled"
        | "canceled"
        | "voided"
      feed_activity_type:
        | "creator_published_event"
        | "user_submitted_prediction"
        | "user_earned_achievement"
        | "user_reached_streak_milestone"
        | "event_settled"
        | "user_leaderboard_move"
        | "creator_published_result"
        | "sponsored_event_published"
      fulfillment_owner_type: "platform" | "creator" | "sponsor"
      fulfillment_status:
        | "not_started"
        | "pending"
        | "in_progress"
        | "fulfilled"
        | "canceled"
      global_role: "super_admin" | "creator" | "user"
      leaderboard_scope: "global" | "creator" | "competition" | "season"
      market_status:
        | "draft"
        | "open"
        | "locked"
        | "settled"
        | "canceled"
        | "voided"
      market_type: "SINGLE_CHOICE_WINNER" | "YES_NO" | "MULTIPLE_CHOICE"
      membership_role: "member" | "creator" | "admin"
      membership_status: "active" | "suspended" | "removed"
      notification_type:
        | "new_creator_event"
        | "prediction_opening"
        | "prediction_locking_soon"
        | "event_result_published"
        | "prediction_correct"
        | "prediction_incorrect"
        | "achievement_earned"
        | "streak_milestone"
        | "leaderboard_milestone"
        | "creator_followed"
        | "creator_support_started"
        | "creator_support_renewed"
        | "subscription_failed"
        | "competition_starting"
        | "bracket_advancement"
      option_status: "active" | "withdrawn" | "voided" | "winner" | "loser"
      prediction_status: "active" | "locked" | "correct" | "incorrect" | "void"
      prize_award_status:
        | "awarded"
        | "reversed"
        | "superseded"
        | "fulfilled"
        | "canceled"
      prize_category:
        | "recognition"
        | "digital"
        | "physical"
        | "sponsor"
        | "premium_access"
      result_source_type:
        | "creator_manual"
        | "super_admin_manual"
        | "external_provider"
        | "webhook"
        | "future_adapter"
      sentiment_visibility: "always" | "after_prediction" | "after_lock"
      settlement_status:
        | "pending"
        | "active"
        | "reversed"
        | "superseded"
        | "failed"
      sponsorship_status: "draft" | "active" | "completed" | "canceled"
      stage_kind:
        | "qualifier"
        | "group_stage"
        | "round_of_64"
        | "round_of_32"
        | "round_of_16"
        | "quarterfinal"
        | "semifinal"
        | "final"
        | "custom"
      subscription_product_kind: "platform_premium" | "creator_support"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "incomplete"
      tenant_status: "active" | "suspended" | "archived"
      user_status: "active" | "suspended" | "deleted"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      competition_status: [
        "draft",
        "scheduled",
        "active",
        "completed",
        "canceled",
        "archived",
      ],
      competition_type: ["STANDALONE_EVENT", "SEASON", "TOURNAMENT", "BRACKET"],
      creator_verification_status: [
        "unsubmitted",
        "pending",
        "verified",
        "rejected",
        "suspended",
      ],
      draft_access_type: ["free", "paid", "invite_only", "admin_assigned"],
      draft_assignment_source: [
        "user_selected",
        "creator_assigned",
        "super_admin_assigned",
        "random_assignment",
      ],
      draft_assignment_status: [
        "reserved",
        "pending_payment",
        "confirmed",
        "active",
        "completed",
        "canceled",
        "expired",
      ],
      draft_mode: ["open", "exclusive"],
      draft_payment_status: [
        "not_required",
        "pending",
        "paid",
        "failed",
        "refunded",
        "canceled",
      ],
      draft_scoring_type: ["competition_points"],
      draft_status: [
        "draft",
        "scheduled",
        "open",
        "closed",
        "active",
        "completed",
        "canceled",
      ],
      draft_visibility: ["public", "followers_only", "invite_only"],
      event_status: [
        "draft",
        "scheduled",
        "published",
        "open",
        "locked",
        "live",
        "waiting_result",
        "settlement_pending",
        "settled",
        "canceled",
        "voided",
      ],
      feed_activity_type: [
        "creator_published_event",
        "user_submitted_prediction",
        "user_earned_achievement",
        "user_reached_streak_milestone",
        "event_settled",
        "user_leaderboard_move",
        "creator_published_result",
        "sponsored_event_published",
      ],
      fulfillment_owner_type: ["platform", "creator", "sponsor"],
      fulfillment_status: [
        "not_started",
        "pending",
        "in_progress",
        "fulfilled",
        "canceled",
      ],
      global_role: ["super_admin", "creator", "user"],
      leaderboard_scope: ["global", "creator", "competition", "season"],
      market_status: [
        "draft",
        "open",
        "locked",
        "settled",
        "canceled",
        "voided",
      ],
      market_type: ["SINGLE_CHOICE_WINNER", "YES_NO", "MULTIPLE_CHOICE"],
      membership_role: ["member", "creator", "admin"],
      membership_status: ["active", "suspended", "removed"],
      notification_type: [
        "new_creator_event",
        "prediction_opening",
        "prediction_locking_soon",
        "event_result_published",
        "prediction_correct",
        "prediction_incorrect",
        "achievement_earned",
        "streak_milestone",
        "leaderboard_milestone",
        "creator_followed",
        "creator_support_started",
        "creator_support_renewed",
        "subscription_failed",
        "competition_starting",
        "bracket_advancement",
      ],
      option_status: ["active", "withdrawn", "voided", "winner", "loser"],
      prediction_status: ["active", "locked", "correct", "incorrect", "void"],
      prize_award_status: [
        "awarded",
        "reversed",
        "superseded",
        "fulfilled",
        "canceled",
      ],
      prize_category: [
        "recognition",
        "digital",
        "physical",
        "sponsor",
        "premium_access",
      ],
      result_source_type: [
        "creator_manual",
        "super_admin_manual",
        "external_provider",
        "webhook",
        "future_adapter",
      ],
      sentiment_visibility: ["always", "after_prediction", "after_lock"],
      settlement_status: [
        "pending",
        "active",
        "reversed",
        "superseded",
        "failed",
      ],
      sponsorship_status: ["draft", "active", "completed", "canceled"],
      stage_kind: [
        "qualifier",
        "group_stage",
        "round_of_64",
        "round_of_32",
        "round_of_16",
        "quarterfinal",
        "semifinal",
        "final",
        "custom",
      ],
      subscription_product_kind: ["platform_premium", "creator_support"],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "incomplete",
      ],
      tenant_status: ["active", "suspended", "archived"],
      user_status: ["active", "suspended", "deleted"],
    },
  },
} as const

