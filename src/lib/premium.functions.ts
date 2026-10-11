import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Free-tier limits — enforced server-side before any AI work
export const FREE_LIMITS = {
  ai_chat: { max: 10, period: "day" as const, label: "AI Chef chats" },
  recipe_gen: { max: 5, period: "day" as const, label: "recipe generations" },
  meal_plan: { max: 3, period: "month" as const, label: "meal plans" },
};
export type FeatureKey = keyof typeof FREE_LIMITS;

function periodKey(period: "day" | "month"): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  if (period === "month") return `${yyyy}-${mm}`;
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ---------- Entitlement ----------
export const getMyEntitlement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("user_id", context.userId)
      .in("status", ["trialing", "active", "in_grace"])
      .order("period_end", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    const now = Date.now();
    const active =
      !!sub &&
      (sub.tier === "lifetime" ||
        !sub.period_end ||
        new Date(sub.period_end).getTime() > now);

    return {
      isPremium: active,
      tier: (sub?.tier ?? "free") as string,
      status: (sub?.status ?? "expired") as string,
      trialActive: active && sub?.status === "trialing",
      periodEnd: sub?.period_end ?? null,
      trialEnd: sub?.trial_end ?? null,
      store: sub?.store ?? null,
      autoRenew: sub?.auto_renew ?? false,
      isManual: sub?.is_manual ?? false,
    };
  });

// ---------- Usage ----------
export const getMyUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const keys = (Object.keys(FREE_LIMITS) as FeatureKey[]).map((k) => ({
      feature: k,
      period: FREE_LIMITS[k].period,
      pk: periodKey(FREE_LIMITS[k].period),
    }));
    const { data } = await supabaseAdmin
      .from("usage_limits")
      .select("feature_key, period_key, count")
      .eq("user_id", context.userId)
      .in(
        "feature_key",
        keys.map((k) => k.feature),
      );

    const usage: Record<string, { count: number; max: number; period: string; label: string }> = {};
    for (const k of keys) {
      const row = data?.find((r) => r.feature_key === k.feature && r.period_key === k.pk);
      usage[k.feature] = {
        count: row?.count ?? 0,
        max: FREE_LIMITS[k.feature].max,
        period: k.period,
        label: FREE_LIMITS[k.feature].label,
      };
    }
    return usage;
  });

// Called by AI server fns — returns { allowed, remaining } and increments atomically.
// If user is premium, always allow without incrementing.
export async function enforceAndIncrement(
  userId: string,
  feature: FeatureKey,
): Promise<{ allowed: boolean; remaining: number; premium: boolean }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Premium check
  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("status,tier,period_end")
    .eq("user_id", userId)
    .in("status", ["trialing", "active", "in_grace"])
    .order("period_end", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const now = Date.now();
  const isPremium =
    !!sub &&
    (sub.tier === "lifetime" ||
      !sub.period_end ||
      new Date(sub.period_end).getTime() > now);
  if (isPremium) return { allowed: true, remaining: Infinity, premium: true };

  const cfg = FREE_LIMITS[feature];
  const pk = periodKey(cfg.period);
  const { data: existing } = await supabaseAdmin
    .from("usage_limits")
    .select("count")
    .eq("user_id", userId)
    .eq("feature_key", feature)
    .eq("period_key", pk)
    .maybeSingle();

  const current = existing?.count ?? 0;
  if (current >= cfg.max) return { allowed: false, remaining: 0, premium: false };

  await supabaseAdmin
    .from("usage_limits")
    .upsert(
      {
        user_id: userId,
        feature,
        feature_key: feature,
        period_start: new Date().toISOString(),
        period_key: pk,
        count: current + 1,
      },
      { onConflict: "user_id,feature_key,period_key" },
    );
  return { allowed: true, remaining: cfg.max - current - 1, premium: false };
}

// ---------- Referral ----------
export const getMyReferral = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let { data: row } = await supabaseAdmin
      .from("referral_codes")
      .select("code")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!row) {
      const code = generateCode();
      await supabaseAdmin.from("referral_codes").insert({ user_id: context.userId, code });
      row = { code };
    }
    const { count: totalReferred } = await supabaseAdmin
      .from("referrals")
      .select("*", { count: "exact", head: true })
      .eq("referrer_id", context.userId);
    const { count: rewarded } = await supabaseAdmin
      .from("referrals")
      .select("*", { count: "exact", head: true })
      .eq("referrer_id", context.userId)
      .eq("status", "rewarded");
    return { code: row.code, totalReferred: totalReferred ?? 0, rewarded: rewarded ?? 0 };
  });

