import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Crown, Loader2, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/hooks/use-session";
import { purchaseSubscription, restoreSubscriptions, subscriptionOptions } from "@/lib/subscriptions";
import { Button } from "@/components/ui/button";

export function SubscriptionOptions() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const offerings = useQuery({ queryKey: ["subscription-offerings", user?.id], queryFn: subscriptionOptions, enabled: !!user, retry: false });
  async function transact(identifier?: string) {
    if (busy) return;
    setBusy(true);
    try {
      const verified = identifier ? await purchaseSubscription(identifier) : await restoreSubscriptions();
      await queryClient.invalidateQueries({ queryKey: ["entitlement"] });
      await queryClient.invalidateQueries({ queryKey: ["usage"] });
      toast[verified.isPremium ? "success" : "info"](verified.isPremium ? "Premium purchase verified." : "No active Premium entitlement was found for this account.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Subscription verification failed");
    } finally { setBusy(false); }
  }
  return (
    <article className="rounded-[30px] border border-orange-300/50 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 p-6 dark:from-amber-950/60 dark:to-rose-950/60">
      <h2 className="flex items-center gap-2 font-display text-2xl font-bold"><Crown className="h-6 w-6 text-orange-500" /> Choose Premium</h2>
      <p className="mt-2 text-sm text-muted-foreground">Available plans, prices, and trial terms come directly from your store checkout.</p>
      {!user ? <Button asChild className="mt-4"><Link to="/auth">Sign in to view subscriptions</Link></Button> : <>
        {offerings.isLoading && <p className="mt-4 flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading store offerings…</p>}
        {offerings.error && <p role="status" className="mt-4 text-sm text-muted-foreground">Subscriptions are not available on this platform yet. Store offerings and the Premium entitlement need to be connected.</p>}
        {offerings.data?.length === 0 && <p className="mt-4 text-sm text-muted-foreground">No subscription packages are configured in the current RevenueCat offering.</p>}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{offerings.data?.map(option => <Button key={option.identifier} disabled={busy} onClick={() => void transact(option.identifier)} className="h-auto min-h-14 whitespace-normal rounded-2xl bg-gradient-to-r from-amber-500 to-rose-500 px-4 py-3 text-white">{option.title} · {option.price}</Button>)}</div>
        <Button variant="outline" disabled={busy || !!offerings.error} onClick={() => void transact()} className="mt-4 rounded-2xl"><RefreshCcw className="mr-2 h-4 w-4" /> {busy ? "Verifying…" : "Restore / sync purchases"}</Button>
      </>}
    </article>
  );
}
