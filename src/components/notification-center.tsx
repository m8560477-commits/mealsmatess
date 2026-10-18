import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Bell, CheckCheck, ChevronRight, Loader2, Utensils } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import {
  listMyNotifications,
  markAllMyNotificationsRead,
  setMyNotificationReadStatus,
} from "@/lib/notifications.functions";
import type { UserNotification } from "@/lib/notifications.types";

const categoryNames: Record<UserNotification["category"], string> = {
  recipes: "Recipes",
  healthy_eating: "Healthy eating",
  dining: "MealMate Dining",
  mia: "Mia AI",
  features: "New features",
  general: "MealMate update",
};

export function NotificationCenter() {
  const { user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const notifications = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: () => listMyNotifications(),
    enabled: !!user,
    staleTime: 15_000,
  });
  const items = (notifications.data?.items ?? []) as UserNotification[];

  async function open(item: UserNotification) {
    try {
      if (!item.readAt) await setMyNotificationReadStatus({ data: { id: item.id, read: true } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["notification-count", user?.id] }),
      ]);
      navigate({ to: item.destination });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open notification.");
    }
  }

  async function toggleRead(item: UserNotification) {
    try {
      await setMyNotificationReadStatus({ data: { id: item.id, read: !item.readAt } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["notification-count", user?.id] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update notification.");
    }
  }

  async function markAllRead() {
    try {
      await markAllMyNotificationsRead();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["notification-count", user?.id] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update notifications.");
    }
  }

  if (!user) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-4 px-4 pb-24 pt-10 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-muted">
          <Bell aria-hidden="true" />
        </span>
        <h1 className="font-display text-2xl">Your notifications</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Sign in to view your personal MealMate updates and notification history.
        </p>
        <Button onClick={() => navigate({ to: "/auth" })}>Sign in</Button>
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-24 pt-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            MealMate
          </p>
          <h1 className="mt-1 font-display text-3xl">Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {notifications.data?.unreadCount
              ? `${notifications.data.unreadCount} unread update${notifications.data.unreadCount === 1 ? "" : "s"}`
              : "You’re all caught up."}
          </p>
        </div>
        {(notifications.data?.unreadCount ?? 0) > 0 && (
          <Button variant="outline" onClick={() => void markAllRead()}>
            <CheckCheck data-icon="inline-start" />
            Mark all read
          </Button>
        )}
      </header>

      {notifications.isLoading ? (
        <div className="flex min-h-48 items-center justify-center">
          <Loader2
            aria-label="Loading notifications"
            className="animate-spin text-muted-foreground"
          />
        </div>
      ) : notifications.isError ? (
        <div className="rounded-2xl border border-border p-6 text-center">
          <p className="font-medium">Could not load your notifications</p>
          <p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p>
          <Button className="mt-4" variant="outline" onClick={() => void notifications.refetch()}>
            Retry
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-muted">
            <Utensils aria-hidden="true" />
          </span>
          <h2 className="mt-4 font-display text-xl">Nothing new yet</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            MealMate announcements and feature updates will appear here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => {
            const isUnread = !item.readAt;
            return (
              <article
                key={item.id}
                className={`overflow-hidden rounded-2xl border bg-card transition-colors ${isUnread ? "border-foreground/20" : "border-border"}`}
              >
                <div className="flex gap-3 p-4 sm:p-5">
                  <span
                    className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl ${isUnread ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                  >
                    <Bell aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">
                        {categoryNames[item.category] ?? "MealMate update"}
                      </Badge>
                      {isUnread && <Badge variant="secondary">Unread</Badge>}
                    </div>
                    <button
                      type="button"
                      onClick={() => void open(item)}
                      className="mt-2 block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <h2 className="font-semibold leading-snug">{item.title}</h2>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                        {item.body}
                      </p>
                    </button>
                    {item.imageUrl && (
                      <img
                        src={item.imageUrl}
                        alt={`Announcement image for ${item.title}`}
                        loading="lazy"
                        className="mt-3 max-h-64 w-full rounded-xl object-cover"
                      />
                    )}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <time className="text-xs text-muted-foreground" dateTime={item.createdAt}>
                        {new Date(item.createdAt).toLocaleString()}
                      </time>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void toggleRead(item)}
                        >
                          {isUnread ? "Mark read" : "Mark unread"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void open(item)}
                        >
                          Open <ChevronRight data-icon="inline-end" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
