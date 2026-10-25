import { useEffect, useState } from "react";
import { createClientOnlyFn } from "@tanstack/react-start";
import { Capacitor } from "@capacitor/core";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { PurchasesPackage } from "@revenuecat/purchases-capacitor";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { offerPrice } from "@/lib/billing/revenuecat-offers";

const loadBilling = createClientOnlyFn(() => import("@/lib/billing/revenuecat.client"));
export function useNativeBilling() {
  const [native, setNative] = useState(false);
  useEffect(() => setNative(Capacitor.getPlatform() === "android"), []);
  return native;
}
export function NativeBilling() {
  const { user } = useSession();
  return <NativeBillingAccount key={user?.id ?? "anonymous"} uid={user?.id} />;
}
function NativeBillingAccount({ uid }: { uid?: string }) {
  const qc = useQueryClient();
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [retry, setRetry] = useState(0);
  const [sandbox, setSandbox] = useState(false);
  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setPackages([]);
    setMessage("");
    loadBilling()
      .then((b) => b.nativeOffers(uid))
      .then((result) => {
        if (!active) return;
        setPackages(result.packages);
        setSandbox(result.sandbox);
      })
      .catch((error) => {
        if (active)
          setMessage(error instanceof Error ? error.message : "Subscriptions could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [uid, retry]);

  async function run(action: "restore" | "refresh" | PurchasesPackage) {
    if (!uid || busy || (typeof action !== "string" && !accepted)) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await (await loadBilling()).nativeAction(uid, action);
      setMessage(
        result.active
          ? "Premium access confirmed."
          : result.sandbox
            ? "Sandbox purchase verified. It does not grant live Premium access."
            : "No active subscription was found for this MealMate account. Refresh access if your payment is still processing; do not purchase again.",
      );
      await qc.invalidateQueries({ queryKey: ["entitlement", uid] });
    } catch (error) {
      const details = error as {
        code?: string | number;
        userCancelled?: boolean;
        message?: string;
      };
      setMessage(
        details.userCancelled || String(details.code) === "1"
          ? "Purchase cancelled. You have not been charged."
          : String(details.code) === "20"
            ? "Payment is pending. Refresh access after Google Play confirms it; do not purchase again."
            : details.message || "Billing could not complete. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!uid)
    return (
      <p className="py-6">
        <Link to="/auth" className="underline">
          Sign in
        </Link>{" "}
        to purchase or restore Premium.
      </p>
    );
  return (
    <section
      className="my-6 space-y-4"
      aria-label="Google Play subscriptions"
      aria-busy={busy || loading}
    >
      <h2 className="font-display text-xl">Google Play subscriptions</h2>
      {sandbox && <p>Sandbox testing — purchases do not grant live Premium.</p>}
      {loading ? (
        <p role="status">Loading store prices…</p>
      ) : (
        !packages.length && <p>No subscriptions are available right now.</p>
      )}
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          disabled={busy}
        />
        <span>
          I agree to the{" "}
          <Link to="/legal/terms" className="underline">
            Terms
          </Link>{" "}
          and acknowledge the{" "}
          <Link to="/legal/privacy" className="underline">
            Privacy Policy
          </Link>{" "}
          and renewal prices below.
        </span>
      </label>
      {packages.map((pkg) => (
        <div key={pkg.identifier} className="space-y-2 rounded-xl border p-4">
          <h3 className="font-semibold">
            {pkg.packageType === "ANNUAL" ? "Annual Premium" : "Monthly Premium"}
          </h3>
          <p className="text-sm">{offerPrice(pkg)}</p>
          <Button disabled={busy || loading || !accepted} onClick={() => void run(pkg)}>
            Subscribe
          </Button>
        </div>
      ))}
      <p className="text-sm text-muted-foreground">
        Google Play confirms the final price and any eligible introductory offer. Subscriptions
        renew automatically until cancelled in Google Play. Restore using the original MealMate
        account. Family sharing is not included.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy || loading} onClick={() => void run("restore")}>
          Restore purchases
        </Button>
        <Button variant="outline" disabled={busy || loading} onClick={() => void run("refresh")}>
          Refresh access
        </Button>
        <Button variant="ghost" disabled={busy || loading} onClick={() => setRetry((n) => n + 1)}>
          Reload plans
        </Button>
        <a
          className="self-center text-sm underline"
          href="https://play.google.com/store/account/subscriptions"
          target="_blank"
          rel="noreferrer"
        >
          Manage subscription
        </a>
      </div>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </section>
  );
}
