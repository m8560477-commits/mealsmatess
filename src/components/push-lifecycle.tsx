import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSession } from "@/hooks/use-session";
import { notificationNavigation } from "@/lib/notification-policy";
import { listenForForegroundPush, initializePushSession } from "@/lib/push-client";

// Mounted once in the shell, including Home where the compact header is hidden.
export function PushLifecycle() {
  const { user } = useSession();
  const userId = user?.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    let active = true;
    let unsubscribe: () => void = () => undefined;
    void listenForForegroundPush(({ title, body }) => {
      toast(title, {
        description: body,
        action: { label: "View", onClick: () => navigate({ to: "/notifications" }) },
      });
      void queryClient.invalidateQueries({ queryKey: ["notification-count", userId] });
      void queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
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
  }, [userId, queryClient, navigate]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    let stop = () => {};
    void initializePushSession(userId, (destination) => {
      void navigate(notificationNavigation(destination));
    })
      .then((cleanup) => {
        if (active) stop = cleanup;
        else cleanup();
      })
      .catch(() => undefined);
    return () => {
      active = false;
      stop();
    };
  }, [userId, navigate]);

  return null;
}
