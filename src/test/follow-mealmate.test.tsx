import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FollowMealMate } from "@/components/follow-mealmate";
const mocks = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn() }));
vi.mock("@/hooks/use-session", () => ({ useSession: () => ({ user: { id: "test-user" } }) }));
vi.mock("@/lib/billing.functions", () => ({
  getSocialIntroCompletion: mocks.get,
  completeSocialIntro: mocks.save,
}));
function mount() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <FollowMealMate>
        <p>Home dashboard</p>
      </FollowMealMate>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.get.mockResolvedValue(false);
  mocks.save.mockResolvedValue(true);
});
afterEach(cleanup);
it("opens only official accounts and persists optional skip", async () => {
  mount();
  expect(await screen.findByRole("link", { name: /Follow on Instagram/ })).toHaveAttribute(
    "href",
    "https://www.instagram.com/mealmate.sp/",
  );
  expect(screen.getByRole("link", { name: /Follow on TikTok/ })).toHaveAttribute(
    "href",
    "https://www.tiktok.com/@mealmate.sp",
  );
  expect(mocks.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Skip" }));
  await screen.findByText("Home dashboard");
  expect(mocks.save).toHaveBeenCalledOnce();
});
it("does not repeat after completion", async () => {
  mocks.get.mockResolvedValue(true);
  mount();
  await screen.findByText("Home dashboard");
  expect(screen.queryByRole("button", { name: "Skip" })).not.toBeInTheDocument();
});
it("allows retry if saving fails", async () => {
  mocks.save.mockRejectedValueOnce(new Error("offline"));
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Skip" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Skip" }));
  await screen.findByText("Home dashboard");
});
