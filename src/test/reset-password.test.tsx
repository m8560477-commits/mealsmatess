import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { toast } from "sonner";
import { Route } from "@/routes/reset-password";

const mocks = vi.hoisted(() => ({
  search: {} as { oobCode?: string },
  navigate: vi.fn(),
}));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  useNavigate: () => mocks.navigate,
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock("@/lib/firebase", () => ({ auth: {} }));
vi.mock("firebase/auth", () => ({
  verifyPasswordResetCode: vi.fn(),
  confirmPasswordReset: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ResetPasswordPage = Route.options.component as ComponentType;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.search = {};
  vi.spyOn(Route, "useSearch").mockImplementation(() => mocks.search);
  vi.mocked(verifyPasswordResetCode).mockResolvedValue("chef@example.test");
  vi.mocked(confirmPasswordReset).mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function renderValidLink() {
  mocks.search = { oobCode: "synthetic-reset-code" };
  render(<ResetPasswordPage />);
  await waitFor(() => expect(screen.getByLabelText("New password")).toBeEnabled());
}
function enterPasswords(password: string, confirm: string) {
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: confirm } });
  fireEvent.click(screen.getByRole("button", { name: "Update password" }));
}

describe("password reset recovery", () => {
  it("explains how to request a link instead of waiting forever when none is provided", () => {
    render(<ResetPasswordPage />);
    expect(screen.getByText(/Open the password reset link from your email/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute("href", "/auth");
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    expect(verifyPasswordResetCode).not.toHaveBeenCalled();
  });

  it("provides persistent recovery instructions for an expired link", async () => {
    mocks.search = { oobCode: "expired-code" };
    vi.mocked(verifyPasswordResetCode).mockRejectedValue(new Error("expired"));
    render(<ResetPasswordPage />);
    expect(
      await screen.findByText(/This password reset link is invalid or has expired/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Update password" })).not.toBeInTheDocument();
  });

  it("keeps the form disabled until the reset code is verified", async () => {
    let resolve!: (value: string) => void;
    mocks.search = { oobCode: "pending-code" };
    vi.mocked(verifyPasswordResetCode).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    render(<ResetPasswordPage />);
    expect(screen.getByLabelText("New password")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Update password" })).toBeDisabled();
    resolve("chef@example.test");
    await waitFor(() => expect(screen.getByLabelText("New password")).toBeEnabled());
  });

  it("does not submit mismatched passwords", async () => {
    await renderValidLink();
    enterPasswords("new-password", "other-password");
    expect(toast.error).toHaveBeenCalledWith("Passwords don't match.");
    expect(confirmPasswordReset).not.toHaveBeenCalled();
  });

  it("submits a verified code and returns to sign in after success", async () => {
    await renderValidLink();
    enterPasswords("new-password", "new-password");
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/auth", replace: true }),
    );
    expect(confirmPasswordReset).toHaveBeenCalledWith({}, "synthetic-reset-code", "new-password");
  });

  it("keeps failed submissions on the page and permits retry", async () => {
    vi.mocked(confirmPasswordReset).mockRejectedValueOnce(new Error("network"));
    await renderValidLink();
    enterPasswords("new-password", "new-password");
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("Could not update your password"),
      ),
    );
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Update password" })).toBeEnabled();
  });

  it("ignores late verification results when the link changes", async () => {
    let resolve!: (value: string) => void;
    mocks.search = { oobCode: "old-code" };
    vi.mocked(verifyPasswordResetCode).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { rerender } = render(<ResetPasswordPage />);
    mocks.search = {};
    rerender(<ResetPasswordPage />);
    resolve("chef@example.test");
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Back to sign in" })).toBeInTheDocument(),
    );
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
  });
});
