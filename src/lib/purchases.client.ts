import { Capacitor } from "@capacitor/core";
import { auth } from "@/lib/firebase";

export type PurchaseOffer = {
  id: string;
  title: string;
  price: string;
  period: string;
  trial14: boolean;
  purchase: () => Promise<void>;
};
let configuredUser: string | null = null;
let nativeConfigured = false;
async function client(userId: string) {
  if (auth.currentUser?.uid !== userId) throw new Error("Sign in again before purchasing.");
  if (Capacitor.isNativePlatform()) {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const key =
      Capacitor.getPlatform() === "ios"
        ? import.meta.env.VITE_REVENUECAT_IOS_API_KEY
        : import.meta.env.VITE_REVENUECAT_ANDROID_API_KEY;
    if (!key)
      throw new Error(
        "Purchases are not configured for this platform yet. Please contact MealMate support.",
      );
    if (!nativeConfigured) {
      await Purchases.configure({ apiKey: key, appUserID: userId });
      nativeConfigured = true;
    } else if (configuredUser !== userId) await Purchases.logIn({ appUserID: userId });
    configuredUser = userId;
    return { native: Purchases };
  }
  const { Purchases } = await import("@revenuecat/purchases-js");
  const key = import.meta.env.VITE_REVENUECAT_WEB_API_KEY;
  if (!key)
    throw new Error("Web purchases are not configured yet. Please contact MealMate support.");
  const web = Purchases.isConfigured()
    ? Purchases.getSharedInstance()
    : Purchases.configure({ apiKey: key, appUserId: userId });
  if (configuredUser !== userId) await web.changeUser(userId);
  configuredUser = userId;
  return { web };
}
let operations = Promise.resolve();
function withIdentity<T>(
  userId: string,
  run: (sdk: Awaited<ReturnType<typeof client>>) => Promise<T>,
): Promise<T> {
  const task = operations
    .catch(() => undefined)
    .then(async () => {
      const sdk = await client(userId);
      if (auth.currentUser?.uid !== userId)
        throw new Error("Your account changed. Reload the purchase options.");
      return run(sdk);
    });
  operations = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}
export async function loadPurchaseOffers(userId: string): Promise<PurchaseOffer[]> {
  return withIdentity(userId, async (sdk) => {
    if (sdk.native) {
      const offers = await sdk.native.getOfferings();
      const packages = offers.current?.availablePackages ?? [];
      const eligibility =
        Capacitor.getPlatform() === "ios"
          ? await sdk.native
              .checkTrialOrIntroductoryPriceEligibility({
                productIdentifiers: packages.map((pkg) => pkg.product.identifier),
              })
              .catch(() => ({}) as Record<string, { status: number }>)
          : ({} as Record<string, { status: number }>);
      return packages.map((pkg) => ({
        id: pkg.identifier,
        title: pkg.product.title,
        price: pkg.product.priceString,
        period: pkg.product.subscriptionPeriod ?? pkg.packageType,
        // Eligibility and any store trial are confirmed by the native checkout sheet.
        trial14:
          eligibility[pkg.product.identifier]?.status === 2 &&
          pkg.product.introPrice?.price === 0 &&
          ["P14D", "P2W"].includes(pkg.product.introPrice?.period ?? ""),
        purchase: async () => {
          if (auth.currentUser?.uid !== userId)
            throw new Error("Your account changed. Reload the purchase options.");
          await withIdentity(userId, async (current) => {
            await current.native!.purchasePackage({ aPackage: pkg });
          });
        },
      }));
    }
    const offers = await sdk.web!.getOfferings();
    return (offers.current?.availablePackages ?? []).map((pkg) => ({
      id: pkg.identifier,
      title: pkg.webBillingProduct.title,
      price: pkg.webBillingProduct.price.formattedPrice,
      period: pkg.webBillingProduct.normalPeriodDuration ?? "subscription",
      trial14: ["P14D", "P2W"].includes(pkg.webBillingProduct.freeTrialPhase?.periodDuration ?? ""),
      purchase: async () => {
        if (auth.currentUser?.uid !== userId)
          throw new Error("Your account changed. Reload the purchase options.");
        await withIdentity(userId, async (current) => {
          await current.web!.purchase({ rcPackage: pkg });
        });
      },
    }));
  });
}
export async function restorePurchaseHistory(userId: string) {
  await withIdentity(userId, async (sdk) => {
    if (sdk.native) await sdk.native.restorePurchases();
    else await sdk.web!.getCustomerInfo(); // Web purchases belong to the signed-in Firebase UID.
  });
}
