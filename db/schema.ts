import { sql } from "drizzle-orm";
import { pgTable, pgEnum, uuid, text, integer, numeric, boolean, jsonb, timestamp, date, primaryKey, unique } from "drizzle-orm/pg-core";

export const app_role = pgEnum("app_role", ["admin","user"]);
export const media_type = pgEnum("media_type", ["image","video"]);
export const payment_kind = pgEnum("payment_kind", ["initial","renewal","trial_conversion","refund"]);
export const post_type = pgEnum("post_type", ["recipe_share","photo","video","tip"]);
export const promo_reward_kind = pgEnum("promo_reward_kind", ["percent_discount","free_days","free_month","free_year","lifetime"]);
export const referral_status = pgEnum("referral_status", ["pending","rewarded","void"]);
export const restaurant_approval_status = pgEnum("restaurant_approval_status", ["pending","approved","rejected","suspended","changes_requested"]);
export const restaurant_order_status = pgEnum("restaurant_order_status", ["new","accepted","preparing","ready","out_for_delivery","completed","cancelled"]);
export const restaurant_staff_role = pgEnum("restaurant_staff_role", ["owner","manager","staff"]);
export const subscription_status = pgEnum("subscription_status", ["trialing","active","in_grace","paused","expired","cancelled"]);
export const subscription_store = pgEnum("subscription_store", ["app_store","play_store","stripe","promo","admin","web"]);
export const subscription_tier = pgEnum("subscription_tier", ["free","monthly","annual","lifetime","promo","premium"]);
export const order_payment_status = pgEnum("order_payment_status", ["unpaid","pending","paid","failed","refunded"]);
export const order_fulfillment_type = pgEnum("order_fulfillment_type", ["delivery","pickup"]);
export const promotion_kind = pgEnum("promotion_kind", ["percent_off","amount_off","bogo","free_delivery","combo","first_order"]);

