import { Link, useRouterState } from "@tanstack/react-router";
import { ClipboardList, ShoppingBag, Store, User, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINK_TABS = [
  { to: "/restaurants", icon: UtensilsCrossed, label: "Restaurants" },
  { to: "/orders", icon: ClipboardList, label: "Orders" },
  { to: "/profile", icon: User, label: "Profile" },
] as const;

export function MarketplaceBottomNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const link = (tab: (typeof LINK_TABS)[number]) => {
    const Icon = tab.icon;
    const active = pathname.startsWith(tab.to);
    return (
      <Link
        key={tab.to}
        to={tab.to}
        aria-label={tab.label}
        className={cn(
          "relative flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[10px] font-semibold transition-colors",
          active ? "text-primary" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {active && <span className="absolute top-1 h-1 w-5 rounded-full bg-primary" />}
        <Icon className={cn("h-5 w-5 transition-transform", active && "-translate-y-0.5")} />
        <span className="truncate">{tab.label}</span>
      </Link>
    );
  };

  return (
    <nav aria-label="Food marketplace" className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-3xl border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      <div className="grid grid-cols-5">
        {link(LINK_TABS[0])}
        <Button variant="ghost" className="h-auto min-h-14 rounded-none px-1 text-muted-foreground" onClick={() => toast.info("Pick n Pay is coming to MealMate soon") }>
          <span className="flex flex-col items-center gap-1 text-[10px] font-semibold"><ShoppingBag className="h-5 w-5" />Pick n Pay</span>
        </Button>
        <Button variant="ghost" className="h-auto min-h-14 rounded-none px-1 text-muted-foreground" onClick={() => toast.info("Shops are coming to MealMate soon") }>
          <span className="flex flex-col items-center gap-1 text-[10px] font-semibold"><Store className="h-5 w-5" />Shops</span>
        </Button>
        {link(LINK_TABS[1])}
        {link(LINK_TABS[2])}
      </div>
    </nav>
  );
}
