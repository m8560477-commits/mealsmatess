import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { speakMia } from "@/lib/mia/speech";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  token: vi.fn(),
  fetch: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  revoke: vi.fn(),
  create: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({ waitForFirebaseAuth: mocks.auth }));
let player: { onended: (() => void) | null; onerror: (() => void) | null };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ getIdToken: mocks.token });
  mocks.token.mockResolvedValue("synthetic-token");
  mocks.fetch.mockResolvedValue(
    new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "audio/mpeg" } }),
  );
  mocks.play.mockResolvedValue(undefined);
  mocks.create.mockReturnValue("blob:synthetic");
  player = { onended: null, onerror: null };
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubGlobal(
    "Audio",
    class {
      set onended(value: (() => void) | null) {
        player.onended = value;
      }
      set onerror(value: (() => void) | null) {
        player.onerror = value;
      }
      play = mocks.play;
      pause = mocks.pause;
      removeAttribute = vi.fn();
    },
  );
  vi.stubGlobal("URL", { createObjectURL: mocks.create, revokeObjectURL: mocks.revoke });
});
afterEach(() => vi.unstubAllGlobals());
describe("Mia ElevenLabs audio playback", () => {
  it("requests audio using the signed-in user and waits for playback to finish", async () => {
    const done = vi.fn();
    const promise = speakMia("Turn down the heat.", new AbortController().signal).then(done);
    await vi.waitFor(() => expect(mocks.play).toHaveBeenCalledOnce());
    expect(done).not.toHaveBeenCalled();
    expect(mocks.fetch.mock.calls[0][0]).toBe("/api/mia-speech");
    expect(mocks.fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer synthetic-token");
    player.onended?.();
    await promise;
    expect(done).toHaveBeenCalledOnce();
    expect(mocks.revoke).toHaveBeenCalledWith("blob:synthetic");
  });
  it("stops playback and frees the URL immediately when interrupted", async () => {
    const controller = new AbortController();
    const promise = speakMia("A reply", controller.signal);
    await vi.waitFor(() => expect(mocks.play).toHaveBeenCalledOnce());
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.pause).toHaveBeenCalledOnce();
    expect(mocks.revoke).toHaveBeenCalledOnce();
  });
  it("aborts an in-flight provider request when muted", async () => {
    mocks.fetch.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init.signal.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          ),
        ),
    );
    const controller = new AbortController();
    const promise = speakMia("A reply", controller.signal);
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce());
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.play).not.toHaveBeenCalled();
  });
  it("shows an actionable error when the voice service is not configured", async () => {
    mocks.fetch.mockResolvedValueOnce(
      Response.json({ error: "Mia's ElevenLabs voice is not configured yet." }, { status: 503 }),
    );
    await expect(speakMia("Hello", new AbortController().signal)).rejects.toThrow("not configured");
    expect(mocks.play).not.toHaveBeenCalled();
  });
  it("releases audio when playback is blocked", async () => {
    mocks.play.mockRejectedValueOnce(new Error("autoplay blocked"));
    await expect(speakMia("Hello", new AbortController().signal)).rejects.toThrow("Tap the screen");
    expect(mocks.revoke).toHaveBeenCalledOnce();
  });
});
