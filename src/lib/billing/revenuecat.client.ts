import { Capacitor } from "@capacitor/core";
import { Purchases, type PurchasesPackage } from "@revenuecat/purchases-capacitor";
import { auth, onAuthStateChanged } from "@/lib/firebase";
import {
  getNativeBillingConfig,
  prepareNativePurchase,
  refreshNativeAccess,
} from "./revenuecat.functions";
import { approvedOffer, hasSevenDayTrial } from "./revenuecat-offers";
import { BILLING_TERMS_VERSION } from "./revenuecat-policy";

let tail: Promise<unknown> = Promise.resolve();
let configured = false;
let identity: string | null = null;
let listening = false;
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = tail.then(fn);
  tail = next.catch(() => undefined);
  return next;
}
function assertIdentity(uid: string) {
  if (auth.currentUser?.uid !== uid)
    throw new Error("Your account changed. Reopen subscriptions to continue.");
}
export function startNativeBillingIdentity() {
  if (listening || Capacitor.getPlatform() !== "android") return;
  listening = true;
  onAuthStateChanged(auth, (user) => {
    if (!user)
      void serial(async () => {
        if (configured && identity) {
          await Purchases.logOut();
          identity = null;
        }
      }).catch(() => {
        identity = null;
      });
  });
}
async function connect(uid: string) {
  if (Capacitor.getPlatform() !== "android")
    throw new Error("Open the Android app to manage Google Play purchases.");
  startNativeBillingIdentity();
  assertIdentity(uid);
  const config = await getNativeBillingConfig();
  assertIdentity(uid);
  if (!configured) {
    await Purchases.configure({ apiKey: config.androidKey, appUserID: uid });
    configured = true;
    identity = uid;
  } else if (identity !== uid) {
    await Purchases.logIn({ appUserID: uid });
    identity = uid;
  }
  assertIdentity(uid);
  return config;
}
export function nativeOffers(uid: string) {
  return serial(async () => {
    const config = await connect(uid);
    const offerings = await Purchases.getOfferings();
    assertIdentity(uid);
    return {
      packages: (offerings.all[config.offering]?.availablePackages ?? []).filter(
        (p) => approvedOffer(p, config.productIds) && hasSevenDayTrial(p),
      ),
      sandbox: config.environment === "SANDBOX",
    };
  });
}
export function nativeAction(uid: string, action: "restore" | "refresh" | PurchasesPackage) {
  return serial(async () => {
    const config = await connect(uid);
    let completedStoreAction = false;
    try {
      if (typeof action !== "string") {
        if (!approvedOffer(action, config.productIds) || !hasSevenDayTrial(action))
          throw new Error("An eligible 7-day trial is not available for this subscription.");
        await prepareNativePurchase({
          data: { productId: action.product.identifier, termsVersion: BILLING_TERMS_VERSION },
        });
        assertIdentity(uid);
        await Purchases.purchasePackage({ aPackage: action });
        completedStoreAction = true;
      } else if (action === "restore") {
        await Purchases.restorePurchases();
        completedStoreAction = true;
      }
      assertIdentity(uid);
      const verified = await refreshNativeAccess();
      assertIdentity(uid);
      return verified;
    } catch (error) {
      if (completedStoreAction)
        throw new Error(
          "The store action completed, but access could not be confirmed. Refresh access before purchasing again. Use the original MealMate account for restores.",
        );
      throw error;
    }
  });
}
