import { CONSUMER_URL, DISCOVER_URL, HUB_URL } from "@/lib/hub-surface";

export function EcosystemLinks() {
  return (
    <nav aria-label="MealMate ecosystem" className="flex flex-wrap items-center gap-x-5 gap-y-1">
      {[
        { href: CONSUMER_URL, label: "MealMate" },
        { href: DISCOVER_URL, label: "Discover" },
        { href: HUB_URL, label: "MealMate Hub" },
      ].map(({ href, label }) => (
        <a
          key={href}
          href={href}
          className="inline-flex min-h-11 items-center text-sm font-medium underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
