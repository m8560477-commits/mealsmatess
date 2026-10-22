import { Capacitor } from "@capacitor/core";
import { Purchases, LOG_LEVEL, type PurchasesPackage } from "@revenuecat/purchases-capacitor";
import { auth } from "@/lib/firebase";
let configured = false;
let identity: string | null = null;
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const next = queue.then(operation, operation);
  queue = next.catch(() => undefined);
  return next;
}
async function initialize(userId: string) {
  if (Capacitor.getPlatform() !== "android")
    throw new Error("Purchases are available in the MealMate Android app.");
  if (auth.currentUser?.uid !== userId) throw new Error("Sign in again before managing purchases.");
  const apiKey = import.meta.env.VITE_REVENUECAT_ANDROID_API_KEY;
  if (!apiKey?.startsWith("goog_"))
    throw new Error("Android billing is not configured. Contact MealMate support.");
  if (!configured) {
    await Purchases.setLogLevel({ level: LOG_LEVEL.ERROR });
    await Purchases.configure({ apiKey, appUserID: userId });
    configured = true;
    identity = userId;
  } else if (identity !== userId) {
    await Purchases.logIn({ appUserID: userId });
    identity = userId;
  }
}
export function loadStorePackages(userId: string) {
  return serialized(async () => {
    await initialize(userId);
    await Purchases.getCustomerInfo();
    const offerings = await Purchases.getOfferings();
    const offeringId = import.meta.env.VITE_REVENUECAT_OFFERING_ID;
    const offering = offeringId ? offerings.all[offeringId] : offerings.current;
    if (!offering?.availablePackages.length)
      throw new Error(
        "No subscription packages are available from Google Play. Please try again later.",
      );
    // Family entitlement sharing is not implemented; never sell a promise of shared access.
    const packages = offering.availablePackages.filter(
      (p) =>
        p.identifier !== import.meta.env.VITE_REVENUECAT_FAMILY_PACKAGE_ID &&
        !/family/i.test(`${p.identifier} ${p.product.identifier} ${p.product.title}`),
    );
    if (!packages.length) throw new Error("No supported individual subscriptions are available.");
    return packages;
  });
}
export function purchaseStorePackage(userId: string, aPackage: PurchasesPackage) {
  return serialized(async () => {
    await initialize(userId);
    const result = await Purchases.purchasePackage({ aPackage });
    if (auth.currentUser?.uid !== userId)
      throw new Error("Account changed. Sign in to the purchasing account to refresh access.");
    return result.customerInfo;
  });
}
export function restoreStorePurchases(userId: string) {
  return serialized(async () => {
    await initialize(userId);
    const result = await Purchases.restorePurchases();
    if (auth.currentUser?.uid !== userId)
      throw new Error("Account changed. Sign in again to refresh access.");
    return result.customerInfo;
  });
}
export function disconnectPurchases() {
  return serialized(async () => {
    if (configured && identity) {
      await Purchases.logOut();
      identity = null;
    }
  });
}
