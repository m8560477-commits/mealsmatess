import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { EMPTY_PREFERENCES } from "@/lib/preferences";
const mocks = vi.hoisted(() => ({ save: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/hooks/use-session", () => ({ useSession: () => ({ user: { id: "owner" } }) }));
vi.mock("@/lib/preferences.functions", () => ({
  getMyPreferences: async () => ({
    ...EMPTY_PREFERENCES,
    disliked_foods: ["Olives"],
    allergies: ["Peanuts"],
    onboarding_completed: true,
    preferred_features: ["Planner"],
    cooking_time: "30 minutes",
  }),
  saveMyPreferences: mocks.save,
}));
import { SettingsPreferences } from "@/components/settings-preferences";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("edits cuisines without clearing allergies, onboarding or existing preferences", async () => {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SettingsPreferences />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByText("Edit my preferences"));
  expect(await screen.findByDisplayValue("Olives")).toBeInTheDocument();
  await screen.findByDisplayValue("30 minutes");
  fireEvent.change(screen.getByLabelText("Preferred cuisines"), {
    target: { value: "South African, Italian" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith({
      data: expect.objectContaining({
        allergies: ["Peanuts"],
        disliked_foods: ["Olives"],
        onboarding_completed: true,
        preferred_features: ["Planner"],
        preferred_cuisines: ["South African", "Italian"],
      }),
    }),
  );
});
