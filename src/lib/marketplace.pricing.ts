/**
 * Pure pricing + availability rules shared by the customer app and the partner
 * platform. Everything here is deterministic and side-effect free so the server
 * can be the single source of truth for money.
 */

export type ModifierOption = {
  id: string;
  name: string;
  price_delta: number;
};

export type ModifierGroup = {
  id: string;
  name: string;
  min: number;
  max: number;
  options: ModifierOption[];
};

export type SelectedModifier = {
  group_id: string;
  option_id: string;
  name: string;
  price_delta: number;
};

export type PricedLine = {
  menu_item_id: string;
  name: string;
  base_price: number;
  unit_price: number;
  quantity: number;
  modifiers: SelectedModifier[];
  line_total: number;
};

export type PromotionKind =
  | "percent_off"
  | "amount_off"
  | "bogo"
  | "free_delivery"
  | "combo"
  | "first_order";

export type PromotionRow = {
  id: string;
  restaurant_id: string;
  code: string | null;
  title: string;
  description: string | null;
  kind: PromotionKind;
  value: number;
  min_order_amount: number;
  max_discount_amount: number | null;
  applicable_menu_item_ids: string[];
  applicable_branch_ids: string[];
  usage_limit_total: number | null;
  usage_limit_per_customer: number | null;
  usage_count: number;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
};

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function parseModifierGroups(raw: unknown): ModifierGroup[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((g) => {
    if (!g || typeof g !== "object") return [];
    const group = g as Record<string, unknown>;
    const options = Array.isArray(group['options'])
      ? (group['options'] as unknown[]).flatMap((o) => {
          if (!o || typeof o !== "object") return [];
          const opt = o as Record<string, unknown>;
          if (typeof opt['id'] !== "string" || typeof opt['name'] !== "string") return [];
          return [
            {
              id: opt['id'],
              name: opt['name'],
              price_delta: Number(opt['price_delta'] ?? 0) || 0,
            } satisfies ModifierOption,
          ];
        })
      : [];
    if (typeof group['id'] !== "string" || typeof group['name'] !== "string") return [];
    return [
      {
        id: group['id'],
        name: group['name'],
        min: Math.max(0, Number(group['min'] ?? 0) || 0),
        max: Math.max(0, Number(group['max'] ?? 0) || 0),
        options,
      } satisfies ModifierGroup,
    ];
  });
}

