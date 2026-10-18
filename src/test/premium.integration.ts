import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createHmac } from "node:crypto";
const state = vi.hoisted(() => ({ services: null as unknown, uid: "member" }));
vi.mock("@/server/firebase-admin", () => ({
  firebaseAdmin: {},
  getFirebaseServerServices: () => state.services,
}));
vi.mock("@/lib/firebase-auth-middleware", () => ({ requireFirebaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerOnlyFn: (fn: unknown) => fn,
  createServerFn: () => {
    let validator = (v: unknown) => v;
    const builder = {
      middleware: () => builder,
      validator: (fn: typeof validator) => {
        validator = fn;
        return builder;
      },
      handler: (fn: (opts: unknown) => unknown) => (opts?: { data?: unknown }) =>
        fn({ context: { userId: state.uid }, data: validator(opts?.data) }),
    };
    return builder;
  },
}));
const ai = vi.hoisted(() => ({ summary: vi.fn(), recipe: vi.fn() }));
vi.mock("@/lib/security.server", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/lib/ai-engine.server", () => ({
  generateAiObject: ai.summary,
  deduplicateAiRequest: (_key: string, fn: () => unknown) => fn(),
}));
vi.mock("@/lib/recipe-generation.server", () => ({
  callModel: ai.recipe,
  toDbRecipe: (value: unknown) => value,
}));
import {
  createOnboardingExperience,
  getOnboardingExperience,
  completeOnboarding,
} from "@/lib/onboarding.functions";
import { redeemPromoCode } from "@/lib/premium.functions";
import { writePersonalItems } from "@/lib/personal-items.functions";
import { claimEliteRewardFor } from "@/lib/xp.server";
import {
  changeGrant,
  activatePendingGrant,
  grantId,
  listGrants,
} from "@/lib/premium-grants.server";
import { resolveEntitlement } from "@/lib/entitlements.server";
import {
  inviteFamilyMember,
  acceptFamilyInvitation,
  removeFamilyMember,
  leaveFamily,
} from "@/lib/family.functions";
import { getMyPreferences, saveMyPreferences } from "@/lib/preferences.functions";
import { managePremiumGrant } from "@/lib/premium-grants.functions";
import { handleRevenueCatWebhook } from "@/routes/api/public/webhooks.revenuecat";
const project = "demo-mealmate";
if (
  process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099"
)
  throw new Error("Integration tests require local demo emulators.");
