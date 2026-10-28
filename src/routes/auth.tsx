import { useHubSurface } from "@/components/hub/hub-context";
import { createFileRoute, useNavigate, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { MealMateLogo } from "@/components/mealmate-logo";
import { toast } from "sonner";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getRedirectResult,
  auth,
  signInWithGoogle as signInWithFirebaseGoogle,
  signInWithEmail as signInWithFirebaseEmail,
  signUpWithEmail as signUpWithFirebaseEmail,
  sendPasswordReset as sendFirebasePasswordReset,
  db,
} from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { sendEmailVerification } from "firebase/auth";

async function ensureUserProfile(user: {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}) {
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  const profile = {
    id: user.uid,
    email: user.email ?? "",
    displayName: user.displayName || user.email?.split("@")[0] || "Chef",
    photoURL: user.photoURL ?? "",
    goal: "healthy_cooking",
  };

  await setDoc(
    userRef,
    snap.exists()
      ? profile
      : {
          ...profile,
          id: user.uid,
          email: user.email ?? "",
          displayName: user.displayName || user.email?.split("@")[0] || "Chef",
          photoURL: user.photoURL ?? "",
          goal: "healthy_cooking",
          createdAt: new Date().toISOString(),
        },
    { merge: true },
  );
}

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in | MealMate" },
      {
        name: "description",
        content: "Sign in or create your MealMate account to save recipes, lists, and meal plans.",
      },
      { property: "og:title", content: "Sign in | MealMate" },
      { property: "og:description", content: "Access your saved recipes, lists, and meal plans." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { mode?: "signin" | "signup" } =>
    s["mode"] === "signup" ? { mode: "signup" } : s["mode"] === "signin" ? { mode: "signin" } : {},
  component: AuthLayout,
});

function extractErrorMessage(err: unknown, fallback: string): string {
  if (!err) return fallback;
  if (typeof err === "string") return err;
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "object" && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return fallback;
}

function getGoogleSignInErrorMessage(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;

  if (code === "auth/unauthorized-domain") {
    const hostname = typeof window === "undefined" ? "this site" : window.location.hostname;
    return `Google sign-in is not enabled for ${hostname}. Add this domain under Firebase Authentication settings.`;
  }

  if (code === "auth/internal-error") {
    return "Google could not finish signing in. Check that Google sign-in is enabled and this site is listed in Firebase Authentication's authorized domains.";
  }

  return extractErrorMessage(
    error,
    "Google sign-in is unavailable. Please use email and password.",
  );
}

export function AuthLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return pathname === "/auth" || pathname === "/auth/" ? <AuthPage /> : <Outlet />;
}

