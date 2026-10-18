import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
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
import { signOutUnified } from "@/hooks/use-session";
import { ArrowLeft, UserRound } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { getMyUnreadNotificationCount } from "@/lib/notifications.functions";
import { listenForForegroundPush } from "@/lib/push-client";
import { toast } from "sonner";

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
  const userId = user?.id;
  const unread = useQuery({
    queryKey: ["notification-count", user?.id],
    queryFn: () => getMyUnreadNotificationCount(),
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!userId) return;
    let active = true;
    let unsubscribe: () => void = () => undefined;
    void listenForForegroundPush(({ title, body }) => {
      toast(title, { description: body });
    })
      .then((stop) => {
        if (active) unsubscribe = stop;
        else stop();
      })
      .catch(() => undefined);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [userId]);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOutUnified();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header
      id="app-header"
      className="fixed inset-x-0 top-0 z-40 bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <div className="mx-auto grid h-16 max-w-3xl grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 px-5">
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
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="relative size-10 rounded-full"
              aria-label={`Notifications${(unread.data?.unreadCount ?? 0) > 0 ? `, ${unread.data?.unreadCount} unread` : ""}`}
              onClick={() => navigate({ to: "/notifications" })}
            >
              <Bell aria-hidden="true" />
              {(unread.data?.unreadCount ?? 0) > 0 && (
                <span className="absolute right-0 top-0 flex min-w-4 translate-x-1/4 -translate-y-1/4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
                  {(unread.data?.unreadCount ?? 0) > 99 ? "99+" : unread.data?.unreadCount}
                </span>
              )}
            </Button>
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
                <DropdownMenuItem onClick={() => navigate({ to: "/notifications" })}>
                  Notifications
                  {(unread.data?.unreadCount ?? 0) > 0
                    ? ` (${unread.data?.unreadCount} unread)`
                    : ""}
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
          </div>
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
