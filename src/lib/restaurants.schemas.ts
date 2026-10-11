import { z } from "zod";

export const ORDER_STATUS_FLOW = [
  "new",
  "accepted",
  "preparing",
  "ready",
  "out_for_delivery",
  "completed",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUS_FLOW)[number];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  new: "New",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** Allowed forward transitions for a restaurant-managed order. */
export const NEXT_STATUS: Record<OrderStatus, OrderStatus[]> = {
  new: ["accepted", "cancelled"],
  accepted: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["out_for_delivery", "completed", "cancelled"],
  out_for_delivery: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export const TRACKING_STEPS: OrderStatus[] = [
  "new",
  "accepted",
  "preparing",
  "ready",
  "out_for_delivery",
  "completed",
];

const OpeningHoursSchema = z
  .record(
    z.string(),
    z.object({ open: z.string().max(5), close: z.string().max(5), closed: z.boolean().optional() }),
  )
  .optional();

export const ApplicationSchema = z.object({
  name: z.string().min(2).max(120),
  owner_name: z.string().min(2).max(120),
  description: z.string().max(2000).optional(),
  cuisine: z.string().max(60).optional(),
  phone: z.string().min(5).max(30),
  email: z.string().email().max(160),
  whatsapp: z.string().max(30).optional(),
  address: z.string().min(4).max(300),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  business_registration: z.string().max(120).optional(),
  price_range: z.enum(["$", "$$", "$$$", "$$$$"]).optional(),
  currency: z.string().length(3).default("ZAR"),
  delivery_fee: z.number().min(0).max(1000).default(0),
  min_order_amount: z.number().min(0).max(10000).default(0),
  delivery_radius_km: z.number().min(0.5).max(100).default(10),
  delivery_estimate_minutes: z.number().int().min(5).max(240).default(35),
  opening_hours: OpeningHoursSchema,
});

export type ApplicationInput = z.infer<typeof ApplicationSchema>;

export const ProfileUpdateSchema = z.object({
  restaurantId: z.string().uuid(),
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(2000).optional(),
  cuisine: z.string().max(60).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().max(160).optional(),
  whatsapp: z.string().max(30).optional(),
  address: z.string().max(300).optional(),
  price_range: z.enum(["$", "$$", "$$$", "$$$$"]).optional(),
  delivery_fee: z.number().min(0).max(1000).optional(),
  min_order_amount: z.number().min(0).max(10000).optional(),
  delivery_radius_km: z.number().min(0.5).max(100).optional(),
  delivery_estimate_minutes: z.number().int().min(5).max(240).optional(),
  is_accepting_orders: z.boolean().optional(),
  opening_hours: OpeningHoursSchema,
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export type ProfileUpdateInput = z.infer<typeof ProfileUpdateSchema>;

export const MenuItemSchema = z.object({
  id: z.string().uuid().optional(),
  restaurantId: z.string().uuid(),
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  image_url: z.string().url().max(1000).optional().nullable(),
  price: z.number().min(0).max(100000),
  category: z.string().max(60).optional(),
  is_available: z.boolean().default(true),
  sort_order: z.number().int().min(0).max(9999).default(0),
});

export type MenuItemInput = z.infer<typeof MenuItemSchema>;

export const OrderInputSchema = z.object({
  restaurantId: z.string().uuid(),
  items: z
    .array(
      z.object({
        menu_item_id: z.string().uuid(),
        quantity: z.number().int().min(1).max(50),
        notes: z.string().max(200).optional(),
      }),
    )
    .min(1)
    .max(50),
  delivery_address: z.string().min(4).max(300),
  contact_phone: z.string().min(5).max(30),
  notes: z.string().max(500).optional(),
});

export type OrderInput = z.infer<typeof OrderInputSchema>;
