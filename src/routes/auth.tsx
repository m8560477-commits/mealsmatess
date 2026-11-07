import { useHubSurface } from "@/components/hub/hub-context";
import { createFileRoute, useNavigate, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Eye, EyeOff, Loader2, Mail } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { MealMateLogo } from "@/components/mealmate-logo";
import { toast } from "sonner";
import { useSession } from "@/hooks/use-session";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getRedirectResult,
  auth,
  signInWithGoogle as signInWithFirebaseGoogle,
  signInWithEmail as signInWithFirebaseEmail,
  signUpWithEmail as signUpWithFirebaseEmail,
  sendPasswordReset as sendFirebasePasswordReset,
} from "@/lib/firebase-core";
import { sendEmailVerification, updateProfile } from "firebase/auth";

async function ensureUserProfile(user: {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}) {
  const [{ db }, { doc, getDoc, setDoc }] = await Promise.all([
    import("@/lib/firebase"),
    import("firebase/firestore"),
  ]);
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
      ? { id: user.uid, email: user.email ?? "" }
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
  validateSearch: (s: Record<string, unknown>): { mode?: "signin" | "signup" | "reset" } =>
    s["mode"] === "signup"
      ? { mode: "signup" }
      : s["mode"] === "signin"
        ? { mode: "signin" }
        : s["mode"] === "reset"
          ? { mode: "reset" }
          : {},
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

export function AuthPage() {
  const isHub = useHubSurface();
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const search = Route.useSearch();
  const mode = search.mode ?? "main";
  const clearAuthForm = () => {
    setFeedback(null);
    setPassword("");
    setConfirmation("");
  };
  const setMode = (next?: "signin" | "signup" | "reset") => {
    clearAuthForm();
    void navigate({ to: "/auth", search: next ? { mode: next } : {} });
  };
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [profileError, setProfileError] = useState(false);
  const [redirectPending, setRedirectPending] = useState(true);
  const [feedback, setFeedback] = useState<{ kind: "error" | "success"; text: string } | null>(
    null,
  );

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
          setProfileError(true);
          setFeedback({
            kind: "error",
            text: "Your account is signed in, but we couldn’t save your profile. Please retry.",
          });
        }
      })
      .catch((error) => {
        if (error?.code === "auth/popup-closed-by-user") return;
        console.error("[Auth] Google redirect error:", error);
        setFeedback({ kind: "error", text: getGoogleSignInErrorMessage(error) });
      })
      .finally(() => {
        if (active) setRedirectPending(false);
      });
    return () => {
      active = false;
    };
  }, [navigate]);

  useEffect(() => {
    if (!loading && !busy && !profileError && !redirectPending && user)
      navigate({ to: "/", replace: true });
  }, [user, loading, busy, profileError, redirectPending, navigate]);

  async function signInWithGoogle() {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const cred = await signInWithFirebaseGoogle();
      if (cred?.user) {
        try {
          await ensureUserProfile(cred.user);
        } catch (dbErr) {
          console.warn("[Auth] Could not create Firestore profile:", dbErr);
          setProfileError(true);
          setFeedback({
            kind: "error",
            text: "Your account is signed in, but we couldn’t save your profile. Please retry.",
          });
          return;
        }
        toast.success("Welcome to MealMate!");
        navigate({ to: "/", replace: true });
        return;
      }
    } catch (error) {
      const code = (error as { code?: string })?.code;
      const message = (error as { message?: string })?.message;
      if (
        code === "auth/popup-closed-by-user" ||
        code === "auth/cancelled-popup-request" ||
        message === "Authorization canceled."
      ) {
        setFeedback({ kind: "success", text: "Google sign-in was cancelled." });
        return;
      }
      console.error("[Auth] Google sign-in error:", error);
      setFeedback({ kind: "error", text: getGoogleSignInErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (mode === "reset") {
        await sendFirebasePasswordReset(normalizedEmail);
        setFeedback({
          kind: "success",
          text: "If an account exists for this email, a reset link is on its way.",
        });
        return;
      }
      if (mode === "signup" && !displayName.trim()) {
        setFeedback({ kind: "error", text: "Enter your full name." });
        return;
      }
      if (!normalizedEmail || password.length < 6) {
        setFeedback({
          kind: "error",
          text: "Enter a valid email and a password with at least 6 characters.",
        });
        return;
      }

      if (mode === "signup" && password !== confirmation) {
        setFeedback({ kind: "error", text: "Passwords don’t match." });
        return;
      }
      if (mode === "signup") {
        try {
          const cred = await signUpWithFirebaseEmail(normalizedEmail, password, displayName.trim());
          if (cred?.user) {
            try {
              await ensureUserProfile(cred.user);
            } catch (fsErr) {
              console.warn("[Auth] Could not initialize firestore user profile:", fsErr);
              setProfileError(true);
              setFeedback({
                kind: "error",
                text: "Your account was created, but we couldn’t save your profile. Please retry.",
              });
              try {
                sessionStorage.setItem(`mealmate.account-created:${cred.user.uid}`, "1");
              } catch {
                /* Optional presentation hint. */
              }
              return;
            }
            try {
              sessionStorage.setItem(`mealmate.account-created:${cred.user.uid}`, "1");
            } catch {
              /* Optional presentation hint. */
            }
            try {
              await sendEmailVerification(cred.user);
              toast.message(
                "Check your inbox to verify your email and finish setting up MealMate.",
              );
            } catch {
              toast.error(
                "Your account is ready, but we couldn’t send a verification email. You can request another after signing in.",
              );
            }
            navigate({ to: "/", replace: true });
            return;
          }
        } catch (fbErr: any) {
          if (fbErr?.code === "auth/email-already-in-use") {
            setMode("signin");
            setFeedback({
              kind: "error",
              text: "An account with this email already exists. Sign in instead.",
            });
            setPassword("");
            return;
          }
          if (auth.currentUser && auth.currentUser.email?.toLowerCase() === normalizedEmail) {
            try {
              sessionStorage.setItem(`mealmate.account-created:${auth.currentUser.uid}`, "1");
            } catch {
              /* Optional presentation hint. */
            }
            setProfileError(true);
            setFeedback({
              kind: "error",
              text: "Your account was created, but we couldn’t finish your profile. Please retry.",
            });
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
      setFeedback({
        kind: "error",
        text:
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
                    : mode === "reset"
                      ? "Could not send the reset email. Please check the address and try again."
                      : extractErrorMessage(err, "Authentication failed"),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={isHub ? "hub-auth auth-redesign" : "auth-redesign"}>
      <div className="auth-shell">
        <header className="auth-brand">
          <MealMateLogo className="auth-logo" imageClassName="size-10 rounded-lg" showName />
        </header>
        <div className="auth-card">
          {mode !== "main" && (
            <button
              type="button"
              className="auth-back"
              disabled={busy}
              onClick={() => setMode(mode === "reset" ? "signin" : undefined)}
            >
              <ArrowLeft size={16} /> Back
            </button>
          )}
          <h1 className="auth-title">
            {mode === "main"
              ? "Welcome to MealMate"
              : mode === "signup"
                ? isHub
                  ? "Create your Hub account"
                  : "Create your account"
                : mode === "reset"
                  ? "Reset your password"
                  : isHub
                    ? "Sign in to your workspace"
                    : "Welcome Back"}
          </h1>
          <p className="auth-subtitle">
            {mode === "main"
              ? "Your personal food companion."
              : mode === "signup"
                ? "Set up once. Eat well every day."
                : mode === "reset"
                  ? "Enter your email and we’ll send you a reset link."
                  : "Your recipes, plans and Mia are waiting."}
          </p>
          {feedback && (
            <p
              className={`auth-feedback ${feedback.kind}`}
              role={feedback.kind === "error" ? "alert" : "status"}
            >
              {feedback.text}
            </p>
          )}
          {profileError ? (
            <button
              type="button"
              className="auth-primary"
              disabled={busy}
              onClick={async () => {
                if (!auth.currentUser) {
                  setProfileError(false);
                  setFeedback({
                    kind: "error",
                    text: "Your session expired. Please sign in again.",
                  });
                  return;
                }
                setBusy(true);
                try {
                  if (mode === "signup" && displayName.trim())
                    await updateProfile(auth.currentUser, { displayName: displayName.trim() });
                  await ensureUserProfile(auth.currentUser);
                  setProfileError(false);
                  toast.success("Profile saved.");
                  await navigate({ to: "/", replace: true });
                } catch {
                  setFeedback({
                    kind: "error",
                    text: "We couldn’t save your profile. Check your connection and retry.",
                  });
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Saving…" : "Retry saving profile"}
            </button>
          ) : mode === "main" ? (
            <>
              <div className="auth-actions">
                <button
                  type="button"
                  className="auth-google auth-action"
                  disabled={busy || loading || redirectPending}
                  onClick={signInWithGoogle}
                >
                  {busy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Connecting…
                    </>
                  ) : (
                    <>
                      <svg
                        className="auth-google-mark"
                        aria-hidden="true"
                        viewBox="0 0 48 48"
                        focusable="false"
                      >
                        <path
                          fill="#4285F4"
                          d="M43.6 24.5c0-1.4-.1-2.7-.4-4H24v7.6h11c-.5 2.5-1.9 4.6-4 6v5h6.5c3.8-3.5 6.1-8.7 6.1-14.6Z"
                        />
                        <path
                          fill="#34A853"
                          d="M24 44.5c5.5 0 10.1-1.8 13.5-4.9l-6.5-5c-1.8 1.2-4.2 2-7 2-5.3 0-9.8-3.6-11.4-8.5H5.9v5.2C9.2 39.9 16.1 44.5 24 44.5Z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M12.6 28.1c-.4-1.2-.6-2.5-.6-3.9s.2-2.7.6-3.9v-5.2H5.9a20.5 20.5 0 0 0 0 18.2l6.7-5.2Z"
                        />
                        <path
                          fill="#EA4335"
                          d="M24 11.8c3 0 5.7 1 7.8 3.1l5.8-5.8C34.1 5.8 29.5 3.8 24 3.8c-7.9 0-14.8 4.6-18.1 11.3l6.7 5.2C14.2 15.4 18.7 11.8 24 11.8Z"
                        />
                      </svg>
                      Continue with Google
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="auth-primary auth-action"
                  disabled={busy || loading || redirectPending}
                  onClick={() => setMode("signin")}
                >
                  <Mail size={18} /> Continue with Email
                </button>
              </div>
              <p className="auth-switch">
                Don't have an account?{" "}
                <Link
                  to="/auth"
                  search={{ mode: "signup" }}
                  aria-disabled={busy || loading || redirectPending}
                  onClick={(event) => {
                    if (busy || loading || redirectPending) {
                      event.preventDefault();
                      return;
                    }
                    clearAuthForm();
                  }}
                >
                  Create Account
                </Link>
              </p>
            </>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="auth-form">
                {mode === "signup" && (
                  <div className="auth-field">
                    <Label htmlFor="name">Full name</Label>
                    <Input
                      id="name"
                      autoComplete="name"
                      maxLength={100}
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your name"
                      className="auth-input"
                    />
                  </div>
                )}
                <div className="auth-field">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="auth-input"
                  />
                </div>
                {mode !== "reset" && (
                  <>
                    <div className="auth-field">
                      <Label htmlFor="password">Password</Label>
                      <div className="auth-password-wrap">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          required
                          minLength={6}
                          autoComplete={mode === "signin" ? "current-password" : "new-password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="auth-input auth-input-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          className="auth-password-toggle"
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      {mode === "signup" && <p className="auth-hint">At least 6 characters.</p>}
                    </div>
                    {mode === "signup" && (
                      <div className="auth-field">
                        <Label htmlFor="confirm-password">Confirm password</Label>
                        <Input
                          id="confirm-password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          required
                          value={confirmation}
                          onChange={(e) => setConfirmation(e.target.value)}
                          className="auth-input"
                        />
                      </div>
                    )}
                    {mode === "signin" && (
                      <button
                        type="button"
                        className="auth-forgot"
                        disabled={busy}
                        onClick={() => setMode("reset")}
                      >
                        Forgot password?
                      </button>
                    )}
                  </>
                )}
                <button type="submit" className="auth-primary" disabled={busy}>
                  {busy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />{" "}
                      {mode === "reset" ? "Sending…" : "Please wait…"}
                    </>
                  ) : mode === "reset" ? (
                    "Send reset link"
                  ) : mode === "signin" ? (
                    "Sign In"
                  ) : (
                    "Create Account"
                  )}
                </button>
              </form>
              {mode !== "reset" && (
                <p className="auth-switch">
                  {mode === "signin" ? "Don't have an account?" : "Already have an account?"}{" "}
                  <Link
                    to="/auth"
                    search={{ mode: mode === "signin" ? "signup" : "signin" }}
                    aria-disabled={busy}
                    onClick={(event) => {
                      if (busy) {
                        event.preventDefault();
                        return;
                      }
                      clearAuthForm();
                    }}
                  >
                    {mode === "signin" ? "Create Account" : "Sign In"}
                  </Link>
                </p>
              )}
            </>
          )}
          <p className="auth-legal">
            By continuing you agree to our <Link to="/legal/terms">Terms</Link> and{" "}
            <Link to="/legal/privacy">Privacy Policy</Link>.
          </p>
        </div>
      </div>
    </main>
  );
}
