import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import { createPurchaseSession, verifyCheckout, verifyMyPremium } from "@/lib/billing.functions";
import {
  loadBillingStore,
  purchaseWasCancelled,
  type BillingStore,
  type PlanKind,
} from "@/lib/billing-client";
import { RecipeImage } from "@/components/recipe-image";

const BENEFITS = [
  "Recipes you’ll actually cook",
  "A calmer week of meal plans",
  "Dinner ideas from what’s in the pantry",
  "Mia — hands-free help in the kitchen",
] as const;

export function PremiumPaywall() {
  const { user, loading: sessionLoading } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [store, setStore] = useState<BillingStore | null>(null);
  const [selected, setSelected] = useState<PlanKind>("yearly");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const [message, setMessage] = useState("");
  const [pendingVerification, setPendingVerification] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const lock = useRef(false);
  const userId = user?.id;
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    if (sessionLoading) return;
    let active = true;
    setLoading(true);
    setStore(null);
    setMessage("");
    void createPurchaseSession()
      .then(async (identity) => {
        if (!active) return null;
        if (identity.isActive) {
          await navigate({ to: userId ? "/" : "/auth", replace: true });
          return null;
        }
        return loadBillingStore(identity);
      })
      .then((next) => {
        if (!active || !next) return;
        setStore(next);
        setSelected(next.plans.find((p) => p.kind === "yearly")?.kind ?? next.plans[0].kind);
      })
      .catch(() => {
        if (active)
          setMessage("We couldn’t load subscription plans. Check your connection and try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, sessionLoading, attempt, navigate]);

  async function confirm() {
    for (let i = 0; i < 3; i++) {
      const access = userId ? await verifyMyPremium() : await verifyCheckout();
      if (access.isPremium) {
        await queryClient.invalidateQueries({ queryKey: ["entitlement"] });
        await navigate({ to: userId ? "/" : "/auth", replace: true });
        return;
      }
      if (i < 2) await new Promise((resolve) => window.setTimeout(resolve, 1000));
    }
    setPendingVerification(true);
    setMessage(
      "Your subscription isn’t confirmed yet. If you just purchased, check access again. You won’t be charged by checking.",
    );
  }
  async function perform(action: "purchase" | "restore" | "verify") {
    if (lock.current || !online) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      if (action === "purchase") {
        const plan = store?.plans.find((p) => p.kind === selected);
        if (!plan) throw new Error("Plan unavailable");
        await plan.purchase();
        setPendingVerification(true);
      } else if (action === "restore") {
        if (store) await store.restore();
      }
      await confirm();
    } catch (error) {
      setMessage(
        purchaseWasCancelled(error)
          ? "Checkout cancelled. Choose a plan whenever you’re ready."
          : "We couldn’t confirm your subscription. Please try again or restore purchases. If you were charged, check access before purchasing again.",
      );
      if (!purchaseWasCancelled(error) && action === "purchase") setPendingVerification(true);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const plan = store?.plans.find((p) => p.kind === selected);
  return (
    <main className="premium-flow paywall paywall-redesign">
      <div className="paywall-photo" aria-hidden="true">
        <RecipeImage recipe={{ name: "Creamy chicken alfredo" }} size="hero" priority />
        <div className="paywall-photo-badge">
          <Sparkles size={14} aria-hidden="true" />
          <span>Premium access</span>
        </div>
      </div>
      <section className="paywall-content">
        <p className="premium-eyebrow">MealMate Premium</p>
        <h1>
          Good food.
          <br />
          <span>Every day.</span>
        </h1>
        <p className="premium-description">
          Unlock planning, pantry ideas, and Mia — everything in one calm place.
        </p>
        <ul className="premium-benefits">
          {BENEFITS.map((benefit) => (
            <li key={benefit}>
              <span className="benefit-check" aria-hidden="true">
                <Check size={14} strokeWidth={2.5} />
              </span>
              {benefit}
            </li>
          ))}
        </ul>
        <fieldset className="premium-plans" disabled={busy || loading}>
          <legend className="sr-only">Choose a subscription plan</legend>
          {(["monthly", "yearly", "family"] as const).map((kind) => {
            const option = store?.plans.find((p) => p.kind === kind);
            return (
              <label
                key={kind}
                className={`premium-plan ${selected === kind && option ? "selected" : ""} ${!option ? "unavailable" : ""}`}
              >
                <input
                  type="radio"
                  name="subscription"
                  value={kind}
                  checked={!!option && selected === kind}
                  disabled={!option}
                  onChange={() => setSelected(kind)}
                />
                <span className="plan-name">
                  {kind[0].toUpperCase() + kind.slice(1)}
                  {kind === "yearly" && option && <span className="plan-badge">Best value</span>}
                </span>
                <span className="plan-price">
                  {loading ? (
                    "Loading…"
                  ) : option ? (
                    <>
                      {option.price}
                      <small> / {option.period}</small>
                    </>
                  ) : (
                    "Currently unavailable"
                  )}
                </span>
                {option?.trialDays === 7 && (
                  <span className="plan-trial">
                    7 days free, then {option.price} / {option.period}
                  </span>
                )}
              </label>
            );
          })}
        </fieldset>
        {!online && (
          <p role="alert" className="premium-notice">
            You’re offline. Connect to verify your subscription or make a purchase.
          </p>
        )}
        {message && (
          <p role="status" className="premium-notice">
            {message}
          </p>
        )}
        {!store && !loading && (
          <button
            type="button"
            className="premium-secondary"
            onClick={() => setAttempt((n) => n + 1)}
            disabled={busy || !online}
          >
            Try again
          </button>
        )}
        {pendingVerification ? (
          <button
            type="button"
            className="premium-primary"
            disabled={busy || !online}
            onClick={() => void perform("verify")}
          >
            {busy ? <Loader2 className="animate-spin" size={20} /> : "Check subscription access"}
          </button>
        ) : (
          <button
            type="button"
            className="premium-primary"
            disabled={loading || busy || !online || !plan}
            onClick={() => void perform("purchase")}
          >
            {busy || loading ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <>
                {plan?.trialDays === 7 ? "Start 7-day free trial" : "Subscribe"}
                <ArrowRight size={18} aria-hidden="true" />
              </>
            )}
          </button>
        )}
        {plan && (
          <p className="premium-terms">
            {plan.trialDays === 7
              ? `7 days free, then ${plan.price} every ${plan.period}.`
              : `${plan.price} billed every ${plan.period}.`}{" "}
            Auto-renews until cancelled. Cancel before renewal in your store or billing account
            settings. Trial eligibility and final taxes are confirmed at checkout.
          </p>
        )}
        <div className="premium-recovery">
          <button type="button" onClick={() => void perform("restore")} disabled={busy || loading || !online}>
            Restore purchases
          </button>
          {!userId && (
            <Link to="/auth" search={{ mode: "signin" }}>
              Already subscribed? Sign in
            </Link>
          )}
        </div>
        <p className="premium-assurance">
          <ShieldCheck size={14} aria-hidden="true" /> Secure checkout · Access after confirmation
        </p>
        <p className="premium-legal">
          <Link to="/legal/terms">Terms</Link>
          <span>·</span>
          <Link to="/legal/privacy">Privacy</Link>
          <span>·</span>
          <Link to="/support">Help</Link>
        </p>
      </section>
    </main>
  );
}
