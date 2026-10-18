export type AnnouncementAudience = "all_consumers" | "healthy_interest";
export type AnnouncementCategory =
  "recipes" | "healthy_eating" | "dining" | "mia" | "features" | "general";
export type AnnouncementDestination =
  "/" | "/recipes" | "/restaurants" | "/chat" | "/planner" | "/profile";
export type AnnouncementStatus =
  "draft" | "scheduled" | "processing" | "published" | "cancelled" | "failed";

export type AnnouncementInput = {
  id?: string;
  title: string;
  body: string;
  imageUrl: string | null;
  category: AnnouncementCategory;
  audience: AnnouncementAudience;
  destination: AnnouncementDestination;
  scheduledAt: string | null;
  status: "draft" | "scheduled";
};

export type UserNotification = {
  id: string;
  announcementId: string;
  title: string;
  body: string;
  imageUrl: string | null;
  category: AnnouncementCategory;
  destination: AnnouncementDestination;
  createdAt: string;
  readAt: string | null;
  pushStatus?:
    "pending" | "not_opted_in" | "no_active_device" | "attempted" | "accepted" | "failed";
};
