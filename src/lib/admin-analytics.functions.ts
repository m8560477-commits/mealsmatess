import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

const RangeInput = z.object({
  from: z.string(),
  to: z.string(),
});

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: Date, to: Date): string[] {
  const out: string[] = [];
  const cur = new Date(from);
  cur.setUTCHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setUTCHours(0, 0, 0, 0);
  while (cur <= end) {
    out.push(dayKey(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

// ---------- Unified analytics ----------
export const getAdminAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => RangeInput.parse(v))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const from = new Date(data.from);
    const to = new Date(data.to);
    const fromIso = from.toISOString();
    const toIso = to.toISOString();
    const spanDays = Math.max(
      1,
      Math.ceil((to.getTime() - from.getTime()) / 86400000),
    );
    const prevFrom = new Date(from.getTime() - spanDays * 86400000);
    const prevTo = from;

    const [
      { count: totalUsers },
      { count: newUsers },
      { count: prevNewUsers },
      { data: userRows },
      { count: totalRecipes },
      { count: newRecipes },
      { data: paymentsRows },
      { data: prevPaymentsRows },
      { count: activeSubs },
      { count: trialing },
      { count: lifetime },
      { count: cancelled },
      { count: expired },
      { count: newSubs },
      { data: allRecipes },
      { data: favRows },
      { count: groceryItems },
      { count: mealPlansCount },
      { data: subscriptionsByStore },
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }),
      supabaseAdmin
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .gte("created_at", fromIso)
        .lte("created_at", toIso),
      supabaseAdmin
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .gte("created_at", prevFrom.toISOString())
        .lt("created_at", prevTo.toISOString()),
      supabaseAdmin
        .from("profiles")
        .select("created_at")
        .gte("created_at", fromIso)
        .lte("created_at", toIso),
      supabaseAdmin.from("recipes").select("*", { count: "exact", head: true }),
      supabaseAdmin
        .from("recipes")
        .select("*", { count: "exact", head: true })
        .gte("created_at", fromIso)
        .lte("created_at", toIso),
      supabaseAdmin
        .from("payments")
        .select("amount_usd,currency,kind,occurred_at")
        .gte("occurred_at", fromIso)
        .lte("occurred_at", toIso),
      supabaseAdmin
        .from("payments")
        .select("amount_usd")
        .gte("occurred_at", prevFrom.toISOString())
        .lt("occurred_at", prevTo.toISOString()),
      supabaseAdmin
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("status", "active"),
      supabaseAdmin
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("status", "trialing"),
      supabaseAdmin
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("tier", "lifetime"),
      supabaseAdmin
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
        .not("cancelled_at", "is", null)
        .gte("cancelled_at", fromIso)
        .lte("cancelled_at", toIso),
      supabaseAdmin
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("status", "expired"),
      supabaseAdmin
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
        .gte("created_at", fromIso)
        .lte("created_at", toIso),
      supabaseAdmin
        .from("recipes")
        .select("id,name,slug,category,cuisine,image_url,created_at")
        .order("created_at", { ascending: false })
        .limit(500),
      supabaseAdmin.from("favorites").select("recipe_id"),
      supabaseAdmin
        .from("grocery_items")
        .select("*", { count: "exact", head: true })
        .gte("created_at", fromIso)
        .lte("created_at", toIso),
      supabaseAdmin
        .from("meal_plans")
        .select("*", { count: "exact", head: true })
        .gte("created_at", fromIso)
        .lte("created_at", toIso),
      supabaseAdmin.from("subscriptions").select("store"),
    ]);

    // Users timeseries
    const bucket = new Map<string, number>();
    for (const k of daysBetween(from, to)) bucket.set(k, 0);
    for (const r of userRows ?? []) {
      const k = dayKey(new Date(r.created_at));
      if (bucket.has(k)) bucket.set(k, (bucket.get(k) ?? 0) + 1);
    }
    const userSeries = Array.from(bucket.entries()).map(([date, count]) => ({
      date,
      count,
    }));

    // Revenue timeseries + totals
    const revBucket = new Map<string, number>();
    for (const k of daysBetween(from, to)) revBucket.set(k, 0);
    let revenue = 0;
    let refunds = 0;
    const currencyBreakdown: Record<string, number> = {};
    for (const p of paymentsRows ?? []) {
      const amt = Number(p.amount_usd ?? 0);
      const k = dayKey(new Date(p.occurred_at));
      if (revBucket.has(k)) revBucket.set(k, (revBucket.get(k) ?? 0) + amt);
      if (p.kind === "refund") refunds += amt;
      else revenue += amt;
      const cur = p.currency ?? "USD";
      currencyBreakdown[cur] = (currencyBreakdown[cur] ?? 0) + amt;
    }
    const revenueSeries = Array.from(revBucket.entries()).map(([date, amount]) => ({
      date,
      amount: Number(amount.toFixed(2)),
    }));
    const prevRevenue = (prevPaymentsRows ?? []).reduce(
      (s, p) => s + Number(p.amount_usd ?? 0),
      0,
    );
    const revenueGrowth = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0;
    const userGrowth =
      (prevNewUsers ?? 0) > 0
        ? (((newUsers ?? 0) - (prevNewUsers ?? 0)) / (prevNewUsers ?? 1)) * 100
        : 0;

    // Top recipes (by favorites)
    const favMap = new Map<string, number>();
    for (const f of favRows ?? []) {
      favMap.set(f.recipe_id, (favMap.get(f.recipe_id) ?? 0) + 1);
    }
    const recipesById = new Map((allRecipes ?? []).map((r) => [r.id, r]));
    const topRecipes = Array.from(favMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, saves]) => {
        const r = recipesById.get(id);
        return {
          id,
          name: r?.name ?? "—",
          slug: r?.slug ?? "",
          image_url: r?.image_url ?? null,
          saves,
        };
      });

    // Category / cuisine breakdown
    const catCount = new Map<string, number>();
    const cuisineCount = new Map<string, number>();
    for (const r of allRecipes ?? []) {
      if (r.category) catCount.set(r.category, (catCount.get(r.category) ?? 0) + 1);
      if (r.cuisine) cuisineCount.set(r.cuisine, (cuisineCount.get(r.cuisine) ?? 0) + 1);
    }
    const topCategories = Array.from(catCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));
    const topCuisines = Array.from(cuisineCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));

    // Store breakdown
    const storeCount = new Map<string, number>();
    for (const s of subscriptionsByStore ?? []) {
      const k = s.store ?? "manual";
      storeCount.set(k, (storeCount.get(k) ?? 0) + 1);
    }
    const storeBreakdown = Array.from(storeCount.entries()).map(([name, count]) => ({
      name,
      count,
    }));

    const totalPremium = (activeSubs ?? 0) + (trialing ?? 0) + (lifetime ?? 0);
    const totalU = totalUsers ?? 0;
    const freeUsers = Math.max(0, totalU - totalPremium);
    const conversionRate = totalU > 0 ? (totalPremium / totalU) * 100 : 0;
    const arpu = totalPremium > 0 ? revenue / totalPremium : 0;

    return {
      range: { from: fromIso, to: toIso, days: spanDays },
      users: {
        total: totalU,
        new: newUsers ?? 0,
        growthPct: userGrowth,
        premium: totalPremium,
        free: freeUsers,
        series: userSeries,
      },
      revenue: {
        total: Number(revenue.toFixed(2)),
        refunds: Number(refunds.toFixed(2)),
        growthPct: revenueGrowth,
        arpu: Number(arpu.toFixed(2)),
        currencyBreakdown,
        series: revenueSeries,
      },
      subscriptions: {
        active: activeSubs ?? 0,
        trialing: trialing ?? 0,
        lifetime: lifetime ?? 0,
        cancelledInRange: cancelled ?? 0,
        expired: expired ?? 0,
        newInRange: newSubs ?? 0,
        conversionRate: Number(conversionRate.toFixed(2)),
        storeBreakdown,
      },
      recipes: {
        total: totalRecipes ?? 0,
        newInRange: newRecipes ?? 0,
        topByFavorites: topRecipes,
        categories: topCategories,
        cuisines: topCuisines,
      },
      grocery: {
        itemsInRange: groceryItems ?? 0,
      },
      planner: {
        entriesInRange: mealPlansCount ?? 0,
      },
    };
  });

