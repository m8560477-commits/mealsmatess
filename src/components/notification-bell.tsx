import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import { getMyUnreadNotificationCount } from "@/lib/notifications.functions";
import { Button } from "@/components/ui/button";
export function NotificationBell() {
  const { user } = useSession();
  const navigate = useNavigate();
  const unread = useQuery({
    queryKey: ["notification-count", user?.id],
    queryFn: () => getMyUnreadNotificationCount(),
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  if (!user) return null;
  return (
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
  );
}
