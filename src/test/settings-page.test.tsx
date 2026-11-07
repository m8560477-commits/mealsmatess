import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  admin: false,
  logout: vi.fn(async () => {}),
  restore: vi.fn(async () => {}),
  verify: vi.fn(async () => ({ isPremium: false })),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: any) => <a href={to}>{children}</a>,
  useNavigate: () => vi.fn(),
}));
vi.mock("@/hooks/use-session", () => ({
  useSession: () => ({
    user: {
      id: "test-owner",
      email: "owner@example.test",
      displayName: "Test Owner",
      emailVerified: true,
    },
  }),
  signOutUnified: mocks.logout,
}));
vi.mock("@/hooks/use-premium", () => ({ usePremium: () => ({ isPremium: false }) }));
vi.mock("@/lib/premium.functions", () => ({
  adminIsAdmin: async () => ({ isAdmin: mocks.admin }),
}));
vi.mock("@/lib/billing.functions", () => ({
  createPurchaseSession: async () => ({}),
  verifyMyPremium: mocks.verify,
}));
vi.mock("@/lib/billing-client", () => ({
  loadBillingStore: async () => ({ restore: mocks.restore }),
}));
vi.mock("@/lib/profile.functions", () => ({
  getCookingDashboard: async () => ({ displayName: "Test Owner" }),
}));
vi.mock("@/lib/firebase", () => ({ sendPasswordReset: vi.fn() }));
vi.mock("@/lib/firebase-data", () => ({
  firebaseData: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { currency: "ZAR", locale: "en" } }) }),
      }),
    }),
  },
}));
vi.mock("@/lib/notifications.functions", () => ({
  getMyUnreadNotificationCount: async () => ({ unreadCount: 3 }),
  getMyNotificationPreferences: async () => ({ productUpdatesEnabled: true, pushEnabled: false }),
  saveMyNotificationPreferences: vi.fn(),
  registerMyPushToken: vi.fn(),
}));
vi.mock("@/lib/push-client", () => ({
  requestBrowserPushToken: vi.fn(),
  revokeBrowserPushToken: vi.fn(),
}));
vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ resolved: "dark", setMode: vi.fn() }),
}));
vi.mock("@/components/profile-dashboard", () => ({
  ProfileDashboard: () => <div>Cooking history</div>,
}));
vi.mock("@/components/profile-photo-editor", () => ({
  ProfilePhotoEditor: () => <button>Change photo</button>,
}));
vi.mock("@/components/gamification-card", () => ({ GamificationCard: () => null }));
vi.mock("@/components/theme-picker", () => ({ ThemePicker: () => null }));
vi.mock("@/components/settings-preferences", () => ({ SettingsPreferences: () => null }));
import { SettingsPage } from "@/components/settings-page";
function page() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SettingsPage />
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  mocks.admin = false;
});
it("hides admin controls for ordinary accounts and shows real unread count", async () => {
  page();
  expect(await screen.findByText(/3 unread/)).toBeInTheDocument();
  expect(screen.queryByText("Admin dashboard")).not.toBeInTheDocument();
});
it("shows the admin entry only after server authorization", async () => {
  mocks.admin = true;
  page();
  expect(await screen.findByText("Admin dashboard")).toBeInTheDocument();
});
it("cancelling logout preserves the session", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(false);
  page();
  fireEvent.click(screen.getByRole("button", { name: /Log out/i }));
  expect(mocks.logout).not.toHaveBeenCalled();
});
it("restoring purchases rechecks server entitlement", async () => {
  page();
  fireEvent.click(screen.getByRole("button", { name: "Restore" }));
  await waitFor(() => expect(mocks.verify).toHaveBeenCalledOnce());
  expect(mocks.restore).toHaveBeenCalledOnce();
  expect(screen.getByText("No active Premium subscription")).toBeInTheDocument();
});
