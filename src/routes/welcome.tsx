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
      toast.error("Google sign in could not finish. Please try email."),
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
      toast.error("Google sign in could not finish. Please try again or use email.");
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
                  <span aria-hidden="true" className="font-bold">
                    G
                  </span>
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
