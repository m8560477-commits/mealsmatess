import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Crown,
  Gift,
  Leaf,
  Loader2,
  Lock,
  RefreshCcw,
  Shield,
  Ticket,
  Users,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/hooks/use-session";
import { usePremium } from "@/hooks/use-premium";
import { useCurrency, formatPrice, PRICES_USD } from "@/lib/currency";
import { applyReferralCode, getMyReferral, redeemPromoCode } from "@/lib/premium.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { NativeBilling, useNativeBilling } from "@/components/native-billing";

export const Route = createFileRoute("/premium")({
  head: () => ({
    meta: [
      { name: "twitter:card", content: "summary" },
      { title: "MealMate Premium — Unlimited AI, recipes & meal plans" },
      {
        name: "description",
        content:
          "Go Premium for unlimited AI Chef chats, unlimited recipe generation, meal plans, food scanning and advanced nutrition. Start a 3-day free trial.",
      },
      { property: "og:title", content: "MealMate Premium" },
      {
        property: "og:description",
        content: "Unlimited AI cooking, meal plans, food scanning and family sharing.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: PremiumPage,
});

type Billing = "annual" | "monthly";

function PremiumPage() {
  const native = useNativeBilling();
  const { t } = useTranslation();
  const { user } = useSession();
  const { isPremium, tier, trialActive, entitlement } = usePremium();
  const { currency } = useCurrency();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [billing, setBilling] = useState<Billing>("annual");

  const { data: referral } = useQuery({
    queryKey: ["referral"],
    queryFn: () => getMyReferral(),
    enabled: !!user,
  });

  const [promo, setPromo] = useState("");
  const [refCode, setRefCode] = useState("");
  const [busy, setBusy] = useState<"promo" | "ref" | null>(null);

  async function submitPromo() {
    if (!promo.trim() || busy) return;
    if (!user) return navigate({ to: "/auth" });
    setBusy("promo");
    try {
      const r = await redeemPromoCode({ data: { code: promo.trim() } });
      toast.success(r.message);
      setPromo("");
      qc.invalidateQueries({ queryKey: ["entitlement"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't redeem code");
    } finally {
      setBusy(null);
    }
  }

  async function submitReferral() {
    if (!refCode.trim() || busy) return;
    if (!user) return navigate({ to: "/auth" });
    setBusy("ref");
    try {
      const r = await applyReferralCode({ data: { code: refCode.trim() } });
      toast.success(r.message);
      setRefCode("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't apply referral");
    } finally {
      setBusy(null);
    }
  }

  function startTrial() {
    if (!user) {
      void navigate({ to: "/auth" });
      return;
    }
    toast.info("Premium purchases open on the MealMate mobile app", {
      description: "Sign in with the same account on iOS or Android to start your 3-day trial.",
    });
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-24 pt-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 p-6 text-white shadow-xl shadow-orange-500/30">
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-widest backdrop-blur">
            <Crown className="h-3.5 w-3.5" /> Premium
          </span>
          <h1 className="mt-3 font-display text-3xl font-bold leading-tight sm:text-4xl">
            Unlock MealMate Premium
          </h1>
          <p className="mt-2 max-w-md text-sm/relaxed text-white/90">
            Unlimited AI-powered recipes, meal plans, food scanning and nutrition insights for you
            {native ? "with your individual subscription." : "or your whole family."}
          </p>
          {isPremium && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/25 px-3 py-1.5 text-xs font-semibold backdrop-blur">
              {t("premium.youAreMember", { defaultValue: "You're Premium" })} ({tier}){" "}
              {trialActive ? "· trial" : ""}
              {entitlement?.periodEnd
                ? ` · ${new Date(entitlement.periodEnd).toLocaleDateString()}`
                : ""}
            </div>
          )}
        </div>
      </section>

      {native ? (
        <NativeBilling />
      ) : (
        <>
          <BillingToggle value={billing} onChange={setBilling} />

          {/* Plan cards */}
          <section className="mt-6 space-y-4">
            <FreeCard onSelect={() => toast.success("You're on the Free plan.")} />
            <PremiumHeroCard
              billing={billing}
              currency={currency}
              onSelect={startTrial}
              disabled={isPremium}
            />
            <FamilyCard
              billing={billing}
              currency={currency}
              onSelect={startTrial}
              disabled={isPremium}
            />
          </section>

          <TrustBadges />
        </>
      )}

      {/* Promo + Referral */}
      <section className="mt-8 grid gap-3 sm:grid-cols-2">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Ticket className="h-4 w-4" />
            </span>
            <h3 className="font-semibold">Redeem a code</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Free days, months, year or lifetime codes redeem instantly.
          </p>
          <div className="mt-3 flex gap-2">
            <Input
              value={promo}
              onChange={(e) => setPromo(e.target.value.toUpperCase())}
              placeholder="ENTER CODE"
              className="uppercase"
            />
            <Button onClick={submitPromo} disabled={!promo.trim() || busy === "promo"}>
              {busy === "promo" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Redeem"}
            </Button>
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Users className="h-4 w-4" />
            </span>
            <h3 className="font-semibold">Refer friends</h3>
          </div>
          {referral ? (
            <>
              <p className="mt-1 text-xs text-muted-foreground">
                Share your code — you both get 14 free Premium days.
              </p>
              <div className="mt-3 flex items-center justify-between rounded-2xl border border-dashed border-border bg-muted/40 px-3 py-2">
                <code className="font-mono text-sm font-bold tracking-wider">{referral.code}</code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(referral.code);
                    toast.success("Copied");
                  }}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Copy
                </button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {referral.totalReferred} referred · {referral.rewarded} rewarded
              </p>
            </>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">Sign in to get your code.</p>
          )}
          <div className="mt-3 flex gap-2">
            <Input
              value={refCode}
              onChange={(e) => setRefCode(e.target.value.toUpperCase())}
              placeholder="APPLY A CODE"
              className="uppercase"
            />
            <Button
              variant="secondary"
              onClick={submitReferral}
              disabled={!refCode.trim() || busy === "ref"}
            >
              {busy === "ref" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
            </Button>
          </div>
        </div>
      </section>

      {!native && (
        <>
          {/* FAQ */}
          <section className="mt-8">
            <h2 className="mb-3 font-display text-xl font-bold">Frequently asked</h2>
            <ul className="space-y-2">
              {FAQ.map((f) => (
                <li key={f.q} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <p className="font-semibold">{f.q}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{f.a}</p>
                </li>
              ))}
            </ul>
          </section>

          <p className="mt-6 flex items-center justify-center gap-1 text-center text-xs text-muted-foreground">
            <Gift className="h-3 w-3" /> Purchases happen securely via Apple, Google or Paddle.
          </p>
          <p className="mt-1 text-center text-xs text-muted-foreground">
            <Link to="/profile" className="underline">
              Restore purchase
            </Link>{" "}
            · sign in on mobile to sync Premium
          </p>
        </>
      )}
      <PremiumAnimStyles />
    </main>
  );
}

const FAQ = [
  {
    q: "How does the 3-day free trial work?",
    a: "Start your trial and get full Premium access for 3 days. You're only charged when the trial ends. Cancel anytime before then and you won't be billed.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes — cancel any time in your App Store or Google Play subscription settings. You'll keep Premium until the end of your current billing period.",
  },
  {
    q: "What's the difference between monthly and annual?",
    a: "Annual saves you over 37% compared to paying monthly for a year. Same features, one payment, best value.",
  },
  {
    q: "What's the Family plan?",
    a: "Family gives up to 6 members full Premium plus shared meal plans, grocery lists, pantry, recipe collections and a family nutrition dashboard.",
  },
  {
    q: "How do referrals work?",
    a: "Share your referral code. When a friend subscribes to Premium for the first time, you both get 14 free Premium days.",
  },
];

/* ---------- Sub-components ---------- */

function BillingToggle({ value, onChange }: { value: Billing; onChange: (v: Billing) => void }) {
  return (
    <div className="mt-6 flex flex-col items-center">
      <div className="relative flex w-full max-w-xs items-center rounded-full border border-border bg-muted/60 p-1">
        <span
          className={cn(
            "absolute top-1 h-[calc(100%-8px)] w-1/2 rounded-full bg-gradient-to-r from-primary to-primary/80 shadow-sm transition-all duration-300 ease-out",
            value === "annual" ? "left-1" : "left-[calc(50%-4px)]",
          )}
          aria-hidden
        />
        <button
          type="button"
          onClick={() => onChange("annual")}
          className={cn(
            "relative z-10 flex-1 rounded-full py-2 text-xs font-semibold transition-colors",
            value === "annual" ? "text-primary-foreground" : "text-muted-foreground",
          )}
        >
          Yearly · Save 45%
        </button>
        <button
          type="button"
          onClick={() => onChange("monthly")}
          className={cn(
            "relative z-10 flex-1 rounded-full py-2 text-xs font-semibold transition-colors",
            value === "monthly" ? "text-primary-foreground" : "text-muted-foreground",
          )}
        >
          Monthly
        </button>
      </div>
    </div>
  );
}

function FreeCard({ onSelect }: { onSelect: () => void }) {
  const features = [
    "12 AI recipe searches / month",
    "Basic Meal Planner",
    "Grocery List",
    "Basic Nutrition",
    "Limited AI Chat",
    "Tasteful sponsored cards in your feed",
  ];
  return (
    <article className="rounded-[28px] border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
          <Leaf className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Free</p>
          <p className="font-display text-3xl font-bold leading-none">$0</p>
          <p className="text-xs text-muted-foreground">Perfect to get started.</p>
        </div>
      </div>
      <FeatureList items={features} tone="muted" />
      <Button
        variant="outline"
        onClick={onSelect}
        className="mt-4 h-11 w-full rounded-2xl font-semibold"
      >
        Continue Free
      </Button>
    </article>
  );
}

function PremiumHeroCard({
  billing,
  currency,
  onSelect,
  disabled,
}: {
  billing: Billing;
  currency: ReturnType<typeof useCurrency>["currency"];
  onSelect: () => void;
  disabled?: boolean;
}) {
  const priceLabel =
    billing === "annual"
      ? formatPrice(PRICES_USD.premium_annual, currency)
      : formatPrice(PRICES_USD.premium_monthly, currency);
  const perMonth = formatPrice(PRICES_USD.premium_annual / 12, currency);
  const features = [
    "Up to 100 Mia AI requests a day (fair use)",

    "Enhanced Mia AI assistance",
    "Advanced Nutrition Analysis",
    "Barcode Scanner",
    "Personalized Meal Plans",
    "Unlimited Grocery Lists",
    "Completely ad-free — no banners or sponsored cards",
    "Priority AI Processing",
    "Early Access to New Features",
  ];
  return (
    <article className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 p-[2px] shadow-2xl shadow-orange-500/30">
      <div className="shimmer pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <div className="relative rounded-[30px] bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 p-6 dark:from-amber-950/60 dark:via-orange-950/50 dark:to-rose-950/60">
        <span className="pulse-badge absolute -top-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-orange-500/40">
          Most Popular
        </span>
        <div className="mt-2 flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-rose-500 text-white shadow-md">
            <Crown className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-orange-700 dark:text-amber-300">
              Premium
            </p>
            <p className="font-display text-4xl font-bold leading-none">
              {priceLabel}
              <span className="text-base font-medium text-muted-foreground">
                {billing === "annual" ? "/year" : "/month"}
              </span>
            </p>
            {billing === "annual" && (
              <p className="text-xs text-muted-foreground">Just {perMonth}/mo · Save 37%</p>
            )}
          </div>
        </div>
        <FeatureList items={features} tone="premium" />
        <Button
          onClick={onSelect}
          disabled={disabled}
          className="mt-5 h-14 w-full rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-base font-bold text-white shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50"
        >
          Start 3-Day Free Trial
        </Button>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Cancel anytime. No charges during the free trial.
        </p>
      </div>
    </article>
  );
}

function FamilyCard({
  billing,
  currency,
  onSelect,
  disabled,
}: {
  billing: Billing;
  currency: ReturnType<typeof useCurrency>["currency"];
  onSelect: () => void;
  disabled?: boolean;
}) {
  const priceLabel =
    billing === "annual"
      ? formatPrice(PRICES_USD.family_annual, currency)
      : formatPrice(PRICES_USD.family_monthly, currency);
  const features = [
    "Everything in Premium",
    "Up to 6 Family Members",
    "Shared Meal Plans",
    "Shared Grocery Lists",
    "Shared Recipe Collections",
    "Family Nutrition Dashboard",
    "Family Pantry Management",
    "Priority Support",
    "Cross-device Sync",
    "No Ads for All Members",
  ];
  return (
    <article className="relative overflow-hidden rounded-[28px] border border-emerald-300/60 bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100 p-5 shadow-md dark:from-emerald-950/60 dark:via-teal-950/60 dark:to-emerald-950/60">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-md">
          <Users className="h-6 w-6" />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
            Family
          </p>
          <p className="font-display text-3xl font-bold leading-none">
            {priceLabel}
            <span className="text-base font-medium text-muted-foreground">
              {billing === "annual" ? "/year" : "/month"}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {billing === "annual" ? "Save 36% · " : ""}Up to 6 members
          </p>
        </div>
      </div>
      <FeatureList items={features} tone="family" />
      <Button
        onClick={onSelect}
        disabled={disabled}
        className="mt-4 h-12 w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-base font-bold text-white shadow-md hover:shadow-emerald-500/40"
      >
        <Users className="mr-2 h-4 w-4" /> Choose Family
      </Button>
    </article>
  );
}

function FeatureList({ items, tone }: { items: string[]; tone: "muted" | "premium" | "family" }) {
  const bg =
    tone === "premium"
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
      : tone === "family"
        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
        : "bg-muted text-muted-foreground";
  return (
    <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
      {items.map((f, i) => (
        <li
          key={f}
          className="flex items-start gap-2 text-sm animate-in fade-in slide-in-from-left-1"
          style={{ animationDelay: `${i * 35}ms`, animationFillMode: "backwards" }}
        >
          <span
            className={cn(
              "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
              bg,
            )}
          >
            <Check className="h-3 w-3" />
          </span>
          <span className="text-foreground">{f}</span>
        </li>
      ))}
    </ul>
  );
}

function TrustBadges() {
  const items = [
    { icon: Shield, label: "Cancel Anytime" },
    { icon: Lock, label: "Secure Payments" },
    { icon: Zap, label: "Instant Access" },
    { icon: Gift, label: "3-Day Free Trial" },
    { icon: RefreshCcw, label: "Auto-renews Until Cancelled" },
  ];
  return (
    <ul className="mt-6 flex flex-wrap items-center justify-center gap-2">
      {items.map((it) => (
        <li
          key={it.label}
          className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground shadow-sm"
        >
          <it.icon className="h-3.5 w-3.5 text-primary" />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

function PremiumAnimStyles() {
  return (
    <style>{`
      @keyframes shimmer-move { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
      .shimmer { background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.6) 50%, transparent 70%); background-size: 200% 100%; animation: shimmer-move 3.5s linear infinite; }
      @keyframes pulse-badge { 0%,100% { transform: translateX(-50%) scale(1); } 50% { transform: translateX(-50%) scale(1.06); } }
      .pulse-badge { animation: pulse-badge 2.2s ease-in-out infinite; }
    `}</style>
  );
}
