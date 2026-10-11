import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ApplicationSchema,
  MenuItemSchema,
  OrderInputSchema,
  ProfileUpdateSchema,
  ORDER_STATUS_FLOW,
  type OrderStatus,
} from "@/lib/restaurants.schemas";

export const submitRestaurantApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => ApplicationSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { createApplication } = await import("@/lib/restaurants.server");
    return createApplication(context.userId, data);
  });

export const getMyRestaurant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { fetchMyRestaurant } = await import("@/lib/restaurants.server");
    return fetchMyRestaurant(context.userId);
  });

export const updateMyRestaurant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => ProfileUpdateSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { updateRestaurantProfile } = await import("@/lib/restaurants.server");
    return updateRestaurantProfile(context.userId, data);
  });

export const uploadRestaurantMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        restaurantId: z.string().uuid().optional(),
        kind: z.enum(["logo", "cover", "food", "menu-item"]),
        fileName: z.string().min(1).max(200),
        contentType: z.string().min(3).max(100),
        base64: z.string().min(16),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { uploadMedia } = await import("@/lib/restaurants.server");
    return uploadMedia(context.userId, data);
  });

export const saveMenuItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => MenuItemSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { persistMenuItem } = await import("@/lib/restaurants.server");
    return persistMenuItem(context.userId, data);
  });

export const deleteMenuItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { removeMenuItem } = await import("@/lib/restaurants.server");
    return removeMenuItem(context.userId, data.id);
  });

export const listRestaurantOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ restaurantId: z.string().uuid(), scope: z.enum(["active", "completed"]) }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { fetchRestaurantOrders } = await import("@/lib/restaurants.server");
    return fetchRestaurantOrders(context.userId, data.restaurantId, data.scope);
  });

export const updateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        status: z.enum(ORDER_STATUS_FLOW as unknown as [OrderStatus, ...OrderStatus[]]),
        reason: z.string().max(500).optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { setOrderStatus } = await import("@/lib/restaurants.server");
    return setOrderStatus(context.userId, data.orderId, data.status, data.reason);
  });

export const getRestaurantStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ restaurantId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { fetchRestaurantStats } = await import("@/lib/restaurants.server");
    return fetchRestaurantStats(context.userId, data.restaurantId);
  });

export const placeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => OrderInputSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { persistOrder } = await import("@/lib/restaurants.server");
    return persistOrder(context.userId, data);
  });

export const adminListRestaurantApplications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        status: z
          .enum(["all", "pending", "approved", "rejected", "changes_requested", "suspended"])
          .default("pending"),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { adminListApplications } = await import("@/lib/restaurants.server");
    return adminListApplications(context.userId, data.status);
  });

export const adminReviewRestaurantApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        applicationId: z.string().uuid(),
        decision: z.enum(["approved", "rejected", "changes_requested", "suspended"]),
        notes: z.string().max(1000).optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { adminReviewApplication } = await import("@/lib/restaurants.server");
    return adminReviewApplication(context.userId, data);
  });
