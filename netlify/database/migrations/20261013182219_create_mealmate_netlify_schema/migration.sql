CREATE TYPE "app_role" AS ENUM('admin', 'user');--> statement-breakpoint
CREATE TYPE "media_type" AS ENUM('image', 'video');--> statement-breakpoint
CREATE TYPE "order_fulfillment_type" AS ENUM('delivery', 'pickup');--> statement-breakpoint
CREATE TYPE "order_payment_status" AS ENUM('unpaid', 'pending', 'paid', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "payment_kind" AS ENUM('initial', 'renewal', 'trial_conversion', 'refund');--> statement-breakpoint
CREATE TYPE "post_type" AS ENUM('recipe_share', 'photo', 'video', 'tip');--> statement-breakpoint
CREATE TYPE "promo_reward_kind" AS ENUM('percent_discount', 'free_days', 'free_month', 'free_year', 'lifetime');--> statement-breakpoint
CREATE TYPE "promotion_kind" AS ENUM('percent_off', 'amount_off', 'bogo', 'free_delivery', 'combo', 'first_order');--> statement-breakpoint
CREATE TYPE "referral_status" AS ENUM('pending', 'rewarded', 'void');--> statement-breakpoint
CREATE TYPE "restaurant_approval_status" AS ENUM('pending', 'approved', 'rejected', 'suspended', 'changes_requested');--> statement-breakpoint
CREATE TYPE "restaurant_order_status" AS ENUM('new', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "restaurant_staff_role" AS ENUM('owner', 'manager', 'staff');--> statement-breakpoint
CREATE TYPE "subscription_status" AS ENUM('trialing', 'active', 'in_grace', 'paused', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "subscription_store" AS ENUM('app_store', 'play_store', 'stripe', 'promo', 'admin');--> statement-breakpoint
CREATE TYPE "subscription_tier" AS ENUM('free', 'monthly', 'annual', 'lifetime', 'promo');--> statement-breakpoint
CREATE TABLE "auth_account" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_placements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"slot" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"image_url" text,
	"cta_label" text,
	"target_url" text,
	"advertiser" text,
	"weight" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_allowlist" (
	"email" text PRIMARY KEY,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"title" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"action" text NOT NULL,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"ip_address" text,
	"metadata" jsonb NOT NULL,
	"target_id" text,
	"target_table" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "auth_rate_limit" (
	"id" text PRIMARY KEY,
	"key" text NOT NULL UNIQUE,
	"count" integer NOT NULL,
	"last_request" numeric NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"action" text NOT NULL,
	"code" text NOT NULL UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"description" text,
	"goal" integer NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"is_active" boolean DEFAULT true NOT NULL,
	"kind" text NOT NULL,
	"premium_only" boolean DEFAULT false NOT NULL,
	"title" text NOT NULL,
	"xp_reward" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dish_searches" (
	"count" integer DEFAULT 0 NOT NULL,
	"name" text PRIMARY KEY,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"recipe_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "favorites_user_id_recipe_id_unique" UNIQUE("user_id","recipe_id")
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"description" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"key" text PRIMARY KEY,
	"rollout_percent" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"follower_id" uuid NOT NULL,
	"following_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	CONSTRAINT "follows_follower_id_following_id_unique" UNIQUE("follower_id","following_id")
);
--> statement-breakpoint
CREATE TABLE "grocery_items" (
	"category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"quantity" text,
	"recipe_id" uuid,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hashtags" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"tag" text NOT NULL UNIQUE,
	"usage_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "image_search_cache" (
	"cache_key" text PRIMARY KEY,
	"provider" text NOT NULL,
	"query" text NOT NULL,
	"results" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_plans" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"custom_name" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"meal_type" text NOT NULL,
	"plan_date" date NOT NULL,
	"recipe_id" uuid,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"description" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"image_url" text,
	"is_available" boolean DEFAULT true NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"menu_id" uuid,
	"name" text NOT NULL,
	"price" numeric NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dietary_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"modifier_groups" jsonb DEFAULT '[]' NOT NULL,
	"prep_time_minutes" integer,
	"branch_id" uuid
);
--> statement-breakpoint
CREATE TABLE "nutrition_logs" (
	"calories" integer,
	"carbs_g" numeric,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fat_g" numeric,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"meal_type" text,
	"name" text NOT NULL,
	"protein_g" numeric,
	"recipe_id" uuid,
	"servings" numeric DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"menu_item_id" uuid,
	"name" text NOT NULL,
	"notes" text,
	"order_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric NOT NULL,
	"modifiers" jsonb DEFAULT '[]' NOT NULL,
	"line_total" numeric
);
--> statement-breakpoint
CREATE TABLE "pantry_items" (
	"category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"quantity" text,
	"source" text,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"amount_usd" numeric,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"currency" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"kind" "payment_kind" DEFAULT 'initial'::"payment_kind" NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw" jsonb,
	"rc_event_id" text,
	"subscription_id" uuid,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_comments" (
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"is_hidden" boolean DEFAULT false NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"parent_comment_id" uuid,
	"post_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_hashtags" (
	"hashtag_id" uuid,
	"post_id" uuid,
	CONSTRAINT "post_hashtags_pkey" PRIMARY KEY("post_id","hashtag_id")
);
--> statement-breakpoint
CREATE TABLE "post_likes" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "post_likes_post_id_user_id_unique" UNIQUE("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "post_saves" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "post_saves_post_id_user_id_unique" UNIQUE("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"caption" text,
	"category" text,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cuisine" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"ingredients" jsonb DEFAULT '[]' NOT NULL,
	"instructions" jsonb DEFAULT '[]' NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"media_type" "media_type",
	"media_url" text,
	"post_type" "post_type" DEFAULT 'photo'::"post_type" NOT NULL,
	"recipe_id" uuid,
	"save_count" integer DEFAULT 0 NOT NULL,
	"share_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "premium_features" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"description" text,
	"key" text PRIMARY KEY,
	"label" text NOT NULL,
	"min_tier" "subscription_tier" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"activity_level" text,
	"age" numeric,
	"allergies" text[],
	"avatar_url" text,
	"bio" text,
	"budget_per_day" numeric,
	"cover_image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"dietary_preferences" text[],
	"display_name" text,
	"family_size" integer,
	"follower_count" integer DEFAULT 0 NOT NULL,
	"following_count" integer DEFAULT 0 NOT NULL,
	"goal" text,
	"height_cm" numeric,
	"id" uuid PRIMARY KEY,
	"locale" text DEFAULT 'en' NOT NULL,
	"post_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"username" text UNIQUE,
	"weight_kg" numeric,
	"preferences" jsonb DEFAULT '{}' NOT NULL,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"theme" text DEFAULT 'classic' NOT NULL,
	"tour_completed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promo_codes" (
	"code" text NOT NULL UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"enabled" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"max_redemptions" integer,
	"notes" text,
	"redemption_count" integer DEFAULT 0 NOT NULL,
	"reward_kind" "promo_reward_kind" DEFAULT 'free_days'::"promo_reward_kind" NOT NULL,
	"reward_value" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promo_redemptions" (
	"code_id" uuid NOT NULL,
	"granted_days" integer DEFAULT 0 NOT NULL,
	"granted_lifetime" boolean DEFAULT false NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "promo_redemptions_code_id_user_id_unique" UNIQUE("code_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "promotion_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"promotion_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"order_id" uuid,
	"user_id" uuid NOT NULL,
	"discount_amount" numeric DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"bucket" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"identifier" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_limits_bucket_identifier_window_start_unique" UNIQUE("bucket","identifier","window_start")
);
--> statement-breakpoint
CREATE TABLE "recently_viewed" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"recipe_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_ratings" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"rating" integer NOT NULL,
	"recipe_id" uuid NOT NULL,
	"review" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "recipe_ratings_user_id_recipe_id_unique" UNIQUE("user_id","recipe_id")
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"avg_rating" numeric,
	"calories" integer,
	"carbs_g" numeric,
	"category" text,
	"cooking_time_minutes" integer,
	"country" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"cuisine" text,
	"description" text,
	"diet_tags" text[],
	"difficulty" text,
	"fat_g" numeric,
	"fun_fact" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"image_url" text,
	"ingredients" jsonb DEFAULT '[]' NOT NULL,
	"is_featured" boolean DEFAULT false,
	"meal_type" text,
	"name" text NOT NULL,
	"protein_g" numeric,
	"rating_count" integer DEFAULT 0,
	"servings" integer DEFAULT 1,
	"slug" text NOT NULL UNIQUE,
	"steps" jsonb DEFAULT '[]' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"image_source" text,
	"image_query" text,
	"image_confidence" integer,
	"image_attribution" jsonb,
	"image_checked_at" timestamp with time zone,
	"image_signature" text,
	"image_locked" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referral_codes" (
	"code" text NOT NULL UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"referred_id" uuid NOT NULL,
	"referrer_id" uuid NOT NULL,
	"reward_days" integer DEFAULT 0 NOT NULL,
	"rewarded_at" timestamp with time zone,
	"status" "referral_status" DEFAULT 'pending'::"referral_status" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurant_applications" (
	"admin_notes" text,
	"applicant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"rejection_reason" text,
	"requested_changes" text,
	"restaurant_id" uuid,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"status" "restaurant_approval_status" DEFAULT 'pending'::"restaurant_approval_status" NOT NULL,
	"submitted_data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurant_locations" (
	"address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"label" text,
	"latitude" numeric NOT NULL,
	"longitude" numeric NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"phone" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_accepting_orders" boolean DEFAULT true NOT NULL,
	"opening_hours" jsonb DEFAULT '{}' NOT NULL,
	"delivery_fee" numeric,
	"min_order_amount" numeric,
	"delivery_radius_km" numeric,
	"delivery_estimate_minutes" integer
);
--> statement-breakpoint
CREATE TABLE "restaurant_menus" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"description" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"is_active" boolean DEFAULT true NOT NULL,
	"name" text NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurant_orders" (
	"completed_at" timestamp with time zone,
	"contact_phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"customer_id" uuid NOT NULL,
	"delivery_address" text,
	"delivery_fee" numeric NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"notes" text,
	"order_number" text NOT NULL UNIQUE,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"status" "restaurant_order_status" DEFAULT 'new'::"restaurant_order_status" NOT NULL,
	"subtotal" numeric NOT NULL,
	"total" numeric NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"branch_id" uuid,
	"fulfillment_type" "order_fulfillment_type" DEFAULT 'delivery'::"order_fulfillment_type" NOT NULL,
	"discount_total" numeric DEFAULT 0 NOT NULL,
	"promotion_id" uuid,
	"promotion_code" text,
	"payment_status" "order_payment_status" DEFAULT 'unpaid'::"order_payment_status" NOT NULL,
	"payment_provider" text,
	"payment_reference" text,
	"payment_method" text DEFAULT 'cash_on_delivery' NOT NULL,
	"paid_at" timestamp with time zone,
	"rejection_reason" text
);
--> statement-breakpoint
CREATE TABLE "restaurant_promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"restaurant_id" uuid NOT NULL,
	"code" text,
	"title" text NOT NULL,
	"description" text,
	"kind" "promotion_kind" NOT NULL,
	"value" numeric DEFAULT 0 NOT NULL,
	"min_order_amount" numeric DEFAULT 0 NOT NULL,
	"max_discount_amount" numeric,
	"applicable_menu_item_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"applicable_branch_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"usage_limit_total" integer,
	"usage_limit_per_customer" integer,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurant_reviews" (
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"rating" integer NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurant_staff" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"restaurant_id" uuid NOT NULL,
	"role" "restaurant_staff_role" DEFAULT 'staff'::"restaurant_staff_role" NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "restaurant_staff_user_id_restaurant_id_unique" UNIQUE("user_id","restaurant_id")
);
--> statement-breakpoint
CREATE TABLE "restaurants" (
	"approval_status" "restaurant_approval_status" DEFAULT 'pending'::"restaurant_approval_status" NOT NULL,
	"avg_rating" numeric,
	"cover_image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cuisine" text,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"delivery_estimate_minutes" integer,
	"delivery_fee" numeric,
	"description" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"is_accepting_orders" boolean DEFAULT true NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"logo_url" text,
	"min_order_amount" numeric,
	"name" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"price_range" text,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"slug" text NOT NULL UNIQUE,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pause_message" text,
	"paused_until" timestamp with time zone,
	"supports_pickup" boolean DEFAULT true NOT NULL,
	"supports_delivery" boolean DEFAULT true NOT NULL,
	"owner_name" text,
	"phone" text,
	"email" text,
	"whatsapp" text,
	"address" text,
	"business_registration" text,
	"delivery_radius_km" numeric DEFAULT 10 NOT NULL,
	"opening_hours" jsonb DEFAULT '{}' NOT NULL,
	"food_photos" jsonb DEFAULT '[]' NOT NULL,
	"payment_info" jsonb DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_session" (
	"id" text PRIMARY KEY,
	"token" text NOT NULL UNIQUE,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "subscription_events" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_type" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"rc_event_id" text UNIQUE,
	"user_id" uuid,
	"source" text DEFAULT 'system' NOT NULL,
	"actor_id" uuid,
	"subscription_id" uuid
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"external_customer_id" text,
	"external_subscription_id" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"period_end" timestamp with time zone,
	"period_start" timestamp with time zone,
	"product_id" text,
	"status" "subscription_status" DEFAULT 'trialing'::"subscription_status" NOT NULL,
	"store" "subscription_store" NOT NULL,
	"tier" "subscription_tier" DEFAULT 'free'::"subscription_tier" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"trial_end" timestamp with time zone,
	"auto_renew" boolean DEFAULT false NOT NULL,
	"is_manual" boolean DEFAULT false NOT NULL,
	"cancelled_at" timestamp with time zone,
	"environment" text,
	"rc_app_user_id" text,
	"rc_original_transaction_id" text
);
--> statement-breakpoint
CREATE TABLE "telemetry_events" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"kind" text NOT NULL,
	"latency_ms" integer,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"name" text NOT NULL,
	"success" boolean DEFAULT true NOT NULL,
	"user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "usage_limits" (
	"count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"feature" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"period_start" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"feature_key" text NOT NULL,
	"period_key" text NOT NULL,
	CONSTRAINT "usage_limits_user_id_feature_period_start_unique" UNIQUE("user_id","feature","period_start")
);
--> statement-breakpoint
CREATE TABLE "auth_user" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "user_achievements_user_id_code_unique" UNIQUE("user_id","code")
);
--> statement-breakpoint
CREATE TABLE "user_challenges" (
	"challenge_id" uuid NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"progress" integer DEFAULT 0 NOT NULL,
	"user_id" uuid NOT NULL,
	"period_key" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_challenges_user_id_challenge_id_unique" UNIQUE("user_id","challenge_id")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"role" "app_role" NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "user_roles_user_id_role_unique" UNIQUE("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "user_stats" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"current_level" integer DEFAULT 1 NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"total_xp" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL UNIQUE,
	"last_active_date" text,
	"elite_reward_claimed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "auth_verification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xp_events" (
	"action" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"points" integer NOT NULL,
	"source_id" text,
	"user_id" uuid NOT NULL,
	"dedupe_key" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_user_id_auth_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_auth_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_user"("id") ON DELETE CASCADE;