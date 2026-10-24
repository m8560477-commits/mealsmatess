import { EcosystemLinks } from "@/components/ecosystem-links";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, LogOut } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useSession, signOutUnified } from "@/hooks/use-session";
import { CONSUMER_URL } from "@/lib/hub-surface";
import { Button } from "@/components/ui/button";

export function HubShell({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const [busy, setBusy] = useState(false);
  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      await signOutUnified();
    } catch {
      toast.error("Could not sign out. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      id="app-scroll"
      className="hub-surface h-dvh overflow-y-auto bg-background text-foreground"
    >
      <a href="#hub-content" className="sr-only focus:not-sr-only focus:block focus:p-4">
        Skip to content
      </a>
      <header className="border-b border-border px-5 pt-[env(safe-area-inset-top)] sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 py-5">
          <Link to="/" className="flex items-center gap-3" aria-label="MealMate Hub home">
            <img src="/favicon.png" alt="" width={36} height={36} className="size-9 rounded-xl" />
            <span className="text-xl font-bold tracking-tight">
              MealMate <span className="font-normal text-muted-foreground">Hub</span>
            </span>
          </Link>
          <nav aria-label="Hub navigation" className="flex flex-wrap items-center gap-2">
            <Button asChild variant="ghost" className="rounded-full">
              <Link to="/partner/dashboard">Workspace</Link>
            </Button>
            <Button asChild variant="ghost" className="rounded-full">
              <a href={CONSUMER_URL}>
                Consumer <ArrowUpRight className="ml-1 size-4" aria-hidden="true" />
              </a>
            </Button>
            {user ? (
              <Button variant="outline" className="rounded-full" disabled={busy} onClick={signOut}>
                <LogOut className="mr-2 size-4" aria-hidden="true" />
                Sign out
              </Button>
            ) : (
              <Button asChild className="rounded-full">
                <Link to="/auth">Sign in</Link>
              </Button>
            )}
          </nav>
        </div>
      </header>
      <div id="hub-content" className="mx-auto flex min-h-[70dvh] w-full max-w-6xl flex-col">
        {children}
      </div>
      <footer className="mx-auto flex max-w-6xl flex-wrap justify-between gap-4 px-5 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] text-xs text-muted-foreground sm:px-8">
        <div>
          <p>MealMate Hub by Taz Technologies</p>
          <EcosystemLinks />
        </div>
        <div className="flex gap-5">
          <Link to="/legal/privacy" className="underline">
            Privacy
          </Link>
          <Link to="/legal/terms" className="underline">
            Terms
          </Link>
          <Link to="/support" className="underline">
            Support
          </Link>
        </div>
      </footer>
    </div>
  );
}
