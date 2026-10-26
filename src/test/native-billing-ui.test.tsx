import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
const m = vi.hoisted(() => ({ offers: vi.fn(), action: vi.fn(), invalidate: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ createClientOnlyFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: PropsWithChildren) => <a>{children}</a>,
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: m.invalidate }),
}));
vi.mock("@/hooks/use-session", () => ({ useSession: () => ({ user: { id: "alice" } }) }));
vi.mock("@/lib/billing/revenuecat.client", () => ({
  nativeOffers: m.offers,
  nativeAction: m.action,
}));
import { NativeBilling } from "@/components/native-billing";
const pkg = {
  identifier: "monthly",
  packageType: "MONTHLY",
  product: {
    identifier: "premium:monthly",
    defaultOption: {
      pricingPhases: [
        {
          recurrenceMode: 2,
          billingCycleCount: 1,
          billingPeriod: { iso8601: "P7D", value: 7, unit: "DAY" },
          price: { formatted: "R 0,00", currencyCode: "ZAR", amountMicros: 0 },
        },
        {
          recurrenceMode: 1,
          billingPeriod: { iso8601: "P1M", value: 1, unit: "MONTH" },
          price: { formatted: "R 49,99", currencyCode: "ZAR", amountMicros: 49990000 },
        },
      ],
    },
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  m.offers.mockResolvedValue({ packages: [pkg], sandbox: false });
  m.action.mockResolvedValue({ active: true, sandbox: false });
});
afterEach(cleanup);
describe("native subscription UI", () => {
  it("requires consent before purchase and displays actual store currency", async () => {
    render(<NativeBilling />);
    const buy = await screen.findByRole("button", { name: "Start 7-Day Trial" });
    expect(buy).toBeDisabled();
    expect(screen.getByText(/R 49,99 ZAR/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(buy);
    await waitFor(() => expect(m.action).toHaveBeenCalledWith("alice", pkg));
    expect(await screen.findByText("Premium access confirmed.")).toBeInTheDocument();
  });
  it("does not advertise a trial or offer an immediate paid purchase when no seven-day offer is eligible", async () => {
    const paidOnly = structuredClone(pkg);
    paidOnly.product.defaultOption.pricingPhases.shift();
    m.offers.mockResolvedValue({ packages: [paidOnly], sandbox: false });
    render(<NativeBilling />);
    await screen.findByText(/No eligible 7-day trials/);
    expect(screen.queryByRole("button", { name: "Start 7-Day Trial" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore purchases" })).toBeEnabled();
    expect(m.action).not.toHaveBeenCalled();
  });
  it("restores without requiring new consent", async () => {
    render(<NativeBilling />);
    const restore = screen.getByRole("button", { name: "Restore purchases" });
    await waitFor(() => expect(restore).toBeEnabled());
    fireEvent.click(restore);
    await waitFor(() => expect(m.action).toHaveBeenCalledWith("alice", "restore"));
  });
  it("shows loading, unavailable configuration and retry without fabricated offers", async () => {
    let reject!: (error: Error) => void;
    m.offers.mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    render(<NativeBilling />);
    expect(screen.getByText("Loading store prices…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore purchases" })).toBeDisabled();
    await waitFor(() => expect(reject).toBeTypeOf("function"));
    reject(new Error("Mobile subscriptions are not configured yet."));
    expect(
      await screen.findByText("Mobile subscriptions are not configured yet."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start 7-Day Trial" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reload plans" }));
    expect(await screen.findByRole("button", { name: "Start 7-Day Trial" })).toBeInTheDocument();
  });
});
