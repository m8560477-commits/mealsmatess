import { z } from "zod";

/** Add-on / modifier definitions attached to a menu item. */
export const ModifierOptionSchema = z.object({
  id: z.string().min(1).max(60),
  name: z.string().min(1).max(80),
  price_delta: z.number().min(-10000).max(10000).default(0),
});

export const ModifierGroupSchema = z.object({
  id: z.string().min(1).max(60),
  name: z.string().min(1).max(80),
  min: z.number().int().min(0).max(20).default(0),
  max: z.number().int().min(0).max(20).default(1),
  options: z.array(ModifierOptionSchema).max(30).default([]),
});

export const DIETARY_TAGS = [
  "vegetarian",
  "vegan",
  "halal",
  "kosher",
  "gluten_free",
  "dairy_free",
  "nut_free",
  "spicy",
  "low_carb",
] as const;

export type DietaryTag = (typeof DIETARY_TAGS)[number];

export const DIETARY_LABEL: Record<DietaryTag, string> = {
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  halal: "Halal",
  kosher: "Kosher",
  gluten_free: "Gluten free",
  dairy_free: "Dairy free",
  nut_free: "Nut free",
  spicy: "Spicy",
  low_carb: "Low carb",
};

export const PROMOTION_KINDS = [
  "percent_off",
  "amount_off",
  "bogo",
  "free_delivery",
  "combo",
  "first_order",
] as const;

export const PROMOTION_LABEL: Record<(typeof PROMOTION_KINDS)[number], string> = {
  percent_off: "Percentage discount",
  amount_off: "Amount off",
  bogo: "Buy 1 get 1",
  free_delivery: "Free delivery",
  combo: "Combo deal",
  first_order: "First-order discount",
};

export const PromotionSchema = z.object({
  id: z.string().uuid().optional(),
  restaurantId: z.string().uuid(),
  title: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  code: z.string().min(3).max(30).regex(/^[A-Za-z0-9_-]+$/).optional().nullable(),
  kind: z.enum(PROMOTION_KINDS),
  value: z.number().min(0).max(100000).default(0),
  min_order_amount: z.number().min(0).max(100000).default(0),
  max_discount_amount: z.number().min(0).max(100000).optional().nullable(),
  applicable_menu_item_ids: z.array(z.string().uuid()).max(200).default([]),
  applicable_branch_ids: z.array(z.string().uuid()).max(50).default([]),
  usage_limit_total: z.number().int().min(1).max(1000000).optional().nullable(),
  usage_limit_per_customer: z.number().int().min(1).max(1000).optional().nullable(),
  starts_at: z.string().datetime().optional().nullable(),
  ends_at: z.string().datetime().optional().nullable(),
  is_active: z.boolean().default(true),
});

export type PromotionInput = z.infer<typeof PromotionSchema>;

const OpeningHoursSchema = z
  .record(
    z.string(),
    z.object({ open: z.string().max(5), close: z.string().max(5), closed: z.boolean().optional() }),
  )
  .optional();

export const BranchSchema = z.object({
  id: z.string().uuid().optional(),
  restaurantId: z.string().uuid(),
  label: z.string().min(1).max(80),
  address: z.string().min(4).max(300),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  phone: z.string().max(30).optional().nullable(),
  is_active: z.boolean().default(true),
  is_accepting_orders: z.boolean().default(true),
  delivery_fee: z.number().min(0).max(1000).optional().nullable(),
  min_order_amount: z.number().min(0).max(10000).optional().nullable(),
  delivery_radius_km: z.number().min(0.5).max(100).optional().nullable(),
  delivery_estimate_minutes: z.number().int().min(5).max(240).optional().nullable(),
  opening_hours: OpeningHoursSchema,
});

export type BranchInput = z.infer<typeof BranchSchema>;

export const PauseSchema = z.object({
  restaurantId: z.string().uuid(),
  is_accepting_orders: z.boolean(),
  pause_message: z.string().max(200).optional().nullable(),
  paused_until: z.string().datetime().optional().nullable(),
});

export const ANALYTICS_EVENTS = [
  "restaurant_view",
  "menu_view",
  "item_view",
  "add_to_cart",
  "checkout_started",
  "order_created",
  "order_completed",
  "promotion_used",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export const AnalyticsEventSchema = z.object({
  name: z.enum(ANALYTICS_EVENTS),
  restaurant_id: z.string().uuid().optional().nullable(),
  branch_id: z.string().uuid().optional().nullable(),
  menu_item_id: z.string().uuid().optional().nullable(),
  order_id: z.string().uuid().optional().nullable(),
  value: z.number().min(0).max(1000000).optional().nullable(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export type AnalyticsEventInput = z.infer<typeof AnalyticsEventSchema>;

/** Order payload v2 — supports branches, add-ons, pickup and promotions. */
export const OrderV2Schema = z.object({
  restaurantId: z.string().uuid(),
  branchId: z.string().uuid().optional().nullable(),
  fulfillment_type: z.enum(["delivery", "pickup"]).default("delivery"),
  items: z
    .array(
      z.object({
        menu_item_id: z.string().uuid(),
        quantity: z.number().int().min(1).max(50),
        notes: z.string().max(200).optional(),
        modifiers: z
          .array(z.object({ group_id: z.string().max(60), option_id: z.string().max(60) }))
          .max(20)
          .default([]),
      }),
    )
    .min(1)
    .max(50),
  promotion_code: z.string().max(30).optional().nullable(),
  delivery_address: z.string().max(300).optional().nullable(),
  contact_phone: z.string().min(5).max(30),
  notes: z.string().max(500).optional(),
});

export type OrderV2Input = z.infer<typeof OrderV2Schema>;

export const QuoteSchema = OrderV2Schema.omit({ delivery_address: true, contact_phone: true }).extend({
  contact_phone: z.string().max(30).optional(),
});

export type QuoteInput = z.infer<typeof QuoteSchema>;

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  unpaid: "Payment on delivery",
  pending: "Payment pending",
  paid: "Paid",
  failed: "Payment failed",
  refunded: "Refunded",
};
