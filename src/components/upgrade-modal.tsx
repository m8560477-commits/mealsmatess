import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
type Context = { open: (reason?: string) => void; close: () => void };
const UpgradeContext = createContext<Context | null>(null);
export function UpgradeModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>();
  const value = useMemo(
    () => ({
      open: (text?: string) => {
        setReason(text);
        setOpen(true);
      },
      close: () => setOpen(false),
    }),
    [],
  );
  return (
    <UpgradeContext.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>MealMate Premium</DialogTitle>
          <DialogDescription>
            {reason ??
              "Personalized cooking, meal planning and nutrition with verified Premium access."}
          </DialogDescription>
          <p>
            See current monthly, yearly and family offers, restore purchases or manage your access.
            Trial eligibility and renewal terms are confirmed at checkout.
          </p>
          <Button asChild>
            <Link to="/premium" onClick={() => setOpen(false)}>
              View Premium options
            </Link>
          </Button>
        </DialogContent>
      </Dialog>
    </UpgradeContext.Provider>
  );
}
export function useUpgradeModal() {
  const value = useContext(UpgradeContext);
  if (!value) throw new Error("Upgrade provider is missing");
  return value;
}
export function useAutoPaywall(reason?: string, when = true) {
  const { open } = useUpgradeModal();
  useEffect(() => {
    if (!when || sessionStorage.getItem("mealmate-paywall-seen")) return;
    sessionStorage.setItem("mealmate-paywall-seen", "1");
    open(reason);
  }, [when, reason, open]);
}
