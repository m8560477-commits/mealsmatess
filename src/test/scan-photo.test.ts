import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prepareScanPhoto } from "@/lib/scan-photo";
const jpeg = "data:image/jpeg;base64,AQID";
let invalidImage = false;
let dimensions = [3000, 2000];
beforeEach(() => {
  invalidImage = false;
  dimensions = [3000, 2000];
  vi.stubGlobal(
    "Image",
    class {
      width = dimensions[0]!;
      height = dimensions[1]!;
      onload?: () => void;
      onerror?: () => void;
      set src(_value: string) {
        queueMicrotask(() => (invalidImage ? this.onerror?.() : this.onload?.()));
      }
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(jpeg);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("scan photo preparation", () => {
  it("normalizes camera photos to JPEG within the upload dimensions", async () => {
    const draw = vi.fn();
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue({
      fillRect: vi.fn(),
      drawImage: draw,
    } as unknown as CanvasRenderingContext2D);
    expect(await prepareScanPhoto(new File(["photo"], "photo.png", { type: "image/png" }))).toBe(
      jpeg,
    );
    expect(draw).toHaveBeenCalledWith(expect.anything(), 0, 0, 1024, 683);
  });
  it("rejects unsupported, empty and oversized files before decoding", async () => {
    await expect(
      prepareScanPhoto(new File(["heic"], "photo.heic", { type: "image/heic" })),
    ).rejects.toThrow(/JPEG/);
    await expect(
      prepareScanPhoto(new File([], "photo.jpg", { type: "image/jpeg" })),
    ).rejects.toThrow(/20 MB/);
    const large = new File(["photo"], "photo.jpg", { type: "image/jpeg" });
    Object.defineProperty(large, "size", { value: 21 * 1024 * 1024 });
    await expect(prepareScanPhoto(large)).rejects.toThrow(/20 MB/);
    expect(HTMLCanvasElement.prototype.toDataURL).not.toHaveBeenCalled();
  });
  it("rejects corrupt photos and unavailable canvas rather than sending original or blank data", async () => {
    const file = new File(["bad"], "photo.jpg", { type: "image/jpeg" });
    invalidImage = true;
    await expect(prepareScanPhoto(file)).rejects.toThrow(/open this photo/);
    invalidImage = false;
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    await expect(prepareScanPhoto(file)).rejects.toThrow(/processing is unavailable/);
  });
  it("rejects failed encoding and bounds bytes even for already-small images", async () => {
    dimensions = [256, 256];
    vi.mocked(HTMLCanvasElement.prototype.toDataURL).mockReturnValueOnce("data:,");
    const file = new File(["photo"], "photo.jpg", { type: "image/jpeg" });
    await expect(prepareScanPhoto(file)).rejects.toThrow(/too large/);
    vi.mocked(HTMLCanvasElement.prototype.toDataURL).mockReturnValueOnce(
      jpeg + "A".repeat(2_800_000),
    );
    await expect(prepareScanPhoto(file)).rejects.toThrow(/too large/);
  });
});
