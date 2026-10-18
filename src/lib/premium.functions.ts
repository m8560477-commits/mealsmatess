import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/lib/firebase-auth-middleware";
import { loadFirebaseAdmin } from "@/lib/firebase-admin-access";
import { resolveEntitlement, requirePremiumAccess } from "@/lib/entitlements.server";
import { requireAdmin, isTrustedAdmin } from "@/lib/admin-access.server";
import { changeGrant } from "@/lib/premium-grants.server";

export type FeatureKey = "ai_chat" | "recipe_gen" | "meal_plan";

// ---------- Entitlement ----------
export const getMyEntitlement = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(({ context }) => resolveEntitlement(context.userId));

export const refreshMyEntitlement = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(({ context }) => resolveEntitlement(context.userId, true));

// ---------- Usage ----------
// Plan allowance summary (server-calculated from the database; limits are configurable in app_settings).
export const getMyUsage = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.firebase.rpc("my_ai_usage");
    if (error) throw new Error(error.message);
    const u = data as {
      day_used: number;
      day_max: number;
      month_used: number;
      month_max: number | null;
      favorites_used: number;
      favorites_max: number | null;
      plans_used: number;
      plans_max: number | null;
      day_resets_at: string;
      month_resets_at: string;
    };
    const usage: Record<
      string,
      { count: number; max: number; period: string; label: string; resetsAt: string | null }
    > = {
      ai_day: {
        count: u.day_used,
        max: u.day_max,
        period: "day",
        label: "Mia AI today",
        resetsAt: u.day_resets_at,
      },
    };
    if (u.month_max != null)
      usage["ai_month"] = {
        count: u.month_used,
        max: u.month_max,
        period: "month",
        label: "Mia AI this month",
        resetsAt: u.month_resets_at,
      };
    if (u.favorites_max != null)
      usage["favorites"] = {
        count: u.favorites_used,
        max: u.favorites_max,
        period: "total",
        label: "Saved favourites",
        resetsAt: null,
      };
    if (u.plans_max != null)
      usage["meal_plans"] = {
        count: u.plans_used,
        max: u.plans_max,
        period: "active",
        label: "Active meal plans",
        resetsAt: null,
      };
    return usage;
  });

// Called by AI server fns — returns { allowed, remaining } and increments atomically.
// If user is premium, always allow without incrementing.
export async function enforceAndIncrement(
  userId: string,
  _feature: FeatureKey,
): Promise<{ allowed: boolean; remaining: number; premium: boolean }> {
  await requirePremiumAccess(userId);
  return { allowed: true, remaining: Infinity, premium: true };
}

// ---------- Referral ----------
export const getMyReferral = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { firebaseAdmin } = await loadFirebaseAdmin();
    let { data: row } = await firebaseAdmin
      .from("referral_codes")
      .select("code")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!row) {
      const code = generateCode();
      await firebaseAdmin.from("referral_codes").insert({ user_id: context.userId, code });
      row = { code };
    }
    const { count: totalReferred } = await firebaseAdmin
      .from("referrals")
      .select("*", { count: "exact", head: true })
      .eq("referrer_id", context.userId);
    const { count: rewarded } = await firebaseAdmin
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
  .middleware([requireFirebaseAuth])
  .validator((v: unknown) => z.object({ code: z.string().min(4).max(16) }).parse(v))
  .handler(async ({ data, context }) => {
    const { firebaseAdmin } = await loadFirebaseAdmin();
    const code = data.code.trim().toUpperCase();
    const { data: owner } = await firebaseAdmin
      .from("referral_codes")
      .select("user_id")
      .eq("code", code)
      .maybeSingle();
    if (!owner) throw new Error("Invalid referral code");
    if (owner.user_id === context.userId) throw new Error("You can't refer yourself");
    const { data: existing } = await firebaseAdmin
      .from("referrals")
      .select("id")
      .eq("referred_id", context.userId)
      .maybeSingle();
    if (existing) throw new Error("You already used a referral code");

    await firebaseAdmin.from("referrals").insert({
      referrer_id: owner.user_id,
      referred_id: context.userId,
      code,
      reward_days: 14,
      status: "pending",
    });
    return {
      ok: true,
      message: "Referral saved — both of you get 14 free Premium days when you first subscribe.",
    };
  });