export const announcements = pgTable("announcements", {
  body: text("body").notNull(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  created_by: uuid("created_by"),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
});

export const audit_logs = pgTable("audit_logs", {
  action: text("action").notNull(),
  actor_id: uuid("actor_id"),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ip_address: text("ip_address"),
  metadata: jsonb("metadata").notNull(),
  target_id: text("target_id"),
  target_table: text("target_table"),
  user_agent: text("user_agent"),
});

export const challenges = pgTable("challenges", {
  action: text("action").notNull(),
  code: text("code").notNull().unique(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  description: text("description"),
  goal: integer("goal").notNull(),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  is_active: boolean("is_active").notNull().default(sql`true`),
  kind: text("kind").notNull(),
  premium_only: boolean("premium_only").notNull().default(sql`false`),
  title: text("title").notNull(),
  xp_reward: integer("xp_reward").notNull(),
});

export const dish_searches = pgTable("dish_searches", {
  count: integer("count").notNull().default(sql`0`),
  name: text("name").primaryKey(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
});

export const recipes = pgTable("recipes", {
  avg_rating: numeric("avg_rating"),
  calories: integer("calories"),
  carbs_g: numeric("carbs_g"),
  category: text("category"),
  cooking_time_minutes: integer("cooking_time_minutes"),
  country: text("country"),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  created_by: uuid("created_by"),
  cuisine: text("cuisine"),
  description: text("description"),
  diet_tags: text("diet_tags").array(),
  difficulty: text("difficulty"),
  fat_g: numeric("fat_g"),
  fun_fact: text("fun_fact"),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  image_url: text("image_url"),
  ingredients: jsonb("ingredients").notNull().default(sql`'[]'::jsonb`),
  is_featured: boolean("is_featured").default(sql`false`),
  meal_type: text("meal_type"),
  name: text("name").notNull(),
  protein_g: numeric("protein_g"),
  rating_count: integer("rating_count").default(sql`0`),
  servings: integer("servings").default(sql`1`),
  slug: text("slug").notNull().unique(),
  steps: jsonb("steps").notNull().default(sql`'[]'::jsonb`),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  image_source: text("image_source"),
  image_query: text("image_query"),
  image_confidence: integer("image_confidence"),
  image_attribution: jsonb("image_attribution"),
  image_checked_at: timestamp("image_checked_at", { withTimezone: true, mode: "string" }),
  image_signature: text("image_signature"),
  image_locked: boolean("image_locked").notNull().default(sql`false`),
});

export const profiles = pgTable("profiles", {
  activity_level: text("activity_level"),
  age: numeric("age"),
  allergies: text("allergies").array(),
  avatar_url: text("avatar_url"),
  bio: text("bio"),
  budget_per_day: numeric("budget_per_day"),
  cover_image_url: text("cover_image_url"),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  currency: text("currency").notNull().default(sql`'ZAR'`),
  dietary_preferences: text("dietary_preferences").array(),
  display_name: text("display_name"),
  family_size: integer("family_size"),
  follower_count: integer("follower_count").notNull().default(sql`0`),
  following_count: integer("following_count").notNull().default(sql`0`),
  goal: text("goal"),
  height_cm: numeric("height_cm"),
  id: uuid("id").primaryKey(),
  locale: text("locale").notNull().default(sql`'en'`),
  post_count: integer("post_count").notNull().default(sql`0`),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  username: text("username").unique(),
  weight_kg: numeric("weight_kg"),
  preferences: jsonb("preferences").notNull().default(sql`'{}'::jsonb`),
  onboarding_completed: boolean("onboarding_completed").notNull().default(sql`false`),
  theme: text("theme").notNull().default(sql`'classic'`),
  tour_completed: boolean("tour_completed").notNull().default(sql`false`),
});

export const user_roles = pgTable("user_roles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  role: app_role("role").notNull(),
  user_id: uuid("user_id").notNull(),
}, (table) => [unique().on(table.user_id, table.role)]);

export const favorites = pgTable("favorites", {
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  recipe_id: uuid("recipe_id").notNull(),
  user_id: uuid("user_id").notNull(),
}, (table) => [unique().on(table.user_id, table.recipe_id)]);

export const grocery_items = pgTable("grocery_items", {
  category: text("category"),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  quantity: text("quantity"),
  recipe_id: uuid("recipe_id"),
  user_id: uuid("user_id").notNull(),
});

export const meal_plans = pgTable("meal_plans", {
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  custom_name: text("custom_name"),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  meal_type: text("meal_type").notNull(),
  plan_date: date("plan_date").notNull(),
  recipe_id: uuid("recipe_id"),
  user_id: uuid("user_id").notNull(),
});

export const nutrition_logs = pgTable("nutrition_logs", {
  calories: integer("calories"),
  carbs_g: numeric("carbs_g"),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  fat_g: numeric("fat_g"),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  logged_at: timestamp("logged_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  meal_type: text("meal_type"),
  name: text("name").notNull(),
  protein_g: numeric("protein_g"),
  recipe_id: uuid("recipe_id"),
  servings: numeric("servings").notNull().default(sql`1`),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  user_id: uuid("user_id").notNull(),
});

export const pantry_items = pgTable("pantry_items", {
  category: text("category"),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  expires_at: timestamp("expires_at", { withTimezone: true, mode: "string" }),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  quantity: text("quantity"),
  source: text("source"),
  user_id: uuid("user_id").notNull(),
});

export const recently_viewed = pgTable("recently_viewed", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  recipe_id: uuid("recipe_id").notNull(),
  user_id: uuid("user_id").notNull(),
  viewed_at: timestamp("viewed_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
});

export const recipe_ratings = pgTable("recipe_ratings", {
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  rating: integer("rating").notNull(),
  recipe_id: uuid("recipe_id").notNull(),
  review: text("review"),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  user_id: uuid("user_id").notNull(),
}, (table) => [unique().on(table.user_id, table.recipe_id)]);

export const feature_flags = pgTable("feature_flags", {
  description: text("description"),
  enabled: boolean("enabled").notNull().default(sql`true`),
  key: text("key").primaryKey(),
  rollout_percent: integer("rollout_percent").notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
});

export const premium_features = pgTable("premium_features", {
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  description: text("description"),
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  min_tier: subscription_tier("min_tier").notNull(),
  sort_order: integer("sort_order").notNull().default(sql`0`),
});

export const rate_limits = pgTable("rate_limits", {
  bucket: text("bucket").notNull(),
  count: integer("count").notNull().default(sql`0`),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  identifier: text("identifier").notNull(),
  window_start: timestamp("window_start", { withTimezone: true, mode: "string" }).notNull(),
}, (table) => [unique().on(table.bucket, table.identifier, table.window_start)]);

export const restaurants = pgTable("restaurants", {
  approval_status: restaurant_approval_status("approval_status").notNull().default(sql`'pending'`),
  avg_rating: numeric("avg_rating"),
  cover_image_url: text("cover_image_url"),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  cuisine: text("cuisine"),
  currency: text("currency").notNull().default(sql`'ZAR'`),
  delivery_estimate_minutes: integer("delivery_estimate_minutes"),
  delivery_fee: numeric("delivery_fee"),
  description: text("description"),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  is_accepting_orders: boolean("is_accepting_orders").notNull().default(sql`true`),
  is_demo: boolean("is_demo").notNull().default(sql`false`),
  is_verified: boolean("is_verified").notNull().default(sql`false`),
  logo_url: text("logo_url"),
  min_order_amount: numeric("min_order_amount"),
  name: text("name").notNull(),
  owner_id: uuid("owner_id").notNull(),
  price_range: text("price_range"),
  rating_count: integer("rating_count").notNull().default(sql`0`),
  slug: text("slug").notNull().unique(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  pause_message: text("pause_message"),
  paused_until: timestamp("paused_until", { withTimezone: true, mode: "string" }),
  supports_pickup: boolean("supports_pickup").notNull().default(sql`true`),
  supports_delivery: boolean("supports_delivery").notNull().default(sql`true`),
  owner_name: text("owner_name"),
  phone: text("phone"),
  email: text("email"),
  whatsapp: text("whatsapp"),
  address: text("address"),
  business_registration: text("business_registration"),
  delivery_radius_km: numeric("delivery_radius_km").notNull().default(sql`10`),
  opening_hours: jsonb("opening_hours").notNull().default(sql`'{}'::jsonb`),
  food_photos: jsonb("food_photos").notNull().default(sql`'[]'::jsonb`),
  payment_info: jsonb("payment_info").notNull().default(sql`'{}'::jsonb`),
});

export const restaurant_locations = pgTable("restaurant_locations", {
  address: text("address"),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  label: text("label"),
  latitude: numeric("latitude").notNull(),
  longitude: numeric("longitude").notNull(),
  restaurant_id: uuid("restaurant_id").notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  phone: text("phone"),
  is_active: boolean("is_active").notNull().default(sql`true`),
  is_accepting_orders: boolean("is_accepting_orders").notNull().default(sql`true`),
  opening_hours: jsonb("opening_hours").notNull().default(sql`'{}'::jsonb`),
  delivery_fee: numeric("delivery_fee"),
  min_order_amount: numeric("min_order_amount"),
  delivery_radius_km: numeric("delivery_radius_km"),
  delivery_estimate_minutes: integer("delivery_estimate_minutes"),
});

export const restaurant_menus = pgTable("restaurant_menus", {
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  description: text("description"),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  is_active: boolean("is_active").notNull().default(sql`true`),
  name: text("name").notNull(),
  restaurant_id: uuid("restaurant_id").notNull(),
  sort_order: integer("sort_order").notNull().default(sql`0`),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
});

export const menu_items = pgTable("menu_items", {
  category: text("category"),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  description: text("description"),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  image_url: text("image_url"),
  is_available: boolean("is_available").notNull().default(sql`true`),
  is_hidden: boolean("is_hidden").notNull().default(sql`false`),
  menu_id: uuid("menu_id"),
  name: text("name").notNull(),
  price: numeric("price").notNull(),
  restaurant_id: uuid("restaurant_id").notNull(),
  sort_order: integer("sort_order").notNull().default(sql`0`),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  dietary_tags: text("dietary_tags").array().notNull().default(sql`'{}'`),
  modifier_groups: jsonb("modifier_groups").notNull().default(sql`'[]'::jsonb`),
  prep_time_minutes: integer("prep_time_minutes"),
  branch_id: uuid("branch_id"),
});

export const restaurant_staff = pgTable("restaurant_staff", {
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  restaurant_id: uuid("restaurant_id").notNull(),
  role: restaurant_staff_role("role").notNull().default(sql`'staff'`),
  user_id: uuid("user_id").notNull(),
}, (table) => [unique().on(table.user_id, table.restaurant_id)]);

export const restaurant_orders = pgTable("restaurant_orders", {
  completed_at: timestamp("completed_at", { withTimezone: true, mode: "string" }),
  contact_phone: text("contact_phone"),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  currency: text("currency").notNull().default(sql`'ZAR'`),
  customer_id: uuid("customer_id").notNull(),
  delivery_address: text("delivery_address"),
  delivery_fee: numeric("delivery_fee").notNull(),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  notes: text("notes"),
  order_number: text("order_number").notNull().unique(),
  placed_at: timestamp("placed_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  restaurant_id: uuid("restaurant_id").notNull(),
  status: restaurant_order_status("status").notNull().default(sql`'new'`),
  subtotal: numeric("subtotal").notNull(),
  total: numeric("total").notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  branch_id: uuid("branch_id"),
  fulfillment_type: order_fulfillment_type("fulfillment_type").notNull().default(sql`'delivery'`),
  discount_total: numeric("discount_total").notNull().default(sql`0`),
  promotion_id: uuid("promotion_id"),
  promotion_code: text("promotion_code"),
  payment_status: order_payment_status("payment_status").notNull().default(sql`'unpaid'`),
  payment_provider: text("payment_provider"),
  payment_reference: text("payment_reference"),
  payment_method: text("payment_method").notNull().default(sql`'cash_on_delivery'`),
  paid_at: timestamp("paid_at", { withTimezone: true, mode: "string" }),
  rejection_reason: text("rejection_reason"),
});

export const order_items = pgTable("order_items", {
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  menu_item_id: uuid("menu_item_id"),
  name: text("name").notNull(),
  notes: text("notes"),
  order_id: uuid("order_id").notNull(),
  quantity: integer("quantity").notNull(),
  unit_price: numeric("unit_price").notNull(),
  modifiers: jsonb("modifiers").notNull().default(sql`'[]'::jsonb`),
  line_total: numeric("line_total"),
});

export const restaurant_applications = pgTable("restaurant_applications", {
  admin_notes: text("admin_notes"),
  applicant_id: uuid("applicant_id").notNull(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  rejection_reason: text("rejection_reason"),
  requested_changes: text("requested_changes"),
  restaurant_id: uuid("restaurant_id"),
  reviewed_at: timestamp("reviewed_at", { withTimezone: true, mode: "string" }),
  reviewed_by: uuid("reviewed_by"),
  status: restaurant_approval_status("status").notNull().default(sql`'pending'`),
  submitted_data: jsonb("submitted_data").notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
});

export const restaurant_reviews = pgTable("restaurant_reviews", {
  comment: text("comment"),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  rating: integer("rating").notNull(),
  restaurant_id: uuid("restaurant_id").notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  user_id: uuid("user_id").notNull(),
});

export const subscriptions = pgTable("subscriptions", {
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  external_customer_id: text("external_customer_id"),
  external_subscription_id: text("external_subscription_id"),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  period_end: timestamp("period_end", { withTimezone: true, mode: "string" }),
  period_start: timestamp("period_start", { withTimezone: true, mode: "string" }),
  product_id: text("product_id"),
  status: subscription_status("status").notNull().default(sql`'trialing'`),
  store: subscription_store("store").notNull(),
  tier: subscription_tier("tier").notNull().default(sql`'free'`),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  user_id: uuid("user_id").notNull(),
  trial_end: timestamp("trial_end", { withTimezone: true, mode: "string" }),
  auto_renew: boolean("auto_renew").notNull().default(sql`false`),
  is_manual: boolean("is_manual").notNull().default(sql`false`),
  cancelled_at: timestamp("cancelled_at", { withTimezone: true, mode: "string" }),
  environment: text("environment"),
  rc_app_user_id: text("rc_app_user_id"),
  rc_original_transaction_id: text("rc_original_transaction_id"),
});

export const payments = pgTable("payments", {
  amount_usd: numeric("amount_usd"),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  currency: text("currency"),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  kind: payment_kind("kind").notNull().default(sql`'initial'`),
  occurred_at: timestamp("occurred_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  raw: jsonb("raw"),
  rc_event_id: text("rc_event_id"),
  subscription_id: uuid("subscription_id"),
  user_id: uuid("user_id").notNull(),
});

export const subscription_events = pgTable("subscription_events", {
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  event_type: text("event_type").notNull(),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  payload: jsonb("payload").notNull(),
  processed_at: timestamp("processed_at", { withTimezone: true, mode: "string" }),
  rc_event_id: text("rc_event_id").unique(),
  user_id: uuid("user_id"),
  source: text("source").notNull().default(sql`'system'`),
  actor_id: uuid("actor_id"),
  subscription_id: uuid("subscription_id"),
});

export const usage_limits = pgTable("usage_limits", {
  count: integer("count").notNull().default(sql`0`),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  feature: text("feature").notNull(),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  period_start: timestamp("period_start", { withTimezone: true, mode: "string" }).notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  user_id: uuid("user_id").notNull(),
  feature_key: text("feature_key").notNull(),
  period_key: text("period_key").notNull(),
}, (table) => [unique().on(table.user_id, table.feature, table.period_start)]);

export const follows = pgTable("follows", {
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  follower_id: uuid("follower_id").notNull(),
  following_id: uuid("following_id").notNull(),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
}, (table) => [unique().on(table.follower_id, table.following_id)]);

export const hashtags = pgTable("hashtags", {
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tag: text("tag").notNull().unique(),
  usage_count: integer("usage_count").notNull().default(sql`0`),
});

export const posts = pgTable("posts", {
  caption: text("caption"),
  category: text("category"),
  comment_count: integer("comment_count").notNull().default(sql`0`),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  cuisine: text("cuisine"),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ingredients: jsonb("ingredients").notNull().default(sql`'[]'::jsonb`),
  instructions: jsonb("instructions").notNull().default(sql`'[]'::jsonb`),
  is_hidden: boolean("is_hidden").notNull().default(sql`false`),
  like_count: integer("like_count").notNull().default(sql`0`),
  media_type: media_type("media_type"),
  media_url: text("media_url"),
  post_type: post_type("post_type").notNull().default(sql`'photo'`),
  recipe_id: uuid("recipe_id"),
  save_count: integer("save_count").notNull().default(sql`0`),
  share_count: integer("share_count").notNull().default(sql`0`),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  user_id: uuid("user_id").notNull(),
});

export const post_comments = pgTable("post_comments", {
  content: text("content").notNull(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  is_hidden: boolean("is_hidden").notNull().default(sql`false`),
  like_count: integer("like_count").notNull().default(sql`0`),
  parent_comment_id: uuid("parent_comment_id"),
  post_id: uuid("post_id").notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  user_id: uuid("user_id").notNull(),
});

export const post_hashtags = pgTable("post_hashtags", {
  hashtag_id: uuid("hashtag_id").notNull(),
  post_id: uuid("post_id").notNull(),
}, (table) => [primaryKey({ columns: [table.post_id, table.hashtag_id] })]);

export const post_likes = pgTable("post_likes", {
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  post_id: uuid("post_id").notNull(),
  user_id: uuid("user_id").notNull(),
}, (table) => [unique().on(table.post_id, table.user_id)]);

export const post_saves = pgTable("post_saves", {
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  post_id: uuid("post_id").notNull(),
  user_id: uuid("user_id").notNull(),
}, (table) => [unique().on(table.post_id, table.user_id)]);

export const promo_codes = pgTable("promo_codes", {
  code: text("code").notNull().unique(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  created_by: uuid("created_by"),
  enabled: boolean("enabled").notNull().default(sql`true`),
  expires_at: timestamp("expires_at", { withTimezone: true, mode: "string" }),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  max_redemptions: integer("max_redemptions"),
  notes: text("notes"),
  redemption_count: integer("redemption_count").notNull().default(sql`0`),
  reward_kind: promo_reward_kind("reward_kind").notNull().default(sql`'free_days'`),
  reward_value: integer("reward_value").notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
});

export const promo_redemptions = pgTable("promo_redemptions", {
  code_id: uuid("code_id").notNull(),
  granted_days: integer("granted_days").notNull().default(sql`0`),
  granted_lifetime: boolean("granted_lifetime").notNull().default(sql`false`),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  redeemed_at: timestamp("redeemed_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  user_id: uuid("user_id").notNull(),
}, (table) => [unique().on(table.code_id, table.user_id)]);

export const referral_codes = pgTable("referral_codes", {
  code: text("code").notNull().unique(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  user_id: uuid("user_id").notNull().unique(),
});

export const referrals = pgTable("referrals", {
  code: text("code").notNull(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  referred_id: uuid("referred_id").notNull(),
  referrer_id: uuid("referrer_id").notNull(),
  reward_days: integer("reward_days").notNull().default(sql`0`),
  rewarded_at: timestamp("rewarded_at", { withTimezone: true, mode: "string" }),
  status: referral_status("status").notNull().default(sql`'pending'`),
});

export const user_achievements = pgTable("user_achievements", {
  code: text("code").notNull(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  unlocked_at: timestamp("unlocked_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  user_id: uuid("user_id").notNull(),
}, (table) => [unique().on(table.user_id, table.code)]);

export const user_challenges = pgTable("user_challenges", {
  challenge_id: uuid("challenge_id").notNull(),
  completed_at: timestamp("completed_at", { withTimezone: true, mode: "string" }),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  progress: integer("progress").notNull().default(sql`0`),
  user_id: uuid("user_id").notNull(),
  period_key: text("period_key").notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
}, (table) => [unique().on(table.user_id, table.challenge_id)]);

export const user_stats = pgTable("user_stats", {
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  current_level: integer("current_level").notNull().default(sql`1`),
  current_streak: integer("current_streak").notNull().default(sql`0`),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  longest_streak: integer("longest_streak").notNull().default(sql`0`),
  total_xp: integer("total_xp").notNull().default(sql`0`),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  user_id: uuid("user_id").notNull().unique(),
  last_active_date: text("last_active_date"),
  elite_reward_claimed_at: timestamp("elite_reward_claimed_at", { withTimezone: true, mode: "string" }),
});

export const xp_events = pgTable("xp_events", {
  action: text("action").notNull(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  points: integer("points").notNull(),
  source_id: text("source_id"),
  user_id: uuid("user_id").notNull(),
  dedupe_key: text("dedupe_key").notNull(),
});

export const telemetry_events = pgTable("telemetry_events", {
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  error: text("error"),
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  kind: text("kind").notNull(),
  latency_ms: integer("latency_ms"),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  name: text("name").notNull(),
  success: boolean("success").notNull().default(sql`true`),
  user_id: uuid("user_id"),
});

export const restaurant_promotions = pgTable("restaurant_promotions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  restaurant_id: uuid("restaurant_id").notNull(),
  code: text("code"),
  title: text("title").notNull(),
  description: text("description"),
  kind: promotion_kind("kind").notNull(),
  value: numeric("value").notNull().default(sql`0`),
  min_order_amount: numeric("min_order_amount").notNull().default(sql`0`),
  max_discount_amount: numeric("max_discount_amount"),
  applicable_menu_item_ids: uuid("applicable_menu_item_ids").array().notNull().default(sql`'{}'`),
  applicable_branch_ids: uuid("applicable_branch_ids").array().notNull().default(sql`'{}'`),
  usage_limit_total: integer("usage_limit_total"),
  usage_limit_per_customer: integer("usage_limit_per_customer"),
  usage_count: integer("usage_count").notNull().default(sql`0`),
  starts_at: timestamp("starts_at", { withTimezone: true, mode: "string" }),
  ends_at: timestamp("ends_at", { withTimezone: true, mode: "string" }),
  is_active: boolean("is_active").notNull().default(sql`true`),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
});

export const promotion_redemptions = pgTable("promotion_redemptions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  promotion_id: uuid("promotion_id").notNull(),
  restaurant_id: uuid("restaurant_id").notNull(),
  order_id: uuid("order_id"),
  user_id: uuid("user_id").notNull(),
  discount_amount: numeric("discount_amount").notNull().default(sql`0`),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
});

export const ad_placements = pgTable("ad_placements", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  slot: text("slot").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  image_url: text("image_url"),
  cta_label: text("cta_label"),
  target_url: text("target_url"),
  advertiser: text("advertiser"),
  weight: integer("weight").notNull().default(sql`1`),
  is_active: boolean("is_active").notNull().default(sql`true`),
  starts_at: timestamp("starts_at", { withTimezone: true, mode: "string" }),
  ends_at: timestamp("ends_at", { withTimezone: true, mode: "string" }),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
});

export const image_search_cache = pgTable("image_search_cache", {
  cache_key: text("cache_key").primaryKey(),
  provider: text("provider").notNull(),
  query: text("query").notNull(),
  results: jsonb("results").notNull().default(sql`'[]'::jsonb`),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
});

export const app_settings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  description: text("description"),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
  updated_by: uuid("updated_by"),
});

export const admin_allowlist = pgTable("admin_allowlist", {
  email: text("email").primaryKey(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`now()`),
});

export const user = pgTable("auth_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
});
export const session = pgTable("auth_session", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
});
export const account = pgTable("auth_account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const verification = pgTable("auth_verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const auth_rate_limit = pgTable("auth_rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: numeric("last_request", { mode: "number" }).notNull(),
});
