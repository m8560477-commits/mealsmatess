import { Link, useRouterState } from "@tanstack/react-router";
import { Home, UtensilsCrossed, CalendarDays, User } from "lucide-react";
import { ChefMascot } from "@/components/chef-mascot";
import { cn } from "@/lib/utils";

/**
 * Five primary MealMate tabs with the AI chef raised in the centre.
 */
const LEFT_TABS = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/restaurants", icon: UtensilsCrossed, label: "Dining" },
] as const;

const RIGHT_TABS = [
  { to: "/planner", icon: CalendarDays, label: "Planner" },
  { to: "/profile", icon: User, label: "Profile" },
] as const;

function Tab({
  to,
  icon: Icon,
  label,
  active,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      aria-label={label}
      data-tour={label.toLowerCase()}
      className={cn(
        "group relative flex flex-col items-center gap-1 rounded-xl min-h-14 min-w-0 px-1 py-2 text-[10px] font-semibold transition-colors",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-5 w-5 transition-transform duration-200 group-active:scale-90" />
      {active && <span className="absolute inset-x-3 -top-0.5 h-0.5 rounded-full bg-primary motion-reveal" aria-hidden="true" />}
      {label}
    </Link>
  );
}

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  return (
    <nav
      id="app-nav"
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <div className="mx-auto grid max-w-3xl grid-cols-[1fr_1fr_64px_1fr_1fr] items-end px-2">
        {LEFT_TABS.map((t) => (
          <Tab key={t.to} {...t} active={isActive(t.to)} />
        ))}
        <Link
          to="/chat"
          aria-label="Ask the AI chef"
          data-tour="chef"
          className={cn(
            "group relative mx-auto -mt-6 flex min-h-20 w-16 flex-col items-center justify-end gap-1 pb-2 text-[10px] font-semibold transition-colors",
            isActive("/chat") ? "text-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-card shadow-lg ring-4 ring-background transition-transform group-hover:scale-105 group-active:scale-95">
            <ChefMascot className="h-12 w-12" />
          </span>
          {isActive("/chat") && <span className="absolute inset-x-3 top-5 h-0.5 rounded-full bg-primary motion-reveal" aria-hidden="true" />}
          AI Chef
        </Link>
        {RIGHT_TABS.map((t) => (
          <Tab key={t.to} {...t} active={isActive(t.to)} />
        ))}
      </div>
    </nav>
  );
}
