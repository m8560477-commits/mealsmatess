import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import {
  loadStorePackages,
  purchaseStorePackage,
  restoreStorePurchases,
} from "@/lib/revenuecat-client";
import { refreshMyEntitlement } from "@/lib/premium.functions";
import { Button } from "@/components/ui/button";

export function StorePaywall() {
  const { user } = useSession();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const native = Capacitor.getPlatform() === "android";
  const packages = useQuery({
    queryKey: ["store-packages", user?.id],
    queryFn: () => loadStorePackages(user!.id),
    enabled: !!user && native,
    retry: false,
  });
  async function finish(operation: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await operation();
      const access = await refreshMyEntitlement();
      await client.invalidateQueries({ queryKey: ["entitlement"] });
      toast.info(
        access.isPremium
          ? "Premium access verified."
          : "Store action completed. Premium is not yet verified; refresh shortly or contact support.",
      );
    } catch (error) {
      if (!(error && typeof error === "object" && "userCancelled" in error && error.userCancelled))
        toast.error(
          "The purchase or verification could not complete. Check your connection and retry, or restore an existing purchase.",
        );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="mt-6 space-y-4 rounded-3xl border border-border bg-card p-5"
      aria-label="Google Play subscription plans"
    >
      <h2 className="text-xl font-semibold">Choose your subscription</h2>
      {!user ? (
        <p>Sign in to view subscriptions.</p>
      ) : !native ? (
        <p>
          Open MealMate on Android to see Google Play prices and purchase or restore a subscription.
        </p>
      ) : packages.isPending ? (
        <Loader2 className="animate-spin" aria-label="Loading Google Play products" />
      ) : packages.isError ? (
        <div>
          <p>{packages.error.message}</p>
          <Button onClick={() => void packages.refetch()}>Retry products</Button>
        </div>
      ) : (
        packages.data?.map((pkg) => (
          <article key={pkg.identifier} className="rounded-2xl border border-border p-4">
            <h3 className="font-semibold">{pkg.product.title}</h3>
            <p className="text-sm text-muted-foreground">{pkg.product.description}</p>
            <p className="mt-2 text-xl">
              {pkg.product.priceString}
              <span className="ml-2 text-sm">{pkg.product.subscriptionPeriod ?? ""}</span>
            </p>
            <Button
              className="mt-3"
              disabled={busy}
              onClick={() => void finish(() => purchaseStorePackage(user.id, pkg))}
            >
              Continue with Google Play
            </Button>
          </article>
        ))
      )}
      <p className="text-xs text-muted-foreground">
        Google Play confirms the price, billing period, renewal terms and any eligible trial before
        purchase. A seven-day trial is available only if Google Play offers it to your account.
      </p>
      <p className="text-xs text-muted-foreground">
        Family membership sharing is not currently implemented; family purchases are unavailable.
      </p>
      {user && native && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void finish(() => restoreStorePurchases(user.id))}
          >
            Restore purchases
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void finish(() => refreshMyEntitlement())}
          >
            Refresh access
          </Button>
        </div>
      )}
    </section>
  );
}
