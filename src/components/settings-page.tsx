import { ProfilePhotoEditor } from "@/components/profile-photo-editor";
import { usePremium } from "@/hooks/use-premium";
import { adminIsAdmin } from "@/lib/premium.functions";
import { createPurchaseSession, verifyMyPremium } from "@/lib/billing.functions";
import { SettingsPreferences } from "@/components/settings-preferences";
import { getCookingDashboard } from "@/lib/profile.functions";
import { ProfileDashboard } from "@/components/profile-dashboard";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  ChevronRight,
  DollarSign,
  FileText,
  Globe,
  HelpCircle,
  Info,
  Lock,
  LogOut,
  Mail,
  Moon,
  Share2,
  Shield,
  Star,
  Sun,
  UserCog,
} from "lucide-react";
import { toast } from "sonner";
import { firebaseData } from "@/lib/firebase-data";
import { sendPasswordReset } from "@/lib/firebase";
import {
  getMyUnreadNotificationCount,
  getMyNotificationPreferences,
  registerMyPushToken,
  saveMyNotificationPreferences,
} from "@/lib/notifications.functions";
import { requestBrowserPushToken, revokeBrowserPushToken } from "@/lib/push-client";
import { useSession, signOutUnified } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/components/theme-provider";
import { GamificationCard } from "@/components/gamification-card";
import { ThemePicker } from "@/components/theme-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type IconType = typeof Shield;
type Item = {
  label: string;
  description?: string;
  icon: IconType;
  to?: string;
  href?: string;
  onClick?: () => void;
  trailing?: React.ReactNode;
};

const CURRENCIES: { code: string; symbol: string; name: string }[] = [
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "ZAR", symbol: "R", name: "South African Rand" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar" },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar" },
  { code: "NZD", symbol: "NZ$", name: "New Zealand Dollar" },
];

const LANGUAGES: { code: string; name: string }[] = [
  { code: "en", name: "English" },
  { code: "zu", name: "isiZulu" },
  { code: "af", name: "Afrikaans" },
  { code: "xh", name: "isiXhosa" },
  { code: "st", name: "Sesotho" },
  { code: "tn", name: "Setswana" },
  { code: "nso", name: "Sepedi" },
  { code: "ve", name: "Tshivenda" },
  { code: "ts", name: "Xitsonga" },
  { code: "ss", name: "Siswati" },
  { code: "nr", name: "isiNdebele" },
];

// Best-effort region → currency map for first-launch defaults.
const REGION_CURRENCY: Record<string, string> = {
  US: "USD",
  ZA: "ZAR",
  GB: "GBP",
  IE: "EUR",
  DE: "EUR",
  FR: "EUR",
  ES: "EUR",
  IT: "EUR",
  NL: "EUR",
  PT: "EUR",
  AT: "EUR",
  BE: "EUR",
  FI: "EUR",
  GR: "EUR",
  AU: "AUD",
  CA: "CAD",
  NZ: "NZD",
};

function detectCurrency(): string {
  if (typeof navigator === "undefined") return "USD";
  const region =
    (Intl.DateTimeFormat().resolvedOptions() as { locale?: string }).locale
      ?.split("-")?.[1]
      ?.toUpperCase() ?? "";
  return REGION_CURRENCY[region] ?? "USD";
}