// ---------- Audit logs ----------
export const adminListAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("audit_logs")
      .select("id,actor_id,action,target_table,target_id,ip_address,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    return data ?? [];
  });

// ---------- Users list ----------
export const adminListUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ search: z.string().optional() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("profiles")
      .select("id,display_name,username,currency,locale,created_at,follower_count,post_count")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.search && data.search.trim()) {
      const s = data.search.trim();
      q = q.or(`display_name.ilike.%${s}%,username.ilike.%${s}%`);
    }
    const { data: rows } = await q;
    return rows ?? [];
  });

// ---------- Send announcement ----------
export const adminSendAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        title: z.string().min(2).max(120),
        body: z.string().min(2).max(2000),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("announcements").insert({
      title: data.title,
      body: data.body,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Telemetry (AI / Scan / Nutrition events) ----------
export const getAdminTelemetry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => RangeInput.parse(v))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const from = new Date(data.from);
    const to = new Date(data.to);
    const fromIso = from.toISOString();
    const toIso = to.toISOString();

    const { data: events } = await supabaseAdmin
      .from("telemetry_events")
      .select("kind,name,latency_ms,success,user_id,created_at")
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: false })
      .limit(20000);

    const rows = events ?? [];
    const total = rows.length;
    const successes = rows.filter((r) => r.success).length;
    const successRate = total > 0 ? (successes / total) * 100 : 0;
    const latencies = rows.map((r) => r.latency_ms ?? 0).filter((n) => n > 0).sort((a, b) => a - b);
    const p50 = latencies.length ? latencies[Math.floor(latencies.length * 0.5)] : 0;
    const p95 = latencies.length ? latencies[Math.floor(latencies.length * 0.95)] : 0;
    const avgLatency = latencies.length ? Math.round(latencies.reduce((s, n) => s + n, 0) / latencies.length) : 0;

    // Series per day
    const dayBucket = new Map<string, { count: number; errors: number }>();
    for (const k of daysBetween(from, to)) dayBucket.set(k, { count: 0, errors: 0 });
    for (const r of rows) {
      const k = dayKey(new Date(r.created_at));
      const b = dayBucket.get(k);
      if (!b) continue;
      b.count += 1;
      if (!r.success) b.errors += 1;
    }
    const series = Array.from(dayBucket.entries()).map(([date, v]) => ({ date, count: v.count, errors: v.errors }));

    // By event name
    const byName = new Map<string, { count: number; errors: number; totalLatency: number; latCount: number }>();
    for (const r of rows) {
      const b = byName.get(r.name) ?? { count: 0, errors: 0, totalLatency: 0, latCount: 0 };
      b.count += 1;
      if (!r.success) b.errors += 1;
      if (r.latency_ms) {
        b.totalLatency += r.latency_ms;
        b.latCount += 1;
      }
      byName.set(r.name, b);
    }
    const events_by_name = Array.from(byName.entries())
      .map(([name, v]) => ({
        name,
        count: v.count,
        errors: v.errors,
        successRate: v.count > 0 ? Number(((v.count - v.errors) / v.count * 100).toFixed(1)) : 0,
        avgLatencyMs: v.latCount > 0 ? Math.round(v.totalLatency / v.latCount) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // By kind
    const byKind = new Map<string, number>();
    for (const r of rows) byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1);
    const events_by_kind = Array.from(byKind.entries()).map(([name, count]) => ({ name, count }));

    // Active users (distinct user_id)
    const activeUsers = new Set<string>();
    for (const r of rows) if (r.user_id) activeUsers.add(r.user_id);

    return {
      range: { from: fromIso, to: toIso },
      totals: {
        events: total,
        successRate: Number(successRate.toFixed(2)),
        errors: total - successes,
        activeUsers: activeUsers.size,
        avgLatencyMs: avgLatency,
        p50LatencyMs: p50,
        p95LatencyMs: p95,
      },
      series,
      events_by_name,
      events_by_kind,
    };
  });
