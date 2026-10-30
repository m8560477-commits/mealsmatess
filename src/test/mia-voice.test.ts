import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MiaVoiceSession, afterMiaWake, type MiaVoiceSnapshot } from "@/lib/mia/voice-session";
import type { MicrophoneEvents } from "@/lib/mia/microphone";

function setup() {
  let events!: MicrophoneEvents;
  let captured = "";
  let snapshot!: MiaVoiceSnapshot;
  const mic = {
    reset: vi.fn(() => {
      captured = "";
    }),
    finish: vi.fn(async () => captured),
    dispose: vi.fn(),
  };
  const microphone = vi.fn(async (next: MicrophoneEvents) => {
    events = next;
    return mic;
  });
  const respond = vi.fn(
    async (_text: string, _signal: AbortSignal) => "What ingredients do you have today?",
  );
  const speak = vi.fn(async (_text: string, _signal: AbortSignal) => {});
  const session = new MiaVoiceSession({
    microphone,
    respond,
    speak,
    changed: (next) => {
      snapshot = next;
    },
  });
  return {
    session,
    mic,
    microphone,
    respond,
    speak,
    state: () => snapshot,
    hear: (text: string, endpoint = false) => {
      captured = text;
      events.transcript(text, endpoint);
    },
    activity: () => events.activity(),
    fail: (error: Error) => events.failed(error),
  };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("foreground hands-free Mia", () => {
  it("does not capture before enabling or transmit unrelated speech", async () => {
    const s = setup();
    expect(s.microphone).not.toHaveBeenCalled();
    await s.session.start();
    s.hear("a conversation in the room", true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(s.respond).not.toHaveBeenCalled();
    expect(s.state().state).toBe("waiting");
    expect(s.mic.reset).toHaveBeenCalledTimes(2);
    s.session.stop();
  });
  it("captures the question after the wake phrase and accepts hands-free follow-ups", async () => {
    const s = setup();
    await s.session.start();
    s.hear("hey mia what can i cook today");
    expect(s.state()).toMatchObject({ state: "listening", transcript: "what can i cook today" });
    await vi.advanceTimersByTimeAsync(1300);
    expect(s.respond).toHaveBeenNthCalledWith(1, "what can i cook today", expect.any(AbortSignal));
    expect(s.speak).toHaveBeenCalledWith(
      "What ingredients do you have today?",
      expect.any(AbortSignal),
    );
    expect(s.state().state).toBe("listening");
    s.hear("i have chicken rice and tomatoes");
    await vi.advanceTimersByTimeAsync(1300);
    expect(s.respond).toHaveBeenNthCalledWith(
      2,
      "i have chicken rice and tomatoes",
      expect.any(AbortSignal),
    );
    expect(s.microphone).toHaveBeenCalledOnce();
    s.session.stop();
  });
  it("waits through natural pauses and ongoing voice activity", async () => {
    const s = setup();
    await s.session.start();
    s.hear("hey mia");
    await vi.advanceTimersByTimeAsync(2000);
    expect(s.respond).not.toHaveBeenCalled();
    s.hear("hey mia what can i cook");
    await vi.advanceTimersByTimeAsync(1000);
    s.activity();
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.respond).not.toHaveBeenCalled();
    s.hear("hey mia what can i cook with rice");
    await vi.advanceTimersByTimeAsync(1300);
    expect(s.respond).toHaveBeenCalledWith("what can i cook with rice", expect.any(AbortSignal));
    s.session.stop();
  });
  it("ignores Mia's own speech and allows the user to interrupt a reply", async () => {
    const s = setup();
    let outputSignal!: AbortSignal;
    s.speak.mockImplementationOnce(
      (_text, signal) =>
        new Promise((_resolve, reject) => {
          outputSignal = signal;
          signal.addEventListener("abort", () =>
            reject(new DOMException("interrupted", "AbortError")),
          );
        }),
    );
    await s.session.start();
    s.hear("hey mia help with dinner");
    await vi.advanceTimersByTimeAsync(1300);
    expect(s.state().state).toBe("speaking");
    s.hear("what ingredients do you have today");
    expect(outputSignal.aborted).toBe(false);
    s.hear("what ingredients do have today");
    expect(outputSignal.aborted).toBe(false);
    s.hear("i have chicken");
    expect(outputSignal.aborted).toBe(true);
    expect(s.state().state).toBe("listening");
    await vi.advanceTimersByTimeAsync(1300);
    expect(s.respond).toHaveBeenNthCalledWith(2, "i have chicken", expect.any(AbortSignal));
    s.session.stop();
  });
  it("returns to wake listening on silence or a spoken end command", async () => {
    const s = setup();
    await s.session.start();
    s.hear("hey mia hello");
    await vi.advanceTimersByTimeAsync(1300);
    s.hear("thanks mia");
    await vi.advanceTimersByTimeAsync(1300);
    expect(s.state().state).toBe("waiting");
    expect(s.respond).toHaveBeenCalledOnce();
    s.hear("hey mia");
    await vi.advanceTimersByTimeAsync(25_100);
    expect(s.state().state).toBe("waiting");
    s.session.stop();
  });
  it("mutes immediately, cancels pending output, and ignores stale recognition", async () => {
    const s = setup();
    s.respond.mockImplementationOnce(() => new Promise(() => {}));
    await s.session.start();
    s.hear("hey mia help");
    await vi.advanceTimersByTimeAsync(1300);
    const signal = s.respond.mock.calls[0]?.[1] as AbortSignal;
    s.session.stop();
    expect(signal.aborted).toBe(true);
    expect(s.mic.dispose).toHaveBeenCalledOnce();
    s.hear("hey mia ignored");
    await vi.advanceTimersByTimeAsync(2000);
    expect(s.respond).toHaveBeenCalledOnce();
    expect(s.state().state).toBe("muted");
  });
  it("releases a microphone that finishes opening after mute", async () => {
    const s = setup();
    let open!: (value: typeof s.mic) => void;
    s.microphone.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          open = resolve;
        }),
    );
    const pending = s.session.start();
    s.session.stop();
    open(s.mic);
    await pending;
    expect(s.mic.dispose).toHaveBeenCalledOnce();
    expect(s.state().state).toBe("muted");
  });
  it("shows permission denial and engine failure without keeping a false listening state", async () => {
    const s = setup();
    s.microphone.mockRejectedValueOnce(new DOMException("Microphone blocked", "NotAllowedError"));
    await s.session.start();
    expect(s.state()).toMatchObject({ state: "denied", error: "Microphone blocked" });
    await s.session.start();
    s.fail(new Error("Audio suspended"));
    expect(s.mic.dispose).toHaveBeenCalledOnce();
    expect(s.state().state).toBe("error");
  });
  it("keeps provider failures visible and requires a new wake phrase before retrying", async () => {
    const s = setup();
    s.respond.mockRejectedValueOnce(new Error("Mia unavailable"));
    await s.session.start();
    s.hear("hey mia help");
    await vi.advanceTimersByTimeAsync(1300);
    expect(s.state()).toMatchObject({ state: "waiting", error: "Mia unavailable" });
    s.hear("ordinary speech", true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(s.respond).toHaveBeenCalledOnce();
    s.session.stop();
  });
});
it("only activates a complete wake phrase", () => {
  expect(afterMiaWake("Hey Mia, what is next?")).toBe("what is next?");
  expect(afterMiaWake("hey me a help with dinner")).toBe("help with dinner");
  expect(afterMiaWake("Mia is helpful")).toBeNull();
  expect(afterMiaWake("they might cook")).toBeNull();
});
