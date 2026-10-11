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
      ad_placements: {
        Row: {
          advertiser: string | null
          body: string | null
          created_at: string
          cta_label: string | null
          ends_at: string | null
          id: string
          image_url: string | null
          is_active: boolean
          slot: string
          starts_at: string | null
          target_url: string | null
          title: string
          updated_at: string
          weight: number
        }
        Insert: {
          advertiser?: string | null
          body?: string | null
          created_at?: string
          cta_label?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          slot: string
          starts_at?: string | null
          target_url?: string | null
          title: string
          updated_at?: string
          weight?: number
        }
        Update: {
          advertiser?: string | null
          body?: string | null
          created_at?: string
          cta_label?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          slot?: string
          starts_at?: string | null
          target_url?: string | null
          title?: string
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      admin_allowlist: {
        Row: {
          created_at: string
          email: string
        }
        Insert: {
          created_at?: string
          email: string
        }
        Update: {
          created_at?: string
          email?: string
        }
        Relationships: []
      }
      announcements: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          title?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json
          target_id: string | null
          target_table: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata: Json
          target_id?: string | null
          target_table?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          target_id?: string | null
          target_table?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      challenges: {
        Row: {
          action: string
          code: string
          created_at: string
          description: string | null
          goal: number
          id: string
          is_active: boolean
          kind: string
          premium_only: boolean
          title: string
          xp_reward: number
        }
        Insert: {
          action: string
          code: string
          created_at?: string
          description?: string | null
          goal: number
          id?: string
          is_active?: boolean
          kind: string
          premium_only?: boolean
          title: string
          xp_reward: number
        }
        Update: {
          action?: string
          code?: string
          created_at?: string
          description?: string | null
          goal?: number
          id?: string
          is_active?: boolean
          kind?: string
          premium_only?: boolean
          title?: string
          xp_reward?: number
        }
        Relationships: []
      }
      dish_searches: {
        Row: {
          count: number
          name: string
          updated_at: string
        }
        Insert: {
          count?: number
          name: string
          updated_at?: string
        }
        Update: {
          count?: number
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          recipe_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          recipe_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          recipe_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          description: string | null
          enabled: boolean
          key: string
          rollout_percent: number
          updated_at: string
        }
        Insert: {
          description?: string | null
          enabled?: boolean
          key: string
          rollout_percent: number
          updated_at?: string
        }
        Update: {
          description?: string | null
          enabled?: boolean
          key?: string
          rollout_percent?: number
          updated_at?: string
        }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: []
      }
      grocery_items: {
        Row: {
          category: string | null
          checked: boolean
          created_at: string
          id: string
          name: string
          quantity: string | null
          recipe_id: string | null
          user_id: string
        }
        Insert: {
          category?: string | null
          checked?: boolean
          created_at?: string
          id?: string
          name: string
          quantity?: string | null
          recipe_id?: string | null
          user_id: string
        }
        Update: {
          category?: string | null
          checked?: boolean
          created_at?: string
          id?: string
          name?: string
          quantity?: string | null
          recipe_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grocery_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      hashtags: {
        Row: {
          created_at: string
          id: string
          tag: string
          usage_count: number
        }
        Insert: {
          created_at?: string
          id?: string
          tag: string
          usage_count?: number
        }
        Update: {
          created_at?: string
          id?: string
          tag?: string
          usage_count?: number
        }
        Relationships: []
      }
      image_search_cache: {
        Row: {
          cache_key: string
          created_at: string
          provider: string
          query: string
          results: Json
        }
        Insert: {
          cache_key: string
          created_at?: string
          provider: string
          query: string
          results?: Json
        }
        Update: {
          cache_key?: string
          created_at?: string
          provider?: string
          query?: string
          results?: Json
        }
        Relationships: []
      }
      meal_plans: {
        Row: {
          created_at: string
          custom_name: string | null
          id: string
          meal_type: string
          plan_date: string
          recipe_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_name?: string | null
          id?: string
          meal_type: string
          plan_date: string
          recipe_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          custom_name?: string | null
          id?: string
          meal_type?: string
          plan_date?: string
          recipe_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plans_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          branch_id: string | null
          category: string | null
          created_at: string
          description: string | null
          dietary_tags: string[]
          id: string
          image_url: string | null
          is_available: boolean
          is_hidden: boolean
          menu_id: string | null
          modifier_groups: Json
          name: string
          prep_time_minutes: number | null
          price: number
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          dietary_tags?: string[]
          id?: string
          image_url?: string | null
          is_available?: boolean
          is_hidden?: boolean
          menu_id?: string | null
          modifier_groups?: Json
          name: string
          prep_time_minutes?: number | null
          price: number
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          dietary_tags?: string[]
          id?: string
          image_url?: string | null
          is_available?: boolean
          is_hidden?: boolean
          menu_id?: string | null
          modifier_groups?: Json
          name?: string
          prep_time_minutes?: number | null
          price?: number
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "restaurant_menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_logs: {
        Row: {
          calories: number | null
          carbs_g: number | null
          created_at: string
          fat_g: number | null
          id: string
          logged_at: string
          meal_type: string | null
          name: string
          protein_g: number | null
          recipe_id: string | null
          servings: number
          updated_at: string
          user_id: string
        }
        Insert: {
          calories?: number | null
          carbs_g?: number | null
          created_at?: string
          fat_g?: number | null
          id?: string
          logged_at?: string
          meal_type?: string | null
          name: string
          protein_g?: number | null
          recipe_id?: string | null
          servings?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          calories?: number | null
          carbs_g?: number | null
          created_at?: string
          fat_g?: number | null
          id?: string
          logged_at?: string
          meal_type?: string | null
          name?: string
          protein_g?: number | null
          recipe_id?: string | null
          servings?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_logs_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          line_total: number | null
          menu_item_id: string | null
          modifiers: Json
          name: string
          notes: string | null
          order_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_total?: number | null
          menu_item_id?: string | null
          modifiers?: Json
          name: string
          notes?: string | null
          order_id: string
          quantity: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number | null
          menu_item_id?: string | null
          modifiers?: Json
          name?: string
          notes?: string | null
          order_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "restaurant_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      pantry_items: {
        Row: {
          category: string | null
          created_at: string
          expires_at: string | null
          id: string
          name: string
          quantity: string | null
          source: string | null
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          name: string
          quantity?: string | null
          source?: string | null
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          name?: string
          quantity?: string | null
          source?: string | null
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_usd: number | null
          created_at: string
          currency: string | null
          id: string
          kind: Database["public"]["Enums"]["payment_kind"]
          occurred_at: string
          raw: Json | null
          rc_event_id: string | null
          subscription_id: string | null
          user_id: string
        }
        Insert: {
          amount_usd?: number | null
          created_at?: string
          currency?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["payment_kind"]
          occurred_at?: string
          raw?: Json | null
          rc_event_id?: string | null
          subscription_id?: string | null
          user_id: string
        }
        Update: {
          amount_usd?: number | null
          created_at?: string
          currency?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["payment_kind"]
          occurred_at?: string
          raw?: Json | null
          rc_event_id?: string | null
          subscription_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      post_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          is_hidden: boolean
          like_count: number
          parent_comment_id: string | null
          post_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_hidden?: boolean
          like_count?: number
          parent_comment_id?: string | null
          post_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_hidden?: boolean
          like_count?: number
          parent_comment_id?: string | null
          post_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_hashtags: {
        Row: {
          hashtag_id: string
          post_id: string
        }
        Insert: {
          hashtag_id: string
          post_id: string
        }
        Update: {
          hashtag_id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_hashtags_hashtag_id_fkey"
            columns: ["hashtag_id"]
            isOneToOne: false
            referencedRelation: "hashtags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_hashtags_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_saves: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_saves_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          caption: string | null
          category: string | null
          comment_count: number
          created_at: string
          cuisine: string | null
          id: string
          ingredients: Json
          instructions: Json
          is_hidden: boolean
          like_count: number
          media_type: Database["public"]["Enums"]["media_type"] | null
          media_url: string | null
          post_type: Database["public"]["Enums"]["post_type"]
          recipe_id: string | null
          save_count: number
          share_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          caption?: string | null
          category?: string | null
          comment_count?: number
          created_at?: string
          cuisine?: string | null
          id?: string
          ingredients?: Json
          instructions?: Json
          is_hidden?: boolean
          like_count?: number
          media_type?: Database["public"]["Enums"]["media_type"] | null
          media_url?: string | null
          post_type?: Database["public"]["Enums"]["post_type"]
          recipe_id?: string | null
          save_count?: number
          share_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          caption?: string | null
          category?: string | null
          comment_count?: number
          created_at?: string
          cuisine?: string | null
          id?: string
          ingredients?: Json
          instructions?: Json
          is_hidden?: boolean
          like_count?: number
          media_type?: Database["public"]["Enums"]["media_type"] | null
          media_url?: string | null
          post_type?: Database["public"]["Enums"]["post_type"]
          recipe_id?: string | null
          save_count?: number
          share_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      premium_features: {
        Row: {
          created_at: string
          description: string | null
          key: string
          label: string
          min_tier: Database["public"]["Enums"]["subscription_tier"]
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          key: string
          label: string
          min_tier: Database["public"]["Enums"]["subscription_tier"]
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          key?: string
          label?: string
          min_tier?: Database["public"]["Enums"]["subscription_tier"]
          sort_order?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          activity_level: string | null
          age: number | null
          allergies: string[] | null
          avatar_url: string | null
          bio: string | null
          budget_per_day: number | null
          cover_image_url: string | null
          created_at: string
          currency: string
          dietary_preferences: string[] | null
          display_name: string | null
          family_size: number | null
          follower_count: number
          following_count: number
          goal: string | null
          height_cm: number | null
          id: string
          locale: string
          onboarding_completed: boolean
          post_count: number
          preferences: Json
          theme: string
          tour_completed: boolean
          updated_at: string
          username: string | null
          weight_kg: number | null
        }
        Insert: {
          activity_level?: string | null
          age?: number | null
          allergies?: string[] | null
          avatar_url?: string | null
          bio?: string | null
          budget_per_day?: number | null
          cover_image_url?: string | null
          created_at?: string
          currency?: string
          dietary_preferences?: string[] | null
          display_name?: string | null
          family_size?: number | null
          follower_count?: number
          following_count?: number
          goal?: string | null
          height_cm?: number | null
          id: string
          locale?: string
          onboarding_completed?: boolean
          post_count?: number
          preferences?: Json
          theme?: string
          tour_completed?: boolean
          updated_at?: string
          username?: string | null
          weight_kg?: number | null
        }
        Update: {
          activity_level?: string | null
          age?: number | null
          allergies?: string[] | null
          avatar_url?: string | null
          bio?: string | null
          budget_per_day?: number | null
          cover_image_url?: string | null
          created_at?: string
          currency?: string
          dietary_preferences?: string[] | null
          display_name?: string | null
          family_size?: number | null
          follower_count?: number
          following_count?: number
          goal?: string | null
          height_cm?: number | null
          id?: string
          locale?: string
          onboarding_completed?: boolean
          post_count?: number
          preferences?: Json
          theme?: string
          tour_completed?: boolean
          updated_at?: string
          username?: string | null
          weight_kg?: number | null
        }
        Relationships: []
      }
      promo_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          enabled: boolean
          expires_at: string | null
          id: string
          max_redemptions: number | null
          notes: string | null
          redemption_count: number
          reward_kind: Database["public"]["Enums"]["promo_reward_kind"]
          reward_value: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          expires_at?: string | null
          id?: string
          max_redemptions?: number | null
          notes?: string | null
          redemption_count?: number
          reward_kind?: Database["public"]["Enums"]["promo_reward_kind"]
          reward_value: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          expires_at?: string | null
          id?: string
          max_redemptions?: number | null
          notes?: string | null
          redemption_count?: number
          reward_kind?: Database["public"]["Enums"]["promo_reward_kind"]
          reward_value?: number
          updated_at?: string
        }
        Relationships: []
      }
      promo_redemptions: {
        Row: {
          code_id: string
          granted_days: number
          granted_lifetime: boolean
          id: string
          redeemed_at: string
          user_id: string
        }
        Insert: {
          code_id: string
          granted_days?: number
          granted_lifetime?: boolean
          id?: string
          redeemed_at?: string
          user_id: string
        }
        Update: {
          code_id?: string
          granted_days?: number
          granted_lifetime?: boolean
          id?: string
          redeemed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_redemptions_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_redemptions: {
        Row: {
          created_at: string
          discount_amount: number
          id: string
          order_id: string | null
          promotion_id: string
          restaurant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          discount_amount?: number
          id?: string
          order_id?: string | null
          promotion_id: string
          restaurant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          discount_amount?: number
          id?: string
          order_id?: string | null
          promotion_id?: string
          restaurant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "restaurant_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_redemptions_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "restaurant_promotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_redemptions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          bucket: string
          count: number
          created_at: string
          id: string
          identifier: string
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          created_at?: string
          id?: string
          identifier: string
          window_start: string
        }
        Update: {
          bucket?: string
          count?: number
          created_at?: string
          id?: string
          identifier?: string
          window_start?: string
        }
        Relationships: []
      }
      recently_viewed: {
        Row: {
          id: string
          recipe_id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          id?: string
          recipe_id: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          id?: string
          recipe_id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recently_viewed_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ratings: {
        Row: {
          created_at: string
          id: string
          rating: number
          recipe_id: string
          review: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          rating: number
          recipe_id: string
          review?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          rating?: number
          recipe_id?: string
          review?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ratings_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          avg_rating: number | null
          calories: number | null
          carbs_g: number | null
          category: string | null
          cooking_time_minutes: number | null
          country: string | null
          created_at: string
          created_by: string | null
          cuisine: string | null
          description: string | null
          diet_tags: string[] | null
          difficulty: string | null
          fat_g: number | null
          fun_fact: string | null
          id: string
          image_attribution: Json | null
          image_checked_at: string | null
          image_confidence: number | null
          image_locked: boolean
          image_query: string | null
          image_signature: string | null
          image_source: string | null
          image_url: string | null
          ingredients: Json
          is_featured: boolean | null
          meal_type: string | null
          name: string
          protein_g: number | null
          rating_count: number | null
          servings: number | null
          slug: string
          steps: Json
          updated_at: string
        }
        Insert: {
          avg_rating?: number | null
          calories?: number | null
          carbs_g?: number | null
          category?: string | null
          cooking_time_minutes?: number | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          cuisine?: string | null
          description?: string | null
          diet_tags?: string[] | null
          difficulty?: string | null
          fat_g?: number | null
          fun_fact?: string | null
          id?: string
          image_attribution?: Json | null
          image_checked_at?: string | null
          image_confidence?: number | null
          image_locked?: boolean
          image_query?: string | null
          image_signature?: string | null
          image_source?: string | null
          image_url?: string | null
          ingredients?: Json
          is_featured?: boolean | null
          meal_type?: string | null
          name: string
          protein_g?: number | null
          rating_count?: number | null
          servings?: number | null
          slug: string
          steps?: Json
          updated_at?: string
        }
        Update: {
          avg_rating?: number | null
          calories?: number | null
          carbs_g?: number | null
          category?: string | null
          cooking_time_minutes?: number | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          cuisine?: string | null
          description?: string | null
          diet_tags?: string[] | null
          difficulty?: string | null
          fat_g?: number | null
          fun_fact?: string | null
          id?: string
          image_attribution?: Json | null
          image_checked_at?: string | null
          image_confidence?: number | null
          image_locked?: boolean
          image_query?: string | null
          image_signature?: string | null
          image_source?: string | null
          image_url?: string | null
          ingredients?: Json
          is_featured?: boolean | null
          meal_type?: string | null
          name?: string
          protein_g?: number | null
          rating_count?: number | null
          servings?: number | null
          slug?: string
          steps?: Json
          updated_at?: string
        }
        Relationships: []
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          code: string
          created_at: string
          id: string
          referred_id: string
          referrer_id: string
          reward_days: number
          rewarded_at: string | null
          status: Database["public"]["Enums"]["referral_status"]
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          referred_id: string
          referrer_id: string
          reward_days?: number
          rewarded_at?: string | null
          status?: Database["public"]["Enums"]["referral_status"]
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          referred_id?: string
          referrer_id?: string
          reward_days?: number
          rewarded_at?: string | null
          status?: Database["public"]["Enums"]["referral_status"]
        }
        Relationships: []
      }
      restaurant_applications: {
        Row: {
          admin_notes: string | null
          applicant_id: string
          created_at: string
          id: string
          rejection_reason: string | null
          requested_changes: string | null
          restaurant_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["restaurant_approval_status"]
          submitted_data: Json
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          applicant_id: string
          created_at?: string
          id?: string
          rejection_reason?: string | null
          requested_changes?: string | null
          restaurant_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["restaurant_approval_status"]
          submitted_data: Json
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          applicant_id?: string
          created_at?: string
          id?: string
          rejection_reason?: string | null
          requested_changes?: string | null
          restaurant_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["restaurant_approval_status"]
          submitted_data?: Json
          updated_at?: string
        }
        Relationships: []
      }
      restaurant_locations: {
        Row: {
          address: string | null
          created_at: string
          delivery_estimate_minutes: number | null
          delivery_fee: number | null
          delivery_radius_km: number | null
          id: string
          is_accepting_orders: boolean
          is_active: boolean
          label: string | null
          latitude: number
          longitude: number
          min_order_amount: number | null
          opening_hours: Json
          phone: string | null
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          delivery_estimate_minutes?: number | null
          delivery_fee?: number | null
          delivery_radius_km?: number | null
          id?: string
          is_accepting_orders?: boolean
          is_active?: boolean
          label?: string | null
          latitude: number
          longitude: number
          min_order_amount?: number | null
          opening_hours?: Json
          phone?: string | null
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          delivery_estimate_minutes?: number | null
          delivery_fee?: number | null
          delivery_radius_km?: number | null
          id?: string
          is_accepting_orders?: boolean
          is_active?: boolean
          label?: string | null
          latitude?: number
          longitude?: number
          min_order_amount?: number | null
          opening_hours?: Json
          phone?: string | null
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_locations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_menus: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_menus_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_orders: {
        Row: {
          branch_id: string | null
          completed_at: string | null
          contact_phone: string | null
          created_at: string
          currency: string
          customer_id: string
          delivery_address: string | null
          delivery_fee: number
          discount_total: number
          fulfillment_type: Database["public"]["Enums"]["order_fulfillment_type"]
          id: string
          notes: string | null
          order_number: string
          paid_at: string | null
          payment_method: string
          payment_provider: string | null
          payment_reference: string | null
          payment_status: Database["public"]["Enums"]["order_payment_status"]
          placed_at: string
          promotion_code: string | null
          promotion_id: string | null
          rejection_reason: string | null
          restaurant_id: string
          status: Database["public"]["Enums"]["restaurant_order_status"]
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          completed_at?: string | null
          contact_phone?: string | null
          created_at?: string
          currency?: string
          customer_id: string
          delivery_address?: string | null
          delivery_fee: number
          discount_total?: number
          fulfillment_type?: Database["public"]["Enums"]["order_fulfillment_type"]
          id?: string
          notes?: string | null
          order_number: string
          paid_at?: string | null
          payment_method?: string
          payment_provider?: string | null
          payment_reference?: string | null
          payment_status?: Database["public"]["Enums"]["order_payment_status"]
          placed_at?: string
          promotion_code?: string | null
          promotion_id?: string | null
          rejection_reason?: string | null
          restaurant_id: string
          status?: Database["public"]["Enums"]["restaurant_order_status"]
          subtotal: number
          total: number
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          completed_at?: string | null
          contact_phone?: string | null
          created_at?: string
          currency?: string
          customer_id?: string
          delivery_address?: string | null
          delivery_fee?: number
          discount_total?: number
          fulfillment_type?: Database["public"]["Enums"]["order_fulfillment_type"]
          id?: string
          notes?: string | null
          order_number?: string
          paid_at?: string | null
          payment_method?: string
          payment_provider?: string | null
          payment_reference?: string | null
          payment_status?: Database["public"]["Enums"]["order_payment_status"]
          placed_at?: string
          promotion_code?: string | null
          promotion_id?: string | null
          rejection_reason?: string | null
          restaurant_id?: string
          status?: Database["public"]["Enums"]["restaurant_order_status"]
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_orders_promotion_fk"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "restaurant_promotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_promotions: {
        Row: {
          applicable_branch_ids: string[]
          applicable_menu_item_ids: string[]
          code: string | null
          created_at: string
          description: string | null
          ends_at: string | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["promotion_kind"]
          max_discount_amount: number | null
          min_order_amount: number
          restaurant_id: string
          starts_at: string | null
          title: string
          updated_at: string
          usage_count: number
          usage_limit_per_customer: number | null
          usage_limit_total: number | null
          value: number
        }
        Insert: {
          applicable_branch_ids?: string[]
          applicable_menu_item_ids?: string[]
          code?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["promotion_kind"]
          max_discount_amount?: number | null
          min_order_amount?: number
          restaurant_id: string
          starts_at?: string | null
          title: string
          updated_at?: string
          usage_count?: number
          usage_limit_per_customer?: number | null
          usage_limit_total?: number | null
          value?: number
        }
        Update: {
          applicable_branch_ids?: string[]
          applicable_menu_item_ids?: string[]
          code?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["promotion_kind"]
          max_discount_amount?: number | null
          min_order_amount?: number
          restaurant_id?: string
          starts_at?: string | null
          title?: string
          updated_at?: string
          usage_count?: number
          usage_limit_per_customer?: number | null
          usage_limit_total?: number | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_promotions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          rating: number
          restaurant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          rating: number
          restaurant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number
          restaurant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_reviews_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_staff: {
        Row: {
          created_at: string
          id: string
          restaurant_id: string
          role: Database["public"]["Enums"]["restaurant_staff_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          restaurant_id: string
          role?: Database["public"]["Enums"]["restaurant_staff_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          restaurant_id?: string
          role?: Database["public"]["Enums"]["restaurant_staff_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_staff_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          address: string | null
          approval_status: Database["public"]["Enums"]["restaurant_approval_status"]
          avg_rating: number | null
          business_registration: string | null
          cover_image_url: string | null
          created_at: string
          cuisine: string | null
          currency: string
          delivery_estimate_minutes: number | null
          delivery_fee: number | null
          delivery_radius_km: number
          description: string | null
          email: string | null
          food_photos: Json
          id: string
          is_accepting_orders: boolean
          is_demo: boolean
          is_verified: boolean
          logo_url: string | null
          min_order_amount: number | null
          name: string
          opening_hours: Json
          owner_id: string
          owner_name: string | null
          pause_message: string | null
          paused_until: string | null
          payment_info: Json
          phone: string | null
          price_range: string | null
          rating_count: number
          slug: string
          supports_delivery: boolean
          supports_pickup: boolean
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          approval_status?: Database["public"]["Enums"]["restaurant_approval_status"]
          avg_rating?: number | null
          business_registration?: string | null
          cover_image_url?: string | null
          created_at?: string
          cuisine?: string | null
          currency?: string
          delivery_estimate_minutes?: number | null
          delivery_fee?: number | null
          delivery_radius_km?: number
          description?: string | null
          email?: string | null
          food_photos?: Json
          id?: string
          is_accepting_orders?: boolean
          is_demo?: boolean
          is_verified?: boolean
          logo_url?: string | null
          min_order_amount?: number | null
          name: string
          opening_hours?: Json
          owner_id: string
          owner_name?: string | null
          pause_message?: string | null
          paused_until?: string | null
          payment_info?: Json
          phone?: string | null
          price_range?: string | null
          rating_count?: number
          slug: string
          supports_delivery?: boolean
          supports_pickup?: boolean
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          approval_status?: Database["public"]["Enums"]["restaurant_approval_status"]
          avg_rating?: number | null
          business_registration?: string | null
          cover_image_url?: string | null
          created_at?: string
          cuisine?: string | null
          currency?: string
          delivery_estimate_minutes?: number | null
          delivery_fee?: number | null
          delivery_radius_km?: number
          description?: string | null
          email?: string | null
          food_photos?: Json
          id?: string
          is_accepting_orders?: boolean
          is_demo?: boolean
          is_verified?: boolean
          logo_url?: string | null
          min_order_amount?: number | null
          name?: string
          opening_hours?: Json
          owner_id?: string
          owner_name?: string | null
          pause_message?: string | null
          paused_until?: string | null
          payment_info?: Json
          phone?: string | null
          price_range?: string | null
          rating_count?: number
          slug?: string
          supports_delivery?: boolean
          supports_pickup?: boolean
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      subscription_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          rc_event_id: string | null
          source: string
          subscription_id: string | null
          user_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload: Json
          processed_at?: string | null
          rc_event_id?: string | null
          source?: string
          subscription_id?: string | null
          user_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          rc_event_id?: string | null
          source?: string
          subscription_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          auto_renew: boolean
          cancelled_at: string | null
          created_at: string
          environment: string | null
          external_customer_id: string | null
          external_subscription_id: string | null
          id: string
          is_manual: boolean
          period_end: string | null
          period_start: string | null
          product_id: string | null
          rc_app_user_id: string | null
          rc_original_transaction_id: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          store: Database["public"]["Enums"]["subscription_store"]
          tier: Database["public"]["Enums"]["subscription_tier"]
          trial_end: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_renew?: boolean
          cancelled_at?: string | null
          created_at?: string
          environment?: string | null
          external_customer_id?: string | null
          external_subscription_id?: string | null
          id?: string
          is_manual?: boolean
          period_end?: string | null
          period_start?: string | null
          product_id?: string | null
          rc_app_user_id?: string | null
          rc_original_transaction_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          store: Database["public"]["Enums"]["subscription_store"]
          tier?: Database["public"]["Enums"]["subscription_tier"]
          trial_end?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_renew?: boolean
          cancelled_at?: string | null
          created_at?: string
          environment?: string | null
          external_customer_id?: string | null
          external_subscription_id?: string | null
          id?: string
          is_manual?: boolean
          period_end?: string | null
          period_start?: string | null
          product_id?: string | null
          rc_app_user_id?: string | null
          rc_original_transaction_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          store?: Database["public"]["Enums"]["subscription_store"]
          tier?: Database["public"]["Enums"]["subscription_tier"]
          trial_end?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      telemetry_events: {
        Row: {
          created_at: string
          error: string | null
          id: string
          kind: string
          latency_ms: number | null
          metadata: Json
          name: string
          success: boolean
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          kind: string
          latency_ms?: number | null
          metadata?: Json
          name: string
          success?: boolean
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          kind?: string
          latency_ms?: number | null
          metadata?: Json
          name?: string
          success?: boolean
          user_id?: string | null
        }
        Relationships: []
      }
      usage_limits: {
        Row: {
          count: number
          created_at: string
          feature: string
          feature_key: string
          id: string
          period_key: string
          period_start: string
          updated_at: string
          user_id: string
        }
        Insert: {
          count?: number
          created_at?: string
          feature: string
          feature_key: string
          id?: string
          period_key: string
          period_start: string
          updated_at?: string
          user_id: string
        }
        Update: {
          count?: number
          created_at?: string
          feature?: string
          feature_key?: string
          id?: string
          period_key?: string
          period_start?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          code: string
          created_at: string
          id: string
          unlocked_at: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          unlocked_at?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          unlocked_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_challenges: {
        Row: {
          challenge_id: string
          completed_at: string | null
          created_at: string
          id: string
          period_key: string
          progress: number
          updated_at: string
          user_id: string
        }
        Insert: {
          challenge_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          period_key: string
          progress?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          challenge_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          period_key?: string
          progress?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_challenges_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_stats: {
        Row: {
          created_at: string
          current_level: number
          current_streak: number
          elite_reward_claimed_at: string | null
          id: string
          last_active_date: string | null
          longest_streak: number
          total_xp: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_level?: number
          current_streak?: number
          elite_reward_claimed_at?: string | null
          id?: string
          last_active_date?: string | null
          longest_streak?: number
          total_xp?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_level?: number
          current_streak?: number
          elite_reward_claimed_at?: string | null
          id?: string
          last_active_date?: string | null
          longest_streak?: number
          total_xp?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      xp_events: {
        Row: {
          action: string
          created_at: string
          dedupe_key: string
          id: string
          metadata: Json
          points: number
          source_id: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          dedupe_key: string
          id?: string
          metadata?: Json
          points: number
          source_id?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          dedupe_key?: string
          id?: string
          metadata?: Json
          points?: number
          source_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_rate_limit: {
        Args: { _bucket: string; _identifier: string; _max_per_minute: number }
        Returns: boolean
      }
      consume_ai_credit: { Args: { _user_id: string }; Returns: Json }
      consume_image_credit: { Args: { _user_id: string }; Returns: Json }
      increment_dish_search: { Args: { _name: string }; Returns: number }
      is_premium: { Args: { _user_id: string }; Returns: boolean }
      my_ai_usage: { Args: never; Returns: Json }
      recalc_recipe_rating: { Args: { _recipe_id: string }; Returns: undefined }
      setting_int: { Args: { _default: number; _key: string }; Returns: number }
    }
    Enums: {
      app_role: "admin" | "user"
      media_type: "image" | "video"
      order_fulfillment_type: "delivery" | "pickup"
      order_payment_status:
        | "unpaid"
        | "pending"
        | "paid"
        | "failed"
        | "refunded"
      payment_kind: "initial" | "renewal" | "trial_conversion" | "refund"
      post_type: "recipe_share" | "photo" | "video" | "tip"
      promo_reward_kind:
        | "percent_discount"
        | "free_days"
        | "free_month"
        | "free_year"
        | "lifetime"
      promotion_kind:
        | "percent_off"
        | "amount_off"
        | "bogo"
        | "free_delivery"
        | "combo"
        | "first_order"
      referral_status: "pending" | "rewarded" | "void"
      restaurant_approval_status:
        | "pending"
        | "approved"
        | "rejected"
        | "suspended"
        | "changes_requested"
      restaurant_order_status:
        | "new"
        | "accepted"
        | "preparing"
        | "ready"
        | "out_for_delivery"
        | "completed"
        | "cancelled"
      restaurant_staff_role:
        | "owner"
        | "manager"
        | "staff"
        | "general_manager"
        | "chef"
        | "cashier"
        | "order_staff"
        | "analyst"
      subscription_status:
        | "trialing"
        | "active"
        | "in_grace"
        | "paused"
        | "expired"
        | "cancelled"
      subscription_store:
        | "app_store"
        | "play_store"
        | "stripe"
        | "promo"
        | "admin"
      subscription_tier: "free" | "monthly" | "annual" | "lifetime" | "promo"
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
      media_type: ["image", "video"],
      order_fulfillment_type: ["delivery", "pickup"],
      order_payment_status: ["unpaid", "pending", "paid", "failed", "refunded"],
      payment_kind: ["initial", "renewal", "trial_conversion", "refund"],
      post_type: ["recipe_share", "photo", "video", "tip"],
      promo_reward_kind: [
        "percent_discount",
        "free_days",
        "free_month",
        "free_year",
        "lifetime",
      ],
      promotion_kind: [
        "percent_off",
        "amount_off",
        "bogo",
        "free_delivery",
        "combo",
        "first_order",
      ],
      referral_status: ["pending", "rewarded", "void"],
      restaurant_approval_status: [
        "pending",
        "approved",
        "rejected",
        "suspended",
        "changes_requested",
      ],
      restaurant_order_status: [
        "new",
        "accepted",
        "preparing",
        "ready",
        "out_for_delivery",
        "completed",
        "cancelled",
      ],
      restaurant_staff_role: [
        "owner",
        "manager",
        "staff",
        "general_manager",
        "chef",
        "cashier",
        "order_staff",
        "analyst",
      ],
      subscription_status: [
        "trialing",
        "active",
        "in_grace",
        "paused",
        "expired",
        "cancelled",
      ],
      subscription_store: [
        "app_store",
        "play_store",
        "stripe",
        "promo",
        "admin",
      ],
      subscription_tier: ["free", "monthly", "annual", "lifetime", "promo"],
    },
  },
} as const
