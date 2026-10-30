import { afterEach, describe, expect, it, vi } from "vitest";
import { speakMia } from "@/lib/mia/speech";
const mocks = vi.hoisted(() => ({
  native: true,
  available: true,
  speak: vi.fn(),
  stop: vi.fn(async () => {}),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => mocks.native, isPluginAvailable: () => mocks.available },
  registerPlugin: () => ({ speak: mocks.speak, stop: mocks.stop }),
}));
afterEach(() => {
  vi.clearAllMocks();
  mocks.native = true;
  mocks.available = true;
});
describe("Android spoken replies", () => {
  it("uses native TTS and waits for the reply to finish", async () => {
    let complete!: () => void;
    mocks.speak.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    const done = vi.fn();
    const reply = speakMia("Step one, wash the rice.", new AbortController().signal).then(done);
    await vi.waitFor(() => expect(mocks.speak).toHaveBeenCalled());
    expect(done).not.toHaveBeenCalled();
    complete();
    await reply;
    expect(done).toHaveBeenCalledOnce();
    expect(mocks.speak).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Step one, wash the rice.", lang: "en-US" }),
    );
  });
  it("stops native speech immediately on mute or interruption", async () => {
    mocks.speak.mockImplementation(() => new Promise(() => {}));
    const controller = new AbortController();
    const reply = speakMia("A spoken answer", controller.signal);
    await vi.waitFor(() => expect(mocks.speak).toHaveBeenCalled());
    controller.abort();
    await expect(reply).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.stop).toHaveBeenCalledOnce();
  });
  it("explains when the installed app lacks the native speech plugin", async () => {
    mocks.available = false;
    await expect(speakMia("Hello", new AbortController().signal)).rejects.toThrow(
      "Update the MealMate Android app",
    );
    expect(mocks.speak).not.toHaveBeenCalled();
  });
});
