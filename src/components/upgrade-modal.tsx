import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Link } from "@tanstack/react-router";
import {
  Check,
  Crown,
  Leaf,
  Lock,
  RefreshCcw,
  Shield,
  Sparkles,
  Users,
  X,
  Zap,
  Gift,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrency, formatPrice, PRICES_USD } from "@/lib/currency";
import { cn } from "@/lib/utils";

type Ctx = { open: (reason?: string) => void; close: () => void };
const UpgradeCtx = createContext<Ctx | null>(null);

export function UpgradeModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState<string | undefined>();

  const ctx = useMemo<Ctx>(
    () => ({
      open: (r?: string) => {
        // Only show once per session unless caller explicitly re-opens.
        setReason(r);
        setIsOpen(true);
      },
      close: () => setIsOpen(false),
    }),
    [],
  );

  return (
    <UpgradeCtx.Provider value={ctx}>
      {children}
      {isOpen && <PaywallSheet {...(reason ? { reason } : {})} onClose={() => setIsOpen(false)} />}
    </UpgradeCtx.Provider>
  );
}

export function useUpgradeModal() {
  const ctx = useContext(UpgradeCtx);
  if (!ctx) throw new Error("useUpgradeModal must be used inside <UpgradeModalProvider>");
  return ctx;
}

/** Auto-open the paywall once per session on mount. */
export function useAutoPaywall(reason?: string, when = true) {
  const { open } = useUpgradeModal();
  useEffect(() => {
    if (!when) return;
    if (typeof window === "undefined") return;
    const KEY = "mealmate-paywall-seen";
    if (window.sessionStorage.getItem(KEY)) return;
    window.sessionStorage.setItem(KEY, "1");
    open(reason);
  }, [when, reason, open]);
}