function generateCode(len = 8): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

export const applyReferralCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ code: z.string().min(4).max(16) }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const code = data.code.trim().toUpperCase();
    const { data: owner } = await supabaseAdmin
      .from("referral_codes")
      .select("user_id")
      .eq("code", code)
      .maybeSingle();
    if (!owner) throw new Error("Invalid referral code");
    if (owner.user_id === context.userId) throw new Error("You can't refer yourself");
    const { data: existing } = await supabaseAdmin
      .from("referrals")
      .select("id")
      .eq("referred_id", context.userId)
      .maybeSingle();
    if (existing) throw new Error("You already used a referral code");

    await supabaseAdmin.from("referrals").insert({
      referrer_id: owner.user_id,
      referred_id: context.userId,
      code,
      reward_days: 14,
      status: "pending",
    });
    return { ok: true, message: "Referral saved — both of you get 14 free Premium days when you first subscribe." };
  });

// ---------- Promo Codes ----------
export const redeemPromoCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ code: z.string().min(2).max(40) }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const code = data.code.trim().toUpperCase();
    const { data: promo } = await supabaseAdmin
      .from("promo_codes")
      .select("*")
      .eq("code", code)
      .maybeSingle();
    if (!promo || !promo.enabled) throw new Error("Invalid or disabled promo code");
    if (promo.expires_at && new Date(promo.expires_at).getTime() < Date.now())
      throw new Error("This promo code has expired");
    if (promo.max_redemptions && promo.redemption_count >= promo.max_redemptions)
      throw new Error("This promo code has been fully redeemed");

    // Prevent duplicate redemption
    const { data: dup } = await supabaseAdmin
      .from("promo_redemptions")
      .select("id")
      .eq("code_id", promo.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (dup) throw new Error("You've already redeemed this code");

    let grantedDays = 0;
    let grantedLifetime = false;
    let tier: "monthly" | "annual" | "lifetime" | "promo" = "promo";

    switch (promo.reward_kind) {
      case "free_days":
        grantedDays = Number(promo.reward_value) || 0;
        break;
      case "free_month":
        grantedDays = 30;
        tier = "monthly";
        break;
      case "free_year":
        grantedDays = 365;
        tier = "annual";
        break;
      case "lifetime":
        grantedLifetime = true;
        tier = "lifetime";
        break;
      case "percent_discount":
        // Discount codes are informational only in-app; actual discount applied at native checkout
        break;
    }

    // Grant subscription time
    if (grantedDays > 0 || grantedLifetime) {
      const { data: current } = await supabaseAdmin
        .from("subscriptions")
        .select("*")
        .eq("user_id", context.userId)
        .order("period_end", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      const baseline = current?.period_end && new Date(current.period_end).getTime() > Date.now()
        ? new Date(current.period_end).getTime()
        : Date.now();
      const newEnd = grantedLifetime
        ? null
        : new Date(baseline + grantedDays * 86400000).toISOString();

      if (current) {
        await supabaseAdmin
          .from("subscriptions")
          .update({
            tier: grantedLifetime ? "lifetime" : tier,
            status: "active",
            period_end: newEnd,
            store: "promo",
            is_manual: true,
          })
          .eq("id", current.id);
      } else {
        await supabaseAdmin.from("subscriptions").insert({
          user_id: context.userId,
          tier: grantedLifetime ? "lifetime" : tier,
          status: "active",
          store: "promo",
          period_start: new Date().toISOString(),
          period_end: newEnd,
          is_manual: true,
        });
      }
    }

    await supabaseAdmin.from("promo_redemptions").insert({
      code_id: promo.id,
      user_id: context.userId,
      granted_days: grantedDays,
      granted_lifetime: grantedLifetime,
    });
    await supabaseAdmin
      .from("promo_codes")
      .update({ redemption_count: promo.redemption_count + 1 })
      .eq("id", promo.id);
    await supabaseAdmin.from("subscription_events").insert({
      user_id: context.userId,
      event_type: `promo:${promo.reward_kind}`,
      source: "promo",
      actor_id: context.userId,
      payload: { code, granted_days: grantedDays, granted_lifetime: grantedLifetime },
    });

    return {
      ok: true,
      message:
        promo.reward_kind === "percent_discount"
          ? `${promo.reward_value}% discount saved — it'll apply at checkout on mobile.`
          : grantedLifetime
            ? "Lifetime Premium unlocked! 🎉"
            : `${grantedDays} days of Premium added to your account.`,
    };
  });

