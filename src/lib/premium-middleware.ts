import { createMiddleware, createServerOnlyFn } from "@tanstack/react-start";
import { requireFirebaseAuth } from "@/lib/firebase-auth-middleware";
const billing = createServerOnlyFn(() => import("@/server/revenuecat"));
export const requirePremium = createMiddleware({ type: "function" })
  .middleware([requireFirebaseAuth])
  .server(async ({ context, next }) => {
    await (await billing()).requireActivePremium(context.userId);
    return next();
  });