function AuthPage() {
  const isHub = useHubSurface();
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const search = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">(search.mode ?? "signin");
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void getRedirectResult(auth)
      .then(async (result) => {
        if (!active || !result?.user) return;
        try {
          await ensureUserProfile(result.user);
          toast.success("Welcome to MealMate!");
          navigate({ to: "/", replace: true });
        } catch (error) {
          console.error("[Auth] Google redirect completion failed:", error);
          toast.error("Google sign-in completed, but your profile could not be loaded.");
        }
      })
      .catch((error) => {
        if (error?.code === "auth/popup-closed-by-user") return;
        console.error("[Auth] Google redirect error:", error);
        toast.error(extractErrorMessage(error, "Google sign-in is unavailable."));
      });
    return () => {
      active = false;
    };
  }, [navigate]);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/", replace: true });
  }, [user, loading, navigate]);

  async function signInWithGoogle() {
    if (busy) return;
    setBusy(true);
    try {
      const cred = await signInWithFirebaseGoogle();
      if (cred?.user) {
        try {
          await ensureUserProfile(cred.user);
        } catch (dbErr) {
          console.warn("[Auth] Could not create Firestore profile:", dbErr);
        }
        toast.success("Welcome to MealMate!");
        navigate({ to: "/", replace: true });
        return;
      }
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "auth/popup-closed-by-user") {
        return;
      }
      console.error("[Auth] Google sign-in error:", error);
      toast.error(getGoogleSignInErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail || password.length < 6) {
        toast.error("Enter a valid email and a password with at least 6 characters.");
        return;
      }

      if (mode === "signup") {
        try {
          const cred = await signUpWithFirebaseEmail(normalizedEmail, password, displayName);
          if (cred?.user) {
            try {
              await ensureUserProfile(cred.user);
            } catch (fsErr) {
              console.warn("[Auth] Could not initialize firestore user profile:", fsErr);
            }
            await sendEmailVerification(cred.user);
            toast.message("Check your inbox to verify your email and finish setting up MealMate.");
            navigate({ to: "/", replace: true });
            return;
          }
        } catch (fbErr: any) {
          if (fbErr?.code === "auth/email-already-in-use") {
            toast.error("An account with this email already exists. Sign in instead.");
            setMode("signin");
            setPassword("");
            return;
          }
          throw fbErr;
        }
        toast.success("Welcome to MealMate!");
      } else {
        try {
          const cred = await signInWithFirebaseEmail(normalizedEmail, password);
          if (cred?.user) {
            toast.success("Welcome back!");
            navigate({ to: "/", replace: true });
            return;
          }
        } catch (fbErr: any) {
          if (
            fbErr?.code === "auth/user-not-found" ||
            fbErr?.code === "auth/invalid-credential" ||
            fbErr?.code === "auth/wrong-password"
          ) {
            throw new Error("Invalid email or password.");
          }
          throw fbErr;
        }
      }
    } catch (err) {
      console.error("[Auth] submit error:", err);
      const message = extractErrorMessage(err, "Authentication failed").toLowerCase();
      toast.error(
        message.includes("invalid login credentials") ||
          message.includes("invalid email or password") ||
          message.includes("auth/wrong-password") ||
          message.includes("auth/user-not-found")
          ? "Invalid email or password."
          : message.includes("email not confirmed")
            ? "Please verify your email before signing in."
            : message.includes("already registered") || message.includes("already exists")
              ? "An account with this email already exists. Sign in instead."
              : message.includes("pwned") || message.includes("weak")
                ? "That password is too weak or has appeared in a data breach. Choose another."
                : message.includes("rate limit")
                  ? "Too many attempts. Please wait a minute and try again."
                  : extractErrorMessage(err, "Authentication failed"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      className={
        isHub
          ? "hub-auth flex flex-1 items-center justify-center px-4 py-10"
          : "flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(157,204,153,0.16),_transparent_34%),linear-gradient(135deg,#f3f1eb_0%,#f6f4ef_28%,#f0efe9_100%)] px-4 py-10 text-foreground"
      }
    >
      <div className="grid w-full max-w-6xl overflow-hidden rounded-[32px] border border-black/5 bg-white/70 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl md:grid-cols-[1.1fr_0.9fr]">
        <div className="relative hidden min-h-[680px] overflow-hidden bg-[#1f2d1c] p-8 text-white md:flex md:flex-col md:justify-between">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(176,214,120,0.35),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(255,255,255,0.12),_transparent_26%)]" />
          <div className="relative z-10 flex items-center gap-3">
            <MealMateLogo className="text-white" imageClassName="size-11 rounded-xl" showName />
          </div>

          <div className="relative z-10 space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium uppercase tracking-[0.22em] text-emerald-100">
              Meal planning reimagined
            </div>
            <h2 className="max-w-sm font-display text-4xl leading-tight text-white">
              Make better meals feel effortless.
            </h2>
            <p className="max-w-md text-base text-emerald-50/80">
              Save recipes, shop smarter, and turn everyday ingredients into dinner plans you’ll
              actually enjoy.
            </p>
            <div className="grid max-w-md gap-4 pt-2">
              {[
                "Smart shopping lists",
                "Flexible meal planning",
                "Recipe ideas you’ll cook again",
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/90"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400/20 text-base text-emerald-200">
                    ✓
                  </span>
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 text-sm text-emerald-50/70">
            Fresh ideas for your kitchen, without the overwhelm.
          </div>
        </div>

        <div className="flex items-center justify-center p-6 sm:p-8 md:p-10">
          <div className="w-full max-w-md">
            <div className="mb-8 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <MealMateLogo imageClassName="size-12 rounded-2xl" showName={false} />
              </div>
              <button
                type="button"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                className="rounded-full border border-border bg-white/80 px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-white"
              >
                {mode === "signin" ? "Create account" : "Sign in"}
              </button>
            </div>

            <div className="rounded-[28px] border border-border/80 bg-white/80 p-6 shadow-[0_16px_50px_rgba(15,23,42,0.06)]">
              <div className="mb-6 text-left">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700/80">
                  {mode === "signin" ? "Welcome back" : "Join MealMate"}
                </p>
                <h1 className="mt-3 font-display text-3xl text-foreground">
                  {isHub
                    ? mode === "signin"
                      ? "Sign in to your workspace"
                      : "Create your Hub account"
                    : mode === "signin"
                      ? "Log in to cook smarter"
                      : "Start cooking with confidence"}
                </h1>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === "signup" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Display name</Label>
                    <Input
                      id="name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Chef Thabo"
                      className="h-11 rounded-2xl border-border bg-background"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="h-11 rounded-2xl border-border bg-background"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={6}
                      autoComplete={mode === "signin" ? "current-password" : "new-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="h-11 rounded-2xl border-border bg-background pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {mode === "signup" && (
                    <p className="text-xs text-muted-foreground">At least 6 characters.</p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="h-11 w-full rounded-2xl bg-[#1f2d1c] text-white hover:bg-[#243722]"
                  disabled={busy}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : mode === "signin" ? (
                    "Sign in"
                  ) : (
                    "Create account"
                  )}
                </Button>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  or continue with
                  <span className="h-px flex-1 bg-border" />
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full rounded-2xl border-border bg-background"
                  disabled={busy}
                  onClick={signInWithGoogle}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue with Google"}
                </Button>

                {mode === "signin" && (
                  <button
                    type="button"
                    className="w-full text-center text-sm text-muted-foreground hover:text-foreground hover:underline"
                    disabled={busy}
                    onClick={async () => {
                      if (!email) {
                        toast.error("Enter your email first, then tap forgot password.");
                        return;
                      }
                      setBusy(true);
                      try {
                        await sendFirebasePasswordReset(email.trim().toLowerCase());
                        toast.success("Check your inbox for a reset link.");
                      } catch (err) {
                        toast.error(
                          "Could not send the reset email. Please check the address and try again.",
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Forgot password?
                  </button>
                )}
              </form>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
                <button
                  type="button"
                  onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                  className="font-semibold text-foreground underline-offset-4 hover:underline"
                >
                  {mode === "signin" ? "Create an account" : "Sign in"}
                </button>
              </p>

              <p className="mt-4 text-center text-xs text-muted-foreground">
                By continuing you agree to our{" "}
                <Link to="/legal/terms" className="underline hover:text-foreground">
                  Terms
                </Link>{" "}
                and{" "}
                <Link to="/legal/privacy" className="underline hover:text-foreground">
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