export class MarketplaceError extends Error {
  status: number;
  code: string;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * Validates the customer's modifier selection against the item's published
 * groups and returns the priced selection. Throws on anything unexpected.
 */
export function priceModifiers(
  itemName: string,
  groups: ModifierGroup[],
  selectedIds: { group_id: string; option_id: string }[],
): SelectedModifier[] {
  const chosen: SelectedModifier[] = [];
  for (const group of groups) {
    const picks = selectedIds.filter((s) => s.group_id === group.id);
    const max = group.max > 0 ? group.max : group.options.length;
    if (picks.length < group.min) {
      throw new MarketplaceError(
        "modifier_required",
        `Choose at least ${group.min} option${group.min > 1 ? "s" : ""} for "${group.name}" on ${itemName}.`,
      );
    }
    if (picks.length > max) {
      throw new MarketplaceError(
        "modifier_limit",
        `You can only choose ${max} option${max > 1 ? "s" : ""} for "${group.name}" on ${itemName}.`,
      );
    }
    for (const pick of picks) {
      const option = group.options.find((o) => o.id === pick.option_id);
      if (!option) {
        throw new MarketplaceError("modifier_unknown", `An add-on on ${itemName} is no longer available.`);
      }
      chosen.push({
        group_id: group.id,
        option_id: option.id,
        name: option.name,
        price_delta: round2(option.price_delta),
      });
    }
  }
  const knownGroups = new Set(groups.map((g) => g.id));
  if (selectedIds.some((s) => !knownGroups.has(s.group_id))) {
    throw new MarketplaceError("modifier_unknown", `An add-on on ${itemName} is no longer available.`);
  }
  return chosen;
}

export type PromotionEvaluation = {
  promotion: PromotionRow;
  discount: number;
  freeDelivery: boolean;
};

export type PromotionContext = {
  lines: PricedLine[];
  subtotal: number;
  deliveryFee: number;
  branchId: string | null;
  now: Date;
  customerUsageCount: number;
  customerOrderCount: number;
};

/** Returns null when the promotion simply does not apply; throws when the customer explicitly asked for it. */
export function evaluatePromotion(
  promotion: PromotionRow,
  ctx: PromotionContext,
  explicit: boolean,
): PromotionEvaluation | null {
  const fail = (code: string, message: string): null => {
    if (explicit) throw new MarketplaceError(code, message);
    return null;
  };

  if (!promotion.is_active) return fail("promo_inactive", "This promotion is no longer active.");
  if (promotion.starts_at && new Date(promotion.starts_at) > ctx.now) {
    return fail("promo_not_started", "This promotion hasn't started yet.");
  }
  if (promotion.ends_at && new Date(promotion.ends_at) < ctx.now) {
    return fail("promo_expired", "This promotion has expired.");
  }
  if (promotion.applicable_branch_ids.length > 0 && (!ctx.branchId || !promotion.applicable_branch_ids.includes(ctx.branchId))) {
    return fail("promo_branch", "This promotion is not available at the selected branch.");
  }
  if (ctx.subtotal < Number(promotion.min_order_amount ?? 0)) {
    return fail("promo_min_order", `Spend at least ${promotion.min_order_amount} to use this promotion.`);
  }
  if (promotion.usage_limit_total != null && promotion.usage_count >= promotion.usage_limit_total) {
    return fail("promo_exhausted", "This promotion has reached its usage limit.");
  }
  if (promotion.usage_limit_per_customer != null && ctx.customerUsageCount >= promotion.usage_limit_per_customer) {
    return fail("promo_used", "You've already used this promotion the maximum number of times.");
  }
  if (promotion.kind === "first_order" && ctx.customerOrderCount > 0) {
    return fail("promo_first_order", "This promotion is only valid on your first order.");
  }

  const applicable = promotion.applicable_menu_item_ids.length
    ? ctx.lines.filter((l) => promotion.applicable_menu_item_ids.includes(l.menu_item_id))
    : ctx.lines;
  const applicableTotal = round2(applicable.reduce((s, l) => s + l.line_total, 0));
  if (applicable.length === 0 || applicableTotal <= 0) {
    return fail("promo_items", "Your cart doesn't include the items this promotion applies to.");
  }

  let discount = 0;
  let freeDelivery = false;

  switch (promotion.kind) {
    case "free_delivery":
      freeDelivery = true;
      discount = 0;
      break;
    case "percent_off":
    case "first_order":
      discount = (applicableTotal * Number(promotion.value ?? 0)) / 100;
      break;
    case "amount_off":
    case "combo":
      discount = Number(promotion.value ?? 0);
      break;
    case "bogo": {
      // Cheapest unit free for every pair of applicable units.
      const units: number[] = [];
      for (const line of applicable) {
        for (let i = 0; i < line.quantity; i++) units.push(line.unit_price);
      }
      units.sort((a, b) => a - b);
      const freeCount = Math.floor(units.length / 2);
      discount = units.slice(0, freeCount).reduce((s, u) => s + u, 0);
      break;
    }
  }

  if (promotion.max_discount_amount != null) {
    discount = Math.min(discount, Number(promotion.max_discount_amount));
  }
  discount = round2(Math.max(0, Math.min(discount, applicableTotal)));

  if (discount <= 0 && !freeDelivery) {
    return fail("promo_no_value", "This promotion doesn't reduce your current order total.");
  }

  return { promotion, discount, freeDelivery };
}

export function computeTotals(input: {
  lines: PricedLine[];
  deliveryFee: number;
  promotion: PromotionEvaluation | null;
}) {
  const subtotal = round2(input.lines.reduce((s, l) => s + l.line_total, 0));
  const deliveryFee = input.promotion?.freeDelivery ? 0 : round2(input.deliveryFee);
  const discount = round2(input.promotion?.discount ?? 0);
  const total = round2(Math.max(0, subtotal - discount + deliveryFee));
  return { subtotal, deliveryFee, discount, total };
}

/* ---------------- Availability ---------------- */

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

type DayHours = { open?: string; close?: string; closed?: boolean };

/** null = no schedule published (treated as always available). */
export function openNow(hours: unknown, now = new Date()): boolean | null {
  if (!hours || typeof hours !== "object" || Array.isArray(hours)) return null;
  const map = hours as Record<string, DayHours>;
  if (Object.keys(map).length === 0) return null;
  const key = DAY_KEYS[now.getDay()]!;
  const day = map[key] ?? map[key.slice(0, 3)];
  if (!day || day.closed) return false;
  if (!day.open || !day.close) return null;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const toMin = (v: string) => {
    const [h, m] = v.split(":");
    return (Number(h) || 0) * 60 + (Number(m) || 0);
  };
  const open = toMin(day.open);
  const close = toMin(day.close);
  return close > open ? minutes >= open && minutes < close : minutes >= open || minutes < close;
}

export type AvailabilityInput = {
  approval_status: string;
  is_accepting_orders: boolean;
  paused_until: string | null;
  pause_message: string | null;
  opening_hours: unknown;
  supports_delivery?: boolean;
  supports_pickup?: boolean;
};

export type AvailabilityResult = {
  canOrder: boolean;
  reason: string | null;
  isOpen: boolean | null;
};

export function restaurantAvailability(
  restaurant: AvailabilityInput,
  now = new Date(),
): AvailabilityResult {
  const isOpen = openNow(restaurant.opening_hours, now);
  if (restaurant.approval_status !== "approved") {
    return { canOrder: false, reason: "This restaurant is not available.", isOpen };
  }
  if (restaurant.paused_until && new Date(restaurant.paused_until) > now) {
    return {
      canOrder: false,
      reason:
        restaurant.pause_message ??
        `Orders temporarily unavailable until ${new Date(restaurant.paused_until).toLocaleTimeString()}.`,
      isOpen,
    };
  }
  if (!restaurant.is_accepting_orders) {
    return {
      canOrder: false,
      reason: restaurant.pause_message ?? "Orders temporarily unavailable.",
      isOpen,
    };
  }
  if (isOpen === false) {
    return { canOrder: false, reason: "This restaurant is currently closed.", isOpen };
  }
  return { canOrder: true, reason: null, isOpen };
}