// ---------- Promo Codes ----------
export const redeemPromoCode = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((v: unknown) => z.object({ code: z.string().min(2).max(40) }).parse(v))
  .handler(async ({ data, context }) => {
    const { getFirebaseServerServices } = await import("@/server/firebase-admin");
    const { db, auth } = getFirebaseServerServices();
    const identity = await auth.getUser(context.userId);
    if (!identity.emailVerified || identity.disabled)
      throw new Error("Verify your email to redeem a promotion.");
    const code = data.code.trim().toUpperCase();
    return db.runTransaction(async (tx) => {
      const found = await tx.get(db.collection("promo_codes").where("code", "==", code).limit(1));
      const doc = found.docs[0];
      const promo = doc?.data();
      if (!doc || !promo?.enabled) throw new Error("Invalid or disabled promo code");
      if (promo.expires_at && Date.parse(promo.expires_at) <= Date.now())
        throw new Error("This promo code has expired");
      const redemption = db.collection("promo_redemptions").doc(`${doc.id}_${context.userId}`);
      const existing = await tx.get(redemption);
      const legacy = await tx.get(
        db
          .collection("promo_redemptions")
          .where("code_id", "==", doc.id)
          .where("user_id", "==", context.userId),
      );
      if (existing.exists || !legacy.empty) throw new Error("You've already redeemed this code");
      if (
        promo.max_redemptions != null &&
        Number(promo.redemption_count ?? 0) >= Number(promo.max_redemptions)
      )
        throw new Error("This promo code has been fully redeemed");
      const lifetime = promo.reward_kind === "lifetime";
      const days =
        promo.reward_kind === "free_month"
          ? 30
          : promo.reward_kind === "free_year"
            ? 365
            : promo.reward_kind === "free_days"
              ? Number(promo.reward_value)
              : 0;
      if (!lifetime && (!Number.isInteger(days) || days < 1 || days > 3650))
        throw new Error(
          "This code doesn't grant Premium days. Use provider-supported discounts at checkout.",
        );
      const now = new Date().toISOString();
      tx.set(db.collection("legacy_premium_access").doc(`promo_${doc.id}_${context.userId}`), {
        user_id: context.userId,
        tier: lifetime ? "lifetime" : "promo",
        status: "active",
        store: "promo",
        period_end: lifetime ? null : new Date(Date.now() + days * 86400000).toISOString(),
        created_at: now,
      });
      tx.set(redemption, {
        code_id: doc.id,
        user_id: context.userId,
        granted_days: days,
        granted_lifetime: lifetime,
        created_at: now,
      });
      tx.update(doc.ref, { redemption_count: Number(promo.redemption_count ?? 0) + 1 });
      tx.set(db.collection("audit_logs").doc(), {
        actor_id: context.userId,
        action: "promo.redeemed",
        target_id: doc.id,
        created_at: now,
      });
      return {
        ok: true,
        message: lifetime
          ? "Lifetime Premium access confirmed."
          : `${days} days of complimentary Premium added.`,
      };
    });
  });

// ---------- Admin ----------
const assertAdmin = requireAdmin;

export const adminListSubscribers = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { firebaseAdmin } = await loadFirebaseAdmin();
    const { data: subs } = await firebaseAdmin
      .from("subscriptions")
      .select(
        "id,user_id,tier,status,store,period_start,period_end,trial_end,auto_renew,is_manual,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    const subscriptionRows = (subs ?? []) as {
      id: string;
      user_id: string;
      tier: string;
      status: string;
      store?: string | null;
      period_start?: string | null;
      period_end?: string | null;
      trial_end?: string | null;
      auto_renew?: boolean | null;
      is_manual?: boolean | null;
      created_at: string;
    }[];
    const ids = Array.from(new Set(subscriptionRows.map((subscription) => subscription.user_id)));
    const { data: profiles } = await firebaseAdmin
      .from("profiles")
      .select("id,display_name")
      .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const profileRows = (profiles ?? []) as { id: string; display_name?: string | null }[];
    const profMap = new Map(profileRows.map((profile) => [profile.id, profile.display_name]));
    return subscriptionRows.map((subscription) => ({
      ...subscription,
      display_name: profMap.get(subscription.user_id) ?? "—",
    }));
  });

export const adminStats = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { firebaseAdmin } = await loadFirebaseAdmin();
    const [
      { count: active },
      { count: trialing },
      { count: lifetime },
      { count: refTotal },
      { count: refRewarded },
    ] = await Promise.all([
      firebaseAdmin
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("status", "active"),
      firebaseAdmin
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("status", "trialing"),
      firebaseAdmin
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("tier", "lifetime"),
      firebaseAdmin.from("referrals").select("*", { count: "exact", head: true }),
      firebaseAdmin
        .from("referrals")
        .select("*", { count: "exact", head: true })
        .eq("status", "rewarded"),
    ]);
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: payments30 } = await firebaseAdmin
      .from("payments")
      .select("amount_usd,kind")
      .gte("occurred_at", since)
      .in("kind", ["initial", "renewal", "trial_conversion"]);
    const revenue30 = ((payments30 ?? []) as { amount_usd?: number | string | null }[]).reduce(
      (sum, payment) => sum + Number(payment.amount_usd ?? 0),
      0,
    );
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
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { firebaseAdmin } = await loadFirebaseAdmin();
    const { data } = await firebaseAdmin
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
  .middleware([requireFirebaseAuth])
  .validator((v: unknown) => PromoInput.parse(v))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { firebaseAdmin } = await loadFirebaseAdmin();
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
      const { error } = await firebaseAdmin.from("promo_codes").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: inserted, error } = await firebaseAdmin
      .from("promo_codes")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });

export const adminDeletePromo = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { firebaseAdmin } = await loadFirebaseAdmin();
    const { error } = await firebaseAdmin.from("promo_codes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Compatibility entry points also use the isolated grant ledger.
export const adminGrantPremium = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((raw: unknown) =>
    z
      .object({ userId: z.string().min(1).max(128), days: z.number().int().min(1).max(3650) })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const { getFirebaseServerServices } = await import("@/server/firebase-admin");
    const user = await getFirebaseServerServices().auth.getUser(data.userId);
    if (!user.email) throw new Error("This user has no email.");
    return changeGrant(context.userId, "grant", { email: user.email, days: data.days });
  });
export const adminRevokePremium = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((raw: unknown) => z.object({ userId: z.string().min(1).max(128) }).parse(raw))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const { getFirebaseServerServices } = await import("@/server/firebase-admin");
    const user = await getFirebaseServerServices().auth.getUser(data.userId);
    if (!user.email) throw new Error("This user has no email.");
    return changeGrant(context.userId, "revoke", { email: user.email, days: 1 });
  });
export const adminIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => ({ isAdmin: await isTrustedAdmin(context.userId) }));
