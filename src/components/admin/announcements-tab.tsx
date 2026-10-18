import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, CalendarClock, Eye, Loader2, Megaphone, Pencil, Send, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  cancelAdminAnnouncement,
  listAdminAnnouncements,
  previewAnnouncementAudience,
  publishAdminAnnouncement,
  saveAdminAnnouncement,
} from "@/lib/notifications.functions";
import type {
  AnnouncementAudience,
  AnnouncementCategory,
  AnnouncementDestination,
  AnnouncementInput,
  AnnouncementStatus,
} from "@/lib/notifications.types";

const categories: { value: AnnouncementCategory; label: string }[] = [
  { value: "recipes", label: "Recipes" },
  { value: "healthy_eating", label: "Healthy eating" },
  { value: "dining", label: "MealMate Dining" },
  { value: "mia", label: "Mia AI" },
  { value: "features", label: "New features" },
  { value: "general", label: "General update" },
];

const destinations: { value: AnnouncementDestination; label: string }[] = [
  { value: "/", label: "Home" },
  { value: "/recipes", label: "Recipes" },
  { value: "/restaurants", label: "Dining" },
  { value: "/chat", label: "Mia AI" },
  { value: "/planner", label: "Meal planner" },
  { value: "/profile", label: "Profile" },
];

const audienceOptions: { value: AnnouncementAudience; label: string }[] = [
  { value: "all_consumers", label: "All eligible Consumer users" },
  { value: "healthy_interest", label: "Healthy recipe interest" },
];

const emptyDraft: AnnouncementInput = {
  title: "",
  body: "",
  imageUrl: null,
  category: "general",
  audience: "all_consumers",
  destination: "/",
  scheduledAt: null,
  status: "draft",
};

function statusLabel(status: AnnouncementStatus) {
  return status === "processing"
    ? "Sending in batches"
    : status.charAt(0).toUpperCase() + status.slice(1);
}

