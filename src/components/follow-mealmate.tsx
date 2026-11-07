import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Instagram, ArrowUpRight } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import { getSocialIntroCompletion, completeSocialIntro } from "@/lib/billing.functions";

export function SocialLinks() {
  return (
    <div className="social-cards">
      <a href="https://www.instagram.com/mealsmates.app/" target="_blank" rel="noopener noreferrer">
        <Instagram size={32} aria-hidden="true" />
        <strong>Instagram</strong>
        <span>@mealsmates.app</span>
        <span className="social-follow">
          Follow on Instagram <ArrowUpRight size={16} />
        </span>
      </a>
      <a href="https://www.tiktok.com/@mealsmates.app" target="_blank" rel="noopener noreferrer">
        <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
          <path d="M16.7 1h-4v14.6a3.2 3.2 0 1 1-2.8-3.2V8.3A7.3 7.3 0 1 0 16.7 16V8.5A10 10 0 0 0 22 10V6a5.4 5.4 0 0 1-5.3-5Z" />
        </svg>
        <strong>TikTok</strong>
        <span>@mealsmates.app</span>
        <span className="social-follow">
          Follow on TikTok <ArrowUpRight size={16} />
        </span>
      </a>
    </div>
  );
}
export function FollowMealMate({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const client = useQueryClient();
  const queryKey = ["social-intro", user?.id];
  const status = useQuery({ queryKey, queryFn: () => getSocialIntroCompletion(), retry: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function finish() {
    setBusy(true);
    setError("");
    try {
      await completeSocialIntro();
      client.setQueryData(queryKey, true);
    } catch {
      setError("We couldn’t save your choice. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  if (status.data) return <>{children}</>;
  if (status.isPending)
    return (
      <main className="premium-gate" role="status">
        Getting everything ready…
      </main>
    );
  if (status.isError)
    return (
      <main className="premium-gate">
        <p>We couldn’t load your preferences.</p>
        <button className="premium-primary" onClick={() => void status.refetch()}>
          Try again
        </button>
      </main>
    );
  return (
    <main className="social-intro">
      <p className="premium-eyebrow">MEALMATE · BY TAZ TECHNOLOGIES</p>
      <h1>
        Good food.
        <br />
        Better together.
      </h1>
      <p>
        A little inspiration for your feed. Follow along for recipes, kitchen ideas and what’s
        cooking at MealMate.
      </p>
      <SocialLinks />
      <p className="text-sm text-muted-foreground">
        Following is entirely optional. Each link opens the official account so you can choose
        whether to follow.
      </p>
      {error && <p role="alert">{error}</p>}
      <button className="premium-primary" disabled={busy} onClick={() => void finish()}>
        {busy ? "Saving…" : "Continue to my kitchen"}
      </button>
      <button className="guide-skip" disabled={busy} onClick={() => void finish()}>
        Skip
      </button>
    </main>
  );
}
