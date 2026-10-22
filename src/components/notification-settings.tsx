import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, Loader2 } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import {
  getMyNotificationPreferences,
  registerMyPushToken,
  saveMyNotificationPreferences,
} from "@/lib/notifications.functions";
import { requestBrowserPushToken, revokeBrowserPushToken } from "@/lib/push-client";
import type { NotificationPreferences } from "@/lib/notification-policy";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const switches = [
  ["pushEnabled", "Push notifications", "Enable this device after granting system permission."],
  ["productUpdatesEnabled", "Product announcements", "General MealMate news and feature updates."],
  ["recipesEnabled", "Recipes", "Saved recipe reminders and recipe announcements."],
  ["mealPlanningEnabled", "Meal planning", "Daily saved-meal digest and weekly planning reminder."],
  [
    "pantryShoppingEnabled",
    "Pantry and shopping",
    "Saved expiry dates and unchecked shopping items.",
  ],
  [
    "nutritionEnabled",
    "Personal goals · optional",
    "Gentle check-ins only when you have saved a food goal.",
  ],
  ["diningEnabled", "Dining announcements", "Updates published by MealMate."],
  ["promotionsEnabled", "Promotions", "Optional offers published by MealMate."],
  ["quietHoursEnabled", "Quiet hours", "Hold push notifications until quiet hours end."],
] as const;

export function NotificationSettings() {
  const { user } = useSession();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["notification-preferences", user?.id],
    queryFn: () => getMyNotificationPreferences(),
    enabled: !!user,
  });
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Partial<NotificationPreferences>>({});
  if (!user) return null;
  if (query.isLoading)
    return <Loader2 aria-label="Loading notification settings" className="animate-spin" />;
  if (!query.data)
    return <Button onClick={() => void query.refetch()}>Retry notification settings</Button>;
  const p = { ...query.data, ...editing };
  async function save(change: Partial<NotificationPreferences>) {
    setBusy(true);
    const previous = query.data!;
    try {
      const token = change.pushEnabled === true ? await requestBrowserPushToken() : null;
      const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const data =
        change.pushEnabled === true && previous.timeZone === "UTC" && deviceZone
          ? { ...change, timeZone: deviceZone }
          : change;
      await saveMyNotificationPreferences({ data });
      if (token) {
        try {
          await registerMyPushToken({ data: { token } });
        } catch (error) {
          await saveMyNotificationPreferences({ data: { pushEnabled: previous.pushEnabled } });
          throw error;
        }
      }
      if (change.pushEnabled === false) await revokeBrowserPushToken();
      setEditing({});
      toast.success("Notification preferences saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save settings.");
    } finally {
      await client.invalidateQueries({ queryKey: ["notification-preferences", user?.id] });
      setBusy(false);
    }
  }
  return (
    <section
      className="notification-settings rounded-2xl border border-white/10 bg-[#101827] p-5 text-white"
      aria-label="Notification settings"
    >
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Bell size={20} /> Notification settings
      </h2>
      <p className="mt-2 text-sm text-slate-400">
        Android Settings → Apps → MealMate → Notifications controls system permission. MealMate
        cannot override it.
      </p>
      <div className="mt-3 divide-y divide-white/10">
        {switches.map(([key, label, description]) => (
          <label key={key} className="flex items-center justify-between gap-4 py-4">
            <span>
              <span className="block text-sm font-medium">{label}</span>
              <span className="block text-xs text-slate-400">{description}</span>
            </span>
            <Switch
              aria-label={label}
              checked={p[key]}
              disabled={busy}
              onCheckedChange={(value) => void save({ [key]: value })}
            />
          </label>
        ))}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {(
          [
            ["reminderTime", "Daily reminder time"],
            ["quietStart", "Quiet hours start"],
            ["quietEnd", "Quiet hours end"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="grid gap-2 text-sm">
            {label}
            <Input
              type="time"
              value={p[key]}
              disabled={busy}
              onChange={(e) => setEditing((current) => ({ ...current, [key]: e.target.value }))}
            />
          </label>
        ))}
        <label className="grid gap-2 text-sm">
          Time zone
          <Input
            value={p.timeZone}
            disabled={busy}
            placeholder="Africa/Johannesburg"
            onChange={(e) => setEditing((current) => ({ ...current, timeZone: e.target.value }))}
          />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            setEditing((current) => ({
              ...current,
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }))
          }
        >
          Use device time zone
        </Button>
        <Button disabled={busy || !Object.keys(editing).length} onClick={() => void save(editing)}>
          Save times
        </Button>
      </div>
      <p className="mt-3 text-xs text-slate-400">
        Up to four push updates per local day, spaced at least an hour apart. Account updates remain
        available in your notification centre. Reminder delivery depends on the backend scheduler
        and device availability.
      </p>
    </section>
  );
}
