import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
const mocks = vi.hoisted(() => ({
  google: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  reset: vi.fn(),
  redirect: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  verification: vi.fn(),
  update: vi.fn(),
  auth: {
    currentUser: null as null | { uid: string; email: string; displayName: string; photoURL: null },
  },
}));
vi.mock("@/hooks/use-session", () => ({ useSession: () => ({ user: null, loading: false }) }));
vi.mock("@/components/hub/hub-context", () => ({ useHubSurface: () => false }));
vi.mock("@/components/recipe-image", () => ({ RecipeImage: () => null }));
vi.mock("@/components/mealmate-logo", () => ({ MealMateLogo: () => <span>MealMate</span> }));
vi.mock("@/lib/firebase", () => ({
  auth: mocks.auth,
  db: {},
  getRedirectResult: mocks.redirect,
  signInWithGoogle: mocks.google,
  signInWithEmail: mocks.signIn,
  signUpWithEmail: mocks.signUp,
  sendPasswordReset: mocks.reset,
}));
vi.mock("@/lib/firebase-core", () => ({
  auth: mocks.auth,
  db: {},
  getRedirectResult: mocks.redirect,
  signInWithGoogle: mocks.google,
  signInWithEmail: mocks.signIn,
  signUpWithEmail: mocks.signUp,
  sendPasswordReset: mocks.reset,
}));
vi.mock("firebase/auth", () => ({
  sendEmailVerification: mocks.verification,
  updateProfile: mocks.update,
}));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...path: string[]) => path.join("/"),
  getDoc: mocks.getDoc,
  setDoc: mocks.setDoc,
}));
import { AuthPage } from "@/routes/auth";
async function setup(path = "/auth") {
  const root = createRootRoute({ component: Outlet });
  const auth = createRoute({
    getParentRoute: () => root,
    path: "/auth",
    validateSearch: (s: Record<string, unknown>) => s,
    component: AuthPage,
  });
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => <h1>Home destination</h1>,
  });
  const router = createRouter({
    routeTree: root.addChildren([auth, home]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
  await waitFor(() => expect(mocks.redirect).toHaveBeenCalled());
  return router;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.currentUser = null;
  mocks.redirect.mockResolvedValue(null);
  mocks.google.mockResolvedValue(null);
  mocks.getDoc.mockResolvedValue({ exists: () => false });
  mocks.setDoc.mockResolvedValue(undefined);
  mocks.verification.mockResolvedValue(undefined);
  mocks.reset.mockResolvedValue(undefined);
});
afterEach(cleanup);
describe("authentication journey", () => {
  it("shows exactly two entry buttons and follows the account links", async () => {
    const router = await setup();
    expect((await screen.findAllByRole("button")).map((b) => b.textContent?.trim())).toEqual([
      "Continue with Google",
      "Continue with Email",
    ]);
    expect(screen.queryByLabelText("Email address")).toBeNull();
    expect(screen.getByText("Your personal food companion.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create Account" })).toHaveAttribute(
      "href",
      "/auth?mode=signup",
    );
    fireEvent.click(screen.getByRole("link", { name: "Create Account" }));
    expect(await screen.findByLabelText("Full name")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("heading", { name: "Welcome to MealMate" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue with Email" }));
    expect(await screen.findByRole("heading", { name: "Welcome Back" })).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ mode: "signin" });
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("link", { name: "Create Account" }));
    expect(await screen.findByLabelText("Full name")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm password")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Sign In" }));
    expect(await screen.findByRole("heading", { name: "Welcome Back" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("heading", { name: "Welcome to MealMate" })).toBeInTheDocument();
  });
  it("calls Firebase reset with the entered email and displays success", async () => {
    await setup("/auth?mode=signin");
    fireEvent.click(await screen.findByRole("button", { name: "Forgot password?" }));
    fireEvent.change(await screen.findByLabelText("Email address"), {
      target: { value: "Chef@Example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByRole("status")).toHaveTextContent("reset link");
    expect(mocks.reset).toHaveBeenCalledWith("chef@example.test");
  });
  it("creates a Firebase account and preserves profile fields via merge before continuing", async () => {
    const user = {
      uid: "synthetic",
      email: "chef@example.test",
      displayName: "Chef One",
      photoURL: null,
    };
    mocks.signUp.mockResolvedValue({ user });
    await setup("/auth?mode=signup");
    fireEvent.change(await screen.findByLabelText("Full name"), {
      target: { value: " Chef One " },
    });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "chef@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "syntheticpass" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "syntheticpass" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
    expect(await screen.findByRole("heading", { name: "Home destination" })).toBeInTheDocument();
    expect(mocks.signUp).toHaveBeenCalledWith("chef@example.test", "syntheticpass", "Chef One");
    expect(mocks.setDoc).toHaveBeenCalledWith(
      "users/synthetic",
      expect.objectContaining({
        id: "synthetic",
        email: user.email,
        displayName: user.displayName,
        createdAt: expect.any(String),
      }),
      { merge: true },
    );
    expect(mocks.verification).toHaveBeenCalledWith(user);
  });
  it("shows duplicate account and password mismatch errors without silently proceeding", async () => {
    mocks.signUp.mockRejectedValue({ code: "auth/email-already-in-use" });
    await setup("/auth?mode=signup");
    fireEvent.change(await screen.findByLabelText("Full name"), { target: { value: "Chef" } });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "chef@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "syntheticpass" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "mismatch" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("don’t match");
    expect(mocks.signUp).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "syntheticpass" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already exists");
    expect(await screen.findByRole("heading", { name: "Welcome Back" })).toBeInTheDocument();
  });
  it("allows retry if account creation succeeds but Firestore profile write fails", async () => {
    const user = {
      uid: "synthetic",
      email: "chef@example.test",
      displayName: "Chef",
      photoURL: null,
    };
    mocks.auth.currentUser = user;
    mocks.signUp.mockResolvedValue({ user });
    mocks.setDoc.mockRejectedValueOnce(new Error("offline"));
    mocks.update.mockResolvedValue(undefined);
    await setup("/auth?mode=signup");
    fireEvent.change(await screen.findByLabelText("Full name"), { target: { value: "Chef" } });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "chef@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "syntheticpass" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "syntheticpass" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
    fireEvent.click(await screen.findByRole("button", { name: "Retry saving profile" }));
    expect(await screen.findByRole("heading", { name: "Home destination" })).toBeInTheDocument();
    expect(mocks.setDoc).toHaveBeenCalledTimes(2);
  });
  it("passes email credentials to Firebase and advances after a successful sign-in", async () => {
    mocks.signIn.mockResolvedValue({ user: { uid: "synthetic" } });
    await setup("/auth?mode=signin");
    fireEvent.change(await screen.findByLabelText("Email address"), {
      target: { value: "Chef@Example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "syntheticpass" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    expect(await screen.findByRole("heading", { name: "Home destination" })).toBeInTheDocument();
    expect(mocks.signIn).toHaveBeenCalledWith("chef@example.test", "syntheticpass");
  });
  it("starts Firebase Google sign-in and reports cancellation", async () => {
    const cancelled = Object.assign(new Error("cancelled"), { code: "auth/popup-closed-by-user" });
    mocks.google.mockRejectedValue(cancelled);
    await setup();
    const google = await screen.findByRole("button", { name: "Continue with Google" });
    await waitFor(() => expect(google).not.toBeDisabled());
    fireEvent.click(google);
    expect(await screen.findByRole("status")).toHaveTextContent("cancelled");
    expect(mocks.google).toHaveBeenCalledOnce();
  });
  it("reports password reset delivery errors", async () => {
    mocks.reset.mockRejectedValue(new Error("offline"));
    await setup("/auth?mode=reset");
    fireEvent.change(await screen.findByLabelText("Email address"), {
      target: { value: "chef@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not send the reset email");
  });
});