function displayDate(value: unknown) {
  if (typeof value !== "string" || !value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function dateTimeLocal(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

type AdminAnnouncementRecord = {
  id: string;
  status?: AnnouncementStatus;
  title?: string;
  body?: string;
  createdAt?: string;
  scheduleAt?: string | null;
  publishedAt?: string | null;
  recipientCount?: number;
  readCount?: number;
  pushAcceptedTokens?: number;
  pushAttemptedTokens?: number;
  pushFailedTokens?: number;
  lastError?: string;
};

export function AnnouncementsTab() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<AnnouncementInput>(emptyDraft);
  const [scheduleLocal, setScheduleLocal] = useState("");
  const [saving, setSaving] = useState(false);
  const announcements = useQuery<AdminAnnouncementRecord[]>({
    queryKey: ["admin-announcements"],
    queryFn: async () => (await listAdminAnnouncements()) as AdminAnnouncementRecord[],
    refetchInterval: (query) =>
      query.state.data?.some((item) => item.status === "processing") ? 15_000 : false,
  });
  const audience = useQuery({
    queryKey: ["announcement-audience", draft.audience],
    queryFn: () => previewAnnouncementAudience({ data: { audience: draft.audience } }),
    staleTime: 30_000,
  });
  const selectedCategory = useMemo(
    () => categories.find((item) => item.value === draft.category)?.label ?? "General update",
    [draft.category],
  );

  function update<K extends keyof AnnouncementInput>(key: K, value: AnnouncementInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function edit(item: Record<string, unknown>) {
    setDraft({
      id: String(item.id),
      title: String(item.title ?? ""),
      body: String(item.body ?? ""),
      imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : null,
      category: (item.category as AnnouncementCategory) ?? "general",
      audience: (item.audience as AnnouncementAudience) ?? "all_consumers",
      destination: (item.destination as AnnouncementDestination) ?? "/",
      scheduledAt: typeof item.scheduleAt === "string" ? item.scheduleAt : null,
      status: item.status === "scheduled" ? "scheduled" : "draft",
    });
    setScheduleLocal(typeof item.scheduleAt === "string" ? dateTimeLocal(item.scheduleAt) : "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(status: "draft" | "scheduled") {
    if (status === "scheduled" && !scheduleLocal) {
      toast.error("Choose a date and time before scheduling.");
      return null;
    }
    if (status === "scheduled" && new Date(scheduleLocal).getTime() <= Date.now()) {
      toast.error("Choose a future date and time.");
      return null;
    }
    setSaving(true);
    try {
      const result = await saveAdminAnnouncement({
        data: {
          ...draft,
          status,
          scheduledAt: status === "scheduled" ? new Date(scheduleLocal).toISOString() : null,
          imageUrl: draft.imageUrl || null,
        },
      });
      setDraft({ ...emptyDraft });
      setScheduleLocal("");
      await queryClient.invalidateQueries({ queryKey: ["admin-announcements"] });
      toast.success(status === "scheduled" ? "Announcement scheduled." : "Draft saved.");
      return result;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save announcement.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function publishNow(id?: string) {
    setSaving(true);
    try {
      let announcementId = id;
      if (!announcementId) {
        const saved = await saveAdminAnnouncement({
          data: { ...draft, status: "draft", scheduledAt: null, imageUrl: draft.imageUrl || null },
        });
        announcementId = saved.id;
      }
      const result = await publishAdminAnnouncement({ data: { id: announcementId } });
      setDraft({ ...emptyDraft });
      setScheduleLocal("");
      await queryClient.invalidateQueries({ queryKey: ["admin-announcements"] });
      toast.success(
        result.status === "processing"
          ? "Announcement is being sent in batches."
          : "Announcement published to eligible users.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not publish announcement.");
    } finally {
      setSaving(false);
    }
  }

  async function cancel(id: string) {
    try {
      const result = await cancelAdminAnnouncement({ data: { id } });
      if (!result.cancelled) toast.error("This scheduled announcement can no longer be cancelled.");
      else toast.success("Scheduled announcement cancelled.");
      await queryClient.invalidateQueries({ queryKey: ["admin-announcements"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not cancel announcement.");
    }
  }

  const rows = announcements.data ?? [];
  const canSubmit = draft.title.trim().length >= 2 && draft.body.trim().length >= 2 && !saving;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
      <section className="flex flex-col gap-5">
        <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <div className="mb-5 flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Megaphone aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-display text-xl">Announcement studio</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Draft, preview, schedule, or publish product updates to eligible recipients.
              </p>
            </div>
          </div>

          <div className="grid gap-4">
            <label className="grid gap-2 text-sm font-medium" htmlFor="announcement-title">
              Title
              <Input
                id="announcement-title"
                value={draft.title}
                maxLength={120}
                onChange={(event) => update("title", event.target.value)}
                placeholder="A useful MealMate update"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium" htmlFor="announcement-message">
              Message
              <Textarea
                id="announcement-message"
                value={draft.body}
                maxLength={2000}
                rows={4}
                onChange={(event) => update("body", event.target.value)}
                placeholder="Write a clear, helpful update for your audience."
              />
              <span className="text-xs font-normal text-muted-foreground">
                {draft.body.length}/2000 characters
              </span>
            </label>
            <label className="grid gap-2 text-sm font-medium" htmlFor="announcement-image">
              Optional image URL
              <Input
                id="announcement-image"
                type="url"
                inputMode="url"
                value={draft.imageUrl ?? ""}
                onChange={(event) => update("imageUrl", event.target.value || null)}
                placeholder="https://…"
              />
              <span className="text-xs font-normal text-muted-foreground">
                Use an HTTPS image URL. The image appears in the preview and supported push
                notifications.
              </span>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium" htmlFor="announcement-category">
                Category
                <Select
                  value={draft.category}
                  onValueChange={(value) => update("category", value as AnnouncementCategory)}
                >
                  <SelectTrigger id="announcement-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {categories.map((category) => (
                        <SelectItem key={category.value} value={category.value}>
                          {category.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </label>
              <label className="grid gap-2 text-sm font-medium" htmlFor="announcement-destination">
                Destination
                <Select
                  value={draft.destination}
                  onValueChange={(value) => update("destination", value as AnnouncementDestination)}
                >
                  <SelectTrigger id="announcement-destination">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {destinations.map((destination) => (
                        <SelectItem key={destination.value} value={destination.value}>
                          {destination.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </label>
            </div>

            <label className="grid gap-2 text-sm font-medium" htmlFor="announcement-audience">
              Recipients
              <Select
                value={draft.audience}
                onValueChange={(value) => update("audience", value as AnnouncementAudience)}
              >
                <SelectTrigger id="announcement-audience">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {audienceOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <span className="text-xs font-normal text-muted-foreground">
                {audience.isLoading
                  ? "Checking current eligible profiles…"
                  : audience.isError
                    ? "Could not read the current eligible profile count."
                    : `${(audience.data?.count ?? 0).toLocaleString()} eligible profiles based on current records and update preferences.`}
              </span>
            </label>

            <label className="grid gap-2 text-sm font-medium" htmlFor="announcement-schedule">
              Schedule for later (optional)
              <Input
                id="announcement-schedule"
                type="datetime-local"
                value={scheduleLocal}
                onChange={(event) => setScheduleLocal(event.target.value)}
              />
            </label>

            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => void save("draft")}
                disabled={!canSubmit}
              >
                {saving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}Save
                draft
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void save("scheduled")}
                disabled={!canSubmit || !scheduleLocal}
              >
                <CalendarClock data-icon="inline-start" />
                Schedule
              </Button>
              <Button type="button" onClick={() => void publishNow()} disabled={!canSubmit}>
                <Send data-icon="inline-start" />
                Publish now
              </Button>
              {draft.id && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setDraft({ ...emptyDraft });
                    setScheduleLocal("");
                  }}
                >
                  Discard edits
                </Button>
              )}
            </div>
          </div>
        </div>

        <section
          className="rounded-2xl border border-border bg-card p-5 sm:p-6"
          aria-labelledby="announcement-history-heading"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 id="announcement-history-heading" className="font-display text-lg">
                Announcement history
              </h2>
              <p className="text-sm text-muted-foreground">
                Current delivery attempts and recorded activity; push acceptance is not a device
                delivery receipt.
              </p>
            </div>
            {announcements.isFetching && (
              <Loader2
                aria-label="Refreshing history"
                className="animate-spin text-muted-foreground"
              />
            )}
          </div>
          {announcements.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading real announcement records…</p>
          ) : announcements.isError ? (
            <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
              Could not load announcement history. Check the Firebase server configuration and admin
              access.
            </p>
          ) : rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
              No announcements yet.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {rows.map((item) => {
                const status = String(item.status ?? "draft") as AnnouncementStatus;
                const editable = status === "draft" || status === "scheduled";
                return (
                  <article
                    key={String(item.id)}
                    className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{String(item.title ?? "Untitled")}</h3>
                        <Badge
                          variant={
                            status === "published"
                              ? "secondary"
                              : status === "failed"
                                ? "destructive"
                                : "outline"
                          }
                        >
                          {statusLabel(status)}
                        </Badge>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {String(item.body ?? "")}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Created {displayDate(item.createdAt)}
                        {status === "scheduled"
                          ? ` · Scheduled ${displayDate(item.scheduleAt)}`
                          : status === "published"
                            ? ` · Published ${displayDate(item.publishedAt)}`
                            : ""}
                      </p>
                      {status === "published" || status === "processing" ? (
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>
                            {Number(item.recipientCount ?? 0).toLocaleString()} in-app notifications
                            stored
                          </span>
                          <span>{Number(item.readCount ?? 0).toLocaleString()} read</span>
                          <span>
                            {Number(item.pushAcceptedTokens ?? 0).toLocaleString()} push tokens
                            accepted by FCM
                          </span>
                          <span>
                            {Number(item.pushAttemptedTokens ?? 0).toLocaleString()} push attempts
                          </span>
                          {Number(item.pushFailedTokens ?? 0) > 0 && (
                            <span>{Number(item.pushFailedTokens).toLocaleString()} failed</span>
                          )}
                        </div>
                      ) : null}
                      {status === "failed" && (
                        <p className="mt-2 text-xs text-destructive">
                          {String(item.lastError ?? "Processing failed.")}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-start gap-2 sm:justify-end">
                      {editable && (
                        <Button size="sm" variant="outline" onClick={() => edit(item)}>
                          <Pencil data-icon="inline-start" />
                          Edit
                        </Button>
                      )}
                      {(editable || status === "failed") && (
                        <Button size="sm" onClick={() => void publishNow(String(item.id))}>
                          <Send data-icon="inline-start" />
                          Publish now
                        </Button>
                      )}
                      {status === "scheduled" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void cancel(String(item.id))}
                        >
                          <XCircle data-icon="inline-start" />
                          Cancel
                        </Button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </section>

      <aside className="flex flex-col gap-5" aria-label="Announcement preview">
        <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Eye aria-hidden="true" />
              <h2 className="font-display text-lg">Live preview</h2>
            </div>
            <Badge variant="outline">{selectedCategory}</Badge>
          </div>
          <div className="mx-auto max-w-sm rounded-2xl border border-border bg-background p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Bell aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">MealMate</p>
                <p className="text-xs text-muted-foreground">Just now · {selectedCategory}</p>
              </div>
            </div>
            {draft.imageUrl?.startsWith("https://") && (
              <img
                src={draft.imageUrl}
                alt={draft.title ? `Announcement image for ${draft.title}` : "Announcement preview"}
                className="mt-3 aspect-[16/9] w-full rounded-xl object-cover"
              />
            )}
            <h3 className="mt-3 font-semibold">{draft.title || "Your announcement title"}</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
              {draft.body || "Your message will appear here as recipients see it."}
            </p>
            <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
              Opens{" "}
              {destinations.find((destination) => destination.value === draft.destination)?.label ??
                "Home"}
            </p>
          </div>
          <div className="mt-4 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
            This preview reflects the current message and destination. Nothing is sent until you
            publish or schedule it.
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="font-semibold">Delivery notes</h3>
          <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
            <li>In-app history is stored per recipient and remains available in their account.</li>
            <li>Push is sent only to users who opted in and have a registered device.</li>
            <li>Firebase acceptance is an attempt status, not proof the device displayed it.</li>
            <li>
              Scheduled sends are processed in bounded batches by the protected Vercel cron route.
            </li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
