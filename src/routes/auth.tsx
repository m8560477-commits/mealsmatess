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
          navigate({ to: "/onboarding", replace: true });
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
    if (!loading && user) navigate({ to: "/onboarding", replace: true });
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
        navigate({ to: "/onboarding", replace: true });
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
            navigate({ to: "/onboarding", replace: true });
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
            navigate({ to: "/onboarding", replace: true });
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
    <main className={isHub ? "hub-auth auth-redesign" : "auth-redesign"}>
      <div className="auth-ambient" aria-hidden="true" />
      <div className="auth-shell">
        <header className="auth-brand">
          <MealMateLogo className="auth-logo" imageClassName="size-12 rounded-2xl" showName />
        </header>
        <div className="auth-card">
          <p className="auth-eyebrow">{mode === "signin" ? "Welcome back" : "Join MealMate"}</p>
          <h1 className="auth-title">
            {isHub
              ? mode === "signin"
                ? "Sign in to your workspace"
                : "Create your Hub account"
              : mode === "signin"
                ? "Log in to cook smarter"
                : "Start cooking with confidence"}
          </h1>
          <p className="auth-subtitle">
            {mode === "signin"
              ? "Recipes, plans, and Mia — ready when you are."
              : "Set up once. Eat well every day."}
          </p>
          <form onSubmit={handleSubmit} className="auth-form">
            {mode === "signup" && (
              <div className="auth-field">
                <Label htmlFor="name">Display name</Label>
                <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Chef Thabo" className="auth-input" />
              </div>
            )}
            <div className="auth-field">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="auth-input" />
            </div>
            <div className="auth-field">
              <Label htmlFor="password">Password</Label>
              <div className="auth-password-wrap">
                <Input id="password" type={showPassword ? "text" : "password"} required minLength={6} autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="auth-input auth-input-password" />
                <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"} className="auth-password-toggle">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {mode === "signup" && <p className="auth-hint">At least 6 characters.</p>}
            </div>
            <button type="submit" className="auth-primary" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "signin" ? "Sign in" : "Create account"}
            </button>
            <div className="auth-divider"><span>or continue with</span></div>
            <button type="button" className="auth-google" disabled={busy} onClick={signInWithGoogle}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue with Google"}
            </button>
            {mode === "signin" && (
              <button type="button" className="auth-forgot" disabled={busy} onClick={async () => {
                if (!email) { toast.error("Enter your email first, then tap forgot password."); return; }
                setBusy(true);
                try { await sendFirebasePasswordReset(email.trim().toLowerCase()); toast.success("Check your inbox for a reset link."); }
                catch { toast.error("Could not send the reset email. Please check the address and try again."); }
                finally { setBusy(false); }
              }}>Forgot password?</button>
            )}
          </form>
          <p className="auth-switch">
            {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
            <button type="button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
          <p className="auth-legal">
            By continuing you agree to our <Link to="/legal/terms">Terms</Link> and <Link to="/legal/privacy">Privacy Policy</Link>.
          </p>
        </div>
      </div>
    </main>
  );
}
