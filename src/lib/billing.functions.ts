import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { getCookie, setCookie, getRequest } from "@tanstack/react-start/server";
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
  return {
    appUserId: identity.customerId,
    offering: service.OFFERING,
    isActive: (await service.verifyRevenueCatCustomer(identity.customerId)).isPremium,
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
