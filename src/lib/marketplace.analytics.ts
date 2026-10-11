/**
 * Thin client helper for marketplace analytics. Events are written by the
 * backend (never straight from the browser into the table) and failures are
 * non-blocking: analytics must never break an order.
 */
import { supabase } from "@/integrations/supabase/client";
import { trackMarketplaceEvent, trackMyMarketplaceEvent } from "@/lib/marketplace.functions";
import type { AnalyticsEventInput } from "@/lib/marketplace.schemas";

let signedIn: boolean | null = null;

export async function track(event: AnalyticsEventInput): Promise<void> {
  try {
    if (signedIn === null) {
      const { data } = await supabase.auth.getSession();
      signedIn = !!data.session;
    }
    const fn = signedIn ? trackMyMarketplaceEvent : trackMarketplaceEvent;
    await fn({ data: event });
  } catch {
    // Analytics is best-effort by design.
  }
}

export function resetAnalyticsIdentity() {
  signedIn = null;
}
