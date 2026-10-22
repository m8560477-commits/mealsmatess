import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScannerCamera } from "@/hooks/use-scanner-camera";
import { captureScanImage, createProductDetector, prepareScanFile } from "@/lib/scanner-camera";
function media() {
  const track = {
    stop: vi.fn(),
    onended: null as (() => void) | null,
    getCapabilities: () => ({ torch: true }),
    applyConstraints: vi.fn().mockResolvedValue(undefined),
  };
  return {
    track,
    stream: { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream,
  };
}
beforeEach(() => {
  vi.stubGlobal("isSecureContext", true);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function setupCamera(getUserMedia: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  const hook = renderHook(() => useScannerCamera());
  const video = document.createElement("video");
  Object.defineProperty(video, "videoWidth", { value: 1280 });
  Object.defineProperty(video, "videoHeight", { value: 720 });
  video.play = vi.fn().mockResolvedValue(undefined);
  hook.result.current.videoRef.current = video;
  return { ...hook, video };
}
describe("embedded camera lifecycle", () => {
  it("requests video only, connects preview, toggles torch and stops on unmount", async () => {
    const { stream, track } = media();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    const { result, video, unmount } = setupCamera(getUserMedia);
    await act(() => result.current.start());
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: false,
        video: expect.objectContaining({ facingMode: { ideal: "environment" } }),
      }),
    );
    expect(video.srcObject).toBe(stream);
    expect(result.current.state).toBe("live");
    await act(() => result.current.toggleTorch());
    expect(track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ torch: true }] });
    unmount();
    expect(track.stop).toHaveBeenCalled();
    expect(video.srcObject).toBeNull();
  });
  it("keeps permission denied errors in app with recovery guidance", async () => {
    const { result } = setupCamera(
      vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError")),
    );
    await act(() => result.current.start());
    expect(result.current.state).toBe("error");
    expect(result.current.error).toContain("permission");
  });
  it("stops streams granted after cancel", async () => {
    const { stream, track } = media();
    let grant!: (value: MediaStream) => void;
    const { result } = setupCamera(
      vi.fn().mockReturnValue(
        new Promise((resolve) => {
          grant = resolve;
        }),
      ),
    );
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.start();
    });
    act(() => result.current.stop());
    await act(async () => {
      grant(stream);
      await pending;
    });
    expect(track.stop).toHaveBeenCalled();
    expect(result.current.state).toBe("idle");
  });
  it("times out an unanswered permission prompt and closes late grants", async () => {
    vi.useFakeTimers();
    const { stream, track } = media();
    let grant!: (value: MediaStream) => void;
    const { result } = setupCamera(
      vi.fn().mockReturnValue(
        new Promise((resolve) => {
          grant = resolve;
        }),
      ),
    );
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.start();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_001);
      await pending;
    });
    expect(result.current.error).toContain("taking too long");
    await act(async () => grant(stream));
    expect(track.stop).toHaveBeenCalled();
  });
  it("releases the camera when the page becomes hidden", async () => {
    const { stream, track } = media();
    const { result } = setupCamera(vi.fn().mockResolvedValue(stream));
    await act(() => result.current.start());
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(track.stop).toHaveBeenCalled();
    expect(result.current.state).toBe("idle");
  });
  it("provides manual-code fallback when detection is unsupported", async () => {
    vi.stubGlobal("BarcodeDetector", undefined);
    expect(await createProductDetector()).toBeNull();
  });
  it("rejects unsupported files and unready video before uploading", async () => {
    await expect(
      prepareScanFile(
        new File(["test"], "image.heic", { type: "image/heic" }),
        new AbortController().signal,
      ),
    ).rejects.toThrow(/JPEG/);
    expect(() => captureScanImage(document.createElement("video"))).toThrow(/not ready/);
  });
});
