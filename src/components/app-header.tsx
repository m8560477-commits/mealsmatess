import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { MealMateLogo } from "@/components/mealmate-logo";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, UserRound } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Compact top bar used on every page except the home screen (which renders
 * its own greeting header). Keeps the brand mark + account menu, styled to
 * match the rounded, icon-forward look of the app shell.
 */
export function AppHeader() {
  const { user } = useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header
      id="app-header"
      className="fixed inset-x-0 top-0 z-40 bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <div className="mx-auto grid h-16 max-w-3xl grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-3 px-5">
        <Button asChild variant="ghost" size="icon" className="size-11 rounded-full">
          <Link to="/" aria-label="Back home">
            <ArrowLeft />
          </Link>
        </Button>
        <Link
          to="/"
          className="flex min-w-0 items-center justify-center gap-2"
          aria-label="MealMate home"
        >
          {/* The AI chat shows the mascot itself — never show it twice on one page. */}
          {pathname.startsWith("/chat") ? (
            <span className="font-display text-2xl leading-none">MealMate</span>
          ) : (
            <MealMateLogo imageClassName="size-9 rounded-full object-contain" />
          )}
        </Link>

        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-11 rounded-full"
                aria-label="Account menu"
              >
                <UserRound />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate({ to: "/profile" })}>
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate({ to: "/planner" })}>
                Meal planner
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate({ to: "/list" })}>
                Grocery list
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button
            size="sm"
            className="rounded-full px-1 text-xs"
            onClick={() => navigate({ to: "/auth" })}
          >
            Sign in
          </Button>
        )}
      </div>
    </header>
  );
}
