import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";
import { EMPTY_PREFERENCES } from "@/lib/preferences";
import { readOnboardingDraft, saveOnboardingDraft } from "@/lib/onboarding-progress";
import { Route } from "@/routes/onboarding";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  navigate: vi.fn(),
  push: vi.fn(),
  consent: vi.fn(),
  register: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => mocks.navigate,
}));
vi.mock("@/hooks/use-session", () => ({ useSession: () => ({ user: { id: "account-a" } }) }));
vi.mock("@/lib/preferences.functions", () => ({
  getMyPreferences: mocks.get,
  saveMyPreferences: mocks.save,
}));
vi.mock("@/lib/push-client", () => ({ requestBrowserPushToken: mocks.push }));
vi.mock("@/lib/notifications.functions", () => ({
  registerMyPushToken: mocks.register,
  saveMyNotificationPreferences: mocks.consent,
}));
vi.mock("@/components/mealmate-logo", () => ({ MealMateLogo: () => <span>MealMate</span> }));
const Page = Route.options.component as ComponentType;
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.get.mockResolvedValue(null);
  mocks.save.mockResolvedValue({ ok: true });
  mocks.navigate.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("onboarding account flow", () => {
  it("does not advance or register push when permission is denied", async () => {
    vi.stubEnv("VITE_FIREBASE_VAPID_KEY", "test-public-vapid");
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("Notification", {});
    Object.defineProperty(navigator, "serviceWorker", { value: {}, configurable: true });
    saveOnboardingDraft("account-a", 5, EMPTY_PREFERENCES);
    mocks.push.mockRejectedValueOnce(new Error("Permission denied"));
    render(<Page />);
    const enable = await screen.findByRole("button", { name: "Enable notifications" });
    await waitFor(() => expect(enable).not.toBeDisabled());
    fireEvent.click(enable);
    await screen.findByText("Permission denied");
    expect(mocks.consent).not.toHaveBeenCalled();
    expect(mocks.register).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Stay in the loop." })).toBeInTheDocument();
  });

  it("walks through discovery, planner, Mia, optional preferences, notifications and completion", async () => {
    render(<Page />);
    await screen.findByRole("heading", { name: "Find your next favourite." });
    for (const title of [
      "Make every meal count.",
      "Your food assistant, Mia.",
      "Make MealMate yours.",
    ]) {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      await screen.findByRole("heading", { name: title });
    }
    fireEvent.click(screen.getByRole("button", { name: "Peanuts" }));
    fireEvent.click(screen.getByRole("button", { name: "Vegetarian" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Stay in the loop." });
    expect(mocks.save).toHaveBeenCalledWith({
      data: expect.objectContaining({
        allergies: ["Peanuts"],
        dietary_restrictions: ["Vegetarian"],
        onboarding_completed: false,
      }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    fireEvent.click(screen.getByRole("button", { name: "Get started" }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({ to: "/", replace: true }));
    expect(mocks.save).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ onboarding_completed: true }),
    });
    expect(readOnboardingDraft("account-a")).toBeNull();
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it("keeps failed completion retryable and prevents duplicate submissions", async () => {
    saveOnboardingDraft("account-a", 6, EMPTY_PREFERENCES);
    mocks.save.mockRejectedValueOnce(new Error("Connection interrupted"));
    render(<Page />);
    const finish = await screen.findByRole("button", { name: "Get started" });
    fireEvent.click(finish);
    fireEvent.click(finish);
    await screen.findByRole("alert");
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(readOnboardingDraft("account-a")?.step).toBe(6);
    fireEvent.click(finish);
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalled());
  });
  it("resumes only the current account's draft", async () => {
    saveOnboardingDraft("account-b", 5, { ...EMPTY_PREFERENCES, allergies: ["Milk"] });
    render(<Page />);
    await screen.findByRole("heading", { name: "Find your next favourite." });
    expect(readOnboardingDraft("account-a")?.preferences.allergies).toEqual([]);
  });
  it("sends completed accounts home without replaying setup", async () => {
    mocks.get.mockResolvedValue({ ...EMPTY_PREFERENCES, onboarding_completed: true });
    render(<Page />);
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({ to: "/", replace: true }));
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("does not overwrite preferences when the initial account fetch fails", async () => {
    mocks.get.mockRejectedValueOnce(new Error("offline"));
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await screen.findByRole("heading", { name: "Find your next favourite." });
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
