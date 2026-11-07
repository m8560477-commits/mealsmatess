import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WelcomeGuide } from "@/components/welcome-guide";
const mocks = vi.hoisted(() => ({ get: vi.fn(), complete: vi.fn(), user: { id: "account-a" } }));
vi.mock("@/hooks/use-session", () => ({ useSession: () => ({ user: mocks.user }) }));
vi.mock("@/lib/billing.functions", () => ({
  getWelcomeGuideCompletion: mocks.get,
  completeWelcomeGuide: mocks.complete,
  getSocialIntroCompletion: async () => true,
}));
vi.mock("@/components/recipe-image", () => ({ RecipeImage: () => <div /> }));
function mount() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <WelcomeGuide>
        <p>Your kitchen</p>
      </WelcomeGuide>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.get.mockResolvedValue(false);
  mocks.complete.mockResolvedValue(true);
});
afterEach(cleanup);
it("waits for account completion before showing the app", async () => {
  mocks.get.mockResolvedValue(true);
  mount();
  expect(screen.queryByText("Your kitchen")).not.toBeInTheDocument();
  expect(await screen.findByText("Your kitchen")).toBeInTheDocument();
  expect(mocks.complete).not.toHaveBeenCalled();
});
it("walks five steps, supports back and saves before entry", async () => {
  mount();
  await screen.findByText("Welcome to your kitchen.");
  expect(screen.getByRole("button", { name: /Back/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: /Next/ }));
  fireEvent.click(screen.getByRole("button", { name: /Back/ }));
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
  for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole("button", { name: /Next/ }));
  fireEvent.click(screen.getByRole("button", { name: /Let’s cook/ }));
  expect(await screen.findByText("Your kitchen")).toBeInTheDocument();
  expect(mocks.complete).toHaveBeenCalledOnce();
});
it("keeps failed persistence retryable and persists Skip", async () => {
  mocks.complete.mockRejectedValueOnce(new Error("offline"));
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Skip guide" }));
  await screen.findByRole("alert");
  expect(screen.queryByText("Your kitchen")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Skip guide" }));
  await screen.findByText("Your kitchen");
  expect(mocks.complete).toHaveBeenCalledTimes(2);
});
it("does not silently skip when account progress cannot be read", async () => {
  mocks.get.mockRejectedValueOnce(new Error("offline"));
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
  await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
  await screen.findByText("Welcome to your kitchen.");
});