// ---------- Admin ----------
async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

export const adminListSubscribers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: subs } = await supabaseAdmin
      .from("subscriptions")
      .select("id,user_id,tier,status,store,period_start,period_end,trial_end,auto_renew,is_manual,created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    const ids = Array.from(new Set((subs ?? []).map((s) => s.user_id)));
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id,display_name")
      .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const profMap = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
    return (subs ?? []).map((s) => ({ ...s, display_name: profMap.get(s.user_id) ?? "—" }));
  });

export const adminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ count: active }, { count: trialing }, { count: lifetime }, { count: refTotal }, { count: refRewarded }] =
      await Promise.all([
        supabaseAdmin.from("subscriptions").select("*", { count: "exact", head: true }).eq("status", "active"),
        supabaseAdmin.from("subscriptions").select("*", { count: "exact", head: true }).eq("status", "trialing"),
        supabaseAdmin.from("subscriptions").select("*", { count: "exact", head: true }).eq("tier", "lifetime"),
        supabaseAdmin.from("referrals").select("*", { count: "exact", head: true }),
        supabaseAdmin.from("referrals").select("*", { count: "exact", head: true }).eq("status", "rewarded"),
      ]);
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: payments30 } = await supabaseAdmin
      .from("payments")
      .select("amount_usd,kind")
      .gte("occurred_at", since)
      .in("kind", ["initial", "renewal", "trial_conversion"]);
    const revenue30 =
      (payments30 ?? []).reduce((sum, p) => sum + Number(p.amount_usd ?? 0), 0);
    return {
      active: active ?? 0,
      trialing: trialing ?? 0,
      lifetime: lifetime ?? 0,
      referralsTotal: refTotal ?? 0,
      referralsRewarded: refRewarded ?? 0,
      revenue30,
    };
  });

export const adminListPromos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("promo_codes")
      .select("*")
      .order("created_at", { ascending: false });
    return data ?? [];
  });

const PromoInput = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(2).max(40),
  reward_kind: z.enum(["percent_discount", "free_days", "free_month", "free_year", "lifetime"]),
  reward_value: z.number().int().min(0).max(100000).default(0),
  max_redemptions: z.number().int().positive().nullable().optional(),
  expires_at: z.string().nullable().optional(),
  enabled: z.boolean().default(true),
  notes: z.string().max(500).nullable().optional(),
});
export const adminSavePromo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => PromoInput.parse(v))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      code: data.code.trim().toUpperCase(),
      reward_kind: data.reward_kind,
      reward_value: data.reward_value,
      max_redemptions: data.max_redemptions ?? null,
      expires_at: data.expires_at ?? null,
      enabled: data.enabled,
      notes: data.notes ?? null,
      created_by: context.userId,
    };
    if (data.id) {
      const { error } = await supabaseAdmin.from("promo_codes").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: inserted, error } = await supabaseAdmin
      .from("promo_codes")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });

export const adminDeletePromo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("promo_codes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminGrantPremium = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ userId: z.string().uuid(), days: z.number().int().min(1).max(3650) }).parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: current } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("user_id", data.userId)
      .order("period_end", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    const baseline =
      current?.period_end && new Date(current.period_end).getTime() > Date.now()
        ? new Date(current.period_end).getTime()
        : Date.now();
    const newEnd = new Date(baseline + data.days * 86400000).toISOString();
    if (current) {
      await supabaseAdmin
        .from("subscriptions")
        .update({ status: "active", tier: current.tier === "free" ? "promo" : current.tier, period_end: newEnd, store: "admin", is_manual: true })
        .eq("id", current.id);
    } else {
      await supabaseAdmin.from("subscriptions").insert({
        user_id: data.userId,
        tier: "promo",
        status: "active",
        store: "admin",
        period_start: new Date().toISOString(),
        period_end: newEnd,
        is_manual: true,
      });
    }
    await supabaseAdmin.from("subscription_events").insert({
      user_id: data.userId,
      event_type: "admin:grant",
      source: "admin",
      actor_id: context.userId,
      payload: { days: data.days },
    });
    return { ok: true };
  });

export const adminRevokePremium = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ userId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("subscriptions")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("user_id", data.userId)
      .in("status", ["trialing", "active", "in_grace"]);
    await supabaseAdmin.from("subscription_events").insert({
      user_id: data.userId,
      event_type: "admin:revoke",
      source: "admin",
      actor_id: context.userId,
      payload: {},
    });
    return { ok: true };
  });

export const adminIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    return { isAdmin: !!data };
  });
