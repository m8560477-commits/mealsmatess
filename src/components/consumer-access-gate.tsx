import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/hooks/use-session";
import { usePremium } from "@/hooks/use-premium";
import { hasSeenTour, markTourSeen } from "@/lib/preferences";
import { completeIntro, getIntroCompletion } from "@/lib/billing.functions";
import { getMyPreferences } from "@/lib/preferences.functions";

function isPublicConsumerPath(path: string) {
  return [
    "/welcome",
    "/onboarding",
    "/premium",
    "/auth",
    "/reset-password",
    "/legal",
    "/support",
    "/about",
  ].some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}
/** Guard the entire Consumer shell. Protected children never mount before verification. */
export function ConsumerAccessGate({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const userId = user?.id;
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const access = usePremium();
  const preferences = useQuery({
    queryKey: ["intro-completion", user?.id],
    queryFn: async () =>
      (await getIntroCompletion()) || !!(await getMyPreferences())?.onboarding_completed,
    enabled: !!user,
    retry: false,
  });
  const publicPath = isPublicConsumerPath(path);
  useEffect(() => {
    if (!userId || !hasSeenTour()) return;
    void completeIntro().catch(() => undefined);
  }, [userId]);
  useEffect(() => {
    if (loading || publicPath || (userId && access.loading)) return;
    if (!online) return;
    if (userId && access.error) return;
    if (userId && access.isPremium) return;
    if (userId && preferences.isPending) return;
    // Entry sequence: auth → onboarding → paywall → app (strict).
    // Only server-backed onboarding completion counts so local flags cannot skip the flow.
    const onboardingDone = !!preferences.data;
    if (onboardingDone) markTourSeen();
    void navigate({ to: onboardingDone ? "/premium" : "/onboarding", replace: true });
  }, [
    loading,
    online,
    publicPath,
    userId,
    access.loading,
    access.isPremium,
    access.error,
    preferences.isPending,
    preferences.data,
    navigate,
  ]);
  if (publicPath) return <>{children}</>;
  if (!online)
    return (
      <main className="premium-gate" role="status">
        <h1>You’re offline</h1>
        <p>Connect to verify your subscription and continue.</p>
      </main>
    );
  if (userId && access.error)
    return (
      <main className="premium-gate">
        <h1>Let’s check your subscription</h1>
        <p>We couldn’t verify access. Check your connection and try again.</p>
        <button className="premium-primary" onClick={() => void access.retry()}>
          Try again
        </button>
        <button className="premium-secondary" onClick={() => void navigate({ to: "/premium" })}>
          Restore or choose a plan
        </button>
      </main>
    );
  if (loading || !user || access.loading || !access.isPremium)
    return (
      <main className="premium-gate" role="status">
        <span className="premium-eyebrow">MEALMATE</span>
        <p>Checking your access…</p>
      </main>
    );
  return <>{children}</>;
}
