import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ACHIEVEMENTS, ELITE_XP, XP_ACTIONS, levelFor, type XpAction } from "@/lib/xp";

/** UTC day key, e.g. 2026-08-23 */
export function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

/** ISO-ish week key, e.g. 2026-W34 */
export function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function monthKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function unlock(userId: string, code: string) {
  await supabaseAdmin.from("user_achievements").upsert({ user_id: userId, code }, { onConflict: "user_id,code" });
}

async function syncLevelAchievements(userId: string, totalXp: number) {
  const map: [number, string][] = [
    [1, "first_xp"],
    [5000, "level_explorer"],
    [15000, "level_home_chef"],
    [30000, "level_mealmaster"],
    [ELITE_XP, "level_elite"],
  ];
  for (const [min, code] of map) {
    if (totalXp >= min) await unlock(userId, code);
  }
}

/** Update the daily streak; returns the new streak length. */
export async function touchStreak(userId: string) {
  const today = dayKey();
  const { data: stats } = await supabaseAdmin
    .from("user_stats")
    .select("current_streak,longest_streak,last_active_date")
    .eq("user_id", userId)
    .maybeSingle();

  if (stats?.last_active_date === today) return stats.current_streak;

  const yesterday = dayKey(new Date(Date.now() - 86400000));
  const next = stats?.last_active_date === yesterday ? (stats.current_streak ?? 0) + 1 : 1;
  const longest = Math.max(next, stats?.longest_streak ?? 0);

  await supabaseAdmin.from("user_stats").upsert(
    {
      user_id: userId,
      current_streak: next,
      longest_streak: longest,
      last_active_date: today,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (next >= 7) await unlock(userId, "streak_7");
  if (next >= 30) await unlock(userId, "streak_30");
  // Streak milestone XP — once per streak week, never farmable.
  if (next > 0 && next % 7 === 0) {
    await insertXp(userId, "streak_7", `streak:${userId}:${next}`, { streak: next });
  }
  return next;
}

async function insertXp(userId: string, action: XpAction, dedupeKey: string, metadata: Record<string, unknown> = {}) {
  const points = XP_ACTIONS[action].points;
  const { error } = await supabaseAdmin
    .from("xp_events")
    .insert({ user_id: userId, action, points, dedupe_key: dedupeKey, metadata: metadata as never });
  // 23505 = duplicate, meaning this exact award already happened. Not an error.
  if (error && error.code !== "23505") throw new Error(error.message);
  return !error;
}

/** Advance challenge progress for an action and award challenge XP on completion. */
async function progressChallenges(userId: string, action: XpAction) {
  const { data: challenges } = await supabaseAdmin
    .from("challenges")
    .select("id,code,kind,action,goal,xp_reward")
    .eq("is_active", true)
    .eq("action", action);

  for (const c of challenges ?? []) {
    const period = c.kind === "weekly" ? weekKey() : monthKey();
    const { data: existing } = await supabaseAdmin
      .from("user_challenges")
      .select("id,progress,completed_at")
      .eq("user_id", userId)
      .eq("challenge_id", c.id)
      .eq("period_key", period)
      .maybeSingle();

    if (existing?.completed_at) continue;
    const progress = (existing?.progress ?? 0) + 1;
    const completed = progress >= c.goal;

    await supabaseAdmin.from("user_challenges").upsert(
      {
        ...(existing?.id ? { id: existing.id } : {}),
        user_id: userId,
        challenge_id: c.id,
        period_key: period,
        progress,
        completed_at: completed ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,challenge_id,period_key" },
    );

    if (completed) {
      await insertXp(
        userId,
        c.kind === "weekly" ? "weekly_challenge" : "monthly_challenge",
        `challenge:${c.code}:${period}`,
        { challenge: c.code },
      );
    }
  }
}

/**
 * Award XP for an action. `refKey` makes the award idempotent — the same
 * recipe cooked twice in a day, or a replayed request, never double-pays.
 */
export async function awardXpFor(
  userId: string,
  action: XpAction,
  refKey: string,
  metadata: Record<string, unknown> = {},
) {
  const dedupeKey = `${action}:${refKey}`;
  const awarded = await insertXp(userId, action, dedupeKey, metadata);
  await touchStreak(userId);
  if (awarded) await progressChallenges(userId, action);

  const { data: stats } = await supabaseAdmin
    .from("user_stats")
    .select("total_xp")
    .eq("user_id", userId)
    .maybeSingle();
  const totalXp = stats?.total_xp ?? 0;
  await syncLevelAchievements(userId, totalXp);

  if (action === "recipe_cooked") {
    const { count } = await supabaseAdmin
      .from("xp_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("action", "recipe_cooked");
    if ((count ?? 0) >= 1) await unlock(userId, "cook_1");
    if ((count ?? 0) >= 10) await unlock(userId, "cook_10");
  }
  if (action === "weekly_plan_completed") await unlock(userId, "plan_1");
  if (action === "grocery_list_completed") {
    const { count } = await supabaseAdmin
      .from("xp_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("action", "grocery_list_completed");
    if ((count ?? 0) >= 5) await unlock(userId, "grocery_5");
  }

  return { awarded, points: awarded ? XP_ACTIONS[action].points : 0, totalXp, level: levelFor(totalXp) };
}

export async function fetchGamification(userId: string) {
  const [statsRes, eventsRes, achRes, challengeRes] = await Promise.all([
    supabaseAdmin.from("user_stats").select("*").eq("user_id", userId).maybeSingle(),
    supabaseAdmin
      .from("xp_events")
      .select("action,points,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(15),
    supabaseAdmin.from("user_achievements").select("code,unlocked_at").eq("user_id", userId),
    supabaseAdmin.from("challenges").select("*").eq("is_active", true),
  ]);

  const challenges = challengeRes.data ?? [];
  const periods = [...new Set(challenges.map((c) => (c.kind === "weekly" ? weekKey() : monthKey())))];
  const { data: userChallenges } = await supabaseAdmin
    .from("user_challenges")
    .select("challenge_id,period_key,progress,completed_at")
    .eq("user_id", userId)
    .in("period_key", periods.length ? periods : ["none"]);

  const totalXp = statsRes.data?.total_xp ?? 0;
  const unlocked = new Map((achRes.data ?? []).map((a) => [a.code, a.unlocked_at]));

  return {
    totalXp,
    level: levelFor(totalXp),
    currentStreak: statsRes.data?.current_streak ?? 0,
    longestStreak: statsRes.data?.longest_streak ?? 0,
    eliteRewardClaimedAt: statsRes.data?.elite_reward_claimed_at ?? null,
    eliteRewardAvailable: totalXp >= ELITE_XP && !statsRes.data?.elite_reward_claimed_at,
    recentEvents: (eventsRes.data ?? []).map((e) => ({
      action: e.action,
      points: e.points,
      created_at: e.created_at,
      label: XP_ACTIONS[e.action as XpAction]?.label ?? e.action,
    })),
    achievements: ACHIEVEMENTS.map((a) => ({
      ...a,
      unlockedAt: unlocked.get(a.code) ?? null,
    })),
    challenges: challenges.map((c) => {
      const period = c.kind === "weekly" ? weekKey() : monthKey();
      const uc = (userChallenges ?? []).find((u) => u.challenge_id === c.id && u.period_key === period);
      return {
        code: c.code,
        title: c.title,
        description: c.description,
        kind: c.kind,
        goal: c.goal,
        xpReward: c.xp_reward,
        progress: uc?.progress ?? 0,
        completedAt: uc?.completed_at ?? null,
      };
    }),
  };
}

/** 50,000 XP → 30 days of free Premium. Claimable once, ever. */
export async function claimEliteRewardFor(userId: string) {
  const { data: stats } = await supabaseAdmin
    .from("user_stats")
    .select("total_xp,elite_reward_claimed_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!stats || stats.total_xp < ELITE_XP) throw new Response("Not enough XP yet", { status: 400 });
  if (stats.elite_reward_claimed_at) throw new Response("Reward already claimed", { status: 400 });

  const now = new Date();
  const end = new Date(now.getTime() + 30 * 86400000);

  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("id,period_end,status")
    .eq("user_id", userId)
    .in("status", ["trialing", "active", "in_grace"])
    .order("period_end", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (sub) {
    const base = sub.period_end && new Date(sub.period_end) > now ? new Date(sub.period_end) : now;
    await supabaseAdmin
      .from("subscriptions")
      .update({
        period_end: new Date(base.getTime() + 30 * 86400000).toISOString(),
        status: "active",
        is_manual: true,
        updated_at: now.toISOString(),
      })
      .eq("id", sub.id);
  } else {
    await supabaseAdmin.from("subscriptions").insert({
      user_id: userId,
      tier: "promo",
      status: "active",
      store: "promo",
      is_manual: true,
      auto_renew: false,
      period_start: now.toISOString(),
      period_end: end.toISOString(),
    });
  }

  await supabaseAdmin
    .from("user_stats")
    .update({ elite_reward_claimed_at: now.toISOString(), updated_at: now.toISOString() })
    .eq("user_id", userId);

  return { ok: true, premiumUntil: end.toISOString() };
}
