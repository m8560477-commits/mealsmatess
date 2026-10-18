import { Link } from "@tanstack/react-router";
import { usePremium } from "@/hooks/use-premium";
export function PlanStatusCard() {
  const { isPremium, entitlement, loading, error } = usePremium();
  return (
    <section className="rounded-3xl border bg-card p-5">
      <h2 className="font-display text-xl">MealMate Premium</h2>
      <p className="my-2 text-sm">
        {loading
          ? "Checking access…"
          : error
            ? "Access could not be verified."
            : isPremium
              ? `Active${entitlement?.trialActive ? " · Trial" : ""}${entitlement?.periodEnd ? ` · ${entitlement.autoRenew ? "Renews" : "Access until"} ${new Date(entitlement.periodEnd).toLocaleDateString()}` : ""}`
              : "Choose a subscription or restore your existing access."}
      </p>
      <Link className="underline" to="/premium">
        {isPremium ? "Manage Premium" : "See available plans"}
      </Link>
    </section>
  );
}
