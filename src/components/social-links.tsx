import { Instagram } from "lucide-react";
import type { SVGProps } from "react";

function TikTokIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M16.7 2H13v13.3a3.1 3.1 0 1 1-2.7-3.1V8.4a6.8 6.8 0 1 0 6.4 6.9V8.5a9 9 0 0 0 5.3 1.7V6.5A5.3 5.3 0 0 1 16.7 2Z" />
    </svg>
  );
}

export const SOCIAL_PROFILES = [
  { name: "Instagram", href: "https://www.instagram.com/mealsmates.app/", icon: Instagram },
  { name: "TikTok", href: "https://www.tiktok.com/@mealsmates.app", icon: TikTokIcon },
] as const;

export function SocialLinks() {
  return (
    <nav aria-label="MealMate social profiles" className="flex flex-wrap items-center gap-2">
      {SOCIAL_PROFILES.map(({ name, href, icon: Icon }) => (
        <a
          key={name}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`MealMate on ${name} (opens externally)`}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          {name}
        </a>
      ))}
    </nav>
  );
}
