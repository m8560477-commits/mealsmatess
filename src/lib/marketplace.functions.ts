/**
 * RPC surface shared by the MealMate customer app and the MealMate Partner
 * Platform. Handlers load the server-only module lazily so nothing
 * privileged ends up in a client bundle.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  AnalyticsEventSchema,
  BranchSchema,
  OrderV2Schema,
  PauseSchema,
  PromotionSchema,
  QuoteSchema,
} from "@/lib/marketplace.schemas";

/* ---------------- Customer ---------------- */

/** Server-trusted price preview. Safe for guests: read-only, no writes. */
export const quoteCart = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => QuoteSchema.parse(v))
  .handler(async ({ data }) => {
    const { quoteOrder } = await import("@/lib/marketplace.server");
    return quoteOrder(null, data);
  });

export const submitOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => OrderV2Schema.parse(v))
  .handler(async ({ data, context }) => {
    const { createOrder } = await import("@/lib/marketplace.server");
    return createOrder(context.userId, data);
  });

export const cancelMyOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ orderId: z.string().uuid(), reason: z.string().max(300).optional() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { cancelOwnOrder } = await import("@/lib/marketplace.server");
    return cancelOwnOrder(context.userId, data.orderId, data.reason);
  });

export const trackMarketplaceEvent = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => AnalyticsEventSchema.parse(v))
  .handler(async ({ data }) => {
    const { recordEvent } = await import("@/lib/marketplace.server");
    return recordEvent(null, data);
  });

export const trackMyMarketplaceEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => AnalyticsEventSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { recordEvent } = await import("@/lib/marketplace.server");
    return recordEvent(context.userId, data);
  });

export const getPaymentStatusConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { paymentConfig } = await import("@/lib/marketplace.server");
  return paymentConfig();
});

/* ---------------- Partner platform ---------------- */

const RestaurantIdSchema = z.object({ restaurantId: z.string().uuid() });

export const partnerListPromotions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => RestaurantIdSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { listPromotionsForPartner } = await import("@/lib/marketplace.server");
    return listPromotionsForPartner(context.userId, data.restaurantId);
  });

export const partnerSavePromotion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => PromotionSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { savePromotion } = await import("@/lib/marketplace.server");
    return savePromotion(context.userId, data);
  });

export const partnerDeletePromotion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { deletePromotion } = await import("@/lib/marketplace.server");
    return deletePromotion(context.userId, data.id);
  });

export const partnerListBranches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => RestaurantIdSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { listBranches } = await import("@/lib/marketplace.server");
    return listBranches(context.userId, data.restaurantId);
  });

export const partnerSaveBranch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => BranchSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { saveBranch } = await import("@/lib/marketplace.server");
    return saveBranch(context.userId, data);
  });

export const partnerDeleteBranch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { deleteBranch } = await import("@/lib/marketplace.server");
    return deleteBranch(context.userId, data.id);
  });

export const partnerSetPause = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => PauseSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { setOrderingPause } = await import("@/lib/marketplace.server");
    return setOrderingPause(context.userId, {
      restaurantId: data.restaurantId,
      is_accepting_orders: data.is_accepting_orders,
      ...(data.pause_message !== undefined ? { pause_message: data.pause_message } : {}),
      ...(data.paused_until !== undefined ? { paused_until: data.paused_until } : {}),
    });
  });

export const partnerAnalyticsSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    RestaurantIdSchema.extend({ days: z.number().int().min(1).max(365).default(30) }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { partnerAnalytics } = await import("@/lib/marketplace.server");
    return partnerAnalytics(context.userId, data.restaurantId, data.days);
  });
