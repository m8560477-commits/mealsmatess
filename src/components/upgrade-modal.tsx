import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Crown, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Ctx = { open: (reason?: string) => void; close: () => void };
const UpgradeCtx = createContext<Ctx | null>(null);

export function UpgradeModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState<string | undefined>();

  const ctx = useMemo<Ctx>(
    () => ({
      open: (r?: string) => {
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
      {isOpen && <UpgradeSheet {...(reason ? { reason } : {})} onClose={() => setIsOpen(false)} />}
    </UpgradeCtx.Provider>
  );
}

export function useUpgradeModal() {
  const ctx = useContext(UpgradeCtx);
  if (!ctx) throw new Error("useUpgradeModal must be used inside <UpgradeModalProvider>");
  return ctx;
}

export function useAutoPaywall(reason?: string, when = true) {
  const { open } = useUpgradeModal();
  useEffect(() => {
    if (!when || typeof window === "undefined") return;
    const key = "mealmate-paywall-seen";
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");
    open(reason);
  }, [when, reason, open]);
}

/** An in-app prompt; subscription access itself is enforced by ConsumerAccessGate. */
function UpgradeSheet({ reason, onClose }: { reason?: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
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
      aria-labelledby="upgrade-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-t-[32px] border border-border bg-background px-6 pb-8 pt-10 shadow-2xl sm:rounded-[32px]"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-background/80 text-muted-foreground shadow-sm transition hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 text-white shadow-lg">
            <Crown className="h-7 w-7" />
          </div>
          <h2 id="upgrade-title" className="mt-4 font-display text-2xl font-bold">
            MealMate Premium
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {reason ??
              "Enjoy AI-powered recipes, meal planning, food scanning and nutrition insights."}
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            View available plans, prices and trial eligibility on the subscription page.
          </p>
          <Link to="/premium" onClick={onClose} className="mt-6 block">
            <Button className="h-12 w-full rounded-2xl">View subscription plans</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
