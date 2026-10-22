import { z } from "zod";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const notificationPreferencesSchema = z.object({
  productUpdatesEnabled: z.boolean().default(true),
  pushEnabled: z.boolean().default(false),
  recipesEnabled: z.boolean().default(false),
  mealPlanningEnabled: z.boolean().default(false),
  pantryShoppingEnabled: z.boolean().default(false),
  nutritionEnabled: z.boolean().default(false),
  diningEnabled: z.boolean().default(true),
  promotionsEnabled: z.boolean().default(false),
  quietHoursEnabled: z.boolean().default(true),
  quietStart: time.default("21:00"),
  quietEnd: time.default("08:00"),
  reminderTime: time.default("09:00"),
  timeZone: z
    .string()
    .max(100)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, "Choose a valid IANA time zone.")
    .default("UTC"),
});
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;
export function preferencesFrom(data: Record<string, unknown> = {}): NotificationPreferences {
  return notificationPreferencesSchema.parse(
    Object.fromEntries(
      Object.keys(notificationPreferencesSchema.shape)
        .filter((key) => key in data)
        .map((key) => [key, data[key]]),
    ),
  );
}
export const notificationDestinations = [
  "/",
  "/recipes",
  "/restaurants",
  "/chat",
  "/planner",
  "/profile",
  "/pantry",
  "/list",
  "/coach",
  "/cookbook",
  "/notifications",
  "/premium",
] as const;
export function safeNotificationDestination(
  value: unknown,
): (typeof notificationDestinations)[number] | `/recipe/${string}` {
  if (
    typeof value === "string" &&
    /^\/recipe\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) &&
    value.length <= 180
  )
    return value as `/recipe/${string}`;
  return notificationDestinations.find((path) => path === value) ?? "/notifications";
}
export function notificationNavigation(value: unknown) {
  const destination = safeNotificationDestination(value);
  if (destination.startsWith("/recipe/"))
    return { to: "/recipe/$slug" as const, params: { slug: destination.slice(8) } };
  return { to: destination as (typeof notificationDestinations)[number] };
}
export function localClock(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}
export function inQuietHours(p: NotificationPreferences, now: Date) {
  if (!p.quietHoursEnabled || p.quietStart === p.quietEnd) return false;
  const { time } = localClock(now, p.timeZone);
  return p.quietStart < p.quietEnd
    ? time >= p.quietStart && time < p.quietEnd
    : time >= p.quietStart || time < p.quietEnd;
}
export function categoryEnabled(category: string, p: NotificationPreferences) {
  switch (category) {
    case "account":
      return true;
    case "recipes":
      return p.recipesEnabled;
    case "meal_planning":
      return p.mealPlanningEnabled;
    case "pantry_shopping":
      return p.pantryShoppingEnabled;
    case "healthy_eating":
      return p.nutritionEnabled;
    case "dining":
      return p.productUpdatesEnabled && p.diningEnabled;
    case "promotions":
      return p.productUpdatesEnabled && p.promotionsEnabled;
    default:
      return p.productUpdatesEnabled;
  }
}
export function notificationChannel(category: string) {
  if (category === "account") return "account";
  if (category === "recipes") return "recipes";
  if (["dining", "promotions"].includes(category)) return "dining";
  return "meal_planning";
}
