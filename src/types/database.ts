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
      [_ in never]: never
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