function PaywallSheet({ reason, onClose }: { reason?: string; onClose: () => void }) {
  const [billing, setBilling] = useState<"annual" | "monthly">("annual");

  // Escape to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-md sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="animate-in slide-in-from-bottom-6 fade-in relative h-[92vh] w-full max-w-2xl overflow-hidden rounded-t-[32px] border border-border bg-background shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-[32px]"
        onClick={(e) => e.stopPropagation()}
      >
        <FloatingFruits />

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-background/80 text-muted-foreground shadow-sm backdrop-blur transition hover:bg-background hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="relative flex h-full flex-col overflow-y-auto px-5 pb-8 pt-8 sm:px-8">
          <PaywallHeader {...(reason ? { reason } : {})} />
          <BillingToggle value={billing} onChange={setBilling} />

          <div className="mt-5 space-y-3">
            <FreeCard onSelect={onClose} />
            <PremiumCard billing={billing} onClose={onClose} />
            <FamilyCard billing={billing} onClose={onClose} />
          </div>

          <TrustBadges />

          <p className="mt-4 text-center text-[11px] text-muted-foreground">
            Purchases happen securely through Apple, Google or Paddle. Subscriptions
            auto-renew until cancelled.
          </p>
          <p className="mt-1 text-center text-[11px] text-muted-foreground">
            <Link to="/profile" onClick={onClose} className="underline">
              Restore purchase
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function PaywallHeader({ reason }: { reason?: string }) {
  return (
    <header className="relative text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 shadow-lg shadow-orange-500/30">
        <Crown className="h-7 w-7 text-white" />
      </div>
      <h2 className="mt-3 font-display text-2xl font-bold leading-tight sm:text-3xl">
        Unlock MealMate Premium
      </h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
        {reason ??
          "Get unlimited AI-powered recipes, meal planning, food scanning and nutrition insights."}
      </p>
    </header>
  );
}

function BillingToggle({
  value,
  onChange,
}: {
  value: "annual" | "monthly";
  onChange: (v: "annual" | "monthly") => void;
}) {
  return (
    <div className="mx-auto mt-5 flex w-full max-w-xs items-center justify-center">
      <div className="relative flex w-full items-center rounded-full border border-border bg-muted/60 p-1">
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

/* ----------------------------- Plan cards ----------------------------- */

function FreeCard({ onSelect }: { onSelect: () => void }) {
  const features = [
    "12 AI recipe searches / month",
    "Basic Meal Planner",
    "Grocery List",
    "Basic Nutrition",
    "Limited AI Chat",
    "Ads",
  ];
  return (
    <article className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
          <Leaf className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Free
          </p>
          <p className="font-display text-2xl font-bold leading-none">$0</p>
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

function PremiumCard({
  billing,
  onClose,
}: {
  billing: "annual" | "monthly";
  onClose: () => void;
}) {
  const { currency } = useCurrency();
  const monthlyUsd = PRICES_USD.premium_monthly;
  const annualUsd = PRICES_USD.premium_annual;
  const priceLabel =
    billing === "annual"
      ? formatPrice(annualUsd, currency)
      : formatPrice(monthlyUsd, currency);
  const perLabel = billing === "annual" ? "/year" : "/month";
  const perMonth = formatPrice(annualUsd / 12, currency);

  const features = [
    "Unlimited AI Recipe Generator",
    "Unlimited AI Food Scanner",
    "Unlimited AI Chat",
    "Unlimited Meal Planner",
    "Advanced Nutrition Analysis",
    "Barcode Scanner",
    "Unlimited Grocery Lists",
    "Completely ad-free — no banners or sponsored cards",
    "Priority AI Processing",
    "Early Access to New Features",
  ];

  return (
    <article className="relative overflow-hidden rounded-[28px] border-2 border-amber-400/60 bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 p-[2px] shadow-xl shadow-orange-500/25">
      <div className="shimmer pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <div className="relative rounded-[26px] bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 p-5 dark:from-amber-950/60 dark:via-orange-950/50 dark:to-rose-950/60">
        <span className="pulse-badge absolute -top-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-orange-500/40">
          <Sparkles className="h-3 w-3" /> Most Popular
        </span>

        <div className="mt-2 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-rose-500 text-white shadow-md">
            <Crown className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-orange-700 dark:text-amber-300">
              Premium
            </p>
            <p className="font-display text-3xl font-bold leading-none text-foreground">
              {priceLabel}
              <span className="text-sm font-medium text-muted-foreground">{perLabel}</span>
            </p>
            {billing === "annual" && (
              <p className="text-xs text-muted-foreground">
                Just {perMonth}/mo · Save 37%
              </p>
            )}
          </div>
        </div>

        <FeatureList items={features} tone="premium" />

        <Link to="/premium" onClick={onClose} className="mt-4 block">
          <Button className="h-12 w-full rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-base font-bold text-white shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50">
            <Sparkles className="mr-2 h-4 w-4" /> Start 3-Day Free Trial
          </Button>
        </Link>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Cancel anytime. No charges during the free trial.
        </p>
      </div>
    </article>
  );
}

function FamilyCard({
  billing,
  onClose,
}: {
  billing: "annual" | "monthly";
  onClose: () => void;
}) {
  const { currency } = useCurrency();
  const priceLabel =
    billing === "annual"
      ? formatPrice(PRICES_USD.family_annual, currency)
      : formatPrice(PRICES_USD.family_monthly, currency);
  const perLabel = billing === "annual" ? "/year" : "/month";
  const features = [
    "Everything in Premium",
    "Up to 6 Family Members",
    "Shared Meal Plans",
    "Shared Grocery Lists",
    "Shared Recipe Collections",
    "Family Pantry",
    "Family Nutrition Dashboard",
    "Cross-device Sync",
    "No Ads for everyone",
    "Priority Support",
  ];
  return (
    <article className="relative overflow-hidden rounded-3xl border border-emerald-300/60 bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100 p-5 shadow-md dark:from-emerald-950/60 dark:via-teal-950/60 dark:to-emerald-950/60">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-md">
          <Users className="h-6 w-6" />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
            Family
          </p>
          <p className="font-display text-2xl font-bold leading-none text-foreground">
            {priceLabel}
            <span className="text-sm font-medium text-muted-foreground">{perLabel}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {billing === "annual" ? "Save 36% · " : ""}Up to 6 members
          </p>
        </div>
      </div>
      <FeatureList items={features} tone="family" />
      <Link to="/premium" onClick={onClose} className="mt-4 block">
        <Button className="h-12 w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-base font-bold text-white shadow-md hover:shadow-emerald-500/40">
          <Users className="mr-2 h-4 w-4" /> Choose Family
        </Button>
      </Link>
    </article>
  );
}

function FeatureList({
  items,
  tone,
}: {
  items: string[];
  tone: "muted" | "premium" | "family";
}) {
  const bg =
    tone === "premium"
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
      : tone === "family"
        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
        : "bg-muted text-muted-foreground";
  return (
    <ul className="mt-4 grid gap-1.5">
      {items.map((f, i) => (
        <li
          key={f}
          className="flex items-start gap-2 text-sm animate-in fade-in slide-in-from-left-1"
          style={{ animationDelay: `${i * 40}ms`, animationFillMode: "backwards" }}
        >
          <span className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full", bg)}>
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

function FloatingFruits() {
  const fruits = ["🥑", "🍅", "🥦", "🥕", "🍋", "🌿", "🫑", "🍓"];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {fruits.map((f, i) => (
        <span
          key={i}
          className="float-fruit absolute select-none text-2xl opacity-20 sm:text-3xl"
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
      <style>{`
        @keyframes float-y { 0%,100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(-14px) rotate(6deg); } }
        .float-fruit { animation: float-y ease-in-out infinite; }
        @keyframes shimmer-move { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        .shimmer { background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.6) 50%, transparent 70%); background-size: 200% 100%; animation: shimmer-move 3.5s linear infinite; }
        @keyframes pulse-badge { 0%,100% { transform: translateX(-50%) scale(1); } 50% { transform: translateX(-50%) scale(1.06); } }
        .pulse-badge { animation: pulse-badge 2.2s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
