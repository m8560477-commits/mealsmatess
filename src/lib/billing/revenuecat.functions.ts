import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/lib/firebase-auth-middleware";
import { BILLING_TERMS_VERSION } from "./revenuecat-policy";

export const getNativeBillingConfig = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async () => {
    const { revenueCatConfig } = await import("./revenuecat.server");
    const { androidKey, offering, productIds, environment } = revenueCatConfig();
    return { androidKey, offering, productIds, environment };
  });
export const prepareNativePurchase = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((value: unknown) =>
    z
      .object({
        productId: z.string().min(1).max(300),
        termsVersion: z.literal(BILLING_TERMS_VERSION),
      })
      .parse(value),
  )
  .handler(async ({ context, data }) => {
    const { preflightPurchase, billingRateLimit } = await import("./revenuecat.server");
    await billingRateLimit(context.userId);
    return preflightPurchase(context.userId, data.productId);
  });
export const refreshNativeAccess = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { refreshRevenueCat, billingRateLimit } = await import("./revenuecat.server");
    await billingRateLimit(context.userId);
    return refreshRevenueCat(context.userId);
  });
