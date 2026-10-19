import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { auth } from "@/lib/firebase";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { Button } from "@/components/ui/button";
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
  validateSearch: (search: Record<string, unknown>): { oobCode?: string } => ({
    oobCode: typeof search.oobCode === "string" ? search.oobCode.trim() || undefined : undefined,
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const { oobCode } = Route.useSearch();
  const [status, setStatus] = useState<"checking" | "ready" | "missing" | "invalid">("checking");
  const ready = status === "ready";

  useEffect(() => {
    let active = true;
    setPassword("");
    setConfirm("");
    if (!oobCode) {
      setStatus("missing");
      return;
    }
    setStatus("checking");
    void verifyPasswordResetCode(auth, oobCode)
      .then(() => {
        if (active) setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("invalid");
      });
    return () => {
      active = false;
    };
  }, [oobCode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !ready || !oobCode) return;
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
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <KeyRound className="h-6 w-6" />
          </span>
          <h1 className="mt-4 font-display text-3xl">Set a new password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {ready
              ? "Choose a strong password of at least 8 characters."
              : status === "checking"
                ? "Checking your reset link…"
                : status === "missing"
                  ? "Open the password reset link from your email. To request one, return to sign in and choose Forgot password."
                  : "This password reset link is invalid or has expired. Return to sign in and choose Forgot password to request a new one."}
          </p>
        </div>

        {status === "missing" || status === "invalid" ? (
          <Button asChild className="mt-6 w-full">
            <Link to="/auth" search={{ mode: "signin" }}>
              Back to sign in
            </Link>
          </Button>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={!ready}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                disabled={!ready}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy || !ready}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
