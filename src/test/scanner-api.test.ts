import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "@/routes/api/scan";
import { AiLimitError } from "@/lib/ai-credits.server";
import { scanPhoto, scanResult } from "./scanner-fixtures";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  credit: vi.fn(),
  limit: vi.fn(),
  analyze: vi.fn(),
  config: vi.fn(),
}));
vi.mock("@/server/authenticated-api", () => ({ authenticateApiRequest: mocks.auth }));
vi.mock("@/server/ai-rate-limit", () => ({ enforceAiRateLimit: mocks.limit }));
vi.mock("@/lib/ai-credits.server", async (original) => ({
  ...(await original<typeof import("@/lib/ai-credits.server")>()),
  requireAiCredit: mocks.credit,
}));
vi.mock("@/lib/ai-engine.server", async (original) => ({
  ...(await original<typeof import("@/lib/ai-engine.server")>()),
  getAiProviderConfiguration: mocks.config,
}));
vi.mock("@/lib/scanner.server", async (original) => ({
  ...(await original<typeof import("@/lib/scanner.server")>()),
  analyzeScan: mocks.analyze,
}));
type Handler = (ctx: { request: Request }) => Promise<Response>;
const post = (Route.options.server as { handlers: { POST: Handler } }).handlers.POST;
const photo = { kind: "image", mode: "dish", imageDataUrl: scanPhoto };
const call = (body: unknown, headers?: HeadersInit) =>
  post({
    request: new Request("https://example.test/api/scan", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { userId: "synthetic-user" } });
  mocks.credit.mockResolvedValue(undefined);
  mocks.limit.mockResolvedValue(undefined);
  mocks.config.mockReturnValue({ configured: true });
  mocks.analyze.mockImplementation(async (_input, emit) =>
    emit({ type: "result", result: scanResult() }),
  );
});
describe("scanner API boundary", () => {
  it("requires authentication before reading input or calling a provider", async () => {
    mocks.auth.mockResolvedValue({
      response: Response.json({ error: "Sign in" }, { status: 401 }),
    });
    expect((await call(photo)).status).toBe(401);
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.credit).not.toHaveBeenCalled();
  });
  it("uses existing plan limits for images and streams validated operations", async () => {
    const response = await call(photo);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.text()).toContain('"type":"result"');
    expect(mocks.credit).toHaveBeenCalledExactlyOnceWith("synthetic-user");
    expect(mocks.limit).toHaveBeenCalledWith("ai_vision", "synthetic-user", 10);
  });
  it("does not spend AI credits for database-only lookups", async () => {
    expect((await call({ kind: "barcode", code: "3017620422003" })).status).toBe(200);
    expect(mocks.credit).not.toHaveBeenCalled();
    expect(mocks.limit).toHaveBeenCalled();
  });
  it("returns 429 on plan restriction", async () => {
    mocks.credit.mockRejectedValue(new AiLimitError("daily", null));
    const response = await call(photo);
    expect(response.status).toBe(429);
    expect(await response.text()).toContain("allowance");
    expect(mocks.analyze).not.toHaveBeenCalled();
  });
  it("reports missing AI configuration without charging", async () => {
    mocks.config.mockReturnValue({ configured: false });
    expect((await call(photo)).status).toBe(503);
    expect(mocks.credit).not.toHaveBeenCalled();
  });
  it.each([
    { ...photo, imageDataUrl: "data:image/png;base64,aGVsbG8=" },
    { kind: "barcode", code: "https://example.com" },
    { ...photo, imageDataUrl: "not an image" },
  ])("rejects malformed and disguised images before charging", async (body) => {
    expect((await call(body)).status).toBe(400);
    expect(mocks.credit).not.toHaveBeenCalled();
  });
  it("bounds request size without trusting content-length", async () => {
    expect((await call({ padding: "x".repeat(2_900_001) })).status).toBe(413);
    expect((await call(photo, { "content-length": "2900001" })).status).toBe(413);
    expect(mocks.analyze).not.toHaveBeenCalled();
  });
  it("sends safe streamed errors without provider internals", async () => {
    mocks.analyze.mockRejectedValue(new Error("secret provider stack"));
    const response = await call(photo);
    const data = await response.text();
    expect(data).toContain('"type":"error"');
    expect(data).not.toContain("secret");
  });
  it("propagates stream cancellation to the operation", async () => {
    let signal: AbortSignal | undefined;
    mocks.analyze.mockImplementation(async (_input, _emit, value) => {
      signal = value;
      await new Promise<void>((resolve) =>
        value.addEventListener("abort", () => resolve(), { once: true }),
      );
    });
    const response = await call(photo);
    await response.body!.cancel();
    expect(signal?.aborted).toBe(true);
  });
});
