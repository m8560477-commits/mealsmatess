import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { openMiaMicrophone } from "@/lib/mia/microphone";
const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/lib/mia/local-recognizer", () => ({ LocalRecognizer: { load: mocks.load } }));
const stop = vi.fn();
const close = vi.fn(async () => {});
const getUserMedia = vi.fn();
const dispose = vi.fn();
const track = { stop, onended: null as (() => void) | null };
const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
const events = { transcript: vi.fn(), activity: vi.fn(), failed: vi.fn() };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal(
    "AudioContext",
    class {
      sampleRate = 16000;
      state = "running";
      onstatechange = null;
      audioWorklet = { addModule: vi.fn(async () => {}) };
      resume = vi.fn(async () => {});
      close = close;
      createMediaStreamSource() {
        return { connect: vi.fn(), disconnect: vi.fn() };
      }
    },
  );
  vi.stubGlobal(
    "AudioWorkletNode",
    class {
      port = { onmessage: null };
      connect() {}
      disconnect() {}
    },
  );
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  getUserMedia.mockResolvedValue(stream);
  mocks.load.mockResolvedValue({ reset: vi.fn(), finish: vi.fn(), accept: vi.fn(), dispose });
});
afterEach(() => vi.unstubAllGlobals());
it("stops capture and the local worker when the user mutes", async () => {
  const signal = new AbortController();
  const microphone = await openMiaMicrophone(events, signal.signal);
  signal.abort();
  microphone.dispose();
  expect(stop).toHaveBeenCalledOnce();
  expect(dispose).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
});
it("releases permission that arrives after cancellation", async () => {
  let allow!: (value: typeof stream) => void;
  getUserMedia.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        allow = resolve;
      }),
  );
  const controller = new AbortController();
  const pending = openMiaMicrophone(events, controller.signal);
  await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalled());
  controller.abort();
  allow(stream);
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(stop).toHaveBeenCalledOnce();
  expect(mocks.load).not.toHaveBeenCalled();
});
it("closes audio resources when permission is denied", async () => {
  getUserMedia.mockRejectedValueOnce(new DOMException("Denied", "NotAllowedError"));
  await expect(openMiaMicrophone(events, new AbortController().signal)).rejects.toMatchObject({
    name: "NotAllowedError",
  });
  expect(close).toHaveBeenCalledOnce();
  expect(mocks.load).not.toHaveBeenCalled();
});
it("requests mic permission on launch and resumes suspended audio on a normal screen interaction", async () => {
  let resumes = 0;
  const audioState = { current: "suspended" };
  vi.stubGlobal(
    "AudioContext",
    class {
      sampleRate = 16000;
      get state() {
        return audioState.current;
      }
      onstatechange = null;
      audioWorklet = { addModule: vi.fn(async () => {}) };
      resume() {
        resumes++;
        if (resumes === 1) return new Promise<void>(() => {});
        audioState.current = "running";
        return Promise.resolve();
      }
      close = close;
      createMediaStreamSource() {
        return { connect: vi.fn(), disconnect: vi.fn() };
      }
    },
  );
  const controller = new AbortController();
  const pending = openMiaMicrophone(events, controller.signal);
  await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
  expect(audioState.current).toBe("suspended");
  await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledOnce());
  window.dispatchEvent(new Event("pointerdown"));
  const microphone = await pending;
  expect(audioState.current).toBe("running");
  expect(mocks.load).toHaveBeenCalledOnce();
  microphone.dispose();
});
it("releases the microphone when stopped while awaiting an audio gesture", async () => {
  vi.stubGlobal(
    "AudioContext",
    class {
      sampleRate = 16000;
      state = "suspended";
      onstatechange = null;
      audioWorklet = { addModule: vi.fn(async () => {}) };
      resume() {
        return new Promise<void>(() => {});
      }
      close = close;
    },
  );
  const controller = new AbortController();
  const pending = openMiaMicrophone(events, controller.signal);
  await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(stop).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
});

it("disposes a model that finishes after cancellation while audio awaits a gesture", async () => {
  let finishLoad!: (value: {
    reset: typeof vi.fn;
    finish: typeof vi.fn;
    accept: typeof vi.fn;
    dispose: typeof dispose;
  }) => void;
  mocks.load.mockReturnValueOnce(
    new Promise((resolve) => {
      finishLoad = resolve;
    }),
  );
  vi.stubGlobal(
    "AudioContext",
    class {
      sampleRate = 16000;
      state = "suspended";
      onstatechange = null;
      audioWorklet = { addModule: vi.fn(async () => {}) };
      resume() {
        return new Promise<void>(() => {});
      }
      close = close;
    },
  );
  const controller = new AbortController();
  const pending = openMiaMicrophone(events, controller.signal);
  await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledOnce());
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  finishLoad({ reset: vi.fn(), finish: vi.fn(), accept: vi.fn(), dispose });
  await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce());
  expect(stop).toHaveBeenCalledOnce();
});
