import { createFileRoute } from "@tanstack/react-router";
import { NotificationCenter } from "@/components/notification-center";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications: MealMate" },
      { name: "description", content: "Your MealMate announcements and product updates." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NotificationCenter,
});
