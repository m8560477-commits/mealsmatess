import { Capacitor } from "@capacitor/core";

export type SubscriptionOption = { identifier: string; title: string; price: string };

async function configuration() {
  const platform = Capacitor.getPlatform();
  const response = await fetch(`/api/subscriptions/config?platform=${encodeURIComponent(platform)}`, { credentials: "same-origin" });
  if (!response.ok) throw new Error("Subscriptions are unavailable: the RevenueCat platform key or entitlement identifier needs configuration.");
  return await response.json() as { publicApiKey: string; entitlementId: string; userId: string };
}

async function webPurchases(config: Awaited<ReturnType<typeof configuration>>) {
  const { Purchases } = await import("@revenuecat/purchases-js");
  const purchases = Purchases.isConfigured() ? Purchases.getSharedInstance() : Purchases.configure({ apiKey: config.publicApiKey, appUserId: config.userId });
  if (purchases.getAppUserId() !== config.userId) await purchases.changeUser(config.userId);
  return purchases;
}

async function nativePurchases(config: Awaited<ReturnType<typeof configuration>>) {
  const { Purchases } = await import("@revenuecat/purchases-capacitor");
  if (!(await Purchases.isConfigured()).isConfigured) await Purchases.configure({ apiKey: config.publicApiKey, appUserID: config.userId });
  else await Purchases.logIn({ appUserID: config.userId });
  return Purchases;
}

export async function subscriptionOptions(): Promise<SubscriptionOption[]> {
  const config = await configuration();
  if (Capacitor.isNativePlatform()) {
    const offerings = await (await nativePurchases(config)).getOfferings();
    return offerings.current?.availablePackages.map(pkg => ({ identifier: pkg.identifier, title: pkg.product.title, price: pkg.product.priceString })) ?? [];
  }
  const offerings = await (await webPurchases(config)).getOfferings();
  return offerings.current?.availablePackages.map(pkg => ({ identifier: pkg.identifier, title: pkg.product.displayName, price: pkg.product.currentPrice.formattedPrice })) ?? [];
}

export async function syncSubscription() {
  const response = await fetch("/api/subscriptions/verify", { method: "POST", credentials: "same-origin" });
  if (!response.ok) throw new Error("Purchase status cannot be verified yet. Premium is not granted until server verification succeeds.");
  return await response.json() as { isPremium: boolean };
}

export async function purchaseSubscription(identifier: string) {
  const config = await configuration();
  if (Capacitor.isNativePlatform()) {
    const purchases = await nativePurchases(config);
    const offerings = await purchases.getOfferings();
    const selected = offerings.current?.availablePackages.find(pkg => pkg.identifier === identifier);
    if (!selected) throw new Error("This subscription is no longer available");
    await purchases.purchasePackage({ aPackage: selected });
  } else {
    const purchases = await webPurchases(config);
    const offerings = await purchases.getOfferings();
    const selected = offerings.current?.availablePackages.find(pkg => pkg.identifier === identifier);
    if (!selected) throw new Error("This subscription is no longer available");
    await purchases.purchase({ rcPackage: selected });
  }
  return syncSubscription();
}

export async function restoreSubscriptions() {
  const config = await configuration();
  if (Capacitor.isNativePlatform()) await (await nativePurchases(config)).restorePurchases();
  else await (await webPurchases(config)).getCustomerInfo();
  return syncSubscription();
}
