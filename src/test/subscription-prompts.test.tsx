import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { PlanStatusCard } from "@/components/plan-status-card";
import { UpgradeModalProvider, useUpgradeModal } from "@/components/upgrade-modal";

const access = vi.hoisted(() => ({ isPremium: false, tier: "free", trialActive: false }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock("@/hooks/use-session", () => ({ useSession: () => ({ user: { id: "subscriber" } }) }));
vi.mock("@/hooks/use-premium", () => ({ usePremium: () => access }));

afterEach(cleanup);

function OpenPrompt() {
  const { open } = useUpgradeModal();
  return <button onClick={() => open("Check your access")}>Open subscription prompt</button>;
}

describe("subscription prompts", () => {
  it("directs users to verified plans without a free option or invented trial terms", () => {
    render(
      <UpgradeModalProvider>
        <OpenPrompt />
      </UpgradeModalProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open subscription prompt" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Check your access");
    expect(screen.getByRole("link", { name: "View subscription plans" })).toHaveAttribute(
      "href",
      "/premium",
    );
    expect(
      screen.queryByText(/continue free|mealMate free|3.day free trial/i),
    ).not.toBeInTheDocument();
  });

  it("does not present an unverified account as having a free plan", () => {
    render(<PlanStatusCard />);
    expect(screen.getByText("Subscription needed")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/premium");
    expect(screen.queryByText(/mealmate free|your allowance/i)).not.toBeInTheDocument();
  });
});
