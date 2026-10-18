import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Crown,
  DollarSign,
  Download,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Ticket,
  Trash2,
  TrendingDown,
  TrendingUp,
  Users,
  Utensils,
} from "lucide-react";
import { format, subDays, subMonths } from "date-fns";
import { toast } from "sonner";
import { useSession } from "@/hooks/use-session";
import { sendPasswordReset as sendFirebasePasswordReset } from "@/lib/firebase";
import {
  adminDeletePromo,
  adminGrantPremium,
  adminIsAdmin,
  adminListPromos,
  adminListSubscribers,
  adminRevokePremium,
  adminSavePromo,
} from "@/lib/premium.functions";
import {
  createManagedRestaurant,
  launchManagedRestaurant,
  listManagedRestaurants,
} from "@/lib/managed-restaurants.functions";
import {
  adminListAuditLogs,
  adminListUsers,
  getAdminAnalytics,
} from "@/lib/admin-analytics.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RecipeImageBackfillCard } from "@/components/recipe-image-tools";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AnnouncementsTab } from "@/components/admin/announcements-tab";
import { TelemetryTab } from "@/components/admin/telemetry-tab";
import { FlagsTab } from "@/components/admin/flags-tab";
import { RecipeImage } from "@/components/recipe-image";

// Charts pull in the charting library — load them only when a chart renders.
const AreaTrend = lazy(() =>
  import("@/components/admin/charts").then((m) => ({ default: m.AreaTrend })),
);
const BarBreakdown = lazy(() =>
  import("@/components/admin/charts").then((m) => ({ default: m.BarBreakdown })),
);
const DonutBreakdown = lazy(() =>
  import("@/components/admin/charts").then((m) => ({ default: m.DonutBreakdown })),
);
const LineTrend = lazy(() =>
  import("@/components/admin/charts").then((m) => ({ default: m.LineTrend })),
);

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { property: "og:title", content: "Admin \u2014 MealMate" },
      {
        property: "og:description",
        content: "Manage MealMate: analytics, subscribers, revenue, promo codes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Admin — MealMate" },
      {
        name: "description",
        content: "Manage MealMate: analytics, subscribers, revenue, promo codes.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

type Preset = "7d" | "30d" | "12m" | "custom";

function usePresetRange(preset: Preset, custom: { from: string; to: string }) {
  return useMemo(() => {
    const now = new Date();
    if (preset === "custom") return { from: custom.from, to: custom.to };
    if (preset === "7d") return { from: subDays(now, 7).toISOString(), to: now.toISOString() };
    if (preset === "30d") return { from: subDays(now, 30).toISOString(), to: now.toISOString() };
    return { from: subMonths(now, 12).toISOString(), to: now.toISOString() };
  }, [preset, custom.from, custom.to]);
}

function ManagedRestaurantsTab() {
  const queryClient = useQueryClient();
  const managed = useQuery({
    queryKey: ["managed-restaurants"],
    queryFn: () => listManagedRestaurants(),
  });
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [busy, setBusy] = useState(false);

  async function launch(restaurantId: string) {
    try {
      await launchManagedRestaurant({ data: { restaurantId } });
      await queryClient.invalidateQueries({ queryKey: ["managed-restaurants"] });
      toast.success("Restaurant launched in Consumer.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not launch restaurant.");
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await createManagedRestaurant({ data: { email, name, ownerName } });
      if (result.invited) {
        try {
          await sendFirebasePasswordReset(email.trim().toLowerCase());
          toast.success(
            "Password setup email sent. The owner must also verify their email before first sign-in.",
          );
        } catch {
          toast.error(
            "Restaurant created, but Firebase could not send the setup email. Check Firebase Auth email settings.",
          );
        }
      } else {
        toast.success("Restaurant linked to the existing Firebase account.");
      }
      setEmail("");
      setName("");
      setOwnerName("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create restaurant account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="max-w-2xl rounded-3xl border border-border/60 bg-card p-6 shadow-sm">
      <div className="mb-6">
        <h2 className="font-display text-2xl">Create a restaurant account</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Invite a restaurant owner by email. Their account starts with a one-month RevenueCat trial
          and becomes visible to Consumer after Hub launch.
        </p>
      </div>
      <form onSubmit={submit} className="grid gap-4">
        <Input
          required
          type="text"
          placeholder="Restaurant name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Input
          required
          type="text"
          placeholder="Owner full name"
          value={ownerName}
          onChange={(event) => setOwnerName(event.target.value)}
        />
        <Input
          required
          type="email"
          placeholder="Owner email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send invite and start trial"}
        </Button>
      </form>
      <div className="mt-8 space-y-3">
        <h3 className="font-display text-lg">Restaurants</h3>
        {managed.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : managed.data?.length ? (
          managed.data.map((restaurant: any) => (
            <div
              key={restaurant.id}
              className="flex items-center justify-between gap-4 rounded-2xl border border-border/60 p-4"
            >
              <div>
                <p className="font-medium">{restaurant.name}</p>
                <p className="text-xs text-muted-foreground">{restaurant.owner_email}</p>
              </div>
              <Button
                size="sm"
                disabled={restaurant.onboarding_complete}
                onClick={() => launch(restaurant.id)}
              >
                {restaurant.onboarding_complete ? "Launched" : "Launch"}
              </Button>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No managed restaurants yet.</p>
        )}
      </div>
    </section>
  );
}

function AdminPage() {
  const { user, loading: sessLoading } = useSession();
  const navigate = useNavigate();
  const { data: gate, isLoading: gateLoading } = useQuery({
    queryKey: ["is-admin", user?.id],
    queryFn: () => adminIsAdmin(),
    enabled: !!user,
  });

  useEffect(() => {
    if (!sessLoading && !user) navigate({ to: "/auth", replace: true });
  }, [sessLoading, user, navigate]);

  const [preset, setPreset] = useState<Preset>("30d");
  const [custom, setCustom] = useState({
    from: format(subDays(new Date(), 30), "yyyy-MM-dd"),
    to: format(new Date(), "yyyy-MM-dd"),
  });
  const range = usePresetRange(preset, {
    from: new Date(custom.from).toISOString(),
    to: new Date(custom.to + "T23:59:59").toISOString(),
  });

  const analytics = useQuery({
    queryKey: ["admin-analytics", range.from, range.to],
    queryFn: () => getAdminAnalytics({ data: range }),
    enabled: !!gate?.isAdmin,
    staleTime: 60_000,
  });

  if (sessLoading || gateLoading) {
    return (
      <main className="mx-auto flex max-w-3xl flex-1 items-center justify-center px-4 py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!gate?.isAdmin) {
    return (
      <main className="mx-auto max-w-3xl flex-1 px-4 py-16 text-center">
        <Crown className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 font-display text-2xl">Admin only</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don't have access to this dashboard.
        </p>
      </main>
    );
  }

  return (
    <main className="admin-workspace mx-auto w-full max-w-6xl flex-1 px-4 pb-12 pt-6 sm:px-7">
      <header className="admin-header flex flex-col gap-5 pb-6 md:flex-row md:items-end md:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Crown className="h-6 w-6" />
          </span>
          <div>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">MEALMATE / ADMIN</p>
            <h1 className="font-display text-2xl font-semibold leading-tight sm:text-3xl">
              Admin Center
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Users, revenue & your growing community.
            </p>
          </div>
        </div>
        <DateRangeControl
          preset={preset}
          onPresetChange={setPreset}
          custom={custom}
          onCustomChange={setCustom}
        />
      </header>

      <Tabs defaultValue="overview" className="mt-6">
        <TabsList className="admin-tabs flex h-auto w-full flex-nowrap justify-start gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1">
          <TabsTrigger value="overview">
            <Activity className="mr-2 size-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="users">
            <Users className="mr-2 size-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="revenue">
            <DollarSign className="mr-2 size-4" />
            Revenue
          </TabsTrigger>
          <TabsTrigger value="recipes">
            <Utensils className="mr-2 size-4" />
            Recipes
          </TabsTrigger>
          <TabsTrigger value="telemetry">Telemetry</TabsTrigger>
          <TabsTrigger value="flags">Flags</TabsTrigger>
          <TabsTrigger value="subs">Subscribers</TabsTrigger>
          <TabsTrigger value="promos">Promos</TabsTrigger>
          <TabsTrigger value="grant">Grant</TabsTrigger>
          <TabsTrigger value="restaurants">Restaurants</TabsTrigger>
          <TabsTrigger value="announce">Announce</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab
            {...(analytics.data ? { analytics: analytics.data } : {})}
            loading={analytics.isLoading}
          />
          <div className="mt-4">
            <RecipeImageBackfillCard />
          </div>
        </TabsContent>
        <TabsContent value="users" className="mt-4">
          <UsersTab
            {...(analytics.data ? { analytics: analytics.data } : {})}
            loading={analytics.isLoading}
          />
        </TabsContent>
        <TabsContent value="revenue" className="mt-4">
          <RevenueTab
            {...(analytics.data ? { analytics: analytics.data } : {})}
            loading={analytics.isLoading}
          />
        </TabsContent>
        <TabsContent value="recipes" className="mt-4">
          <RecipesTab
            {...(analytics.data ? { analytics: analytics.data } : {})}
            loading={analytics.isLoading}
          />
        </TabsContent>
        <TabsContent value="telemetry" className="mt-4">
          <TelemetryTab range={range} />
        </TabsContent>
        <TabsContent value="flags" className="mt-4">
          <FlagsTab />
        </TabsContent>
        <TabsContent value="subs" className="mt-4">
          <SubscribersTab />
        </TabsContent>
        <TabsContent value="promos" className="mt-4">
          <PromosTab />
        </TabsContent>
        <TabsContent value="grant" className="mt-4">
          <GrantTab />
        </TabsContent>
        <TabsContent value="restaurants" className="mt-4">
          <ManagedRestaurantsTab />
        </TabsContent>
        <TabsContent value="announce" className="mt-4">
          <AnnouncementsTab />
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          <AuditTab />
        </TabsContent>
      </Tabs>
    </main>
  );
}

function DateRangeControl({
  preset,
  onPresetChange,
  custom,
  onCustomChange,
}: {
  preset: Preset;
  onPresetChange: (p: Preset) => void;
  custom: { from: string; to: string };
  onCustomChange: (v: { from: string; to: string }) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={preset} onValueChange={(v) => onPresetChange(v as Preset)}>
        <SelectTrigger className="w-[160px] rounded-lg bg-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="7d">Last 7 days</SelectItem>
          <SelectItem value="30d">Last 30 days</SelectItem>
          <SelectItem value="12m">Last 12 months</SelectItem>
          <SelectItem value="custom">Custom range</SelectItem>
        </SelectContent>
      </Select>
      {preset === "custom" && (
        <>
          <Input
            type="date"
            value={custom.from}
            onChange={(e) => onCustomChange({ ...custom, from: e.target.value })}
            className="w-[150px] rounded-full"
          />
          <Input
            type="date"
            value={custom.to}
            onChange={(e) => onCustomChange({ ...custom, to: e.target.value })}
            className="w-[150px] rounded-full"
          />
        </>
      )}
    </div>
  );
}

type Analytics = Awaited<ReturnType<typeof getAdminAnalytics>>;

function KpiCard({
  label,
  value,
  icon: Icon,
  delta,
  hint,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  delta?: number;
  hint?: string;
}) {
  const positive = (delta ?? 0) >= 0;
  return (
    <div className="admin-kpi group min-w-0 rounded-lg border border-border bg-card p-5 transition motion-safe:hover:-translate-y-0.5">
      <div className="flex items-center justify-between">
        <span className="kpi-icon flex h-10 w-10 items-center justify-center rounded-lg bg-chart-1/10 text-chart-1">
          <Icon className="h-5 w-5" />
        </span>
        {delta !== undefined && (
          <span
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
              positive ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative"
            }`}
          >
            {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
      <p className="mt-4 text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-display text-3xl font-semibold leading-tight tabular-nums">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="admin-chart min-w-0 rounded-lg border border-border bg-card p-5">
      <div className="mb-3">
        <h3 className="font-display text-lg leading-tight">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <Suspense
        fallback={
          <div className="flex h-[220px] items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        }
      >
        {children}
      </Suspense>
    </div>
  );
}

function LoadingBlock() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-32 animate-pulse rounded-3xl bg-muted" />
      ))}
    </div>
  );
}

function OverviewTab({ analytics, loading }: { analytics?: Analytics; loading: boolean }) {
  if (loading || !analytics) return <LoadingBlock />;
  const { users, revenue, subscriptions, recipes } = analytics;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total users"
          value={users.total.toLocaleString()}
          icon={Users}
          delta={users.growthPct}
        />
        <KpiCard
          label="Revenue (range)"
          value={`$${revenue.total.toFixed(2)}`}
          icon={DollarSign}
          delta={revenue.growthPct}
        />
        <KpiCard
          label="Active premium"
          value={subscriptions.active + subscriptions.lifetime}
          icon={Crown}
          hint={`${subscriptions.trialing} in trial`}
        />
        <KpiCard
          label="Conversion"
          value={`${subscriptions.conversionRate.toFixed(1)}%`}
          icon={Sparkles}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="New users" subtitle="Signups in selected range">
          <AreaTrend data={users.series} dataKey="count" />
        </ChartCard>
        <ChartCard title="Revenue" subtitle="Daily payments (USD)">
          <AreaTrend data={revenue.series} dataKey="amount" color="hsl(142 71% 45%)" />
        </ChartCard>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="New users" value={users.new.toLocaleString()} icon={Users} />
        <KpiCard label="New recipes" value={recipes.newInRange.toLocaleString()} icon={Utensils} />
        <KpiCard
          label="Grocery items"
          value={analytics.grocery.itemsInRange.toLocaleString()}
          icon={Activity}
        />
        <KpiCard
          label="Meal plans"
          value={analytics.planner.entriesInRange.toLocaleString()}
          icon={Activity}
        />
      </div>
    </div>
  );
}

function UsersTab({ analytics, loading }: { analytics?: Analytics; loading: boolean }) {
  const [search, setSearch] = useState("");
  const users = useQuery({
    queryKey: ["admin-users", search],
    queryFn: () => adminListUsers({ data: { search } }),
    staleTime: 30_000,
  });
  if (loading || !analytics) return <LoadingBlock />;
  const pie = [
    { name: "Premium", value: analytics.users.premium },
    { name: "Free", value: analytics.users.free },
  ];
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total users"
          value={analytics.users.total.toLocaleString()}
          icon={Users}
          delta={analytics.users.growthPct}
        />
        <KpiCard label="New in range" value={analytics.users.new.toLocaleString()} icon={Users} />
        <KpiCard
          label="Premium users"
          value={analytics.users.premium.toLocaleString()}
          icon={Crown}
        />
        <KpiCard label="Free users" value={analytics.users.free.toLocaleString()} icon={Users} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Signups over time">
          <LineTrend data={analytics.users.series} dataKey="count" />
        </ChartCard>
        <ChartCard title="Premium vs Free">
          <DonutBreakdown data={pie} dataKey="value" />
        </ChartCard>
      </div>
      <div className="rounded-3xl border border-border/60 bg-card p-5 shadow-sm">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="font-display text-lg">Recent users</h3>
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or username"
              className="rounded-full pl-9"
            />
          </div>
        </div>
        {users.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">User</th>
                  <th className="px-3 py-2 text-left">Username</th>
                  <th className="px-3 py-2 text-left">Locale</th>
                  <th className="px-3 py-2 text-left">Joined</th>
                  <th className="px-3 py-2 text-left">ID</th>
                </tr>
              </thead>
              <tbody>
                {(users.data ?? []).map(
                  (u: {
                    id: string;
                    display_name?: string | null;
                    username?: string | null;
                    locale?: string | null;
                    created_at: string;
                  }) => (
                    <tr key={u.id} className="border-t border-border/60">
                      <td className="px-3 py-2">{u.display_name ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{u.username ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{u.locale}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {format(new Date(u.created_at), "MMM d, yyyy")}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                        {u.id.slice(0, 8)}…
                      </td>
                    </tr>
                  ),
                )}
                {(users.data ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function RevenueTab({ analytics, loading }: { analytics?: Analytics; loading: boolean }) {
  if (loading || !analytics) return <LoadingBlock />;
  const currencies = Object.entries(analytics.revenue.currencyBreakdown).map(([name, value]) => ({
    name,
    value: Number(value.toFixed(2)),
  }));
  const storePie = analytics.subscriptions.storeBreakdown.map((s) => ({
    name: s.name,
    value: s.count,
  }));
  const monthlyEstimate =
    analytics.range.days > 0 ? (analytics.revenue.total / analytics.range.days) * 30 : 0;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Revenue (range)"
          value={`$${analytics.revenue.total.toFixed(2)}`}
          icon={DollarSign}
          delta={analytics.revenue.growthPct}
        />
        <KpiCard
          label="Monthly (est.)"
          value={`$${monthlyEstimate.toFixed(2)}`}
          icon={TrendingUp}
          hint="Extrapolated from range"
        />
        <KpiCard
          label="ARPU"
          value={`$${analytics.revenue.arpu.toFixed(2)}`}
          icon={Users}
          hint="Revenue / premium user"
        />
        <KpiCard
          label="Refunds"
          value={`$${analytics.revenue.refunds.toFixed(2)}`}
          icon={TrendingDown}
        />
      </div>
      <ChartCard title="Revenue over time" subtitle="Daily payments in USD">
        <AreaTrend data={analytics.revenue.series} dataKey="amount" color="hsl(142 71% 45%)" />
      </ChartCard>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Currency breakdown">
          {currencies.length > 0 ? (
            <BarBreakdown data={currencies} dataKey="value" />
          ) : (
            <EmptyMini label="No revenue in this range." />
          )}
        </ChartCard>
        <ChartCard title="Subscriptions by store">
          {storePie.length > 0 ? (
            <DonutBreakdown data={storePie} dataKey="value" />
          ) : (
            <EmptyMini label="No subscriptions yet." />
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function RecipesTab({ analytics, loading }: { analytics?: Analytics; loading: boolean }) {
  if (loading || !analytics) return <LoadingBlock />;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total recipes"
          value={analytics.recipes.total.toLocaleString()}
          icon={Utensils}
        />
        <KpiCard
          label="New in range"
          value={analytics.recipes.newInRange.toLocaleString()}
          icon={Utensils}
        />
        <KpiCard
          label="Grocery items"
          value={analytics.grocery.itemsInRange.toLocaleString()}
          icon={Activity}
        />
        <KpiCard
          label="Meal plan entries"
          value={analytics.planner.entriesInRange.toLocaleString()}
          icon={Activity}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Top categories">
          {analytics.recipes.categories.length > 0 ? (
            <BarBreakdown data={analytics.recipes.categories} dataKey="count" />
          ) : (
            <EmptyMini label="No categorized recipes yet." />
          )}
        </ChartCard>
        <ChartCard title="Top cuisines">
          {analytics.recipes.cuisines.length > 0 ? (
            <DonutBreakdown data={analytics.recipes.cuisines} dataKey="count" />
          ) : (
            <EmptyMini label="No cuisines yet." />
          )}
        </ChartCard>
      </div>
      <div className="rounded-3xl border border-border/60 bg-card p-5 shadow-sm">
        <h3 className="mb-3 font-display text-lg">Most saved recipes</h3>
        {analytics.recipes.topByFavorites.length === 0 ? (
          <EmptyMini label="No favorites yet." />
        ) : (
          <ul className="divide-y divide-border/60">
            {analytics.recipes.topByFavorites.map((r, i) => (
              <li key={r.id} className="flex items-center gap-3 py-3">
                <span className="w-6 text-sm font-medium text-muted-foreground">{i + 1}</span>
                <RecipeImage
                  recipe={r}
                  size="thumb"
                  alt={`${r.name} recipe`}
                  className="h-10 w-10 rounded-xl object-cover"
                />

                <span className="flex-1 truncate">{r.name}</span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {r.saves} saves
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EmptyMini({ label }: { label: string }) {
  return (
    <div className="flex h-[180px] items-center justify-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function SubscribersTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-subs"],
    queryFn: () => adminListSubscribers(),
  });
  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;
  const rows = (data ?? []) as {
    id: string;
    user_id: string;
    display_name: string;
    tier: string;
    status: string;
    store?: string | null;
    period_end?: string | null;
    trial_end?: string | null;
    is_manual?: boolean;
  }[];

  function exportCsv() {
    const header = [
      "user_id",
      "display_name",
      "tier",
      "status",
      "store",
      "period_end",
      "trial_end",
      "is_manual",
    ];
    const csv = [
      header.join(","),
      ...rows.map((r) =>
        [
          r.user_id,
          JSON.stringify(r.display_name ?? ""),
          r.tier,
          r.status,
          r.store ?? "",
          r.period_end ?? "",
          r.trial_end ?? "",
          r.is_manual,
        ].join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mealmate-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-3xl border border-border/60 bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{rows.length} subscribers</p>
        <Button size="sm" variant="secondary" onClick={exportCsv} className="rounded-full">
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">User</th>
              <th className="px-3 py-2 text-left">Tier</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Store</th>
              <th className="px-3 py-2 text-left">Ends</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border/60">
                <td className="px-3 py-2">{r.display_name}</td>
                <td className="px-3 py-2 capitalize">{r.tier}</td>
                <td className="px-3 py-2 capitalize">{r.status}</td>
                <td className="px-3 py-2">{r.store ?? "—"}</td>
                <td className="px-3 py-2">
                  {r.period_end ? new Date(r.period_end).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  No subscribers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PromosTab() {
  const qc = useQueryClient();
  const { data: promos, isLoading } = useQuery({
    queryKey: ["admin-promos"],
    queryFn: () => adminListPromos(),
  });
  const [editing, setEditing] = useState<null | {
    id?: string;
    code: string;
    reward_kind: "percent_discount" | "free_days" | "free_month" | "free_year" | "lifetime";
    reward_value: number;
    max_redemptions: number | null;
    expires_at: string | null;
    enabled: boolean;
    notes: string | null;
  }>(null);

  async function save() {
    if (!editing) return;
    try {
      await adminSavePromo({ data: editing });
      toast.success("Promo saved");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin-promos"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this promo code?")) return;
    await adminDeletePromo({ data: { id } });
    qc.invalidateQueries({ queryKey: ["admin-promos"] });
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button
          size="sm"
          className="rounded-full"
          onClick={() =>
            setEditing({
              code: "",
              reward_kind: "free_days",
              reward_value: 7,
              max_redemptions: null,
              expires_at: null,
              enabled: true,
              notes: null,
            })
          }
        >
          <Plus className="mr-2 h-4 w-4" /> New promo
        </Button>
      </div>

      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <ul className="space-y-2">
          {(promos ?? []).map(
            (p: {
              id: string;
              code: string;
              enabled: boolean;
              reward_kind:
                "percent_discount" | "free_days" | "free_month" | "free_year" | "lifetime";
              reward_value: number;
              redemption_count: number;
              max_redemptions: number | null;
              expires_at: string | null;
              notes: string | null;
            }) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-2xl border border-border/60 bg-card p-4 shadow-sm"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <code className="font-mono font-semibold">{p.code}</code>
                    {!p.enabled && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase">
                        Disabled
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {p.reward_kind} · value {p.reward_value} · redeemed {p.redemption_count}
                    {p.max_redemptions ? `/${p.max_redemptions}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setEditing({
                        id: p.id,
                        code: p.code,
                        reward_kind: p.reward_kind,
                        reward_value: p.reward_value,
                        max_redemptions: p.max_redemptions,
                        expires_at: p.expires_at,
                        enabled: p.enabled,
                        notes: p.notes,
                      })
                    }
                  >
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(p.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </li>
            ),
          )}
          {promos && promos.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">No promo codes yet.</p>
          )}
        </ul>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur">
          <div className="w-full max-w-md rounded-3xl border border-border/60 bg-card p-5 shadow-xl">
            <h3 className="font-display text-xl">{editing.id ? "Edit promo" : "New promo"}</h3>
            <div className="mt-4 space-y-3">
              <Input
                placeholder="Code (e.g. WELCOME)"
                value={editing.code}
                onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })}
                className="uppercase"
              />
              <Select
                value={editing.reward_kind}
                onValueChange={(v) =>
                  setEditing({ ...editing, reward_kind: v as typeof editing.reward_kind })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free_days">Free days</SelectItem>
                  <SelectItem value="free_month">Free month</SelectItem>
                  <SelectItem value="free_year">Free year</SelectItem>
                  <SelectItem value="lifetime">Lifetime</SelectItem>
                  <SelectItem value="percent_discount">Percent discount</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                placeholder="Value (days or %)"
                value={editing.reward_value}
                onChange={(e) => setEditing({ ...editing, reward_value: Number(e.target.value) })}
              />
              <Input
                type="number"
                placeholder="Max redemptions (blank = unlimited)"
                value={editing.max_redemptions ?? ""}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    max_redemptions: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
              <div className="flex items-center justify-between rounded-xl border border-border/60 p-3">
                <span className="text-sm">Enabled</span>
                <Switch
                  checked={editing.enabled}
                  onCheckedChange={(v) => setEditing({ ...editing, enabled: v })}
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button onClick={save}>Save</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GrantTab() {
  const [userId, setUserId] = useState("");
  const [days, setDays] = useState(30);
  const qc = useQueryClient();

  async function grant() {
    try {
      await adminGrantPremium({ data: { userId, days } });
      toast.success(`Granted ${days} days`);
      qc.invalidateQueries({ queryKey: ["admin-subs"] });
      qc.invalidateQueries({ queryKey: ["admin-analytics"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Grant failed");
    }
  }
  async function revoke() {
    try {
      await adminRevokePremium({ data: { userId } });
      toast.success("Revoked Premium");
      qc.invalidateQueries({ queryKey: ["admin-subs"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Revoke failed");
    }
  }

  return (
    <div className="max-w-md space-y-3 rounded-3xl border border-border/60 bg-card p-5 shadow-sm">
      <h3 className="font-display text-lg">Manual grant / revoke</h3>
      <Input
        placeholder="User ID (uuid)"
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
      />
      <Input
        type="number"
        placeholder="Days"
        value={days}
        onChange={(e) => setDays(Number(e.target.value))}
      />
      <div className="flex gap-2">
        <Button onClick={grant} disabled={!userId}>
          Grant Premium
        </Button>
        <Button variant="secondary" onClick={revoke} disabled={!userId}>
          Revoke
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Find user IDs in the Users tab.</p>
    </div>
  );
}

function AuditTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-audit"],
    queryFn: () => adminListAuditLogs(),
  });
  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;
  const rows = data ?? [];
  return (
    <div className="rounded-3xl border border-border/60 bg-card p-5 shadow-sm">
      <h3 className="mb-3 font-display text-lg">Recent admin activity</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No audit events yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Time</th>
                <th className="px-3 py-2 text-left">Action</th>
                <th className="px-3 py-2 text-left">Target</th>
                <th className="px-3 py-2 text-left">Actor</th>
                <th className="px-3 py-2 text-left">IP</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(
                (r: {
                  id: string;
                  created_at: string;
                  action: string;
                  target_table?: string | null;
                  target_id?: string | null;
                  actor_id?: string | null;
                  ip_address?: string | null;
                }) => (
                  <tr key={r.id} className="border-t border-border/60">
                    <td className="px-3 py-2 text-muted-foreground">
                      {format(new Date(r.created_at), "MMM d, HH:mm")}
                    </td>
                    <td className="px-3 py-2">{r.action}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {r.target_table ?? "—"}
                      {r.target_id ? ` · ${r.target_id.slice(0, 8)}…` : ""}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {r.actor_id ? r.actor_id.slice(0, 8) + "…" : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.ip_address ?? "—"}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
