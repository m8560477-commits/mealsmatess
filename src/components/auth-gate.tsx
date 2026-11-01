import { useHubSurface } from "@/components/hub/hub-context";
import { useEffect, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2, MailWarning } from "lucide-react";
import { useSession, signOutUnified } from "@/hooks/use-session";
import { auth } from "@/lib/firebase";
import { reload, sendEmailVerification } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// MealMate entry: auth → onboarding → paywall → app.
// Only these routes are reachable without a signed-in, verified user.
const PUBLIC_PREFIXES = [
  "/auth",
  "/premium",
  "/reset-password",
  "/legal",
  "/about",
  "/support",
];

// Inactive sessions are signed out after this window.
const INACTIVITY_MS = 30 * 60 * 1000; // 30 minutes

export function AuthGate({
  children,
  publicHome = false,
}: {
  children: ReactNode;
  publicHome?: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, loading } = useSession();
  const navigate = useNavigate();

  const isPublic =
    publicHome || PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const needsAccount = !isPublic;

  // Inactivity timeout: sign out after N minutes of no interaction.
  useEffect(() => {
    if (!user) return;
    let lastActivity = Date.now();
    const bump = () => {
      lastActivity = Date.now();
    };
    const events: (keyof WindowEventMap)[] = [
      "mousemove",
      "keydown",
      "click",
      "touchstart",
      "scroll",
    ];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true, capture: true }));
    const iv = window.setInterval(async () => {
      if (Date.now() - lastActivity > INACTIVITY_MS) {
        window.clearInterval(iv);
        events.forEach((e) => window.removeEventListener(e, bump, { capture: true }));
        await signOutUnified();
        toast.message("Signed out due to inactivity.");
        navigate({ to: "/auth", replace: true });
      }
    }, 60 * 1000);
    return () => {
      window.clearInterval(iv);
      events.forEach((e) => window.removeEventListener(e, bump, { capture: true }));
    };
  }, [user, navigate]);

  if (!needsAccount) return <>{children}</>;

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!user) {
    return <RedirectToAuth />;
  }

  // Email verification enforcement: block until confirmed_at or emailVerified is set.
  const confirmed = Boolean(user.emailVerified);
  if (user.email && !confirmed) {
    return <VerifyEmailPrompt email={user.email} />;
  }

  return <>{children}</>;
}

function RedirectToAuth() {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: "/auth", replace: true });
  }, [navigate]);
  return (
    <main className="flex flex-1 items-center justify-center py-24">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </main>
  );
}

function VerifyEmailPrompt({ email }: { email: string }) {
  async function confirmVerification() {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    try {
      await reload(currentUser);
      if (currentUser.emailVerified) window.location.reload();
      else toast.info("Your email is not verified yet. Check the link in your inbox.");
    } catch {
      toast.error("Could not refresh your verification status. Please try again.");
    }
  }

  async function resend() {
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.email !== email) {
      toast.error("Sign in again before requesting a verification email.");
      return;
    }
    try {
      await sendEmailVerification(currentUser);
      toast.success("Verification email sent. Check your inbox.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not send the verification email.",
      );
    }
  }
  async function signOut() {
    await signOutUnified();
  }
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
          <MailWarning className="h-6 w-6" />
        </div>
        <h1 className="font-display text-2xl">Verify your email</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We sent a link to <span className="font-medium text-foreground">{email}</span>. Open it,
          then come back here.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button className="w-full" onClick={() => void confirmVerification()}>
            I verified my email
          </Button>
          <Button variant="outline" className="w-full" onClick={() => void resend()}>
            Resend verification email
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => void signOut()}>
            Use a different account
          </Button>
        </div>
      </div>
    </main>
  );
}
