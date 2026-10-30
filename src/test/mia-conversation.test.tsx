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
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => mocks.native, isPluginAvailable: () => true },
}));
vi.mock("@capacitor/app", () => ({ App: { addListener: mocks.addListener } }));
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
  expect(mocks.mic).not.toHaveBeenCalled();
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
  await act(async () => {
    mia.startVoice();
  });
  await waitFor(() => expect(mia.voice.state).toBe("waiting"));
  act(() => activity({ isActive: false }));
  expect(dispose).toHaveBeenCalledOnce();
  expect(mia.voice.state).toBe("paused");
});
