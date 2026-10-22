import { StorePaywall } from "@/components/store-paywall";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Crown,
  Gift,
  Loader2,
  Lock,
  RefreshCcw,
  Shield,
  Sparkles,
  Ticket,
  Users,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/hooks/use-session";
import { usePremium } from "@/hooks/use-premium";
import { applyReferralCode, getMyReferral, redeemPromoCode } from "@/lib/premium.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/premium")({
  head: () => ({
    meta: [
      { name: "twitter:card", content: "summary" },
      { title: "MealMate Premium — Unlimited AI, recipes & meal plans" },
      {
        name: "description",
        content:
          "Go Premium for unlimited AI Chef chats, unlimited recipe generation, meal plans, food scanning and advanced nutrition. View available Google Play subscriptions.",
      },
      { property: "og:title", content: "MealMate Premium" },
      {
        property: "og:description",
        content: "Unlimited AI cooking, meal plans, food scanning.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: PremiumPage,
});

function PremiumPage() {
  const { t } = useTranslation();
  const { user } = useSession();
  const { isPremium, tier, trialActive, entitlement } = usePremium();
  const navigate = useNavigate();
  const qc = useQueryClient();

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

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-24 pt-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 p-6 text-white shadow-xl shadow-orange-500/30">
        <FloatingFruits />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-widest backdrop-blur">
            <Crown className="h-3.5 w-3.5" /> Premium
          </span>
          <h1 className="mt-3 font-display text-3xl font-bold leading-tight sm:text-4xl">
            Unlock MealMate Premium
          </h1>
          <p className="mt-2 max-w-md text-sm/relaxed text-white/90">
            Unlimited AI-powered recipes, meal plans, food scanning and nutrition insights for you
            at your own pace.
          </p>
          {isPremium && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/25 px-3 py-1.5 text-xs font-semibold backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              {t("premium.youAreMember", { defaultValue: "You're Premium" })} ({tier}){" "}
              {trialActive ? "· trial" : ""}
              {entitlement?.periodEnd
                ? ` · ${new Date(entitlement.periodEnd).toLocaleDateString()}`
                : ""}
            </div>
          )}
        </div>
      </section>

      <StorePaywall />

      <TrustBadges />

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
        <Gift className="h-3 w-3" /> Android purchases happen securely through Google Play.
      </p>
      <p className="mt-1 text-center text-xs text-muted-foreground">
        <Link to="/premium" className="underline">
          Manage purchases above
        </Link>{" "}
        · sign in on mobile to sync Premium
      </p>

      <FruitAnimStyles />
    </main>
  );
}

const FAQ = [
  {
    q: "Is a free trial available?",
    a: "Trial eligibility and duration come from Google Play. Review the store confirmation before purchasing.",
  },
  {
    q: "Can I cancel?",
    a: "Manage or cancel renewal in Google Play subscription settings. Access continues through the verified paid period or supported grace period.",
  },
  {
    q: "Is Family sharing available?",
    a: "Family invitations and shared entitlement access are not implemented. MealMate does not currently sell a shared Family plan.",
  },
];

/* ---------- Sub-components ---------- */

function TrustBadges() {
  const items = [
    { icon: Shield, label: "Cancel Anytime" },
    { icon: Lock, label: "Secure Payments" },
    { icon: Zap, label: "Verified Access" },
    { icon: Gift, label: "Store-confirmed Offers" },
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

function FloatingFruits() {
  const fruits = ["🥑", "🍅", "🥦", "🥕", "🍋", "🌿", "🫑", "🍓"];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {fruits.map((f, i) => (
        <span
          key={i}
          className="float-fruit absolute select-none text-3xl opacity-20 sm:text-4xl"
          style={{
            left: `${(i * 13 + 5) % 95}%`,
            top: `${(i * 23 + 8) % 90}%`,
            animationDelay: `${i * 0.6}s`,
            animationDuration: `${6 + (i % 4)}s`,
          }}
        >
          {f}
        </span>
      ))}
    </div>
  );
}

function FruitAnimStyles() {
  return (
    <style>{`
      @keyframes float-y { 0%,100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(-14px) rotate(6deg); } }
      .float-fruit { animation: float-y ease-in-out infinite; }
      @keyframes shimmer-move { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
      .shimmer { background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.6) 50%, transparent 70%); background-size: 200% 100%; animation: shimmer-move 3.5s linear infinite; }
      @keyframes pulse-badge { 0%,100% { transform: translateX(-50%) scale(1); } 50% { transform: translateX(-50%) scale(1.06); } }
      .pulse-badge { animation: pulse-badge 2.2s ease-in-out infinite; }
    `}</style>
  );
}
