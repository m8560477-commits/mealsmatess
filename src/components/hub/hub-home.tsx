import { Link } from "@tanstack/react-router";
import { ArrowRight, ClipboardList, Utensils, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import food from "@/assets/recipes/smoky-beef-tacos.webp";

export function HubHome() {
  const { user } = useSession();
  return (
    <main className="px-5 py-12 sm:px-8 sm:py-20">
      <section className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            For the people behind the food
          </p>
          <h1 className="mt-6 text-5xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
            Your restaurant.
            <br />
            One connected workspace.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-relaxed text-muted-foreground">
            Bring your menu, incoming orders and restaurant details together. Manage the food
            experience you share with MealMate customers.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="rounded-full px-7">
              <Link to={user ? "/partner/dashboard" : "/auth"}>
                {user ? "Open workspace" : "Sign in to Hub"}
                <ArrowRight className="ml-3 size-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full px-7">
              <Link to={user ? "/partner" : "/auth"} search={user ? {} : { mode: "signup" }}>
                Register your restaurant
              </Link>
            </Button>
          </div>
          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
            Use your MealMate account. New restaurants are reviewed before appearing to customers.
          </p>
        </div>
        <figure className="overflow-hidden rounded-[2rem] border border-border">
          <img
            src={food}
            alt="Freshly prepared tacos with herbs, lime and grilled beef"
            width={1024}
            height={1024}
            fetchPriority="high"
            className="aspect-square w-full object-cover"
          />
          <figcaption className="bg-card px-6 py-4 text-sm text-muted-foreground">
            You make the food. Keep the details together with MealMate.
          </figcaption>
        </figure>
      </section>
      <section
        aria-label="Restaurant tools"
        className="mt-16 grid gap-8 border-t border-border pt-10 sm:grid-cols-3"
      >
        {[
          {
            icon: Utensils,
            title: "A menu that stays current",
            text: "Add dishes, upload photos, update prices and control availability.",
          },
          {
            icon: ClipboardList,
            title: "Keep orders moving",
            text: "Review incoming orders and update their progress from preparation to completion.",
          },
          {
            icon: BarChart3,
            title: "See how you’re doing",
            text: "View your order totals, revenue and average order value from real activity.",
          },
        ].map(({ icon: Icon, title, text }) => (
          <article key={title}>
            <Icon className="mb-5 size-6" aria-hidden="true" />
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{text}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
