import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { auth } from "@/lib/firebase";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { MealMateLogo } from "@/components/mealmate-logo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password | MealMate" },
      { name: "description", content: "Choose a new password for your MealMate account." },
      { property: "og:title", content: "Reset password | MealMate" },
      { property: "og:description", content: "Choose a new password for your MealMate account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [oobCode, setOobCode] = useState("");

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("oobCode");
    if (!code) return;
    void verifyPasswordResetCode(auth, code)
      .then(() => {
        setOobCode(code);
        setReady(true);
      })
      .catch(() => toast.error("This password reset link is invalid or has expired."));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await confirmPasswordReset(auth, oobCode, password);
      toast.success("Password updated. Sign in with your new password.");
      navigate({ to: "/auth", replace: true });
    } catch {
      toast.error("Could not update your password. Please request a new reset link and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-redesign auth-reset">
      <div className="auth-shell">
        <header className="auth-brand">
          <MealMateLogo className="auth-logo" showName />
        </header>
        <div className="auth-card">
          <p className="auth-eyebrow">YOUR ACCOUNT</p>
          <h1 className="auth-title">Set a new password.</h1>
          <p className="auth-subtitle">
            {ready
              ? "Choose a strong password of at least 8 characters."
              : "Open the link in your email to reset your password."}
          </p>
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-field">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                className="auth-input"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                disabled={!ready}
              />
            </div>
            <div className="auth-field">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                className="auth-input"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Enter your password again"
                disabled={!ready}
              />
            </div>
            <button type="submit" className="auth-primary" disabled={busy || !ready}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password"}
            </button>
          </form>
          <p className="auth-switch">
            <Link to="/auth">Back to sign in</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
