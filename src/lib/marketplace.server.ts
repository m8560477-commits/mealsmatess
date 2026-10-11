/**
 * Server-only marketplace logic shared by the MealMate customer app and the
 * MealMate Partner Platform. Never import this from client code.
 *
 * Money, availability and promotion rules are resolved here against the
 * database — the frontend never decides what an order costs.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { auditLog } from "@/lib/security.server";
import {
  MarketplaceError,
  computeTotals,
  evaluatePromotion,
  openNow,
  parseModifierGroups,
  priceModifiers,
  restaurantAvailability,
  round2,
  type PricedLine,
  type PromotionEvaluation,
  type PromotionRow,
} from "@/lib/marketplace.pricing";
import type {
  AnalyticsEventInput,
  BranchInput,
  OrderV2Input,
  PromotionInput,
  QuoteInput,
} from "@/lib/marketplace.schemas";

/* ---------------- Authorization ---------------- */

export async function isAdmin(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

/** Roles allowed to change what customers can see/buy. */
const MANAGER_ROLES = ["owner", "general_manager", "manager"];

export async function assertRestaurantMember(
  userId: string,
  restaurantId: string,
  options: { managersOnly?: boolean } = {},
): Promise<void> {
  const { data: owned } = await supabaseAdmin
    .from("restaurants")
    .select("id")
    .eq("id", restaurantId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (owned) return;

  const { data: staff } = await supabaseAdmin
    .from("restaurant_staff")
    .select("role")
    .eq("restaurant_id", restaurantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (staff) {
    if (options.managersOnly && !MANAGER_ROLES.includes(String(staff.role))) {
      throw new MarketplaceError("forbidden", "Your role can't change this setting.", 403);
    }
    return;
  }

  if (await isAdmin(userId)) return;
  throw new MarketplaceError("forbidden", "You don't have access to this restaurant.", 403);
}

/* ---------------- Payment provider ---------------- */

export type PaymentConfig = { configured: boolean; provider: string | null };

export function paymentConfig(): PaymentConfig {
  const provider = process.env['PAYMENT_PROVIDER'];
  const secret = process.env['PAYMENT_PROVIDER_SECRET_KEY'];
  if (provider && secret) return { configured: true, provider };
  return { configured: false, provider: null };
}

/* ---------------- Pricing core ---------------- */

type MenuRow = {
  id: string;
  name: string;
  price: number;
  is_available: boolean;
  is_hidden: boolean;
  modifier_groups: unknown;
};

type RestaurantRow = {
  id: string;
  currency: string;
  approval_status: string;
  is_accepting_orders: boolean;
  pause_message: string | null;
  paused_until: string | null;
  opening_hours: unknown;
  delivery_fee: number;
  min_order_amount: number;
  supports_delivery: boolean;
  supports_pickup: boolean;
};

type BranchRow = {
  id: string;
  restaurant_id: string;
  label: string | null;
  is_active: boolean;
  is_accepting_orders: boolean;
  opening_hours: unknown;
  delivery_fee: number | null;
  min_order_amount: number | null;
  delivery_estimate_minutes: number | null;
};

export type PricingResult = {
  restaurant: RestaurantRow;
  branch: BranchRow | null;
  lines: PricedLine[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  currency: string;
  promotion: PromotionEvaluation | null;
  minOrderAmount: number;
};

async function loadRestaurant(restaurantId: string): Promise<RestaurantRow> {
  const { data, error } = await supabaseAdmin
    .from("restaurants")
    .select(
      "id,opening_hours,currency,approval_status,is_accepting_orders,pause_message,paused_until,delivery_fee,min_order_amount,supports_delivery,supports_pickup,delivery_estimate_minutes",
    )
    .eq("id", restaurantId)
    .maybeSingle();
  if (error) console.error("[marketplace] loadRestaurant", error);
  if (!data || data.approval_status !== "approved") {
    throw new MarketplaceError("restaurant_unavailable", "This restaurant is unavailable.", 404);
  }
  return {
    ...data,
    delivery_fee: Number(data.delivery_fee ?? 0),
    min_order_amount: Number(data.min_order_amount ?? 0),
  } as unknown as RestaurantRow;
}

async function loadBranch(restaurantId: string, branchId: string | null | undefined) {
  if (!branchId) return null;
  const { data } = await supabaseAdmin
    .from("restaurant_locations")
    .select(
      "id,restaurant_id,label,is_active,is_accepting_orders,opening_hours,delivery_fee,min_order_amount,delivery_estimate_minutes",
    )
    .eq("id", branchId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!data) throw new MarketplaceError("branch_unavailable", "That branch is unavailable.", 404);
  return data as unknown as BranchRow;
}

/**
 * Resolves a cart into server-trusted prices. Used both for the live checkout
 * quote and for the real order write, so the customer never sees one number
 * and gets charged another.
 */
export async function priceCart(
  userId: string | null,
  input: QuoteInput | OrderV2Input,
): Promise<PricingResult> {
  const restaurant = await loadRestaurant(input.restaurantId);
  const availability = restaurantAvailability(restaurant);
  if (!availability.canOrder) {
    throw new MarketplaceError("restaurant_closed", availability.reason ?? "Orders unavailable.", 409);
  }

  const branch = await loadBranch(restaurant.id, input.branchId ?? null);
  if (branch) {
    if (!branch.is_active || !branch.is_accepting_orders) {
      throw new MarketplaceError("branch_closed", "This branch is not taking orders right now.", 409);
    }
    if (openNow(branch.opening_hours) === false) {
      throw new MarketplaceError("branch_closed", "This branch is currently closed.", 409);
    }
  }

  const fulfillment = input.fulfillment_type ?? "delivery";
  if (fulfillment === "delivery" && restaurant.supports_delivery === false) {
    throw new MarketplaceError("no_delivery", "This restaurant is pickup only.", 400);
  }
  if (fulfillment === "pickup" && restaurant.supports_pickup === false) {
    throw new MarketplaceError("no_pickup", "This restaurant is delivery only.", 400);
  }

  const ids = [...new Set(input.items.map((i) => i.menu_item_id))];
  const { data: menuRows, error: menuErr } = await (supabaseAdmin as any)
    .from("menu_items")
    .select("id,name,price,is_available,is_hidden,modifier_groups")
    .in("id", ids)
    .eq("restaurant_id", restaurant.id);
  if (menuErr) throw new Error(menuErr.message);
  const menu = new Map(((menuRows ?? []) as any[]).map((m: any) => [m.id, m as MenuRow]));

  const lines: PricedLine[] = input.items.map((item) => {
    const row = menu.get(item.menu_item_id);
    if (!row) {
      throw new MarketplaceError("item_unavailable", "An item in your cart is no longer on the menu.");
    }
    if (!row.is_available || (row as any).is_hidden) {
      throw new MarketplaceError("item_sold_out", `${row.name} is sold out right now.`);
    }
    const groups = parseModifierGroups(row.modifier_groups);
    const modifiers = priceModifiers(row.name, groups, item.modifiers ?? []);
    const basePrice = round2(Number(row.price));
    const unitPrice = round2(basePrice + modifiers.reduce((s, m) => s + m.price_delta, 0));
    if (unitPrice < 0) throw new MarketplaceError("invalid_price", "We couldn't price that item.");
    return {
      menu_item_id: row.id,
      name: row.name,
      base_price: basePrice,
      unit_price: unitPrice,
      quantity: item.quantity,
      modifiers,
      line_total: round2(unitPrice * item.quantity),
    };
  });

  const rawSubtotal = round2(lines.reduce((s, l) => s + l.line_total, 0));
  const minOrder = Number(branch?.min_order_amount ?? restaurant.min_order_amount ?? 0);
  if (fulfillment === "delivery" && rawSubtotal < minOrder) {
    throw new MarketplaceError(
      "below_minimum",
      `Minimum delivery order is ${restaurant.currency} ${minOrder.toFixed(2)}.`,
    );
  }

  const baseDeliveryFee =
    fulfillment === "pickup" ? 0 : Number(branch?.delivery_fee ?? restaurant.delivery_fee ?? 0);

  const promotion = await resolvePromotion(userId, restaurant.id, input.promotion_code ?? null, {
    lines,
    subtotal: rawSubtotal,
    deliveryFee: baseDeliveryFee,
    branchId: branch?.id ?? null,
  });

  const totals = computeTotals({ lines, deliveryFee: baseDeliveryFee, promotion });

  return {
    restaurant,
    branch,
    lines,
    ...totals,
    currency: restaurant.currency,
    promotion,
    minOrderAmount: minOrder,
  };
}

async function resolvePromotion(
  userId: string | null,
  restaurantId: string,
  code: string | null,
  ctx: { lines: PricedLine[]; subtotal: number; deliveryFee: number; branchId: string | null },
): Promise<PromotionEvaluation | null> {
  const now = new Date();
  const trimmed = code?.trim();

  let query = supabaseAdmin
    .from("restaurant_promotions")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true);
  if (trimmed) query = query.ilike("code", trimmed);
  else query = query.is("code", null);

  const { data } = await query;
  const promotions = (data ?? []) as unknown as PromotionRow[];

  if (trimmed && promotions.length === 0) {
    throw new MarketplaceError("promo_invalid", "That promo code isn't valid for this restaurant.");
  }

  let customerOrderCount = 0;
  if (userId) {
    const { count } = await supabaseAdmin
      .from("restaurant_orders")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", userId);
    customerOrderCount = count ?? 0;
  }

  const evaluated: PromotionEvaluation[] = [];
  for (const promotion of promotions) {
    let customerUsageCount = 0;
    if (userId && promotion.usage_limit_per_customer != null) {
      const { count } = await supabaseAdmin
        .from("promotion_redemptions")
        .select("id", { count: "exact", head: true })
        .eq("promotion_id", promotion.id)
        .eq("user_id", userId);
      customerUsageCount = count ?? 0;
    }
    const result = evaluatePromotion(
      promotion,
      { ...ctx, now, customerUsageCount, customerOrderCount },
      Boolean(trimmed),
    );
    if (result) evaluated.push(result);
  }

  if (evaluated.length === 0) return null;
  // Best value for the customer wins.
  return evaluated.sort(
    (a, b) => b.discount + (b.freeDelivery ? ctx.deliveryFee : 0) - (a.discount + (a.freeDelivery ? ctx.deliveryFee : 0)),
  )[0]!;
}

/* ---------------- Orders ---------------- */

export async function quoteOrder(userId: string | null, input: QuoteInput) {
  const priced = await priceCart(userId, input);
  return {
    currency: priced.currency,
    subtotal: priced.subtotal,
    discount: priced.discount,
    deliveryFee: priced.deliveryFee,
    total: priced.total,
    minOrderAmount: priced.minOrderAmount,
    lines: priced.lines,
    promotion: priced.promotion
      ? {
          id: priced.promotion.promotion.id,
          title: priced.promotion.promotion.title,
          code: priced.promotion.promotion.code,
          kind: priced.promotion.promotion.kind,
          discount: priced.promotion.discount,
          freeDelivery: priced.promotion.freeDelivery,
        }
      : null,
    payment: paymentConfig(),
  };
}

export async function createOrder(userId: string, input: OrderV2Input) {
  const priced = await priceCart(userId, input);
  const fulfillment = input.fulfillment_type ?? "delivery";

  if (fulfillment === "delivery" && (input.delivery_address ?? "").trim().length < 4) {
    throw new MarketplaceError("address_required", "Add a delivery address before ordering.");
  }

  const payment = paymentConfig();

  const orderNumber = `MM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const { data: order, error } = await supabaseAdmin
    .from("restaurant_orders")
    .insert({
      order_number: orderNumber,
      restaurant_id: priced.restaurant.id,
      branch_id: priced.branch?.id ?? null,
      customer_id: userId,
      status: "new",
      fulfillment_type: fulfillment,
      subtotal: priced.subtotal,
      discount_total: priced.discount,
      delivery_fee: priced.deliveryFee,
      total: priced.total,
      currency: priced.currency,
      delivery_address: fulfillment === "delivery" ? (input.delivery_address ?? "").trim() : null,
      contact_phone: input.contact_phone.trim(),
      notes: input.notes?.trim() || null,
      promotion_id: priced.promotion?.promotion.id ?? null,
      promotion_code: priced.promotion?.promotion.code ?? null,
      payment_status: "unpaid",
    })
    .select("id,status,total,payment_status")
    .single();
  if (error) {
    console.error("[marketplace] createOrder insert", error);
    throw new Error("We couldn't place your order. Please try again.");
  }

  const { error: itemsErr } = await supabaseAdmin.from("order_items").insert(
    priced.lines.map((l) => ({
      order_id: order.id,
      menu_item_id: l.menu_item_id,
      name: l.name,
      unit_price: l.unit_price,
      quantity: l.quantity,
      line_total: l.line_total,
      modifiers: l.modifiers as never,
      notes: input.items.find((i) => i.menu_item_id === l.menu_item_id)?.notes ?? null,
    })),
  );
  if (itemsErr) {
    console.error("[marketplace] createOrder items", itemsErr);
    await supabaseAdmin.from("restaurant_orders").delete().eq("id", order.id);
    throw new Error("We couldn't place your order. Please try again.");
  }

  if (priced.promotion) {
    await supabaseAdmin.from("promotion_redemptions").insert({
      promotion_id: priced.promotion.promotion.id,
      restaurant_id: priced.restaurant.id,
      order_id: order.id,
      user_id: userId,
      discount_amount: priced.promotion.discount,
    });
    await supabaseAdmin
      .from("restaurant_promotions")
      .update({ usage_count: priced.promotion.promotion.usage_count + 1 })
      .eq("id", priced.promotion.promotion.id);
    await recordEvent(userId, {
      name: "promotion_used",
      restaurant_id: priced.restaurant.id,
      order_id: order.id,
      value: priced.promotion.discount,
    });
  }

  await recordEvent(userId, {
    name: "order_created",
    restaurant_id: priced.restaurant.id,
    branch_id: priced.branch?.id ?? null,
    order_id: order.id,
    value: priced.total,
  });

  await auditLog({
    actor_id: userId,
    action: "restaurant_order_created",
    target_table: "restaurant_orders",
    target_id: order.id,
    metadata: { total: priced.total, restaurant_id: priced.restaurant.id },
  });

  return {
    orderId: order.id,
    subtotal: priced.subtotal,
    discount: priced.discount,
    deliveryFee: priced.deliveryFee,
    total: priced.total,
    currency: priced.currency,
    paymentStatus: order.payment_status,
    paymentConfigured: payment.configured,
  };
}

export async function cancelOwnOrder(userId: string, orderId: string, reason?: string) {
  const { data: order } = await supabaseAdmin
    .from("restaurant_orders")
    .select("id,customer_id,status")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) throw new MarketplaceError("order_not_found", "Order not found.", 404);
  if (order.customer_id !== userId) {
    throw new MarketplaceError("forbidden", "This isn't your order.", 403);
  }
  if (!["new", "accepted"].includes(order.status)) {
    throw new MarketplaceError(
      "cancel_too_late",
      "The kitchen has already started — please call the restaurant.",
    );
  }
  const { error } = await supabaseAdmin
    .from("restaurant_orders")
    .update({ status: "cancelled", rejection_reason: reason ?? "Cancelled by customer" })
    .eq("id", orderId);
  if (error) throw new Error(error.message);
  await auditLog({
    actor_id: userId,
    action: "restaurant_order_cancelled_by_customer",
    target_table: "restaurant_orders",
    target_id: orderId,
  });
  return { ok: true };
}

/* ---------------- Promotions (partner) ---------------- */

export async function listPromotionsForPartner(userId: string, restaurantId: string) {
  await assertRestaurantMember(userId, restaurantId);
  const { data, error } = await supabaseAdmin
    .from("restaurant_promotions")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function savePromotion(userId: string, input: PromotionInput) {
  await assertRestaurantMember(userId, input.restaurantId, { managersOnly: true });
  if (input.starts_at && input.ends_at && new Date(input.starts_at) >= new Date(input.ends_at)) {
    throw new MarketplaceError("promo_dates", "The end date must be after the start date.");
  }
  if ((input.kind === "percent_off" || input.kind === "first_order") && (input.value <= 0 || input.value > 100)) {
    throw new MarketplaceError("promo_value", "Percentage discounts must be between 1 and 100.");
  }
  const row = {
    restaurant_id: input.restaurantId,
    title: input.title,
    description: input.description ?? null,
    code: input.code?.trim() ? input.code.trim().toUpperCase() : null,
    kind: input.kind,
    value: input.value,
    min_order_amount: input.min_order_amount,
    max_discount_amount: input.max_discount_amount ?? null,
    applicable_menu_item_ids: input.applicable_menu_item_ids,
    applicable_branch_ids: input.applicable_branch_ids,
    usage_limit_total: input.usage_limit_total ?? null,
    usage_limit_per_customer: input.usage_limit_per_customer ?? null,
    starts_at: input.starts_at ?? null,
    ends_at: input.ends_at ?? null,
    is_active: input.is_active,
  };
  const query = input.id
    ? supabaseAdmin
        .from("restaurant_promotions")
        .update(row as never)
        .eq("id", input.id)
        .eq("restaurant_id", input.restaurantId)
    : supabaseAdmin.from("restaurant_promotions").insert(row as never);
  const { data, error } = await query.select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deletePromotion(userId: string, id: string) {
  const { data: promo } = await supabaseAdmin
    .from("restaurant_promotions")
    .select("id,restaurant_id")
    .eq("id", id)
    .maybeSingle();
  if (!promo) return { ok: true };
  await assertRestaurantMember(userId, promo.restaurant_id, { managersOnly: true });
  const { error } = await supabaseAdmin.from("restaurant_promotions").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

/* ---------------- Branches (partner) ---------------- */

export async function listBranches(userId: string, restaurantId: string) {
  await assertRestaurantMember(userId, restaurantId);
  const { data, error } = await supabaseAdmin
    .from("restaurant_locations")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function saveBranch(userId: string, input: BranchInput) {
  await assertRestaurantMember(userId, input.restaurantId, { managersOnly: true });
  const row = {
    restaurant_id: input.restaurantId,
    label: input.label,
    address: input.address,
    latitude: input.latitude,
    longitude: input.longitude,
    phone: input.phone ?? null,
    is_active: input.is_active,
    is_accepting_orders: input.is_accepting_orders,
    delivery_fee: input.delivery_fee ?? null,
    min_order_amount: input.min_order_amount ?? null,
    delivery_radius_km: input.delivery_radius_km ?? null,
    delivery_estimate_minutes: input.delivery_estimate_minutes ?? null,
    opening_hours: (input.opening_hours ?? {}) as never,
  };
  const query = input.id
    ? supabaseAdmin
        .from("restaurant_locations")
        .update(row as never)
        .eq("id", input.id)
        .eq("restaurant_id", input.restaurantId)
    : supabaseAdmin.from("restaurant_locations").insert(row as never);
  const { data, error } = await query.select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteBranch(userId: string, id: string) {
  const { data: branch } = await supabaseAdmin
    .from("restaurant_locations")
    .select("id,restaurant_id")
    .eq("id", id)
    .maybeSingle();
  if (!branch) return { ok: true };
  await assertRestaurantMember(userId, branch.restaurant_id, { managersOnly: true });
  const { error } = await supabaseAdmin.from("restaurant_locations").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function setOrderingPause(
  userId: string,
  input: { restaurantId: string; is_accepting_orders: boolean; pause_message?: string | null; paused_until?: string | null },
) {
  await assertRestaurantMember(userId, input.restaurantId, { managersOnly: true });
  const { error } = await supabaseAdmin
    .from("restaurants")
    .update({
      is_accepting_orders: input.is_accepting_orders,
      pause_message: input.is_accepting_orders ? null : (input.pause_message ?? null),
      paused_until: input.is_accepting_orders ? null : (input.paused_until ?? null),
    } as never)
    .eq("id", input.restaurantId);
  if (error) throw new Error(error.message);
  await auditLog({
    actor_id: userId,
    action: input.is_accepting_orders ? "restaurant_resumed_orders" : "restaurant_paused_orders",
    target_table: "restaurants",
    target_id: input.restaurantId,
  });
  return { ok: true };
}

/* ---------------- Analytics ---------------- */

export async function recordEvent(userId: string | null, event: AnalyticsEventInput) {
  const { error } = await supabaseAdmin.from("telemetry_events").insert({
    user_id: userId,
    kind: "marketplace",
    name: event.name,
    success: true,
    metadata: {
      restaurant_id: event.restaurant_id ?? null,
      branch_id: event.branch_id ?? null,
      menu_item_id: event.menu_item_id ?? null,
      order_id: event.order_id ?? null,
      value: event.value ?? null,
      ...(event.metadata ?? {}),
    } as never,
  });
  if (error) console.error("[marketplace] analytics insert failed", error.message);
  return { ok: true };
}

/** Real funnel numbers for the partner dashboard — computed from stored rows only. */
export async function partnerAnalytics(userId: string, restaurantId: string, days = 30) {
  await assertRestaurantMember(userId, restaurantId);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const [orders, events, redemptions] = await Promise.all([
    supabaseAdmin
      .from("restaurant_orders")
      .select("id,status,total,discount_total,placed_at,fulfillment_type")
      .eq("restaurant_id", restaurantId)
      .gte("placed_at", since),
    supabaseAdmin
      .from("telemetry_events")
      .select("name,metadata,created_at")
      .eq("kind", "marketplace")
      .gte("created_at", since)
      .limit(5000),
    supabaseAdmin
      .from("promotion_redemptions")
      .select("discount_amount")
      .eq("restaurant_id", restaurantId)
      .gte("created_at", since),
  ]);

  const orderRows = orders.data ?? [];
  const completed = orderRows.filter((o) => o.status === "completed");
  const revenue = round2(completed.reduce((s, o) => s + Number(o.total ?? 0), 0));

  const funnel: Record<string, number> = {};
  for (const e of events.data ?? []) {
    const meta = (e.metadata ?? {}) as Record<string, unknown>;
    if (meta['restaurant_id'] !== restaurantId) continue;
    funnel[e.name] = (funnel[e.name] ?? 0) + 1;
  }

  const byDay = new Map<string, { orders: number; revenue: number }>();
  for (const o of orderRows) {
    const day = String(o.placed_at).slice(0, 10);
    const entry = byDay.get(day) ?? { orders: 0, revenue: 0 };
    entry.orders += 1;
    if (o.status === "completed") entry.revenue = round2(entry.revenue + Number(o.total ?? 0));
    byDay.set(day, entry);
  }

  return {
    days,
    orders: orderRows.length,
    completed: completed.length,
    cancelled: orderRows.filter((o) => o.status === "cancelled").length,
    pickupShare: orderRows.length
      ? Math.round((orderRows.filter((o) => o.fulfillment_type === "pickup").length / orderRows.length) * 100)
      : 0,
    revenue,
    avgOrder: completed.length ? round2(revenue / completed.length) : 0,
    promoDiscount: round2((redemptions.data ?? []).reduce((s, r) => s + Number(r.discount_amount ?? 0), 0)),
    funnel: {
      restaurant_view: funnel['restaurant_view'] ?? 0,
      menu_view: funnel['menu_view'] ?? 0,
      item_view: funnel['item_view'] ?? 0,
      add_to_cart: funnel['add_to_cart'] ?? 0,
      checkout_started: funnel['checkout_started'] ?? 0,
      order_created: funnel['order_created'] ?? 0,
      order_completed: funnel['order_completed'] ?? 0,
    },
    daily: [...byDay.entries()].sort().map(([date, v]) => ({ date, ...v })),
  };
}
