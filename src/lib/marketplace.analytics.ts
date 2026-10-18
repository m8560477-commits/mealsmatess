/**
 * Thin client helper for marketplace analytics. Events are written by the
 * backend (never straight from the browser into the table) and failures are
 * non-blocking: analytics must never break an order.
 */
import { auth } from "@/lib/firebase";
import { trackMarketplaceEvent, trackMyMarketplaceEvent } from "@/lib/marketplace.functions";
import type { AnalyticsEventInput } from "@/lib/marketplace.schemas";

export async function track(event: AnalyticsEventInput): Promise<void> {
  try {
    const fn = auth.currentUser ? trackMyMarketplaceEvent : trackMarketplaceEvent;
    await fn({ data: event });
  } catch {
    // Analytics is best-effort by design.
  }
}

export function resetAnalyticsIdentity() {}
