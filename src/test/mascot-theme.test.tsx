import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  user: { id: "alice" } as { id: string } | null,
}));
vi.mock("@/hooks/use-session", () => ({ useSession: () => ({ user: m.user }) }));
vi.mock("@/lib/firebase-data", () => ({
  firebaseData: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: m.load }) }),
      update: () => ({ eq: m.save }),
    }),
  },
}));
import { MascotThemeProvider, useMascotTheme } from "@/hooks/use-mascot-theme";
import { THEME_STORAGE_KEY } from "@/lib/mascot-theme";
let theme: ReturnType<typeof useMascotTheme>;
function Consumer() {
  theme = useMascotTheme();
  return <span>{theme.theme.id}</span>;
}
function View() {
  return (
    <MascotThemeProvider>
      <Consumer />
    </MascotThemeProvider>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  m.user = { id: "alice" };
  m.load.mockResolvedValue({ data: null, error: null });
  m.save.mockResolvedValue({ error: null });
});
afterEach(cleanup);
describe("selected theme persistence", () => {
  it("retains the selected theme while signed out and after remount", async () => {
    m.user = null;
    const view = render(<View />);
    await act(async () => theme.setTheme("ocean"));
    expect(document.documentElement.dataset.mascot).toBe("ocean");
    view.unmount();
    render(<View />);
    expect(screen.getByText("ocean")).toBeInTheDocument();
    expect(m.save).not.toHaveBeenCalled();
  });
  it("restores both the displayed and stored preference when account saving fails", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "cherry");
    m.save.mockResolvedValueOnce({ error: new Error("offline") });
    render(<View />);
    await act(async () => theme.setTheme("matcha"));
    expect(screen.getByText("cherry")).toBeInTheDocument();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("cherry");
    expect(document.documentElement.dataset.mascot).toBe("cherry");
    expect(theme.saving).toBe(false);
  });
  it("does not overwrite a new selection with a late account preference", async () => {
    let finish!: (value: unknown) => void;
    m.load.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<View />);
    await act(async () => theme.setTheme("sunset"));
    await act(async () => finish({ data: { theme: "midnight" }, error: null }));
    expect(screen.getByText("sunset")).toBeInTheDocument();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("sunset");
  });
  it("ignores failed saves from the previous account", async () => {
    let finish!: (value: unknown) => void;
    m.save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = render(<View />);
    let saving!: Promise<void>;
    act(() => {
      saving = theme.setTheme("ocean");
    });
    m.user = { id: "bob" };
    m.load.mockResolvedValueOnce({ data: { theme: "matcha" }, error: null });
    view.rerender(<View />);
    await waitFor(() => expect(screen.getByText("matcha")).toBeInTheDocument());
    await act(async () => {
      finish({ error: new Error("offline") });
      await saving;
    });
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("matcha");
    expect(theme.saving).toBe(false);
  });
});
