import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType, PropsWithChildren } from "react";
const m = vi.hoisted(() => ({
  navigate: vi.fn(),
  info: vi.fn(),
  user: null as { id: string } | null,
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => m.navigate,
  Link: ({ children }: PropsWithChildren) => <a>{children}</a>,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({}),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_: string, options: { defaultValue: string }) => options.defaultValue,
  }),
}));
vi.mock("sonner", () => ({ toast: { info: m.info, success: vi.fn() } }));
vi.mock("@/hooks/use-session", () => ({ useSession: () => ({ user: m.user }) }));
vi.mock("@/hooks/use-premium", () => ({ usePremium: () => ({ isPremium: false }) }));
vi.mock("@/components/native-billing", () => ({
  useNativeBilling: () => false,
  NativeBilling: () => null,
}));
vi.mock("@/lib/premium.functions", () => ({
  applyReferralCode: vi.fn(),
  getMyReferral: vi.fn(),
  redeemPromoCode: vi.fn(),
}));
vi.mock("@/lib/currency", () => ({
  useCurrency: () => ({ currency: "USD" }),
  formatPrice: (value: number) => `$${value.toFixed(2)}`,
  PRICES_USD: {
    premium_annual: 75,
    premium_monthly: 9.99,
    family_annual: 99.99,
    family_monthly: 12.99,
  },
}));
import { Route } from "@/routes/premium";
const Page = Route.options.component as ComponentType;
beforeEach(() => {
  vi.clearAllMocks();
  m.user = null;
});
afterEach(cleanup);
describe("Premium trial comparison", () => {
  it("shows only paid plan trials with payment requirements and renewal prices", () => {
    render(<Page />);
    expect(screen.queryByRole("button", { name: "Continue Free" })).not.toBeInTheDocument();
    expect(screen.queryByText("$0")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Start 7-Day Trial/ })).toHaveLength(2);
    expect(screen.getAllByText(/Card details required at checkout/)).toHaveLength(2);
    expect(screen.getAllByText(/Website checkout is not available yet/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/3-Day|3-day/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Monthly" }));
    expect(screen.getByText("$9.99")).toBeInTheDocument();
    expect(screen.getByText("$12.99")).toBeInTheDocument();
  });
  it("requires sign-in and does not pretend the website starts a trial", () => {
    const view = render(<Page />);
    fireEvent.click(screen.getAllByRole("button", { name: /Start 7-Day Trial/ })[0]!);
    expect(m.navigate).toHaveBeenCalledWith({ to: "/auth" });
    expect(m.info).not.toHaveBeenCalled();
    m.user = { id: "alice" };
    view.rerender(<Page />);
    fireEvent.click(screen.getAllByRole("button", { name: /Start 7-Day Trial/ })[0]!);
    expect(m.info).toHaveBeenCalledWith(expect.any(String), {
      description: expect.stringContaining("Website checkout is not available yet"),
    });
  });
});
