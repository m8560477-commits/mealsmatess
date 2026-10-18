import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode, ComponentType } from "react";
import { normalizePreferences } from "@/lib/preferences";
const mocks = vi.hoisted(() => ({
  preferences: {} as unknown,
  save: vi.fn(),
  generate: vi.fn(),
  experience: vi.fn(),
  complete: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  useNavigate: () => mocks.navigate,
}));
vi.mock("@/hooks/use-session", () => ({
  useSession: () => ({ user: { id: "test-user" }, loading: false }),
}));
vi.mock("@/hooks/use-preferences", () => ({
  usePreferences: () => ({
    preferences: mocks.preferences,
    loading: false,
    error: null,
    save: mocks.save,
  }),
}));
vi.mock("@/lib/onboarding.functions", () => ({
  createOnboardingExperience: mocks.generate,
  getOnboardingExperience: mocks.experience,
  completeOnboarding: mocks.complete,
}));
vi.mock("@/components/subscription-options", () => ({
  SubscriptionOptions: () => <div>Verified subscription options</div>,
}));
vi.mock("@/components/recipe-image", () => ({
  RecipeImage: ({ recipe }: { recipe: { name: string } }) => <img alt={recipe.name} />,
}));
import { Route } from "@/routes/onboarding";
const Component = Route.options.component as ComponentType;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.preferences = normalizePreferences({});
  mocks.save.mockResolvedValue(undefined);
  mocks.experience.mockResolvedValue(null);
  localStorage.clear();
});
afterEach(cleanup);
function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Component />
    </QueryClientProvider>,
  );
}
it("resumes the saved step after reopening", () => {
  mocks.preferences = normalizePreferences({
    onboarding_step: 6,
    budget_currency: "ZAR",
    budget_amount: 650,
  });
  mount();
  expect(screen.getByRole("heading", { name: "Make your budget go further" })).toBeInTheDocument();
  expect(screen.getByLabelText("Food or grocery budget (ZAR)")).toHaveValue(650);
});
it("stores a draft immediately and syncs real answers before continuing", async () => {
  mocks.preferences = normalizePreferences({ onboarding_step: 1 });
  mount();
  fireEvent.change(screen.getByLabelText("What should we call you?"), {
    target: { value: "Alex" },
  });
  fireEvent.change(screen.getByLabelText("What country are you in?"), { target: { value: "ZA" } });
  expect(JSON.parse(localStorage.getItem("mealmate.preferences.v1:test-user")!).display_name).toBe(
    "Alex",
  );
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("heading", { name: "What brings you to the table?" });
  expect(mocks.save).toHaveBeenCalledWith(
    expect.objectContaining({
      display_name: "Alex",
      country: "ZA",
      budget_currency: "ZAR",
      onboarding_step: 2,
    }),
  );
});
it("keeps progress and shows the failure when generation fails", async () => {
  mocks.preferences = normalizePreferences({ onboarding_step: 9, display_name: "Alex" });
  mocks.generate.mockRejectedValue(new Error("Mia is temporarily unavailable"));
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Create my experience" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Mia is temporarily unavailable");
  expect(screen.getByRole("heading", { name: "Creating your experience" })).toBeInTheDocument();
  expect(mocks.complete).not.toHaveBeenCalled();
});
it("shows only the successful service's recipes, explanation and prompts", async () => {
  mocks.preferences = normalizePreferences({ onboarding_step: 9 });
  mocks.generate.mockResolvedValue({
    greeting: "Meals for your busy evenings",
    recipes: [
      { id: "1", name: "Tomato rice", slug: "rice", ingredients: [] },
      { id: "2", name: "Bean stew", slug: "stew", ingredients: [] },
      { id: "3", name: "Vegetable soup", slug: "soup", ingredients: [] },
    ],
    explanations: [
      "Uses your preferred rice",
      "A practical pantry meal",
      "Matches your cooking time",
    ],
    prompts: ["How can I batch cook rice?"],
    shoppingTips: [],
    plan: [{ day: 1, meal: "Dinner", name: "Tomato rice" }],
  });
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Create my experience" }));
  await screen.findByRole("heading", { name: "Made for you" });
  expect(screen.getByText("Uses your preferred rice")).toBeInTheDocument();
  expect(screen.getByText("How can I batch cook rice?")).toBeInTheDocument();
  expect(mocks.complete).not.toHaveBeenCalled();
});
it("does not advance past an unsynced save and retains the draft", async () => {
  mocks.preferences = normalizePreferences({
    onboarding_step: 1,
    display_name: "Alex",
    country: "ZA",
  });
  mocks.save.mockRejectedValue(new Error("Offline"));
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Offline"));
  expect(screen.getByRole("heading", { name: "A little about you" })).toBeInTheDocument();
  expect(localStorage.getItem("mealmate.preferences.v1:test-user")).toContain("Alex");
});
it("opens completed accounts with their existing preferences for editing", () => {
  mocks.preferences = normalizePreferences({
    onboarding_completed: true,
    onboarding_step: 11,
    display_name: "Existing",
    country: "ZA",
  });
  mount();
  expect(screen.getByLabelText("What should we call you?")).toHaveValue("Existing");
  expect(screen.getByRole("heading", { name: "A little about you" })).toBeInTheDocument();
});