export function SettingsPage() {
  const { user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { resolved, setMode } = useTheme();
  const access = usePremium();
  const account = useQuery({
    queryKey: ["cooking-dashboard", user?.id],
    queryFn: () => getCookingDashboard(),
    enabled: !!user,
  });
  const admin = useQuery({
    queryKey: ["admin-gate", user?.id],
    queryFn: () => adminIsAdmin(),
    enabled: !!user,
  });
  const unread = useQuery({
    queryKey: ["notification-unread", user?.id],
    queryFn: () => getMyUnreadNotificationCount(),
    enabled: !!user,
  });
  const [permission, setPermission] = useState("Checking…");
  const [subscriptionBusy, setSubscriptionBusy] = useState(false);
  useEffect(() => {
    const refresh = () =>
      setPermission(
        typeof Notification === "undefined"
          ? "Unsupported on this device"
          : Notification.permission,
      );
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  const [managementUrl, setManagementUrl] = useState<string | null>(null);
  async function manageSubscription() {
    setSubscriptionBusy(true);
    try {
      const { loadBillingStore } = await import("@/lib/billing-client");
      const store = await loadBillingStore(await createPurchaseSession());
      const url = await store.managementUrl?.();
      if (url && new URL(url).protocol === "https:") setManagementUrl(url);
      else
        toast.message(
          "No billing portal is available for this account. Contact support for subscription help.",
        );
    } catch {
      toast.error("Could not load subscription management. Please try again.");
    } finally {
      setSubscriptionBusy(false);
    }
  }
  async function restore() {
    setSubscriptionBusy(true);
    try {
      const { loadBillingStore } = await import("@/lib/billing-client");
      const store = await loadBillingStore(await createPurchaseSession());
      await store.restore();
      const verified = await verifyMyPremium();
      await queryClient.invalidateQueries({ queryKey: ["entitlement"] });
      toast.message(
        verified.isPremium
          ? "Premium purchases restored"
          : "No active subscription found for this account.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not restore purchases.");
    } finally {
      setSubscriptionBusy(false);
    }
  }

  const notificationPreferences = useQuery({
    queryKey: ["notification-preferences", user?.id],
    queryFn: () => getMyNotificationPreferences(),
    enabled: !!user,
    staleTime: 30_000,
  });
  const productUpdatesEnabled = notificationPreferences.data?.productUpdatesEnabled ?? true;
  const pushEnabled = notificationPreferences.data?.pushEnabled ?? false;
  const [notificationBusy, setNotificationBusy] = useState(false);

  async function updateNotificationPreferences(
    change: Partial<{ productUpdatesEnabled: boolean; pushEnabled: boolean }>,
  ) {
    if (!user) {
      toast.error("Sign in to manage notification preferences.");
      return;
    }
    const current = {
      productUpdatesEnabled: notificationPreferences.data?.productUpdatesEnabled ?? true,
      pushEnabled: notificationPreferences.data?.pushEnabled ?? false,
    };
    const next = { ...current, ...change };
    if (!next.productUpdatesEnabled) next.pushEnabled = false;
    setNotificationBusy(true);
    let consentSaved = false;
    try {
      const token =
        next.pushEnabled && !current.pushEnabled ? await requestBrowserPushToken() : null;
      await saveMyNotificationPreferences({ data: next });
      consentSaved = next.pushEnabled;
      if (token) {
        await registerMyPushToken({ data: { token } });
      }
      if (!next.pushEnabled) await revokeBrowserPushToken().catch(() => undefined);
      await queryClient.invalidateQueries({ queryKey: ["notification-preferences", user.id] });
      toast.success(
        next.pushEnabled
          ? "Push notifications enabled for this account."
          : "Notification preferences saved.",
      );
    } catch (error) {
      if (consentSaved) {
        await saveMyNotificationPreferences({ data: current }).catch(() => undefined);
      }
      toast.error(
        error instanceof Error ? error.message : "Could not update notification preferences.",
      );
    } finally {
      setNotificationBusy(false);
      setPermission(
        typeof Notification === "undefined"
          ? "Unsupported on this device"
          : Notification.permission,
      );
    }
  }

  // Profile preferences sync to Firestore for signed-in users.
  const regionPreferences = useQuery({
    queryKey: ["profile-prefs", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await firebaseData
        .from("profiles")
        .select("currency, locale")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data as { currency?: string; locale?: string } | null) ?? null;
    },
  });

  const prefs = regionPreferences.data;
  const [regionBusy, setRegionBusy] = useState(false);
  const [currency, setCurrency] = useState<string>("USD");
  const [lang, setLang] = useState<string>("en");
  useEffect(() => {
    let storedCur: string | null = null;
    let storedLang: string | null = null;
    try {
      storedCur = window.localStorage.getItem("mealmate-currency");
      storedLang = window.localStorage.getItem("mealmate-lang");
    } catch {
      /* Use the account preference. */
    }
    setCurrency(prefs?.currency ?? storedCur ?? detectCurrency());
    setLang(prefs?.locale ?? storedLang ?? "en");
  }, [prefs]);

  async function saveRegion(field: "currency" | "locale", next: string) {
    if (!user || regionBusy) return;
    setRegionBusy(true);
    try {
      const { error } = await firebaseData
        .from("profiles")
        .update({ [field]: next })
        .eq("id", user.id);
      if (error) throw error;
      const key = field === "currency" ? "currency" : "lang";
      if (field === "currency") setCurrency(next);
      else setLang(next);
      try {
        window.localStorage.setItem(`mealmate-${key}`, next);
      } catch {
        /* Account preference is saved. */
      }
      window.dispatchEvent(new CustomEvent(`mealmate-${key}-changed`, { detail: next }));
      await queryClient.invalidateQueries({ queryKey: ["profile-prefs", user.id] });
      await queryClient.invalidateQueries({ queryKey: [field] });
    } catch {
      toast.error("Couldn't save your region preference. Please try again.");
    } finally {
      setRegionBusy(false);
    }
  }
  const saveCurrency = (next: string) => saveRegion("currency", next);
  const saveLanguage = (next: string) => saveRegion("locale", next);

  async function signOut() {
    if (!window.confirm("Log out of MealMate on this device?")) return;
    try {
      await signOutUnified();
      await queryClient.cancelQueries();
      queryClient.clear();
      toast.success("Signed out");
      navigate({ to: "/auth", replace: true });
    } catch {
      toast.error("Could not log out. Please try again.");
    }
  }

  async function share() {
    const url = "https://mealsmates.site";
    const shareData = {
      title: "MealMate",
      text: "Cook smarter with MealMate — recipes, planner, and AI in your kitchen.",
      url,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied to clipboard");
      }
    } catch {
      /* user cancelled */
    }
  }

  function rate() {
    window.location.href = "mailto:support@mealmate.app?subject=MealMate%20rating%20and%20feedback";
  }

  async function resetPassword() {
    if (!user?.email) {
      toast.error("No email on file");
      return;
    }
    try {
      await sendPasswordReset(user.email, `${window.location.origin}/reset-password`);
      toast.success("Password reset email sent");
    } catch {
      toast.error("Couldn't send the reset email. Please try again.");
    }
  }

  const profileItems: Item[] = [
    {
      label: "Edit my preferences",
      description: "Goals, tastes, allergies, time and budget",
      icon: UserCog,
      href: "#food-preferences",
    },
    {
      label: "MealMate Premium",
      description: "AI, recipes and meal plans · View subscription plans",
      icon: Star,
      to: "/premium",
    },
    {
      label: "Admin dashboard",
      description: "Subscribers, promos, revenue (admin only)",
      icon: Shield,
      to: "/admin",
    },
  ];

  const accountItems: Item[] = [
    {
      label: "Account security",
      description: user?.emailVerified
        ? "Your email address is verified. Use a unique password to protect your account."
        : "Verify your email address to secure your account.",
      icon: Shield,
    },
    {
      label: "Email",
      description: user?.email ?? "Not signed in",
      icon: Mail,
    },
    {
      label: "Change password",
      description: "We'll email you a secure reset link",
      icon: Lock,
      onClick: resetPassword,
    },
  ];

  const supportItems: Item[] = [
    {
      label: "Frequently asked questions",
      description: "Cooking, billing and account help",
      icon: HelpCircle,
      to: "/support",
    },
    {
      label: "Help Center",
      description: "Answers to common questions",
      icon: HelpCircle,
      to: "/support",
    },
    {
      label: "Contact support",
      description: "Get in touch with the team",
      icon: Mail,
      href: "mailto:support@mealmate.app",
    },
  ];

  const aboutItems: Item[] = [
    { label: "About MealMate", description: "Version and credits", icon: Info, to: "/about" },
    {
      label: "Follow on Instagram",
      description: "@mealmate.sp",
      icon: Share2,
      href: "https://www.instagram.com/mealmate.sp/",
    },
    {
      label: "Follow on TikTok",
      description: "@mealmate.sp",
      icon: Share2,
      href: "https://www.tiktok.com/@mealmate.sp",
    },
  ];

  const legalItems: Item[] = [
    {
      label: "Terms of Service",
      description: "The rules for using MealMate",
      icon: FileText,
      to: "/legal/terms",
    },
    {
      label: "Privacy Policy",
      description: "How we handle your data",
      icon: Shield,
      to: "/legal/privacy",
    },
  ];

  return (
    <main className="settings-page">
      <aside className="settings-sidebar">
        <h1>Settings</h1>
        <p>Make MealMate yours.</p>
        <nav aria-label="Settings sections">
          {[
            "Your account",
            "App theme",
            "Food preferences",
            "MealMate Premium",
            "Notifications",
            "Appearance",
            "Region",
            "Privacy & Security",
            "Help & Support",
            "About MealMate",
          ].map((title) => (
            <a key={title} href={`#${sectionId(title)}`}>
              {title}
            </a>
          ))}
        </nav>
      </aside>
      <div className="settings-content">
        <header id="your-account" className="settings-account">
          <ProfilePhotoEditor />
          <div>
            <p className="text-xs text-muted-foreground">YOUR ACCOUNT</p>
            <h2>{account.data?.displayName || user?.displayName || "Your MealMate account"}</h2>
            <p className="break-all text-sm text-muted-foreground">{user?.email}</p>
            <a href="#account">Account details</a>
          </div>
        </header>
        <details className="settings-activity">
          <summary>Your recipes, plans and cooking history</summary>
          <ProfileDashboard />
        </details>

        {/* XP, levels, streaks & challenges */}
        <GamificationCard />

        <div id="app-theme">
          <ThemePicker />
        </div>
        <SettingsPreferences />
        <Section
          title="MealMate Premium"
          items={[
            {
              label: access.loading
                ? "Checking subscription…"
                : access.error
                  ? "Subscription status unavailable"
                  : access.isPremium
                    ? "Premium active"
                    : "No active Premium subscription",
              description: "AI recipes, Mia, scanning, meal plans, favourites and grocery lists",
              icon: Star,
            },
            { label: "View subscription plans", icon: Star, to: "/premium" },
            {
              label: "Manage subscription",
              description: "Billing and cancellation options",
              icon: UserCog,
              trailing: managementUrl ? (
                <a href={managementUrl} target="_blank" rel="noreferrer">
                  Open billing portal
                </a>
              ) : (
                <Button
                  variant="outline"
                  disabled={subscriptionBusy}
                  onClick={() => void manageSubscription()}
                >
                  Manage
                </Button>
              ),
            },
            {
              label: subscriptionBusy ? "Restoring…" : "Restore purchases",
              icon: Star,
              trailing: (
                <Button
                  disabled={subscriptionBusy}
                  onClick={() => void restore()}
                  variant="outline"
                >
                  Restore
                </Button>
              ),
            },
          ]}
        />
        <Section
          title="Privacy controls"
          items={[
            {
              label: "Request account deletion",
              description:
                "Contact support to delete your account and personal data. Deleting your account does not cancel a store subscription.",
              icon: Shield,
              href: "mailto:support@mealmate.app?subject=Delete%20my%20MealMate%20account",
            },
          ]}
        />
        <Section
          title="Profile"
          items={profileItems.filter((item) => item.to !== "/admin" || admin.data?.isAdmin)}
        />
        <Section title="Account" items={accountItems} />

        <Section
          title="Notifications"
          items={[
            {
              label: "MealMate updates",
              description: "Show product announcements in your notification history",
              icon: Bell,
              trailing: (
                <Switch
                  checked={productUpdatesEnabled}
                  disabled={
                    !user ||
                    notificationPreferences.isLoading ||
                    notificationPreferences.isError ||
                    notificationBusy
                  }
                  onCheckedChange={(checked) =>
                    void updateNotificationPreferences({ productUpdatesEnabled: checked })
                  }
                  aria-label="MealMate product updates"
                />
              ),
            },
            {
              label: "Push notifications",
              description: `Device permission: ${permission}. Manage blocked permissions in browser settings.`,
              icon: Bell,
              trailing: (
                <Switch
                  checked={pushEnabled}
                  disabled={
                    !user ||
                    !productUpdatesEnabled ||
                    notificationPreferences.isLoading ||
                    notificationBusy
                  }
                  onCheckedChange={(checked) =>
                    void updateNotificationPreferences({ pushEnabled: checked })
                  }
                  aria-label="Push notifications"
                />
              ),
            },
            {
              label: "Notification history",
              description: unread.data
                ? `${unread.data.unreadCount} unread · View and mark notifications as read`
                : "View unread and past MealMate updates",
              icon: Bell,
              to: "/notifications",
            },
          ]}
        />

        <Section
          title="Appearance"
          items={[
            {
              label: resolved === "dark" ? "Dark mode" : "Light mode",
              description:
                resolved === "dark" ? "Easier on your eyes at night" : "Bright and airy interface",
              icon: resolved === "dark" ? Moon : Sun,

              trailing: (
                <Switch
                  checked={resolved === "dark"}
                  onCheckedChange={(v) => setMode(v ? "dark" : "light")}
                  aria-label="Dark mode"
                />
              ),
            },
          ]}
        />

        <Section
          title="Region"
          items={[
            {
              label: "Currency",
              description: "Display currency. Subscription billing follows your store.",
              icon: DollarSign,
              trailing: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Select
                    disabled={
                      regionBusy || regionPreferences.isPending || regionPreferences.isError
                    }
                    value={currency}
                    onValueChange={saveCurrency}
                  >
                    <SelectTrigger className="h-8 w-[140px] rounded-full text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.symbol} {c.code} — {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ),
            },
            {
              label: "App language",
              description: "Interface and recipe language",
              icon: Globe,
              trailing: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Select
                    disabled={
                      regionBusy || regionPreferences.isPending || regionPreferences.isError
                    }
                    value={lang}
                    onValueChange={saveLanguage}
                  >
                    <SelectTrigger className="h-8 w-[150px] rounded-full text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                      {LANGUAGES.map((l) => (
                        <SelectItem key={l.code} value={l.code}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ),
            },
          ]}
        />

        <Section
          title="Privacy & Security"
          items={[
            {
              label: "Privacy Policy",
              description: "How we handle your data",
              icon: Shield,
              to: "/legal/privacy",
            },
            {
              label: "Change password",
              description: "Send a secure reset link to your email",
              icon: UserCog,
              onClick: resetPassword,
            },
          ]}
        />

        <Section title="Help & Support" items={supportItems} />
        <Section title="About MealMate" items={aboutItems} />
        <Section title="Terms & Privacy" items={legalItems} />

        <section className="mt-6 grid grid-cols-2 gap-3">
          <ActionCard icon={Star} label="Rate MealMate · Send feedback" onClick={rate} />
          <ActionCard icon={Share2} label="Share MealMate" onClick={share} />
        </section>

        {user && (
          <div className="mt-6">
            <Button
              variant="outline"
              onClick={signOut}
              className="h-12 w-full rounded-2xl text-destructive hover:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </Button>
          </div>
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          MealMate · Version 1.0.0 · Developed by Taz Technologies
        </p>
      </div>
    </main>
  );
}

function Section({ title, items }: { title: string; items: Item[] }) {
  return (
    <section id={sectionId(title)} className="settings-section mt-6">
      <h2 className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <ul className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {items.map((item, i) => (
          <li key={item.label} className={i > 0 ? "border-t border-border/70" : ""}>
            <Row item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Row({ item }: { item: Item }) {
  const Icon = item.icon;
  const showChevron = !!(item.to || item.href) && !item.trailing;
  const body = (
    <div className="flex items-center gap-3 px-4 py-3.5 transition-colors duration-150 hover:bg-muted/60 active:bg-muted">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight">{item.label}</p>
        {item.description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
        )}
      </div>
      {item.trailing ??
        (showChevron ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : null)}
    </div>
  );

  if (item.href) {
    return (
      <a
        href={item.href}
        target={item.href.startsWith("http") ? "_blank" : undefined}
        rel="noreferrer"
        className="block"
      >
        {body}
      </a>
    );
  }
  if (item.to) {
    return (
      <Link to={item.to} className="block">
        {body}
      </Link>
    );
  }
  // A trailing control (e.g. a Switch) is itself a button, so the row must not
  // also be a <button> — nested buttons are invalid HTML and break hydration.
  if (item.onClick && !item.trailing) {
    return (
      <button type="button" onClick={item.onClick} className="block w-full text-left">
        {body}
      </button>
    );
  }
  return <div>{body}</div>;
}

function ActionCard({
  icon: Icon,
  label,
  onClick,
}: {
  icon: IconType;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-start gap-2 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-105">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="text-sm font-semibold">{label}</span>
    </button>
  );
}

function sectionId(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-$/, "");
}
