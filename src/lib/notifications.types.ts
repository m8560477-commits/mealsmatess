export type AnnouncementAudience =
  "all_consumers" | "healthy_interest" | "premium" | "trial" | "selected";
export type AnnouncementCategory =
  | "recipes"
  | "healthy_eating"
  | "dining"
  | "mia"
  | "features"
  | "general"
  | "meal_planning"
  | "pantry_shopping"
  | "account"
  | "promotions";
export type AnnouncementDestination =
  | "/"
  | "/recipes"
  | "/restaurants"
  | "/chat"
  | "/planner"
  | "/profile"
  | "/pantry"
  | "/list"
  | "/coach"
  | "/cookbook"
  | "/notifications"
  | "/premium"
  | `/recipe/${string}`;
export type AnnouncementStatus =
  "draft" | "scheduled" | "processing" | "published" | "cancelled" | "failed";

export type AnnouncementInput = {
  id?: string;
  title: string;
  body: string;
  imageUrl: string | null;
  category: AnnouncementCategory;
  audience: AnnouncementAudience;
  selectedUsers?: string[];
  destination: AnnouncementDestination;
  scheduledAt: string | null;
  status: "draft" | "scheduled";
};

export type UserNotification = {
  id: string;
  announcementId: string | null;
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
