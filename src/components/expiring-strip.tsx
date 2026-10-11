import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Utensils } from "lucide-react";
import { myPantryQuery } from "@/lib/queries";
import { useSession } from "@/hooks/use-session";

function daysUntil(iso: string) {
  const ms = new Date(iso).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  return Math.round(ms / 86_400_000);
}

function expiryLabel(days: number) {
  if (days < 0) return "Expired";
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  return `Expires in ${days} days`;
}

export function ExpiringStrip() {
  const { user } = useSession();
  const { data: pantry } = useQuery({ ...myPantryQuery(), enabled: !!user });

  const expiring = (pantry ?? [])
    .filter((p) => p.expires_at)
    .map((p) => ({ ...p, days: daysUntil(p.expires_at as string) }))
    .filter((p) => p.days <= 5)
    .sort((a, b) => a.days - b.days)
    .slice(0, 6);

  if (!user || expiring.length === 0) return null;

  return (
    <section className="px-4 pt-8">
      <div className="mb-4 flex items-end justify-between">
        <h2 className="font-display text-2xl">Use it before it's gone</h2>
        <span className="text-sm text-muted-foreground">{expiring.length} expiring</span>
      </div>
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2">
        {expiring.map((item) => (
          <Link
            key={item.id}
            to="/list"
            className="flex w-40 shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card"
          >
            <div className="flex aspect-square w-full items-center justify-center bg-muted text-muted-foreground">
              <Utensils className="h-8 w-8" />
            </div>
            <div className="flex flex-col gap-0.5 p-3">
              <span className="truncate font-display text-lg leading-tight">{item.name}</span>
              <span
                className={`text-xs font-medium ${
                  item.days <= 1 ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                {expiryLabel(item.days)}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
