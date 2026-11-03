import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MiaProvider } from "@/components/mia-provider";
import { useMia, type MiaContextValue } from "@/hooks/use-mia";
const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  mic: vi.fn(),
  user: { id: "voice-user" } as { id: string } | null,
  premium: true,
  native: false,
  addListener: vi.fn(),
  getState: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => mocks.native, isPluginAvailable: () => true },
}));
vi.mock("@capacitor/app", () => ({
  App: { addListener: mocks.addListener, getState: mocks.getState },
}));
vi.mock("@/hooks/use-session", () => ({ useSession: () => ({ user: mocks.user }) }));
vi.mock("@/hooks/use-premium", () => ({ usePremium: () => ({ isPremium: mocks.premium }) }));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: "/chat" } }),
}));
vi.mock("@/lib/ai-api", () => ({ postAuthenticatedAi: mocks.api }));
vi.mock("@/lib/mia/microphone", () => ({ openMiaMicrophone: mocks.mic }));
vi.mock("@/components/mia-voice-controls", () => ({ MiaVoiceControls: () => null }));
let mia!: MiaContextValue;
function Capture() {
  mia = useMia();
  return null;
}
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.getState.mockResolvedValue({ isActive: true });
  mocks.mic.mockResolvedValue({ reset: vi.fn(), finish: vi.fn(async () => ""), dispose: vi.fn() });
  mocks.user = { id: "voice-user" };
  mocks.premium = true;
  mocks.native = false;
  mocks.api.mockResolvedValue({ reply: "Try tomato rice." });
});
afterEach(cleanup);
it("shares typed and spoken history and includes the current cooking step", async () => {
  render(
    <MiaProvider>
      <Capture />
    </MiaProvider>,
  );
  await waitFor(() => expect(mia.voice.state).toBe("waiting"));
  expect(mocks.mic).toHaveBeenCalledOnce();
  await act(async () => {
    await mia.ask("I have rice and tomatoes");
  });
  act(() => mia.setRecipe({ name: "Tomato rice", steps: ["Wash rice", "Add tomatoes"], step: 1 }));
  await act(async () => {
    await mia.ask("What next?", { voice: true });
  });
  const body = mocks.api.mock.calls[1]?.[1];
  expect(body).toMatchObject({ voice: true, recipe: { step: 1 } });
  expect(body.messages).toEqual([
    { role: "user", content: "I have rice and tomatoes" },
    { role: "assistant", content: "Try tomato rice." },
    { role: "user", content: "What next?" },
  ]);
  expect(mia.turns).toHaveLength(2);
});
it("clears conversation and stops access when the Firebase user changes", async () => {
  const page = render(
    <MiaProvider>
      <Capture />
    </MiaProvider>,
  );
  await act(async () => {
    await mia.ask("Help me cook");
  });
  mocks.user = null;
  page.rerender(
    <MiaProvider>
      <Capture />
    </MiaProvider>,
  );
  await waitFor(() => expect(mia.turns).toEqual([]));
  await expect(mia.ask("Private question")).rejects.toThrow("Sign in");
  expect(mocks.api).toHaveBeenCalledOnce();
});

it("releases the microphone on Android app backgrounding", async () => {
  mocks.native = true;
  const dispose = vi.fn();
  mocks.mic.mockResolvedValue({ reset: vi.fn(), finish: vi.fn(), dispose });
  let activity!: (state: { isActive: boolean }) => void;
  const remove = vi.fn(async () => {});
  mocks.addListener.mockImplementation(async (_event, listener) => {
    activity = listener;
    return { remove };
  });
  render(
    <MiaProvider>
      <Capture />
    </MiaProvider>,
  );
  await waitFor(() => expect(mocks.addListener).toHaveBeenCalled());
  await waitFor(() => expect(mia.voice.state).toBe("waiting"));
  act(() => activity({ isActive: false }));
  expect(dispose).toHaveBeenCalledOnce();
  expect(mia.voice.state).toBe("paused");
  act(() => activity({ isActive: true }));
  await waitFor(() => expect(mia.voice.state).toBe("waiting"));
  expect(mocks.mic).toHaveBeenCalledTimes(2);
});

it("remembers an explicit mute and does not restart on foreground return or reload", async () => {
  const page = render(
    <MiaProvider>
      <Capture />
    </MiaProvider>,
  );
  await waitFor(() => expect(mia.voice.state).toBe("waiting"));
  act(() => mia.stopVoice());
  expect(localStorage.getItem("mealmate:voice-muted:voice-user")).toBe("1");
  act(() => window.dispatchEvent(new Event("pageshow")));
  expect(mocks.mic).toHaveBeenCalledOnce();
  page.unmount();
  render(
    <MiaProvider>
      <Capture />
    </MiaProvider>,
  );
  expect(mocks.mic).toHaveBeenCalledOnce();
  act(() => mia.startVoice());
  await waitFor(() => expect(mia.voice.state).toBe("waiting"));
  expect(mocks.mic).toHaveBeenCalledTimes(2);
});
it("does not retry microphone permission denial on ordinary page events", async () => {
  mocks.mic.mockRejectedValueOnce(new DOMException("Permission denied", "NotAllowedError"));
  render(
    <MiaProvider>
      <Capture />
    </MiaProvider>,
  );
  await waitFor(() => expect(mia.voice.state).toBe("denied"));
  act(() => window.dispatchEvent(new Event("pageshow")));
  expect(mocks.mic).toHaveBeenCalledOnce();
});
it("does not start for a signed-out or unverified account", () => {
  mocks.premium = false;
  render(
    <MiaProvider>
      <Capture />
    </MiaProvider>,
  );
  expect(mocks.mic).not.toHaveBeenCalled();
});

it("waits for Android foreground before opening the microphone", async () => {
  mocks.native = true;
  let activity!: (state: { isActive: boolean }) => void;
  mocks.addListener.mockImplementation(async (_event, listener) => {
    activity = listener;
    return { remove: vi.fn(async () => {}) };
  });
  mocks.getState.mockResolvedValue({ isActive: false });
  render(
    <MiaProvider>
      <Capture />
    </MiaProvider>,
  );
  await waitFor(() => expect(mocks.getState).toHaveBeenCalledOnce());
  expect(mocks.mic).not.toHaveBeenCalled();
  act(() => activity({ isActive: true }));
  await waitFor(() => expect(mia.voice.state).toBe("waiting"));
});
