import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readScanStream, requestScan } from "@/lib/scanner-client";
import { scanResult } from "./scanner-fixtures";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), token: vi.fn() }));
vi.mock("@/lib/firebase", () => ({ waitForFirebaseAuth: mocks.auth }));
beforeEach(() => {
  mocks.auth.mockResolvedValue({ getIdToken: mocks.token });
  mocks.token.mockResolvedValue("test-only-token");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const controller = () => new AbortController();
function streamResponse(lines: unknown[], chunkSize = 7) {
  const bytes = new TextEncoder().encode(lines.map((line) => JSON.stringify(line)).join("\n"));
  return new Response(
    new ReadableStream({
      start(c) {
        for (let i = 0; i < bytes.length; i += chunkSize) c.enqueue(bytes.slice(i, i + chunkSize));
        c.close();
      },
    }),
    { headers: { "Content-Type": "application/x-ndjson" } },
  );
}
describe("authenticated scanner transport", () => {
  it("parses split UTF-8 events and validates the final result", async () => {
    const events = vi.fn();
    const result = { ...scanResult(), name: "Crème soup" };
    expect(
      await readScanStream(
        streamResponse(
          [
            { type: "step", id: "identifying", status: "active", message: "Reading…" },
            { type: "result", result },
          ],
          1,
        ),
        events,
        controller().signal,
      ),
    ).toEqual(result);
    expect(events).toHaveBeenCalledTimes(2);
  });
  it.each([
    [{ type: "step", id: "reading", status: "completed", message: "Done" }],
    [{ type: "result", result: { name: "Invalid" } }],
    [{ type: "error", message: "Provider unavailable" }],
  ])("rejects truncated, malformed and failed streams", async (...lines) => {
    await expect(
      readScanStream(streamResponse(lines), () => {}, controller().signal),
    ).rejects.toThrow();
  });
  it("cancels a stalled stream", async () => {
    const c = controller();
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), {
      headers: { "Content-Type": "application/x-ndjson" },
    });
    const pending = readScanStream(response, () => {}, c.signal);
    c.abort();
    await expect(pending).rejects.toThrow();
    expect(cancel).toHaveBeenCalled();
  });
  it("uses same-origin API and Firebase bearer authentication", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(streamResponse([{ type: "result", result: scanResult() }]));
    vi.stubGlobal("fetch", fetcher);
    await requestScan({ kind: "barcode", code: "3017620422003" }, () => {}, controller().signal);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/scan",
      expect.objectContaining({
        headers: { Authorization: "Bearer test-only-token", "Content-Type": "application/json" },
      }),
    );
  });
  it("cannot upload after cancellation while auth is pending", async () => {
    mocks.auth.mockReturnValue(new Promise(() => {}));
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const c = controller();
    const pending = requestScan({ kind: "barcode", code: "3017620422003" }, () => {}, c.signal);
    c.abort();
    await expect(pending).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects signed-out, offline and network failures", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetcher);
    mocks.auth.mockResolvedValue(null);
    await expect(
      requestScan({ kind: "barcode", code: "3017620422003" }, () => {}, controller().signal),
    ).rejects.toThrow(/Sign in/);
    mocks.auth.mockResolvedValue({ getIdToken: mocks.token });
    await expect(
      requestScan({ kind: "barcode", code: "3017620422003" }, () => {}, controller().signal),
    ).rejects.toThrow(/connection failed/);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    fetcher.mockClear();
    await expect(
      requestScan({ kind: "barcode", code: "3017620422003" }, () => {}, controller().signal),
    ).rejects.toThrow(/offline/);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
