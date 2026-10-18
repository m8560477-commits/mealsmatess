import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Check, Crown } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import { usePremium } from "@/hooks/use-premium";
import type { PurchaseOffer } from "@/lib/purchases.client";
import { createClientOnlyFn } from "@tanstack/react-start";
const purchaseSdk = createClientOnlyFn(() => import("@/lib/purchases.client"));
import {
  refreshMyEntitlement,
  redeemPromoCode,
  applyReferralCode,
  getMyReferral,
} from "@/lib/premium.functions";
import {
  getMyFamily,
  inviteFamilyMember,
  acceptFamilyInvitation,
  removeFamilyMember,
  leaveFamily,
} from "@/lib/family.functions";
import { Button } from "@/components/ui/button";

const periodLabel = (period: string) =>
  ({ P1M: "month", P1Y: "year", MONTHLY: "month", ANNUAL: "year" })[period] ?? period;
export function SubscriptionOptions({ onContinue }: { onContinue?: () => Promise<void> }) {
  const { user } = useSession();
  const qc = useQueryClient();
  const premium = usePremium();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const offers = useQuery({
    queryKey: ["purchase-offers", user?.id],
    queryFn: async () => (await purchaseSdk()).loadPurchaseOffers(user!.id),
    enabled: !!user,
    retry: false,
    staleTime: 60000,
  });
  async function verify() {
    const access = await refreshMyEntitlement();
    qc.setQueryData(["entitlement", user!.id], access);
    if (!access.isPremium)
      throw new Error(
        "Premium is not confirmed yet. If you just purchased, wait a moment and choose Refresh access. You will not be charged again.",
      );
    setMessage("Premium access confirmed.");
  }
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not verify access. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  async function purchase(offer: PurchaseOffer) {
    await offer.purchase();
    await verify();
  }
  if (!user) return <Link to="/auth">Sign in to see your subscription options</Link>;
  return (
    <section className="premium-options space-y-5" aria-label="MealMate Premium subscriptions">
      <Crown className="h-8 w-8" />
      <h2 className="font-display text-3xl">Your personalized food journey starts here.</h2>
      <p>
        Mia AI, personalized recipes, weekly meal planning, grocery lists, cooking guidance and
        advanced nutrition, together in MealMate Premium.
      </p>
      <ul className="space-y-2">
        {[
          "Personalized AI cooking and nutrition advice",
          "Unlimited saved favourites and meal plans",
          "Ingredient substitutions and practical shopping lists",
        ].map((text) => (
          <li key={text} className="flex gap-2">
            <Check className="h-5 w-5 shrink-0" />
            {text}
          </li>
        ))}
      </ul>
      {premium.isPremium ? (
        <div className="rounded-2xl border p-4">
          <strong>Premium is active</strong>
          <p>
            {premium.trialActive
              ? "Provider-confirmed trial"
              : premium.entitlement?.sources.map((s) => s.source).join(" · ")}
            {premium.entitlement?.periodEnd
              ? ` · Until ${new Date(premium.entitlement.periodEnd).toLocaleDateString()}`
              : ""}
          </p>
          {premium.entitlement?.managementUrl && (
            <a
              className="underline"
              href={premium.entitlement.managementUrl}
              target="_blank"
              rel="noreferrer"
            >
              Manage subscription
            </a>
          )}
        </div>
      ) : (
        <>
          <p>
            Choose monthly, yearly or a family plan from the available offers below. Eligible plans
            may include a 14-day free trial. Your provider confirms eligibility and the exact
            renewal price before you agree.
          </p>
          {offers.isLoading && <p role="status">Loading available plans…</p>}
          {offers.error && <p role="alert">{offers.error.message}</p>}
          {offers.data?.length === 0 && (
            <p role="alert">
              No plans are available from the subscription provider yet. Restore an existing
              purchase or contact support.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {offers.data?.map((offer) => (
              <article key={offer.id} className="rounded-2xl border p-5">
                <h3 className="font-semibold">{offer.title}</h3>
                <p className="my-3 text-xl">
                  {offer.price} / {periodLabel(offer.period)}
                </p>
                {offer.trial14 && (
                  <p>
                    14-day free trial available for this offer. Eligibility is confirmed at
                    checkout.
                  </p>
                )}
                <Button disabled={busy} onClick={() => void run(() => purchase(offer))}>
                  Choose plan
                </Button>
              </article>
            ))}
          </div>
          <p className="text-sm">
            There is no permanent free subscription. You can subscribe, restore a purchase, accept a
            family invitation or use administrator-granted access. A trial starts only after the
            provider confirms it.
          </p>
        </>
      )}
      <p className="text-sm">
        Subscriptions renew automatically at the price and period shown in checkout unless cancelled
        through your store or billing account before renewal. Cancelling stops future renewals;
        access continues until the confirmed expiry. Trial cancellation and renewal terms are shown
        before purchase.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await (await purchaseSdk()).restorePurchaseHistory(user.id);
              await verify();
            })
          }
        >
          Restore Purchases
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => void run(verify)}>
          Refresh access
        </Button>
        {offers.error && (
          <Button variant="outline" onClick={() => void offers.refetch()}>
            Retry plans
          </Button>
        )}
      </div>
      {busy && (
        <Loader2 className="animate-spin" aria-label="Verifying with the subscription provider" />
      )}
      {message && <p role="status">{message}</p>}
      {premium.isPremium && onContinue && (
        <Button disabled={busy} onClick={() => void run(onContinue)}>
          Enter MealMate
        </Button>
      )}
      <div className="flex gap-4 text-sm underline">
        <Link to="/legal/terms">Terms</Link>
        <Link to="/legal/privacy">Privacy</Link>
        <Link to="/support">Get help</Link>
      </div>
      <FamilyAccess />
      <PromotionAccess />
    </section>
  );
}
function FamilyAccess() {
  const { user } = useSession();
  const premium = usePremium();
  const qc = useQueryClient();
  const family = useQuery({
    queryKey: ["family", user?.id],
    queryFn: () => getMyFamily(),
    enabled: !!user,
  });
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
      await qc.invalidateQueries({ queryKey: ["family"] });
      await qc.invalidateQueries({ queryKey: ["entitlement"] });
      setMessage("Family access updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Please retry.");
    } finally {
      setBusy(false);
    }
  }
  const owner = premium.entitlement?.sources.some(
    (s) => s.tier === "family" && ["paid", "trial"].includes(s.source),
  );
  return (
    <section className="space-y-3 rounded-2xl border p-4">
      <h3 className="font-semibold">Family access</h3>
      {family.error && (
        <p role="alert">
          Could not load family invitations.{" "}
          <button onClick={() => void family.refetch()}>Retry</button>
        </p>
      )}
      {owner && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => inviteFamilyMember({ data: { email } }));
          }}
        >
          <label className="block">
            Invite a family member
            <input
              className="onboarding-input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <p className="text-sm">
            Up to five members. They sign in and verify this email to accept. No email is sent
            automatically.
          </p>
          <Button disabled={busy}>Invite</Button>
        </form>
      )}
      {family.data?.members.map((member) => (
        <div className="flex flex-wrap items-center justify-between gap-2" key={member.email}>
          <span>
            {member.email} · {member.user_id ? "Joined" : "Pending"}
          </span>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void run(() => removeFamilyMember({ data: { email: member.email } }))}
          >
            Remove
          </Button>
        </div>
      ))}
      {family.data?.invitations.map((invite) => (
        <div key={invite.id}>
          <p>You have a family invitation.</p>
          <Button
            disabled={busy}
            onClick={() => void run(() => acceptFamilyInvitation({ data: { id: invite.id } }))}
          >
            Accept invitation
          </Button>
        </div>
      ))}
      {family.data?.membership && (
        <Button variant="outline" disabled={busy} onClick={() => void run(() => leaveFamily())}>
          Leave family
        </Button>
      )}
      {!owner && !family.data?.invitations.length && !family.data?.membership && (
        <p className="text-sm">
          Family invitations appear here after you verify your matching email address.
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}

function PromotionAccess() {
  const { user } = useSession();
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [kind, setKind] = useState("promo");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const referral = useQuery({
    queryKey: ["referral", user?.id],
    queryFn: () => getMyReferral(),
    enabled: !!user,
  });
  async function submit() {
    setBusy(true);
    try {
      const result = await (kind === "promo"
        ? redeemPromoCode({ data: { code } })
        : applyReferralCode({ data: { code } }));
      setMessage(result.message);
      await qc.invalidateQueries({ queryKey: ["entitlement"] });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not apply code.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rounded-2xl border p-4">
      <summary>Promotions and referrals</summary>
      <form
        className="space-y-3 pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label>
          Code type
          <select
            className="onboarding-input"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="promo">Promo code</option>
            <option value="referral">Referral code</option>
          </select>
        </label>
        <label>
          Code
          <input
            className="onboarding-input"
            value={code}
            required
            maxLength={40}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        <Button disabled={busy}>Apply code</Button>
        {message && <p role="status">{message}</p>}
      </form>
      {referral.data && (
        <p className="mt-3 text-sm">
          Your referral code: <strong>{referral.data.code}</strong>. Referral rewards are confirmed
          after the first paid subscription payment.
        </p>
      )}
    </details>
  );
}
