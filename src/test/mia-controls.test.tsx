import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { MiaVoiceControls } from "@/components/mia-voice-controls";
import type { MiaVoiceState } from "@/lib/mia/voice-session";
const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  end: vi.fn(),
  voice: { state: "muted" as MiaVoiceState, transcript: "", error: "" },
}));
vi.mock("@/hooks/use-mia", () => ({
  useMia: () => ({
    voice: mocks.voice,
    startVoice: mocks.start,
    stopVoice: mocks.stop,
    endConversation: mocks.end,
    turns: [],
  }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.voice = { state: "muted", transcript: "", error: "" };
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("hands-free consent and indicators", () => {
  it("asks for informed consent before accessing the microphone", () => {
    render(<MiaVoiceControls />);
    expect(mocks.start).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("switch", { name: "Hands-free Mia" }));
    expect(mocks.start).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Microphone audio is never recorded or uploaded",
    );
    fireEvent.click(screen.getByRole("button", { name: "Enable hands-free and allow microphone" }));
    expect(mocks.start).toHaveBeenCalledOnce();
  });
  it("provides immediate mute during a spoken answer", () => {
    mocks.voice.state = "speaking";
    render(<MiaVoiceControls />);
    expect(screen.getByRole("status")).toHaveTextContent("Mia is speaking");
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("button", { name: "Mute Mia microphone immediately" }));
    expect(mocks.stop).toHaveBeenCalledOnce();
  });
  it.each([
    ["waiting", "Waiting for “Hey Mia”"],
    ["listening", "Listening to you"],
    ["thinking", "Mia is thinking"],
    ["muted", "Microphone muted"],
    ["denied", "Microphone permission denied"],
    ["paused", "Hands-free paused"],
  ] as const)("shows the real %s state", (state, label) => {
    mocks.voice.state = state;
    render(<MiaVoiceControls />);
    expect(screen.getByRole("status")).toHaveTextContent(label);
  });
});
