import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PremiumPaywall } from "@/components/premium-paywall";
import { ConsumerAccessGate } from "@/components/consumer-access-gate";
import { Route } from "@/routes/welcome";
import { planKind, sevenDayTrial } from "@/lib/billing-client";
import type { ComponentType, ReactNode } from "react";
const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  session: { user: null as null | { id: string }, loading: false },
  access: { isPremium: false, loading: false, error: null as Error | null, retry: vi.fn() },
  path: "/planner",
  create: vi.fn(),
  load: vi.fn(),
  verify: vi.fn(),
  purchase: vi.fn(),
  restore: vi.fn(),
  intro: vi.fn(),
  complete: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => mocks.navigate,
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ location: { pathname: mocks.path } }),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock("@/hooks/use-session", () => ({ useSession: () => mocks.session }));
vi.mock("@/hooks/use-premium", () => ({ usePremium: () => mocks.access }));
vi.mock("@/lib/billing.functions", () => ({
  createPurchaseSession: mocks.create,
  verifyMyPremium: mocks.verify,
  verifyCheckout: mocks.verify,
  getIntroCompletion: mocks.intro,
  completeIntro: mocks.complete,
}));
vi.mock("@/lib/preferences.functions", () => ({ getMyPreferences: async () => null }));
vi.mock("@/lib/billing-client", async (original) => ({
  ...(await original<typeof import("@/lib/billing-client")>()),
  loadBillingStore: mocks.load,
}));
vi.mock("@/components/recipe-image", () => ({ RecipeImage: () => <div>Food photograph</div> }));
const Welcome = Route.options.component as ComponentType;
function mount(children: ReactNode) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  onlineManager.setOnline(true);
  localStorage.clear();
  mocks.session.user = null;
  mocks.path = "/planner";
  mocks.access = { isPremium: false, loading: false, error: null, retry: vi.fn() };
  mocks.create.mockResolvedValue({ appUserId: "synthetic" });
  mocks.verify.mockResolvedValue({ isPremium: true });
  mocks.purchase.mockResolvedValue({});
  mocks.restore.mockResolvedValue({});
  mocks.intro.mockResolvedValue(false);
  mocks.complete.mockResolvedValue(true);
  mocks.load.mockResolvedValue({
    plans: [
      {
        id: "yearly",
        kind: "yearly",
        price: "R399.00",
        period: "year",
        trialDays: 7,
        purchase: mocks.purchase,
      },
    ],
    restore: mocks.restore,
  });
});
afterEach(cleanup);
describe("onboarding and mandatory paywall", () => {
  it("finishes four benefit screens at the paywall and remembers completion", async () => {
    mount(<Welcome />);
    for (let step = 1; step <= 4; step++) {
      expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", String(step));
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    }
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/premium", replace: true });
    expect(localStorage.getItem("mealmate.tour-seen.v1")).toBe("1");
  });
  it("resumes a confirmed purchase without offering another checkout", async () => {
    mocks.create.mockResolvedValueOnce({ appUserId: "existing", isActive: true });
    mount(<PremiumPaywall />);
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/auth", replace: true }),
    );
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.purchase).not.toHaveBeenCalled();
  });
  it("keeps cancelled checkout on the paywall with no free exit", async () => {
    mocks.purchase.mockRejectedValue({ userCancelled: true });
    mount(<PremiumPaywall />);
    fireEvent.click(await screen.findByRole("button", { name: "Start 7-day free trial" }));
    await screen.findByText(/Checkout cancelled/);
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(screen.queryByText(/Continue Free|Skip|Close paywall/)).not.toBeInTheDocument();
    expect(screen.getByText(/7 days free, then R399.00 every year/)).toBeInTheDocument();
  });
  it("waits for server verification after payment before opening sign-in", async () => {
    let resolve!: (value: unknown) => void;
    mocks.verify.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    mount(<PremiumPaywall />);
    fireEvent.click(await screen.findByRole("button", { name: "Start 7-day free trial" }));
    await waitFor(() => expect(mocks.verify).toHaveBeenCalled());
    expect(mocks.navigate).not.toHaveBeenCalled();
    resolve({ isPremium: true });
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/auth", replace: true }),
    );
  });
  it("restores an existing account without another purchase", async () => {
    mocks.session.user = { id: "subscriber" };
    mount(<PremiumPaywall />);
    const restore = await screen.findByRole("button", { name: "Restore Purchases" });
    await waitFor(() => expect(restore).not.toBeDisabled());
    fireEvent.click(restore);
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({ to: "/", replace: true }));
    expect(mocks.restore).toHaveBeenCalledOnce();
    expect(mocks.purchase).not.toHaveBeenCalled();
  });
  it("keeps failed verification retryable without opening the app", async () => {
    mocks.verify.mockRejectedValue(new Error("offline"));
    mount(<PremiumPaywall />);
    fireEvent.click(await screen.findByRole("button", { name: "Start 7-day free trial" }));
    await screen.findByText(/couldn’t confirm/);
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Check subscription access" })).toBeEnabled();
  });
  it("keeps an inactive restored purchase on the paywall", async () => {
    mocks.verify.mockResolvedValue({ isPremium: false });
    mount(<PremiumPaywall />);
    const restore = await screen.findByRole("button", { name: "Restore Purchases" });
    await waitFor(() => expect(restore).not.toBeDisabled());
    fireEvent.click(restore);
    await screen.findByText(/subscription isn’t confirmed/, {}, { timeout: 4000 });
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.purchase).not.toHaveBeenCalled();
  });
  it("blocks checkout while offline", async () => {
    mount(<PremiumPaywall />);
    const purchase = await screen.findByRole("button", { name: "Start 7-day free trial" });
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    fireEvent(window, new Event("offline"));
    expect(purchase).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("You’re offline");
    expect(mocks.purchase).not.toHaveBeenCalled();
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    fireEvent(window, new Event("online"));
  });
  it("shows unavailable plans without invented prices or trials", async () => {
    mocks.load.mockRejectedValue(new Error("unconfigured"));
    mount(<PremiumPaywall />);
    await screen.findByText(/couldn’t load/);
    expect(screen.getByRole("button", { name: "Subscribe" })).toBeDisabled();
    expect(screen.queryByText("7 days free")).not.toBeInTheDocument();
  });
  it("does not invent trial eligibility or map unrelated package names", () => {
    expect(sevenDayTrial("P7D", false)).toBe(7);
    expect(sevenDayTrial("P1W", false)).toBe(7);
    expect(sevenDayTrial("P3D", false)).toBe(0);
    expect(sevenDayTrial("P7D", true)).toBe(0);
    expect(planKind("family", "household", "P1M")).toBe("family");
    expect(planKind("a", "product", "P1Y")).toBe("yearly");
    expect(planKind("a", "product", "P3M")).toBeNull();
  });
});
describe("Consumer route enforcement", () => {
  it("redirects a fresh guest without mounting protected content", async () => {
    mount(
      <ConsumerAccessGate>
        <div>Protected app</div>
      </ConsumerAccessGate>,
    );
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/welcome", replace: true }),
    );
    expect(screen.queryByText("Protected app")).not.toBeInTheDocument();
  });
  it("cannot unlock app content by editing onboarding storage", async () => {
    localStorage.setItem("mealmate.tour-seen.v1", "1");
    localStorage.setItem("premium", "true");
    mocks.session.user = { id: "unpaid" };
    mount(
      <ConsumerAccessGate>
        <div>Protected app</div>
      </ConsumerAccessGate>,
    );
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/premium", replace: true }),
    );
    expect(screen.queryByText("Protected app")).not.toBeInTheDocument();
  });
  it("blocks pending and failed verification, and admits verified subscribers", async () => {
    mocks.session.user = { id: "subscriber" };
    mocks.access.loading = true;
    const page = mount(
      <ConsumerAccessGate>
        <div>Protected app</div>
      </ConsumerAccessGate>,
    );
    expect(screen.queryByText("Protected app")).not.toBeInTheDocument();
    page.unmount();
    mocks.access.loading = false;
    mocks.access.error = new Error("offline");
    const failure = mount(
      <ConsumerAccessGate>
        <div>Protected app</div>
      </ConsumerAccessGate>,
    );
    await screen.findByText(/couldn’t verify/);
    expect(screen.queryByText("Protected app")).not.toBeInTheDocument();
    failure.unmount();
    mocks.access.error = null;
    mocks.access.isPremium = true;
    mount(
      <ConsumerAccessGate>
        <div>Protected app</div>
      </ConsumerAccessGate>,
    );
    expect(screen.getByText("Protected app")).toBeInTheDocument();
  });
  it("keeps legal and sign-in recovery available without exposing the app", () => {
    mocks.path = "/legal/terms";
    mount(
      <ConsumerAccessGate>
        <div>Legal terms</div>
      </ConsumerAccessGate>,
    );
    expect(screen.getByText("Legal terms")).toBeInTheDocument();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
