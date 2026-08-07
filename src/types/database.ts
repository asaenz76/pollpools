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
      billing_checkouts: {
        Row: {
          billing_product_id: string
          checkout_url: string | null
          completed_at: string | null
          created_at: string
          expires_at: string | null
          id: string
          idempotency_key: string
          metadata: Json
          provider: Database["public"]["Enums"]["billing_provider_type"]
          provider_checkout_id: string | null
          status: Database["public"]["Enums"]["billing_checkout_status"]
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_product_id: string
          checkout_url?: string | null
          completed_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          idempotency_key: string
          metadata?: Json
          provider: Database["public"]["Enums"]["billing_provider_type"]
          provider_checkout_id?: string | null
          status?: Database["public"]["Enums"]["billing_checkout_status"]
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_product_id?: string
          checkout_url?: string | null
          completed_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          idempotency_key?: string
          metadata?: Json
          provider?: Database["public"]["Enums"]["billing_provider_type"]
          provider_checkout_id?: string | null
          status?: Database["public"]["Enums"]["billing_checkout_status"]
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_checkouts_billing_product_id_fkey"
            columns: ["billing_product_id"]
            isOneToOne: false
            referencedRelation: "billing_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_checkouts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_checkouts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_customers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          metadata: Json
          name: string | null
          provider: Database["public"]["Enums"]["billing_provider_type"]
          provider_customer_id: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          metadata?: Json
          name?: string | null
          provider: Database["public"]["Enums"]["billing_provider_type"]
          provider_customer_id: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          metadata?: Json
          name?: string | null
          provider?: Database["public"]["Enums"]["billing_provider_type"]
          provider_customer_id?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_customers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_entitlements: {
        Row: {
          competition_id: string | null
          created_at: string
          creator_id: string | null
          ends_at: string | null
          entitlement_type: Database["public"]["Enums"]["billing_entitlement_type"]
          id: string
          metadata: Json
          revoked_at: string | null
          source_id: string
          source_type: Database["public"]["Enums"]["entitlement_source_type"]
          starts_at: string
          status: Database["public"]["Enums"]["entitlement_status"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          competition_id?: string | null
          created_at?: string
          creator_id?: string | null
          ends_at?: string | null
          entitlement_type: Database["public"]["Enums"]["billing_entitlement_type"]
          id?: string
          metadata?: Json
          revoked_at?: string | null
          source_id: string
          source_type: Database["public"]["Enums"]["entitlement_source_type"]
          starts_at?: string
          status?: Database["public"]["Enums"]["entitlement_status"]
          tenant_id: string
          user_id: string
        }
        Update: {
          competition_id?: string | null
          created_at?: string
          creator_id?: string | null
          ends_at?: string | null
          entitlement_type?: Database["public"]["Enums"]["billing_entitlement_type"]
          id?: string
          metadata?: Json
          revoked_at?: string | null
          source_id?: string
          source_type?: Database["public"]["Enums"]["entitlement_source_type"]
          starts_at?: string
          status?: Database["public"]["Enums"]["entitlement_status"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_entitlements_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_entitlements_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_entitlements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_entitlements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_orders: {
        Row: {
          billing_checkout_id: string | null
          billing_product_id: string
          created_at: string
          currency_code: string
          id: string
          metadata: Json
          provider: Database["public"]["Enums"]["billing_provider_type"]
          provider_customer_id: string | null
          provider_order_id: string
          purchased_at: string
          refunded_minor_units: number
          status: Database["public"]["Enums"]["billing_order_status"]
          subtotal_minor_units: number
          tax_minor_units: number
          tenant_id: string
          total_minor_units: number
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_checkout_id?: string | null
          billing_product_id: string
          created_at?: string
          currency_code: string
          id?: string
          metadata?: Json
          provider: Database["public"]["Enums"]["billing_provider_type"]
          provider_customer_id?: string | null
          provider_order_id: string
          purchased_at: string
          refunded_minor_units?: number
          status: Database["public"]["Enums"]["billing_order_status"]
          subtotal_minor_units: number
          tax_minor_units?: number
          tenant_id: string
          total_minor_units: number
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_checkout_id?: string | null
          billing_product_id?: string
          created_at?: string
          currency_code?: string
          id?: string
          metadata?: Json
          provider?: Database["public"]["Enums"]["billing_provider_type"]
          provider_customer_id?: string | null
          provider_order_id?: string
          purchased_at?: string
          refunded_minor_units?: number
          status?: Database["public"]["Enums"]["billing_order_status"]
          subtotal_minor_units?: number
          tax_minor_units?: number
          tenant_id?: string
          total_minor_units?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_orders_billing_checkout_id_fkey"
            columns: ["billing_checkout_id"]
            isOneToOne: false
            referencedRelation: "billing_checkouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_orders_billing_product_id_fkey"
            columns: ["billing_product_id"]
            isOneToOne: false
            referencedRelation: "billing_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_products: {
        Row: {
          billing_interval:
            | Database["public"]["Enums"]["billing_interval_type"]
            | null
          competition_id: string | null
          created_at: string
          creator_id: string | null
          currency_code: string
          description: string | null
          id: string
          metadata: Json
          name: string
          price_minor_units: number
          product_type: Database["public"]["Enums"]["billing_product_type"]
          provider: Database["public"]["Enums"]["billing_provider_type"]
          provider_product_id: string | null
          provider_variant_id: string | null
          status: Database["public"]["Enums"]["billing_product_status"]
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          billing_interval?:
            | Database["public"]["Enums"]["billing_interval_type"]
            | null
          competition_id?: string | null
          created_at?: string
          creator_id?: string | null
          currency_code: string
          description?: string | null
          id?: string
          metadata?: Json
          name: string
          price_minor_units: number
          product_type: Database["public"]["Enums"]["billing_product_type"]
          provider: Database["public"]["Enums"]["billing_provider_type"]
          provider_product_id?: string | null
          provider_variant_id?: string | null
          status?: Database["public"]["Enums"]["billing_product_status"]
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          billing_interval?:
            | Database["public"]["Enums"]["billing_interval_type"]
            | null
          competition_id?: string | null
          created_at?: string
          creator_id?: string | null
          currency_code?: string
          description?: string | null
          id?: string
          metadata?: Json
          name?: string
          price_minor_units?: number
          product_type?: Database["public"]["Enums"]["billing_product_type"]
          provider?: Database["public"]["Enums"]["billing_provider_type"]
          provider_product_id?: string | null
          provider_variant_id?: string | null
          status?: Database["public"]["Enums"]["billing_product_status"]
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_products_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_products_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_refunds: {
        Row: {
          amount_minor_units: number
          billing_order_id: string
          created_at: string
          currency_code: string
          id: string
          idempotency_key: string
          initiated_by: string | null
          processed_at: string | null
          provider: Database["public"]["Enums"]["billing_provider_type"]
          provider_refund_id: string | null
          reason: string | null
          status: Database["public"]["Enums"]["billing_refund_status"]
          tenant_id: string
        }
        Insert: {
          amount_minor_units: number
          billing_order_id: string
          created_at?: string
          currency_code: string
          id?: string
          idempotency_key: string
          initiated_by?: string | null
          processed_at?: string | null
          provider: Database["public"]["Enums"]["billing_provider_type"]
          provider_refund_id?: string | null
          reason?: string | null
          status: Database["public"]["Enums"]["billing_refund_status"]
          tenant_id: string
        }
        Update: {
          amount_minor_units?: number
          billing_order_id?: string
          created_at?: string
          currency_code?: string
          id?: string
          idempotency_key?: string
          initiated_by?: string | null
          processed_at?: string | null
          provider?: Database["public"]["Enums"]["billing_provider_type"]
          provider_refund_id?: string | null
          reason?: string | null
          status?: Database["public"]["Enums"]["billing_refund_status"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_refunds_billing_order_id_fkey"
            columns: ["billing_order_id"]
            isOneToOne: false
            referencedRelation: "billing_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_refunds_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_refunds_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_subscriptions: {
        Row: {
          billing_product_id: string
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          creator_id: string | null
          current_period_end: string | null
          current_period_start: string | null
          ended_at: string | null
          id: string
          metadata: Json
          provider: Database["public"]["Enums"]["billing_provider_type"]
          provider_customer_id: string | null
          provider_subscription_id: string
          status: Database["public"]["Enums"]["subscription_status"]
          tenant_id: string
          trial_ends_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_product_id: string
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          creator_id?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          ended_at?: string | null
          id?: string
          metadata?: Json
          provider: Database["public"]["Enums"]["billing_provider_type"]
          provider_customer_id?: string | null
          provider_subscription_id: string
          status: Database["public"]["Enums"]["subscription_status"]
          tenant_id: string
          trial_ends_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_product_id?: string
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          creator_id?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          ended_at?: string | null
          id?: string
          metadata?: Json
          provider?: Database["public"]["Enums"]["billing_provider_type"]
          provider_customer_id?: string | null
          provider_subscription_id?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          tenant_id?: string
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_subscriptions_billing_product_id_fkey"
            columns: ["billing_product_id"]
            isOneToOne: false
            referencedRelation: "billing_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_subscriptions_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_webhook_events: {
        Row: {
          attempts: number
          created_at: string
          event_type: string
          failure_reason: string | null
          id: string
          payload_hash: string
          processed_at: string | null
          processing_status: Database["public"]["Enums"]["webhook_processing_status"]
          provider: Database["public"]["Enums"]["billing_provider_type"]
          provider_event_id: string
          raw_payload: Json
          signature_verified: boolean
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          event_type: string
          failure_reason?: string | null
          id?: string
          payload_hash: string
          processed_at?: string | null
          processing_status?: Database["public"]["Enums"]["webhook_processing_status"]
          provider: Database["public"]["Enums"]["billing_provider_type"]
          provider_event_id: string
          raw_payload: Json
          signature_verified: boolean
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          event_type?: string
          failure_reason?: string | null
          id?: string
          payload_hash?: string
          processed_at?: string | null
          processing_status?: Database["public"]["Enums"]["webhook_processing_status"]
          provider?: Database["public"]["Enums"]["billing_provider_type"]
          provider_event_id?: string
          raw_payload?: Json
          signature_verified?: boolean
          updated_at?: string
        }
        Relationships: []
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
      comments: {
        Row: {
          body: string
          created_at: string
          id: string
          status: string
          subject_id: string
          subject_type: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          status?: string
          subject_id: string
          subject_type: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          status?: string
          subject_id?: string
          subject_type?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      community_health_bands: {
        Row: {
          display_order: number
          id: string
          key: string
          label: string
          max_score: number
          min_score: number
          tone: string
        }
        Insert: {
          display_order?: number
          id?: string
          key: string
          label: string
          max_score: number
          min_score: number
          tone?: string
        }
        Update: {
          display_order?: number
          id?: string
          key?: string
          label?: string
          max_score?: number
          min_score?: number
          tone?: string
        }
        Relationships: []
      }
      community_health_metrics: {
        Row: {
          created_at: string
          description: string
          display_name: string
          display_order: number
          enabled: boolean
          id: string
          key: string
          max_score: number
          measurement_window_days: number
          requires_feature: string | null
          scoring: Json
          status: Database["public"]["Enums"]["community_health_metric_status"]
          suggestion: string | null
          updated_at: string
          weight: number
        }
        Insert: {
          created_at?: string
          description: string
          display_name: string
          display_order?: number
          enabled?: boolean
          id?: string
          key: string
          max_score: number
          measurement_window_days?: number
          requires_feature?: string | null
          scoring?: Json
          status?: Database["public"]["Enums"]["community_health_metric_status"]
          suggestion?: string | null
          updated_at?: string
          weight: number
        }
        Update: {
          created_at?: string
          description?: string
          display_name?: string
          display_order?: number
          enabled?: boolean
          id?: string
          key?: string
          max_score?: number
          measurement_window_days?: number
          requires_feature?: string | null
          scoring?: Json
          status?: Database["public"]["Enums"]["community_health_metric_status"]
          suggestion?: string | null
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      community_health_snapshots: {
        Row: {
          band_key: string | null
          calculated_at: string
          components: Json
          formula_version: number
          id: string
          metadata: Json
          overall_score: number | null
          snapshot_date: string
          status: string
          tenant_id: string
        }
        Insert: {
          band_key?: string | null
          calculated_at?: string
          components?: Json
          formula_version: number
          id?: string
          metadata?: Json
          overall_score?: number | null
          snapshot_date: string
          status: string
          tenant_id: string
        }
        Update: {
          band_key?: string | null
          calculated_at?: string
          components?: Json
          formula_version?: number
          id?: string
          metadata?: Json
          overall_score?: number | null
          snapshot_date?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_health_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          winner_only_fallback: boolean
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
          winner_only_fallback?: boolean
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
          winner_only_fallback?: boolean
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
      creator_earnings: {
        Row: {
          available_at: string | null
          billing_order_id: string
          billing_subscription_id: string | null
          created_at: string
          creator_id: string
          creator_share_minor_units: number
          currency_code: string
          earning_type: Database["public"]["Enums"]["creator_earning_type"]
          gross_minor_units: number
          id: string
          idempotency_key: string
          net_revenue_minor_units: number
          platform_share_minor_units: number
          provider_fee_minor_units: number
          reversed_by_id: string | null
          status: Database["public"]["Enums"]["creator_earning_status"]
          tax_minor_units: number
          tenant_id: string
        }
        Insert: {
          available_at?: string | null
          billing_order_id: string
          billing_subscription_id?: string | null
          created_at?: string
          creator_id: string
          creator_share_minor_units: number
          currency_code: string
          earning_type: Database["public"]["Enums"]["creator_earning_type"]
          gross_minor_units: number
          id?: string
          idempotency_key: string
          net_revenue_minor_units: number
          platform_share_minor_units: number
          provider_fee_minor_units?: number
          reversed_by_id?: string | null
          status?: Database["public"]["Enums"]["creator_earning_status"]
          tax_minor_units?: number
          tenant_id: string
        }
        Update: {
          available_at?: string | null
          billing_order_id?: string
          billing_subscription_id?: string | null
          created_at?: string
          creator_id?: string
          creator_share_minor_units?: number
          currency_code?: string
          earning_type?: Database["public"]["Enums"]["creator_earning_type"]
          gross_minor_units?: number
          id?: string
          idempotency_key?: string
          net_revenue_minor_units?: number
          platform_share_minor_units?: number
          provider_fee_minor_units?: number
          reversed_by_id?: string | null
          status?: Database["public"]["Enums"]["creator_earning_status"]
          tax_minor_units?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_earnings_billing_order_id_fkey"
            columns: ["billing_order_id"]
            isOneToOne: false
            referencedRelation: "billing_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_earnings_billing_subscription_id_fkey"
            columns: ["billing_subscription_id"]
            isOneToOne: false
            referencedRelation: "billing_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_earnings_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_earnings_reversed_by_id_fkey"
            columns: ["reversed_by_id"]
            isOneToOne: false
            referencedRelation: "creator_earnings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_earnings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_follows: {
        Row: {
          created_at: string
          creator_id: string
          id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          id?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_follows_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_follows_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_follows_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_payout_allocations: {
        Row: {
          amount_minor_units: number
          created_at: string
          earning_id: string
          id: string
          payout_request_id: string
          tenant_id: string
        }
        Insert: {
          amount_minor_units: number
          created_at?: string
          earning_id: string
          id?: string
          payout_request_id: string
          tenant_id: string
        }
        Update: {
          amount_minor_units?: number
          created_at?: string
          earning_id?: string
          id?: string
          payout_request_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_payout_allocations_earning_id_fkey"
            columns: ["earning_id"]
            isOneToOne: true
            referencedRelation: "creator_earnings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_payout_allocations_payout_request_id_fkey"
            columns: ["payout_request_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_payout_allocations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_payout_requests: {
        Row: {
          amount_minor_units: number
          created_at: string
          creator_id: string
          currency_code: string
          external_reference: string | null
          id: string
          idempotency_key: string
          notes: string | null
          paid_at: string | null
          payout_destination_masked: string | null
          payout_method: string | null
          requested_at: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["creator_payout_status"]
          tenant_id: string
        }
        Insert: {
          amount_minor_units: number
          created_at?: string
          creator_id: string
          currency_code: string
          external_reference?: string | null
          id?: string
          idempotency_key: string
          notes?: string | null
          paid_at?: string | null
          payout_destination_masked?: string | null
          payout_method?: string | null
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["creator_payout_status"]
          tenant_id: string
        }
        Update: {
          amount_minor_units?: number
          created_at?: string
          creator_id?: string
          currency_code?: string
          external_reference?: string | null
          id?: string
          idempotency_key?: string
          notes?: string | null
          paid_at?: string | null
          payout_destination_masked?: string | null
          payout_method?: string | null
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["creator_payout_status"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_payout_requests_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_payout_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_payout_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_revenue_rules: {
        Row: {
          created_at: string
          created_by: string
          creator_id: string
          creator_share_basis_points: number
          effective_from: string
          effective_to: string | null
          id: string
          platform_share_basis_points: number
          product_type: Database["public"]["Enums"]["billing_product_type"]
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          creator_id: string
          creator_share_basis_points: number
          effective_from?: string
          effective_to?: string | null
          id?: string
          platform_share_basis_points: number
          product_type: Database["public"]["Enums"]["billing_product_type"]
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          creator_id?: string
          creator_share_basis_points?: number
          effective_from?: string
          effective_to?: string | null
          id?: string
          platform_share_basis_points?: number
          product_type?: Database["public"]["Enums"]["billing_product_type"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_revenue_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_revenue_rules_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_revenue_rules_tenant_id_fkey"
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
          recorded: boolean
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
          recorded?: boolean
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
          recorded?: boolean
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
      event_media_links: {
        Row: {
          created_at: string
          ends_at: string | null
          event_id: string
          id: string
          is_primary: boolean
          label: string | null
          media_type: Database["public"]["Enums"]["event_media_type"]
          metadata: Json
          provider: string
          starts_at: string | null
          tenant_id: string
          thumbnail_url: string | null
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          event_id: string
          id?: string
          is_primary?: boolean
          label?: string | null
          media_type: Database["public"]["Enums"]["event_media_type"]
          metadata?: Json
          provider: string
          starts_at?: string | null
          tenant_id: string
          thumbnail_url?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          event_id?: string
          id?: string
          is_primary?: boolean
          label?: string | null
          media_type?: Database["public"]["Enums"]["event_media_type"]
          metadata?: Json
          provider?: string
          starts_at?: string | null
          tenant_id?: string
          thumbnail_url?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_media_links_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_media_links_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      event_result_options: {
        Row: {
          competitor_id: string | null
          created_at: string
          event_id: string
          grading_version: number
          id: string
          market_id: string
          option_id: string
          tenant_id: string
        }
        Insert: {
          competitor_id?: string | null
          created_at?: string
          event_id: string
          grading_version: number
          id?: string
          market_id: string
          option_id: string
          tenant_id: string
        }
        Update: {
          competitor_id?: string | null
          created_at?: string
          event_id?: string
          grading_version?: number
          id?: string
          market_id?: string
          option_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_result_options_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_result_options_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_result_options_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_result_options_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "market_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_result_options_tenant_id_fkey"
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
      feed_activities: {
        Row: {
          actor_creator_id: string | null
          actor_user_id: string | null
          competition_id: string | null
          created_at: string
          dedupe_key: string
          event_id: string | null
          id: string
          metadata: Json
          subject_user_id: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["feed_activity_type"]
        }
        Insert: {
          actor_creator_id?: string | null
          actor_user_id?: string | null
          competition_id?: string | null
          created_at?: string
          dedupe_key: string
          event_id?: string | null
          id?: string
          metadata?: Json
          subject_user_id?: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["feed_activity_type"]
        }
        Update: {
          actor_creator_id?: string | null
          actor_user_id?: string | null
          competition_id?: string | null
          created_at?: string
          dedupe_key?: string
          event_id?: string | null
          id?: string
          metadata?: Json
          subject_user_id?: string | null
          tenant_id?: string
          type?: Database["public"]["Enums"]["feed_activity_type"]
        }
        Relationships: [
          {
            foreignKeyName: "feed_activities_actor_creator_id_fkey"
            columns: ["actor_creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_activities_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_activities_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_activities_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_activities_subject_user_id_fkey"
            columns: ["subject_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_activities_tenant_id_fkey"
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
      likes: {
        Row: {
          created_at: string
          id: string
          subject_id: string
          subject_type: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          subject_id: string
          subject_type: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          subject_id?: string
          subject_type?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "likes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_user_id_fkey"
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
      notification_fanouts: {
        Row: {
          batches_processed: number
          completed_at: string | null
          created_at: string
          dedup_key: string
          error: string | null
          failed_at: string | null
          id: string
          last_recipient_id: string | null
          notification_type: Database["public"]["Enums"]["notification_type"]
          recipients_processed: number
          source_id: string
          source_type: string
          source_version: string
          started_at: string | null
          status: Database["public"]["Enums"]["fanout_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          batches_processed?: number
          completed_at?: string | null
          created_at?: string
          dedup_key: string
          error?: string | null
          failed_at?: string | null
          id?: string
          last_recipient_id?: string | null
          notification_type: Database["public"]["Enums"]["notification_type"]
          recipients_processed?: number
          source_id: string
          source_type: string
          source_version: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["fanout_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          batches_processed?: number
          completed_at?: string | null
          created_at?: string
          dedup_key?: string
          error?: string | null
          failed_at?: string | null
          id?: string
          last_recipient_id?: string | null
          notification_type?: Database["public"]["Enums"]["notification_type"]
          recipients_processed?: number
          source_id?: string
          source_type?: string
          source_version?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["fanout_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_fanouts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          dedupe_key: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json
          read_at: string | null
          tenant_id: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          dedupe_key: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          read_at?: string | null
          tenant_id: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          dedupe_key?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          read_at?: string | null
          tenant_id?: string
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
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
      platform_config: {
        Row: {
          config: Json
          default_creator_share_bps: number
          default_engine_version: string
          default_platform_share_bps: number
          health_baseline_min_age_days: number
          health_baseline_min_events: number
          health_benchmark_min_tenants: number
          health_formula_version: number
          health_window_days: number
          id: boolean
          platform_name: string
          updated_at: string
          wau_min_actions: number
          wau_signal_draft: boolean
          wau_signal_login: boolean
          wau_signal_prediction: boolean
          wau_window_days: number
        }
        Insert: {
          config?: Json
          default_creator_share_bps?: number
          default_engine_version?: string
          default_platform_share_bps?: number
          health_baseline_min_age_days?: number
          health_baseline_min_events?: number
          health_benchmark_min_tenants?: number
          health_formula_version?: number
          health_window_days?: number
          id?: boolean
          platform_name?: string
          updated_at?: string
          wau_min_actions?: number
          wau_signal_draft?: boolean
          wau_signal_login?: boolean
          wau_signal_prediction?: boolean
          wau_window_days?: number
        }
        Update: {
          config?: Json
          default_creator_share_bps?: number
          default_engine_version?: string
          default_platform_share_bps?: number
          health_baseline_min_age_days?: number
          health_baseline_min_events?: number
          health_benchmark_min_tenants?: number
          health_formula_version?: number
          health_window_days?: number
          id?: boolean
          platform_name?: string
          updated_at?: string
          wau_min_actions?: number
          wau_signal_draft?: boolean
          wau_signal_login?: boolean
          wau_signal_prediction?: boolean
          wau_window_days?: number
        }
        Relationships: []
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
      provider_product_approvals: {
        Row: {
          approval_reference: string | null
          approval_status: Database["public"]["Enums"]["provider_approval_status"]
          approved_at: string | null
          created_at: string
          evidence_url: string | null
          id: string
          notes: string | null
          product_type: Database["public"]["Enums"]["billing_product_type"]
          provider: Database["public"]["Enums"]["billing_provider_type"]
          reviewed_by: string | null
          tenant_id: string | null
        }
        Insert: {
          approval_reference?: string | null
          approval_status?: Database["public"]["Enums"]["provider_approval_status"]
          approved_at?: string | null
          created_at?: string
          evidence_url?: string | null
          id?: string
          notes?: string | null
          product_type: Database["public"]["Enums"]["billing_product_type"]
          provider: Database["public"]["Enums"]["billing_provider_type"]
          reviewed_by?: string | null
          tenant_id?: string | null
        }
        Update: {
          approval_reference?: string | null
          approval_status?: Database["public"]["Enums"]["provider_approval_status"]
          approved_at?: string | null
          created_at?: string
          evidence_url?: string | null
          id?: string
          notes?: string | null
          product_type?: Database["public"]["Enums"]["billing_product_type"]
          provider?: Database["public"]["Enums"]["billing_provider_type"]
          reviewed_by?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_product_approvals_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_product_approvals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          differences_found: number
          error: string | null
          failed_at: string | null
          id: string
          idempotency_key: string
          initiated_by: string | null
          jobs_requeued: number
          mode: Database["public"]["Enums"]["reconciliation_mode"]
          repairs_applied: number
          scope_id: string | null
          scope_type: Database["public"]["Enums"]["reconciliation_scope_type"]
          started_at: string | null
          status: Database["public"]["Enums"]["reconciliation_status"]
          summary: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          differences_found?: number
          error?: string | null
          failed_at?: string | null
          id?: string
          idempotency_key: string
          initiated_by?: string | null
          jobs_requeued?: number
          mode: Database["public"]["Enums"]["reconciliation_mode"]
          repairs_applied?: number
          scope_id?: string | null
          scope_type: Database["public"]["Enums"]["reconciliation_scope_type"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["reconciliation_status"]
          summary?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          differences_found?: number
          error?: string | null
          failed_at?: string | null
          id?: string
          idempotency_key?: string
          initiated_by?: string | null
          jobs_requeued?: number
          mode?: Database["public"]["Enums"]["reconciliation_mode"]
          repairs_applied?: number
          scope_id?: string | null
          scope_type?: Database["public"]["Enums"]["reconciliation_scope_type"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["reconciliation_status"]
          summary?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_plan_shares: {
        Row: {
          creator_share_basis_points: number
          id: string
          plan_id: string
          platform_share_basis_points: number
          product_type: Database["public"]["Enums"]["billing_product_type"]
        }
        Insert: {
          creator_share_basis_points: number
          id?: string
          plan_id: string
          platform_share_basis_points: number
          product_type: Database["public"]["Enums"]["billing_product_type"]
        }
        Update: {
          creator_share_basis_points?: number
          id?: string
          plan_id?: string
          platform_share_basis_points?: number
          product_type?: Database["public"]["Enums"]["billing_product_type"]
        }
        Relationships: [
          {
            foreignKeyName: "revenue_plan_shares_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "revenue_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_plans: {
        Row: {
          created_at: string
          description: string | null
          display_name: string
          display_order: number
          feature_eligibility: Json
          grace_period_days: number
          id: string
          is_default: boolean
          key: string
          qualification: Json
          status: Database["public"]["Enums"]["revenue_plan_status"]
          tier: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_name: string
          display_order?: number
          feature_eligibility?: Json
          grace_period_days?: number
          id?: string
          is_default?: boolean
          key: string
          qualification?: Json
          status?: Database["public"]["Enums"]["revenue_plan_status"]
          tier: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_name?: string
          display_order?: number
          feature_eligibility?: Json
          grace_period_days?: number
          id?: string
          is_default?: boolean
          key?: string
          qualification?: Json
          status?: Database["public"]["Enums"]["revenue_plan_status"]
          tier?: number
          updated_at?: string
        }
        Relationships: []
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
      sponsorships: {
        Row: {
          amount_invoiced_minor_units: number | null
          amount_received_minor_units: number | null
          campaign_title: string | null
          competition_id: string | null
          contract_value_minor_units: number | null
          created_at: string
          creator_id: string | null
          creator_share_basis_points: number | null
          currency_code: string | null
          ends_at: string | null
          event_id: string | null
          external_invoice_reference: string | null
          id: string
          invoice_status: Database["public"]["Enums"]["sponsorship_invoice_status"]
          logo_url: string | null
          metadata: Json
          placement: string | null
          platform_share_basis_points: number | null
          received_at: string | null
          sponsor_name: string
          starts_at: string | null
          status: Database["public"]["Enums"]["sponsorship_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount_invoiced_minor_units?: number | null
          amount_received_minor_units?: number | null
          campaign_title?: string | null
          competition_id?: string | null
          contract_value_minor_units?: number | null
          created_at?: string
          creator_id?: string | null
          creator_share_basis_points?: number | null
          currency_code?: string | null
          ends_at?: string | null
          event_id?: string | null
          external_invoice_reference?: string | null
          id?: string
          invoice_status?: Database["public"]["Enums"]["sponsorship_invoice_status"]
          logo_url?: string | null
          metadata?: Json
          placement?: string | null
          platform_share_basis_points?: number | null
          received_at?: string | null
          sponsor_name: string
          starts_at?: string | null
          status?: Database["public"]["Enums"]["sponsorship_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount_invoiced_minor_units?: number | null
          amount_received_minor_units?: number | null
          campaign_title?: string | null
          competition_id?: string | null
          contract_value_minor_units?: number | null
          created_at?: string
          creator_id?: string | null
          creator_share_basis_points?: number | null
          currency_code?: string | null
          ends_at?: string | null
          event_id?: string | null
          external_invoice_reference?: string | null
          id?: string
          invoice_status?: Database["public"]["Enums"]["sponsorship_invoice_status"]
          logo_url?: string | null
          metadata?: Json
          placement?: string | null
          platform_share_basis_points?: number | null
          received_at?: string | null
          sponsor_name?: string
          starts_at?: string | null
          status?: Database["public"]["Enums"]["sponsorship_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsorships_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsorships_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsorships_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsorships_tenant_id_fkey"
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
          dedup_key: string | null
          error: string | null
          finished_at: string | null
          id: string
          job_type: string
          max_attempts: number
          payload: Json
          run_at: string
          seq: number
          started_at: string | null
          status: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          dedup_key?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          job_type: string
          max_attempts?: number
          payload?: Json
          run_at?: string
          seq?: number
          started_at?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          dedup_key?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          job_type?: string
          max_attempts?: number
          payload?: Json
          run_at?: string
          seq?: number
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
          domain_type: Database["public"]["Enums"]["domain_type"]
          id: string
          is_primary: boolean
          ssl_status: Database["public"]["Enums"]["domain_ssl_status"]
          tenant_id: string
          updated_at: string
          verification_status: Database["public"]["Enums"]["domain_verification_status"]
          verification_token: string | null
          verified: boolean
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          domain: string
          domain_type?: Database["public"]["Enums"]["domain_type"]
          id?: string
          is_primary?: boolean
          ssl_status?: Database["public"]["Enums"]["domain_ssl_status"]
          tenant_id: string
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["domain_verification_status"]
          verification_token?: string | null
          verified?: boolean
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          domain?: string
          domain_type?: Database["public"]["Enums"]["domain_type"]
          id?: string
          is_primary?: boolean
          ssl_status?: Database["public"]["Enums"]["domain_ssl_status"]
          tenant_id?: string
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["domain_verification_status"]
          verification_token?: string | null
          verified?: boolean
          verified_at?: string | null
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
      tenant_plan_state: {
        Row: {
          at_risk_since: string | null
          current_wau: number
          grace_ends_at: string | null
          last_evaluated_at: string | null
          manual_override: boolean
          override_at: string | null
          override_by: string | null
          override_reason: string | null
          status: Database["public"]["Enums"]["plan_qualification_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          at_risk_since?: string | null
          current_wau?: number
          grace_ends_at?: string | null
          last_evaluated_at?: string | null
          manual_override?: boolean
          override_at?: string | null
          override_by?: string | null
          override_reason?: string | null
          status?: Database["public"]["Enums"]["plan_qualification_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          at_risk_since?: string | null
          current_wau?: number
          grace_ends_at?: string | null
          last_evaluated_at?: string | null
          manual_override?: boolean
          override_at?: string | null
          override_by?: string | null
          override_reason?: string | null
          status?: Database["public"]["Enums"]["plan_qualification_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_plan_state_override_by_fkey"
            columns: ["override_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_plan_state_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_revenue_plan_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          assignment_type: Database["public"]["Enums"]["plan_assignment_type"]
          created_at: string
          ended_at: string | null
          id: string
          plan_id: string
          reason: string | null
          tenant_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          assignment_type: Database["public"]["Enums"]["plan_assignment_type"]
          created_at?: string
          ended_at?: string | null
          id?: string
          plan_id: string
          reason?: string | null
          tenant_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          assignment_type?: Database["public"]["Enums"]["plan_assignment_type"]
          created_at?: string
          ended_at?: string | null
          id?: string
          plan_id?: string
          reason?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_revenue_plan_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_revenue_plan_assignments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "revenue_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_revenue_plan_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_settings: {
        Row: {
          allowed_media_providers: string[]
          created_at: string
          creator_share_bps: number
          enabled_competition_types: Database["public"]["Enums"]["competition_type"][]
          event_media_enabled: boolean
          event_media_optional: boolean
          external_media_links_enabled: boolean
          footer_links: Json
          inline_embeds_enabled: boolean
          legal_links: Json
          minimum_ranked_predictions: number
          platform_share_bps: number
          preferred_media_provider: string | null
          providers: Json
          sentiment_visibility: Database["public"]["Enums"]["sentiment_visibility"]
          settings: Json
          show_powered_by: boolean
          small_participation_display: boolean
          tenant_id: string
          updated_at: string
          vocabulary: Json
        }
        Insert: {
          allowed_media_providers?: string[]
          created_at?: string
          creator_share_bps?: number
          enabled_competition_types?: Database["public"]["Enums"]["competition_type"][]
          event_media_enabled?: boolean
          event_media_optional?: boolean
          external_media_links_enabled?: boolean
          footer_links?: Json
          inline_embeds_enabled?: boolean
          legal_links?: Json
          minimum_ranked_predictions?: number
          platform_share_bps?: number
          preferred_media_provider?: string | null
          providers?: Json
          sentiment_visibility?: Database["public"]["Enums"]["sentiment_visibility"]
          settings?: Json
          show_powered_by?: boolean
          small_participation_display?: boolean
          tenant_id: string
          updated_at?: string
          vocabulary?: Json
        }
        Update: {
          allowed_media_providers?: string[]
          created_at?: string
          creator_share_bps?: number
          enabled_competition_types?: Database["public"]["Enums"]["competition_type"][]
          event_media_enabled?: boolean
          event_media_optional?: boolean
          external_media_links_enabled?: boolean
          footer_links?: Json
          inline_embeds_enabled?: boolean
          legal_links?: Json
          minimum_ranked_predictions?: number
          platform_share_bps?: number
          preferred_media_provider?: string | null
          providers?: Json
          sentiment_visibility?: Database["public"]["Enums"]["sentiment_visibility"]
          settings?: Json
          show_powered_by?: boolean
          small_participation_display?: boolean
          tenant_id?: string
          updated_at?: string
          vocabulary?: Json
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
      tenant_success_timeline: {
        Row: {
          category: string
          created_at: string
          dedupe_key: string
          description: string | null
          icon_key: string | null
          id: string
          is_pinned: boolean
          is_shareable_eligible: boolean
          metadata: Json
          occurred_at: string
          tenant_id: string
          title: string
          type: string
          visibility: string
        }
        Insert: {
          category: string
          created_at?: string
          dedupe_key: string
          description?: string | null
          icon_key?: string | null
          id?: string
          is_pinned?: boolean
          is_shareable_eligible?: boolean
          metadata?: Json
          occurred_at?: string
          tenant_id: string
          title: string
          type: string
          visibility?: string
        }
        Update: {
          category?: string
          created_at?: string
          dedupe_key?: string
          description?: string | null
          icon_key?: string | null
          id?: string
          is_pinned?: boolean
          is_shareable_eligible?: boolean
          metadata?: Json
          occurred_at?: string
          tenant_id?: string
          title?: string
          type?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_success_timeline_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_template_assignments: {
        Row: {
          applied_at: string
          applied_by: string | null
          created_at: string
          id: string
          snapshot: Json
          template_id: string
          template_version: number
          tenant_id: string
        }
        Insert: {
          applied_at?: string
          applied_by?: string | null
          created_at?: string
          id?: string
          snapshot: Json
          template_id: string
          template_version: number
          tenant_id: string
        }
        Update: {
          applied_at?: string
          applied_by?: string | null
          created_at?: string
          id?: string
          snapshot?: Json
          template_id?: string
          template_version?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_template_assignments_applied_by_fkey"
            columns: ["applied_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_template_assignments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "tenant_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_template_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_template_versions: {
        Row: {
          changelog: string | null
          configuration: Json
          created_at: string
          created_by: string | null
          engine_version: string
          id: string
          published_at: string | null
          seed_definition: Json | null
          template_id: string
          version: number
        }
        Insert: {
          changelog?: string | null
          configuration?: Json
          created_at?: string
          created_by?: string | null
          engine_version: string
          id?: string
          published_at?: string | null
          seed_definition?: Json | null
          template_id: string
          version: number
        }
        Update: {
          changelog?: string | null
          configuration?: Json
          created_at?: string
          created_by?: string | null
          engine_version?: string
          id?: string
          published_at?: string | null
          seed_definition?: Json | null
          template_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_template_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "tenant_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_templates: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          icon_key: string | null
          id: string
          key: string
          latest_version: number
          name: string
          preview_image_url: string | null
          status: Database["public"]["Enums"]["template_status"]
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon_key?: string | null
          id?: string
          key: string
          latest_version?: number
          name: string
          preview_image_url?: string | null
          status?: Database["public"]["Enums"]["template_status"]
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon_key?: string | null
          id?: string
          key?: string
          latest_version?: number
          name?: string
          preview_image_url?: string | null
          status?: Database["public"]["Enums"]["template_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_user_activity: {
        Row: {
          action_count: number
          activity_date: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action_count?: number
          activity_date: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action_count?: number
          activity_date?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_user_activity_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_user_activity_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
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
          engine_version: string
          icon_url: string | null
          id: string
          logo_url: string | null
          slug: string
          status: Database["public"]["Enums"]["tenant_status"]
          tagline: string | null
          template_id: string | null
          template_version: number | null
          theme: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_locale?: string
          default_timezone?: string
          description?: string | null
          display_name: string
          engine_version?: string
          icon_url?: string | null
          id?: string
          logo_url?: string | null
          slug: string
          status?: Database["public"]["Enums"]["tenant_status"]
          tagline?: string | null
          template_id?: string | null
          template_version?: number | null
          theme?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_locale?: string
          default_timezone?: string
          description?: string | null
          display_name?: string
          engine_version?: string
          icon_url?: string | null
          id?: string
          logo_url?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          tagline?: string | null
          template_id?: string | null
          template_version?: number | null
          theme?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "tenant_templates"
            referencedColumns: ["id"]
          },
        ]
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
      user_notification_preferences: {
        Row: {
          achievement_earned: boolean
          creator_billing: boolean
          email_enabled: boolean
          event_locking_soon: boolean
          event_published: boolean
          event_result: boolean
          in_app_enabled: boolean
          leaderboard_milestone: boolean
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          achievement_earned?: boolean
          creator_billing?: boolean
          email_enabled?: boolean
          event_locking_soon?: boolean
          event_published?: boolean
          event_result?: boolean
          in_app_enabled?: boolean
          leaderboard_milestone?: boolean
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          achievement_earned?: boolean
          creator_billing?: boolean
          email_enabled?: boolean
          event_locking_soon?: boolean
          event_published?: boolean
          event_result?: boolean
          in_app_enabled?: boolean
          leaderboard_milestone?: boolean
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notification_preferences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_notification_preferences_user_id_fkey"
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
          voided_predictions: number
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
          voided_predictions?: number
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
          voided_predictions?: number
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
      worker_leases: {
        Row: {
          acquired_at: string
          expires_at: string
          holder: string
          partition: string
        }
        Insert: {
          acquired_at?: string
          expires_at: string
          holder: string
          partition: string
        }
        Update: {
          acquired_at?: string
          expires_at?: string
          holder?: string
          partition?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acquire_worker_lease: {
        Args: { p_holder: string; p_partition: string; p_ttl_seconds?: number }
        Returns: boolean
      }
      advance_bracket: {
        Args: { p_event_id: string; p_winner_competitor_id: string }
        Returns: undefined
      }
      apply_billing_event: {
        Args: { p_event: Json; p_webhook_id: string }
        Returns: undefined
      }
      approve_creator_payout: { Args: { p_payout_id: string }; Returns: Json }
      assign_revenue_plan: {
        Args: {
          p_plan_key: string
          p_reason?: string
          p_tenant: string
          p_type: Database["public"]["Enums"]["plan_assignment_type"]
        }
        Returns: string
      }
      award_competition_prizes: {
        Args: { p_competition_id: string }
        Returns: number
      }
      cancel_draft_assignment: {
        Args: { p_assignment_id: string; p_reason: string }
        Returns: Json
      }
      claim_jobs: {
        Args: { p_limit?: number; p_tenant?: string }
        Returns: {
          attempts: number
          created_at: string
          dedup_key: string | null
          error: string | null
          finished_at: string | null
          id: string
          job_type: string
          max_attempts: number
          payload: Json
          run_at: string
          seq: number
          started_at: string | null
          status: string
          tenant_id: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "system_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      clear_plan_override: {
        Args: { p_reason: string; p_tenant: string }
        Returns: undefined
      }
      community_health_benchmarks: { Args: never; Returns: Json }
      community_health_now: {
        Args: { p_as_of?: string; p_tenant: string }
        Returns: Json
      }
      complete_job: { Args: { p_id: string }; Returns: undefined }
      create_billing_checkout: {
        Args: {
          p_billing_product_id: string
          p_competition_id: string
          p_creator_id: string
          p_draft_reservation_id: string
          p_idempotency_key: string
        }
        Returns: Json
      }
      create_bracket: {
        Args: { p_competition_id: string; p_structure: Json }
        Returns: undefined
      }
      create_event_with_market: {
        Args: {
          p_competition_id: string
          p_competitor_ids: string[]
          p_creator_id: string
          p_description: string
          p_locks_at: string
          p_market_question: string
          p_media?: Json
          p_publish: boolean
          p_slug: string
          p_starts_at: string
          p_title: string
        }
        Returns: Json
      }
      defer_job: {
        Args: { p_delay_seconds?: number; p_id: string; p_reason: string }
        Returns: undefined
      }
      detect_all_success_milestones: { Args: never; Returns: number }
      detect_success_milestones: { Args: { p_tenant: string }; Returns: number }
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
      effective_revenue_split: {
        Args: {
          p_creator: string
          p_tenant: string
          p_type: Database["public"]["Enums"]["billing_product_type"]
        }
        Returns: {
          creator_bps: number
          platform_bps: number
        }[]
      }
      enqueue_job: {
        Args: {
          p_dedup_key?: string
          p_job_type: string
          p_max_attempts?: number
          p_payload: Json
          p_run_at?: string
          p_tenant: string
        }
        Returns: string
      }
      evaluate_all_tenant_plans: { Args: never; Returns: number }
      evaluate_tenant_plan: { Args: { p_tenant: string }; Returns: string }
      expire_draft_reservations: { Args: never; Returns: number }
      fail_job: { Args: { p_error: string; p_id: string }; Returns: string }
      hot_path_indexes_ok: { Args: never; Returns: boolean }
      lock_due_markets: { Args: never; Returns: number }
      log_growth_change: {
        Args: {
          p_action: string
          p_entity_id: string
          p_entity_type: string
          p_metadata?: Json
          p_summary: string
        }
        Returns: undefined
      }
      mark_creator_payout_paid: {
        Args: { p_external_reference: string; p_payout_id: string }
        Returns: undefined
      }
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
      markets_sentiment: {
        Args: { p_market_ids: string[] }
        Returns: {
          display_order: number
          label: string
          market_id: string
          option_id: string
          total: number
          votes: number
        }[]
      }
      process_event_publish_fanout: {
        Args: { p_batch_size?: number; p_fanout_id: string }
        Returns: string
      }
      project_achievements: {
        Args: {
          p_event: string
          p_settlement_id: string
          p_tenant: string
          p_user: string
          p_version: number
        }
        Returns: string
      }
      project_draft_standings: {
        Args: {
          p_event: string
          p_settlement_id: string
          p_tenant: string
          p_version: number
        }
        Returns: string
      }
      project_event_publish_feed: {
        Args: { p_event: string; p_tenant: string }
        Returns: undefined
      }
      project_leaderboard_scope: {
        Args: {
          p_event: string
          p_scope: string
          p_scope_id: string
          p_settlement_id: string
          p_tenant: string
          p_version: number
        }
        Returns: string
      }
      project_settlement_feed: {
        Args: { p_event: string; p_tenant: string; p_version: number }
        Returns: boolean
      }
      project_settlement_notifications: {
        Args: { p_event: string; p_tenant: string; p_version: number }
        Returns: boolean
      }
      project_user_stats: {
        Args: {
          p_event: string
          p_settlement_id: string
          p_tenant: string
          p_user: string
          p_version: number
        }
        Returns: boolean
      }
      projection_health: {
        Args: {
          p_delay_warn_seconds?: number
          p_stuck_minutes?: number
          p_tenant: string
        }
        Returns: Json
      }
      projection_job_stats: {
        Args: { p_stuck_minutes?: number; p_tenant: string }
        Returns: Json
      }
      public_user_history: {
        Args: { p_tenant: string; p_user: string }
        Returns: {
          event_slug: string
          event_title: string
          option_label: string
          outcome: string
          submitted_at: string
        }[]
      }
      rebuild_draft_competition: {
        Args: { p_competition: string; p_tenant: string }
        Returns: undefined
      }
      rebuild_leaderboard_scope: {
        Args: { p_scope_id: string; p_scope_type: string; p_tenant: string }
        Returns: undefined
      }
      rebuild_tenant_draft_standings: {
        Args: { p_tenant: string }
        Returns: undefined
      }
      rebuild_tenant_leaderboards: {
        Args: { p_tenant: string }
        Returns: undefined
      }
      rebuild_user_achievements: {
        Args: { p_tenant: string; p_user: string }
        Returns: undefined
      }
      rebuild_user_statistics: {
        Args: { p_tenant: string; p_user: string }
        Returns: undefined
      }
      reconcile: {
        Args: {
          p_idempotency_key: string
          p_mode: Database["public"]["Enums"]["reconciliation_mode"]
          p_scope_id: string
          p_scope_type: Database["public"]["Enums"]["reconciliation_scope_type"]
          p_tenant: string
        }
        Returns: Json
      }
      record_event_positions: {
        Args: { p_event_id: string; p_positions: Json }
        Returns: Json
      }
      record_tenant_activity: { Args: { p_tenant: string }; Returns: undefined }
      regrade_event: {
        Args: {
          p_event_id: string
          p_idempotency_key: string
          p_reason: string
          p_resolution: string
          p_winning_competitor_id: string
          p_winning_option_ids?: string[]
        }
        Returns: Json
      }
      reject_creator_payout: {
        Args: { p_payout_id: string; p_reason: string }
        Returns: undefined
      }
      release_worker_lease: {
        Args: { p_holder: string; p_partition: string }
        Returns: undefined
      }
      requeue_actionable_jobs: {
        Args: { p_stuck_minutes?: number; p_tenant: string }
        Returns: number
      }
      set_billing_checkout_url: {
        Args: {
          p_checkout_id: string
          p_expires_at: string
          p_provider_checkout_id: string
          p_url: string
        }
        Returns: undefined
      }
      set_plan_override: {
        Args: { p_plan_key: string; p_reason: string; p_tenant: string }
        Returns: undefined
      }
      settle_event: {
        Args: {
          p_event_id: string
          p_idempotency_key: string
          p_notes: string
          p_resolution: string
          p_result_url: string
          p_winning_competitor_id: string
          p_winning_option_ids?: string[]
        }
        Returns: Json
      }
      skip_job: { Args: { p_id: string; p_reason: string }; Returns: undefined }
      snapshot_all_community_health: { Args: never; Returns: number }
      snapshot_community_health: {
        Args: { p_tenant: string }
        Returns: undefined
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
      tenant_wau_at: {
        Args: {
          p_from: string
          p_min_actions?: number
          p_sig_draft?: boolean
          p_sig_login?: boolean
          p_sig_pred?: boolean
          p_tenant: string
          p_to: string
        }
        Returns: number
      }
      tenant_wau_current: {
        Args: { p_as_of?: string; p_tenant: string }
        Returns: {
          current_wau: number
          previous_wau: number
          window_days: number
        }[]
      }
    }
    Enums: {
      billing_checkout_status:
        | "pending"
        | "open"
        | "completed"
        | "expired"
        | "failed"
      billing_entitlement_type:
        | "platform_premium"
        | "creator_supporter"
        | "paid_draft_access"
        | "premium_reward_period"
      billing_interval_type: "one_time" | "monthly" | "yearly"
      billing_order_status:
        | "paid"
        | "pending"
        | "partially_refunded"
        | "refunded"
        | "failed"
      billing_product_status: "active" | "inactive" | "archived"
      billing_product_type:
        | "platform_premium"
        | "creator_support"
        | "paid_competitor_draft"
      billing_provider_type: "lemon_squeezy" | "mock" | "manual" | "future"
      billing_refund_status: "pending" | "succeeded" | "failed"
      community_health_metric_status: "active" | "retired"
      competition_status:
        | "draft"
        | "scheduled"
        | "active"
        | "completed"
        | "canceled"
        | "archived"
      competition_type: "STANDALONE_EVENT" | "SEASON" | "TOURNAMENT" | "BRACKET"
      creator_earning_status:
        | "pending"
        | "available"
        | "held"
        | "reversed"
        | "paid"
      creator_earning_type:
        | "support_subscription"
        | "paid_draft"
        | "adjustment"
        | "reversal"
      creator_payout_status:
        | "requested"
        | "under_review"
        | "approved"
        | "rejected"
        | "paid"
        | "canceled"
      creator_verification_status:
        | "unsubmitted"
        | "pending"
        | "verified"
        | "rejected"
        | "suspended"
      domain_ssl_status:
        | "pending"
        | "provisioning"
        | "active"
        | "failed"
        | "disabled"
      domain_type: "platform" | "custom_subdomain" | "custom_apex"
      domain_verification_status: "pending" | "verified" | "failed" | "disabled"
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
      entitlement_source_type:
        | "subscription"
        | "order"
        | "prize_award"
        | "admin_grant"
      entitlement_status: "active" | "expired" | "revoked"
      event_media_type:
        | "livestream"
        | "video"
        | "event_page"
        | "social_post"
        | "other"
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
      fanout_status:
        | "pending"
        | "running"
        | "completed"
        | "failed"
        | "canceled"
        | "superseded"
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
        | "draft_opened"
        | "draft_closing_soon"
        | "draft_confirmed"
        | "draft_reservation_expiring"
        | "draft_payment_confirmed"
        | "draft_payment_failed"
        | "draft_competitor_earned_points"
        | "draft_rank_changed"
        | "draft_competition_completed"
        | "prize_awarded"
        | "prediction_updated"
        | "plan_upgraded"
        | "plan_at_risk"
        | "plan_recovered"
        | "plan_downgraded"
        | "health_band_improved"
        | "health_needs_attention"
        | "wau_milestone"
      option_status: "active" | "withdrawn" | "voided" | "winner" | "loser"
      plan_assignment_type:
        | "initial"
        | "automatic_upgrade"
        | "automatic_downgrade"
        | "manual"
      plan_qualification_status: "qualified" | "at_risk"
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
      provider_approval_status: "pending" | "approved" | "rejected" | "revoked"
      reconciliation_mode: "dry_run" | "repair" | "requeue"
      reconciliation_scope_type:
        | "user"
        | "event"
        | "settlement"
        | "competition"
        | "creator"
        | "season"
        | "tenant"
      reconciliation_status:
        | "pending"
        | "running"
        | "completed"
        | "completed_with_differences"
        | "failed"
        | "canceled"
      result_source_type:
        | "creator_manual"
        | "super_admin_manual"
        | "external_provider"
        | "webhook"
        | "future_adapter"
      revenue_plan_status: "active" | "manual" | "retired"
      sentiment_visibility: "always" | "after_prediction" | "after_lock"
      settlement_status:
        | "pending"
        | "active"
        | "reversed"
        | "superseded"
        | "failed"
      sponsorship_invoice_status:
        | "none"
        | "draft"
        | "sent"
        | "partial"
        | "paid"
        | "void"
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
      template_status: "draft" | "published" | "retired"
      tenant_status: "active" | "suspended" | "archived"
      user_status: "active" | "suspended" | "deleted"
      webhook_processing_status: "received" | "processed" | "failed" | "skipped"
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
      billing_checkout_status: [
        "pending",
        "open",
        "completed",
        "expired",
        "failed",
      ],
      billing_entitlement_type: [
        "platform_premium",
        "creator_supporter",
        "paid_draft_access",
        "premium_reward_period",
      ],
      billing_interval_type: ["one_time", "monthly", "yearly"],
      billing_order_status: [
        "paid",
        "pending",
        "partially_refunded",
        "refunded",
        "failed",
      ],
      billing_product_status: ["active", "inactive", "archived"],
      billing_product_type: [
        "platform_premium",
        "creator_support",
        "paid_competitor_draft",
      ],
      billing_provider_type: ["lemon_squeezy", "mock", "manual", "future"],
      billing_refund_status: ["pending", "succeeded", "failed"],
      community_health_metric_status: ["active", "retired"],
      competition_status: [
        "draft",
        "scheduled",
        "active",
        "completed",
        "canceled",
        "archived",
      ],
      competition_type: ["STANDALONE_EVENT", "SEASON", "TOURNAMENT", "BRACKET"],
      creator_earning_status: [
        "pending",
        "available",
        "held",
        "reversed",
        "paid",
      ],
      creator_earning_type: [
        "support_subscription",
        "paid_draft",
        "adjustment",
        "reversal",
      ],
      creator_payout_status: [
        "requested",
        "under_review",
        "approved",
        "rejected",
        "paid",
        "canceled",
      ],
      creator_verification_status: [
        "unsubmitted",
        "pending",
        "verified",
        "rejected",
        "suspended",
      ],
      domain_ssl_status: [
        "pending",
        "provisioning",
        "active",
        "failed",
        "disabled",
      ],
      domain_type: ["platform", "custom_subdomain", "custom_apex"],
      domain_verification_status: ["pending", "verified", "failed", "disabled"],
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
      entitlement_source_type: [
        "subscription",
        "order",
        "prize_award",
        "admin_grant",
      ],
      entitlement_status: ["active", "expired", "revoked"],
      event_media_type: [
        "livestream",
        "video",
        "event_page",
        "social_post",
        "other",
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
      fanout_status: [
        "pending",
        "running",
        "completed",
        "failed",
        "canceled",
        "superseded",
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
        "draft_opened",
        "draft_closing_soon",
        "draft_confirmed",
        "draft_reservation_expiring",
        "draft_payment_confirmed",
        "draft_payment_failed",
        "draft_competitor_earned_points",
        "draft_rank_changed",
        "draft_competition_completed",
        "prize_awarded",
        "prediction_updated",
        "plan_upgraded",
        "plan_at_risk",
        "plan_recovered",
        "plan_downgraded",
        "health_band_improved",
        "health_needs_attention",
        "wau_milestone",
      ],
      option_status: ["active", "withdrawn", "voided", "winner", "loser"],
      plan_assignment_type: [
        "initial",
        "automatic_upgrade",
        "automatic_downgrade",
        "manual",
      ],
      plan_qualification_status: ["qualified", "at_risk"],
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
      provider_approval_status: ["pending", "approved", "rejected", "revoked"],
      reconciliation_mode: ["dry_run", "repair", "requeue"],
      reconciliation_scope_type: [
        "user",
        "event",
        "settlement",
        "competition",
        "creator",
        "season",
        "tenant",
      ],
      reconciliation_status: [
        "pending",
        "running",
        "completed",
        "completed_with_differences",
        "failed",
        "canceled",
      ],
      result_source_type: [
        "creator_manual",
        "super_admin_manual",
        "external_provider",
        "webhook",
        "future_adapter",
      ],
      revenue_plan_status: ["active", "manual", "retired"],
      sentiment_visibility: ["always", "after_prediction", "after_lock"],
      settlement_status: [
        "pending",
        "active",
        "reversed",
        "superseded",
        "failed",
      ],
      sponsorship_invoice_status: [
        "none",
        "draft",
        "sent",
        "partial",
        "paid",
        "void",
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
      template_status: ["draft", "published", "retired"],
      tenant_status: ["active", "suspended", "archived"],
      user_status: ["active", "suspended", "deleted"],
      webhook_processing_status: ["received", "processed", "failed", "skipped"],
    },
  },
} as const

