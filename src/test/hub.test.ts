import { describe, expect, it, vi, beforeEach } from "vitest";
import { isHubHostname, isHubSurface } from "@/lib/hub-surface";
import { decodeRestaurantImage, storeRestaurantImage } from "@/lib/restaurant-media.server";
const storage = vi.hoisted(() => ({ put: vi.fn() }));
vi.mock("@vercel/blob", () => ({ put: storage.put }));

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
describe("Hub and Consumer separation", () => {
  it("selects dedicated domains without matching lookalikes or the Consumer home", () => {
    expect(isHubHostname("PARTNER.mealsmates.site")).toBe(true);
    expect(isHubHostname("hub.mealsmates.site")).toBe(true);
    expect(isHubHostname("partner.mealsmates.site.attacker.test")).toBe(false);
    expect(isHubSurface("mealsmates.site", "/")).toBe(false);
    expect(isHubSurface("partner.mealsmates.site", "/auth")).toBe(true);
    expect(isHubSurface("localhost", "/hub")).toBe(true);
    expect(isHubSurface("mealsmates.site", "/partner/dashboard")).toBe(true);
  });
});
describe("public restaurant media", () => {
  beforeEach(() => storage.put.mockReset());
  it("rejects markup, spoofed formats and oversized requests before Blob upload", async () => {
    expect(() =>
      decodeRestaurantImage(
        Buffer.from("<svg onload='alert(1)' />").toString("base64"),
        "image/svg+xml",
      ),
    ).toThrow(/valid/);
    expect(() => decodeRestaurantImage(png.toString("base64"), "image/jpeg")).toThrow(/valid/);
    expect(() =>
      decodeRestaurantImage(Buffer.alloc(2 * 1024 * 1024 + 1).toString("base64"), "image/png"),
    ).toThrow(/2MB/);
    expect(() => decodeRestaurantImage("!!invalid!!", "image/png")).toThrow(/encoding/);
    expect(storage.put).not.toHaveBeenCalled();
  });
  it("stores a validated image under the restaurant with immutable caching", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "synthetic-test-token");
    storage.put.mockResolvedValue({
      url: "https://synthetic.public.blob.vercel-storage.com/photo.png",
      pathname: "restaurant-media/test/cover-unique.png",
    });
    try {
      expect(
        await storeRestaurantImage(
          "test",
          "cover",
          `data:image/png;base64,${png.toString("base64")}`,
          "image/png",
        ),
      ).toMatchObject({ path: "restaurant-media/test/cover-unique.png" });
      expect(storage.put).toHaveBeenCalledWith(
        "restaurant-media/test/cover.png",
        png,
        expect.objectContaining({
          access: "public",
          allowOverwrite: false,
          addRandomSuffix: true,
          cacheControlMaxAge: 31536000,
        }),
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