const app = initializeApp({ projectId: project }, "premium-integration");
const db = getFirestore(app, "default");
const auth = getAuth(app);
state.services = { db, auth };
const future = () => new Date(Date.now() + 30 * 86400000).toISOString();
const billing = (uid = "member", extra = {}) => ({
  user_id: uid,
  is_active: true,
  is_trial: false,
  is_family: false,
  expires_at: future(),
  verified_at: new Date().toISOString(),
  auto_renew: true,
  ...extra,
});
beforeAll(async () => {
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${project}/accounts`, {
    method: "DELETE",
  });
  for (const [uid, email, verified] of [
    ["admin", "admin@example.test", true],
    ["member", "member@example.test", true],
    ["new", "future@example.test", false],
    ["owner", "owner@example.test", true],
    ["outsider", "outsider@example.test", true],
  ] as const)
    await auth.createUser({ uid, email, emailVerified: verified });
});
beforeEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.stubEnv("MEALMATE_ADMIN_UIDS", "admin");
  vi.stubEnv("REVENUECAT_SECRET_API_KEY", "");
  state.uid = "member";
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${project}/databases/default/documents`, {
    method: "DELETE",
  });
  await auth.updateUser("new", { emailVerified: false });
});
afterAll(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await db.terminate();
  await deleteApp(app);
});
describe("real Firebase transactions and access", () => {
  it("denies ordinary users on every grant operation, listing and server wrapper", async () => {
    for (const action of ["grant", "extend", "revoke"] as const)
      await expect(
        changeGrant("member", action, { email: "member@example.test", days: 30 }),
      ).rejects.toMatchObject({ status: 403 });
    await expect(listGrants("member")).rejects.toMatchObject({ status: 403 });
    await expect(
      managePremiumGrant({ data: { email: "member@example.test", days: 30, action: "grant" } }),
    ).rejects.toMatchObject({ status: 403 });
    expect((await db.collection("premium_grants").get()).empty).toBe(true);
  });
  it("activates normalized pending grants only after authoritative email verification", async () => {
    await changeGrant("admin", "grant", { email: " FUTURE@EXAMPLE.TEST ", days: 14 });
    await activatePendingGrant("new");
    expect(
      (await db.collection("premium_grants").doc(grantId("future@example.test")).get()).data()
        ?.user_id,
    ).toBeNull();
    expect((await resolveEntitlement("new")).isPremium).toBe(false);
    await auth.updateUser("new", { emailVerified: true });
    await Promise.all([activatePendingGrant("new"), activatePendingGrant("new")]);
    const ref = db.collection("premium_grants").doc(grantId("future@example.test"));
    expect((await ref.get()).data()?.user_id).toBe("new");
    expect((await ref.collection("history").where("action", "==", "activated").get()).size).toBe(1);
    expect((await resolveEntitlement("new")).isPremium).toBe(true);
  });
  it("saves a future-signup grant and binds it after account creation", async () => {
    await changeGrant("admin", "grant", { email: "not-yet@example.test", days: 7 });
    const created = await auth.createUser({ email: "not-yet@example.test", emailVerified: true });
    await activatePendingGrant(created.uid);
    expect((await resolveEntitlement(created.uid)).isPremium).toBe(true);
    await auth.deleteUser(created.uid);
  });
  it("prevents duplicate grants and adds concurrent extensions atomically", async () => {
    const input = { email: "member@example.test", days: 7 };
    const results = await Promise.allSettled([
      changeGrant("admin", "grant", input),
      changeGrant("admin", "grant", input),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const ref = db.collection("premium_grants").doc(grantId(input.email));
    const old = (await ref.get()).data()!;
    await Promise.all([
      changeGrant("admin", "extend", input),
      changeGrant("admin", "extend", input),
    ]);
    const next = (await ref.get()).data()!;
    expect(Date.parse(next.expires_at) - Date.parse(old.expires_at)).toBe(14 * 86400000);
    expect((await ref.collection("history").get()).size).toBe(3);
  });
  it("revocation and expiration never alter an unrelated paid subscription", async () => {
    await db.collection("billing_customers").doc("member").set(billing());
    const paid = { user_id: "member", status: "active", store: "app_store", period_end: future() };
    await db.collection("subscriptions").doc("paid").set(paid);
    await changeGrant("admin", "grant", { email: "member@example.test", days: 30 });
    await changeGrant("admin", "revoke", { email: "member@example.test", days: 30 });
    expect((await resolveEntitlement("member")).sources.map((s) => s.source)).toEqual(["paid"]);
    expect((await db.collection("subscriptions").doc("paid").get()).data()).toEqual(paid);
    await db.collection("billing_customers").doc("member").delete();
    expect((await resolveEntitlement("member")).isPremium).toBe(false);
  });
  it("expires active grants without a scheduled task", async () => {
    await changeGrant("admin", "grant", { email: "member@example.test", days: 7 });
    await db
      .collection("premium_grants")
      .doc(grantId("member@example.test"))
      .update({ expires_at: new Date(Date.now() - 1).toISOString() });
    expect((await resolveEntitlement("member")).isPremium).toBe(false);
    expect((await listGrants("admin")).counts.expired).toBe(1);
  });
  it("rejects malformed email and duration server-side", async () => {
    for (const input of [
      { email: "bad", days: 7 },
      { email: "member@example.test", days: 0 },
      { email: "member@example.test", days: 3651 },
    ])
      await expect(changeGrant("admin", "grant", input)).rejects.toThrow();
  });
  it("migrates manual grants once without touching original subscriptions", async () => {
    const old = {
      user_id: "member",
      is_manual: true,
      store: "admin",
      status: "active",
      period_end: future(),
    };
    await db.collection("subscriptions").doc("legacy").set(old);
    expect((await resolveEntitlement("member")).isPremium).toBe(true);
    await changeGrant("admin", "revoke", { email: "member@example.test", days: 1 });
    expect((await resolveEntitlement("member")).isPremium).toBe(false);
    expect((await db.collection("subscriptions").doc("legacy").get()).data()).toEqual(old);
  });
  it("uses only fresh provider verification during outages", async () => {
    vi.stubEnv("REVENUECAT_SECRET_API_KEY", "synthetic-test-only");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await db.collection("billing_customers").doc("member").set(billing());
    expect(await resolveEntitlement("member", true)).toMatchObject({
      isPremium: true,
      billingUnavailable: true,
    });
    await db
      .collection("billing_customers")
      .doc("member")
      .update({ verified_at: new Date(Date.now() - 7 * 3600000).toISOString() });
    expect(await resolveEntitlement("member", true)).toMatchObject({
      isPremium: false,
      billingUnavailable: true,
    });
  });
  it("requires verified matching family email and preserves a member's paid access on removal", async () => {
    await db
      .collection("billing_customers")
      .doc("owner")
      .set(billing("owner", { is_family: true }));
    state.uid = "owner";
    await inviteFamilyMember({ data: { email: "future@example.test" } });
    const id = `owner_${grantId("future@example.test")}`;
    state.uid = "outsider";
    await expect(acceptFamilyInvitation({ data: { id } })).rejects.toThrow();
    state.uid = "new";
    await expect(acceptFamilyInvitation({ data: { id } })).rejects.toThrow(/Verify/);
    await auth.updateUser("new", { emailVerified: true });
    await acceptFamilyInvitation({ data: { id } });
    expect((await resolveEntitlement("new")).sources[0]?.source).toBe("family");
    await db
      .collection("billing_customers")
      .doc("owner")
      .update({ expires_at: new Date(Date.now() - 1).toISOString() });
    expect((await resolveEntitlement("new")).isPremium).toBe(false);
    await db
      .collection("billing_customers")
      .doc("owner")
      .set(billing("owner", { is_family: true }));
    await db.collection("billing_customers").doc("new").set(billing("new"));
    state.uid = "owner";
    await removeFamilyMember({ data: { email: "future@example.test" } });
    expect((await resolveEntitlement("new")).sources.map((s) => s.source)).toEqual(["paid"]);
  });
  it("does not let complimentary owners create family access, enforces seats and supports leaving", async () => {
    await changeGrant("admin", "grant", { email: "owner@example.test", days: 30 });
    state.uid = "owner";
    await expect(inviteFamilyMember({ data: { email: "member@example.test" } })).rejects.toThrow(
      /family subscription/,
    );
    await db
      .collection("billing_customers")
      .doc("owner")
      .set(billing("owner", { is_family: true }));
    await inviteFamilyMember({ data: { email: "member@example.test" } });
    for (let i = 0; i < 4; i++)
      await inviteFamilyMember({ data: { email: `seat${i}@example.test` } });
    await expect(inviteFamilyMember({ data: { email: "sixth@example.test" } })).rejects.toThrow(
      /five/,
    );
    state.uid = "member";
    await acceptFamilyInvitation({ data: { id: `owner_${grantId("member@example.test")}` } });
    await leaveFamily();
    expect((await resolveEntitlement("member")).isPremium).toBe(false);
  });
  it("persists profile progress and preserves old answers without allowing client completion", async () => {
    await db
      .collection("users")
      .doc("member")
      .set({
        id: "member",
        displayName: "Existing",
        allergies: ["sesame"],
        onboarding_completed: false,
      });
    await saveMyPreferences({
      data: { goals: ["Save time"], onboarding_step: 5, onboarding_completed: true },
    });
    expect(await getMyPreferences()).toMatchObject({
      display_name: "Existing",
      allergies: ["sesame"],
      goals: ["Save time"],
      onboarding_step: 5,
      onboarding_completed: false,
    });
    state.uid = "outsider";
    expect((await getMyPreferences()).allergies).toEqual([]);
  });
});
describe("signed webhook lifecycle", () => {
  function request(event: unknown, tamper = false) {
    const raw = JSON.stringify({ event });
    const t = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", "test-signing").update(`${t}.${raw}`).digest("hex");
    return new Request("https://example.test/api/public/webhooks/revenuecat", {
      method: "POST",
      body: raw,
      headers: {
        authorization: "Bearer test-bearer",
        "x-revenuecat-webhook-signature": `t=${t},v1=${tamper ? "0".repeat(64) : signature}`,
      },
    });
  }
  function provider(extra = {}) {
    vi.stubEnv("REVENUECAT_WEBHOOK_SECRET", "test-bearer");
    vi.stubEnv("REVENUECAT_WEBHOOK_SIGNING_SECRET", "test-signing");
    vi.stubEnv("REVENUECAT_SECRET_API_KEY", "test-api");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          subscriber: {
            entitlements: { premium: { product_identifier: "monthly", expires_date: future() } },
            subscriptions: { monthly: { period_type: "normal", ...extra } },
          },
        }),
      ),
    );
  }
  it("rejects unsigned events before any provider work", async () => {
    provider();
    expect(
      (
        await handleRevenueCatWebhook(
          request({ id: "bad", type: "RENEWAL", app_user_id: "member" }, true),
        )
      ).status,
    ).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("deduplicates concurrent renewals and records real paid state", async () => {
    provider();
    const mocked = fetch as ReturnType<typeof vi.fn>;
    mocked.mockImplementation(async () =>
      Response.json({
        subscriber: {
          entitlements: { premium: { product_identifier: "monthly", expires_date: future() } },
          subscriptions: { monthly: { period_type: "normal" } },
        },
      }),
    );
    const evt = {
      id: "renew",
      type: "RENEWAL",
      app_user_id: "member",
      price: 10,
      currency: "USD",
      environment: "PRODUCTION",
    };
    const results = await Promise.all([
      handleRevenueCatWebhook(request(evt)),
      handleRevenueCatWebhook(request(evt)),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect((await db.collection("subscription_events").get()).size).toBe(1);
    expect((await db.collection("payments").get()).size).toBe(1);
    expect((await resolveEntitlement("member")).isPremium).toBe(true);
  });
  it("cancellation keeps paid access; expiration removes it; grants remain independent", async () => {
    provider({ unsubscribe_detected_at: new Date().toISOString() });
    await changeGrant("admin", "grant", { email: "member@example.test", days: 7 });
    expect(
      (
        await handleRevenueCatWebhook(
          request({ id: "cancel", type: "CANCELLATION", app_user_id: "member" }),
        )
      ).status,
    ).toBe(200);
    expect((await resolveEntitlement("member")).sources.map((s) => s.source)).toEqual([
      "paid",
      "complimentary",
    ]);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(Response.json({ subscriber: { entitlements: {}, subscriptions: {} } })),
    );
    expect(
      (
        await handleRevenueCatWebhook(
          request({ id: "expire", type: "EXPIRATION", app_user_id: "member" }),
        )
      ).status,
    ).toBe(200);
    expect((await resolveEntitlement("member")).sources.map((s) => s.source)).toEqual([
      "complimentary",
    ]);
  });
  it("returns retryable failure without recording success when verification fails", async () => {
    provider();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(
      (
        await handleRevenueCatWebhook(
          request({ id: "retry", type: "RENEWAL", app_user_id: "member" }),
        )
      ).status,
    ).toBe(503);
    expect((await db.collection("subscription_events").get()).empty).toBe(true);
  });
});
describe("onboarding generation and completion", () => {
  async function setup() {
    await saveMyPreferences({
      data: {
        display_name: "Alex",
        country: "ZA",
        goals: ["Save time"],
        cooking_level: "Beginner",
        cooking_time: "15–30 minutes",
        meal_types: ["Dinner"],
        allergies: ["peanuts"],
        onboarding_step: 9,
      },
    });
    for (const [id, name, ingredient] of [
      ["rice", "Tomato rice", "rice"],
      ["beans", "Bean stew", "beans"],
      ["soup", "Vegetable soup", "carrot"],
      ["unsafe", "Nut stew", "groundnuts"],
    ])
      await db
        .collection("recipes")
        .doc(id!)
        .set({
          id,
          slug: id,
          name,
          ingredients: [{ name: ingredient }],
          cooking_time_minutes: 20,
          difficulty: "Easy",
          category: "Dinner",
        });
    ai.summary.mockResolvedValue({
      greeting: "Hi Alex, here are quick dinners.",
      explanations: ["A quick dinner", "A practical pantry meal", "An easy starter"],
      prompts: ["How do I batch cook?", "How do I store leftovers?", "What should I shop for?"],
      shoppingTips: [],
    });
  }
  it("uses real catalog rows, excludes known allergens and caches successful generation", async () => {
    await setup();
    ai.summary.mockClear();
    const result = await createOnboardingExperience();
    expect(result.recipes.map((r) => r.id)).not.toContain("unsafe");
    expect(result.recipes).toHaveLength(3);
    expect(ai.recipe).not.toHaveBeenCalled();
    expect(await createOnboardingExperience()).toEqual(result);
    expect(ai.summary).toHaveBeenCalledOnce();
    await saveMyPreferences({ data: { allergies: ["rice"] } });
    expect(await getOnboardingExperience()).toBeNull();
  });
  it("never saves a fake experience after AI failure", async () => {
    await setup();
    ai.summary.mockRejectedValue(new Error("provider unavailable"));
    await expect(createOnboardingExperience()).rejects.toThrow(/provider unavailable/);
    expect((await db.collection("onboarding_experiences").doc("member").get()).exists).toBe(false);
    expect((await getMyPreferences()).onboarding_completed).toBe(false);
  });
  it("requires a real preview, required answers and valid Premium before completion", async () => {
    await setup();
    await expect(completeOnboarding()).rejects.toThrow(/subscription/);
    await changeGrant("admin", "grant", { email: "member@example.test", days: 7 });
    await expect(completeOnboarding()).rejects.toThrow(/preview/);
    await createOnboardingExperience();
    await saveMyPreferences({ data: { onboarding_step: 11 } });
    await completeOnboarding();
    expect((await getMyPreferences()).onboarding_completed).toBe(true);
  });
  it("bounds unpaid preview generation durably", async () => {
    await setup();
    ai.summary.mockRejectedValue(new Error("provider unavailable"));
    for (let i = 0; i < 3; i++)
      await expect(createOnboardingExperience()).rejects.toThrow(/provider unavailable/);
    await expect(createOnboardingExperience()).rejects.toThrow(/three experiences/);
  });
  it("redeems promotions atomically without duplicate extensions or paid mutations", async () => {
    await db.collection("promo_codes").doc("campaign").set({
      code: "TESTPROMO",
      enabled: true,
      reward_kind: "free_days",
      reward_value: 14,
      max_redemptions: 1,
      redemption_count: 0,
    });
    await db.collection("billing_customers").doc("member").set(billing());
    const results = await Promise.allSettled([
      redeemPromoCode({ data: { code: "TESTPROMO" } }),
      redeemPromoCode({ data: { code: "TESTPROMO" } }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await db.collection("promo_redemptions").get()).size).toBe(1);
    expect((await resolveEntitlement("member")).sources.map((s) => s.source)).toEqual([
      "paid",
      "legacy",
    ]);
  });
});

describe("Premium writes and earned rewards", () => {
  it("checks current entitlement for personal writes and rejects ownership spoofing", async () => {
    const data = {
      table: "favorites" as const,
      action: "insert" as const,
      rows: [{ id: "fixture", recipe_id: "rice" }],
    };
    await expect(writePersonalItems({ data })).rejects.toThrow(/active MealMate/);
    await changeGrant("admin", "grant", { email: "member@example.test", days: 7 });
    await expect(
      writePersonalItems({
        data: { ...data, rows: [{ id: "fixture", recipe_id: "rice", user_id: "owner" }] },
      }),
    ).rejects.toThrow(/account mismatch/);
    await writePersonalItems({ data });
    expect(
      (await db.collection("users").doc("member").collection("favorites").doc("fixture").get())
        .exists,
    ).toBe(true);
    await changeGrant("admin", "revoke", { email: "member@example.test", days: 1 });
    await expect(
      writePersonalItems({ data: { ...data, rows: [{ id: "newfixture", recipe_id: "rice" }] } }),
    ).rejects.toThrow(/active MealMate/);
  });
  it("claims an earned reward only once under concurrent requests", async () => {
    await db.collection("user_stats").doc("member").set({ user_id: "member", total_xp: 50000 });
    await db.collection("billing_customers").doc("member").set(billing());
    const result = await Promise.allSettled([
      claimEliteRewardFor("member"),
      claimEliteRewardFor("member"),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await db.collection("legacy_premium_access").get()).size).toBe(1);
    expect((await resolveEntitlement("member")).sources.map((s) => s.source)).toEqual([
      "paid",
      "legacy",
    ]);
  });
});
