import { ProfilePhotoEditor } from "@/components/profile-photo-editor";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  CalendarDays,
  Heart,
  ScanLine,
  ShoppingBasket,
  Bell,
  Pencil,
  Crown,
} from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/hooks/use-session";
import { usePremium } from "@/hooks/use-premium";
import {
  getCookingDashboard,
  saveCookingProfile,
  getCookingHistory,
} from "@/lib/profile.functions";

export function ProfileDashboard() {
  const { user } = useSession();
  const access = usePremium();
  const client = useQueryClient();
  const queryKey = ["cooking-dashboard", user?.id];
  const profile = useQuery({ queryKey, queryFn: () => getCookingDashboard(), enabled: !!user });
  const [historyTab, setHistoryTab] = useState<"cooking" | "scans" | null>(null);
  const history = useQuery({
    queryKey: ["cooking-history", user?.id],
    queryFn: () => getCookingHistory(),
    enabled: !!user && !!historyTab,
  });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ displayName: "", username: "" });
  const name = profile.data?.displayName || user?.displayName || "Your kitchen";
  return (
    <section aria-label="Your cooking dashboard">
      <p className="premium-eyebrow mb-3">A LITTLE MORE YOU</p>
      <div className="profile-hero">
        <div className="flex items-center gap-4">
          <ProfilePhotoEditor />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight break-words">{name}</h1>
            <p className="text-sm text-muted-foreground truncate">
              {profile.data?.username ? `@${profile.data.username}` : user?.email}
            </p>
            {access.isPremium && (
              <span className="inline-flex items-center gap-1 mt-2 rounded-full bg-primary/15 px-3 py-1 text-xs text-primary">
                <Crown size={12} /> MealMate Premium
              </span>
            )}
          </div>
        </div>
        <p className="mt-5 text-sm text-muted-foreground">
          Your recipes, your plans, your everyday inspiration.
        </p>
        <button
          className="mt-4 inline-flex items-center gap-2 text-sm text-primary"
          disabled={!profile.data}
          onClick={() => {
            setDraft({
              displayName: name,
              username: profile.data?.username ?? "",
            });
            setEditing(!editing);
          }}
        >
          <Pencil size={14} /> {editing ? "Close editor" : "Edit profile"}
        </button>
        {editing && (
          <form
            className="profile-editor"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await saveCookingProfile({ data: draft });
                await client.invalidateQueries({ queryKey });
                setEditing(false);
                toast.success("Profile updated");
              } catch {
                toast.error("Couldn’t save your profile. Check your details and try again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Display name
              <input
                required
                maxLength={100}
                value={draft.displayName}
                onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
              />
            </label>
            <label>
              Username
              <input
                required
                pattern="[a-zA-Z0-9_]{3,30}"
                title="3–30 letters, numbers or underscores"
                value={draft.username}
                onChange={(e) => setDraft({ ...draft, username: e.target.value })}
              />
              <span className="text-muted-foreground">
                Your display handle; not used for signing in.
              </span>
            </label>
            <button className="premium-primary" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          </form>
        )}
      </div>
      {profile.isError ? (
        <p role="alert" className="my-5 text-sm">
          Your cooking stats couldn’t load.{" "}
          <button className="text-primary" onClick={() => void profile.refetch()}>
            Try again
          </button>
        </p>
      ) : (
        <div className="profile-stats">
          {[
            ["Recipes created", profile.data?.recipes],
            ["Favourites", profile.data?.favorites],
            ["Planned meals", profile.data?.plans],
          ].map(([label, value]) => (
            <div className="profile-stat" key={label}>
              <strong>{value ?? "—"}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      )}
      <div className="profile-links">
        <Link to="/cookbook" search={{ view: "mine" }}>
          <BookOpen />
          My Recipes
        </Link>
        <Link to="/planner">
          <CalendarDays />
          My Meal Plans
        </Link>
        <Link to="/cookbook" search={{ view: "favourites" }}>
          <Heart />
          Favourites
        </Link>
        <Link to="/scan">
          <ScanLine />
          Scan ingredients
        </Link>
        <Link to="/grocery">
          <ShoppingBasket />
          Grocery lists
        </Link>
        <Link to="/notifications">
          <Bell />
          Notifications
        </Link>
      </div>
      <div className="mt-6 flex gap-3">
        <button
          className="premium-secondary"
          aria-pressed={historyTab === "cooking"}
          onClick={() => setHistoryTab("cooking")}
        >
          Cooking history
        </button>
        <button
          className="premium-secondary"
          aria-pressed={historyTab === "scans"}
          onClick={() => setHistoryTab("scans")}
        >
          Scan history
        </button>
      </div>
      {historyTab && (
        <section aria-live="polite" className="rounded-2xl border border-border p-5">
          <h2 className="font-semibold mb-3">
            {historyTab === "cooking" ? "Cooking history" : "Scan history"}
          </h2>
          {history.isPending ? (
            <p>Loading your history…</p>
          ) : history.isError ? (
            <p>
              Couldn’t load history.{" "}
              <button onClick={() => void history.refetch()}>Try again</button>
            </p>
          ) : history.data?.[historyTab].length ? (
            <ul className="space-y-3">
              {history.data[historyTab].map((item) => (
                <li className="flex justify-between gap-3 text-sm" key={item.id}>
                  <span>{item.label}</span>
                  <span className="text-muted-foreground">
                    {item.date && !Number.isNaN(Date.parse(item.date))
                      ? new Date(item.date).toLocaleDateString()
                      : "Date unavailable"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing recorded yet. Your activity will appear here as you cook and scan.
            </p>
          )}
        </section>
      )}
      <h2 className="mt-9 mb-4 text-xl font-semibold">Make yourself at home</h2>
    </section>
  );
}
