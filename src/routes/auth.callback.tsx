import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({ meta: [
    { title: "Completing Sign In — MealMate" },
    { name: "description", content: "Complete your secure MealMate account sign-in." },
    { property: "og:title", content: "Completing Sign In — MealMate" },
    { property: "og:description", content: "Complete your secure MealMate account sign-in." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorDescription = params.get("error_description");
    const code = params.get("code");
    if (errorDescription) {
      setError(decodeURIComponent(errorDescription.replace(/\+/g, " ")));
      return undefined;
    }
    if (!code) {
      // Implicit flow: tokens arrive in the URL hash and the client stores them automatically.
      const timer = window.setTimeout(async () => {
        const { data } = await supabase.auth.getSession();
        if (data.session) void navigate({ to: "/", replace: true });
        else setError("The sign-in link is missing or expired.");
      }, 300);
      return () => window.clearTimeout(timer);
    }

    supabase.auth.exchangeCodeForSession(code).then(({ error: exchangeError }) => {
      if (exchangeError) {
        setError("GitHub sign-in could not be completed. Please try again.");
        return;
      }
      void navigate({ to: "/", replace: true });
    });
    return undefined;
  }, [navigate]);

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-20 text-center">
      {error ? (
        <div className="space-y-4">
          <p className="text-sm text-destructive">{error}</p>
          <button className="text-sm underline" onClick={() => void navigate({ to: "/auth", replace: true })}>
            Return to sign in
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Completing sign-in…
        </div>
      )}
    </main>
  );
}
