import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
  signInWithGoogle as signInWithFirebaseGoogle,
  signInWithEmail as signInWithFirebaseEmail,
  signUpWithEmail as signUpWithFirebaseEmail,
  sendPasswordReset as sendFirebasePasswordReset,
  db,
} from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

async function ensureUserProfile(user: { uid: string; email: string | null; displayName: string | null; photoURL: string | null }) {
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  if (snap.exists()) return;

  await setDoc(userRef, {
    id: user.uid,
    email: user.email ?? "",
    displayName: user.displayName || user.email?.split("@")[0] || "Chef",
    photoURL: user.photoURL ?? "",
    goal: "healthy_cooking",
    createdAt: new Date().toISOString(),
  });
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
  component: AuthPage,
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

function AuthPage() {
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
      toast.error(extractErrorMessage(error, "Google sign-in is unavailable. Please use email and password."));
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
        // Try Firebase signup first
        try {
          const cred = await signUpWithFirebaseEmail(normalizedEmail, password, displayName);
          if (cred?.user) {
            try {
              await ensureUserProfile(cred.user);
            } catch (fsErr) {
              console.warn("[Auth] Could not initialize firestore user profile:", fsErr);
            }
            toast.success("Welcome to MealMate!");
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
        // Try Firebase sign in first
        try {
          const cred = await signInWithFirebaseEmail(normalizedEmail, password);
          if (cred?.user) {
            toast.success("Welcome back!");
            navigate({ to: "/", replace: true });
            return;
          }
        } catch (fbErr: any) {
          if (
            fbErr?.code !== "auth/operation-not-allowed" &&
            fbErr?.code !== "auth/user-not-found" &&
            fbErr?.code !== "auth/invalid-credential"
          ) {
            console.warn("[Auth] Firebase sign-in attempt notice:", fbErr?.code);
          }
        }

      }
      navigate({ to: "/", replace: true });
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
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <MealMateLogo imageClassName="size-16" showName={false} />
          <h1 className="mt-4 font-display text-3xl">
            {mode === "signin" ? "Welcome back" : "Join MealMate"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Sign in to save recipes and plan meals."
              : "Create an account to start cooking."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="name">Display name</Label>
              <Input
                id="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Chef Thabo"
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
                placeholder="••••���•••"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {mode === "signup" && (
              <p className="text-xs text-muted-foreground">At least 6 characters.</p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
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
            OR
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={signInWithGoogle}
          >
            Continue with Google
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
                  try {
                    await sendFirebasePasswordReset(email);
                    toast.success("Check your inbox for a reset link.");
                    return;
                  } catch (error) {
                    throw error;
                  }
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
            className="font-medium text-foreground hover:underline"
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
    </main>
  );
}
