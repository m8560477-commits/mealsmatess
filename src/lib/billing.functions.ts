import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { getCookie, setCookie, getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { loadFirebaseAdmin } from "@/lib/firebase-admin-access";
import { requireFirebaseAuth } from "@/lib/firebase-auth-middleware";

const billing = createServerOnlyFn(() => import("@/server/revenuecat"));
const COOKIE = "mealmate_purchase";
export const createPurchaseSession = createServerFn({ method: "POST" }).handler(async () => {
  let userId: string | undefined;
  const authorization = getRequest().headers.get("authorization");
  if (authorization) {
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    if (!match) throw new Response("Unauthorized", { status: 401 });
    try {
      userId = (await (await loadFirebaseAdmin()).verifyFirebaseIdToken(match[1]!)).uid;
    } catch {
      throw new Response("Unauthorized", { status: 401 });
    }
  }
  const service = await billing();
  service.assertBillingOrigin(getRequest());
  const identity = await service.purchaseIdentity(getCookie(COOKIE), userId);
  if (identity.token)
    setCookie(COOKIE, identity.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: getRequest().url.startsWith("https:"),
      path: "/",
      maxAge: 90 * 86400,
    });
  let isActive = (await service.verifyRevenueCatCustomer(identity.customerId)).isPremium;
  if (!isActive && userId) {
    isActive = (await service.verifyAccountAccess(userId, getCookie(COOKIE))).isPremium;
  }
  return {
    appUserId: identity.customerId,
    offering: service.OFFERING,
    isActive,
    webApiKey: process.env["REVENUECAT_WEB_PUBLIC_KEY"] ?? null,
    androidApiKey: process.env["REVENUECAT_ANDROID_PUBLIC_KEY"] ?? null,
  };
});
export const verifyCheckout = createServerFn({ method: "POST" }).handler(async () => {
  const service = await billing();
  service.assertBillingOrigin(getRequest());
  return service.verifyPurchaseSession(getCookie(COOKIE));
});
export const verifyMyPremium = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const service = await billing();
    service.assertBillingOrigin(getRequest());
    return service.verifyAccountAccess(context.userId, getCookie(COOKIE));
  });

/** Redeem a lifetime promo code or VIP email code. Requires sign-in. */
export const redeemPromoCode = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((value: unknown) => z.object({ code: z.string().trim().min(1).max(120) }).parse(value))
  .handler(async ({ data, context }) => {
    const service = await billing();
    service.assertBillingOrigin(getRequest());
    const code = data.code.trim().toLowerCase();

    let email = "";
    try {
      const claims = context.claims as { email?: string };
      email = (claims?.email ?? "").trim().toLowerCase();
    } catch {
      /* optional */
    }
    try {
      if (!email) {
        const { getFirebaseAdminFirestore } = await import("@/server/firebase-admin");
        getFirebaseAdminFirestore();
        const { getAuth } = await import("firebase-admin/auth");
        email = ((await getAuth().getUser(context.userId)).email ?? "").toLowerCase();
      }
    } catch {
      /* continue with code-only */
    }

    const isVipEmail = !!email && service.FREE_PREMIUM_EMAILS.has(email);
    const codeOk =
      service.LIFETIME_PROMO_CODES.has(code) || service.FREE_PREMIUM_EMAILS.has(code);

    // VIP account: signed-in VIP always gets free access.
    if (isVipEmail) {
      return service.grantManualPremium(context.userId, "free_email", email);
    }
    if (codeOk) {
      return service.grantManualPremium(context.userId, `promo:${code}`, email || null);
    }
    throw new Response("That promo code is not valid.", { status: 400 });
  });

// Intro progress is presentation state only and never participates in entitlement checks.
export const getIntroCompletion = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { getFirebaseAdminFirestore } = await loadFirebaseAdmin();
    return (
      await getFirebaseAdminFirestore().collection("intro_completion").doc(context.userId).get()
    ).exists;
  });
export const completeIntro = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { getFirebaseAdminFirestore } = await loadFirebaseAdmin();
    await getFirebaseAdminFirestore()
      .collection("intro_completion")
      .doc(context.userId)
      .set({ completed: true });
    return true;
  });
