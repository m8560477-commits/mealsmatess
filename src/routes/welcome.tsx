import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { OnboardingLayout } from "@/components/onboarding-layout";
import { auth, getRedirectResult, signInWithGoogle } from "@/lib/firebase";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/welcome")({
  head: () => ({ meta: [{ title: "Welcome to MealMate" }] }),
  component: WelcomePage,
});

function WelcomePage() {
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    void getRedirectResult(auth).catch(() =>
      toast.error("Google sign-in could not finish. Please try email."),
    );
  }, []);
  // The root onboarding guard checks the signed-in profile and selects home or onboarding.
  async function google() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch {
      toast.error("Google sign-in could not finish. Please try again or use email.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <OnboardingLayout
      step={0}
      busy={busy}
      actions={
        <>
          {user ? (
            <button
              className="onboarding-primary"
              disabled={loading || busy}
              onClick={() => void navigate({ to: "/", replace: true })}
            >
              Continue
            </button>
          ) : (
            <>
              <button
                className="onboarding-primary"
                onClick={() => void google()}
                disabled={busy || loading}
              >
                {busy ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <svg
                    aria-hidden="true"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.7 4.7 0 0 1-2 3.1v2.6h3.3c1.9-1.8 2.9-4.4 2.9-7.6ZM12 22c2.7 0 5-1 6.7-2.5l-3.3-2.6c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.2H3v2.7A10 10 0 0 0 12 22ZM6.4 13.7a6 6 0 0 1 0-3.4V7.6H3a10 10 0 0 0 0 8.8l3.4-2.7ZM12 6.1c1.5 0 2.8.5 3.9 1.5l2.9-2.9A9.6 9.6 0 0 0 12 2a10 10 0 0 0-9 5.6l3.4 2.7C7.2 7.9 9.4 6.1 12 6.1Z" />
                  </svg>
                )}{" "}
                Continue with Google
              </button>
              <Link
                to="/auth"
                search={{ mode: "signin" }}
                className={`onboarding-secondary ${busy ? "pointer-events-none opacity-50" : ""}`}
                aria-disabled={busy}
              >
                <Mail size={18} /> Sign in with email
              </Link>
              <Link
                to="/auth"
                search={{ mode: "signup" }}
                className={`onboarding-text-button ${busy ? "pointer-events-none opacity-50" : ""}`}
                aria-disabled={busy}
              >
                Create an account
              </Link>
            </>
          )}
          <p className="onboarding-legal">
            By continuing, you agree to our <Link to="/legal/terms">Terms</Link> and{" "}
            <Link to="/legal/privacy">Privacy Policy</Link>.
          </p>
        </>
      }
    />
  );
}
